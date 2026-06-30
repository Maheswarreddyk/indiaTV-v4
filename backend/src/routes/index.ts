import { Router } from 'express';
import {
  feedbackController,
  healthController,
  reportController,
  sessionController,
  statsController,
} from '../controllers/index.js';
import {
  apiRateLimiter,
  reportRateLimiter,
  sessionRateLimiter,
} from '../middleware/rateLimiter.js';

import { getSupabase } from '../database/client.js';

const router = Router();

router.use(apiRateLimiter);

router.get('/health', healthController.getHealth);
router.get('/stats', statsController.getStats);

router.post('/start-session', sessionRateLimiter, sessionController.startSession);
router.post('/end-session', sessionController.endSession);
router.post('/report', reportRateLimiter, reportController.submitReport);
router.post('/feedback', feedbackController.submitFeedback);

router.post('/preferences', async (req, res, next) => {
  try {
    const { sessionId, sessionToken, preferences } = req.body;
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
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/locations', async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.json({ success: true, data: [] });
    const { data } = await getSupabase()
      .from('locations')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(10);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.get('/interests', async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.json({ success: true, data: [] });
    const { data } = await getSupabase()
      .from('interests')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(10);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/like', async (req, res, next) => {
  try {
    const { sessionId, sessionToken, matchId } = req.body;
    const supabase = getSupabase();
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (!match) return res.status(404).json({ error: 'Match not found' });
    
    await supabase.from('likes').insert({ match_id: matchId, session_id: sessionId });
    
    const updateData: any = {};
    if (match.user_a === sessionId) {
      updateData.liked_by_a = true;
    } else {
      updateData.liked_by_b = true;
    }
    
    const { data: updatedMatch } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchId)
      .select()
      .single();
      
    res.json({
      success: true,
      data: {
        success: true,
        mutual: updatedMatch ? (updatedMatch.liked_by_a && updatedMatch.liked_by_b) : false
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/chat', async (req, res, next) => {
  try {
    const { sessionId, sessionToken, matchId, message } = req.body;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data } = await getSupabase()
      .from('temporary_messages')
      .insert({
        match_id: matchId,
        sender_session: sessionId,
        message,
        expires_at: expiresAt
      })
      .select()
      .single();
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== 'Bearer admin-token') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const supabase = getSupabase();
    const [waitingCount, matchesCount, likesCount, reportsCount, sessionsQuery] = await Promise.all([
      supabase.from('waiting_queue').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
      supabase.from('likes').select('*', { count: 'exact', head: true }),
      supabase.from('reports').select('*', { count: 'exact', head: true }),
      supabase.from('visitor_sessions').select('interest_tags, country, state, city, languages')
    ]);

    const interestsFreq: Record<string, number> = {};
    const locationsFreq: Record<string, number> = {};
    const languagesFreq: Record<string, number> = {};

    sessionsQuery.data?.forEach((s: any) => {
      if (s.interest_tags) s.interest_tags.forEach((t: string) => { interestsFreq[t] = (interestsFreq[t] || 0) + 1; });
      if (s.languages) s.languages.forEach((l: string) => { languagesFreq[l] = (languagesFreq[l] || 0) + 1; });
      if (s.city) {
        locationsFreq[s.city] = (locationsFreq[s.city] || 0) + 1;
      } else if (s.country) {
        locationsFreq[s.country] = (locationsFreq[s.country] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        onlineNow: waitingCount.count ?? 0,
        totalMatches: matchesCount.count ?? 0,
        totalLikes: likesCount.count ?? 0,
        totalReports: reportsCount.count ?? 0,
        topInterests: Object.entries(interestsFreq).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topLocations: Object.entries(locationsFreq).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topLanguages: Object.entries(languagesFreq).sort((a, b) => b[1] - a[1]).slice(0, 5)
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
