import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authApi } from '../services/api';
import { getToken, clearToken } from '../services/auth-storage';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: React.PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        try {
          const profile = await authApi.getProfile();
          setUser({
            id: profile.id,
            email: profile.email,
            fullName: profile.fullName,
            role: profile.role as UserRole,
            companyId: profile.companyId,
            companyName: profile.companyName,
            dmsClientCode: profile.dmsClientCode,
            globalDiscount: profile.globalDiscount || 0,
          });
        } catch (error) {
          // Token invalid or expired
          clearToken();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await authApi.login(email, password, rememberMe);

      const userData: User = {
        id: response.user.id,
        email: response.user.email,
        fullName: response.user.fullName,
        role: response.user.role as UserRole,
        companyId: response.user.companyId,
        companyName: response.user.companyName,
        dmsClientCode: response.user.dmsClientCode,
        globalDiscount: response.user.globalDiscount || 0,
      };

      setUser(userData);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Ignore logout errors
    } finally {
      setUser(null);
    }
  };

  const hasRole = (roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
