import { useState, useRef, useEffect } from 'react';
import { Columns2, Rows2, Square, ChevronDown, Monitor, Server } from 'lucide-react';
import { useLayoutStore, type ViewLayout } from '../../stores/layoutStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../../stores/connectionStore';
import clsx from 'clsx';

export function LayoutSelector() {
  const {
    layout,
    leftPanelHostId,
    rightPanelHostId,
    enterSplitView,
    exitSplitView,
  } = useLayoutStore();

  const { hosts, openTabs, activeTabId } = useConnectionStore();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isSplit = layout !== 'single';

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getHostLabel = (hostId: string) => {
    if (hostId === LOCAL_TAB_ID) return 'Local';
    const host = hosts.find((h) => h.id === hostId);
    return host?.name || 'Unknown';
  };

  const handleLayoutSelect = (newLayout: ViewLayout) => {
    if (newLayout === 'single') {
      exitSplitView();
    } else {
      // If switching to split view, use current active tab and first other available tab
      const leftHost = activeTabId;
      const rightHost = openTabs.find((id) => id !== activeTabId) || LOCAL_TAB_ID;
      enterSplitView(newLayout, leftHost, rightHost);
    }
    setShowMenu(false);
  };

  const handleQuickCompare = (otherHostId: string) => {
    enterSplitView('split-vertical', activeTabId, otherHostId);
    setShowMenu(false);
  };

  // Available hosts for comparison (excluding current active tab)
  const compareOptions = openTabs.filter((id) => id !== activeTabId);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={clsx(
          'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
          isSplit
            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-200 dark:hover:bg-indigo-900/50'
            : 'text-theme bg-theme border border-theme hover:bg-theme-secondary'
        )}
        title={isSplit ? 'Split view active' : 'Change layout'}
      >
        {layout === 'split-vertical' ? (
          <Columns2 className="h-4 w-4 shrink-0" />
        ) : layout === 'split-horizontal' ? (
          <Rows2 className="h-4 w-4 shrink-0" />
        ) : (
          <Square className="h-4 w-4 shrink-0" />
        )}
        <span className="hidden xl:inline">
          {layout === 'single' ? 'Single' : 'Split'}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {showMenu && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-theme border border-theme rounded-lg shadow-lg z-50">
          {/* Layout options */}
          <div className="p-1">
            <button
              onClick={() => handleLayoutSelect('single')}
              className={clsx(
                'flex items-center gap-3 w-full px-3 py-2 text-left rounded transition-colors',
                layout === 'single'
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-theme-secondary text-theme'
              )}
            >
              <Square className="h-4 w-4" />
              <div className="flex-1">
                <div className="text-sm font-medium">Single View</div>
                <div className="text-xs text-theme-secondary">Default single panel</div>
              </div>
            </button>

            <button
              onClick={() => handleLayoutSelect('split-vertical')}
              className={clsx(
                'flex items-center gap-3 w-full px-3 py-2 text-left rounded transition-colors',
                layout === 'split-vertical'
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-theme-secondary text-theme'
              )}
            >
              <Columns2 className="h-4 w-4" />
              <div className="flex-1">
                <div className="text-sm font-medium">Split Vertical</div>
                <div className="text-xs text-theme-secondary">Side-by-side panels</div>
              </div>
            </button>

            <button
              onClick={() => handleLayoutSelect('split-horizontal')}
              className={clsx(
                'flex items-center gap-3 w-full px-3 py-2 text-left rounded transition-colors',
                layout === 'split-horizontal'
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-theme-secondary text-theme'
              )}
            >
              <Rows2 className="h-4 w-4" />
              <div className="flex-1">
                <div className="text-sm font-medium">Split Horizontal</div>
                <div className="text-xs text-theme-secondary">Top and bottom panels</div>
              </div>
            </button>
          </div>

          {/* Quick compare options */}
          {compareOptions.length > 0 && (
            <>
              <div className="border-t border-theme" />
              <div className="p-1">
                <div className="px-3 py-1 text-xs font-medium text-theme-secondary">
                  Quick Compare With...
                </div>
                {compareOptions.map((hostId) => (
                  <button
                    key={hostId}
                    onClick={() => handleQuickCompare(hostId)}
                    className="flex items-center gap-3 w-full px-3 py-2 text-left rounded hover:bg-theme-secondary transition-colors"
                  >
                    {hostId === LOCAL_TAB_ID ? (
                      <Monitor className="h-4 w-4 text-theme-secondary" />
                    ) : (
                      <Server className="h-4 w-4 text-theme-secondary" />
                    )}
                    <span className="text-sm text-theme truncate">
                      {getHostLabel(hostId)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Current split info */}
          {isSplit && (
            <>
              <div className="border-t border-theme" />
              <div className="p-2 text-xs text-theme-secondary">
                <div className="flex items-center justify-between">
                  <span>Left: {getHostLabel(leftPanelHostId || activeTabId)}</span>
                  <span>Right: {getHostLabel(rightPanelHostId || LOCAL_TAB_ID)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
