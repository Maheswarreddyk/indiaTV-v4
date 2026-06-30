import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase.js';
import type { IceServerConfig } from '../types/index.js';

export interface RealtimeCallbacks {
  onWaiting?: (data: { queuePosition: number; message: string }) => void;
  onMatched?: (data: {
    matchId: string;
    partnerSessionId: string;
    isInitiator: boolean;
    iceServers: IceServerConfig[];
  }) => void;
  onPartnerLeft?: (data: { reason: string }) => void;
  onSearching?: (data: { message: string }) => void;
  onError?: (data: { message: string }) => void;
  onOffer?: (data: { fromSessionId: string; offer: RTCSessionDescriptionInit }) => void;
  onAnswer?: (data: { fromSessionId: string; answer: RTCSessionDescriptionInit }) => void;
  onIceCandidate?: (data: { fromSessionId: string; candidate: RTCIceCandidateInit }) => void;
  onPartnerLiked?: (data: { matchId: string }) => void;
  onMutualLike?: (data: { matchId: string; partnerSessionId: string }) => void;
  onNewMessage?: (data: { matchId: string; senderSessionId: string; message: string; createdAt: string }) => void;
  onPartnerTyping?: (data: { typing: boolean }) => void;
}

let sessionChannel: RealtimeChannel | null = null;
let matchChannel: RealtimeChannel | null = null;
let currentMatchId: string | null = null;

const API_BASE = import.meta.env.VITE_API_URL || '';

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function cleanupMatchChannel() {
  const supabase = getSupabaseClient();
  if (matchChannel && supabase) {
    supabase.removeChannel(matchChannel);
    matchChannel = null;
  }
  currentMatchId = null;
}

function subscribeToMatchChannel(matchId: string, callbacks: RealtimeCallbacks) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    callbacks.onError?.({ message: 'Realtime not configured. Check Supabase settings.' });
    return;
  }

  cleanupMatchChannel();
  currentMatchId = matchId;

  matchChannel = supabase
    .channel(`match:${matchId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'offer' }, ({ payload }) => {
      callbacks.onOffer?.(payload as { fromSessionId: string; offer: RTCSessionDescriptionInit });
    })
    .on('broadcast', { event: 'answer' }, ({ payload }) => {
      callbacks.onAnswer?.(payload as { fromSessionId: string; answer: RTCSessionDescriptionInit });
    })
    .on('broadcast', { event: 'ice_candidate' }, ({ payload }) => {
      callbacks.onIceCandidate?.(payload as { fromSessionId: string; candidate: RTCIceCandidateInit });
    })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      callbacks.onPartnerTyping?.(payload as { typing: boolean });
    })
    .subscribe();
}

export function connectRealtime(
  sessionId: string,
  _sessionToken: string,
  callbacks: RealtimeCallbacks
): void {
  const supabase = getSupabaseClient();
  if (!supabase) {
    callbacks.onError?.({ message: 'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.' });
    return;
  }

  disconnectRealtime();

  sessionChannel = supabase
    .channel(`session:${sessionId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'matched' }, ({ payload }) => {
      const data = payload as {
        matchId: string;
        partnerSessionId: string;
        isInitiator: boolean;
        iceServers: IceServerConfig[];
      };
      subscribeToMatchChannel(data.matchId, callbacks);
      callbacks.onMatched?.(data);
    })
    .on('broadcast', { event: 'partner_left' }, ({ payload }) => {
      cleanupMatchChannel();
      callbacks.onPartnerLeft?.(payload as { reason: string });
    })
    .on('broadcast', { event: 'searching' }, ({ payload }) => {
      callbacks.onSearching?.(payload as { message: string });
    })
    .on('broadcast', { event: 'partner_liked' }, ({ payload }) => {
      callbacks.onPartnerLiked?.(payload as { matchId: string });
    })
    .on('broadcast', { event: 'mutual_like' }, ({ payload }) => {
      callbacks.onMutualLike?.(payload as { matchId: string; partnerSessionId: string });
    })
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      callbacks.onNewMessage?.(payload as { matchId: string; senderSessionId: string; message: string; createdAt: string });
    })
    .on('broadcast', { event: 'partner_typing' }, ({ payload }) => {
      callbacks.onPartnerTyping?.(payload as { typing: boolean });
    })
    .subscribe();
}

export function disconnectRealtime(): void {
  const supabase = getSupabaseClient();
  cleanupMatchChannel();

  if (sessionChannel && supabase) {
    supabase.removeChannel(sessionChannel);
    sessionChannel = null;
  }
}

export async function joinQueue(sessionId: string, sessionToken: string, callbacks: RealtimeCallbacks) {
  const result = await apiPost<{ success: boolean; data: Record<string, unknown> }>('/match/join', {
    sessionId,
    sessionToken,
  });

  const data = result.data;

  if (data.status === 'waiting') {
    callbacks.onWaiting?.({
      queuePosition: (data.queuePosition as number) ?? 1,
      message: (data.message as string) ?? 'Waiting for a partner...',
    });
    return;
  }

  if (data.status === 'matched') {
    const matchId = data.matchId as string;
    subscribeToMatchChannel(matchId, callbacks);
    callbacks.onMatched?.({
      matchId,
      partnerSessionId: data.partnerSessionId as string,
      isInitiator: data.isInitiator as boolean,
      iceServers: data.iceServers as IceServerConfig[],
    });
  }
}

export async function leaveQueue(sessionId: string, sessionToken: string) {
  await apiPost('/match/leave', { sessionId, sessionToken });
}

export async function nextPartner(sessionId: string, sessionToken: string, callbacks: RealtimeCallbacks) {
  cleanupMatchChannel();

  const result = await apiPost<{ success: boolean; data: Record<string, unknown> }>('/match/next', {
    sessionId,
    sessionToken,
  });

  const data = result.data;

  if (data.status === 'waiting') {
    callbacks.onWaiting?.({
      queuePosition: (data.queuePosition as number) ?? 1,
      message: 'Finding a new partner...',
    });
    return;
  }

  if (data.status === 'matched') {
    const matchId = data.matchId as string;
    subscribeToMatchChannel(matchId, callbacks);
    callbacks.onMatched?.({
      matchId,
      partnerSessionId: data.partnerSessionId as string,
      isInitiator: data.isInitiator as boolean,
      iceServers: data.iceServers as IceServerConfig[],
    });
  }
}

export async function notifyDisconnect(sessionId: string, sessionToken: string, reason: string) {
  try {
    await apiPost('/match/disconnect', { sessionId, sessionToken, reason });
  } catch {
    // Best-effort on page unload
  }
}

export function sendOffer(fromSessionId: string, offer: RTCSessionDescriptionInit): void {
  matchChannel?.send({
    type: 'broadcast',
    event: 'offer',
    payload: { fromSessionId, offer },
  });
}

export function sendAnswer(fromSessionId: string, answer: RTCSessionDescriptionInit): void {
  matchChannel?.send({
    type: 'broadcast',
    event: 'answer',
    payload: { fromSessionId, answer },
  });
}

export function sendIceCandidate(fromSessionId: string, candidate: RTCIceCandidateInit): void {
  matchChannel?.send({
    type: 'broadcast',
    event: 'ice_candidate',
    payload: { fromSessionId, candidate },
  });
}

export function getCurrentMatchId(): string | null {
  return currentMatchId;
}

export function sendTyping(typing: boolean): void {
  matchChannel?.send({
    type: 'broadcast',
    event: 'typing',
    payload: { typing },
  });
}
