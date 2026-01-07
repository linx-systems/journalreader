# Journal Reader

A modern, native Linux desktop application for reading and filtering system journal logs. Built with Tauri, React, and Rust, it provides an intuitive GUI alternative to the command-line `journalctl` tool.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey.svg)

## Features

- **Advanced Filtering** - Filter logs by priority level, time range, systemd units, boot sessions, and syslog identifiers
- **Powerful Search** - Grep-based pattern matching with regex support and case-sensitivity toggle
- **Virtual Scrolling** - Efficiently browse large log sets with smooth infinite scroll
- **Expandable Entries** - Click any log entry to view full metadata (PID, UID, executable, hostname, etc.)
- **Theme Support** - Dark/light themes with system-aware defaults, plus custom theme creation
- **Multi-Boot Support** - View and compare logs across different boot sessions

## Screenshots

*Coming soon*

## Requirements

- Linux with systemd/journald
- Node.js 18+
- Rust toolchain (1.70+)
- `journalctl` command available in PATH

## Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd journalreader

# Install dependencies
npm install

# Build the application
npm run tauri build
```

The built application will be available in `src-tauri/target/release/bundle/` as:
- AppImage (portable)
- DEB package (Debian/Ubuntu)

### Development

```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run tauri dev
```

## Usage

### Filter Panel

The left sidebar provides filtering options:

| Filter | Description |
|--------|-------------|
| **Search** | Text search with regex support |
| **Priority** | Filter by syslog priority (0=Emergency to 7=Debug) |
| **Time Range** | Predefined presets or custom date ranges |
| **Boot** | Select specific boot session or offset |
| **Units** | Filter by systemd units/services |

### Keyboard Shortcuts

- Toggle the filter sidebar for more viewing space
- Click any log entry to expand and view full details

### Themes

Access Settings from the toolbar to:
- Switch between light/dark themes
- Follow system theme preference
- Create and customize themes
- Import/export theme configurations

## Tech Stack

**Frontend:**
- React 19 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Zustand for state management
- TanStack Virtual for virtualized scrolling

**Backend:**
- Tauri 2 for native desktop integration
- Rust for system-level journal access
- Tokio async runtime

## Project Structure

```
journalreader/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── filters/        # Filter panel components
│   │   ├── logs/           # Log display components
│   │   ├── toolbar/        # Toolbar components
│   │   └── settings/       # Settings/theme components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   └── lib/                # Utilities and types
├── src-tauri/              # Rust backend
│   └── src/
│       ├── commands/       # Tauri command handlers
│       └── journal/        # journalctl integration
├── package.json
└── README.md
```

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
| `npm run tauri dev` | Run full Tauri app in dev mode |
| `npm run tauri build` | Build distributable application |

### IDE Setup

Recommended: [VS Code](https://code.visualstudio.com/) with:
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT
