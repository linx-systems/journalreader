import { useMemo } from 'react';
import { Monitor, Server, X, ArrowLeftRight } from 'lucide-react';
import { PanelLogViewer } from '../logs/PanelLogViewer';
import { useConnectionStore, LOCAL_TAB_ID } from '../../stores/connectionStore';
import clsx from 'clsx';
import type { PanelPosition } from '../../hooks/usePanelJournalLogs';

interface SplitPanelProps {
  /** Host ID for this panel ('local' or remote host id) */
  hostId: string;
  /** Position of this panel */
  position: 'left' | 'right' | 'top' | 'bottom';
  /** Whether this panel can be collapsed */
  canCollapse?: boolean;
  /** Callback to collapse/close this panel */
  onCollapse?: () => void;
  /** Callback to swap panels */
  onSwap?: () => void;
  /** Whether to show the panel header */
  showHeader?: boolean;
}

export function SplitPanel({
  hostId,
  position,
  canCollapse = false,
  onCollapse,
  onSwap,
  showHeader = true,
}: SplitPanelProps) {
  const { hosts, connectedHostId, activeTabId, setActiveTab } = useConnectionStore();

  const isLocal = hostId === LOCAL_TAB_ID;
  const host = useMemo(() => {
    if (isLocal) return null;
    return hosts.find((h) => h.id === hostId);
  }, [isLocal, hosts, hostId]);

  const isConnected = isLocal
    ? connectedHostId === null
    : connectedHostId === hostId;

  const isActive = activeTabId === hostId;

  // Map position to panel position for the store (left/top -> 'left', right/bottom -> 'right')
  const panelPosition: PanelPosition = position === 'left' || position === 'top' ? 'left' : 'right';

  const label = isLocal ? 'Local' : (host?.name || 'Unknown Host');
  const subtitle = isLocal
    ? 'Local journal logs'
    : host
      ? `${host.username}@${host.hostname}`
      : '';

  const handlePanelClick = () => {
    if (!isActive) {
      setActiveTab(hostId);
    }
  };

  return (
    <div
      className={clsx(
        'flex flex-col min-h-0 min-w-0 flex-1 overflow-hidden',
        // Subtle visual distinction between panels
        position === 'right' || position === 'bottom'
          ? 'bg-theme'
          : 'bg-theme'
      )}
      onClick={handlePanelClick}
    >
      {showHeader && (
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-1.5 border-b border-theme',
            'bg-theme-secondary/50',
            isActive && 'ring-1 ring-inset ring-accent/20'
          )}
        >
          {/* Host info */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Connection indicator */}
            {isConnected ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-gray-400/50 shrink-0"></span>
            )}

            {/* Icon */}
            {isLocal ? (
              <Monitor className="h-3.5 w-3.5 text-theme-secondary shrink-0" />
            ) : (
              <Server className="h-3.5 w-3.5 text-theme-secondary shrink-0" />
            )}

            {/* Label */}
            <div className="min-w-0">
              <div className="text-sm font-medium text-theme truncate">
                {label}
              </div>
              {subtitle && (
                <div className="text-xs text-theme-secondary truncate">
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          {/* Panel actions */}
          <div className="flex items-center gap-1 shrink-0">
            {onSwap && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSwap();
                }}
                className="p-1 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
                title="Swap panels"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>
            )}
            {canCollapse && onCollapse && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCollapse();
                }}
                className="p-1 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
                title="Close panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Log viewer for this host */}
      <div className="flex-1 min-h-0">
        <PanelLogViewer
          hostId={hostId}
          panelPosition={panelPosition}
        />
      </div>
    </div>
  );
}
