import { useEffect, useRef } from 'react';
import { cn } from '../utils/index.js';

interface VideoPlayerProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
}

export function VideoPlayer({
  stream,
  muted = false,
  mirrored = false,
  className,
  label,
  placeholder = 'Waiting for video...',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={cn('relative overflow-hidden bg-black/50', className)}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={cn('w-full h-full object-cover', mirrored && 'scale-x-[-1]')}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-white/40 text-sm">{placeholder}</p>
          </div>
        </div>
      )}
      {label && (
        <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-black/50 text-xs text-white/70">
          {label}
        </div>
      )}
    </div>
  );
}
