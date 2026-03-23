import toast from 'react-hot-toast';

// Types for different error scenarios
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  retryable?: boolean;
  temporary?: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

// Error classification
export const classifyError = (error: any): ApiError => {
  // Network errors
  if (!navigator.onLine) {
    return {
      message: 'You appear to be offline. Please check your internet connection.',
      code: 'NETWORK_OFFLINE',
      retryable: true,
      temporary: true,
    };
  }

  // Fetch errors
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return {
      message: 'Unable to connect to the server. Please try again.',
      code: 'NETWORK_ERROR',
      retryable: true,
      temporary: true,
    };
  }

  // HTTP errors
  if (error.response || error.status) {
    const status = error.response?.status || error.status;
    const message = error.response?.data?.message || error.message;

    switch (status) {
      case 400:
        return {
          message: message || 'Invalid request. Please check your input.',
          code: 'BAD_REQUEST',
          status,
          retryable: false,
        };

      case 401:
        return {
          message: 'Your session has expired. Please log in again.',
          code: 'UNAUTHORIZED',
          status,
          retryable: false,
        };

      case 403:
        return {
          message: 'You don\'t have permission to perform this action.',
          code: 'FORBIDDEN',
          status,
          retryable: false,
        };

      case 404:
        return {
          message: 'The requested resource was not found.',
          code: 'NOT_FOUND',
          status,
          retryable: false,
        };

      case 408:
      case 429:
        return {
          message: 'Server is busy. Please try again in a moment.',
          code: status === 408 ? 'REQUEST_TIMEOUT' : 'RATE_LIMITED',
          status,
          retryable: true,
          temporary: true,
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          message: 'Server error. Please try again later.',
          code: 'SERVER_ERROR',
          status,
          retryable: true,
          temporary: true,
        };

      default:
        return {
          message: message || 'An unexpected error occurred.',
          code: 'UNKNOWN_HTTP_ERROR',
          status,
          retryable: status >= 500,
          temporary: status >= 500,
        };
    }
  }

  // Parse errors (JSON, etc.)
  if (error instanceof SyntaxError) {
    return {
      message: 'Server returned invalid data. Please try again.',
      code: 'PARSE_ERROR',
      retryable: true,
      temporary: true,
    };
  }

  // AbortError (request cancelled)
  if (error.name === 'AbortError') {
    return {
      message: 'Request was cancelled.',
      code: 'CANCELLED',
      retryable: true,
      temporary: true,
    };
  }

  // Generic fallback
  return {
    message: error.message || 'An unexpected error occurred.',
    code: 'UNKNOWN_ERROR',
    retryable: false,
  };
};

// Sleep utility for delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Calculate retry delay with exponential backoff
const calculateRetryDelay = (
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number => {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
};

// Retry wrapper for API calls
export const withRetry = async <T>(
  apiCall: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: ApiError) => void
): Promise<T> => {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: ApiError;

  for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      const apiError = classifyError(error);
      lastError = apiError;

      // Don't retry if error is not retryable or if we've exceeded max retries
      if (!apiError.retryable || attempt > retryConfig.maxRetries) {
        throw apiError;
      }

      // Notify about retry attempt
      if (onRetry) {
        onRetry(attempt, apiError);
      }

      // Wait before retrying
      const delay = calculateRetryDelay(attempt, retryConfig);
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError!;
};

// Global error handler with user-friendly notifications
export const handleApiError = (error: any, options: {
  showToast?: boolean;
  context?: string;
  fallbackAction?: () => void;
} = {}) => {
  const { showToast = true, context = '', fallbackAction } = options;
  const apiError = classifyError(error);

  // Log error for debugging
  console.error('API Error:', {
    error: apiError,
    context,
    originalError: error,
    timestamp: new Date().toISOString(),
  });

  // Show user-friendly notification
  if (showToast) {
    const toastMessage = context 
      ? `${context}: ${apiError.message}`
      : apiError.message;

    if (apiError.status === 401) {
      toast.error(toastMessage, {
        duration: 5000,
        id: 'auth-error', // Prevent duplicate auth toasts
      });
      
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } else if (apiError.temporary || apiError.retryable) {
      toast.error(toastMessage, {
        duration: 4000,
        icon: '🔄',
      });
    } else {
      toast.error(toastMessage, {
        duration: 6000,
      });
    }
  }

  // Execute fallback action if provided
  if (fallbackAction) {
    fallbackAction();
  }

  return apiError;
};

// Hook for managing API call states with error handling
export const useApiCall = <T>() => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = async (
    apiCall: () => Promise<T>,
    options: {
      retryConfig?: Partial<RetryConfig>;
      showErrorToast?: boolean;
      context?: string;
      onRetry?: (attempt: number, error: ApiError) => void;
    } = {}
  ) => {
    const {
      retryConfig = {},
      showErrorToast = true,
      context = '',
      onRetry,
    } = options;

    setLoading(true);
    setError(null);

    try {
      const result = await withRetry(apiCall, retryConfig, onRetry);
      setData(result);
      return result;
    } catch (apiError) {
      const error = apiError as ApiError;
      setError(error);
      
      if (showErrorToast) {
        handleApiError(error, { context });
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setData(null);
    setError(null);
    setLoading(false);
  };

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
};

// Wrapper for fetch with automatic error handling
export const safeFetch = async (
  url: string,
  options: RequestInit = {},
  config: {
    retryConfig?: Partial<RetryConfig>;
    timeout?: number;
    showErrorToast?: boolean;
    context?: string;
  } = {}
): Promise<Response> => {
  const {
    retryConfig = {},
    timeout = 30000,
    showErrorToast = true,
    context = '',
  } = config;

  const apiCall = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw {
          response,
          status: response.status,
          message: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  try {
    return await withRetry(apiCall, retryConfig);
  } catch (error) {
    if (showErrorToast) {
      handleApiError(error, { context });
    }
    throw error;
  }
};

// Import useState
import { useState } from 'react';

export default {
  classifyError,
  withRetry,
  handleApiError,
  useApiCall,
  safeFetch,
};