import React, { Component, ReactNode, ErrorInfo, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Bug, Shield, Wifi, WifiOff } from 'lucide-react';

// Enhanced Error Boundary with crash prevention features
interface CrashPreventionProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  enableOfflineSupport?: boolean;
  enableMemoryMonitoring?: boolean;
}

interface CrashPreventionState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
  isRetrying: boolean;
  isOffline: boolean;
  memoryWarning: boolean;
}

class CrashPrevention extends Component<CrashPreventionProps, CrashPreventionState> {
  private retryTimeoutId?: NodeJS.Timeout;
  private memoryCheckInterval?: NodeJS.Timeout;
  
  constructor(props: CrashPreventionProps) {
    super(props);
    this.state = { 
      hasError: false, 
      retryCount: 0, 
      isRetrying: false,
      isOffline: !navigator.onLine,
      memoryWarning: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CrashPreventionState> {
    return { hasError: true, error };
  }

  componentDidMount() {
    // Set up network monitoring
    if (this.props.enableOfflineSupport) {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Set up memory monitoring
    if (this.props.enableMemoryMonitoring) {
      this.startMemoryMonitoring();
    }

    // Set up unhandled promise rejection handling
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    // Clean up event listeners
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    
    // Clear timeouts and intervals
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
  }

  handleOnline = () => {
    this.setState({ isOffline: false });
    // Auto-retry if we were offline
    if (this.state.hasError && this.state.retryCount < (this.props.maxRetries || 3)) {
      this.handleRetryWithDelay();
    }
  };

  handleOffline = () => {
    this.setState({ isOffline: true });
  };

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Prevent the error from causing a crash
    event.preventDefault();
    
    // Create a synthetic error for the boundary
    const error = new Error(`Unhandled Promise Rejection: ${event.reason?.message || event.reason}`);
    this.componentDidCatch(error, { componentStack: 'Promise rejection' } as ErrorInfo);
  };

  startMemoryMonitoring = () => {
    // Check memory usage every 30 seconds
    this.memoryCheckInterval = setInterval(() => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usedPercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
        
        if (usedPercent > 80) {
          console.warn(`High memory usage detected: ${usedPercent.toFixed(1)}%`);
          this.setState({ memoryWarning: true });
          
          // Trigger garbage collection if possible
          if ('gc' in window) {
            (window as any).gc();
          }
        } else if (usedPercent < 60) {
          this.setState({ memoryWarning: false });
        }
      }
    }, 30000);
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CrashPrevention caught an error:', error, errorInfo);
    
    this.setState({
      errorInfo,
      retryCount: this.state.retryCount + 1
    });

    // Enhanced error logging
    this.logErrorDetails(error, errorInfo);

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Auto-retry for certain types of errors
    if (this.shouldAutoRetry(error)) {
      this.handleRetryWithDelay();
    }
  }

  logErrorDetails = (error: Error, errorInfo: ErrorInfo) => {
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      retryCount: this.state.retryCount,
      isOffline: this.state.isOffline,
      memoryWarning: this.state.memoryWarning,
      // Memory info if available
      memory: 'memory' in performance ? (performance as any).memory : null
    };

