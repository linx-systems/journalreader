import { useState, useRef, useCallback } from 'react';
import { FilterPanel, type FilterPanelRef } from './components/filters/FilterPanel';
import { LogViewer } from './components/logs/LogViewer';
import { StatisticsView } from './components/statistics/StatisticsView';
import { Toolbar } from './components/toolbar/Toolbar';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/offline/OfflineBanner';
import { useBookmarkShortcuts } from './hooks/useBookmarkShortcuts';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useBookmarkStore } from './stores/bookmarkStore';
import { useStatisticsStore } from './stores/statisticsStore';
import { useFilterStore } from './stores/filterStore';
import { useJournalLogs } from './hooks/useJournalLogs';
import { PanelLeftClose, PanelLeft, ScrollText, Settings, Bookmark, Keyboard } from 'lucide-react';
import clsx from 'clsx';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const filterPanelRef = useRef<FilterPanelRef>(null);
  const { activeBookmarkId, bookmarks } = useBookmarkStore();
  const { viewMode } = useStatisticsStore();
  const { isFollowing } = useFilterStore();
  const { refresh, isLoading } = useJournalLogs();

  // Enable keyboard shortcuts for bookmarks (Ctrl+1 through Ctrl+9)
  useBookmarkShortcuts();

  // Callbacks for global shortcuts
  const handleFocusSearch = useCallback(() => {
    // Open sidebar if closed before focusing search
    if (!sidebarOpen) {
      setSidebarOpen(true);
    }
    // Small delay to let sidebar open if it was closed
    setTimeout(() => filterPanelRef.current?.focusSearch(), 50);
  }, [sidebarOpen]);

  const handleRefresh = useCallback(() => {
    if (!isLoading && !isFollowing) {
      refresh();
    }
  }, [refresh, isLoading, isFollowing]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleShowHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);

  // Enable global keyboard shortcuts
  useGlobalShortcuts({
    onFocusSearch: handleFocusSearch,
    onRefresh: handleRefresh,
    onToggleSidebar: handleToggleSidebar,
    onOpenSettings: handleOpenSettings,
    onShowHelp: handleShowHelp,
  });

  const activeBookmark = activeBookmarkId
    ? bookmarks.find((b) => b.id === activeBookmarkId)
    : null;

  return (
    <div className="h-screen flex flex-col bg-theme-secondary">
      {/* Offline Banner */}
      <OfflineBanner />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-theme border-b border-theme">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-theme-secondary hover:text-theme
                       hover:bg-theme-secondary rounded transition-colors"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 accent-theme" />
            <h1 className="text-lg font-semibold text-theme">
              Journal Reader
            </h1>
            {activeBookmark && (
              <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">
                <Bookmark className="h-3.5 w-3.5 fill-accent/30" />
                <span>{activeBookmark.name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHelpOpen(true)}
            className="p-1.5 text-theme-secondary hover:text-theme
                       hover:bg-theme-secondary rounded transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 text-theme-secondary hover:text-theme
                       hover:bg-theme-secondary rounded transition-colors"
            title="Settings (Ctrl+,)"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside
          className={clsx(
            'transition-all duration-200 ease-in-out flex-shrink-0',
            sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
          )}
        >
          <ErrorBoundary name="Filter Panel">
            <FilterPanel ref={filterPanelRef} />
          </ErrorBoundary>
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-w-0 bg-theme">
          <Toolbar />
          <ErrorBoundary name={viewMode === 'logs' ? 'Log Viewer' : 'Statistics'}>
            {viewMode === 'logs' ? <LogViewer /> : <StatisticsView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Settings Panel */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default App;
