interface SearchingAnimationProps {
  message?: string;
  queuePosition?: number;
}

export function SearchingAnimation({
  message = 'Searching for someone to chat with...',
  queuePosition,
}: SearchingAnimationProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-accent/10 animate-search-pulse flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 animate-search-pulse flex items-center justify-center" style={{ animationDelay: '0.3s' }}>
            <div className="w-8 h-8 rounded-full bg-accent/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 rounded-full border border-accent/30 animate-ping" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-white/90 font-medium">{message}</p>
        {queuePosition !== undefined && queuePosition > 0 && (
          <p className="text-white/50 text-sm">Queue position: {queuePosition}</p>
        )}
        <div className="flex items-center justify-center gap-1 pt-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-accent animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
