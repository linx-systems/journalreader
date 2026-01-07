/** @type {import('tailwindcss').Config} */
export default {
  // JIT mode is enabled by default in Tailwind v3.x
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Disable preflight for faster builds if not using Tailwind base styles heavily
  corePlugins: {
    // Keep preflight enabled (comment out to disable)
    // preflight: false,
  },
  theme: {
    extend: {
      colors: {
        priority: {
          emerg: '#dc2626',    // red-600
          alert: '#ea580c',    // orange-600
          crit: '#d97706',     // amber-600
          err: '#ca8a04',      // yellow-600
          warning: '#65a30d',  // lime-600
          notice: '#16a34a',   // green-600
          info: '#0284c7',     // sky-600
          debug: '#6b7280',    // gray-500
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
  // Future-proof settings for better tree-shaking
  future: {
    hoverOnlyWhenSupported: true,
  },
}
