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

  await getSupabase()
    .from('waiting_queue')
    .update({ status: 'left' })
    .eq('session_id', sessionId)
    .eq('status', 'waiting');

  const { data: waitingUsers, error: waitingError } = await getSupabase()
    .from('waiting_queue')
    .select('session_id, joined_at')
    .eq('status', 'waiting')
    .neq('session_id', sessionId)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (waitingError) handleSupabaseError(waitingError, 'Failed to query queue');

  if (!waitingUsers || waitingUsers.length === 0) {
    const { error: joinError } = await getSupabase()
      .from('waiting_queue')
      .insert({ session_id: sessionId, status: 'waiting' });

    if (joinError) handleSupabaseError(joinError, 'Failed to join queue');

    await getSupabase().from('visitor_sessions').update({ status: 'waiting' }).eq('id', sessionId);

    await getSupabase()
      .from('connection_logs')
      .insert({ session_id: sessionId, event: 'queue_join', details: {} });

    const { count } = await getSupabase()
      .from('waiting_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting');

    return {
      status: 'waiting' as const,
      queuePosition: count ?? 1,
      message: 'Waiting for a partner...',
    };
  }

  const partnerSessionId = waitingUsers[0].session_id;

  const { data: match, error: matchError } = await getSupabase()
    .from('matches')
    .insert({ user_a: sessionId, user_b: partnerSessionId })
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
      .update({ status: 'matched' })
      .in('id', [sessionId, partnerSessionId]),
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

  await getSupabase().from('visitor_sessions').update({ status: 'active' }).eq('id', sessionId);

  await getSupabase()
    .from('connection_logs')
    .insert({ session_id: sessionId, event: 'queue_leave', details: {} });
}

async function requeuePartner(partnerId: string) {
  const partner = await validateSession(partnerId);
  if (!partner) return;

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
  if (ended?.partnerId) {
    await broadcastToSession(ended.partnerId, 'partner_left', { reason: 'next' });
    await requeuePartner(ended.partnerId);
  }

  await getSupabase()
    .from('connection_logs')
    .insert({ session_id: sessionId, event: 'next', details: {} });

  return joinQueue(sessionId, sessionToken);
}

export async function notifyPartnerLeft(sessionId: string, sessionToken: string, reason: MatchEndReason) {
  const session = await validateSession(sessionId, sessionToken);
  if (!session) throw new Error('Invalid session');

  const ended = await endActiveMatch(sessionId, reason);
  if (ended?.partnerId) {
    await broadcastToSession(ended.partnerId, 'partner_left', { reason });
    await requeuePartner(ended.partnerId);
  }
}
