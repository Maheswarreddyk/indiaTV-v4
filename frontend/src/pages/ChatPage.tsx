import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatControls } from '../components/ChatControls.js';
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge.js';
import { FeedbackModal } from '../components/FeedbackModal.js';
import { LoadingScreen } from '../components/LoadingScreen.js';
import { ReportModal } from '../components/ReportModal.js';
import { SearchingAnimation } from '../components/SearchingAnimation.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { PreferenceModal } from '../components/PreferenceModal.js';
import { TemporaryChat } from '../components/TemporaryChat.js';
import { useSession } from '../contexts/SessionContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { useVideoChat } from '../hooks/useVideoChat.js';
import { apiService } from '../services/api.js';
import type { ReportReason } from '../types/index.js';
import { formatDuration } from '../utils/index.js';
import { cn } from '../utils/index.js';

export function ChatPage() {
  const navigate = useNavigate();
  const { session, endSession, startSession, isLoading } = useSession();
  const { showToast } = useToast();
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [initializing, setInitializing] = useState(false);
  const chatStartedRef = useRef(false);
  const pendingLeaveRef = useRef(false);

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
    updatePreferences,
    likePartner,
    sendChatMessage,
    setTypingStatus,
    setChatOpen,
  } = useVideoChat(session?.sessionId ?? null, session?.sessionToken ?? null);

  useEffect(() => {
    if (session) return;

    let cancelled = false;
    setInitializing(true);

    startSession()
      .catch((error) => {
        if (!cancelled) {
          showToast('error', error instanceof Error ? error.message : 'Failed to start session');
          navigate('/');
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, startSession, showToast, navigate]);

  useEffect(() => {
    if (!session) return;

    if (chatStartedRef.current) return;
    chatStartedRef.current = true;
    startChat();
  }, [session, startChat]);

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
    pendingLeaveRef.current = true;
    stopChat();
    setShowFeedbackModal(true);
  };

  const finishLeave = async () => {
    try {
      await endSession();
    } catch {
      // Session end is best-effort
    }
    navigate('/');
    showToast('info', 'You left the chat');
    pendingLeaveRef.current = false;
  };

  const handleFeedbackSubmit = async (rating: number, feedback: string) => {
    if (session) {
      try {
        await apiService.submitFeedback(session.sessionId, rating, feedback || undefined);
        showToast('success', 'Thanks for your feedback!');
      } catch {
        // Feedback is optional
      }
    }
    setShowFeedbackModal(false);
    await finishLeave();
  };

  const handleFeedbackClose = async () => {
    setShowFeedbackModal(false);
    if (pendingLeaveRef.current) {
      await finishLeave();
    }
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

  if (!session || initializing || isLoading) {
    return <LoadingScreen message="Setting up your chat..." />;
  }

  const isSearching = chatState.status === 'waiting' || chatState.status === 'starting';
  const isConnected = chatState.status === 'connected';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col sm:flex-row bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
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

        <div className="flex-1 relative p-4 flex items-center justify-center">
          <div
            className={cn(
              'relative w-full rounded-2xl overflow-hidden glass aspect-video max-w-5xl shadow-2xl',
              chatState.isFullscreen ? 'fixed inset-0 z-40 rounded-none max-w-none' : ''
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

            <div className="absolute bottom-4 right-4 w-32 sm:w-48 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-2xl z-10 bg-slate-900">
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

        <div className="px-4 py-6 border-t border-white/5 bg-slate-900/20">
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
            isChatOpen={chatState.isChatOpen}
            onToggleChat={() => setChatOpen(!chatState.isChatOpen)}
            liked={chatState.liked}
            onLike={likePartner}
            onOpenPreferences={() => setShowPreferenceModal(true)}
            unreadCount={chatState.unreadCount}
          />
        </div>
      </div>

      {chatState.isChatOpen && (
        <TemporaryChat
          isOpen={chatState.isChatOpen}
          onClose={() => setChatOpen(false)}
          messages={chatState.messages || []}
          onSendMessage={sendChatMessage}
          selfSessionId={session.sessionId}
          partnerTyping={chatState.partnerTyping || false}
          onTyping={setTypingStatus}
        />
      )}

      <PreferenceModal
        isOpen={showPreferenceModal}
        onClose={() => setShowPreferenceModal(false)}
        onSave={updatePreferences}
        currentPreferences={{
          gender: chatState.gender,
          looking_for: chatState.lookingFor,
          languages: chatState.languages,
          country: chatState.country,
          state: chatState.state,
          district: chatState.district,
          city: chatState.city,
          interest_tags: chatState.interestTags,
        }}
      />

      {chatState.mutualLike && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-lg">
          <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl text-center shadow-2xl max-w-sm animate-scale-up glass">
            <span className="text-6xl animate-bounce block">🎉</span>
            <span className="text-4xl animate-pulse block mt-2">❤️</span>
            <h3 className="text-2xl font-bold text-white mt-4 bg-gradient-to-r from-accent to-pink-500 bg-clip-text text-transparent">Mutual Match!</h3>
            <p className="text-sm text-white/70 mt-2">Both of you liked each other! Start chatting below.</p>
            <button
              onClick={() => {
                setChatOpen(true);
                // hide modal after opening chat
                likePartner().catch(() => {}); // Re-save liked status if needed
              }}
              className="mt-6 px-6 py-2.5 bg-gradient-to-r from-accent to-purple-650 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-accent/25"
            >
              Start Chatting
            </button>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />

      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={handleFeedbackClose}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}
