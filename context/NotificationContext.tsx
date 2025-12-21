import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Notification, NotificationType } from '../types';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  isLoading: boolean;
  isConnected: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Icônes pour les notifications toast selon le type
const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'NEW_ORDER':
      return '🛒';
    case 'ORDER_STATUS':
      return '📦';
    case 'ALERT':
      return '⚠️';
    default:
      return 'ℹ️';
  }
};

export const NotificationProvider = ({ children }: React.PropsWithChildren) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Fetch notifications from API
  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await api.getNotifications(user);
      // Sort by date desc
      data.sort((a: Notification, b: Notification) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNotifications(data);
    } catch (e) {
      console.error("Failed to fetch notifications");
    }
  };

  // Handle new notification from WebSocket
  const handleNewNotification = useCallback((notification: Notification) => {
    console.log('[NotificationContext] New notification received:', notification);

    // Add to list (at the beginning)
    setNotifications(prev => {
      // Avoid duplicates
      if (prev.some(n => n.id === notification.id)) {
        return prev;
      }
      return [notification, ...prev];
    });

    // Show toast notification
    const icon = getNotificationIcon(notification.type);
    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-md w-full bg-white dark:bg-brand-900 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
      >
        <div className="flex-1 w-0 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 pt-0.5">
              <span className="text-2xl">{icon}</span>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {notification.title}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                {notification.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex border-l border-gray-200 dark:border-brand-700">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-accent hover:text-accent-hover focus:outline-none"
          >
            Fermer
          </button>
        </div>
      </div>
    ), {
      duration: 5000,
      position: 'top-right',
    });
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!user) {
      // Disconnect if no user
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setNotifications([]);
      return;
    }

    // Use VITE_API_URL if set, otherwise auto-detect based on current hostname
    const backendUrl = import.meta.env.VITE_API_URL ||
      `${window.location.protocol}//${window.location.hostname}:4001`;
    console.log('[NotificationContext] Connecting to WebSocket at:', backendUrl);
    const socket = io(`${backendUrl}/notifications`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[NotificationContext] WebSocket connected, socket id:', socket.id);
      setIsConnected(true);

      // Register with user info
      console.log('[NotificationContext] Registering user:', user.id, 'role:', user.role);
      socket.emit('register', { userId: user.id });
    });

    socket.on('connect_error', (error) => {
      console.error('[NotificationContext] WebSocket connection error:', error);
    });

    socket.on('disconnect', () => {
      console.log('[NotificationContext] WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('newNotification', handleNewNotification);

    // Initial fetch
    setIsLoading(true);
    fetchNotifications().then(() => setIsLoading(false));

    // Cleanup
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, handleNewNotification]);

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await api.markNotificationRead(id);
    } catch (e) {
      // Revert on error
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: false } : n));
    }
  };

  const markAllAsRead = async () => {
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await api.markAllNotificationsRead();
    } catch (e) {
      // Refetch on error
      fetchNotifications();
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      isLoading,
      isConnected,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
};
