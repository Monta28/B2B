// Auth storage utilities - shared between api.ts and AuthContext.tsx

const TOKEN_KEY = 'token';
const REMEMBER_KEY = 'rememberMe';

// Helper to get token from either storage
export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
};

// Helper to clear token from both storages
export const clearToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
};

// Helper to save token
export const saveToken = (token: string, rememberMe: boolean): void => {
  // Clear from both first
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);

  // Save remember preference
  localStorage.setItem(REMEMBER_KEY, String(rememberMe));

  // Save token to appropriate storage
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
};
