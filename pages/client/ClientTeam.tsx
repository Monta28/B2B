import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { UserRole, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';

type SortConfig = { key: keyof User; direction: 'asc' | 'desc'; };

export const ClientTeam = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });

  const [newUser, setNewUser] = useState({
    email: '', fullName: '', role: UserRole.CLIENT_USER
  });

  // Fetch only users for MY company
  const { data: users, isLoading } = useQuery({ 
    queryKey: ['team-users', user?.companyName], 
    queryFn: () => api.admin.getUsers(user?.companyName) 
  });

  const createMutation = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
      setIsModalOpen(false);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: api.admin.toggleUserStatus,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-users'] })
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    createMutation.mutate({
      ...newUser,
      companyName: user.companyName,
      dmsClientCode: user.dmsClientCode,
    });
  };

  const getUserStatus = (id: string) => users?.find(u => u.id === id)?.isActive;

  const sortedUsers = useMemo(() => {
    if (!users) return [];
    return [...users].sort((a, b) => {
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, sortConfig]);

  const handleSort = (key: keyof User) => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof User }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-500'}`}>▼</span>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Mon Équipe</h1>
          <p className="text-sm text-slate-400">Gérez les accès de vos collaborateurs à la plateforme.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-lg font-medium shadow-glow btn-glow">
          Inviter un membre
        </button>
      </div>

      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {/* Fixed header */}
        <div className="flex-shrink-0">
          <table className="w-full text-left table-fixed">
            <colgroup>
              <col style={{ width: '200px' }} />
              <col style={{ width: '250px' }} />
              <col style={{ width: '200px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('fullName')}>
                  Nom <SortIcon columnKey="fullName" />
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('email')}>
                  Email <SortIcon columnKey="email" />
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('role')}>
                  Rôle <SortIcon columnKey="role" />
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('isActive')}>
                  Statut <SortIcon columnKey="isActive" />
                </th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable table body */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left table-fixed">
            <colgroup>
              <col style={{ width: '200px' }} />
              <col style={{ width: '250px' }} />
              <col style={{ width: '200px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? <tr><td colSpan={4} className="p-4 text-center text-slate-400">Chargement...</td></tr> : sortedUsers?.map(u => (
                <tr key={u.id} className="hover:bg-brand-800/40">
                  <td className="px-6 py-4 font-medium text-white">{u.fullName}</td>
                  <td className="px-6 py-4 text-slate-400">{u.email}</td>
                  <td className="px-6 py-4 text-slate-300">
                    {u.role === UserRole.CLIENT_ADMIN ? 'Administrateur' : 'Utilisateur (Consultation)'}
                  </td>
                  <td className="px-6 py-4">
                    {/* Cannot deactivate self */}
                    {u.id !== user?.id && (
                       <button onClick={() => setToggleConfirmId(u.id)} className={`text-xs font-bold px-2 py-1 rounded border ${u.isActive ? 'bg-neon-green/20 text-neon-green border-neon-green/30' : 'bg-neon-pink/20 text-neon-pink border-neon-pink/30'}`}>
                         {u.isActive ? 'ACTIF' : 'BLOQUÉ'}
                       </button>
                    )}
                    {u.id === user?.id && <span className="text-xs text-slate-500">VOUS</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination info bar - bottom */}
        <div className="px-4 py-2 bg-brand-900/40 border-t border-accent/10 text-xs text-slate-400 flex-shrink-0">
          Affichage de {sortedUsers?.length || 0} membre(s)
        </div>
      </div>

      <ConfirmModal
        isOpen={!!toggleConfirmId}
        onClose={() => setToggleConfirmId(null)}
        onConfirm={() => toggleConfirmId && toggleMutation.mutate(toggleConfirmId)}
        title={getUserStatus(toggleConfirmId || '') ? 'Bloquer ce collaborateur ?' : 'Réactiver ce collaborateur ?'}
        message={
          getUserStatus(toggleConfirmId || '')
            ? "Ce collaborateur ne pourra plus se connecter."
            : "L'accès sera rétabli immédiatement."
        }
        isDestructive={getUserStatus(toggleConfirmId || '') || false}
      />

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl p-6 max-w-md w-full shadow-card border border-accent/20 animate-fadeIn">
            <h2 className="text-xl font-bold mb-4 text-white">Ajouter un collaborateur</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" placeholder="Nom complet" required className="w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 p-2 rounded focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} />
              <input type="email" placeholder="Email" required className="w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 p-2 rounded focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />

              <select className="w-full border border-accent/20 bg-brand-800/60 text-slate-100 p-2 rounded focus:ring-1 focus:ring-accent/40 focus:border-accent/40" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
                <option value={UserRole.CLIENT_USER}>Utilisateur (Catalogue & Prix)</option>
                <option value={UserRole.CLIENT_ADMIN}>Administrateur (Gestion & Commandes)</option>
              </select>

              <div className="flex justify-end space-x-2 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-accent/20 rounded text-slate-300 hover:bg-brand-800/60">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/80 shadow-glow btn-glow">Ajouter</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};