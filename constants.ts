import { OrderStatus } from './types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En attente validation',
  [OrderStatus.VALIDATED]: 'Validée (Transmise DMS)',
  [OrderStatus.PREPARATION]: 'En préparation',
  [OrderStatus.SHIPPED]: 'Expédié',
  [OrderStatus.INVOICED]: 'Facturé',
  [OrderStatus.CANCELLED]: 'Annulée',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [OrderStatus.VALIDATED]: 'bg-blue-50 text-blue-600 border border-blue-200',
  [OrderStatus.PREPARATION]: 'bg-blue-100 text-blue-800',
  [OrderStatus.SHIPPED]: 'bg-purple-100 text-purple-800',
  [OrderStatus.INVOICED]: 'bg-green-100 text-green-800',
  [OrderStatus.CANCELLED]: 'bg-gray-100 text-gray-800',
};