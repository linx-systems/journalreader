# Journal Reader - AI Development Guide

## Project Overview

Journal Reader is a Tauri 2 desktop application for viewing systemd journal logs on Linux. It provides a modern GUI alternative to `journalctl` with advanced filtering, remote SSH access, and offline caching.

## Tech Stack

**Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 3.4, Zustand 5 (state management), TanStack Virtual (virtualized lists)

**Backend:** Tauri 2 (Rust), Tokio, SSH2, Rusqlite (SQLite), Keyring

**Testing:** Vitest 4, React Testing Library

## Project Structure

```
src/                    # React frontend
├── components/         # UI components organized by feature
│   ├── filters/        # Filter panel, search, priority, time range
│   ├── logs/           # Log viewer, entries, export
│   ├── statistics/     # Analytics charts and visualizations
│   ├── remote/         # SSH connection management
│   ├── offline/        # Offline sync UI
│   ├── layout/         # Split view, panels
│   └── settings/       # Settings and themes
├── hooks/              # Custom React hooks (useJournalLogs, useFollowMode, etc.)
├── stores/             # Zustand state stores (filter, connection, offline, theme)
├── lib/                # Utilities, types, Tauri wrappers
└── App.tsx             # Root component

src-tauri/              # Rust backend
├── src/
│   ├── commands/       # Tauri command handlers (journal, remote, offline, sync)
│   ├── journal/        # Core logic (reader, parser, ssh, offline_db, sync_engine)
│   └── error.rs        # Error types
├── Cargo.toml          # Rust dependencies
└── tauri.conf.json     # Tauri configuration
```

## Development Commands

```bash
npm run dev           # Start Vite dev server only
npm run tauri dev     # Full development mode with Tauri
npm run build         # Build frontend
npm run tauri build   # Build complete application
npm run test          # Run tests
npm run test:coverage # Run tests with coverage
npm run typecheck     # TypeScript type checking
```

## Architecture Patterns

### State Management
- Zustand stores are the single source of truth
- Each feature has its own store (filterStore, connectionStore, offlineStore, etc.)
- Stores located in `src/stores/`

### Tauri Integration
- All backend calls go through wrapper functions in `src/lib/tauri.ts`
- Frontend uses custom hooks that call these wrappers
- Tauri commands defined in `src-tauri/src/commands/`

### Component Organization
- Container components manage state and side effects
- Presentational components are pure and reusable
- Tests colocated in `__tests__` directories

### Virtual Scrolling
- TanStack Virtual used for efficient rendering of large log sets
- Critical for performance with thousands of entries

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces (JournalEntry, JournalFilter, RemoteHost) |
| `src/lib/tauri.ts` | Tauri command wrappers |
| `src/stores/filterStore.ts` | Main filter state and log entries |
| `src/hooks/useJournalLogs.ts` | Primary hook for fetching logs |
| `src-tauri/src/journal/reader.rs` | journalctl command building and execution |
| `src-tauri/src/journal/ssh.rs` | SSH connection management |
| `src-tauri/src/journal/offline_db.rs` | SQLite cache operations |

## Testing

- Tests use Vitest with React Testing Library
- Test files in `__tests__` folders next to source
- Mock Tauri APIs for component testing
- Run `npm run test:coverage` for coverage reports

## Important Notes

- **Linux only** - requires systemd/journalctl
- Passwords stored in system keyring (not localStorage)
- SSH host keys stored in `~/.config/journal-reader/known-hosts`
- Themes stored in `~/.config/journal-reader/themes`

## Path Aliases

- `@/*` maps to `./src/*` (e.g., `@/lib/types` → `./src/lib/types`)
