import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import {
  connectRealtime,
  disconnectRealtime,
  joinQueue,
  leaveQueue,
  nextPartner,
  notifyDisconnect,
  sendAnswer,
  sendIceCandidate,
  sendOffer,
} from '../services/realtime.js';
import { webrtcManager } from '../webrtc/index.js';
import type { ChatState, ConnectionStatus } from '../types/index.js';

const initialChatState: ChatState = {
  status: 'idle',
  connectionStatus: 'disconnected',
  partnerSessionId: null,
  matchId: null,
  isInitiator: false,
  isMuted: false,
  isCameraOff: false,
  isFullscreen: false,
  matchStartTime: null,
  queuePosition: 0,
};

export function useVideoChat(sessionId: string | null, sessionToken: string | null) {
  const { showToast } = useToast();
  const [chatState, setChatState] = useState<ChatState>(initialChatState);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const partnerSessionIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const callbacksRef = useRef<ReturnType<typeof buildCallbacks> | null>(null);

  sessionIdRef.current = sessionId;
  sessionTokenRef.current = sessionToken;

  const updateChatState = useCallback((updates: Partial<ChatState>) => {
    setChatState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setupWebRTC = useCallback(async () => {
    webrtcManager.setCallbacks({
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        updateChatState({ connectionStatus: 'connected', status: 'connected' });
      },
      onConnectionStateChange: (state) => {
        const statusMap: Record<RTCPeerConnectionState, ConnectionStatus> = {
          new: 'connecting',
          connecting: 'connecting',
          connected: 'connected',
          disconnected: 'reconnecting',
          failed: 'failed',
          closed: 'disconnected',
        };
        updateChatState({ connectionStatus: statusMap[state] });

        if (state === 'failed') {
          showToast('error', 'Connection failed. Trying again...');
        }
      },
      onIceCandidate: (candidate) => {
        const partnerId = partnerSessionIdRef.current;
        const fromSessionId = sessionIdRef.current;
        if (partnerId && fromSessionId) {
          sendIceCandidate(fromSessionId, candidate);
        }
      },
    });
  }, [showToast, updateChatState]);

  const handleMatched = useCallback(
    async (data: {
      matchId: string;
      partnerSessionId: string;
      isInitiator: boolean;
      iceServers: { urls: string | string[] }[];
    }) => {
      partnerSessionIdRef.current = data.partnerSessionId;

      webrtcManager.setIceServers(data.iceServers);
      webrtcManager.createPeerConnection();

      updateChatState({
        status: 'matched',
        connectionStatus: 'connecting',
        partnerSessionId: data.partnerSessionId,
        matchId: data.matchId,
        isInitiator: data.isInitiator,
        matchStartTime: Date.now(),
      });

      if (data.isInitiator) {
        try {
          const offer = await webrtcManager.createOffer();
          if (sessionIdRef.current) {
            sendOffer(sessionIdRef.current, offer);
          }
        } catch (error) {
          showToast('error', 'Failed to create connection offer');
          console.error(error);
        }
      }
    },
    [showToast, updateChatState]
  );

  function buildCallbacks() {
    return {
      onWaiting: (data: { queuePosition: number; message: string }) => {
        updateChatState({
          status: 'waiting',
          queuePosition: data.queuePosition,
          connectionStatus: 'connecting',
        });
      },
      onMatched: handleMatched,
      onPartnerLeft: () => {
        setRemoteStream(null);
        webrtcManager.resetConnection();
        updateChatState({
          status: 'waiting',
          connectionStatus: 'connecting',
          partnerSessionId: null,
          matchId: null,
          matchStartTime: null,
        });
        showToast('info', 'Partner left. Finding someone new...');
      },
      onSearching: (data: { message: string }) => {
        updateChatState({ status: 'waiting', connectionStatus: 'connecting' });
        showToast('info', data.message);
      },
      onError: (data: { message: string }) => {
        showToast('error', data.message);
      },
      onOffer: async (data: { fromSessionId: string; offer: RTCSessionDescriptionInit }) => {
        try {
          const answer = await webrtcManager.handleOffer(data.offer);
          if (sessionIdRef.current) {
            sendAnswer(sessionIdRef.current, answer);
          }
        } catch (error) {
          showToast('error', 'Failed to handle connection offer');
          console.error(error);
        }
      },
      onAnswer: async (data: { answer: RTCSessionDescriptionInit }) => {
        try {
          await webrtcManager.handleAnswer(data.answer);
        } catch (error) {
          showToast('error', 'Failed to handle connection answer');
          console.error(error);
        }
      },
      onIceCandidate: async (data: { candidate: RTCIceCandidateInit }) => {
        await webrtcManager.addIceCandidate(data.candidate);
      },
    };
  }

  const startChat = useCallback(async () => {
    if (!sessionId || !sessionToken) {
      showToast('error', 'Session not initialized');
      return;
    }

    try {
      updateChatState({ status: 'starting', connectionStatus: 'connecting' });

      const stream = await webrtcManager.getLocalMedia();
      setLocalStream(stream);
      await setupWebRTC();

      const callbacks = buildCallbacks();
      callbacksRef.current = callbacks;
      connectRealtime(sessionId, sessionToken, callbacks);

      await joinQueue(sessionId, sessionToken, callbacks);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera and microphone permissions are required'
          : error instanceof Error
            ? error.message
            : 'Failed to start chat. Please check your camera and microphone.';
      showToast('error', message);
      updateChatState({ status: 'idle', connectionStatus: 'disconnected' });
    }
  }, [sessionId, sessionToken, showToast, setupWebRTC, handleMatched, updateChatState]);

  const stopChat = useCallback(async () => {
    if (sessionIdRef.current && sessionTokenRef.current) {
      await notifyDisconnect(sessionIdRef.current, sessionTokenRef.current, 'leave');
    }
    await leaveQueue(sessionIdRef.current ?? '', sessionTokenRef.current ?? '').catch(() => {});
    disconnectRealtime();
    webrtcManager.cleanup();
    setLocalStream(null);
    setRemoteStream(null);
    setChatState(initialChatState);
    partnerSessionIdRef.current = null;
  }, []);

  const handleNext = useCallback(async () => {
    if (!sessionIdRef.current || !sessionTokenRef.current || !callbacksRef.current) return;

    setRemoteStream(null);
    webrtcManager.resetConnection();
    webrtcManager.createPeerConnection();
    updateChatState({
      status: 'waiting',
      connectionStatus: 'connecting',
      partnerSessionId: null,
      matchId: null,
      matchStartTime: null,
    });

    await nextPartner(sessionIdRef.current, sessionTokenRef.current, callbacksRef.current);
  }, [updateChatState]);

  const toggleMute = useCallback(() => {
    setChatState((prev) => {
      const newMuted = !prev.isMuted;
      webrtcManager.toggleMute(newMuted);
      return { ...prev, isMuted: newMuted };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setChatState((prev) => {
      const cameraOn = prev.isCameraOff;
      webrtcManager.toggleCamera(cameraOn);
      return { ...prev, isCameraOff: !prev.isCameraOff };
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    setChatState((prev) => ({ ...prev, isFullscreen: !prev.isFullscreen }));
  }, []);

  useEffect(() => {
    if (chatState.status !== 'waiting' || !sessionId || !sessionToken || !callbacksRef.current) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        await joinQueue(sessionId, sessionToken, callbacksRef.current!);
      } catch (error) {
        console.error('Error polling matchmaking queue:', error);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [chatState.status, sessionId, sessionToken]);

  useEffect(() => {
    const handleUnload = () => {
      if (sessionIdRef.current && sessionTokenRef.current) {
        notifyDisconnect(sessionIdRef.current, sessionTokenRef.current, 'disconnect');
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      webrtcManager.cleanup();
      disconnectRealtime();
    };
  }, []);

  return {
    chatState,
    localStream,
    remoteStream,
    startChat,
    stopChat,
    handleNext,
    toggleMute,
    toggleCamera,
    toggleFullscreen,
  };
}
