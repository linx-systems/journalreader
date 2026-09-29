import { useState, useRef, useEffect } from 'react';
import { Monitor, Server, X, Plus, Wifi, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { useConnectionStore, LOCAL_TAB_ID } from '../../stores/connectionStore';
import { ConnectionManager } from '../remote/ConnectionManager';
import clsx from 'clsx';
import { isModalOpen } from '../ui/ModalDialog';

interface TabBarProps {
  onConnect?: (hostId: string, password?: string) => Promise<void>;
}

export function TabBar({ onConnect }: TabBarProps) {
  const {
    hosts,
    openTabs,
    activeTabId,
    connectedHostId,
    connectionStatus,
    loadHosts,
    openTab,
    closeTab,
    setActiveTab,
    connect,
    disconnect,
  } = useConnectionStore();

  const [showHostMenu, setShowHostMenu] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  const isConnecting = connectionStatus === 'connecting';

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowHostMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check scroll state
  useEffect(() => {
    const checkScroll = () => {
      const container = tabContainerRef.current;
      if (!container) return;

      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    };

    const container = tabContainerRef.current;
    if (container) {
      checkScroll();
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
      window.removeEventListener('resize', checkScroll);
    };
  }, [openTabs]);

  // Keyboard navigation: Ctrl+Tab / Ctrl+Shift+Tab to switch tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen()) return;
      // Don't trigger if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab for tab switching
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = openTabs.indexOf(activeTabId);
        if (currentIndex === -1) return;

        let newIndex: number;
        if (e.shiftKey) {
          // Ctrl+Shift+Tab: Previous tab (wrap around)
          newIndex = currentIndex === 0 ? openTabs.length - 1 : currentIndex - 1;
        } else {
          // Ctrl+Tab: Next tab (wrap around)
          newIndex = (currentIndex + 1) % openTabs.length;
        }

        setActiveTab(openTabs[newIndex]);
      }

      // Ctrl+W to close current tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (openTabs.length > 1) {
          closeTab(activeTabId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTabs, activeTabId, setActiveTab, closeTab]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = tabContainerRef.current;
    if (!container) return;

    const scrollAmount = 150;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const getHostById = (hostId: string) => {
    if (hostId === LOCAL_TAB_ID) return null;
    return hosts.find((h) => h.id === hostId);
  };

  const getTabLabel = (hostId: string) => {
    if (hostId === LOCAL_TAB_ID) return 'Local';
    const host = getHostById(hostId);
    return host?.name || 'Unknown';
  };

  const isTabConnected = (hostId: string) => {
    if (hostId === LOCAL_TAB_ID) {
      // Local is "connected" when there's no remote connection
      return connectedHostId === null;
    }
    return connectedHostId === hostId;
  };

  const isTabConnecting = (hostId: string) => {
    if (hostId === LOCAL_TAB_ID) return false;
    // When connecting, we check if this host is the one being connected to
    return isConnecting && connectedHostId === null;
  };

  const handleTabClick = async (hostId: string) => {
    setActiveTab(hostId);

    // If clicking a remote host tab that's not connected, initiate connection
    if (hostId !== LOCAL_TAB_ID && hostId !== connectedHostId) {
      const host = getHostById(hostId);
      if (host) {
        if (host.authMethod === 'password') {
          // Need password - show manager
          setShowManager(true);
        } else {
          try {
            if (onConnect) {
              await onConnect(hostId);
            } else {
              await connect(hostId);
            }
          } catch {
            // Error handled by store
          }
        }
      }
    } else if (hostId === LOCAL_TAB_ID && connectedHostId !== null) {
      // Switching to local while connected to remote - disconnect
      await disconnect();
    }
  };

  const handleTabDoubleClick = async (hostId: string) => {
    // Double-click on non-connected tab initiates connection
    if (hostId !== LOCAL_TAB_ID && !isTabConnected(hostId)) {
      const host = getHostById(hostId);
      if (host) {
        if (host.authMethod === 'password') {
          setShowManager(true);
        } else {
          try {
            if (onConnect) {
              await onConnect(hostId);
            } else {
              await connect(hostId);
            }
          } catch {
            // Error handled by store
          }
        }
      }
    }
  };

  const handleCloseTab = (e: React.MouseEvent, hostId: string) => {
    e.stopPropagation();
    closeTab(hostId);
  };

  const handleAddHost = (hostId: string) => {
    setShowHostMenu(false);
    openTab(hostId);
  };

  const availableHosts = hosts.filter((h) => !openTabs.includes(h.id));
  const showAddButton = availableHosts.length > 0 || openTabs.length < hosts.length + 1;

  return (
    <>
      <div className="flex items-center gap-1 min-w-0 max-w-full">
        {/* Scroll left button */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTabs('left')}
            className="p-1 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors shrink-0"
            title="Scroll tabs left"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Tab container */}
        <div
          ref={tabContainerRef}
          className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide min-w-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {openTabs.map((hostId) => {
            const isActive = activeTabId === hostId;
            const isConnected = isTabConnected(hostId);
            const isConnectingThis = isTabConnecting(hostId);
            const isLocal = hostId === LOCAL_TAB_ID;
            const canClose = openTabs.length > 1;

            return (
              <button
                key={hostId}
                onClick={() => handleTabClick(hostId)}
                onDoubleClick={() => handleTabDoubleClick(hostId)}
                className={clsx(
                  'group flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-t-lg border-t border-x transition-colors whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-theme border-theme text-theme -mb-px z-10'
                    : 'bg-theme-secondary/50 border-transparent text-theme-secondary hover:text-theme hover:bg-theme-secondary'
                )}
                title={isActive ? `Current tab: ${getTabLabel(hostId)}` : `Switch to ${getTabLabel(hostId)}`}
              >
                {/* Status indicator */}
                {isConnectingThis ? (
                  <Wifi className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                ) : isConnected ? (
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-400/50"></span>
                )}

                {/* Icon */}
                {isLocal ? (
                  <Monitor className="h-3.5 w-3.5" />
                ) : (
                  <Server className="h-3.5 w-3.5" />
                )}

                {/* Label */}
                <span className="max-w-[100px] truncate">{getTabLabel(hostId)}</span>

                {/* Close button */}
                {canClose && (
                  <button
                    onClick={(e) => handleCloseTab(e, hostId)}
                    className={clsx(
                      'p-0.5 rounded hover:bg-theme-secondary/80 transition-colors',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                    title="Close tab"
                    aria-label="Close tab"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Scroll right button */}
        {canScrollRight && (
          <button
            onClick={() => scrollTabs('right')}
            className="p-1 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors shrink-0"
            title="Scroll tabs right"
            aria-label="Scroll tabs right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Add tab button */}
        {showAddButton && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowHostMenu(!showHostMenu)}
              className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
              title="Open host tab"
              aria-label="Open host tab"
            >
              <Plus className="h-4 w-4" />
            </button>

            {showHostMenu && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-theme border border-theme rounded-lg shadow-lg z-50">
                {/* Local option (if not already open) */}
                {!openTabs.includes(LOCAL_TAB_ID) && (
                  <button
                    onClick={() => handleAddHost(LOCAL_TAB_ID)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-theme-secondary transition-colors rounded-t-lg"
                    title="Open Local Machine tab"
                  >
                    <Monitor className="h-4 w-4 text-theme-secondary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-theme">Local Machine</div>
                      <div className="text-xs text-theme-secondary">View local journal logs</div>
                    </div>
                  </button>
                )}

                {/* Remote hosts */}
                {availableHosts.length > 0 && (
                  <>
                    {!openTabs.includes(LOCAL_TAB_ID) && <div className="border-t border-theme" />}
                    <div className="py-1">
                      {availableHosts.map((host) => (
                        <button
                          key={host.id}
                          onClick={() => handleAddHost(host.id)}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-theme-secondary transition-colors"
                          title={`Open ${host.name} tab`}
                        >
                          <Server className="h-4 w-4 text-theme-secondary" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-theme truncate">
                              {host.name}
                            </div>
                            <div className="text-xs text-theme-secondary truncate">
                              {host.username}@{host.hostname}
                            </div>
                          </div>
                          {connectedHostId === host.id && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              Connected
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Manage hosts */}
                <div className="border-t border-theme" />
                <button
                  onClick={() => {
                    setShowHostMenu(false);
                    setShowManager(true);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-theme-secondary transition-colors rounded-b-lg"
                  title="Manage hosts"
                >
                  <Settings className="h-4 w-4 text-theme-secondary" />
                  <span className="text-sm text-theme">Manage Hosts...</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConnectionManager isOpen={showManager} onClose={() => setShowManager(false)} />
    </>
  );
}
