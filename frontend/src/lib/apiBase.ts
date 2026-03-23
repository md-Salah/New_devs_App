// API base URL utilities

export const getApiBase = (): string => {
  return import.meta.env.VITE_BACKEND_URL || '';
};

export const getApiUrl = (path: string): string => {
  const base = getApiBase();
  return `${base}${path}`;
};