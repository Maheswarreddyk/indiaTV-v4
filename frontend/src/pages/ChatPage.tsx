import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatControls } from '../components/ChatControls.js';
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge.js';
import { LoadingScreen } from '../components/LoadingScreen.js';
import { ReportModal } from '../components/ReportModal.js';
import { SearchingAnimation } from '../components/SearchingAnimation.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { useSession } from '../contexts/SessionContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { useVideoChat } from '../hooks/useVideoChat.js';
import { apiService } from '../services/api.js';
import type { ReportReason } from '../types/index.js';
import { formatDuration } from '../utils/index.js';
import { cn } from '../utils/index.js';

export function ChatPage() {
  const navigate = useNavigate();
  const { session, endSession } = useSession();
  const { showToast } = useToast();
  const [showReportModal, setShowReportModal] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const chatStartedRef = useRef(false);

  const {
    chatState,
    localStream,
    remoteStream,
    startChat,
    stopChat,
    handleNext,
    toggleMute,
    toggleCamera,
    toggleFullscreen,
  } = useVideoChat(session?.sessionId ?? null, session?.sessionToken ?? null);

  useEffect(() => {
    if (!session) {
      navigate('/');
      return;
    }

    if (chatStartedRef.current) return;
    chatStartedRef.current = true;
    startChat();
  }, [session, navigate, startChat]);

  useEffect(() => {
    if (!chatState.matchStartTime || chatState.status !== 'connected') {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - chatState.matchStartTime!) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [chatState.matchStartTime, chatState.status]);

  const handleLeave = async () => {
    stopChat();
    try {
      await endSession();
    } catch {
      // Session end is best-effort
    }
    navigate('/');
    showToast('info', 'You left the chat');
  };

  const handleReport = async (reason: ReportReason, notes: string) => {
    if (!session || !chatState.partnerSessionId) {
      showToast('error', 'No partner to report');
      return;
    }

    try {
      await apiService.submitReport(
        session.sessionId,
        chatState.partnerSessionId,
        reason,
        notes || undefined
      );
      showToast('success', 'Report submitted. Thank you for keeping the community safe.');
      handleNext();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to submit report');
    }
  };

  if (!session) {
    return <LoadingScreen message="Initializing session..." />;
  }

  const isSearching = chatState.status === 'waiting' || chatState.status === 'starting';
  const isConnected = chatState.status === 'connected';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
        <ConnectionStatusBadge status={chatState.connectionStatus} />
        <div className="flex items-center gap-4">
          {isConnected && (
            <span className="text-sm text-white/50 font-mono">{formatDuration(elapsedSeconds)}</span>
          )}
          <span className="text-xs text-white/40 hidden sm:inline">
            Session: {session.sessionId.slice(0, 8)}...
          </span>
        </div>
      </div>

      <div className="flex-1 relative p-4">
        <div
          className={cn(
            'relative w-full mx-auto rounded-2xl overflow-hidden glass',
            chatState.isFullscreen ? 'fixed inset-0 z-40 rounded-none' : 'max-w-5xl aspect-video'
          )}
        >
          <VideoPlayer
            stream={remoteStream}
            className="w-full h-full min-h-[50vh]"
            placeholder={isSearching ? 'Looking for a partner...' : 'Partner video will appear here'}
          />

          {isSearching && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <SearchingAnimation queuePosition={chatState.queuePosition} />
            </div>
          )}

          <div className="absolute bottom-4 right-4 w-32 sm:w-48 aspect-video rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
            <VideoPlayer
              stream={localStream}
              muted
              mirrored
              className="w-full h-full"
              label="You"
            />
          </div>
        </div>
      </div>

      <div className="px-4 py-6 border-t border-white/5">
        <ChatControls
          isMuted={chatState.isMuted}
          isCameraOff={chatState.isCameraOff}
          isFullscreen={chatState.isFullscreen}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onNext={handleNext}
          onReport={() => setShowReportModal(true)}
          onLeave={handleLeave}
          onToggleFullscreen={toggleFullscreen}
          disabled={isSearching}
        />
      </div>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />
    </div>
  );
}
