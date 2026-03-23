// Global utility to force clear authentication
(window as any).forceClearAuth = () => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
  console.log('Authentication forcefully cleared');
};