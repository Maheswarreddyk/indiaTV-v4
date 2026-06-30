import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../utils/index.js';

interface TemporaryChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Array<{ id: string; senderSessionId: string; message: string; createdAt: number }>;
  onSendMessage: (msg: string) => void;
  selfSessionId: string;
  partnerTyping: boolean;
  onTyping: (typing: boolean) => void;
}

const EMOJIS = ['👋', '😊', '😂', '🔥', '❤️', '😱', '👍', '🙏', '🎉', '💩'];

export function TemporaryChat({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  selfSessionId,
  partnerTyping,
  onTyping,
}: TemporaryChatProps) {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    onTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    // Trigger typing event
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const addEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className="w-full sm:w-80 h-[50vh] sm:h-full bg-slate-950 border-l border-white/10 flex flex-col z-10 animate-slide-in relative">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
          <h3 className="text-sm font-semibold text-white">Temporary Match Chat</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg text-white/50 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-2xl">💬</p>
            <p className="text-xs text-white/40 mt-2">Messages will only persist during the call and delete automatically when it ends.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderSessionId === selfSessionId;
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  isSelf
                    ? "bg-accent text-white self-end ml-auto rounded-tr-none"
                    : "bg-white/10 text-white/90 self-start rounded-tl-none"
                )}
              >
                <p className="break-all">{msg.message}</p>
                <span className="text-[9px] text-white/40 mt-1 self-end">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        {partnerTyping && (
          <div className="flex items-center gap-1 bg-white/5 text-white/50 rounded-2xl rounded-tl-none px-3 py-2 self-start text-xs max-w-[50%]">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce delay-75" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce delay-150" />
            </span>
            Typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-slate-900/20 flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 text-white/50 hover:text-white rounded-lg hover:bg-white/5"
          >
            😀
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-slate-900 border border-white/10 rounded-xl grid grid-cols-5 gap-1 shadow-2xl z-20">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => addEmoji(e)}
                  className="w-8 h-8 text-lg hover:bg-white/5 rounded-lg flex items-center justify-center transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={handleInputChange}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 bg-accent text-white rounded-xl disabled:opacity-40 disabled:hover:bg-accent hover:bg-accent/90"
        >
          <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
