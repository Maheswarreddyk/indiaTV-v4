import { v4 as uuidv4 } from 'uuid';
import { getIceServers } from './config.js';
import { broadcastToSession } from './realtime.js';
import { getSupabase, handleSupabaseError } from './supabase.js';

export type ReportReason = 'spam' | 'nudity' | 'abuse' | 'harassment' | 'other';
export type MatchEndReason = 'next' | 'leave' | 'disconnect' | 'report';

export async function validateSession(sessionId: string, sessionToken?: string) {
  const { data, error } = await getSupabase()
    .from('visitor_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) handleSupabaseError(error, 'Failed to validate session');
  if (!data) return null;
  if (sessionToken && data.session_token !== sessionToken) return null;
  if (data.status === 'ended') return null;
  return data;
}

export async function startSession(data: {
  country?: string;
  browser?: string;
  device?: string;
  platform?: string;
}) {
  const sessionToken = uuidv4();
  const { data: session, error } = await getSupabase()
    .from('visitor_sessions')
    .insert({
      session_token: sessionToken,
      country: data.country ?? null,
      browser: data.browser ?? null,
      device: data.device ?? null,
      platform: data.platform ?? null,
      status: 'active',
    })
    .select()
    .single();

  if (error || !session) handleSupabaseError(error, 'Failed to create session');

  await getSupabase()
    .from('connection_logs')
    .insert({
      session_id: session.id,
      event: 'session_start',
      details: { browser: data.browser, device: data.device },
    });

  return session;
}

export async function endSession(sessionId: string) {
  const { error } = await getSupabase()
    .from('visitor_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) handleSupabaseError(error, 'Failed to end session');

  await getSupabase().from('waiting_queue').update({ status: 'left' }).eq('session_id', sessionId).eq('status', 'waiting');

  await getSupabase()
    .from('connection_logs')
    .insert({ session_id: sessionId, event: 'session_end', details: {} });
}

export async function getStats() {
  const supabase = getSupabase();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeRes, waitingRes, matchesRes, onlineRes] = await Promise.all([
    supabase.from('visitor_sessions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('waiting_queue').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
    supabase.from('matches').select('*', { count: 'exact', head: true }).gte('started_at', startOfDay.toISOString()),
    supabase
      .from('visitor_sessions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'waiting', 'matched']),
  ]);

  if (activeRes.error) handleSupabaseError(activeRes.error, 'Failed to count active sessions');
  if (waitingRes.error) handleSupabaseError(waitingRes.error, 'Failed to count waiting users');
  if (matchesRes.error) handleSupabaseError(matchesRes.error, 'Failed to count matches');
  if (onlineRes.error) handleSupabaseError(onlineRes.error, 'Failed to count online users');

  return {
    activeUsers: activeRes.count ?? 0,
    waitingUsers: waitingRes.count ?? 0,
    matchesToday: matchesRes.count ?? 0,
    onlineNow: onlineRes.count ?? 0,
  };
}

export async function submitReport(data: {
  reporterSessionId: string;
  reportedSessionId: string;
  reason: ReportReason;
  notes?: string;
}) {
  const { data: report, error } = await getSupabase()
    .from('reports')
    .insert({
      reporter_session: data.reporterSessionId,
      reported_session: data.reportedSessionId,
      reason: data.reason,
      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error || !report) handleSupabaseError(error, 'Failed to create report');

  await getSupabase()
    .from('connection_logs')
    .insert({
      session_id: data.reporterSessionId,
      event: 'report',
      details: { reportedSessionId: data.reportedSessionId, reason: data.reason },
    });

  return report;
}

export async function submitFeedback(data: { sessionId: string; rating: number; feedback?: string }) {
  const { data: entry, error } = await getSupabase()
    .from('feedback')
    .insert({
      session_id: data.sessionId,
      rating: data.rating,
      feedback: data.feedback ?? null,
    })
    .select()
    .single();

  if (error || !entry) handleSupabaseError(error, 'Failed to create feedback');
  return entry;
}

async function findActiveMatch(sessionId: string) {
  const { data, error } = await getSupabase()
    .from('matches')
    .select('*')
    .is('ended_at', null)
    .or(`user_a.eq.${sessionId},user_b.eq.${sessionId}`)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) handleSupabaseError(error, 'Failed to find active match');
  return data;
}

export async function endActiveMatch(sessionId: string, reason: MatchEndReason) {
  const match = await findActiveMatch(sessionId);
  if (!match) return null;

  const startedAt = new Date(match.started_at).getTime();
  const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const partnerId = match.user_a === sessionId ? match.user_b : match.user_a;

  const { error } = await getSupabase()
    .from('matches')
    .update({
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      ended_reason: reason,
    })
    .eq('id', match.id);

  if (error) handleSupabaseError(error, 'Failed to end match');

  await getSupabase()
    .from('connection_logs')
    .insert({
      session_id: sessionId,
      event: 'match_end',
      details: { matchId: match.id, reason },
    });

  return { match, partnerId };
}

export async function joinQueue(sessionId: string, sessionToken: string) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) {
    throw new Error('Invalid session');
  }

  // 1. Check if there's an active match
  const existingMatch = await findActiveMatch(sessionId);
  if (existingMatch) {
    const partnerId = existingMatch.user_a === sessionId ? existingMatch.user_b : existingMatch.user_a;
    const isInitiator = existingMatch.user_a === sessionId;
    return {
      status: 'matched' as const,
      matchId: existingMatch.id,
      partnerSessionId: partnerId,
      isInitiator,
      iceServers: getIceServers(),
      queuePosition: 0,
    };
  }

  const now = new Date().toISOString();
  let queueEnteredAt = session.queue_entered_at;

  if (!queueEnteredAt) {
    queueEnteredAt = now;
    await getSupabase()
      .from('visitor_sessions')
      .update({ queue_entered_at: queueEnteredAt, last_activity: now })
      .eq('id', sessionId);
  } else {
    await getSupabase()
      .from('visitor_sessions')
      .update({ last_activity: now })
      .eq('id', sessionId);
  }

  const waitingSeconds = Math.floor((Date.now() - new Date(queueEnteredAt).getTime()) / 1000);

  // 2. Manage queue entry heartbeat
  const { data: existingQueueEntry, error: queueError } = await getSupabase()
    .from('waiting_queue')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'waiting')
    .maybeSingle();

  if (queueError) handleSupabaseError(queueError, 'Failed to query queue status');

  if (existingQueueEntry) {
    await getSupabase()
      .from('waiting_queue')
      .update({ joined_at: now })
      .eq('id', existingQueueEntry.id);
  } else {
    await getSupabase()
      .from('waiting_queue')
      .update({ status: 'left' })
      .eq('session_id', sessionId)
      .eq('status', 'waiting');

    const { error: joinError } = await getSupabase()
      .from('waiting_queue')
      .insert({ session_id: sessionId, status: 'waiting', joined_at: now });

    if (joinError) handleSupabaseError(joinError, 'Failed to join queue');
    await getSupabase().from('visitor_sessions').update({ status: 'waiting' }).eq('id', sessionId);
    await getSupabase()
      .from('connection_logs')
      .insert({ session_id: sessionId, event: 'queue_join', details: {} });
  }

  // 3. Query all candidates in the queue with their session profiles
  const heartbeatThreshold = new Date(Date.now() - 12000).toISOString();

  const { data: candidates, error: candidatesError } = await getSupabase()
    .from('waiting_queue')
    .select(`
      session_id,
      joined_at,
      visitor_sessions:session_id (
        id,
        gender,
        looking_for,
        languages,
        country,
        state,
        district,
        city,
        interest_tags,
        last_partner,
        queue_entered_at,
        status
      )
    `)
    .eq('status', 'waiting')
    .neq('session_id', sessionId)
    .gte('joined_at', heartbeatThreshold);

  if (candidatesError) handleSupabaseError(candidatesError, 'Failed to query candidates');

  // 4. Fetch reports and recent matches to apply penalties & exclusions
  const [recentMatchesQuery, reportsQuery] = await Promise.all([
    getSupabase()
      .from('matches')
      .select('user_a, user_b, started_at')
      .or(`user_a.eq.${sessionId},user_b.eq.${sessionId}`)
      .order('started_at', { ascending: false })
      .limit(5),
    getSupabase()
      .from('reports')
      .select('reporter_session, reported_session')
      .or(`reporter_session.eq.${sessionId},reported_session.eq.${sessionId}`)
  ]);

  const recentPartners = new Set<string>();
  recentMatchesQuery.data?.forEach((m) => {
    recentPartners.add(m.user_a === sessionId ? m.user_b : m.user_a);
  });

  const reportedSessionIds = new Set<string>();
  reportsQuery.data?.forEach((r) => {
    reportedSessionIds.add(r.reporter_session === sessionId ? r.reported_session : r.reporter_session);
  });

  // 5. Calculate scores for all candidates
  const scoredCandidates: Array<{
    sessionId: string;
    score: number;
    reason: string;
  }> = [];

  for (const entry of (candidates || [])) {
    const profile = entry.visitor_sessions as any;
    if (!profile || profile.status === 'ended') continue;

    // Exclude: Blocked/reported users & absolute last partner
    if (reportedSessionIds.has(profile.id)) continue;
    if (profile.id === session.last_partner) continue;

    let score = 0;
    const reasons: string[] = [];

    // Mutual Preference (Weight: 50)
    const selfWantsPartner = !session.looking_for || 
                             session.looking_for.length === 0 || 
                             session.looking_for.includes('Anyone') || 
                             (profile.gender && session.looking_for.includes(profile.gender));
    const partnerWantsSelf = !profile.looking_for || 
                             profile.looking_for.length === 0 || 
                             profile.looking_for.includes('Anyone') || 
                             (session.gender && profile.looking_for.includes(session.gender));

    if (selfWantsPartner && partnerWantsSelf) {
      score += 50;
      reasons.push('Mutual Preference (+50)');
    }

    // Language Match (Every shared language +20, Max 40)
    if (session.languages && profile.languages) {
      const sharedLangs = session.languages.filter((l: string) => profile.languages.includes(l));
      if (sharedLangs.length > 0) {
        const langScore = Math.min(sharedLangs.length * 20, 40);
        score += langScore;
        reasons.push(`Shared Languages (${sharedLangs.join(', ')}) (+${langScore})`);
      }
    }

    // Location (Exact City +40, District +35, State +30, Country +20)
    if (session.city && profile.city && session.city === profile.city) {
      score += 40;
      reasons.push(`Same City: ${session.city} (+40)`);
    } else if (session.district && profile.district && session.district === profile.district) {
      score += 35;
      reasons.push(`Same District: ${session.district} (+35)`);
    } else if (session.state && profile.state && session.state === profile.state) {
      score += 30;
      reasons.push(`Same State: ${session.state} (+30)`);
    } else if (session.country && profile.country && session.country === profile.country) {
      score += 20;
      reasons.push(`Same Country: ${session.country} (+20)`);
    }

    // Shared Interests (Every common interest +5, Max 40)
    if (session.interest_tags && profile.interest_tags) {
      const sharedInterests = session.interest_tags.filter((i: string) => profile.interest_tags.includes(i));
      if (sharedInterests.length > 0) {
        const interestScore = Math.min(sharedInterests.length * 5, 40);
        score += interestScore;
        reasons.push(`Common Interests: ${sharedInterests.join(', ')} (+${interestScore})`);
      }
    }

    // Waiting Bonus (Every second waiting +1, Max 60)
    if (profile.queue_entered_at) {
      const candidateWait = Math.floor((Date.now() - new Date(profile.queue_entered_at).getTime()) / 1000);
      const bonus = Math.min(Math.max(candidateWait, 0), 60);
      if (bonus > 0) {
        score += bonus;
        reasons.push(`Waiting Bonus (+${bonus})`);
      }
    }

    // Penalties
    if (recentPartners.has(profile.id)) {
      score -= 100;
      reasons.push('Matched Recently (-100)');
    }

    scoredCandidates.push({
      sessionId: profile.id,
      score,
      reason: reasons.join(', '),
    });
  }

  // Sort candidates by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // 6. Threshold Logic
  let targetCandidate: typeof scoredCandidates[0] | null = null;
  if (waitingSeconds <= 15) {
    targetCandidate = scoredCandidates.find(c => c.score > 140) || null;
  } else if (waitingSeconds <= 30) {
    targetCandidate = scoredCandidates.find(c => c.score > 110) || null;
  } else if (waitingSeconds <= 60) {
    targetCandidate = scoredCandidates.find(c => c.score > 80) || null;
  } else if (waitingSeconds <= 90) {
    targetCandidate = scoredCandidates.find(c => c.score > 50) || null;
  } else {
    // After 90 seconds, select the highest scored candidate, or fallback to random
    targetCandidate = scoredCandidates[0] || null;
  }

  if (!targetCandidate) {
    // No match met threshold, return waiting
    const { count } = await getSupabase()
      .from('waiting_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting')
      .gte('joined_at', heartbeatThreshold);

    return {
      status: 'waiting' as const,
      queuePosition: count ?? 1,
      message: 'Waiting for a partner...',
    };
  }

  const partnerSessionId = targetCandidate.sessionId;

  // Deterministic Matchmaking: only the user with the smaller ID creates the match record.
  if (sessionId > partnerSessionId) {
    const { count } = await getSupabase()
      .from('waiting_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting')
      .gte('joined_at', heartbeatThreshold);

    return {
      status: 'waiting' as const,
      queuePosition: count ?? 1,
      message: 'Waiting for a partner...',
    };
  }

  // Create match
  const { data: match, error: matchError } = await getSupabase()
    .from('matches')
    .insert({
      user_a: sessionId,
      user_b: partnerSessionId,
      match_score: targetCandidate.score,
      matched_reason: targetCandidate.reason,
    })
    .select()
    .single();

  if (matchError || !match) handleSupabaseError(matchError, 'Failed to create match');

  await Promise.all([
    getSupabase()
      .from('waiting_queue')
      .update({ status: 'matched' })
      .in('session_id', [sessionId, partnerSessionId])
      .eq('status', 'waiting'),
    getSupabase()
      .from('visitor_sessions')
      .update({ status: 'matched', last_partner: partnerSessionId })
      .eq('id', sessionId),
    getSupabase()
      .from('visitor_sessions')
      .update({ status: 'matched', last_partner: sessionId })
      .eq('id', partnerSessionId),
  ]);

  await getSupabase().from('connection_logs').insert([
    {
      session_id: sessionId,
      event: 'match_start',
      details: { matchId: match.id, partnerId: partnerSessionId },
    },
    {
      session_id: partnerSessionId,
      event: 'match_start',
      details: { matchId: match.id, partnerId: sessionId },
    },
  ]);

  const iceServers = getIceServers();

  await broadcastToSession(partnerSessionId, 'matched', {
    matchId: match.id,
    partnerSessionId: sessionId,
    isInitiator: false,
    iceServers,
  });

  return {
    status: 'matched' as const,
    matchId: match.id,
    partnerSessionId,
    isInitiator: true,
    iceServers,
    queuePosition: 0,
  };
}

