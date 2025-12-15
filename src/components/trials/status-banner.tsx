/**
 * Status Banner Component
 *
 * Displays the current trial status with emoji and message.
 * Includes pulsing animation for active phases.
 */

interface StatusBannerProps {
  status: string;
  message?: string;
}

const statusConfig = {
  PENDING: {
    emoji: '⏳',
    label: 'Pending',
    color: 'text-gray-400',
    bgColor: 'bg-gray-900',
    borderColor: 'border-gray-700',
    animate: false,
  },
  PLANNING: {
    emoji: '🧠',
    label: 'Lanista Designing',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-950/30',
    borderColor: 'border-yellow-700/50',
    animate: true,
  },
  RUNNING: {
    emoji: '⚔️',
    label: 'Battle in Progress',
    color: 'text-orange-400',
    bgColor: 'bg-orange-950/30',
    borderColor: 'border-orange-700/50',
    animate: true,
  },
  JUDGING: {
    emoji: '⚖️',
    label: 'Arbiter Judging',
    color: 'text-purple-400',
    bgColor: 'bg-purple-950/30',
    borderColor: 'border-purple-700/50',
    animate: true,
  },
  COMPLETED: {
    emoji: '✅',
    label: 'Complete',
    color: 'text-green-400',
    bgColor: 'bg-green-950/30',
    borderColor: 'border-green-700/50',
    animate: false,
  },
  FAILED: {
    emoji: '❌',
    label: 'Failed',
    color: 'text-red-400',
    bgColor: 'bg-red-950/30',
    borderColor: 'border-red-700/50',
    animate: false,
  },
};

export function StatusBanner({ status, message }: StatusBannerProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;

  return (
    <div
      className={`border ${config.borderColor} ${config.bgColor} rounded-lg p-4 mb-6 ${
        config.animate ? 'animate-pulse' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{config.emoji}</span>
        <div>
          <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
          {message && <p className="text-sm text-muted-foreground mt-1">{message}</p>}
        </div>
      </div>
    </div>
  );
}
