import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logError } from '../lib/errorLogger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logError(error, {
      component: this.props.name || 'ErrorBoundary',
      action: 'componentDidCatch',
      componentStack: errorInfo.componentStack,
    });

    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          componentName={this.props.name}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
  componentName?: string;
}

export function ErrorFallback({ error, onRetry, componentName }: ErrorFallbackProps): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-theme">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-theme mb-2">
        {componentName ? `Error in ${componentName}` : 'Something went wrong'}
      </h2>
      <p className="text-sm text-theme-secondary mb-4 max-w-md">
        {error?.message || 'An unexpected error occurred'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-white bg-accent hover:bg-accent/90 rounded-lg
                     transition-colors"
          title="Try again"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}

interface RootErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
}

export function RootErrorFallback({ error, onRetry }: RootErrorFallbackProps): ReactNode {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-900 text-white">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-6">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold mb-3">Application Error</h1>
      <p className="text-gray-400 mb-2 max-w-lg text-center">
        The application encountered an unexpected error and could not recover.
      </p>
      <p className="text-sm text-gray-500 mb-6 max-w-lg text-center font-mono">
        {error?.message || 'Unknown error'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-3 text-sm font-medium
                     text-white bg-blue-600 hover:bg-blue-500 rounded-lg
                     transition-colors"
          title="Reload application"
        >
          <RefreshCw className="h-4 w-4" />
          Reload Application
        </button>
      )}
    </div>
  );
}
