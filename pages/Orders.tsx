import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { ORDER_STATUS_LABELS, ORDER_STATUS_LABELS_CLIENT } from '../constants';
import { useAuth } from '../context/AuthContext';
import { UserRole, OrderStatus, Order, AppConfig, Product, ClientPrice } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { useConfig } from '../context/ConfigContext';
import { useTheme } from '../context/ThemeContext';
import { useOrderSocket } from '../hooks/useOrderSocket';

// Types pour le modal d'édition
interface EditOrderLine {
  id: string;
  product: Product;
  price: ClientPrice;
  quantity: number;
  availability: 'DISPONIBLE' | 'RUPTURE';
}

interface EditConflictState {
  existingLineId: string;
  productName: string;
  oldQty: number;
  newQty: number;
}

const ITEMS_PER_PAGE = 50;

type SortConfig = { key: keyof Order | 'dmsRef'; direction: 'asc' | 'desc'; };
type OrderTab = 'ACTIVE' | 'HISTORY';

const MODERN_STATUS_STYLES: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'bg-neon-orange/20 text-neon-orange border-neon-orange/30',
  [OrderStatus.VALIDATED]: 'bg-accent/20 text-accent border-accent/30',
  [OrderStatus.PREPARATION]: 'bg-neon-purple/20 text-neon-purple border-neon-purple/30',
  [OrderStatus.SHIPPED]: 'bg-neon-purple/20 text-neon-purple border-neon-purple/30',
  [OrderStatus.INVOICED]: 'bg-neon-green/20 text-neon-green border-neon-green/30',
  [OrderStatus.CANCELLED]: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
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
      <div className="bg-neon-orange/20 text-neon-orange p-1.5 rounded-md flex items-center justify-center cursor-not-allowed border border-neon-orange/30 min-w-[34px] transition-all animate-pulse" title={`En cours de modification par ${editingByUserName || 'le client'}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
    );
  }

  if (timeLeft > 0) return (
    <div className="bg-brand-800/60 text-slate-400 p-1.5 rounded-md flex items-center justify-center cursor-not-allowed border border-accent/20 min-w-[34px] transition-all" title={`Délai de sécurité : encore ${timeLeft} secondes avant validation`}>
      <span className="text-[10px] font-bold font-mono">{timeLeft}s</span>
    </div>
  );
  return (
    <button onClick={onValidate} className="bg-neon-green/20 hover:bg-neon-green/30 text-neon-green border border-neon-green/30 p-1.5 rounded-md shadow-sm transition-all active:scale-95 flex items-center justify-center animate-fadeIn" title="Valider la commande">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
    </button>
  );
};

// Helper pour calculer TVA et TTC d'une commande à partir des items
const calculateOrderTotals = (order: Order) => {
  if (!order.items || order.items.length === 0) {
    // Fallback si pas d'items: utiliser 20% par défaut
    return {
      totalHT: order.totalAmount,
      totalTVA: order.totalAmount * 0.20,
      totalTTC: order.totalAmount * 1.20
    };
  }

  let totalTVA = 0;
  order.items.forEach(item => {
    const lineHT = item.unitPrice * item.quantity;
    const tvaRate = item.tvaRate ?? 20; // Défaut 20% si pas spécifié
    totalTVA += lineHT * (tvaRate / 100);
  });

  return {
    totalHT: order.totalAmount,
    totalTVA,
    totalTTC: order.totalAmount + totalTVA
  };
};

export const Orders = () => {
  const { user, hasRole } = useAuth();
  const { formatPrice, formatPriceWithCurrency, config } = useConfig();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isInternal = hasRole([UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN]);
  const isSysAdmin = hasRole([UserRole.SYSTEM_ADMIN]);
  const isClientAdmin = hasRole([UserRole.CLIENT_ADMIN]);
  const isClient = hasRole([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]);

  // WebSocket pour les notifications temps réel d'édition de commandes
  const { editingStatuses } = useOrderSocket({
    onEditingStatusChange: () => {
      // Rafraîchir la liste des commandes quand le statut d'édition change
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onOrderUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  // Modal pour choisir le type de commande
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);

  const [activeTab, setActiveTab] = useState<OrderTab>('ACTIVE');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
  const [confirmAction, setConfirmAction] = useState<{ id: string, status: OrderStatus } | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [printOnValidate, setPrintOnValidate] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // État pour le modal d'édition - même structure que QuickOrder
  const [editLines, setEditLines] = useState<EditOrderLine[]>([]);
  const [editSearchRef, setEditSearchRef] = useState('');
  const [editSearchDesig, setEditSearchDesig] = useState('');
  const [editSearchOEM, setEditSearchOEM] = useState('');
  const [editSelectedProduct, setEditSelectedProduct] = useState<Product | null>(null);
  const [editActivePrice, setEditActivePrice] = useState<ClientPrice | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editShowDropdown, setEditShowDropdown] = useState(false);
  const [editHighlightedIndex, setEditHighlightedIndex] = useState(0);
  const [editConflict, setEditConflict] = useState<EditConflictState | null>(null);

  // État pour la modale de confirmation de fermeture (remplace les alertes natives)
  const [showCloseConfirm, setShowCloseConfirm] = useState<'refresh' | 'quit' | null>(null);

  // Refs pour le modal d'édition
  const editQtyInputRef = useRef<HTMLInputElement>(null);
  const editSearchRefInputRef = useRef<HTMLInputElement>(null);
  const editDropdownRef = useRef<HTMLDivElement>(null);

  // Recherche de produits pour le modal d'édition
  const editHasSearch = editSearchRef.length > 1 || editSearchDesig.length > 2 || editSearchOEM.length > 1;

  const { data: editSearchResults, isFetching: editIsFetching } = useQuery({
    queryKey: ['edit-quick-search', editSearchRef, editSearchDesig, editSearchOEM],
    queryFn: async () => {
      const result = await api.searchProducts({
        ref: editSearchRef || undefined,
        desig: editSearchDesig || undefined,
        origine: editSearchOEM || undefined,
        limit: 20,
      });
      return result.data;
    },
    enabled: editHasSearch && !editSelectedProduct && !!editingOrder,
  });

  // Mutation pour verrouiller/déverrouiller la commande en édition
  const setEditingMutation = useMutation({
    mutationFn: ({ id, isEditing }: { id: string; isEditing: boolean }) => api.setOrderEditing(id, isEditing),
    onError: () => {
      toast.error('Erreur lors du verrouillage de la commande');
    },
  });

  // Ref pour garder trace de l'ID de la commande en cours d'édition (pour beforeunload)
  const editingOrderIdRef = useRef<string | null>(null);

  // Mettre à jour la ref quand editingOrder change
  useEffect(() => {
    editingOrderIdRef.current = editingOrder?.id || null;
  }, [editingOrder]);

  // Libérer le verrou quand l'utilisateur quitte ou rafraîchit la page
  useEffect(() => {
    const releaseEditingLock = async () => {
      if (editingOrderIdRef.current) {
        try {
          // Utiliser fetch avec keepalive pour tenter d'envoyer même pendant fermeture
          const backendUrl = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4001`;
          await fetch(`${backendUrl}/api/orders/${editingOrderIdRef.current}/editing`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({ isEditing: false }),
            keepalive: true,
          });
        } catch (e) {
          // Ignore errors when releasing editing lock
        }
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (editingOrderIdRef.current) {
        releaseEditingLock();
        // Afficher une alerte de confirmation pour donner le temps à la requête
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handleVisibilityChange = () => {
      // Si la page devient cachée (onglet fermé, navigation), libérer le verrou
      if (document.visibilityState === 'hidden' && editingOrderIdRef.current) {
        releaseEditingLock();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Quand on ouvre le modal d'édition, convertir les items existants en EditOrderLine
  // ET signaler au backend que le client est en train de modifier
  useEffect(() => {
    if (editingOrder && editingOrder.items) {
      // Signaler au backend que le client est en train de modifier
      setEditingMutation.mutate({ id: editingOrder.id, isEditing: true });

      const convertedLines: EditOrderLine[] = editingOrder.items.map((item: any, index: number) => ({
        id: `existing-${index}-${Date.now()}`,
        product: {
          reference: item.productRef || item.reference,
          designation: item.productName || item.designation,
          priceHT: item.unitPrice,
          pricePublic: item.unitPrice,
          stock: item.availability === 'DISPONIBLE' ? 1 : 0,
          tvaRate: item.tvaRate || 7,
          codeOrigine: item.codeOEM || '',
        } as Product,
        price: {
          reference: item.productRef || item.reference,
          priceHT: item.unitPrice,
          publicPrice: item.unitPrice,
          netPrice: item.unitPrice,
          discountPercent: 0,
          discountPercentage: 0,
          tvaRate: item.tvaRate || 7,
          tvaCode: null,
        },
        quantity: item.quantity,
        availability: item.availability || 'DISPONIBLE',
      }));
      setEditLines(convertedLines);
    }
  }, [editingOrder]);

  // Calculer le prix quand un produit est sélectionné
  useEffect(() => {
    if (editSelectedProduct) {
      const priceHT = editSelectedProduct.priceHT || editSelectedProduct.pricePublic || 0;
      const clientDiscount = user?.globalDiscount || 0;
      const netPrice = priceHT * (1 - clientDiscount / 100);

      setEditActivePrice({
        reference: editSelectedProduct.reference,
        priceHT,
        publicPrice: priceHT,
        netPrice,
        discountPercent: clientDiscount,
        discountPercentage: clientDiscount,
        tvaRate: editSelectedProduct.tvaRate ?? null,
        tvaCode: editSelectedProduct.codeTva || editSelectedProduct.tvaCode || null,
      });

      setTimeout(() => {
        editQtyInputRef.current?.focus();
        editQtyInputRef.current?.select();
      }, 50);
      setEditShowDropdown(false);
    } else {
      setEditActivePrice(null);
    }
  }, [editSelectedProduct, user?.globalDiscount]);

  // Afficher le dropdown quand on a des résultats
  useEffect(() => {
    if (editSearchResults && editSearchResults.length > 0 && editHasSearch && !editSelectedProduct) {
      setEditShowDropdown(true);
      setEditHighlightedIndex(0);
    } else if (!editHasSearch) {
      setEditShowDropdown(false);
    }
  }, [editSearchResults, editHasSearch, editSelectedProduct]);

  // Scroll l'élément surligné dans la vue
  useEffect(() => {
    if (editShowDropdown && editDropdownRef.current && editSearchResults && editSearchResults.length > 0) {
      const highlightedElement = editDropdownRef.current.children[editHighlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [editHighlightedIndex, editShowDropdown, editSearchResults]);

  // Navigation clavier pour la recherche
  const handleEditSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!editShowDropdown || !editSearchResults || editSearchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setEditHighlightedIndex(prev => (prev < editSearchResults.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setEditHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (editSearchResults[editHighlightedIndex]) {
          handleEditSelectProduct(editSearchResults[editHighlightedIndex]);
        }
        break;
      case 'Escape':
        setEditShowDropdown(false);
        break;
    }
  };

  // Navigation clavier pour la quantité
  const handleEditQtyKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setEditQuantity(prev => prev + 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setEditQuantity(prev => (prev > 1 ? prev - 1 : 1));
        break;
      case 'Enter':
        e.preventDefault();
        addEditLine();
        break;
    }
  };

  // Sélectionner un produit
  const handleEditSelectProduct = (p: Product) => {
    setEditSelectedProduct(p);
    setEditSearchRef(p.reference);
    setEditSearchDesig(p.designation);
    setEditSearchOEM(p.codeOrigine || '');
    setEditShowDropdown(false);
  };

  // Réinitialiser les champs de recherche
  const resetEditInput = () => {
    setEditSearchRef('');
    setEditSearchDesig('');
    setEditSearchOEM('');
    setEditSelectedProduct(null);
    setEditActivePrice(null);
    setEditQuantity(1);
    setEditShowDropdown(false);
    setEditHighlightedIndex(0);
    setTimeout(() => editSearchRefInputRef.current?.focus(), 50);
  };

  // Effacer un champ de recherche
  const clearEditSearch = (field: 'ref' | 'desig' | 'oem') => {
    if (field === 'ref') setEditSearchRef('');
    if (field === 'desig') setEditSearchDesig('');
    if (field === 'oem') setEditSearchOEM('');
    setEditSelectedProduct(null);
  };

  // Ajouter une ligne
  const addEditLine = () => {
    if (editSelectedProduct && editActivePrice && editQuantity > 0) {
      // Vérifier les doublons
      const existingLine = editLines.find(l => l.product.reference === editSelectedProduct.reference);

      if (existingLine) {
        setEditConflict({
          existingLineId: existingLine.id,
          productName: editSelectedProduct.reference + ' - ' + editSelectedProduct.designation,
          oldQty: existingLine.quantity,
          newQty: editQuantity
        });
        return;
      }

      const newLine: EditOrderLine = {
        id: Date.now().toString(),
        product: editSelectedProduct,
        price: editActivePrice,
        quantity: editQuantity,
        availability: editSelectedProduct.stock > 0 ? 'DISPONIBLE' : 'RUPTURE'
      };
      setEditLines([...editLines, newLine]);
      resetEditInput();
    }
  };

  // Résolution des conflits
  const handleEditResolveConflict = (action: 'CANCEL' | 'REPLACE' | 'ADD') => {
    if (!editConflict) return;

    if (action === 'CANCEL') {
      // Ne rien faire
    } else if (action === 'REPLACE') {
      setEditLines(editLines.map(l => l.id === editConflict.existingLineId ? { ...l, quantity: editConflict.newQty } : l));
      resetEditInput();
    } else if (action === 'ADD') {
      setEditLines(editLines.map(l => l.id === editConflict.existingLineId ? { ...l, quantity: l.quantity + editConflict.newQty } : l));
      resetEditInput();
    }

    setEditConflict(null);
  };

  // Gestion clavier pour le modal de conflit
  useEffect(() => {
    if (!editConflict) return;

    const timeoutId = setTimeout(() => {
      const handleConflictKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
          case 'a':
          case 'A':
          case 'Enter':
            e.preventDefault();
            setEditLines(prev => prev.map(l => l.id === editConflict.existingLineId ? { ...l, quantity: l.quantity + editConflict.newQty } : l));
            setEditConflict(null);
            resetEditInput();
            break;
          case 'r':
          case 'R':
            e.preventDefault();
            setEditLines(prev => prev.map(l => l.id === editConflict.existingLineId ? { ...l, quantity: editConflict.newQty } : l));
            setEditConflict(null);
            resetEditInput();
            break;
          case 'Escape':
            e.preventDefault();
            setEditConflict(null);
            break;
        }
      };

      window.addEventListener('keydown', handleConflictKeyDown);
      (window as any).__editConflictCleanup = () => window.removeEventListener('keydown', handleConflictKeyDown);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if ((window as any).__editConflictCleanup) {
        (window as any).__editConflictCleanup();
        delete (window as any).__editConflictCleanup;
      }
    };
  }, [editConflict]);

  // Supprimer une ligne
  const removeEditLine = (id: string) => {
    setEditLines(editLines.filter(l => l.id !== id));
  };

  // Obtenir le taux TVA
  const getEditTvaRatePercent = (line: EditOrderLine): number | null => {
    const raw = line?.product?.tvaRate ?? line?.price?.tvaRate;
    if (raw === null || raw === undefined) return null;
    const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (!Number.isFinite(num)) return null;
    return num;
  };

  // Sauvegarder les modifications
  const handleSaveEdit = () => {
    if (editingOrder && editLines.length > 0) {
      // Convertir les lignes en format attendu par l'API
      const orderItems = editLines.map(l => ({
        productRef: l.product.reference,
        reference: l.product.reference,
        productName: l.product.designation,
        designation: l.product.designation,
        quantity: l.quantity,
        unitPrice: l.price.netPrice,
        lineTotal: l.price.netPrice * l.quantity,
        totalLine: l.price.netPrice * l.quantity,
        tvaRate: getEditTvaRatePercent(l) || 7,
        availability: l.availability,
        codeOEM: l.product.codeOrigine || '',
      }));
      updateOrderContentMutation.mutate({ id: editingOrder.id, items: orderItems });
    }
  };

  // Demander confirmation avant de fermer le modal (affiche une modale personnalisée)
  const requestCloseEditModal = (reason: 'refresh' | 'quit') => {
    // Si des modifications ont été apportées, demander confirmation
    if (editLines.length > 0) {
      setShowCloseConfirm(reason);
    } else {
      // Pas de modifications, fermer directement
      closeEditModalDirectly();
    }
  };

  // Fermer le modal directement (appelé après confirmation ou si pas de modifications)
  const closeEditModalDirectly = () => {
    setShowCloseConfirm(null);
    // Déverrouiller la commande quand on ferme le modal
    if (editingOrder) {
      setEditingMutation.mutate({ id: editingOrder.id, isEditing: false });
    }
    setEditingOrder(null);
    setEditLines([]);
    resetEditInput();
  };

  // Annuler la fermeture (rester sur le modal d'édition)
  const cancelCloseEditModal = () => {
    setShowCloseConfirm(null);
  };

  // Fermer le modal et réinitialiser (legacy, pour compatibilité)
  const closeEditModal = () => {
    requestCloseEditModal('quit');
  };

  // Calculs pour le récapitulatif
  const editTotalHT = editLines.reduce((acc, l) => acc + (l.price.netPrice * l.quantity), 0);
  const editTvaGroups: Record<string, { rate: number; vat: number }> = {};
  editLines.forEach(line => {
    const rate = getEditTvaRatePercent(line);
    if (rate === null) return;
    const ht = line.price.netPrice * line.quantity;
    const vat = ht * (rate / 100);
    const key = `${rate}`;
    editTvaGroups[key] = {
      rate,
      vat: (editTvaGroups[key]?.vat || 0) + vat,
    };
  });
  const editTotalTVA = Object.values(editTvaGroups).reduce((sum, g) => sum + g.vat, 0);
  const editTotalTTC = editTotalHT + editTotalTVA;

  // Column filtering state
  const [filters, setFilters] = useState({
    companyName: '',
    orderType: '' as '' | 'STOCK' | 'QUICK',
    dmsRef: '',
    date: '',
    status: '' as '' | OrderStatus,
    totalAmount: '',
  });

  // Date range filter
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Infinite scroll state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { data: companies } = useQuery({ queryKey: ['admin-companies'], queryFn: api.admin.getCompanies, enabled: isInternal });
  const { data: orders, isLoading } = useQuery({ queryKey: ['orders', isInternal ? 'all' : user?.companyName], queryFn: () => api.getOrders(isInternal ? undefined : user?.companyName), refetchInterval: 5000 });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: OrderStatus }) => api.updateOrderStatus(id, status),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (variables.status === OrderStatus.VALIDATED) {
        toast.success("Commande validée et transférée au DMS avec succès !");
        if (printOnValidate) handlePrintPreparation(variables.id);
      } else if (variables.status === OrderStatus.CANCELLED) {
        toast.success("Commande annulée.");
      } else {
        toast.success("Statut mis à jour.");
      }
      setPrintOnValidate(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erreur lors de la mise à jour du statut");
    }
  });

  const updateOrderContentMutation = useMutation({
    mutationFn: ({ id, items }: { id: string, items: any[] }) => api.updateOrder(id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditingOrder(null);
      toast.success("Commande mise à jour avec succès.");
    }
  });

  const syncDmsMutation = useMutation({
    mutationFn: () => api.admin.syncDmsOrders(),
    onSuccess: (result: { synced: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.synced > 0) {
        toast.success(result.message);
      } else {
        toast(result.message, { icon: 'ℹ️' });
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la synchronisation');
    }
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: string) => api.deleteOrder(orderId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(result.message || 'Commande supprimée avec succès');
      setDeleteOrderId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  });

  // Référence pour la fonction de sync automatique
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fonction de sync silencieuse (pas de toast sauf si données synchronisées)
  const performAutoSync = useCallback(async () => {
    try {
      const result = await api.admin.syncDmsOrders();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.synced > 0) {
        toast.success(`${result.synced} commande(s) synchronisée(s) avec le DMS`);
      }
    } catch (error: any) {
      // Silently ignore auto-sync errors
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

    // Sync au montage avec délai de 2s
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

  const handlePrintPreparation = async (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    if (!order) {
      toast.error("Commande non trouvée.");
      return;
    }

    // Récupérer les positions des articles depuis le DMS
    let positionsMap: Record<string, string> = {};
    try {
      positionsMap = await api.getOrderPositions(orderId);
    } catch (err) {
      // Continue without positions
    }

    // Récupérer les valeurs avec fallback
    const orderNum = order.orderNumber || order.dmsRef || order.id.slice(0, 8);
    const orderDate = order.createdAt || order.date;
    const formattedDate = orderDate ? new Date(orderDate).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '-';
    const printedBy = user?.fullName || user?.email || 'Utilisateur';
    const createdBy = order.createdByUser?.fullName || order.userEmail || '-';

    // Générer le contenu HTML du bon de préparation
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bon de Préparation - ${orderNum}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
          .header h1 { font-size: 18px; margin-bottom: 5px; }
          .header h2 { font-size: 14px; color: #666; font-weight: normal; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-block { width: 48%; }
          .info-block h3 { font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 8px; }
          .info-block p { margin: 3px 0; }
          .info-block strong { display: inline-block; width: 100px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #333; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .qty-col { width: 60px; text-align: center; }
          .ref-col { width: 120px; }
          .check-col { width: 50px; text-align: center; }
          .pos-col { width: 100px; }
          .total-row { font-weight: bold; background-color: #f9f9f9; }
          .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; }
          .signature-section { display: flex; justify-content: space-between; margin-top: 40px; }
          .signature-block { width: 45%; }
          .signature-block p { border-bottom: 1px solid #333; padding-top: 30px; }
          .notes { margin-top: 15px; padding: 10px; background-color: #f9f9f9; border: 1px solid #ddd; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${config?.companyName || 'MECACOMM'}</h1>
          <h2>BON DE PRÉPARATION / PICKING</h2>
        </div>

        <div class="info-section">
          <div class="info-block">
            <h3>Informations Commande</h3>
            <p><strong>N° Commande:</strong> ${orderNum}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Statut:</strong> ${isInternal ? ORDER_STATUS_LABELS[order.status] : ORDER_STATUS_LABELS_CLIENT[order.status]}</p>
            ${order.vehicleInfo ? `<p><strong>Véhicule:</strong> ${order.vehicleInfo}</p>` : ''}
            ${order.dmsRef ? `<p><strong>Réf. DMS:</strong> ${order.dmsRef}</p>` : ''}
          </div>
          <div class="info-block">
            <h3>Client</h3>
            <p><strong>Entreprise:</strong> ${order.companyName || '-'}</p>
            <p><strong>Créée par:</strong> ${createdBy}</p>
            <p><strong>Imprimé par:</strong> ${printedBy}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="check-col">✓</th>
              <th class="ref-col">Référence</th>
              <th>Désignation</th>
              <th class="qty-col">Qté</th>
              <th class="pos-col">Emplacement</th>
            </tr>
          </thead>
          <tbody>
            ${order.items?.map((item: { productRef?: string; reference?: string; productName?: string; designation?: string; quantity: number; location?: string }) => {
              const ref = item.productRef || item.reference || '';
              const position = positionsMap[ref] || item.location || '-';
              return `
              <tr>
                <td class="check-col">☐</td>
                <td class="ref-col">${ref || '-'}</td>
                <td>${item.productName || item.designation || '-'}</td>
                <td class="qty-col"><strong>${item.quantity}</strong></td>
                <td class="pos-col">${position}</td>
              </tr>
            `;}).join('') || '<tr><td colspan="5">Aucun article</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3" style="text-align: right;">Total articles:</td>
              <td class="qty-col">${order.items?.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0) || 0}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        ${order.clientNotes ? `
          <div class="notes">
            <strong>Notes client:</strong> ${order.clientNotes}
          </div>
        ` : ''}

        ${order.vehicleInfo ? `
          <div class="notes">
            <strong>Véhicule:</strong> ${order.vehicleInfo}
          </div>
        ` : ''}

        <div class="signature-section">
          <div class="signature-block">
            <p>Préparé par: _________________</p>
          </div>
          <div class="signature-block">
            <p>Date: _________________</p>
          </div>
        </div>

        <div class="footer" style="text-align: center; font-size: 10px; color: #666;">
          Imprimé le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} par ${printedBy}
        </div>
      </body>
      </html>
    `;

    // Ouvrir une nouvelle fenêtre et déclencher l'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      // Attendre que le contenu soit chargé avant d'imprimer
      setTimeout(() => {
        printWindow.print();
      }, 250);
    } else {
      toast.error("Impossible d'ouvrir la fenêtre d'impression. Vérifiez les paramètres du navigateur.");
    }
  };

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];
    let result = [...orders];
    const activeStatuses = [OrderStatus.PENDING, OrderStatus.VALIDATED, OrderStatus.PREPARATION];
    const historyStatuses = [OrderStatus.SHIPPED, OrderStatus.INVOICED, OrderStatus.CANCELLED];

    if (activeTab === 'ACTIVE') {
      result = result.filter(o => activeStatuses.includes(o.status));
    } else {
      result = result.filter(o => historyStatuses.includes(o.status));
    }

    // Column filters
    if (isInternal && filters.companyName) {
      result = result.filter(o => o.companyName.toLowerCase().includes(filters.companyName.toLowerCase()));
    }
    if (filters.orderType) {
      result = result.filter(o => o.orderType === filters.orderType);
    }
    if (filters.dmsRef) {
      result = result.filter(o => (o.dmsRef && o.dmsRef.toLowerCase().includes(filters.dmsRef.toLowerCase())) || o.id.toLowerCase().includes(filters.dmsRef.toLowerCase()));
    }
    if (filters.date) {
      result = result.filter(o => o.date.includes(filters.date));
    }
    if (filters.status) {
      result = result.filter(o => o.status === filters.status);
    }
    if (filters.totalAmount) {
      const amountFilter = parseFloat(filters.totalAmount);
      if (!isNaN(amountFilter)) {
        result = result.filter(o => o.totalAmount >= amountFilter);
      }
    }

    // Date range filter
    if (startDate) result = result.filter(o => o.date >= startDate);
    if (endDate) result = result.filter(o => o.date <= endDate);

    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [orders, filters, startDate, endDate, sortConfig, isInternal, activeTab]);

  // Orders to display (with infinite scroll pagination)
  const displayedOrders = useMemo(() => {
    return filteredAndSortedOrders.slice(0, displayCount);
  }, [filteredAndSortedOrders, displayCount]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [filters, startDate, endDate, activeTab]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (displayCount < filteredAndSortedOrders.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredAndSortedOrders.length));
      }
    }
  }, [displayCount, filteredAndSortedOrders.length]);

  // Auto-load more if container doesn't overflow
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const checkAndLoadMore = () => {
      const { scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight && displayCount < filteredAndSortedOrders.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredAndSortedOrders.length));
      }
    };

    const timer = setTimeout(checkAndLoadMore, 100);
    return () => clearTimeout(timer);
  }, [displayCount, filteredAndSortedOrders.length]);

  const handleSort = (key: keyof Order) => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof Order }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-300'}`}>▼</span>
  );

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

  // Dynamic table height
  const tableHeight = 'calc(100vh - 290px)';

  const hasActiveFilters = Object.values(filters).some(f => f !== '') || startDate || endDate;

  // Get status options based on active tab
  const getStatusOptions = () => {
    if (activeTab === 'ACTIVE') {
      return [OrderStatus.PENDING, OrderStatus.VALIDATED, OrderStatus.PREPARATION];
    }
    return [OrderStatus.SHIPPED, OrderStatus.INVOICED, OrderStatus.CANCELLED];
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{isInternal ? 'Gestion des Commandes' : 'Mes Commandes'}</h1>
          <p className="text-sm text-slate-400">Suivi global et gestion des expéditions.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          {/* Bouton Sync DMS pour les admins */}
          {isInternal && (
            <button
              onClick={() => syncDmsMutation.mutate()}
              disabled={syncDmsMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-neon-purple/20 hover:bg-neon-purple/30 text-neon-purple border border-neon-purple/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Synchroniser avec le DMS pour détecter les BL et factures"
            >
              <svg className={`w-5 h-5 ${syncDmsMutation.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm font-medium">{syncDmsMutation.isPending ? 'Sync...' : 'Sync DMS'}</span>
            </button>
          )}

          {/* Bouton Nouvelle Commande pour les clients */}
          {isClient && (
            <button
              onClick={() => setShowOrderTypeModal(true)}
              className="flex items-center px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg shadow-glow btn-glow transition-all font-medium text-sm"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle Commande
            </button>
          )}

          <div className="flex items-center space-x-2 glass-light p-1 rounded-lg border border-accent/20">
            <input type="date" className="text-xs border-none focus:ring-0 p-1 text-slate-300 bg-transparent" value={startDate} onChange={e => setStartDate(e.target.value)} title="Date début" />
            <span className="text-slate-500">-</span>
            <input type="date" className="text-xs border-none focus:ring-0 p-1 text-slate-300 bg-transparent" value={endDate} onChange={e => setEndDate(e.target.value)} title="Date fin" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-accent/10 mb-4">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === 'ACTIVE' ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-white hover:border-accent/30'}`}
          >
            <span className="bg-accent/20 text-accent py-0.5 px-2 rounded-full text-xs font-bold mr-2 border border-accent/30">
              {orders?.filter(o => [OrderStatus.PENDING, OrderStatus.VALIDATED, OrderStatus.PREPARATION].includes(o.status)).length}
            </span>
            Commandes en Cours
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === 'HISTORY' ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-white hover:border-accent/30'}`}
          >
            Historique / Terminées
          </button>
        </nav>
      </div>

      {/* Table */}
      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)', maxHeight: 'calc(100vh - 280px)' }}>
        {/* Fixed header with filters */}
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full text-left table-fixed" style={{ minWidth: '1000px' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              {isInternal && <col style={{ width: '180px' }} />}
              <col style={{ width: '100px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              {/* Header row with sort */}
              <tr>
                <th className="px-2 py-3"></th>
                {isInternal && (
                  <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('companyName')}>
                    Client <SortIcon columnKey="companyName" />
                  </th>
                )}
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('orderType')}>
                  Type <SortIcon columnKey="orderType" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('dmsRef')}>
                  Référence <SortIcon columnKey="dmsRef" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('date')}>
                  Date <SortIcon columnKey="date" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('status')}>
                  Statut <SortIcon columnKey="status" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('totalAmount')}>
                  Montant HT <SortIcon columnKey="totalAmount" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                  Montant TVA
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                  Montant TTC
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
              {/* Filter row */}
              <tr className="bg-brand-900/40">
                <th className="px-2 py-2"></th>
                {isInternal && (
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      placeholder="Filtrer..."
                      value={filters.companyName}
                      onChange={e => setFilters(f => ({ ...f, companyName: e.target.value }))}
                      className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                    />
                  </th>
                )}
                <th className="px-3 py-2">
                  <select
                    value={filters.orderType}
                    onChange={e => setFilters(f => ({ ...f, orderType: e.target.value as '' | 'STOCK' | 'QUICK' }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  >
                    <option value="">Tous</option>
                    <option value="STOCK">Stock</option>
                    <option value="QUICK">Rapide</option>
                  </select>
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.dmsRef}
                    onChange={e => setFilters(f => ({ ...f, dmsRef: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="date"
                    value={filters.date}
                    onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filters.status}
                    onChange={e => setFilters(f => ({ ...f, status: e.target.value as '' | OrderStatus }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  >
                    <option value="">Tous</option>
                    {getStatusOptions().map(status => (
                      <option key={status} value={status}>{isInternal ? ORDER_STATUS_LABELS[status] : ORDER_STATUS_LABELS_CLIENT[status]}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Min..."
                    value={filters.totalAmount}
                    onChange={e => setFilters(f => ({ ...f, totalAmount: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable table body */}
        <div
          ref={tableContainerRef}
          onScroll={handleScroll}
          className="overflow-y-auto flex-1 overflow-x-auto"
        >
          <table className="w-full text-left table-fixed" style={{ minWidth: '1000px' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              {isInternal && <col style={{ width: '180px' }} />}
              <col style={{ width: '100px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? (
                <tr><td colSpan={isInternal ? 10 : 9} className="px-6 py-12 text-center text-slate-500">Chargement...</td></tr>
              ) : filteredAndSortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={isInternal ? 10 : 9} className="text-center py-12">
                    <div className="text-slate-500">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <p className="font-medium text-slate-400">Aucune commande trouvée</p>
                      <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
                    </div>
                  </td>
                </tr>
              ) : displayedOrders.map(order => (
                <React.Fragment key={order.id}>
                  <tr
                    className={`hover:bg-brand-800/40 transition-all duration-200 cursor-pointer border-l-4 border-transparent ${expandedOrderId === order.id ? 'bg-accent/10 border-accent' : ''}`}
                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                  >
                    <td className="px-2 py-3 text-center">
                      <div className={`p-1 rounded-full transition-colors ${expandedOrderId === order.id ? 'bg-accent/20 text-accent' : 'text-slate-500'}`}>
                        <svg className={`w-4 h-4 transition-transform duration-300 ${expandedOrderId === order.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </td>
                    {isInternal && (
                      <td className="px-3 py-3">
                        <div className="font-bold text-sm text-white truncate" title={order.companyName}>{order.companyName}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate" title={order.userEmail}>{order.userEmail}</div>
                      </td>
                    )}
                    <td className="px-3 py-3">
                      {order.orderType === 'QUICK' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-neon-orange/20 text-neon-orange text-[10px] font-bold border border-neon-orange/30">
                          <span className="mr-1">⚡</span> RAPIDE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-brand-800/60 text-slate-300 text-[10px] font-bold border border-accent/20">
                          <span className="mr-1">📦</span> STOCK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {order.dmsRef ? (
                          <span className="font-mono text-sm font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20 truncate" title={order.dmsRef}>{order.dmsRef}</span>
                        ) : (
                          <span className="text-slate-500 italic text-xs font-medium">En attente ID</span>
                        )}
                        <div className="flex gap-1 flex-wrap">
                          {order.blNumber && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neon-purple/20 text-neon-purple border border-neon-purple/30 flex items-center">
                              <svg className="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              BL: {order.blNumber}
                            </span>
                          )}
                          {order.invoiceNumber && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neon-green/20 text-neon-green border border-neon-green/30 flex items-center">
                              <svg className="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Fact: {order.invoiceNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-400 font-medium">{order.date}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${MODERN_STATUS_STYLES[order.status]} shadow-sm`}>
                        {isInternal ? ORDER_STATUS_LABELS[order.status] : ORDER_STATUS_LABELS_CLIENT[order.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-bold text-accent text-sm">{formatPriceWithCurrency(order.totalAmount)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-medium text-slate-400 text-sm">{formatPriceWithCurrency(calculateOrderTotals(order).totalTVA)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-bold text-neon-green text-sm">{formatPriceWithCurrency(calculateOrderTotals(order).totalTTC)}</span>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1 items-center">
                        {isInternal && (
                          <button onClick={() => handlePrintPreparation(order.id)} title="Imprimer Bon de Préparation" className="text-slate-500 hover:text-accent p-1 rounded-md hover:bg-brand-800/60 transition-colors border border-transparent hover:border-accent/20">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                        )}
                        {isInternal && order.status === OrderStatus.PENDING && (
                          <>
                            <ValidationCooldownButton order={order} config={config} onValidate={() => setConfirmAction({ id: order.id, status: OrderStatus.VALIDATED })} isBeingEdited={order.isEditing || editingStatuses.has(order.id)} editingByUserName={editingStatuses.get(order.id)?.editingByUserName || order.editingByUser?.fullName} />
                            <button
                              onClick={() => setConfirmAction({ id: order.id, status: OrderStatus.CANCELLED })}
                              className="bg-neon-pink/20 hover:bg-neon-pink/30 text-neon-pink border border-neon-pink/30 p-1 rounded-md shadow-sm transition-all active:scale-95 flex items-center justify-center"
                              title="Rejeter la commande"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                        {!isInternal && order.status === OrderStatus.PENDING && (
                          <>
                            {isClientAdmin && (
                              <button onClick={() => setEditingOrder(order)} className="text-accent hover:text-accent-hover p-1 hover:bg-accent/10 rounded-lg transition-colors" title="Modifier">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmAction({ id: order.id, status: OrderStatus.CANCELLED })}
                              className="text-neon-pink hover:text-neon-pink/80 p-1 hover:bg-neon-pink/10 rounded-lg transition-colors"
                              title="Annuler"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                        {isSysAdmin && (
                          <button
                            onClick={() => setDeleteOrderId(order.id)}
                            className="p-1.5 text-neon-pink hover:bg-neon-pink/10 rounded transition-all"
                            title="Supprimer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedOrderId === order.id && (
                    <tr className="bg-brand-900/30">
                      <td colSpan={isInternal ? 10 : 9} className="px-6 py-6">
                        <div className="card-futuristic rounded-xl border border-accent/20 overflow-hidden shadow-card max-w-5xl ml-auto">
                          <div className="bg-brand-900/50 border-b border-accent/10 px-6 py-3 flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Détail de la commande
                            </h4>
                            <span className="text-xs font-mono text-slate-500">{order.itemCount} articles</span>
                          </div>
                          <div className="p-6">
                            {order.items && order.items.length > 0 ? (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-slate-500 border-b border-accent/10">
                                    <th className="pb-3 text-left font-semibold text-xs uppercase tracking-wider pl-2">Désignation</th>
                                    <th className="pb-3 text-center font-semibold text-xs uppercase tracking-wider">Dispo.</th>
                                    <th className="pb-3 text-center font-semibold text-xs uppercase tracking-wider">Qté</th>
                                    <th className="pb-3 text-right font-semibold text-xs uppercase tracking-wider">P.U. HT</th>
                                    <th className="pb-3 text-right font-semibold text-xs uppercase tracking-wider">Total HT</th>
                                    <th className="pb-3 text-center font-semibold text-xs uppercase tracking-wider pr-2">TVA</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-accent/10">
                                  {order.items.map((item: any, idx) => (
                                    <tr key={idx} className="hover:bg-brand-800/40">
                                      <td className="py-3 pl-2">
                                        <div className="font-semibold text-white">{item.productName || item.designation}</div>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5 bg-brand-800/60 inline-block px-1 rounded border border-accent/10">{item.productRef || item.reference}</div>
                                      </td>
                                      <td className="py-3 text-center">
                                        {item.availability === 'DISPONIBLE' ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neon-green/20 text-neon-green border border-neon-green/30">
                                            <span className="w-1.5 h-1.5 rounded-full bg-neon-green mr-1"></span>
                                            Dispo
                                          </span>
                                        ) : item.availability === 'RUPTURE' ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neon-pink/20 text-neon-pink border border-neon-pink/30">
                                            Rupture
                                          </span>
                                        ) : (
                                          <span className="text-xs text-slate-600">-</span>
                                        )}
                                      </td>
                                      <td className="py-3 text-center text-slate-300 font-medium">{item.quantity}</td>
                                      <td className="py-3 text-right text-slate-400 font-mono">{formatPrice(item.unitPrice)}</td>
                                      <td className="py-3 text-right font-bold text-accent font-mono">{formatPrice(item.lineTotal || item.totalLine)}</td>
                                      <td className="py-3 text-center pr-2">
                                        {item.tvaRate != null ? (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-neon-orange/10 text-neon-orange border border-neon-orange/30">{item.tvaRate}%</span>
                                        ) : (
                                          <span className="text-xs text-slate-600">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-sm text-slate-500 italic text-center py-4">Aucun détail disponible.</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {/* Loading more indicator */}
              {displayCount < filteredAndSortedOrders.length && (
                <tr>
                  <td colSpan={isInternal ? 8 : 7} className="text-center py-4 text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent mr-2"></div>
                      Défilez pour charger plus...
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination info bar - bottom */}
        <div className="px-4 py-2 bg-brand-900/40 border-t border-accent/10 text-xs text-slate-400 flex-shrink-0 flex justify-between items-center">
          <span>
            Affichage de {displayedOrders.length} commandes sur {filteredAndSortedOrders.length}
            {filteredAndSortedOrders.length !== (orders?.length || 0) && (
              <span className="text-slate-500"> (filtré de {orders?.length || 0} total)</span>
            )}
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => { setFilters({ companyName: '', orderType: '', dmsRef: '', date: '', status: '', totalAmount: '' }); setStartDate(''); setEndDate(''); }}
              className="text-xs text-neon-pink hover:text-neon-pink/80 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => { setConfirmAction(null); setPrintOnValidate(false); }}
        onConfirm={() => confirmAction && updateStatusMutation.mutate(confirmAction)}
        title={modalContent.title}
        message={modalContent.message}
        isDestructive={modalContent.isDestructive}
        confirmLabel={modalContent.label}
      >
        {confirmAction?.status === OrderStatus.VALIDATED && (
          <label className="flex items-center justify-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={printOnValidate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrintOnValidate(e.target.checked)}
              className="w-4 h-4 rounded border-accent/40 bg-brand-800 text-accent focus:ring-accent/40 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimer le bon de préparation
            </span>
          </label>
        )}
      </ConfirmModal>

      {/* Modal de confirmation de fermeture du modal d'édition */}
      <ConfirmModal
        isOpen={!!showCloseConfirm}
        onClose={cancelCloseEditModal}
        onConfirm={closeEditModalDirectly}
        title={showCloseConfirm === 'refresh' ? 'Actualiser' : 'Quitter'}
        message="Les modifications que vous avez apportées ne seront peut-être pas enregistrées."
        confirmLabel={showCloseConfirm === 'refresh' ? 'Actualiser' : 'Quitter'}
        cancelLabel="Annuler"
        isDestructive={true}
      />

      {/* Modal de confirmation de suppression de commande (SYSADMIN) */}
      <ConfirmModal
        isOpen={!!deleteOrderId}
        onClose={() => setDeleteOrderId(null)}
        onConfirm={() => deleteOrderId && deleteOrderMutation.mutate(deleteOrderId)}
        title="Supprimer définitivement cette commande ?"
        message="ATTENTION: Cette action est irréversible. La commande sera définitivement supprimée de la base de données, y compris tous ses articles et son historique. Cette action est réservée au Super Administrateur."
        confirmLabel="Supprimer définitivement"
        isDestructive={true}
      />

      {/* Modal de choix du type de commande */}
      {showOrderTypeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowOrderTypeModal(false)}>
          <div className="card-futuristic rounded-2xl shadow-card border border-accent/20 p-8 max-w-md w-full mx-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-accent/20 border border-accent/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner-glow">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Nouvelle Commande</h2>
              <p className="text-sm text-slate-400 mt-1">Choisissez le type de commande</p>
            </div>

            <div className="space-y-3">
              {/* Commande Rapide */}
              <button
                onClick={() => {
                  setShowOrderTypeModal(false);
                  navigate('/quick-order');
                }}
                className="w-full flex items-center p-4 bg-neon-orange/10 hover:bg-neon-orange/20 border-2 border-neon-orange/30 hover:border-neon-orange/50 rounded-xl transition-all group"
              >
                <div className="w-12 h-12 bg-neon-orange/20 border border-neon-orange/30 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">⚡</span>
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-bold text-white">Commande Rapide</h3>
                  <p className="text-xs text-slate-400">Saisie directe par référence article</p>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-neon-orange group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Commande Stock (Panier) */}
              <button
                onClick={() => {
                  setShowOrderTypeModal(false);
                  navigate('/cart');
                }}
                className="w-full flex items-center p-4 bg-accent/10 hover:bg-accent/20 border-2 border-accent/30 hover:border-accent/50 rounded-xl transition-all group"
              >
                <div className="w-12 h-12 bg-accent/20 border border-accent/30 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">📦</span>
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-bold text-white">Commande Stock</h3>
                  <p className="text-xs text-slate-400">Ajouter des articles au panier</p>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-accent group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => setShowOrderTypeModal(false)}
              className="w-full mt-6 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal de modification de commande - Même structure que QuickOrder */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm p-4" onClick={closeEditModal}>
          <div
            className={`rounded-2xl shadow-2xl w-[90vw] h-[80vh] overflow-hidden flex flex-col bg-grid ${isDark ? 'bg-brand-950' : 'bg-slate-50'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-8 pt-6 pb-4 flex items-start justify-between">
              <div>
                <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>Modification Commande</h2>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  Commande #{editingOrder.dmsRef || editingOrder.id.slice(0, 8)} - {editingOrder.date}
                </p>
              </div>
              <button
                onClick={closeEditModal}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-brand-800 text-slate-400 hover:text-slate-200' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-8 pb-6">
              <div className="flex gap-6">
                {/* Partie gauche - Formulaire + Tableau */}
                <div className="flex-1">
                  {/* Ligne d'ajout d'article - Style exact comme l'image */}
                  <div className={`rounded-xl shadow-sm border p-5 mb-6 relative ${isDark ? 'bg-brand-900/80 border-accent/20' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-end gap-4">
                      {/* Code Article */}
                      <div className="flex-1 min-w-[140px]">
                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Code Article</label>
                        <div className="relative">
                          <input
                            ref={editSearchRefInputRef}
                            type="text"
                            value={editSearchRef}
                            onChange={(e) => {
                              setEditSearchRef(e.target.value);
                              if (editSelectedProduct) setEditSelectedProduct(null);
                            }}
                            onKeyDown={handleEditSearchKeyDown}
                            placeholder="Référence..."
                            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent/40 ${isDark ? 'bg-brand-800/60 border-accent/20 text-white placeholder-slate-500' : 'bg-[#f8fafc] border-gray-200 text-gray-700 placeholder-gray-400'}`}
                          />
                          {editSearchRef && (
                            <button onClick={() => clearEditSearch('ref')} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}>×</button>
                          )}
                        </div>
                      </div>

                      {/* Code OEM */}
                      <div className="flex-1 min-w-[140px]">
                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Code OEM</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editSearchOEM}
                            onChange={(e) => {
                              setEditSearchOEM(e.target.value);
                              if (editSelectedProduct) setEditSelectedProduct(null);
                            }}
                            onKeyDown={handleEditSearchKeyDown}
                            placeholder="Code OEM..."
                            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent/40 ${isDark ? 'bg-brand-800/60 border-accent/20 text-white placeholder-slate-500' : 'bg-[#f8fafc] border-gray-200 text-gray-700 placeholder-gray-400'}`}
                          />
                          {editSearchOEM && (
                            <button onClick={() => clearEditSearch('oem')} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}>×</button>
                          )}
                        </div>
                      </div>

                      {/* Désignation */}
                      <div className="flex-[2] min-w-[200px]">
                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Désignation</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editSearchDesig}
                            onChange={(e) => {
                              setEditSearchDesig(e.target.value);
                              if (editSelectedProduct) setEditSelectedProduct(null);
                            }}
                            onKeyDown={handleEditSearchKeyDown}
                            placeholder="Nom du produit..."
                            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent/40 ${isDark ? 'bg-brand-800/60 border-accent/20 text-white placeholder-slate-500' : 'bg-[#f8fafc] border-gray-200 text-gray-700 placeholder-gray-400'}`}
                          />
                          {editSearchDesig && (
                            <button onClick={() => clearEditSearch('desig')} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}>×</button>
                          )}
                        </div>
                      </div>

                      {/* Prix Net */}
                      <div className="w-[120px]">
                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Prix Net</label>
                        <div className={`w-full px-4 py-2.5 border rounded-xl text-sm text-center h-[42px] flex items-center justify-center ${isDark ? 'bg-brand-800/60 border-accent/20 text-slate-300' : 'bg-[#f8fafc] border-gray-200 text-gray-500'}`}>
                          {editActivePrice ? formatPrice(editActivePrice.netPrice) : '-'}
                        </div>
                      </div>

                      {/* Qté */}
                      <div className="w-[100px]">
                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Qté</label>
                        <input
                          ref={editQtyInputRef}
                          type="number"
                          min="1"
                          value={editQuantity}
                          onChange={e => setEditQuantity(Number(e.target.value))}
                          onKeyDown={handleEditQtyKeyDown}
                          className={`w-full h-[42px] px-3 border rounded-xl text-center text-sm font-semibold focus:ring-2 focus:ring-accent/20 focus:border-accent/40 ${isDark ? 'bg-brand-800/60 border-accent/20 text-white' : 'bg-[#f8fafc] border-gray-200 text-gray-700'}`}
                        />
                      </div>

                      {/* Bouton Ajouter */}
                      <div className="w-[42px]">
                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 opacity-0 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>.</label>
                        <button
                          onClick={addEditLine}
                          disabled={!editSelectedProduct}
                          className="w-full h-[42px] flex items-center justify-center bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Loading indicator */}
                    {editIsFetching && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-accent">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Recherche en cours...
                      </div>
                    )}

                    {/* Selected product info */}
                    {editSelectedProduct && (
                      <div className="mt-3 p-3 bg-accent/10 rounded-lg border border-accent/30 flex items-center justify-between">
                        <div>
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>{editSelectedProduct.reference}</span>
                          <span className={`mx-2 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>-</span>
                          <span className={isDark ? 'text-slate-300' : 'text-gray-600'}>{editSelectedProduct.designation}</span>
                          {editSelectedProduct.stock < 1 && (
                            <span className="ml-2 text-xs text-red-500 font-bold">Rupture de stock</span>
                          )}
                        </div>
                        <button onClick={resetEditInput} className="text-accent hover:text-accent-hover text-sm font-medium">
                          Changer
                        </button>
                      </div>
                    )}

                    {/* Dropdown Results */}
                    {editShowDropdown && editSearchResults && editSearchResults.length > 0 && !editSelectedProduct && (
                      <div ref={editDropdownRef} className={`absolute left-4 right-4 top-full mt-1 border rounded-xl shadow-lg max-h-80 overflow-auto z-50 ${isDark ? 'bg-brand-900 border-accent/20' : 'bg-white border-gray-200'}`}>
                        {editSearchResults.map((p: Product, index: number) => (
                          <div
                            key={p.reference}
                            className={`p-3 cursor-pointer border-b last:border-0 ${isDark ? 'border-accent/10' : 'border-gray-100'} ${index === editHighlightedIndex ? 'bg-accent/10' : isDark ? 'hover:bg-brand-800' : 'hover:bg-gray-50'}`}
                            onClick={() => handleEditSelectProduct(p)}
                            onMouseEnter={() => setEditHighlightedIndex(index)}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>{p.reference}</span>
                              {p.stock > 0 ? (
                                <span className="text-[10px] font-bold bg-neon-green/20 text-neon-green px-2 py-0.5 rounded border border-neon-green/30">Dispo</span>
                              ) : (
                                <span className="text-[10px] font-bold bg-neon-pink/20 text-neon-pink px-2 py-0.5 rounded border border-neon-pink/30">Rupture</span>
                              )}
                            </div>
                            <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{p.designation}</div>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2">
                                {p.codeOrigine && (
                                  <span className="text-xs text-accent font-mono bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">OEM: {p.codeOrigine}</span>
                                )}
                                {p.brand && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded border ${isDark ? 'text-slate-400 bg-brand-800 border-accent/10' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>{p.brand}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                {(() => {
                                  const priceHT = p.priceHT || p.pricePublic || 0;
                                  const tvaRate = p.tvaRate;
                                  const clientDiscount = user?.globalDiscount || 0;
                                  const calculatedNetPrice = priceHT * (1 - clientDiscount / 100);
                                  return (
                                    <>
                                      <div className="text-right">
                                        <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>{formatPrice(priceHT)} HT</span>
                                        {tvaRate != null && (
                                          <span className="ml-1 text-amber-500 font-bold">TVA {tvaRate}%</span>
                                        )}
                                        {clientDiscount > 0 && (
                                          <span className="ml-1 text-accent font-bold">-{clientDiscount}%</span>
                                        )}
                                      </div>
                                      <div className="bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                                        <span className="text-emerald-600 font-bold">{formatPrice(calculatedNetPrice)}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No results */}
                    {editShowDropdown && editSearchResults && editSearchResults.length === 0 && editHasSearch && !editIsFetching && (
                      <div className={`absolute left-4 right-4 top-full mt-1 border rounded-xl shadow-lg p-4 z-50 ${isDark ? 'bg-brand-900 border-accent/20' : 'bg-white border-gray-200'}`}>
                        <p className={`text-sm text-center ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Aucun produit trouvé</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tableau et Récapitulatif - Layout comme QuickOrder */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                {/* Tableau des articles - Exactement comme QuickOrder */}
                <div className="lg:col-span-2">
                  <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden min-h-[300px]">
                    <table className="w-full text-left table-fixed">
                      <thead className="bg-brand-900/50 border-b border-accent/10">
                        <tr>
                          <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-[32%]">Ref / Produit</th>
                          <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-center w-[12%]">Dispo.</th>
                          <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-center w-[8%]">Qté</th>
                          <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-right w-[14%]">P.U. Net</th>
                          <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-right w-[14%]">Total HT</th>
                          <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-center w-[10%]">TVA</th>
                          <th className="px-4 py-3 w-[10%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-accent/10">
                        {editLines.length === 0 ? (
                          <tr><td colSpan={7} className="p-8 text-center text-slate-500">Aucune ligne saisie. Utilisez le formulaire ci-dessus.</td></tr>
                        ) : editLines.map(line => (
                          <tr key={line.id} className="hover:bg-brand-800/40">
                            <td className="px-4 py-3">
                              <div className="font-bold text-white text-sm truncate">{line.product.reference}</div>
                              <div className="text-xs text-slate-500 truncate" title={line.product.designation}>{line.product.designation}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {line.availability === 'DISPONIBLE' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neon-green/20 text-neon-green border border-neon-green/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-neon-green mr-1"></span>
                                  Dispo
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neon-pink/20 text-neon-pink border border-neon-pink/30">
                                  Rupture
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-slate-300">{line.quantity}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-300">{formatPrice(line.price.netPrice)}</td>
                            <td className="px-4 py-3 text-right font-bold text-accent">{formatPrice(line.price.netPrice * line.quantity)}</td>
                            <td className="px-4 py-3 text-center text-sm text-slate-300">
                              {(() => {
                                const rate = getEditTvaRatePercent(line);
                                return rate !== null ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-neon-orange/10 text-neon-orange border border-neon-orange/30">{rate}%</span>
                                ) : '-';
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => removeEditLine(line.id)} className="text-neon-pink/60 hover:text-neon-pink">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Récapitulatif - Exactement comme QuickOrder */}
                <div className="lg:col-span-1">
                  <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-6 sticky top-6">
                    <h3 className="text-lg font-bold text-white mb-4">Récapitulatif</h3>

                    <div className="space-y-3 text-sm border-b border-accent/10 pb-4 mb-4">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Lignes</span>
                        <span className="font-medium text-slate-200">{editLines.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total HT</span>
                        <span className="font-medium text-slate-200">{formatPriceWithCurrency(editTotalHT)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total TVA</span>
                        <span className="font-medium text-slate-200">{editTotalTVA > 0 ? formatPriceWithCurrency(editTotalTVA) : '-'}</span>
                      </div>
                    </div>

                    {/* TVA défalquée par taux */}
                    {Object.keys(editTvaGroups).length > 0 && (
                      <div className="space-y-2 text-xs border-b border-accent/10 pb-4 mb-4">
                        <div className="text-slate-500 uppercase tracking-wider font-bold mb-2">Détail TVA</div>
                        {Object.values(editTvaGroups)
                          .sort((a, b) => a.rate - b.rate)
                          .map(group => (
                            <div className="flex justify-between" key={`tva-${group.rate}`}>
                              <span className="text-slate-500">TVA {group.rate}%</span>
                              <span className="font-medium text-slate-400">{formatPriceWithCurrency(group.vat)}</span>
                            </div>
                          ))
                        }
                      </div>
                    )}

                    <div className="flex justify-between items-end mb-6">
                      <span className="font-bold text-lg text-white">Total TTC</span>
                      <span className="font-bold text-2xl text-accent">{formatPriceWithCurrency(editTotalTTC)}</span>
                    </div>

                    <button
                      onClick={handleSaveEdit}
                      disabled={editLines.length === 0 || updateOrderContentMutation.isPending}
                      className="w-full py-3 bg-neon-green text-brand-950 rounded-lg font-bold hover:bg-neon-green/80 shadow-glow btn-glow disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                    >
                      {updateOrderContentMutation.isPending ? (
                        <>
                          <div className="w-5 h-5 border-2 border-brand-950/30 border-t-brand-950 rounded-full animate-spin"></div>
                          Enregistrement...
                        </>
                      ) : (
                        'Valider la Commande'
                      )}
                    </button>

                    <button
                      onClick={closeEditModal}
                      className="w-full py-2 mt-3 text-slate-500 text-sm hover:text-slate-300"
                    >
                      Annuler / Retour
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de conflit de doublon */}
      {editConflict && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`rounded-2xl max-w-md w-full shadow-xl border p-6 animate-fadeIn ${isDark ? 'bg-brand-900 border-accent/20' : 'bg-white border-gray-200'}`}>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>Article déjà présent</h3>
              <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                L'article <strong className={isDark ? 'text-white' : 'text-gray-800'}>{editConflict.productName}</strong> est déjà dans votre liste avec une quantité de <strong className={isDark ? 'text-white' : 'text-gray-800'}>{editConflict.oldQty}</strong>.
              </p>
              <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                Vous voulez ajouter <strong className={isDark ? 'text-white' : 'text-gray-800'}>{editConflict.newQty}</strong>. Que faire ?
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => handleEditResolveConflict('ADD')}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-bold shadow-lg flex justify-between px-4 items-center"
              >
                <span className="flex items-center gap-2">
                  <span className="bg-accent-hover text-xs px-1.5 py-0.5 rounded font-mono">A</span>
                  Ajouter (Cumuler)
                </span>
                <span className="bg-accent-hover px-2 py-0.5 rounded text-sm">Total: {editConflict.oldQty + editConflict.newQty}</span>
              </button>

              <button
                onClick={() => handleEditResolveConflict('REPLACE')}
                className={`w-full py-3 border rounded-lg font-bold flex justify-between px-4 items-center ${isDark ? 'bg-brand-800 border-accent/20 hover:border-accent/40 text-white' : 'bg-gray-100 border-gray-300 hover:border-gray-400 text-gray-700'}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isDark ? 'bg-brand-700' : 'bg-gray-200'}`}>R</span>
                  Remplacer la quantité
                </span>
                <span className={`px-2 py-0.5 rounded text-sm ${isDark ? 'bg-brand-700 text-slate-300' : 'bg-gray-200 text-gray-500'}`}>Total: {editConflict.newQty}</span>
              </button>

              <button
                onClick={() => handleEditResolveConflict('CANCEL')}
                className={`w-full py-2 font-medium text-sm mt-2 flex items-center justify-center gap-2 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isDark ? 'bg-brand-800' : 'bg-gray-100'}`}>Esc</span>
                Annuler l'ajout
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Orders;
