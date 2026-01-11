
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ORDER_STATUS_LABELS, ORDER_STATUS_LABELS_CLIENT } from '../constants';
import { useAuth } from '../context/AuthContext';
import { UserRole, OrderStatus, Order, AppConfig, OrderItem } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { useConfig } from '../context/ConfigContext';
import { useOrderSocket } from '../hooks/useOrderSocket';
import toast from 'react-hot-toast';

type SortConfig = { key: keyof Order | 'dmsRef'; direction: 'asc' | 'desc'; };
type OrderTab = 'ACTIVE' | 'HISTORY';

const MODERN_STATUS_STYLES: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'bg-amber-50 text-amber-700 border-amber-200',
  [OrderStatus.VALIDATED]: 'bg-blue-50 text-blue-700 border-blue-200',
  [OrderStatus.PREPARATION]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  [OrderStatus.SHIPPED]: 'bg-purple-50 text-purple-700 border-purple-200',
  [OrderStatus.INVOICED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [OrderStatus.CANCELLED]: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ValidationCooldownButton = ({ order, config, onValidate, isBeingEdited, editingByUserName }: { order: Order, config: AppConfig, onValidate: () => void, isBeingEdited?: boolean, editingByUserName?: string }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  useEffect(() => {
    const lastModified = order.lastModifiedAt ? new Date(order.lastModifiedAt).getTime() : new Date(order.date).getTime();
    const calculateTimeLeft = () => Math.max(0, Math.ceil((config.validationCooldownSeconds || 0) - (new Date().getTime() - lastModified) / 1000));
    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [order.lastModifiedAt, order.date, config.validationCooldownSeconds]);

  // Si la commande est en cours de modification par le client
  if (isBeingEdited) {
    return (
      <div className="bg-orange-100 text-orange-700 p-1.5 rounded-md flex items-center justify-center cursor-not-allowed border border-orange-300 min-w-[34px] transition-all animate-pulse" title={`En cours de modification par ${editingByUserName || 'le client'}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
    );
  }

  if (timeLeft > 0) return (<div className="bg-gray-100 text-gray-500 p-1.5 rounded-md flex items-center justify-center cursor-not-allowed border border-gray-200 min-w-[34px] transition-all" title={`Délai de sécurité : encore ${timeLeft} secondes avant validation`}><span className="text-[10px] font-bold font-mono">{timeLeft}s</span></div>);
  return (<button onClick={onValidate} className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 p-1.5 rounded-md shadow-sm transition-all active:scale-95 flex items-center justify-center animate-fadeIn" title="Valider la commande"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>);
};

export const Orders = () => {
  const { user, hasRole } = useAuth();
  const { formatPrice, config } = useConfig();
  const queryClient = useQueryClient();
  const isInternal = hasRole([UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN]);
  const isSysAdmin = hasRole([UserRole.SYSTEM_ADMIN]);
  const isClientAdmin = hasRole([UserRole.CLIENT_ADMIN]);

  // WebSocket pour les notifications temps réel
  const { editingStatuses, isConnected } = useOrderSocket({
    onEditingStatusChange: () => {
      // Rafraîchir la liste des commandes quand le statut d'édition change
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onOrderUpdated: () => {
      // Rafraîchir la liste des commandes quand une commande est mise à jour
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const [activeTab, setActiveTab] = useState<OrderTab>('ACTIVE');
  const [clientFilter, setClientFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'STOCK' | 'QUICK'>('ALL');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [refFilter, setRefFilter] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
  const [confirmAction, setConfirmAction] = useState<{ id: string, status: OrderStatus } | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [printOnValidate, setPrintOnValidate] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [shipmentOrder, setShipmentOrder] = useState<Order | null>(null);
  const [shipmentItems, setShipmentItems] = useState<Record<string, number>>({});

  const { data: companies } = useQuery({ queryKey: ['admin-companies'], queryFn: api.admin.getCompanies, enabled: isInternal });
  const { data: orders, isLoading } = useQuery({ queryKey: ['orders', isInternal ? 'all' : user?.companyName], queryFn: () => api.getOrders(isInternal ? undefined : user?.companyName), refetchInterval: 5000 });

  const updateStatusMutation = useMutation({ mutationFn: ({ id, status }: { id: string, status: OrderStatus }) => api.updateOrderStatus(id, status), onSuccess: (data, variables) => { queryClient.invalidateQueries({ queryKey: ['orders'] }); if (variables.status === OrderStatus.VALIDATED && printOnValidate) handlePrintPreparation(variables.id); setPrintOnValidate(false); } });
  const updateOrderContentMutation = useMutation({ mutationFn: ({ id, items }: { id: string, items: any[] }) => api.updateOrder(id, items), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); setEditingOrder(null); alert("Commande mise à jour avec succès."); } });
  const syncDmsMutation = useMutation({ mutationFn: () => api.admin.syncDmsOrders(), onSuccess: (result: { synced: number; message: string }) => { queryClient.invalidateQueries({ queryKey: ['orders'] }); if (result.synced > 0) { toast.success(result.message); } else { toast(result.message, { icon: 'ℹ️' }); } }, onError: (error: any) => { toast.error(error.message || 'Erreur lors de la synchronisation'); } });
  const deleteOrderMutation = useMutation({ mutationFn: (orderId: string) => api.deleteOrder(orderId), onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ['orders'] }); toast.success(result.message || 'Commande supprimée avec succès'); setDeleteOrderId(null); }, onError: (error: any) => { toast.error(error.message || 'Erreur lors de la suppression'); } });
  const shipOrderMutation = useMutation({ mutationFn: ({ orderId, items }: { orderId: string; items: { itemId: string; quantityDelivered: number }[] }) => api.shipOrder(orderId, items), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); toast.success('Commande expédiée avec succès'); setShipmentOrder(null); setShipmentItems({}); }, onError: (error: any) => { toast.error(error.message || 'Erreur lors de l\'expédition'); } });
  const handlePrintPreparation = async (orderId: string) => { try { await api.printPreparationSlip(orderId); alert("Le bon de préparation a été envoyé à l'imprimante."); } catch (e) { alert("Erreur lors de l'impression."); } };

  // Ouvrir le modal d'expédition
  const openShipmentModal = (order: Order) => {
    setShipmentOrder(order);
    // Initialiser les quantités livrées avec les valeurs actuelles ou la quantité totale
    const initial: Record<string, number> = {};
    order.items?.forEach(item => {
      if (item.id) {
        initial[item.id] = item.quantityDelivered ?? item.quantity;
      }
    });
    setShipmentItems(initial);
  };

  // Soumettre l'expédition
  const handleSubmitShipment = () => {
    if (!shipmentOrder) return;
    const items = Object.entries(shipmentItems).map(([itemId, qty]) => ({ itemId, quantityDelivered: qty as number }));
    shipOrderMutation.mutate({ orderId: shipmentOrder.id, items });
  };

  // Référence pour la fonction de sync (évite les re-renders)
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  // Fonction de sync silencieuse (pas de toast sauf si données synchronisées)
  const performAutoSync = useCallback(async () => {
    try {
      const result = await api.admin.syncDmsOrders();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.synced > 0) {
        toast.success(`${result.synced} commande(s) synchronisée(s) avec le DMS`);
      }
      lastSyncRef.current = Date.now();
    } catch {
      // Pas de toast pour les erreurs auto (évite le spam)
    }
  }, [queryClient]);

  // Synchronisation automatique DMS basée sur l'intervalle configuré
  useEffect(() => {
    // Nettoyer l'intervalle existant
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (!isInternal) {
      return;
    }
    const intervalMinutes = config.dmsSyncInterval || 0;
    if (intervalMinutes <= 0) {
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    // Sync au montage si l'intervalle est configuré (avec délai de 2s)
    const initTimeout = setTimeout(() => {
      performAutoSync();
    }, 2000);

    // Configurer l'intervalle de sync
    syncIntervalRef.current = setInterval(() => {
      performAutoSync();
    }, intervalMs);

    return () => {
      clearTimeout(initTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isInternal, config.dmsSyncInterval, performAutoSync]);

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];
    let result = [...orders];
    const activeStatuses = [OrderStatus.PENDING, OrderStatus.VALIDATED, OrderStatus.PREPARATION];
    const historyStatuses = [OrderStatus.SHIPPED, OrderStatus.INVOICED, OrderStatus.CANCELLED];
    if (activeTab === 'ACTIVE') result = result.filter(o => activeStatuses.includes(o.status)); else result = result.filter(o => historyStatuses.includes(o.status));
    if (isInternal && clientFilter) result = result.filter(o => o.companyName === clientFilter);
    if (startDate) result = result.filter(o => o.date >= startDate);
    if (endDate) result = result.filter(o => o.date <= endDate);
    if (typeFilter !== 'ALL') result = result.filter(o => o.orderType === typeFilter);
    if (statusFilter !== 'ALL') result = result.filter(o => o.status === statusFilter);
    if (refFilter) result = result.filter(o => (o.dmsRef && o.dmsRef.toLowerCase().includes(refFilter.toLowerCase())) || o.id.includes(refFilter.toLowerCase()));
    if (minAmount) result = result.filter(o => o.totalAmount >= Number(minAmount));
    if (maxAmount) result = result.filter(o => o.totalAmount <= Number(maxAmount));
    result.sort((a, b) => { const aValue = a[sortConfig.key]; const bValue = b[sortConfig.key]; if (aValue === undefined || bValue === undefined) return 0; if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1; if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1; return 0; });
    return result;
  }, [orders, clientFilter, startDate, endDate, sortConfig, isInternal, typeFilter, statusFilter, refFilter, minAmount, maxAmount, activeTab]);

  const handleSort = (key: keyof Order) => setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const SortIcon = ({ columnKey }: { columnKey: keyof Order }) => (<span className={`ml-2 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-300'}`}>▼</span>);

  // Compute Modal Content
  const modalContent = useMemo(() => {
    if (!confirmAction) return { title: '', message: '', isDestructive: false, label: '' };
    if (confirmAction.status === OrderStatus.VALIDATED) {
      return {
        title: 'Valider la commande ?',
        message: 'Cette action transmettra la commande au système DMS pour préparation. Elle ne pourra plus être annulée par le client.',
        isDestructive: false,
        label: 'Valider et Transmettre'
      };
    }
    if (confirmAction.status === OrderStatus.CANCELLED) {
      return {
        title: 'Annuler la commande ?',
        message: 'Êtes-vous sûr de vouloir annuler cette commande ? Cette action est irréversible.',
        isDestructive: true,
        label: 'Annuler la commande'
      };
    }
    return { title: 'Confirmation', message: 'Confirmer cette action ?', isDestructive: false, label: 'Confirmer' };
  }, [confirmAction]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><div><h1 className="text-2xl font-bold text-slate-900">{isInternal ? 'Gestion des Commandes' : 'Mes Commandes'}</h1><p className="text-sm text-gray-500">Suivi global et gestion des expéditions.</p></div>{isInternal && (<button onClick={() => syncDmsMutation.mutate()} disabled={syncDmsMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed" title="Synchroniser avec le DMS pour détecter les BL et factures"><svg className={`w-5 h-5 ${syncDmsMutation.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span className="text-sm font-medium">{syncDmsMutation.isPending ? 'Synchronisation...' : 'Sync DMS'}</span></button>)}</div>
      <div className="border-b border-gray-200"><nav className="-mb-px flex space-x-8"><button onClick={() => setActiveTab('ACTIVE')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === 'ACTIVE' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><span className="bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs font-bold mr-2">{orders?.filter(o => [OrderStatus.PENDING, OrderStatus.VALIDATED, OrderStatus.PREPARATION].includes(o.status)).length}</span>Commandes en Cours</button><button onClick={() => setActiveTab('HISTORY')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === 'HISTORY' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Historique / Terminées</button></nav></div>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-end">
          <div className="col-span-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Période</label><div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200"><input type="date" className="text-xs border-none focus:ring-0 p-0 text-gray-700 bg-transparent w-full" value={startDate} onChange={e => setStartDate(e.target.value)} /><span className="text-gray-400">-</span><input type="date" className="text-xs border-none focus:ring-0 p-0 text-gray-700 bg-transparent w-full" value={endDate} onChange={e => setEndDate(e.target.value)} /></div></div>
          {isInternal && (<div className="col-span-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Client</label><select className="w-full bg-white border border-gray-300 text-slate-700 py-2 px-3 rounded-lg text-sm focus:ring-accent" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}><option value="">Tous les clients</option>{companies?.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>)}
          <div className="col-span-1 flex gap-2"><div className="flex-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Statut</label><select className="w-full bg-white border border-gray-300 text-slate-700 py-2 px-2 rounded-lg text-sm focus:ring-accent" value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | 'ALL')}><option value="ALL">Tout</option>{Object.entries(isInternal ? ORDER_STATUS_LABELS : ORDER_STATUS_LABELS_CLIENT).filter(([key]) => activeTab === 'ACTIVE' ? ['PENDING', 'VALIDATED', 'PREPARATION'].includes(key) : ['SHIPPED', 'INVOICED', 'CANCELLED'].includes(key)).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}</select></div><div className="w-1/3"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Type</label><select className="w-full bg-white border border-gray-300 text-slate-700 py-2 px-2 rounded-lg text-sm focus:ring-accent" value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'ALL')}><option value="ALL">Tout</option><option value="STOCK">Stock</option><option value="QUICK">Rapide</option></select></div></div>
          <div className="col-span-1"><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">N° Commande</label><input type="text" placeholder="Rechercher Ref..." className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-accent" value={refFilter} onChange={e => setRefFilter(e.target.value)} /></div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap"><thead className="bg-slate-50/80 border-b border-slate-100 backdrop-blur-sm"><tr><th className="w-8 px-6 py-4"></th>{isInternal && (<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none group" onClick={() => handleSort('companyName')}>Client <SortIcon columnKey="companyName" /></th>)}<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none group" onClick={() => handleSort('orderType')}>Type <SortIcon columnKey="orderType" /></th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none group" onClick={() => handleSort('dmsRef')}>Référence <SortIcon columnKey="dmsRef" /></th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none group" onClick={() => handleSort('date')}>Date <SortIcon columnKey="date" /></th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none group" onClick={() => handleSort('status')}>Statut <SortIcon columnKey="status" /></th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right cursor-pointer select-none group" onClick={() => handleSort('totalAmount')}>Montant HT <SortIcon columnKey="totalAmount" /></th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-50">{isLoading ? (<tr><td colSpan={isInternal ? 8 : 7} className="px-6 py-12 text-center text-slate-400">Chargement...</td></tr>) : filteredAndSortedOrders.length === 0 ? (<tr><td colSpan={isInternal ? 8 : 7} className="px-6 py-12 text-center text-slate-400">Aucune commande trouvée.</td></tr>) : filteredAndSortedOrders.map(order => (<React.Fragment key={order.id}><tr className={`hover:bg-blue-50/30 transition-all duration-200 cursor-pointer border-l-4 border-transparent ${expandedOrderId === order.id ? 'bg-blue-50/20 border-accent shadow-inner' : ''}`} onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}><td className="px-6 py-4 text-center"><div className={`p-1 rounded-full transition-colors ${expandedOrderId === order.id ? 'bg-accent/10 text-accent' : 'text-slate-300'}`}><svg className={`w-4 h-4 transition-transform duration-300 ${expandedOrderId === order.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></div></td>{isInternal && (<td className="px-6 py-4"><div className="font-bold text-sm text-brand-800">{order.companyName}</div><div className="text-[10px] text-slate-400 font-mono mt-0.5">{order.userEmail}</div></td>)}<td className="px-6 py-4">{order.orderType === 'QUICK' ? <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-[10px] font-bold border border-yellow-200"><span className="mr-1">⚡</span> RAPIDE</span> : <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-[10px] font-bold border border-gray-200"><span className="mr-1">📦</span> STOCK</span>}</td><td className="px-6 py-4"><div className="flex flex-col items-start gap-2">{order.dmsRef ? <span className="font-mono text-sm font-semibold text-brand-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{order.dmsRef}</span> : <span className="text-slate-400 italic text-xs font-medium">En attente ID</span>}<div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>{order.blNumber && (<span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-purple-50 text-purple-700 border-purple-200 flex items-center"><svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>BL: {order.blNumber}</span>)}{order.invoiceNumber && (<span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center"><svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Fact: {order.invoiceNumber}</span>)}{order.documents?.map((doc, idx) => (<button key={idx} onClick={() => alert(`Téléchargement ${doc.ref}`)} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center transition-all hover:shadow-sm ${doc.type === 'INVOICE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}><svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>{doc.ref}</button>))}</div></div></td><td className="px-6 py-4 text-sm text-slate-600 font-medium">{order.date}</td><td className="px-6 py-4"><span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${MODERN_STATUS_STYLES[order.status]} shadow-sm`}>{isInternal ? ORDER_STATUS_LABELS[order.status] : ORDER_STATUS_LABELS_CLIENT[order.status]}</span></td><td className="px-6 py-4 text-right"><span className="font-bold text-brand-900 text-base">{formatPrice(order.totalAmount)}</span></td><td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-2 items-center">{isInternal && (<button onClick={() => handlePrintPreparation(order.id)} title="Imprimer Bon de Préparation" className="text-slate-400 hover:text-brand-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg></button>)}{isInternal && order.status === OrderStatus.PENDING && (<><ValidationCooldownButton order={order} config={config} onValidate={() => setConfirmAction({ id: order.id, status: OrderStatus.VALIDATED })} isBeingEdited={order.isEditing || editingStatuses.has(order.id)} editingByUserName={editingStatuses.get(order.id)?.editingByUserName || (order as any).editingByUser?.fullName} /><button onClick={() => setConfirmAction({ id: order.id, status: OrderStatus.CANCELLED })} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 p-1.5 rounded-md shadow-sm transition-all active:scale-95 flex items-center justify-center" title="Rejeter la commande"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></>)}{isInternal && order.status === OrderStatus.VALIDATED && (<button onClick={() => openShipmentModal(order)} className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 p-1.5 rounded-md shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1" title="Expédier la commande"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg></button>)}{!isInternal && order.status === OrderStatus.PENDING && (<>{isClientAdmin && (<button onClick={() => setEditingOrder(order)} className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="Modifier"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>)}<button onClick={() => setConfirmAction({ id: order.id, status: OrderStatus.CANCELLED })} className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Annuler"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></>)}{isSysAdmin && (<button onClick={() => setDeleteOrderId(order.id)} className="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-md shadow-sm transition-all active:scale-95 flex items-center justify-center" title="Supprimer définitivement (SYSADMIN)"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>)}</div></td></tr>{expandedOrderId === order.id && (<tr className="bg-slate-50/50 shadow-inner"><td colSpan={isInternal ? 8 : 7} className="px-6 py-6"><div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-5xl ml-auto"><div className="bg-slate-50 border-b border-slate-100 px-6 py-3 flex justify-between items-center"><h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center"><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>Détail de la commande</h4><span className="text-xs font-mono text-slate-400">{order.itemCount} articles</span></div><div className="p-6">{order.items && order.items.length > 0 ? (<table className="w-full text-sm"><thead><tr className="text-slate-400 border-b border-slate-100"><th className="pb-3 text-left font-semibold text-xs uppercase tracking-wider w-1/2 pl-2">Désignation</th><th className="pb-3 text-center font-semibold text-xs uppercase tracking-wider">Qté</th><th className="pb-3 text-right font-semibold text-xs uppercase tracking-wider">P.U. HT</th><th className="pb-3 text-right font-semibold text-xs uppercase tracking-wider pr-2">Total HT</th></tr></thead><tbody className="divide-y divide-slate-50">{order.items.map((item, idx) => (<tr key={idx} className="hover:bg-slate-50/50"><td className="py-3 pl-2"><div className="font-semibold text-brand-800">{item.designation}</div><div className="text-xs text-slate-400 font-mono mt-0.5 bg-slate-100 inline-block px-1 rounded">{item.reference}</div></td><td className="py-3 text-center text-slate-600 font-medium">{item.quantity}</td><td className="py-3 text-right text-slate-600 font-mono">{formatPrice(item.unitPrice)}</td><td className="py-3 text-right font-bold text-brand-900 font-mono pr-2">{formatPrice(item.totalLine)}</td></tr>))}</tbody><tfoot className="border-t border-slate-100"><tr><td colSpan={3} className="pt-4 text-right text-xs font-bold text-slate-500 uppercase pr-4">Total Commande HT</td><td className="pt-4 text-right font-bold text-lg text-accent pr-2">{formatPrice(order.totalAmount)}</td></tr></tfoot></table>) : <p className="text-sm text-slate-400 italic text-center py-4">Aucun détail disponible.</p>}</div></div></td></tr>)}</React.Fragment>))}</tbody></table></div></div>
      <ConfirmModal isOpen={!!confirmAction} onClose={() => { setConfirmAction(null); setPrintOnValidate(false); }} onConfirm={() => confirmAction && updateStatusMutation.mutate(confirmAction)} title={modalContent.title} message={modalContent.message} isDestructive={modalContent.isDestructive} confirmLabel={modalContent.label} />
      <ConfirmModal isOpen={!!deleteOrderId} onClose={() => setDeleteOrderId(null)} onConfirm={() => deleteOrderId && deleteOrderMutation.mutate(deleteOrderId)} title="Supprimer définitivement cette commande ?" message="ATTENTION: Cette action est irréversible. La commande sera définitivement supprimée de la base de données, y compris tous ses articles et son historique. Cette action est réservée au Super Administrateur." isDestructive={true} confirmLabel="Supprimer définitivement" />

      {/* Modal d'expédition */}
      {shipmentOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Expédier la commande</h2>
                  <p className="text-purple-200 text-sm mt-1">{shipmentOrder.orderNumber || shipmentOrder.dmsRef} - {shipmentOrder.companyName}</p>
                </div>
                <button onClick={() => { setShipmentOrder(null); setShipmentItems({}); }} className="text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <p className="text-sm text-purple-700">
                  <strong>Sélectionnez les quantités livrées</strong> pour chaque article. Mettez 0 pour les articles non livrés.
                  Vous pouvez effectuer une livraison partielle.
                </p>
              </div>

              <div className="space-y-3">
                {shipmentOrder.items?.map((item, idx) => {
                  const itemId = item.id || `item-${idx}`;
                  const qtyDelivered = shipmentItems[itemId] ?? item.quantity;
                  const isPartial = qtyDelivered > 0 && qtyDelivered < item.quantity;
                  const isComplete = qtyDelivered === item.quantity;
                  const isNotDelivered = qtyDelivered === 0;

                  return (
                    <div key={itemId} className={`p-4 rounded-xl border-2 transition-all ${isComplete ? 'bg-green-50 border-green-300' : isPartial ? 'bg-amber-50 border-amber-300' : isNotDelivered ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{item.designation}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{item.reference}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="text-xs text-slate-400 uppercase font-bold">Commandé</p>
                            <p className="text-lg font-bold text-slate-700">{item.quantity}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-slate-400 uppercase font-bold">Livré</p>
                            <input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={qtyDelivered}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(item.quantity, parseInt(e.target.value) || 0));
                                setShipmentItems(prev => ({ ...prev, [itemId]: val }));
                              }}
                              className={`w-20 text-center text-lg font-bold rounded-lg border-2 px-2 py-1 focus:ring-2 focus:ring-purple-400 ${isComplete ? 'border-green-400 bg-green-100 text-green-800' : isPartial ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-gray-300 bg-white text-gray-700'}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => setShipmentItems(prev => ({ ...prev, [itemId]: item.quantity }))}
                              className={`px-2 py-1 rounded text-xs font-bold transition-all ${isComplete ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                              title="Tout livrer"
                            >
                              Tout
                            </button>
                            <button
                              onClick={() => setShipmentItems(prev => ({ ...prev, [itemId]: 0 }))}
                              className={`px-2 py-1 rounded text-xs font-bold transition-all ${isNotDelivered ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              title="Rien livrer"
                            >
                              Rien
                            </button>
                          </div>
                        </div>
                      </div>
                      {isPartial && (
                        <div className="mt-2 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded inline-block">
                          ⚠️ Livraison partielle ({qtyDelivered}/{item.quantity})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-semibold">{(Object.values(shipmentItems) as number[]).filter(q => q > 0).length}</span> sur <span className="font-semibold">{shipmentOrder.items?.length || 0}</span> articles à livrer
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShipmentOrder(null); setShipmentItems({}); }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmitShipment}
                  disabled={shipOrderMutation.isPending || (Object.values(shipmentItems) as number[]).every(q => q === 0)}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {shipOrderMutation.isPending ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Expédition...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                      Confirmer l'expédition
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
    