export async function leaveQueue(sessionId: string, sessionToken: string) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  await getSupabase()
    .from('waiting_queue')
    .update({ status: 'left' })
    .eq('session_id', sessionId)
    .eq('status', 'waiting');

  await getSupabase().from('visitor_sessions').update({ status: 'active', queue_entered_at: null }).eq('id', sessionId);

  await getSupabase()
    .from('connection_logs')
    .insert({ session_id: sessionId, event: 'queue_leave', details: {} });
}

async function requeuePartner(partnerId: string) {
  const partner = await validateSession(partnerId);
  if (!partner) return;

  await getSupabase()
    .from('visitor_sessions')
    .update({ queue_entered_at: new Date().toISOString() })
    .eq('id', partnerId);

  await broadcastToSession(partnerId, 'searching', {
    message: 'Finding someone new...',
  });

  try {
    await joinQueue(partnerId, partner.session_token);
  } catch {
    // Partner re-queue is best-effort
  }
}

export async function nextPartner(sessionId: string, sessionToken: string) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  const ended = await endActiveMatch(sessionId, 'next');

  // Delete messages when match ends
  if (ended?.match?.id) {
    await getSupabase().from('temporary_messages').delete().eq('match_id', ended.match.id);
  }

  if (ended?.partnerId) {
    await broadcastToSession(ended.partnerId, 'partner_left', { reason: 'next' });
    await requeuePartner(ended.partnerId);
  }

  await getSupabase()
    .from('visitor_sessions')
    .update({ queue_entered_at: new Date().toISOString() })
    .eq('id', sessionId);

  await getSupabase()
    .from('connection_logs')
    .insert({ session_id: sessionId, event: 'next', details: {} });

  return joinQueue(sessionId, sessionToken);
}

