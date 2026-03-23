import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      errorInfo
    });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state when props change (useful for route changes)
    if (this.props.resetOnPropsChange && prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Something went wrong
            </h3>
            
            <p className="text-sm text-gray-600 mb-6">
              We encountered an unexpected error. Please try again or contact support if the problem persists.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-6 text-left bg-gray-100 rounded-lg p-4">
                <summary className="font-medium text-gray-700 cursor-pointer mb-2 flex items-center">
                  <Bug className="w-4 h-4 mr-2" />
                  Error Details (Development Only)
                </summary>
                <div className="text-xs text-gray-600 font-mono bg-white p-3 rounded border overflow-auto max-h-32">
                  <div className="font-semibold text-red-600 mb-2">
                    {this.state.error.name}: {this.state.error.message}
                  </div>
                  <div className="whitespace-pre-wrap">
                    {this.state.error.stack}
                  </div>
                  {this.state.errorInfo && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="font-semibold mb-1">Component Stack:</div>
                      <div className="whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}

            <button
              onClick={this.handleRetry}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error handler for functional components
export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error) => {
    setError(error);
    console.error('useErrorHandler caught an error:', error);
  }, []);

  React.useEffect(() => {
    if (error) {
      // In production, you might want to send this to an error reporting service
      if (process.env.NODE_ENV === 'production') {
        // Example: sendErrorToService(error);
      }
    }
  }, [error]);

  return { error, resetError, handleError };
};

// Higher-order component for wrapping components with error boundary
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

export default ErrorBoundary;