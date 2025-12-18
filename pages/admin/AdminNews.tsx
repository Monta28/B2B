import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { NewsItem, NewsType } from '../../types';
import { ConfirmModal } from '../../components/ConfirmModal';

const ITEMS_PER_PAGE = 10;

type SortConfig = { key: keyof NewsItem; direction: 'asc' | 'desc'; };

export const AdminNews = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });

  // Column filtering state
  const [filters, setFilters] = useState({
    date: '',
    title: '',
    type: '' as '' | NewsType,
    isActive: '' as '' | 'active' | 'inactive',
  });

  // Infinite scroll state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Form State
  const [formData, setFormData] = useState<Omit<NewsItem, 'id'>>({
    title: '',
    content: '',
    type: 'INFO',
    date: new Date().toISOString().split('T')[0],
    isActive: true
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Fetch News (All, including inactive)
  const { data: newsItems, isLoading } = useQuery({
    queryKey: ['admin-news'],
    queryFn: () => api.getNews(false)
  });

  const createMutation = useMutation({
    mutationFn: api.admin.createNews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: api.admin.updateNews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: api.admin.deleteNews,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-news'] })
  });

  // Filtered and sorted news based on column filters
  const filteredNews = useMemo(() => {
    if (!newsItems) return [];
    return newsItems.filter(item => {
      if (filters.date && !item.date.includes(filters.date)) {
        return false;
      }
      if (filters.title && !item.title.toLowerCase().includes(filters.title.toLowerCase())) {
        return false;
      }
      if (filters.type && item.type !== filters.type) {
        return false;
      }
      if (filters.isActive === 'active' && !item.isActive) {
        return false;
      }
      if (filters.isActive === 'inactive' && item.isActive) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [newsItems, filters, sortConfig]);

  const handleSort = (key: keyof NewsItem) => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof NewsItem }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-500'}`}>▼</span>
  );

  // News to display (with infinite scroll pagination)
  const displayedNews = useMemo(() => {
    return filteredNews.slice(0, displayCount);
  }, [filteredNews, displayCount]);

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
      if (displayCount < filteredNews.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredNews.length));
      }
    }
  }, [displayCount, filteredNews.length]);

  const openModal = (item?: NewsItem) => {
    if (item) {
      setEditingId(item.id);
      setFormData({
        title: item.title,
        content: item.content,
        type: item.type,
        date: item.date,
        isActive: item.isActive
      });
    } else {
      setEditingId(null);
      setFormData({
        title: '',
        content: '',
        type: 'INFO',
        date: new Date().toISOString().split('T')[0],
        isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ ...formData, id: editingId });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des Actualités</h1>
          <p className="text-sm text-slate-400">Publiez des messages sur le tableau de bord des clients.</p>
        </div>
        <button onClick={() => openModal()} className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-semibold shadow-glow btn-glow flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nouveau Message
        </button>
      </div>

      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)', maxHeight: 'calc(100vh - 200px)' }}>
        {/* Fixed header with filters */}
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full text-left table-fixed" style={{ minWidth: '700px' }}>
            <colgroup>
              <col style={{ width: '120px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              {/* Header row with sort */}
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('date')}>
                  Date <SortIcon columnKey="date" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('title')}>
                  Titre <SortIcon columnKey="title" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('type')}>
                  Type <SortIcon columnKey="type" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('isActive')}>
                  Statut <SortIcon columnKey="isActive" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
              {/* Filter row */}
              <tr className="bg-brand-900/40">
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={filters.date}
                    onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.title}
                    onChange={e => setFilters(f => ({ ...f, title: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-4 py-2">
                  <select
                    value={filters.type}
                    onChange={e => setFilters(f => ({ ...f, type: e.target.value as '' | NewsType }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  >
                    <option value="">Tous</option>
                    <option value="INFO">INFO</option>
                    <option value="PROMO">PROMO</option>
                    <option value="WARNING">WARNING</option>
                  </select>
                </th>
                <th className="px-4 py-2">
                  <select
                    value={filters.isActive}
                    onChange={e => setFilters(f => ({ ...f, isActive: e.target.value as '' | 'active' | 'inactive' }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded px-1 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  >
                    <option value="">Tous</option>
                    <option value="active">Publié</option>
                    <option value="inactive">Brouillon</option>
                  </select>
                </th>
                <th className="px-4 py-2"></th>
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
          <table className="w-full text-left table-fixed" style={{ minWidth: '700px' }}>
            <colgroup>
              <col style={{ width: '120px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Chargement...</td></tr>
              ) : filteredNews.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="text-slate-500">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      <p className="font-medium">{newsItems?.length === 0 ? 'Aucune actualité' : 'Aucun résultat'}</p>
                      <p className="text-sm mt-1">
                        {newsItems?.length === 0 ? 'Créez un nouveau message' : 'Essayez de modifier vos filtres'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : displayedNews.map(item => (
                <tr key={item.id} className="hover:bg-brand-800/30">
                  <td className="px-4 py-3 text-sm text-slate-300">{item.date}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-white truncate" title={item.title}>{item.title}</div>
                    <div className="text-xs text-slate-400 truncate" title={item.content}>{item.content}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      item.type === 'WARNING' ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/30' :
                      item.type === 'PROMO' ? 'bg-neon-green/20 text-neon-green border border-neon-green/30' : 'bg-accent/20 text-accent border border-accent/30'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${item.isActive ? 'bg-neon-green/20 text-neon-green border-neon-green/30' : 'bg-brand-800/50 text-slate-400 border-accent/10'}`}>
                      {item.isActive ? 'PUBLIÉ' : 'BROUILLON'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => openModal(item)} className="p-1.5 text-accent hover:bg-accent/10 rounded transition-colors" title="Editer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 text-neon-pink hover:bg-neon-pink/10 rounded transition-colors" title="Supprimer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Loading more indicator */}
              {displayCount < filteredNews.length && (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-slate-500">
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
            Affichage de {displayedNews.length} actualités sur {filteredNews.length}
            {filteredNews.length !== (newsItems?.length || 0) && (
              <span className="text-slate-500"> (filtré de {newsItems?.length || 0} total)</span>
            )}
          </span>
          {Object.values(filters).some(f => f !== '') && (
            <button
              onClick={() => setFilters({ date: '', title: '', type: '', isActive: '' })}
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
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
        title="Supprimer cette actualité ?"
        message="Ce message ne sera plus visible pour aucun client. Cette action est irréversible."
        isDestructive={true}
        confirmLabel="Supprimer"
      />

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl p-6 max-w-md w-full shadow-card border border-accent/20">
            <h2 className="text-xl font-bold text-white mb-4">{editingId ? 'Modifier l\'actualité' : 'Nouvelle actualité'}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Titre</label>
                <input
                  type="text" required
                  className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white placeholder-slate-500 rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                  value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Contenu</label>
                <textarea
                  required rows={3}
                  className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white placeholder-slate-500 rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                  value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-medium text-slate-300">Type</label>
                   <select
                     className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                     value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as NewsType})}
                   >
                     <option value="INFO">Information (Bleu)</option>
                     <option value="PROMO">Promotion / Nouveauté (Vert)</option>
                     <option value="WARNING">Alerte / Important (Rouge)</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-slate-300">Date d'affichage</label>
                   <input
                     type="date" required
                     className="mt-1 w-full border border-accent/20 bg-brand-800/60 text-white rounded-md p-2 focus:ring-accent/30 focus:border-accent"
                     value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
                   />
                 </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox" id="active"
                  className="h-4 w-4 text-accent bg-brand-800/60 border-accent/30 rounded focus:ring-accent/40"
                  checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})}
                />
                <label htmlFor="active" className="text-sm font-medium text-slate-300">Publier immédiatement</label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-accent/10 mt-4">
                <button type="button" onClick={closeModal} className="px-4 py-2 glass-light border border-accent/20 rounded-lg hover:border-accent/40 text-slate-200 hover:text-white">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover shadow-glow btn-glow">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminNews;
