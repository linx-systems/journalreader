import type { Theme } from '../../lib/theme';

interface ThemePreviewProps {
  theme: Theme;
}

const SAMPLE_LOGS = [
  { priority: 0, label: 'emerg', message: 'Kernel panic - not syncing', unit: 'kernel' },
  { priority: 1, label: 'alert', message: 'CPU temperature critical', unit: 'sensors.service' },
  { priority: 2, label: 'crit', message: 'Disk space critically low', unit: 'systemd-journald' },
  { priority: 3, label: 'err', message: 'Failed to start Docker service', unit: 'docker.service' },
  { priority: 4, label: 'warning', message: 'Deprecated configuration detected', unit: 'nginx.service' },
  { priority: 5, label: 'notice', message: 'User session started', unit: 'systemd-logind' },
  { priority: 6, label: 'info', message: 'Service started successfully', unit: 'ssh.service' },
  { priority: 7, label: 'debug', message: 'Verbose logging enabled', unit: 'application.service' },
];

const PRIORITY_KEYS = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'] as const;

export function ThemePreview({ theme }: ThemePreviewProps) {
  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{
        backgroundColor: theme.colors.background,
        borderColor: theme.colors.border,
        fontFamily: theme.typography.fontFamily,
        fontSize: `${theme.typography.fontSize}px`,
        lineHeight: theme.typography.lineHeight,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center gap-2 border-b"
        style={{
          backgroundColor: theme.colors.backgroundSecondary,
          borderColor: theme.colors.border,
        }}
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: theme.colors.priority.error }}
        />
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: theme.colors.priority.warning }}
        />
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: theme.colors.priority.notice }}
        />
        <span
          className="text-sm font-medium ml-2"
          style={{ color: theme.colors.foreground }}
        >
          Journal Reader Preview
        </span>
      </div>

      {/* Column headers */}
      <div
        className="px-3 py-2 flex items-center gap-3 text-xs font-medium border-b"
        style={{
          backgroundColor: theme.colors.backgroundSecondary,
          borderColor: theme.colors.border,
          color: theme.colors.foregroundSecondary,
        }}
      >
        <span className="w-20">Time</span>
        <span className="w-14 text-center">Level</span>
        <span className="w-32">Unit</span>
        <span className="flex-1">Message</span>
      </div>

      {/* Log entries */}
      <div className="divide-y" style={{ borderColor: theme.colors.border }}>
        {SAMPLE_LOGS.map((log, i) => {
          const priorityKey = PRIORITY_KEYS[log.priority];
          const textColor = theme.colors.priority[priorityKey];
          const bgColor = theme.colors.priorityBg[priorityKey];

          return (
            <div
              key={i}
              className="px-3 py-2 flex items-center gap-3 text-sm"
              style={{ borderColor: theme.colors.border }}
            >
              <span
                className="w-20 text-xs"
                style={{ color: theme.colors.foregroundSecondary }}
              >
                {i + 1}m ago
              </span>
              <span
                className="w-14 text-xs font-medium text-center px-1.5 py-0.5 rounded"
                style={{ color: textColor, backgroundColor: bgColor }}
              >
                {log.label}
              </span>
              <span
                className="w-32 text-xs font-mono truncate"
                style={{ color: theme.colors.foregroundSecondary }}
              >
                {log.unit}
              </span>
              <span
                className="flex-1 font-mono truncate"
                style={{ color: theme.colors.foreground }}
              >
                {log.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer / accent preview */}
      <div
        className="px-4 py-3 flex items-center gap-3 border-t"
        style={{
          backgroundColor: theme.colors.backgroundSecondary,
          borderColor: theme.colors.border,
        }}
      >
        <button
          title="Primary action preview"
          className="px-3 py-1.5 text-xs font-medium rounded"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.isDark ? '#ffffff' : '#ffffff',
          }}
        >
          Primary Action
        </button>
        <button
          title="Secondary action preview"
          className="px-3 py-1.5 text-xs font-medium rounded border"
          style={{
            backgroundColor: 'transparent',
            borderColor: theme.colors.border,
            color: theme.colors.foreground,
          }}
        >
          Secondary
        </button>
        <span
          className="ml-auto text-xs"
          style={{ color: theme.colors.foregroundSecondary }}
        >
          8 entries shown
        </span>
      </div>
    </div>
  );
}
