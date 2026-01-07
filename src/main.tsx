import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { ErrorBoundary, RootErrorFallback } from "./components/ErrorBoundary";
import "./index.css";

function handleRootError() {
  window.location.reload();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary
      name="Root"
      fallback={<RootErrorFallback error={null} onRetry={handleRootError} />}
    >
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
