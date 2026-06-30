import type { Server, Socket } from 'socket.io';
import { getIceServers } from '../config/index.js';
import {
  connectionLogRepository,
  matchRepository,
  queueRepository,
  sessionRepository,
} from '../database/repositories/index.js';
import { getSupabase } from '../database/client.js';
import { matchingEngine } from '../services/matchingEngine.js';
import type { ConnectedUser } from '../types/index.js';

interface SocketAuth {
  sessionId: string;
  sessionToken: string;
}

function parseAuth(socket: Socket): SocketAuth | null {
  const sessionId = socket.handshake.auth?.sessionId as string | undefined;
  const sessionToken = socket.handshake.auth?.sessionToken as string | undefined;

  if (!sessionId || !sessionToken) return null;
  return { sessionId, sessionToken };
}

async function notifyMatch(
  io: Server,
  userA: ConnectedUser,
  userB: ConnectedUser,
  matchId: string,
  isInitiatorA: boolean
): Promise<void> {
  const iceServers = getIceServers();

  io.to(userA.socketId).emit('matched', {
    matchId,
    partnerSessionId: userB.sessionId,
    isInitiator: isInitiatorA,
    iceServers,
  });

  io.to(userB.socketId).emit('matched', {
    matchId,
    partnerSessionId: userA.sessionId,
    isInitiator: !isInitiatorA,
    iceServers,
  });
}

async function handleJoinQueue(io: Server, user: ConnectedUser): Promise<void> {
  try {
    await sessionRepository.updateStatus(user.sessionId, 'waiting');
    await queueRepository.join(user.sessionId);
    await connectionLogRepository.log(user.sessionId, 'queue_join');

    const matchResult = matchingEngine.tryMatch(user);

    if (!matchResult) {
      io.to(user.socketId).emit('waiting', {
        queuePosition: matchingEngine.getQueueLength(),
        message: 'Waiting for a partner...',
      });
      return;
    }

    const partner = matchResult.partner;

    const match = await matchRepository.create(user.sessionId, partner.sessionId);

    await Promise.all([
      queueRepository.markMatched(user.sessionId),
      queueRepository.markMatched(partner.sessionId),
      sessionRepository.updateStatus(user.sessionId, 'matched'),
      sessionRepository.updateStatus(partner.sessionId, 'matched'),
    ]);

    matchingEngine.setMatch(user, partner, match.id);

    await connectionLogRepository.log(user.sessionId, 'match_start', { matchId: match.id, partnerId: partner.sessionId });
    await connectionLogRepository.log(partner.sessionId, 'match_start', { matchId: match.id, partnerId: user.sessionId });

    await notifyMatch(io, user, partner, match.id, true);
  } catch (error) {
    console.error('[Socket] join_queue error:', error);
    io.to(user.socketId).emit('error', { message: 'Failed to join queue. Please try again.' });
  }
}

