/**
 * Get the backend URL based on the current environment
 * Returns empty string for production (relative URLs) to avoid CORS issues
 * Returns localhost URL for development
 */
export function getBackendUrl(): string {
  // Check if we're in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
  }
  
  // For production, use relative URL (empty string)
  // This makes API calls relative to the current domain
  return '';
}

// Convenience function to get API URL (alias for backward compatibility)
export function getApiUrl(): string {
  return getBackendUrl();
}

// Export as default for simpler imports
export default getBackendUrl;