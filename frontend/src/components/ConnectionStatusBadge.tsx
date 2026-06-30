import { cn } from '../utils/index.js';
import type { ConnectionStatus } from '../types/index.js';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  className?: string;
}

const statusConfig: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
  disconnected: { label: 'Disconnected', color: 'text-white/50', dot: 'bg-white/30' },
  connecting: { label: 'Connecting...', color: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
  connected: { label: 'Connected', color: 'text-success', dot: 'bg-success' },
  failed: { label: 'Connection Failed', color: 'text-danger', dot: 'bg-danger' },
  reconnecting: { label: 'Reconnecting...', color: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
};

export function ConnectionStatusBadge({ status, className }: ConnectionStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('w-2 h-2 rounded-full', config.dot)} />
      <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
    </div>
  );
}
