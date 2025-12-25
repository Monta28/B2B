import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

const ITEMS_PER_PAGE = 50;

type AuditLog = { id: string; timestamp: string; userEmail: string; action: string; details: string; ip?: string; };
type SortConfig = { key: keyof AuditLog; direction: 'asc' | 'desc'; };

export const AdminAudit = () => {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });

  // Column filtering state
  const [filters, setFilters] = useState({
    timestamp: '',
    userEmail: '',
    action: '',
    details: '',
    ip: '',
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Infinite scroll state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.admin.getAuditLogs()
  });

  // Filtered logs based on column filters
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      // Column filters
      if (filters.timestamp) {
        const logDateTime = new Date(log.timestamp).toLocaleString().toLowerCase();
        if (!logDateTime.includes(filters.timestamp.toLowerCase())) {
          return false;
        }
      }
      if (filters.userEmail && !log.userEmail.toLowerCase().includes(filters.userEmail.toLowerCase())) {
        return false;
      }
      if (filters.action && !log.action.toLowerCase().includes(filters.action.toLowerCase())) {
        return false;
      }
      if (filters.details && !log.details.toLowerCase().includes(filters.details.toLowerCase())) {
        return false;
      }
      if (filters.ip && !(log.ip || '').toLowerCase().includes(filters.ip.toLowerCase())) {
        return false;
      }

      // Date range filter
      const logDate = log.timestamp.split('T')[0];
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;

      return true;
    }).sort((a, b) => {
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, filters, startDate, endDate, sortConfig]);

  const handleSort = (key: keyof AuditLog) => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof AuditLog }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-500'}`}>▼</span>
  );

  // Logs to display (with infinite scroll pagination)
  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(0, displayCount);
  }, [filteredLogs, displayCount]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [filters, startDate, endDate]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (displayCount < filteredLogs.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredLogs.length));
      }
    }
  }, [displayCount, filteredLogs.length]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    if (!filteredLogs.length) return;
    const headers = ['Timestamp', 'User', 'Action', 'Details', 'IP'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log =>
        [log.timestamp, log.userEmail, log.action, `"${log.details.replace(/"/g, '""')}"`, log.ip || ''].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Dynamic table height
  const tableHeight = 'calc(100vh - 290px)';

  const hasActiveFilters = Object.values(filters).some(f => f !== '') || startDate || endDate;

  return (
    <div>
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit & Logs</h1>
          <p className="text-sm text-slate-400">Traçabilité complète des actions système.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto items-end">
           {/* Date Filters */}
           <div className="flex items-center space-x-2 bg-brand-900/40 p-1 rounded-lg border border-accent/20">
             <input
               type="date"
               className="text-xs border-none focus:ring-0 p-1 text-slate-200 bg-transparent"
               value={startDate}
               onChange={e => setStartDate(e.target.value)}
               title="Date début"
             />
             <span className="text-slate-500">-</span>
             <input
               type="date"
               className="text-xs border-none focus:ring-0 p-1 text-slate-200 bg-transparent"
               value={endDate}
               onChange={e => setEndDate(e.target.value)}
               title="Date fin"
             />
           </div>

           <div className="flex gap-2">
             <button
               onClick={handlePrint}
               className="glass-light border border-accent/20 text-slate-200 p-2 rounded-lg hover:border-accent/40 hover:text-white shadow-card transition-colors"
               title="Imprimer la liste affichée"
             >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
             </button>
             <button
               onClick={handleExport}
               className="bg-neon-green text-white p-2 rounded-lg hover:bg-neon-green/80 shadow-glow btn-glow flex items-center transition-colors"
               title="Exporter la liste affichée en CSV"
             >
               <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               <span className="text-sm font-bold">CSV</span>
             </button>
           </div>
        </div>
      </div>

      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden print:shadow-none print:border-none flex flex-col" style={{ height: 'calc(100vh - 280px)', maxHeight: 'calc(100vh - 280px)' }}>
        {/* Fixed header with filters */}
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full text-left table-fixed" style={{ minWidth: '900px' }}>
            <colgroup>
              <col style={{ width: '160px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              {/* Header row with sort */}
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('timestamp')}>
                  Horodatage <SortIcon columnKey="timestamp" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('userEmail')}>
                  Utilisateur <SortIcon columnKey="userEmail" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('action')}>
                  Action <SortIcon columnKey="action" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('details')}>
                  Détails <SortIcon columnKey="details" />
                </th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('ip')}>
                  IP <SortIcon columnKey="ip" />
                </th>
              </tr>
              {/* Filter row */}
              <tr className="bg-brand-900/40">
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.timestamp}
                    onChange={e => setFilters(f => ({ ...f, timestamp: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.userEmail}
                    onChange={e => setFilters(f => ({ ...f, userEmail: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.action}
                    onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.details}
                    onChange={e => setFilters(f => ({ ...f, details: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.ip}
                    onChange={e => setFilters(f => ({ ...f, ip: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  />
                </th>
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
          <table className="w-full text-left table-fixed" style={{ minWidth: '900px' }}>
            <colgroup>
              <col style={{ width: '160px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? (
                 <tr><td colSpan={5} className="text-center py-8 text-slate-400">Chargement...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="text-slate-500">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      <p className="font-medium">{logs?.length === 0 ? 'Aucun log' : 'Aucun résultat'}</p>
                      <p className="text-sm mt-1">
                        {logs?.length === 0 ? 'Aucune action enregistrée' : 'Essayez de modifier vos filtres'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : displayedLogs.map(log => (
                <tr key={log.id} className="hover:bg-brand-800/30 text-sm">
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-100 truncate" title={log.userEmail}>
                    {log.userEmail}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                      log.action.includes('CREATE') ? 'bg-neon-green/20 text-neon-green border border-neon-green/30' :
                      log.action.includes('UPDATE') ? 'bg-accent/20 text-accent border border-accent/30' :
                      log.action.includes('DELETE') ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/30' :
                      'bg-brand-800/50 text-slate-200 border border-accent/10'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 truncate" title={log.details}>
                    {log.details}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 font-mono text-xs">
                    {log.ip || '-'}
                  </td>
                </tr>
              ))}
              {/* Loading more indicator */}
              {displayCount < filteredLogs.length && (
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
            Affichage de {displayedLogs.length} logs sur {filteredLogs.length}
            {filteredLogs.length !== (logs?.length || 0) && (
              <span className="text-slate-500"> (filtré de {logs?.length || 0} total)</span>
            )}
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => { setFilters({ timestamp: '', userEmail: '', action: '', details: '', ip: '' }); setStartDate(''); setEndDate(''); }}
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
    </div>
  );
};

export default AdminAudit;
