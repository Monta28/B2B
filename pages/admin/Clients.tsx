import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Company } from '../../types';

// Number of items to load at a time for infinite scroll
const ITEMS_PER_PAGE = 50;

type SortConfig = { key: keyof Company | 'users'; direction: 'asc' | 'desc'; };

// Interface for DMS Client
interface DmsClient {
  codeClient: string;
  raisonSociale: string;
  codeTva: string;
  telephone: string;
  email: string;
  tauxRemise: number;
  typeRemise: number;
  tauxMajoration: number | null;
}

export const Clients = () => {
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });

  // Confirmation States
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Multi-select state for bulk delete
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<{ deleted: number; skipped: number; errors: string[] } | null>(null);

  // Column filtering state
  const [filters, setFilters] = useState({
    name: '',
    dmsClientCode: '',
    emailContact: '',
    phone: '',
    globalDiscount: '',
    users: '',
    isActive: '' as '' | 'active' | 'inactive',
  });

  // Infinite scroll state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Edit Form State
  const [editingClient, setEditingClient] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    dmsClientCode: '',
    siret: '',
    emailContact: '',
    phone: '',
    globalDiscount: 0
  });

  // Import Modal State
  const [dmsClients, setDmsClients] = useState<DmsClient[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [isLoadingDms, setIsLoadingDms] = useState(false);
  const [dmsError, setDmsError] = useState<string | null>(null);
  const [editingRemise, setEditingRemise] = useState<{ code: string; value: number } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null);

  // Import Modal - Column filtering and infinite scroll
  const [importFilters, setImportFilters] = useState({
    codeClient: '',
    raisonSociale: '',
    codeTva: '',
    telephone: '',
    email: '',
    tauxRemise: '',
    tauxMajoration: '',
  });
  const [importDisplayCount, setImportDisplayCount] = useState(ITEMS_PER_PAGE);
  const importTableContainerRef = useRef<HTMLDivElement>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: api.admin.getCompanies
  });

  const toggleMutation = useMutation({
    mutationFn: api.admin.toggleCompanyStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: api.admin.updateCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      setIsEditModalOpen(false);
      resetForm();
    }
  });

  const importMutation = useMutation({
    mutationFn: api.admin.importClients,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      setImportResult(result);
      setSelectedClients(new Set());
    }
  });

  const deleteMutation = useMutation({
    mutationFn: api.admin.deleteCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      setDeleteConfirmId(null);
      setDeleteError(null);
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: api.admin.bulkDeleteCompanies,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      setBulkDeleteResult(result);
      setSelectedCompanyIds(new Set());
    }
  });

  const resetForm = () => {
    setEditingClient(null);
    setFormData({ name: '', dmsClientCode: '', siret: '', emailContact: '', phone: '', globalDiscount: 0 });
  };

  const openEditModal = (client: Company) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      dmsClientCode: client.dmsClientCode,
      siret: client.siret || '',
      emailContact: client.emailContact || '',
      phone: client.phone || '',
      globalDiscount: client.globalDiscount || 0
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ ...editingClient, ...formData });
    }
  };

  // Set of existing DMS codes (for marking in modal)
  const existingDmsCodes = useMemo(() =>
    new Set(companies?.map(c => c.dmsClientCode) || []),
    [companies]
  );

  const openImportModal = async () => {
    setIsImportModalOpen(true);
    setDmsError(null);
    setDmsClients([]);
    setSelectedClients(new Set());
    setImportResult(null);
    setIsLoadingDms(true);

    try {
      const result = await api.admin.getDmsClients();
      if (result.success && result.clients) {
        // Show all clients (existing ones can be updated with new majoration/remise data)
        setDmsClients(result.clients);
      } else {
        setDmsError(result.message || 'Erreur lors du chargement des clients DMS');
      }
    } catch (error: any) {
      setDmsError(error.message || 'Erreur de connexion au serveur');
    } finally {
      setIsLoadingDms(false);
    }
  };

  const getCompanyStatus = (id: string) => companies?.find(c => c.id === id)?.isActive;
  const getCompanyName = (id: string) => companies?.find(c => c.id === id)?.name;
  const getCompanyUsersCount = (id: string) => companies?.find(c => c.id === id)?.users?.length || 0;

  // Filtered companies based on column filters
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    return companies.filter(company => {
      // Name filter
      if (filters.name && !company.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      // DMS Code filter
      if (filters.dmsClientCode && !company.dmsClientCode.toLowerCase().includes(filters.dmsClientCode.toLowerCase())) {
        return false;
      }
      // Email filter
      if (filters.emailContact && !(company.emailContact || '').toLowerCase().includes(filters.emailContact.toLowerCase())) {
        return false;
      }
      // Phone filter
      if (filters.phone && !(company.phone || '').toLowerCase().includes(filters.phone.toLowerCase())) {
        return false;
      }
      // Discount filter
      if (filters.globalDiscount) {
        const discountValue = parseFloat(filters.globalDiscount);
        if (!isNaN(discountValue) && company.globalDiscount !== discountValue) {
          return false;
        }
      }
      // Users count filter
      if (filters.users) {
        const usersValue = parseInt(filters.users);
        if (!isNaN(usersValue) && (company.users?.length || 0) !== usersValue) {
          return false;
        }
      }
      // Active status filter
      if (filters.isActive === 'active' && !company.isActive) {
        return false;
      }
      if (filters.isActive === 'inactive' && company.isActive) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      let aValue: any = sortConfig.key === 'users' ? (a.users?.length || 0) : a[sortConfig.key as keyof Company];
      let bValue: any = sortConfig.key === 'users' ? (b.users?.length || 0) : b[sortConfig.key as keyof Company];

      if (aValue === undefined || aValue === null) aValue = '';
      if (bValue === undefined || bValue === null) bValue = '';

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [companies, filters, sortConfig]);

  const handleSort = (key: keyof Company | 'users') => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof Company | 'users' }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-500'}`}>▼</span>
  );

  // Companies to display (with infinite scroll pagination)
  const displayedCompanies = useMemo(() => {
    return filteredCompanies.slice(0, displayCount);
  }, [filteredCompanies, displayCount]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [filters]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when 100px from bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (displayCount < filteredCompanies.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredCompanies.length));
      }
    }
  }, [displayCount, filteredCompanies.length]);

  // Auto-load more if container doesn't overflow (content too short to scroll)
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const checkAndLoadMore = () => {
      const { scrollHeight, clientHeight } = container;
      // If content doesn't overflow and there are more items, load them
      if (scrollHeight <= clientHeight && displayCount < filteredCompanies.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredCompanies.length));
      }
    };

    // Check after render
    const timer = setTimeout(checkAndLoadMore, 100);
    return () => clearTimeout(timer);
  }, [displayCount, filteredCompanies.length]);

  // Multi-select handlers for company table
  const handleSelectAllCompanies = () => {
    // Only select companies that can be deleted (no linked users)
    const selectableCompanies = filteredCompanies.filter(c => !c.users || c.users.length === 0);
    if (selectedCompanyIds.size === selectableCompanies.length && selectableCompanies.length > 0) {
      setSelectedCompanyIds(new Set());
    } else {
      setSelectedCompanyIds(new Set(selectableCompanies.map(c => c.id)));
    }
  };

  const handleSelectCompany = (id: string) => {
    const newSelected = new Set(selectedCompanyIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCompanyIds(newSelected);
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedCompanyIds));
  };

  // Count of selectable companies (those without linked users)
  const selectableCompaniesCount = useMemo(() => {
    return filteredCompanies.filter(c => !c.users || c.users.length === 0).length;
  }, [filteredCompanies]);

  // Filtered DMS clients for display (with column filters)
  const filteredDmsClients = useMemo(() => {
    return dmsClients.filter(c => {
      if (importFilters.codeClient && !c.codeClient.toLowerCase().includes(importFilters.codeClient.toLowerCase())) {
        return false;
      }
      if (importFilters.raisonSociale && !c.raisonSociale.toLowerCase().includes(importFilters.raisonSociale.toLowerCase())) {
        return false;
      }
      if (importFilters.codeTva && !c.codeTva.toLowerCase().includes(importFilters.codeTva.toLowerCase())) {
        return false;
      }
      if (importFilters.telephone && !c.telephone.toLowerCase().includes(importFilters.telephone.toLowerCase())) {
        return false;
      }
      if (importFilters.email && !c.email.toLowerCase().includes(importFilters.email.toLowerCase())) {
        return false;
      }
      if (importFilters.tauxRemise) {
        const remiseValue = parseFloat(importFilters.tauxRemise);
        if (!isNaN(remiseValue) && c.tauxRemise !== remiseValue) {
          return false;
        }
      }
      if (importFilters.tauxMajoration) {
        const majorationValue = parseFloat(importFilters.tauxMajoration);
        if (!isNaN(majorationValue) && c.tauxMajoration !== majorationValue) {
          return false;
        }
      }
      return true;
    });
  }, [dmsClients, importFilters]);

  // DMS clients to display (with infinite scroll)
  const displayedDmsClients = useMemo(() => {
    return filteredDmsClients.slice(0, importDisplayCount);
  }, [filteredDmsClients, importDisplayCount]);

  // Reset import display count when filters change
  useEffect(() => {
    setImportDisplayCount(ITEMS_PER_PAGE);
  }, [importFilters]);

  // Import modal scroll handler
  const handleImportScroll = useCallback(() => {
    const container = importTableContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (importDisplayCount < filteredDmsClients.length) {
        setImportDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredDmsClients.length));
      }
    }
  }, [importDisplayCount, filteredDmsClients.length]);

  const hasActiveImportFilters = Object.values(importFilters).some(f => f !== '');

  // Handle select all
  const handleSelectAll = () => {
    if (selectedClients.size === filteredDmsClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredDmsClients.map(c => c.codeClient)));
    }
  };

  // Handle individual selection
  const handleSelectClient = (code: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedClients(newSelected);
  };

  // Handle remise change
  const handleRemiseChange = (code: string, value: number) => {
    setDmsClients(prev => prev.map(c =>
      c.codeClient === code ? { ...c, tauxRemise: value } : c
    ));
    setEditingRemise(null);
  };

  // Handle import
  const handleImport = () => {
    const clientsToImport = dmsClients.filter(c => selectedClients.has(c.codeClient));
    importMutation.mutate(clientsToImport);
  };

  // Calculate available height for the table dynamically
  // Desktop: 100vh - 80px header - 64px padding - 80px title - 52px pagination bar = ~276px
  // Adding extra buffer for consistency
  const tableHeight = 'calc(100vh - 290px)';

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des Entreprises Clientes</h1>
          <p className="text-sm text-slate-400">Importez et gérez l'accès des clients du DMS à la plateforme Web.</p>
        </div>
        <div className="flex items-center space-x-3">
          {selectedCompanyIds.size > 0 && (
            <button
              onClick={() => { setBulkDeleteModalOpen(true); setBulkDeleteResult(null); }}
              className="bg-neon-pink hover:bg-neon-pink/80 text-white px-4 py-2 rounded-xl font-semibold shadow-glow-pink btn-glow transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Supprimer ({selectedCompanyIds.size})
            </button>
          )}
          <button
            onClick={openImportModal}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-semibold shadow-glow btn-glow transition-colors flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importer depuis DMS
          </button>
        </div>
      </div>

      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)', maxHeight: 'calc(100vh - 200px)' }}>
        {/* Fixed header with filters */}
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full text-left table-fixed" style={{ minWidth: '1200px' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '70px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              {/* Header row with sort */}
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedCompanyIds.size === selectableCompaniesCount && selectableCompaniesCount > 0}
                    onChange={handleSelectAllCompanies}
                    className="h-4 w-4 text-accent bg-brand-800/60 rounded border-accent/30 focus:ring-accent/40"
                    title={selectableCompaniesCount === 0 ? 'Aucun client supprimable' : 'Sélectionner tout'}
                    disabled={selectableCompaniesCount === 0}
                  />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('name')}>
                  Société <SortIcon columnKey="name" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('dmsClientCode')}>
                  Code DMS <SortIcon columnKey="dmsClientCode" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('emailContact')}>
                  Email <SortIcon columnKey="emailContact" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('phone')}>
                  Téléphone <SortIcon columnKey="phone" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('globalDiscount')}>
                  Remise <SortIcon columnKey="globalDiscount" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Majoration
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('users')}>
                  Users <SortIcon columnKey="users" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('isActive')}>
                  Accès <SortIcon columnKey="isActive" />
                </th>
                <th className="px-3 py-3"></th>
              </tr>
              {/* Filter row */}
              <tr className="bg-brand-900/40">
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.name}
                    onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.dmsClientCode}
                    onChange={e => setFilters(f => ({ ...f, dmsClientCode: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.emailContact}
                    onChange={e => setFilters(f => ({ ...f, emailContact: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.phone}
                    onChange={e => setFilters(f => ({ ...f, phone: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="%"
                    value={filters.globalDiscount}
                    onChange={e => setFilters(f => ({ ...f, globalDiscount: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="#"
                    value={filters.users}
                    onChange={e => setFilters(f => ({ ...f, users: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40 text-center"
                  />
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filters.isActive}
                    onChange={e => setFilters(f => ({ ...f, isActive: e.target.value as '' | 'active' | 'inactive' }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  >
                    <option value="">Tous</option>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </th>
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
          <table className="w-full text-left table-fixed" style={{ minWidth: '1200px' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '70px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-8 text-slate-400">Chargement...</td></tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <div className="text-slate-400">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <p className="font-medium">{companies?.length === 0 ? 'Aucun client importé' : 'Aucun résultat'}</p>
                      <p className="text-sm mt-1">
                        {companies?.length === 0
                          ? 'Cliquez sur "Importer depuis DMS" pour commencer'
                          : 'Essayez de modifier vos filtres'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : displayedCompanies.map(company => {
                const hasLinkedUsers = company.users && company.users.length > 0;
                return (
                  <tr key={company.id} className={`hover:bg-brand-800/30 group ${selectedCompanyIds.has(company.id) ? 'bg-accent/10' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.has(company.id)}
                        onChange={() => handleSelectCompany(company.id)}
                        disabled={hasLinkedUsers}
                        className={`h-4 w-4 rounded bg-brand-800/60 border-accent/30 focus:ring-accent/40 ${hasLinkedUsers ? 'text-slate-600 cursor-not-allowed' : 'text-accent'}`}
                        title={hasLinkedUsers ? `${company.users!.length} utilisateur(s) lié(s)` : 'Sélectionner'}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-100 truncate" title={company.name}>{company.name}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs text-accent bg-accent/10 border border-accent/20 px-2 py-1 rounded">{company.dmsClientCode}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-300 text-sm truncate" title={company.emailContact || ''}>{company.emailContact || '-'}</td>
                    <td className="px-3 py-3 text-slate-300 text-sm">{company.phone || '-'}</td>
                    <td className="px-3 py-3">
                      {company.globalDiscount ? (
                        <span className="text-xs font-bold text-neon-green bg-neon-green/15 border border-neon-green/30 px-2 py-1 rounded">
                          -{company.globalDiscount}%
                        </span>
                      ) : <span className="text-xs text-slate-400">0%</span>}
                    </td>
                    <td className="px-3 py-3">
                      {company.typeRemise && [2, 4].includes(company.typeRemise) && company.tauxMajoration !== null ? (
                        <span className="text-xs font-bold text-neon-orange bg-neon-orange/15 border border-neon-orange/30 px-2 py-1 rounded">
                          +{company.tauxMajoration}%
                        </span>
                      ) : <span className="text-xs text-slate-500">-</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {company.users && company.users.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                          {company.users.length}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setToggleConfirmId(company.id)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border border-accent/20 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/30 ${company.isActive ? 'bg-neon-green/50' : 'bg-brand-700/60'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-100 shadow ring-0 transition duration-200 ease-in-out ${company.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button onClick={() => openEditModal(company)} className="p-1 text-accent hover:bg-accent/10 rounded transition-colors" title="Modifier">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          onClick={() => { setDeleteConfirmId(company.id); setDeleteError(null); }}
                          className={`p-1 rounded transition-colors ${hasLinkedUsers ? 'text-slate-600 cursor-not-allowed' : 'text-neon-pink hover:bg-neon-pink/10'}`}
                          title={hasLinkedUsers ? `Impossible de supprimer: ${company.users!.length} utilisateur(s) lié(s)` : 'Supprimer'}
                          disabled={hasLinkedUsers}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Loading more indicator */}
              {displayCount < filteredCompanies.length && (
                <tr>
                  <td colSpan={10} className="text-center py-4 text-slate-400">
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
            Affichage de {displayedCompanies.length} clients sur {filteredCompanies.length}
            {filteredCompanies.length !== (companies?.length || 0) && (
              <span className="text-slate-500"> (filtré de {companies?.length || 0} total)</span>
            )}
          </span>
          {Object.values(filters).some(f => f !== '') && (
            <button
              onClick={() => setFilters({ name: '', dmsClientCode: '', emailContact: '', phone: '', globalDiscount: '', users: '', isActive: '' })}
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

      {/* Confirmation Modal for Toggle */}
      <ConfirmModal
        isOpen={!!toggleConfirmId}
        onClose={() => setToggleConfirmId(null)}
        onConfirm={() => toggleConfirmId && toggleMutation.mutate(toggleConfirmId)}
        title={getCompanyStatus(toggleConfirmId || '') ? 'Désactiver ce client ?' : 'Activer ce client ?'}
        message={
          getCompanyStatus(toggleConfirmId || '')
            ? "ATTENTION : Si vous désactivez ce client, tous ses utilisateurs perdront immédiatement l'accès à la plateforme et ne pourront plus passer commande."
            : "Ce client et ses utilisateurs pourront à nouveau accéder à la plateforme."
        }
        isDestructive={getCompanyStatus(toggleConfirmId || '') || false}
        confirmLabel={getCompanyStatus(toggleConfirmId || '') ? 'Désactiver' : 'Activer'}
      />

      {/* Confirmation Modal for Delete */}
      {deleteConfirmId && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl max-w-md w-full p-6 shadow-card border border-accent/20 animate-fadeIn">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-brand-800/50 border border-neon-pink/30 flex items-center justify-center mr-4 shadow-inner-glow">
                <svg className="w-6 h-6 text-neon-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Supprimer ce client ?</h3>
                <p className="text-sm text-slate-400">{getCompanyName(deleteConfirmId)}</p>
              </div>
            </div>

            {deleteError ? (
              <div className="bg-neon-pink/10 border border-neon-pink/30 text-neon-pink px-4 py-3 rounded-lg mb-4">
                <p className="font-medium">Impossible de supprimer</p>
                <p className="text-sm mt-1">{deleteError}</p>
              </div>
            ) : (
              <p className="text-slate-300 mb-4">
                Cette action est irréversible. Le client sera définitivement supprimé de la plateforme.
                {getCompanyUsersCount(deleteConfirmId) > 0 && (
                  <span className="block mt-2 text-neon-pink font-semibold">
                    Ce client a {getCompanyUsersCount(deleteConfirmId)} utilisateur(s) lié(s). Vous devez d'abord les supprimer ou les réaffecter.
                  </span>
                )}
              </p>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
                className="px-4 py-2 glass-light border border-accent/20 rounded-lg text-slate-200 hover:border-accent/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                Annuler
              </button>
              {!deleteError && getCompanyUsersCount(deleteConfirmId) === 0 && (
                <button
                  onClick={() => deleteMutation.mutate(deleteConfirmId)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-neon-pink text-white rounded-lg hover:bg-neon-pink/80 disabled:opacity-50 flex items-center shadow-glow-pink btn-glow"
                >
                  {deleteMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Suppression...
                    </>
                  ) : (
                    'Supprimer'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl max-w-md w-full p-6 shadow-card border border-accent/20 animate-fadeIn">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-brand-800/50 border border-neon-pink/30 flex items-center justify-center mr-4 shadow-inner-glow">
                <svg className="w-6 h-6 text-neon-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Supprimer {selectedCompanyIds.size} client(s) ?</h3>
                <p className="text-sm text-slate-400">Cette action est irréversible</p>
              </div>
            </div>

            {bulkDeleteResult ? (
              <div className="space-y-3">
                <div className={`p-4 rounded-lg ${bulkDeleteResult.deleted > 0 ? 'bg-neon-green/10 text-neon-green border border-neon-green/30' : 'bg-neon-orange/10 text-neon-orange border border-neon-orange/30'}`}>
                  <p className="font-medium">
                    {bulkDeleteResult.deleted > 0
                      ? `${bulkDeleteResult.deleted} client(s) supprimé(s) avec succès`
                      : 'Aucun client supprimé'}
                  </p>
                  {bulkDeleteResult.skipped > 0 && (
                    <p className="text-sm mt-1">{bulkDeleteResult.skipped} client(s) ignoré(s)</p>
                  )}
                </div>
                {bulkDeleteResult.errors.length > 0 && (
                  <div className="bg-neon-pink/10 text-neon-pink border border-neon-pink/30 p-3 rounded-lg text-sm">
                    <p className="font-medium mb-1">Erreurs:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {bulkDeleteResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {bulkDeleteResult.errors.length > 5 && (
                        <li>...et {bulkDeleteResult.errors.length - 5} autre(s)</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => { setBulkDeleteModalOpen(false); setBulkDeleteResult(null); }}
                    className="px-4 py-2 glass-light border border-accent/20 text-slate-200 rounded-lg hover:border-accent/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-slate-300 mb-4">
                  Vous êtes sur le point de supprimer définitivement les {selectedCompanyIds.size} clients sélectionnés de la plateforme.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setBulkDeleteModalOpen(false)}
                    className="px-4 py-2 glass-light border border-accent/20 rounded-lg text-slate-200 hover:border-accent/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleteMutation.isPending}
                    className="px-4 py-2 bg-neon-pink text-white rounded-lg hover:bg-neon-pink/80 disabled:opacity-50 flex items-center shadow-glow-pink btn-glow"
                  >
                    {bulkDeleteMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Suppression...
                      </>
                    ) : (
                      `Supprimer (${selectedCompanyIds.size})`
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Edit Client Modal */}
      {isEditModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl max-w-md w-full p-6 shadow-card border border-accent/20 animate-fadeIn">
            <h2 className="text-xl font-bold mb-4 text-white">Modifier le client</h2>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Raison Sociale</label>
                <input
                  type="text" required
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md shadow-sm p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Code Client DMS</label>
                <input
                  type="text" disabled
                  className="mt-1 block w-full border border-accent/10 bg-brand-800/30 text-slate-400 rounded-md shadow-sm p-2 cursor-not-allowed"
                  value={formData.dmsClientCode}
                />
                <p className="text-xs text-slate-500 mt-1">Le code DMS ne peut pas être modifié.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Code TVA / SIRET</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md shadow-sm p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={formData.siret} onChange={e => setFormData({...formData, siret: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Email Contact</label>
                <input
                  type="email"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md shadow-sm p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={formData.emailContact} onChange={e => setFormData({...formData, emailContact: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Téléphone</label>
                <input
                  type="tel"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md shadow-sm p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Taux de Remise (%)</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md shadow-sm p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={formData.globalDiscount} onChange={e => setFormData({...formData, globalDiscount: Number(e.target.value)})}
                />
                <p className="text-xs text-slate-500 mt-1">Remise appliquée sur toutes les commandes de ce client.</p>
              </div>

              <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-accent/10">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 glass-light border border-accent/20 rounded-md text-slate-200 hover:border-accent/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover shadow-glow btn-glow disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Import from DMS Modal */}
      {isImportModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-card border border-accent/20 animate-fadeIn">
            {/* Header */}
            <div className="p-6 border-b border-accent/10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Importer des Clients depuis le DMS</h2>
                  <p className="text-sm text-slate-400 mt-1">Sélectionnez les clients à importer dans la plateforme</p>
                </div>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="text-slate-400 hover:text-white hover:bg-accent/10 p-2 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {isLoadingDms ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
                  <span className="ml-3 text-slate-300">Chargement des clients DMS...</span>
                </div>
              ) : dmsError ? (
                <div className="text-center py-12">
                  <div className="bg-neon-pink/10 text-neon-pink border border-neon-pink/30 p-4 rounded-lg inline-block">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">Erreur de connexion</p>
                    <p className="text-sm mt-1">{dmsError}</p>
                  </div>
                </div>
              ) : importResult ? (
                <div className="text-center py-12">
                  <div className="bg-neon-green/10 text-neon-green border border-neon-green/30 p-6 rounded-lg inline-block">
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-bold text-lg">Importation terminée</p>
                    <div className="mt-3 text-sm space-y-1">
                      <p><span className="font-semibold">{importResult.imported}</span> client(s) importé(s)</p>
                      {importResult.updated > 0 && (
                        <p className="text-neon-cyan"><span className="font-semibold">{importResult.updated}</span> client(s) mis à jour (majoration/remise)</p>
                      )}
                      {importResult.skipped > 0 && (
                        <p className="text-slate-400"><span className="font-semibold">{importResult.skipped}</span> client(s) inchangés</p>
                      )}
                      {importResult.errors.length > 0 && (
                        <div className="text-neon-pink mt-2">
                          <p className="font-semibold">{importResult.errors.length} erreur(s):</p>
                          <ul className="text-xs mt-1">
                            {importResult.errors.slice(0, 5).map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setIsImportModalOpen(false)}
                      className="mt-4 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover shadow-glow btn-glow"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              ) : dmsClients.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-slate-400">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">Tous les clients ont été importés</p>
                    <p className="text-sm mt-1">Aucun nouveau client disponible dans le DMS</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Fixed header with filters */}
                  <div className="flex-shrink-0 overflow-x-auto">
                    <table className="w-full text-left text-sm table-fixed" style={{ minWidth: '1000px' }}>
                      <colgroup>
                        <col style={{ width: '40px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '180px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '160px' }} />
                        <col style={{ width: '80px' }} />
                        <col style={{ width: '100px' }} />
                      </colgroup>
                      <thead className="bg-brand-900/50 border-b border-accent/10">
                        {/* Header row */}
                        <tr>
                          <th className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedClients.size === filteredDmsClients.length && filteredDmsClients.length > 0}
                              onChange={handleSelectAll}
                              className="h-4 w-4 text-accent bg-brand-800/60 rounded border-accent/30 focus:ring-accent/40"
                            />
                          </th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Code Client</th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Raison Sociale</th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Code TVA</th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Téléphone</th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Email</th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Remise</th>
                          <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Majoration</th>
                        </tr>
                        {/* Filter row */}
                        <tr className="bg-brand-900/40">
                          <th className="px-3 py-2"></th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Filtrer..."
                              value={importFilters.codeClient}
                              onChange={e => setImportFilters(f => ({ ...f, codeClient: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Filtrer..."
                              value={importFilters.raisonSociale}
                              onChange={e => setImportFilters(f => ({ ...f, raisonSociale: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Filtrer..."
                              value={importFilters.codeTva}
                              onChange={e => setImportFilters(f => ({ ...f, codeTva: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Filtrer..."
                              value={importFilters.telephone}
                              onChange={e => setImportFilters(f => ({ ...f, telephone: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Filtrer..."
                              value={importFilters.email}
                              onChange={e => setImportFilters(f => ({ ...f, email: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="%"
                              value={importFilters.tauxRemise}
                              onChange={e => setImportFilters(f => ({ ...f, tauxRemise: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="%"
                              value={importFilters.tauxMajoration}
                              onChange={e => setImportFilters(f => ({ ...f, tauxMajoration: e.target.value }))}
                              className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                            />
                          </th>
                        </tr>
                      </thead>
                    </table>
                  </div>

                  {/* Scrollable table body */}
                  <div
                    ref={importTableContainerRef}
                    onScroll={handleImportScroll}
                    className="overflow-y-auto flex-1 overflow-x-auto"
                    style={{ maxHeight: '350px' }}
                  >
                    <table className="w-full text-left text-sm table-fixed" style={{ minWidth: '1000px' }}>
                      <colgroup>
                        <col style={{ width: '40px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '180px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '160px' }} />
                        <col style={{ width: '80px' }} />
                        <col style={{ width: '100px' }} />
                      </colgroup>
                      <tbody className="divide-y divide-accent/10">
                        {filteredDmsClients.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-12">
                              <div className="text-slate-400">
                                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <p className="font-medium">Aucun résultat</p>
                                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
                              </div>
                            </td>
                          </tr>
                        ) : displayedDmsClients.map(client => (
                          <tr
                            key={client.codeClient}
                            className={`hover:bg-brand-800/30 ${selectedClients.has(client.codeClient) ? 'bg-accent/10' : ''}`}
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedClients.has(client.codeClient)}
                                onChange={() => handleSelectClient(client.codeClient)}
                                className="h-4 w-4 text-accent bg-brand-800/60 rounded border-accent/30 focus:ring-accent/40"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-1 rounded text-xs">
                                  {client.codeClient}
                                </span>
                                {existingDmsCodes.has(client.codeClient) && (
                                  <span className="text-[10px] font-bold bg-neon-cyan/20 text-neon-cyan px-1.5 py-0.5 rounded border border-neon-cyan/30">
                                    MAJ
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-100 truncate" title={client.raisonSociale}>{client.raisonSociale}</td>
                            <td className="px-3 py-3 text-slate-300">{client.codeTva || '-'}</td>
                            <td className="px-3 py-3 text-slate-300">{client.telephone || '-'}</td>
                            <td className="px-3 py-3 text-slate-300 truncate" title={client.email}>{client.email || '-'}</td>
                            <td className="px-3 py-3">
                              {editingRemise?.code === client.codeClient ? (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  className="w-16 border border-accent/20 bg-brand-800/60 text-slate-100 rounded p-1 text-sm focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                                  defaultValue={client.tauxRemise}
                                  autoFocus
                                  onBlur={(e) => handleRemiseChange(client.codeClient, Number(e.target.value))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleRemiseChange(client.codeClient, Number((e.target as HTMLInputElement).value));
                                    } else if (e.key === 'Escape') {
                                      setEditingRemise(null);
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  onClick={() => setEditingRemise({ code: client.codeClient, value: client.tauxRemise })}
                                  className="text-xs font-bold text-neon-green bg-neon-green/15 border border-neon-green/30 px-2 py-1 rounded hover:bg-neon-green/20 transition-colors"
                                  title="Cliquer pour modifier"
                                >
                                  {client.tauxRemise}%
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {client.tauxMajoration !== null ? (
                                <span className="text-xs font-bold text-neon-orange bg-neon-orange/15 border border-neon-orange/30 px-2 py-1 rounded">
                                  +{client.tauxMajoration}%
                                </span>
                              ) : <span className="text-xs text-slate-500">-</span>}
                            </td>
                          </tr>
                        ))}
                        {/* Loading more indicator */}
                        {importDisplayCount < filteredDmsClients.length && (
                          <tr>
                            <td colSpan={8} className="text-center py-4 text-slate-400">
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
                      Affichage de {displayedDmsClients.length} clients sur {filteredDmsClients.length}
                      {filteredDmsClients.length !== dmsClients.length && (
                        <span className="text-slate-500"> (filtré de {dmsClients.length} total)</span>
                      )}
                    </span>
                    {hasActiveImportFilters && (
                      <button
                        onClick={() => setImportFilters({ codeClient: '', raisonSociale: '', codeTva: '', telephone: '', email: '', tauxRemise: '', tauxMajoration: '' })}
                        className="text-xs text-neon-pink hover:text-neon-pink/80 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Effacer filtres
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer with action buttons */}
            {!isLoadingDms && !dmsError && !importResult && dmsClients.length > 0 && (
              <div className="p-4 border-t border-accent/10 bg-brand-900/30 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-slate-300">
                    <span className="font-semibold text-accent">{selectedClients.size}</span> client(s) sélectionné(s)
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 glass-light border border-accent/20 rounded-lg text-slate-200 hover:border-accent/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={selectedClients.size === 0 || importMutation.isPending}
                      className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover shadow-glow btn-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {importMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Importation...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Importer ({selectedClients.size})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Clients;
