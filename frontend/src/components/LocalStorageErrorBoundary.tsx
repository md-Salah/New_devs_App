import React, { Component, ReactNode } from 'react';
import { resetLocalStorage } from '../utils/localStorageManager';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

class LocalStorageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a localStorage related error
    if (
      error.message.includes('localStorage') ||
      error.message.includes('QuotaExceededError') ||
      error.message.includes('storage') ||
      error.name === 'QuotaExceededError'
    ) {
      return {
        hasError: true,
        errorMessage: error.message
      };
    }
    // Re-throw non-localStorage errors
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LocalStorage Error:', error, errorInfo);
  }

  handleClearStorage = () => {
    try {
      resetLocalStorage();
    } catch (error) {
      console.error('Failed to reset localStorage:', error);
      // Force clear as last resort
      localStorage.clear();
      window.location.reload();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                Storage Error Detected
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                We've detected an issue with your browser's local storage. This might be due to:
              </p>
              <ul className="mt-3 text-left text-sm text-gray-600 list-disc list-inside">
                <li>Outdated or corrupted storage data</li>
                <li>Storage quota exceeded</li>
                <li>Browser storage disabled or blocked</li>
                <li>Incompatible data from a previous version</li>
              </ul>
              
              <div className="mt-6 space-y-3">
                <button
                  onClick={this.handleClearStorage}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Clear Storage & Reload
                </button>
                <button
                  onClick={this.handleReload}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Try Reload Only
                </button>
              </div>
              
              <p className="mt-4 text-xs text-gray-500">
                Error: {this.state.errorMessage}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default LocalStorageErrorBoundary;