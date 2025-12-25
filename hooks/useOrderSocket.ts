import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

export interface OrderEditingStatus {
  orderId: string;
  isEditing: boolean;
  editingByUserId?: string;
  editingByUserName?: string;
  editingStartedAt?: Date;
}

export interface OrderUpdateEvent {
  orderId: string;
  status?: string;
  totalHt?: number;
  lastModifiedAt?: Date;
}

interface UseOrderSocketOptions {
  onEditingStatusChange?: (status: OrderEditingStatus) => void;
  onOrderUpdated?: (update: OrderUpdateEvent) => void;
}

export function useOrderSocket(options: UseOrderSocketOptions = {}) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [editingStatuses, setEditingStatuses] = useState<Map<string, OrderEditingStatus>>(new Map());

  useEffect(() => {
    if (!user) return;

    const backendPort = import.meta.env.VITE_BACKEND_PORT || process.env.BACKEND_PORT || '4001';
    const backendUrl = import.meta.env.VITE_API_URL || `http://localhost:${backendPort}`;
    const socket = io(`${backendUrl}/orders`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('register', {
        userId: user.id,
        role: user.role,
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('orderEditingStatusChanged', (status: OrderEditingStatus) => {
      setEditingStatuses(prev => {
        const newMap = new Map(prev);
        if (status.isEditing) {
          newMap.set(status.orderId, status);
        } else {
          newMap.delete(status.orderId);
        }
        return newMap;
      });

      options.onEditingStatusChange?.(status);
    });

    socket.on('orderUpdated', (update: OrderUpdateEvent) => {
      options.onOrderUpdated?.(update);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const subscribeToOrder = useCallback((orderId: string) => {
    socketRef.current?.emit('subscribeToOrder', { orderId });
  }, []);

  const unsubscribeFromOrder = useCallback((orderId: string) => {
    socketRef.current?.emit('unsubscribeFromOrder', { orderId });
  }, []);

  const getEditingStatus = useCallback((orderId: string): OrderEditingStatus | undefined => {
    return editingStatuses.get(orderId);
  }, [editingStatuses]);

  const isOrderBeingEdited = useCallback((orderId: string): boolean => {
    return editingStatuses.has(orderId);
  }, [editingStatuses]);

  return {
    isConnected,
    editingStatuses,
    subscribeToOrder,
    unsubscribeFromOrder,
    getEditingStatus,
    isOrderBeingEdited,
  };
}
