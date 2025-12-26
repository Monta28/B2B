
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ProductTableRow } from '../components/ProductTableRow';
import { Product, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';

// OPTIMISATION: Réduction de la taille de page pour des réponses plus rapides
const PAGE_SIZE = 50;

type SortKey = keyof Product | 'price';
type SortDirection = 'asc' | 'desc';

// Hook personnalisé pour le Debounce OPTIMISÉ (500ms au lieu de 300ms)
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export const Catalog = () => {
  const { hasRole } = useAuth();
  const { config: appConfig } = useConfig();

  // Global search (searches all fields)
  const [globalSearch, setGlobalSearch] = useState('');

  // Search zones (above table)
  const [searchReference, setSearchReference] = useState('');
  const [searchDesignation, setSearchDesignation] = useState('');
  const [searchCodeOrigine, setSearchCodeOrigine] = useState('');

  // Column filters (in table header)
  const [filterReference, setFilterReference] = useState('');
  const [filterCodeOEM, setFilterCodeOEM] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [filterPrice, setFilterPrice] = useState('');

  // OPTIMISATION: Debounce augmenté à 500ms pour réduire les appels API
  const debouncedGlobalSearch = useDebounce(globalSearch, 500);
  const debouncedSearchRef = useDebounce(searchReference, 500);
  const debouncedSearchDesig = useDebounce(searchDesignation, 500);
  const debouncedSearchOrigine = useDebounce(searchCodeOrigine, 500);
  // Filtres locaux restent à 300ms car pas d'appel API
  const debouncedFilterRef = useDebounce(filterReference, 300);
  const debouncedFilterCodeOEM = useDebounce(filterCodeOEM, 300);
  const debouncedFilterDesig = useDebounce(filterDesignation, 300);
  const debouncedFilterStock = useDebounce(filterStock, 300);
  const debouncedFilterPrice = useDebounce(filterPrice, 300);

  // QueryClient pour annuler les requêtes en cours
  const queryClient = useQueryClient();

  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'designation', direction: 'asc' });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const isInternal = hasRole([UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]);
  const isClient = hasRole([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]);

  // Build search params object from global search OR the 3 specific search zones
  const searchParams = useMemo(() => {
    // If global search is used, use 'q' parameter (searches all fields)
    if (debouncedGlobalSearch) {
      return {
        q: debouncedGlobalSearch,
      };
    }
    // Otherwise use specific field searches
    return {
      ref: debouncedSearchRef || undefined,
      desig: debouncedSearchDesig || undefined,
      origine: debouncedSearchOrigine || undefined,
    };
  }, [debouncedGlobalSearch, debouncedSearchRef, debouncedSearchDesig, debouncedSearchOrigine]);

  // OPTIMISATION: Annuler les requêtes en cours quand les paramètres changent
  useEffect(() => {
    // Annuler les requêtes précédentes avec l'ancienne clé
    return () => {
      queryClient.cancelQueries({ queryKey: ['products'] });
    };
  }, [searchParams, queryClient]);

  // Get catalog load mode from config (default: 'auto')
  const catalogLoadMode = appConfig?.catalogLoadMode || 'auto';
  const hasAnySearchParam = !!(debouncedGlobalSearch || debouncedSearchRef || debouncedSearchDesig || debouncedSearchOrigine);
  const shouldFetch = catalogLoadMode === 'auto' || hasAnySearchParam;

  // Infinite Query for server-side pagination
  const {
    data,
    isLoading,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['products', searchParams],
    queryFn: ({ pageParam = 0 }) => api.searchProducts({
      ...searchParams,
      limit: PAGE_SIZE,
      offset: pageParam,
    }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((acc, page) => acc + page.data.length, 0);
      return loadedCount < lastPage.total ? loadedCount : undefined;
    },
    initialPageParam: 0,
    staleTime: 30000,
    enabled: !!shouldFetch,
  });

  // Flatten all pages into single array
  const products = useMemo(() => {
    return data?.pages.flatMap(page => page.data) || [];
  }, [data]);

  // Get total count from first page
  const totalCount = data?.pages[0]?.total || 0;

  // Filter and sort products (client-side filtering on loaded data)
  const filteredAndSortedProducts = useMemo(() => {
    if (!products) return [];

    // Apply column filters from table header
    let result = products.filter(p => {
      const matchRef = !debouncedFilterRef ||
        (p.reference?.toLowerCase().includes(debouncedFilterRef.toLowerCase()));
      const matchCodeOEM = !debouncedFilterCodeOEM ||
        (p.codeOrigine?.toLowerCase().includes(debouncedFilterCodeOEM.toLowerCase()));
      const matchDesig = !debouncedFilterDesig ||
        (p.designation?.toLowerCase().includes(debouncedFilterDesig.toLowerCase()));
      const matchStock = !debouncedFilterStock ||
        (debouncedFilterStock === 'instock' ? p.stock > 0 : debouncedFilterStock === 'outofstock' ? p.stock <= 0 : true);
      const matchPrice = !debouncedFilterPrice ||
        ((p.priceHT || p.pricePublic)?.toString().includes(debouncedFilterPrice));
      return matchRef && matchCodeOEM && matchDesig && matchStock && matchPrice;
    });

    // Sort by stock availability first, then user criteria
    result.sort((a, b) => {
      const aInStock = a.stock > 0 ? 1 : 0;
      const bInStock = b.stock > 0 ? 1 : 0;

      if (aInStock !== bInStock) {
        return bInStock - aInStock;
      }

      let aValue: any = a[sortConfig.key as keyof Product];
      let bValue: any = b[sortConfig.key as keyof Product];

      if (sortConfig.key === 'price') {
        aValue = a.priceHT || a.pricePublic;
        bValue = b.priceHT || b.pricePublic;
      }

      if (aValue === undefined || bValue === undefined) return 0;

      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue as string)
          : (bValue as string).localeCompare(aValue);
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, sortConfig, debouncedFilterRef, debouncedFilterCodeOEM, debouncedFilterDesig, debouncedFilterStock, debouncedFilterPrice]);

  const handleSort = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Infinite scroll handler - load more pages from server when near bottom
  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Trigger load when within 200px of bottom and more data available
    if (scrollHeight - scrollTop <= clientHeight + 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return <span className="ml-1 text-slate-500 opacity-50">↕</span>;
    return <span className="ml-1 text-accent font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  // Clear all filters
  const clearAllFilters = () => {
    setGlobalSearch('');
    setSearchReference('');
    setSearchDesignation('');
    setSearchCodeOrigine('');
    setFilterReference('');
    setFilterCodeOEM('');
    setFilterDesignation('');
    setFilterStock('');
    setFilterPrice('');
  };

  const hasAnyFilter = globalSearch || searchReference || searchDesignation || searchCodeOrigine ||
    filterReference || filterCodeOEM || filterDesignation || filterStock || filterPrice;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Catalogue Pieces</h1>
          <p className="text-slate-400 text-sm">Prix et disponibilité en temps reel.</p>
        </div>

        <div className="flex gap-3 items-center">
          {hasAnyFilter && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm font-medium text-neon-pink hover:bg-neon-pink/10 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Effacer tout
            </button>
          )}
        </div>
      </div>

      {/* Zone de Recherche Unifiee */}
      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-4">
        {/* Recherche Globale */}
        <div className="relative mb-4">
          <label className="block text-xs font-bold text-accent uppercase tracking-wider mb-2">
            <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            Recherche Globale
            <span className="ml-2 font-normal text-slate-400">(ref, designation, code OEM, marque...)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                // Clear specific fields when using global search
                if (e.target.value) {
                  setSearchReference('');
                  setSearchDesignation('');
                  setSearchCodeOrigine('');
                }
              }}
              placeholder="Tapez n'importe quel mot pour rechercher dans tous les champs..."
              className="w-full px-4 py-3 border border-accent/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 bg-brand-800/60 text-slate-100 placeholder-slate-500"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Separateur */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recherche avancee</span>
          <div className="flex-1 h-px bg-accent/10"></div>
        </div>

        {/* Recherche Avancee */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Code Article
            </label>
            <input
              type="text"
              value={searchReference}
              onChange={(e) => {
                setSearchReference(e.target.value);
                if (e.target.value) setGlobalSearch(''); // Clear global when using specific
              }}
              placeholder="Rechercher par code article..."
              className="w-full px-3 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!!globalSearch}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Code OEM
            </label>
            <input
              type="text"
              value={searchCodeOrigine}
              onChange={(e) => {
                setSearchCodeOrigine(e.target.value);
                if (e.target.value) setGlobalSearch(''); // Clear global when using specific
              }}
              placeholder="Rechercher par code OEM..."
              className="w-full px-3 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!!globalSearch}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Designation
            </label>
            <input
              type="text"
              value={searchDesignation}
              onChange={(e) => {
                setSearchDesignation(e.target.value);
                if (e.target.value) setGlobalSearch(''); // Clear global when using specific
              }}
              placeholder="Rechercher par designation..."
              className="w-full px-3 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!!globalSearch}
            />
          </div>
        </div>
        {isFetching && (
          <div className="mt-3 flex items-center gap-2 text-sm text-accent">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Recherche en cours...
          </div>
        )}
      </div>

      {/* Table Content */}
      {isLoading ? (
        <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-6 animate-pulse space-y-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-brand-800/60 rounded"></div>)}
        </div>
      ) : isError ? (
        <div className="text-center py-12 bg-neon-pink/10 rounded-2xl border border-neon-pink/30 text-neon-pink">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <p className="font-bold">Erreur de connexion</p>
          <p className="text-sm">Impossible de recuperer le catalogue. Veuillez reessayer.</p>
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 380px)', maxHeight: 'calc(100vh - 380px)' }}>
          {/* Fixed header with column filters */}
          <div className="flex-shrink-0 overflow-x-auto lg:overflow-x-hidden">
            <table className="w-full text-left table-fixed min-w-[800px] lg:min-w-0">
              <colgroup>
                <col className="w-[120px] lg:w-[12%]" />
                <col className="w-[120px] lg:w-[12%]" />
                <col className="w-auto" />
                <col className="w-[100px] lg:w-[10%]" />
                <col className="w-[100px] lg:w-[10%]" />
                <col className="w-[70px] lg:w-[7%]" />
                {!isInternal && <col className="w-[120px] lg:w-[12%]" />}
              </colgroup>
              <thead className="bg-brand-900/50 border-b border-accent/10">
                {/* Header row with sort */}
                <tr>
                  <th
                    className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none"
                    onClick={() => handleSort('reference')}
                  >
                    Reference <SortIcon columnKey="reference" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none"
                    onClick={() => handleSort('codeOrigine')}
                  >
                    Code OEM <SortIcon columnKey="codeOrigine" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none"
                    onClick={() => handleSort('designation')}
                  >
                    Designation <SortIcon columnKey="designation" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer hover:bg-brand-800/40 select-none"
                    onClick={() => handleSort('stock')}
                  >
                    {isClient ? 'Disponibilité' : 'Stock'} <SortIcon columnKey="stock" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:bg-brand-800/40 select-none"
                    onClick={() => handleSort('price')}
                  >
                    Prix HT <SortIcon columnKey="price" />
                  </th>
                  <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">
                    TVA
                  </th>
                  {!isInternal && (
                    <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                      Action
                    </th>
                  )}
                </tr>
                {/* Filter row */}
                <tr className="bg-brand-900/40">
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      value={filterReference}
                      onChange={(e) => setFilterReference(e.target.value)}
                      placeholder="Filtrer..."
                      className="w-full px-2 py-1 text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      value={filterCodeOEM}
                      onChange={(e) => setFilterCodeOEM(e.target.value)}
                      placeholder="Filtrer..."
                      className="w-full px-2 py-1 text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      value={filterDesignation}
                      onChange={(e) => setFilterDesignation(e.target.value)}
                      placeholder="Filtrer..."
                      className="w-full px-2 py-1 text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <select
                      value={filterStock}
                      onChange={(e) => setFilterStock(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-accent/20 bg-brand-800/60 text-slate-100 rounded focus:outline-none focus:ring-1 focus:ring-accent/30"
                    >
                      <option value="">Tous</option>
                      <option value="instock">En stock</option>
                      <option value="outofstock">Rupture</option>
                    </select>
                  </th>
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      value={filterPrice}
                      onChange={(e) => setFilterPrice(e.target.value)}
                      placeholder="Filtrer..."
                      className="w-full px-2 py-1 text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-accent/30 text-right"
                    />
                  </th>
                  <th className="px-3 py-2"></th>
                  {!isInternal && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
            </table>
          </div>
          {/* Scrollable body */}
          <div
            ref={tableContainerRef}
            onScroll={handleTableScroll}
            className="overflow-y-auto flex-1 overflow-x-auto lg:overflow-x-hidden"
          >
            <table className="w-full text-left table-fixed min-w-[800px] lg:min-w-0">
              <colgroup>
                <col className="w-[120px] lg:w-[12%]" />
                <col className="w-[120px] lg:w-[12%]" />
                <col className="w-auto" />
                <col className="w-[100px] lg:w-[10%]" />
                <col className="w-[100px] lg:w-[10%]" />
                <col className="w-[70px] lg:w-[7%]" />
                {!isInternal && <col className="w-[120px] lg:w-[12%]" />}
              </colgroup>
              <tbody className="divide-y divide-accent/10">
                {filteredAndSortedProducts.length > 0 ? (
                  filteredAndSortedProducts.map(product => (
                    <ProductTableRow key={product.reference} product={product} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={isInternal ? 6 : 7} className="px-6 py-16 text-center text-slate-500">
                      <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                      Aucun produit trouve
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {(hasNextPage || isFetchingNextPage) && (
              <div className="flex justify-center py-4 border-t border-accent/10">
                <div className="flex items-center gap-2 text-slate-400">
                  <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Chargement... ({products.length}/{totalCount})</span>
                </div>
              </div>
            )}
          </div>
          {/* Pagination info bar */}
          <div className="px-4 py-2 bg-brand-900/40 border-t border-accent/10 text-xs text-slate-400 flex-shrink-0 flex justify-between items-center">
            <span>
              Affichage de {filteredAndSortedProducts.length} produits charges sur {totalCount} total
              {hasNextPage && (
                <span className="ml-2 text-accent">(scroll pour charger plus)</span>
              )}
            </span>
            {hasAnyFilter && (
              <button
                onClick={clearAllFilters}
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
      )}
    </div>
  );
};