async function endCurrentMatch(
  io: Server,
  user: ConnectedUser,
  reason: 'next' | 'leave' | 'disconnect' | 'report'
): Promise<void> {
  if (!user.currentMatchId || !user.partnerSessionId) return;

  const partner = matchingEngine.getUserBySessionId(user.partnerSessionId);
  const matchId = user.currentMatchId;

  await matchRepository.endMatch(matchId, reason);

  matchingEngine.clearMatch(user);
  if (partner) {
    matchingEngine.clearMatch(partner);
  }

  await connectionLogRepository.log(user.sessionId, 'match_end', { matchId, reason });

  if (partner) {
    await connectionLogRepository.log(partner.sessionId, 'match_end', { matchId, reason });
    io.to(partner.socketId).emit('partner_left', { reason });

    if (reason === 'disconnect' || reason === 'leave' || reason === 'report') {
      partner.lastPartnerSessionId = user.sessionId;
      await sessionRepository.updateStatus(partner.sessionId, 'waiting');
      io.to(partner.socketId).emit('searching', { message: 'Partner disconnected. Finding someone new...' });
      await handleJoinQueue(io, partner);
    }
  }
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const auth = parseAuth(socket);

    if (!auth) {
      socket.emit('error', { message: 'Authentication required. Start a session first.' });
      socket.disconnect(true);
      return;
    }

    let user: ConnectedUser = {
      socketId: socket.id,
      sessionId: auth.sessionId,
      sessionToken: auth.sessionToken,
    };

    const existingUser = matchingEngine.getUserBySessionId(auth.sessionId);
    if (existingUser) {
      matchingEngine.updateSocketId(auth.sessionId, socket.id);
      user = { ...existingUser, socketId: socket.id };
      socket.emit('reconnect', {
        message: 'Reconnected successfully',
        inMatch: !!user.currentMatchId,
        matchId: user.currentMatchId,
        partnerSessionId: user.partnerSessionId,
        iceServers: getIceServers(),
      });
    } else {
      matchingEngine.registerUser(user);
    }

    console.log(`[Socket] Connected: ${user.sessionId.slice(0, 8)}... (${socket.id})`);

    socket.on('join_queue', async () => {
      await handleJoinQueue(io, user);
    });

    socket.on('leave_queue', async () => {
      try {
        matchingEngine.removeFromQueue(user.sessionId);
        await queueRepository.leave(user.sessionId);
        await sessionRepository.updateStatus(user.sessionId, 'active');
        await connectionLogRepository.log(user.sessionId, 'queue_leave');
        socket.emit('searching', { message: 'Left queue' });
      } catch (error) {
        console.error('[Socket] leave_queue error:', error);
        socket.emit('error', { message: 'Failed to leave queue' });
      }
    });

    socket.on('preferences_updated', (data: { preferences: any }) => {
      const existingUser = matchingEngine.getUserBySessionId(user.sessionId);
      if (existingUser && data.preferences) {
        existingUser.gender = data.preferences.gender;
        existingUser.lookingFor = data.preferences.looking_for;
        existingUser.languages = data.preferences.languages;
        existingUser.country = data.preferences.country;
        existingUser.state = data.preferences.state;
        existingUser.district = data.preferences.district;
        existingUser.city = data.preferences.city;
        existingUser.interestTags = data.preferences.interest_tags;
      }
    });

    socket.on('like_partner', async (data: { matchId: string }) => {
      try {
        if (!user.currentMatchId || !user.partnerSessionId) return;
        const partner = matchingEngine.getUserBySessionId(user.partnerSessionId);
        
        const supabase = getSupabase();
        
        await supabase.from('likes').insert({ match_id: data.matchId, session_id: user.sessionId });
        
        const { data: match } = await supabase.from('matches').select('*').eq('id', data.matchId).single();
        if (match) {
          const updateData: any = {};
          if (match.user_a === user.sessionId) {
            updateData.liked_by_a = true;
          } else {
            updateData.liked_by_b = true;
          }
          
          const { data: updatedMatch } = await supabase
            .from('matches')
            .update(updateData)
            .eq('id', data.matchId)
            .select()
            .single();
            
          if (updatedMatch) {
            if (updatedMatch.liked_by_a && updatedMatch.liked_by_b) {
              socket.emit('mutual_like', { matchId: data.matchId, partnerSessionId: user.partnerSessionId });
              if (partner) {
                io.to(partner.socketId).emit('mutual_like', { matchId: data.matchId, partnerSessionId: user.sessionId });
              }
            } else {
              if (partner) {
                io.to(partner.socketId).emit('partner_liked', { matchId: data.matchId });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Socket] like_partner error:', err);
      }
    });

    socket.on('chat_message', async (data: { matchId: string; message: string }) => {
      try {
        if (!user.currentMatchId || !user.partnerSessionId) return;
        const partner = matchingEngine.getUserBySessionId(user.partnerSessionId);
        
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const { data: msg } = await getSupabase()
          .from('temporary_messages')
          .insert({
            match_id: data.matchId,
            sender_session: user.sessionId,
            message: data.message,
            expires_at: expiresAt
          })
          .select()
          .single();
          
        if (msg && partner) {
          io.to(partner.socketId).emit('new_message', {
            matchId: data.matchId,
            senderSessionId: user.sessionId,
            message: data.message,
            createdAt: msg.created_at
          });
        }
      } catch (err) {
        console.error('[Socket] chat_message error:', err);
      }
    });

    socket.on('typing', (data: { typing: boolean }) => {
      if (!user.partnerSessionId) return;
      const partner = matchingEngine.getUserBySessionId(user.partnerSessionId);
      if (partner) {
        io.to(partner.socketId).emit('partner_typing', { typing: data.typing });
      }
    });

    socket.on('next', async () => {
      try {
        await endCurrentMatch(io, user, 'next');
        await connectionLogRepository.log(user.sessionId, 'next');
        user.lastPartnerSessionId = user.partnerSessionId;
        await sessionRepository.updateStatus(user.sessionId, 'waiting');
        socket.emit('searching', { message: 'Finding a new partner...' });
        await handleJoinQueue(io, user);
      } catch (error) {
        console.error('[Socket] next error:', error);
        socket.emit('error', { message: 'Failed to find next partner' });
      }
    });

    socket.on('offer', (data: { targetSessionId: string; offer: unknown }) => {
      const partner = matchingEngine.getUserBySessionId(data.targetSessionId);
      if (partner) {
        io.to(partner.socketId).emit('offer', {
          fromSessionId: user.sessionId,
          offer: data.offer,
        });
      }
    });

    socket.on('answer', (data: { targetSessionId: string; answer: unknown }) => {
      const partner = matchingEngine.getUserBySessionId(data.targetSessionId);
      if (partner) {
        io.to(partner.socketId).emit('answer', {
          fromSessionId: user.sessionId,
          answer: data.answer,
        });
      }
    });

    socket.on('ice_candidate', (data: { targetSessionId: string; candidate: unknown }) => {
      const partner = matchingEngine.getUserBySessionId(data.targetSessionId);
      if (partner) {
        io.to(partner.socketId).emit('ice_candidate', {
          fromSessionId: user.sessionId,
          candidate: data.candidate,
        });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${user.sessionId.slice(0, 8)}... (${socket.id})`);

      try {
        if (user.currentMatchId) {
          await endCurrentMatch(io, user, 'disconnect');
        } else {
          matchingEngine.removeFromQueue(user.sessionId);
          await queueRepository.leave(user.sessionId);
        }

        await connectionLogRepository.log(user.sessionId, 'disconnect', { socketId: socket.id });
        matchingEngine.unregisterUser(user.sessionId);
      } catch (error) {
        console.error('[Socket] disconnect error:', error);
      }
    });
  });
}