export async function notifyPartnerLeft(sessionId: string, sessionToken: string, reason: MatchEndReason) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  const ended = await endActiveMatch(sessionId, reason);

  // Delete messages when match ends
  if (ended?.match?.id) {
    await getSupabase().from('temporary_messages').delete().eq('match_id', ended.match.id);
  }

  if (ended?.partnerId) {
    await broadcastToSession(ended.partnerId, 'partner_left', { reason });
    await requeuePartner(ended.partnerId);
  }
}

// 7. Advanced Preferences, Autocomplete, Likes, and Message Services
export async function savePreferences(
  sessionId: string,
  sessionToken: string,
  preferences: {
    gender?: string;
    looking_for?: string[];
    languages?: string[];
    country?: string;
    state?: string;
    district?: string;
    city?: string;
    interest_tags?: string[];
  }
) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  const { error } = await getSupabase()
    .from('visitor_sessions')
    .update({
      gender: preferences.gender ?? null,
      looking_for: preferences.looking_for ?? null,
      languages: preferences.languages ?? null,
      country: preferences.country ?? null,
      state: preferences.state ?? null,
      district: preferences.district ?? null,
      city: preferences.city ?? null,
      interest_tags: preferences.interest_tags ?? null,
      last_activity: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) handleSupabaseError(error, 'Failed to save preferences');
}

