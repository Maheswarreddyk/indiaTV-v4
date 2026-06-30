import { cn } from '../utils/index.js';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({ message = 'Loading...', fullScreen = true }: LoadingScreenProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        fullScreen ? 'min-h-screen' : 'py-12'
      )}
    >
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-purple-500 animate-spin-slow" />
      </div>
      <p className="text-white/70 text-sm animate-pulse">{message}</p>
    </div>
  );
}