    console.error('Detailed error information:', errorDetails);
    
    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendErrorToMonitoring(errorDetails);
    }
  };

  sendErrorToMonitoring = (errorDetails: any) => {
    // Send error to monitoring service (implement based on your monitoring solution)
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorDetails)
      }).catch(err => console.error('Failed to send error to monitoring:', err));
    } catch (err) {
      console.error('Error sending to monitoring service:', err);
    }
  };

  shouldAutoRetry = (error: Error): boolean => {
    const maxRetries = this.props.maxRetries || 3;
    if (this.state.retryCount >= maxRetries) return false;

    // Auto-retry for network errors, loading errors, etc.
    const retryableErrors = [
      'ChunkLoadError',
      'NetworkError',
      'Failed to fetch',
      'Loading chunk',
      'Script error'
    ];

    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError) || 
      error.name.includes(retryableError)
    );
  };

  handleRetryWithDelay = () => {
    const delay = this.props.retryDelay || 1000 + (this.state.retryCount * 500); // Exponential backoff
    
    this.setState({ isRetrying: true });
    
    this.retryTimeoutId = setTimeout(() => {
      this.handleRetry();
    }, delay);
  };

  componentDidUpdate(prevProps: CrashPreventionProps) {
    // Reset error state when props change (useful for route changes)
    if (this.props.resetOnPropsChange && 
        prevProps.children !== this.props.children && 
        this.state.hasError) {
      this.setState({ 
        hasError: false, 
        error: undefined, 
        errorInfo: undefined, 
        retryCount: 0,
        isRetrying: false
      });
    }
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      isRetrying: false
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center p-8 max-w-lg">
            {/* Status indicators */}
            <div className="flex justify-center gap-2 mb-4">
              <div className={`w-3 h-3 rounded-full ${this.state.isOffline ? 'bg-red-500' : 'bg-green-500'}`} title={this.state.isOffline ? 'Offline' : 'Online'} />
              {this.state.memoryWarning && (
                <div className="w-3 h-3 rounded-full bg-yellow-500" title="High memory usage" />
              )}
            </div>

            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              {this.state.isRetrying ? (
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-red-600" />
              )}
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {this.state.isRetrying ? 'Retrying...' : 'Something went wrong'}
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              {this.state.isOffline 
                ? 'You appear to be offline. Please check your connection.'
                : 'We encountered an unexpected error. Please try again or contact support if the problem persists.'
              }
            </p>

            {this.state.retryCount > 0 && (
              <p className="text-xs text-gray-500 mb-4">
                Retry attempt: {this.state.retryCount}/{this.props.maxRetries || 3}
              </p>
            )}

            {/* Network status */}
            {this.props.enableOfflineSupport && (
              <div className="flex items-center justify-center gap-2 mb-4">
                {this.state.isOffline ? (
                  <WifiOff className="w-4 h-4 text-red-500" />
                ) : (
                  <Wifi className="w-4 h-4 text-green-500" />
                )}
                <span className="text-sm text-gray-600">
                  {this.state.isOffline ? 'Offline' : 'Online'}
                </span>
              </div>
            )}

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

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                disabled={this.state.isRetrying || (this.state.retryCount >= (this.props.maxRetries || 3))}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${this.state.isRetrying ? 'animate-spin' : ''}`} />
                {this.state.isRetrying ? 'Retrying...' : 'Try Again'}
              </button>
              
              <button
                onClick={this.handleReload}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Shield className="w-4 h-4 mr-2" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for crash prevention in functional components
export const useCrashPrevention = () => {
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [memoryWarning, setMemoryWarning] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Memory monitoring
    const memoryCheck = setInterval(() => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usedPercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
        setMemoryWarning(usedPercent > 80);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(memoryCheck);
    };
  }, []);

  const handleError = (error: Error) => {
    setError(error);
    console.error('useCrashPrevention caught an error:', error);
  };

  const resetError = () => setError(null);

  return { 
    error, 
    resetError, 
    handleError, 
    isOnline, 
    memoryWarning 
  };
};

// Higher-order component for wrapping components with enhanced crash prevention
export const withCrashPrevention = <P extends object>(
  Component: React.ComponentType<P>,
  options: Partial<CrashPreventionProps> = {}
) => {
  const WrappedComponent = (props: P) => (
    <CrashPrevention 
      maxRetries={3}
      retryDelay={1000}
      enableOfflineSupport={true}
      enableMemoryMonitoring={true}
      resetOnPropsChange={true}
      {...options}
    >
      <Component {...props} />
    </CrashPrevention>
  );

  WrappedComponent.displayName = `withCrashPrevention(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

export default CrashPrevention;