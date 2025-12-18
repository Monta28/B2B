import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';

interface UseNotificationSocketOptions {
  onNewNotification?: (notification: Notification) => void;
}

export function useNotificationSocket(options: UseNotificationSocketOptions = {}) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) return;

    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4001';
    const socket = io(`${backendUrl}/notifications`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[NotificationSocket] Connected');
      setIsConnected(true);

      // Register with user info
      socket.emit('register', {
        userId: user.id,
      });
    });

    socket.on('disconnect', () => {
      console.log('[NotificationSocket] Disconnected');
      setIsConnected(false);
    });

    socket.on('newNotification', (notification: Notification) => {
      console.log('[NotificationSocket] New notification:', notification);
      options.onNewNotification?.(notification);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return {
    isConnected,
  };
}
