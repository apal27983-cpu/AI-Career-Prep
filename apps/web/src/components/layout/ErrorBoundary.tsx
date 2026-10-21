import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPanel } from '../ui/States';
import { Button } from '../ui/Button';

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a bad component cannot leave the user staring
 * at a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="p-6">
          <ErrorPanel error={this.state.error}>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </ErrorPanel>
        </div>
      );
    }
    return this.props.children;
  }
}
