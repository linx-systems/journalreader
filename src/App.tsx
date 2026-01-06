import { useState } from 'react';
import { FilterPanel } from './components/filters/FilterPanel';
import { LogViewer } from './components/logs/LogViewer';
import { Toolbar } from './components/toolbar/Toolbar';
import { PanelLeftClose, PanelLeft, ScrollText } from 'lucide-react';
import clsx from 'clsx';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                     hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeft className="h-5 w-5" />
          )}
        </button>
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-sky-600" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Journal Reader
          </h1>
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
          <FilterPanel />
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
          <Toolbar />
          <LogViewer />
        </main>
      </div>
    </div>
  );
}

export default App;
