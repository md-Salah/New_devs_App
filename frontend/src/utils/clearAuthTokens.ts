// Utility to check and clear invalid authentication tokens

export const checkAndClearInvalidTokens = () => {
  // Check for invalid or expired tokens in localStorage
  const token = localStorage.getItem('sb-auth-token');
  if (token) {
    try {
      const parsed = JSON.parse(token);
      // Check if token is expired
      if (parsed.expires_at && new Date(parsed.expires_at * 1000) < new Date()) {
        localStorage.removeItem('sb-auth-token');
        console.log('Cleared expired auth token');
      }
    } catch (error) {
      // If token is malformed, remove it
      localStorage.removeItem('sb-auth-token');
      console.log('Cleared malformed auth token');
    }
  }
};