export async function getLocations(query: string) {
  const { data, error } = await getSupabase()
    .from('locations')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(10);

  if (error) handleSupabaseError(error, 'Failed to autocomplete locations');
  return data || [];
}

export async function getInterests(query: string) {
  const { data, error } = await getSupabase()
    .from('interests')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(10);

  if (error) handleSupabaseError(error, 'Failed to autocomplete interests');
  return data || [];
}

export async function submitLike(sessionId: string, sessionToken: string, matchId: string) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  const supabase = getSupabase();

  // Find active match
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (matchError || !match) {
    throw new Error('Active match not found');
  }

  // Insert like
  const { error: likeError } = await supabase
    .from('likes')
    .insert({ match_id: matchId, session_id: sessionId });

  if (likeError && likeError.code !== '23505') { // Ignore unique violations
    handleSupabaseError(likeError, 'Failed to submit like');
  }

  // Update match record
  const updateData: any = {};
  if (match.user_a === sessionId) {
    updateData.liked_by_a = true;
  } else {
    updateData.liked_by_b = true;
  }

  const { data: updatedMatch, error: updateError } = await supabase
    .from('matches')
    .update(updateData)
    .eq('id', matchId)
    .select()
    .single();

  if (updateError) handleSupabaseError(updateError, 'Failed to update match likes');

  const partnerId = match.user_a === sessionId ? match.user_b : match.user_a;

  if (updatedMatch.liked_by_a && updatedMatch.liked_by_b) {
    // Mutual like celebration
    await Promise.all([
      broadcastToSession(sessionId, 'mutual_like', { matchId, partnerSessionId: partnerId }),
      broadcastToSession(partnerId, 'mutual_like', { matchId, partnerSessionId: sessionId }),
    ]);
  } else {
    // Notify partner that they are liked
    await broadcastToSession(partnerId, 'partner_liked', { matchId });
  }

  return { success: true, mutual: updatedMatch.liked_by_a && updatedMatch.liked_by_b };
}

