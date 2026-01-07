import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    // SWC is ~20x faster than Babel for JSX transforms
    react(),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,

  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Warm up frequently used files
    warmup: {
      clientFiles: ["./src/App.tsx", "./src/main.tsx", "./src/components/**/*.tsx"],
    },
  },

  // Optimize dependency pre-bundling for faster dev startup
  optimizeDeps: {
    // Pre-bundle these dependencies to avoid repeated processing
    include: [
      "react",
      "react-dom",
      "zustand",
      "@tanstack/react-virtual",
      "date-fns",
      "clsx",
      "lucide-react",
      "@tauri-apps/api",
      "@tauri-apps/plugin-shell",
    ],
    // Exclude native bindings that shouldn't be bundled
    exclude: [],
    // Force pre-bundling even if not detected
    force: false,
  },

  // Build optimizations
  build: {
    // Use esbuild for faster minification
    minify: "esbuild",
    // Target modern browsers for smaller bundles
    target: "es2020",
    // Enable source maps for debugging (disable in prod for smaller builds)
    sourcemap: process.env.NODE_ENV === "development",
    // Rollup optimizations
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          vendor: ["react", "react-dom"],
          ui: ["lucide-react", "clsx"],
          state: ["zustand"],
          virtual: ["@tanstack/react-virtual"],
        },
      },
    },
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 1000,
  },

  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Enable caching
  cacheDir: "node_modules/.vite",

  // esbuild options for faster transforms
  esbuild: {
    // Drop console.log in production
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
    // Use faster JSX transform
    jsxInject: undefined,
  },

  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/components/**",
        "src/hooks/**",
        "src-tauri/**",
      ],
    },
  },
}));
