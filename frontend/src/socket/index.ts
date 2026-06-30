import { io, Socket } from 'socket.io-client';
import type { IceServerConfig } from '../types/index.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export interface SocketCallbacks {
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
  onReconnect?: (data: {
    message: string;
    inMatch: boolean;
    matchId?: string;
    partnerSessionId?: string;
    iceServers: IceServerConfig[];
  }) => void;
  onOffer?: (data: { fromSessionId: string; offer: RTCSessionDescriptionInit }) => void;
  onAnswer?: (data: { fromSessionId: string; answer: RTCSessionDescriptionInit }) => void;
  onIceCandidate?: (data: { fromSessionId: string; candidate: RTCIceCandidateInit }) => void;
}

export function connectSocket(
  sessionId: string,
  sessionToken: string,
  callbacks: SocketCallbacks
): Socket {
  if (socket?.connected) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { sessionId, sessionToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('waiting', (data) => callbacks.onWaiting?.(data));
  socket.on('matched', (data) => callbacks.onMatched?.(data));
  socket.on('partner_left', (data) => callbacks.onPartnerLeft?.(data));
  socket.on('searching', (data) => callbacks.onSearching?.(data));
  socket.on('error', (data) => callbacks.onError?.(data));
  socket.on('reconnect', (data) => callbacks.onReconnect?.(data));
  socket.on('offer', (data) => callbacks.onOffer?.(data));
  socket.on('answer', (data) => callbacks.onAnswer?.(data));
  socket.on('ice_candidate', (data) => callbacks.onIceCandidate?.(data));

  socket.io.on('reconnect_attempt', () => {
    console.log('[Socket] Reconnection attempt...');
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinQueue(): void {
  socket?.emit('join_queue');
}

export function leaveQueue(): void {
  socket?.emit('leave_queue');
}

export function nextPartner(): void {
  socket?.emit('next');
}

export function sendOffer(targetSessionId: string, offer: RTCSessionDescriptionInit): void {
  socket?.emit('offer', { targetSessionId, offer });
}

export function sendAnswer(targetSessionId: string, answer: RTCSessionDescriptionInit): void {
  socket?.emit('answer', { targetSessionId, answer });
}

export function sendIceCandidate(targetSessionId: string, candidate: RTCIceCandidateInit): void {
  socket?.emit('ice_candidate', { targetSessionId, candidate });
}

export function disconnectFromChat(): void {
  socket?.emit('disconnect');
}