export async function submitChatMessage(
  sessionId: string,
  sessionToken: string,
  matchId: string,
  message: string
) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  const supabase = getSupabase();

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (matchError || !match) throw new Error('Match not found');

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiration

  const { data: msg, error: msgError } = await supabase
    .from('temporary_messages')
    .insert({
      match_id: matchId,
      sender_session: sessionId,
      message,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (msgError) handleSupabaseError(msgError, 'Failed to store temporary message');

  const partnerId = match.user_a === sessionId ? match.user_b : match.user_a;

  await broadcastToSession(partnerId, 'new_message', {
    matchId,
    senderSessionId: sessionId,
    message,
    createdAt: msg.created_at,
  });

  return msg;
}

export async function getAnalytics() {
  const supabase = getSupabase();

  const [
    waitingCount,
    matchesCount,
    likesCount,
    reportsCount,
    sessionsQuery,
  ] = await Promise.all([
    supabase.from('waiting_queue').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
    supabase.from('matches').select('*', { count: 'exact', head: true }),
    supabase.from('likes').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }),
    supabase.from('visitor_sessions').select('interest_tags, country, state, city, languages'),
  ]);

  // Aggregate interests
  const interestsFreq: Record<string, number> = {};
  const locationsFreq: Record<string, number> = {};
  const languagesFreq: Record<string, number> = {};

  sessionsQuery.data?.forEach((s: any) => {
    if (s.interest_tags) {
      s.interest_tags.forEach((t: string) => {
        interestsFreq[t] = (interestsFreq[t] || 0) + 1;
      });
    }
    if (s.languages) {
      s.languages.forEach((l: string) => {
        languagesFreq[l] = (languagesFreq[l] || 0) + 1;
      });
    }
    if (s.city) {
      locationsFreq[s.city] = (locationsFreq[s.city] || 0) + 1;
    } else if (s.country) {
      locationsFreq[s.country] = (locationsFreq[s.country] || 0) + 1;
    }
  });

  return {
    onlineNow: waitingCount.count ?? 0,
    totalMatches: matchesCount.count ?? 0,
    totalLikes: likesCount.count ?? 0,
    totalReports: reportsCount.count ?? 0,
    topInterests: Object.entries(interestsFreq).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topLocations: Object.entries(locationsFreq).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topLanguages: Object.entries(languagesFreq).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

