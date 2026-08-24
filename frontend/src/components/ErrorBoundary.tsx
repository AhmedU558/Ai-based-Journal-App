import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Without this, a runtime render error anywhere in the tree (or a chunk
// load failure from a network glitch) unmounts the entire app with no
// recovery path - the user sees a blank white screen and has no way back
// short of manually reloading. This is the single top-level catch that
// gives them a real "Something went wrong" screen with a way out instead.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled error in component tree:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)]">
          <div className="glass-panel glass-panel-glow animate-fade-in w-full max-w-[460px] p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-rose)]/15">
              <AlertTriangle className="h-7 w-7 text-[var(--accent-rose)]" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Something went wrong</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              An unexpected error occurred. Your data is safe - try reloading the page.
            </p>
            <button type="button" onClick={this.handleRetry} className="btn-primary w-full p-[0.85rem]">
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
