import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { User, UserRole } from '../../types';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';

const ITEMS_PER_PAGE = 10;

type SortConfig = { key: keyof User | 'companyName'; direction: 'asc' | 'desc'; };

export const AdminUsers = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { config } = useConfig();
  const isFullAdmin = currentUser?.role === UserRole.FULL_ADMIN;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });

  // Modals States
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [resetPwdId, setResetPwdId] = useState<string | null>(null);

  // Column filtering state
  const [filters, setFilters] = useState({
    fullName: '',
    email: '',
    role: '' as '' | UserRole,
    companyName: '',
    isActive: '' as '' | 'active' | 'inactive',
  });

  // Infinite scroll state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Form
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    fullName: '',
    companyId: '',
    password: '',
    role: UserRole.CLIENT_USER
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.admin.getUsers()
  });

  // Fetch Companies for Dropdown
  const { data: companies } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => api.admin.getCompanies()
  });

  const createMutation = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); closeModal(); }
  });

  const updateMutation = useMutation({
    mutationFn: api.admin.updateUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); closeModal(); }
  });

  const toggleMutation = useMutation({
    mutationFn: api.admin.toggleUserStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  });

  const deleteMutation = useMutation({
    mutationFn: api.admin.deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  });

  const resetPwdMutation = useMutation({
    mutationFn: api.admin.resetUserPassword,
    onSuccess: () => toast.success("Mot de passe réinitialisé (Valeur temporaire: 'password123')")
  });

  // Helper to get company name from user
  const getCompanyName = (user: any) => {
    if (user.company?.name) return user.company.name;
    if (user.companyName) return user.companyName;
    // For internal admins without company
    if ([UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN].includes(user.role)) {
      return 'MECACOMM HQ';
    }
    return '-';
  };

  // Helper to get role badge color
  const getRoleBadgeClass = (role: UserRole) => {
    // Violet for super admin
    if (role === UserRole.SYSTEM_ADMIN) {
      return 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30';
    }
    // Orange for agency admin
    if (role === UserRole.FULL_ADMIN) {
      return 'bg-neon-orange/20 text-neon-orange border border-neon-orange/30';
    }
    // Blue for partial admin
    if (role === UserRole.PARTIAL_ADMIN) {
      return 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30';
    }
    // Cyan for client roles (CLIENT_ADMIN, CLIENT_USER)
    return 'bg-accent/20 text-accent border border-accent/30';
  };

  // Filtered and sorted users based on column filters
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(user => {
      if (filters.fullName && !user.fullName.toLowerCase().includes(filters.fullName.toLowerCase())) {
        return false;
      }
      if (filters.email && !user.email.toLowerCase().includes(filters.email.toLowerCase())) {
        return false;
      }
      if (filters.role && user.role !== filters.role) {
        return false;
      }
      const companyName = getCompanyName(user);
      if (filters.companyName && !companyName.toLowerCase().includes(filters.companyName.toLowerCase())) {
        return false;
      }
      if (filters.isActive === 'active' && !user.isActive) {
        return false;
      }
      if (filters.isActive === 'inactive' && user.isActive) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      let aValue: any = sortConfig.key === 'companyName' ? getCompanyName(a) : a[sortConfig.key as keyof User];
      let bValue: any = sortConfig.key === 'companyName' ? getCompanyName(b) : b[sortConfig.key as keyof User];

      if (aValue === undefined || aValue === null) aValue = '';
      if (bValue === undefined || bValue === null) bValue = '';

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, filters, sortConfig]);

  const handleSort = (key: keyof User | 'companyName') => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof User | 'companyName' }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-500'}`}>▼</span>
  );

  // Users to display (with infinite scroll pagination)
  const displayedUsers = useMemo(() => {
    return filteredUsers.slice(0, displayCount);
  }, [filteredUsers, displayCount]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [filters]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (displayCount < filteredUsers.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredUsers.length));
      }
    }
  }, [displayCount, filteredUsers.length]);

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        username: (user as any).username || '',
        fullName: user.fullName,
        companyId: user.companyId || '',
        password: '',
        role: user.role
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        username: '',
        fullName: '',
        companyId: '',
        password: '',
        role: UserRole.CLIENT_USER
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isInternal = [UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN].includes(formData.role);

    if (editingUser) {
      // Update - don't send password if empty
      const updateData: any = {
        id: editingUser.id,
        email: formData.email,
        username: formData.username || undefined,
        fullName: formData.fullName,
        role: formData.role,
        // For internal roles, set companyId to null; for clients, always send the value
        companyId: isInternal ? null : (formData.companyId || null),
      };
      updateMutation.mutate(updateData);
    } else {
      // Create - password required
      const createData: any = {
        email: formData.email,
        username: formData.username || undefined,
        fullName: formData.fullName,
        password: formData.password,
        role: formData.role,
        companyId: isInternal ? undefined : (formData.companyId || undefined),
      };
      createMutation.mutate(createData);
    }
  };

  const handleRoleChange = (role: UserRole) => {
    const isInternal = [UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN].includes(role);
    setFormData(prev => ({
      ...prev,
      role,
      companyId: isInternal ? '' : prev.companyId,
    }));
  };

  const getUserStatus = (id: string) => users?.find(u => u.id === id)?.isActive;
  const isInternalRole = [UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN].includes(formData.role);

  // Dynamic table height
  const tableHeight = 'calc(100vh - 290px)';

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des Utilisateurs Globaux</h1>
          <p className="text-sm text-slate-400">Créez et gérez tous les comptes (Admins, Clients, Staff).</p>
        </div>
        <button onClick={() => openModal()} className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-semibold flex items-center shadow-glow btn-glow hover:shadow-card-hover transition-all">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
          Nouvel Utilisateur
        </button>
      </div>

      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)', maxHeight: 'calc(100vh - 200px)' }}>
        {/* Fixed header with filters */}
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full text-left table-fixed" style={{ minWidth: '1050px' }}>
            <colgroup>
              <col style={{ width: '150px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              {/* Header row with sort */}
              <tr>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('fullName')}>
                  Nom <SortIcon columnKey="fullName" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Username</th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('email')}>
                  Email <SortIcon columnKey="email" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('role')}>
                  Rôle <SortIcon columnKey="role" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('companyName')}>
                  Société <SortIcon columnKey="companyName" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('isActive')}>
                  Statut <SortIcon columnKey="isActive" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
              {/* Filter row */}
              <tr className="bg-brand-900/40">
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.fullName}
                    onChange={e => setFilters(f => ({ ...f, fullName: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.email}
                    onChange={e => setFilters(f => ({ ...f, email: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filters.role}
                    onChange={e => setFilters(f => ({ ...f, role: e.target.value as '' | UserRole }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  >
                    <option value="">Tous</option>
                    {!isFullAdmin && <option value={UserRole.SYSTEM_ADMIN}>SYSTEM_ADMIN</option>}
                    <option value={UserRole.FULL_ADMIN}>FULL_ADMIN</option>
                    <option value={UserRole.PARTIAL_ADMIN}>PARTIAL_ADMIN</option>
                    <option value={UserRole.CLIENT_ADMIN}>CLIENT_ADMIN</option>
                    <option value={UserRole.CLIENT_USER}>CLIENT_USER</option>
                  </select>
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.companyName}
                    onChange={e => setFilters(f => ({ ...f, companyName: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
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
                    <option value="inactive">Bloqué</option>
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
          <table className="w-full text-left table-fixed" style={{ minWidth: '1050px' }}>
            <colgroup>
              <col style={{ width: '150px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Chargement...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="text-slate-500">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <p className="font-medium">{users?.length === 0 ? 'Aucun utilisateur' : 'Aucun résultat'}</p>
                      <p className="text-sm mt-1">
                        {users?.length === 0 ? 'Créez un nouvel utilisateur' : 'Essayez de modifier vos filtres'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : displayedUsers.map(u => {
                const companyName = getCompanyName(u);
                return (
                <tr key={u.id} className="hover:bg-brand-800/30 group">
                  <td className="px-3 py-3 font-medium text-slate-100 truncate" title={u.fullName}>{u.fullName}</td>
                  <td className="px-3 py-3 text-slate-400 truncate" title={(u as any).username || ''}>
                    {(u as any).username ? (
                      <span className="bg-brand-800/60 border border-accent/10 text-slate-200 text-xs px-2 py-0.5 rounded font-mono">{(u as any).username}</span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-300 truncate" title={u.email}>{u.email}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${getRoleBadgeClass(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300 truncate" title={companyName}>{companyName}</td>
                  <td className="px-3 py-3 text-center">
                     <button onClick={() => setToggleConfirmId(u.id)} className={`text-xs font-bold px-2 py-1 rounded border transition-colors ${u.isActive ? 'bg-neon-green/20 text-neon-green border-neon-green/30 hover:bg-neon-green/30' : 'bg-neon-pink/20 text-neon-pink border-neon-pink/30 hover:bg-neon-pink/30'}`}>
                       {u.isActive ? 'ACTIF' : 'BLOQUÉ'}
                     </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                     <div className="flex justify-end space-x-1">
                        <button onClick={() => openModal(u)} className="p-1.5 text-accent hover:bg-accent/10 rounded" title="Modifier">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => setResetPwdId(u.id)} className="p-1.5 text-neon-orange hover:bg-neon-orange/10 rounded" title="Reset Mot de Passe">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </button>
                        <button onClick={() => setDeleteConfirmId(u.id)} className="p-1.5 text-neon-pink hover:bg-neon-pink/10 rounded" title="Supprimer">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                     </div>
                  </td>
                </tr>
              )})}
              {/* Loading more indicator */}
              {displayCount < filteredUsers.length && (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-slate-500">
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
            Affichage de {displayedUsers.length} utilisateurs sur {filteredUsers.length}
            {filteredUsers.length !== (users?.length || 0) && (
              <span className="text-slate-500"> (filtré de {users?.length || 0} total)</span>
            )}
          </span>
          {Object.values(filters).some(f => f !== '') && (
            <button
              onClick={() => setFilters({ fullName: '', email: '', role: '', companyName: '', isActive: '' })}
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
        isOpen={!!toggleConfirmId}
        onClose={() => setToggleConfirmId(null)}
        onConfirm={() => toggleConfirmId && toggleMutation.mutate(toggleConfirmId)}
        title={getUserStatus(toggleConfirmId || '') ? 'Bloquer cet utilisateur ?' : 'Réactiver cet utilisateur ?'}
        message="L'utilisateur ne pourra plus se connecter."
        confirmLabel={getUserStatus(toggleConfirmId || '') ? 'Bloquer' : 'Réactiver'}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
        title="Supprimer l'utilisateur ?"
        message="Attention : cette action est irréversible et supprimera l'historique associé."
        isDestructive={true}
        confirmLabel="Supprimer"
      />

      <ConfirmModal
        isOpen={!!resetPwdId}
        onClose={() => setResetPwdId(null)}
        onConfirm={() => resetPwdId && resetPwdMutation.mutate(resetPwdId)}
        title="Réinitialiser le mot de passe ?"
        message="Le mot de passe sera remplacé par une valeur temporaire que vous devrez communiquer à l'utilisateur."
        confirmLabel="Réinitialiser"
      />

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl p-6 max-w-md w-full shadow-card border border-accent/20 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">{editingUser ? 'Modifier l\'utilisateur' : 'Créer un utilisateur'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Nom Complet *</label>
                <input type="text" required className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white placeholder-slate-500 rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                  value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Email *</label>
                <input type="email" required className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white placeholder-slate-500 rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Nom d'utilisateur <span className="text-slate-500 text-xs">(optionnel, pour connexion facile)</span>
                </label>
                <input type="text" className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white placeholder-slate-500 rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                  placeholder="ex: admin, client1..."
                  value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-300">Mot de passe *</label>
                  <input type="password" required minLength={4} className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white placeholder-slate-500 rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                    placeholder="Minimum 4 caractères"
                    value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300">Rôle *</label>
                <select
                  className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                  value={formData.role}
                  onChange={e => handleRoleChange(e.target.value as UserRole)}
                >
                  <option value={UserRole.CLIENT_USER}>Client User (Lecture seule)</option>
                  <option value={UserRole.CLIENT_ADMIN}>Client Admin (Responsable compte)</option>
                  <option value={UserRole.PARTIAL_ADMIN}>Admin Partiel (Commandes)</option>
                  <option value={UserRole.FULL_ADMIN}>Admin Complet (Gestion globale)</option>
                  {!isFullAdmin && <option value={UserRole.SYSTEM_ADMIN}>Super Admin (Tout)</option>}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Société {!isInternalRole && '*'}</label>
                {isInternalRole ? (
                  <input
                    type="text"
                    readOnly
                    disabled
                    className="mt-1 w-full border border-accent/10 bg-brand-800/40 rounded-md p-2 text-slate-500 cursor-not-allowed"
                    value={config.companyLegalName || 'SoftNex'}
                  />
                ) : (
                  <select
                    className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                    value={formData.companyId}
                    onChange={(e) => setFormData({...formData, companyId: e.target.value})}
                    required
                  >
                    <option value="" disabled>Sélectionner une entreprise</option>
                    {companies?.filter(c => c.isActive).map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.dmsClientCode})</option>
                    ))}
                  </select>
                )}
              </div>

              {(createMutation.error || updateMutation.error) && (
                <div className="p-3 bg-neon-pink/10 border border-neon-pink/20 rounded-md text-neon-pink text-sm">
                  {(createMutation.error as any)?.message || (updateMutation.error as any)?.message || 'Une erreur est survenue'}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4 border-t border-accent/10 mt-4">
                <button type="button" onClick={closeModal} className="px-4 py-2 glass-light border border-accent/20 rounded-lg hover:border-accent/40 text-slate-200 hover:text-white">Annuler</button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover shadow-glow btn-glow disabled:opacity-50"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? 'Chargement...' : (editingUser ? 'Mettre à jour' : 'Créer')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminUsers;
