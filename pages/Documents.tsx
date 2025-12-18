
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { UserRole, Document } from '../types';
import { useConfig } from '../context/ConfigContext';
import { generateDocumentPdf, DocumentPdfData } from '../services/pdf-generator';

const ITEMS_PER_PAGE = 10;

type DocTab = 'INVOICE' | 'BL';
type SortConfig = { key: keyof Document | 'companyName'; direction: 'asc' | 'desc'; };

// Interface for document detail with lines
interface DocumentDetail {
  type: 'INVOICE' | 'BL';
  dmsRef: string;
  date: string;
  companyName?: string;
  codeClient?: string;
  totalHT: number;
  totalTVA?: number;
  totalTTC: number;
  observation?: string;
  lines: {
    numLigne: number;
    codeArticle: string;
    designation: string;
    quantite: number;
    prixUnitaire: number;
    remise?: number;
    tauxTVA?: number;
    montantHT: number;
    montantTTC?: number;
    numBL?: string;
    dateBL?: string;
  }[];
}

export const Documents = () => {
  const { user, hasRole } = useAuth();
  const { formatPriceWithCurrency, config } = useConfig();
  const isInternal = hasRole([UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]);

  const [activeTab, setActiveTab] = useState<DocTab>('INVOICE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });

  // Column filtering state
  const [filters, setFilters] = useState({
    companyName: '',
    dmsRef: '',
    date: '',
    totalHT: '',
    totalTTC: '',
    numFacture: '',
  });

  // Infinite scroll state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Preview modal state
  const [previewDoc, setPreviewDoc] = useState<DocumentDetail | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

  // Queries
  const { data: companies } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: api.admin.getCompanies,
    enabled: isInternal
  });

  const { data: docs, isLoading } = useQuery({
    queryKey: ['documents', isInternal ? 'all' : user?.companyName],
    queryFn: () => api.getDocuments(isInternal ? undefined : user?.companyName),
  });

  // Filtered and sorted documents
  const filteredDocs = useMemo(() => {
    if (!docs) return [];

    let result = [...docs];

    // Filter by Tab (Type)
    result = result.filter(d => d.type === activeTab);

    // Column filters
    if (isInternal && filters.companyName) {
      result = result.filter(d =>
        ((d as any).companyName || '').toLowerCase().includes(filters.companyName.toLowerCase())
      );
    }

    if (filters.dmsRef) {
      result = result.filter(d =>
        d.dmsRef.toLowerCase().includes(filters.dmsRef.toLowerCase())
      );
    }

    if (filters.date) {
      result = result.filter(d =>
        d.date.includes(filters.date)
      );
    }

    if (filters.totalHT) {
      const htFilter = filters.totalHT.toLowerCase();
      result = result.filter(d =>
        String(d.totalHT || d.amount || 0).toLowerCase().includes(htFilter)
      );
    }

    if (filters.totalTTC) {
      const ttcFilter = filters.totalTTC.toLowerCase();
      result = result.filter(d =>
        String(d.totalTTC || 0).toLowerCase().includes(ttcFilter)
      );
    }

    if (filters.numFacture && activeTab === 'BL') {
      const numFactFilter = filters.numFacture.toLowerCase();
      result = result.filter(d =>
        (d.numFacture || 'non facturé').toLowerCase().includes(numFactFilter)
      );
    }

    // Date range filter
    if (startDate) {
      result = result.filter(d => d.date >= startDate);
    }
    if (endDate) {
      result = result.filter(d => d.date <= endDate);
    }

    // Sort
    result.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof Document];
      let bValue: any = b[sortConfig.key as keyof Document];

      if (sortConfig.key === 'companyName') {
        aValue = (a as any).companyName || '';
        bValue = (b as any).companyName || '';
      }

      if (aValue === undefined || aValue === null) aValue = '';
      if (bValue === undefined || bValue === null) bValue = '';

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [docs, filters, isInternal, activeTab, startDate, endDate, sortConfig]);

  const handleSort = (key: keyof Document | 'companyName') => setSortConfig(current => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  }));

  const SortIcon = ({ columnKey }: { columnKey: keyof Document | 'companyName' }) => (
    <span className={`ml-1 inline-block transition-transform duration-200 ${sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'rotate-180 text-accent' : 'text-accent') : 'text-slate-500'}`}>▼</span>
  );

  // Documents to display (with infinite scroll pagination)
  const displayedDocs = useMemo(() => {
    return filteredDocs.slice(0, displayCount);
  }, [filteredDocs, displayCount]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [filters, activeTab, startDate, endDate]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (displayCount < filteredDocs.length) {
        setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredDocs.length));
      }
    }
  }, [displayCount, filteredDocs.length]);

  // Dynamic table height
  const tableHeight = 'calc(100vh - 340px)';

  const hasActiveFilters = Object.values(filters).some(f => f !== '') || startDate || endDate;

  // Handle PDF download with DUPLICATA watermark
  const handleDownload = async (doc: any, summaryOnly: boolean = false) => {
    if (downloadingId) return; // Prevent double clicks

    setDownloadingId(doc.id + (summaryOnly ? '_summary' : ''));
    try {
      let documentDetail: any = null;

      if (doc.type === 'INVOICE') {
        documentDetail = await api.getInvoiceDetail(doc.dmsRef);
      } else {
        documentDetail = await api.getDeliveryNoteDetail(doc.dmsRef);
      }

      console.log('[Documents] Document detail from API:', JSON.stringify(documentDetail, null, 2));
      console.log('[Documents] Lines count:', documentDetail?.lines?.length);
      console.log('[Documents] Lines array:', documentDetail?.lines);

      if (!documentDetail) {
        toast.error('Document non trouvé');
        return;
      }

      // Prepare data for PDF generation
      const pdfData: DocumentPdfData = {
        type: doc.type,
        dmsRef: doc.dmsRef,
        date: documentDetail.date || doc.date,
        companyName: documentDetail.companyName || (doc as any).companyName,
        codeClient: documentDetail.codeClient,
        totalHT: documentDetail.totalHT || doc.amount || 0,
        totalTVA: documentDetail.totalTVA,
        totalTTC: documentDetail.totalTTC,
        observation: documentDetail.observation,
        lines: (documentDetail.lines || []).map((line: any, idx: number) => ({
          numLigne: line.numLigne || idx + 1,
          codeArticle: line.codeArticle || '',
          designation: line.designation || '',
          quantite: line.quantite || 0,
          prixUnitaire: line.prixUnitaire || 0,
          remise: line.remise,
          tauxTVA: line.tauxTVA,
          montantHT: line.montantHT || 0,
          montantTTC: line.montantTTC,
          numBL: line.numBL,
          dateBL: line.dateBL,
        })),
      };

      // Check if invoice has BL grouping info
      const hasBLInfo = doc.type === 'INVOICE' && pdfData.lines.some(l => l.numBL);

      // Pass company info to PDF generator
      generateDocumentPdf(pdfData, {
        currencySymbol: config.currencySymbol,
        decimalPlaces: config.decimalPlaces,
        summaryOnly: summaryOnly && hasBLInfo, // Only use summary mode if we have BL info
        companyInfo: {
          companyName: config.companyName,
          companyAddress: config.companyAddress,
          companyPostalCode: config.companyPostalCode,
          companyCity: config.companyCity,
          companyCountry: config.companyCountry,
          companyPhone: config.companyPhone,
          companyFax: config.companyFax,
          companyEmail: config.companyEmail,
          companyWebsite: config.companyWebsite,
          companyTaxId: config.companyTaxId,
          companyRegistration: config.companyRegistration,
          companyCapital: config.companyCapital,
          companyBankName: config.companyBankName,
          companyBankRib: config.companyBankRib,
          documentLogoUrl: config.documentLogoUrl,
          documentFooterText: config.documentFooterText,
        },
      });
      toast.success(summaryOnly ? 'Récapitulatif téléchargé' : 'Document téléchargé avec succès');
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle document preview
  const handlePreview = async (doc: any) => {
    if (loadingPreview) return;

    setLoadingPreview(doc.id);
    try {
      let documentDetail: any = null;

      if (doc.type === 'INVOICE') {
        documentDetail = await api.getInvoiceDetail(doc.dmsRef);
      } else {
        documentDetail = await api.getDeliveryNoteDetail(doc.dmsRef);
      }

      if (!documentDetail) {
        toast.error('Document non trouvé');
        return;
      }

      const detail: DocumentDetail = {
        type: doc.type,
        dmsRef: doc.dmsRef,
        date: documentDetail.date || doc.date,
        companyName: documentDetail.companyName || (doc as any).companyName,
        codeClient: documentDetail.codeClient,
        totalHT: documentDetail.totalHT || doc.amount || 0,
        totalTVA: documentDetail.totalTVA,
        totalTTC: documentDetail.totalTTC || 0,
        observation: documentDetail.observation,
        lines: (documentDetail.lines || []).map((line: any, idx: number) => ({
          numLigne: line.numLigne || idx + 1,
          codeArticle: line.codeArticle || '',
          designation: line.designation || '',
          quantite: line.quantite || 0,
          prixUnitaire: line.prixUnitaire || 0,
          remise: line.remise,
          tauxTVA: line.tauxTVA,
          montantHT: line.montantHT || 0,
          montantTTC: line.montantTTC,
          numBL: line.numBL,
          dateBL: line.dateBL,
        })),
      };

      setPreviewDoc(detail);
    } catch (error) {
      console.error('Error loading document preview:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoadingPreview(null);
    }
  };

  // Group lines by BL for invoice preview
  const groupLinesByBL = (lines: DocumentDetail['lines']) => {
    const groups: Map<string, { numBL: string; dateBL?: string; lines: typeof lines; totalHT: number }> = new Map();
    const noBlLines: typeof lines = [];

    lines.forEach(line => {
      if (line.numBL) {
        const existing = groups.get(line.numBL);
        if (existing) {
          existing.lines.push(line);
          existing.totalHT += line.montantHT;
        } else {
          groups.set(line.numBL, {
            numBL: line.numBL,
            dateBL: line.dateBL,
            lines: [line],
            totalHT: line.montantHT,
          });
        }
      } else {
        noBlLines.push(line);
      }
    });

    const result = Array.from(groups.values()).sort((a, b) => a.numBL.localeCompare(b.numBL));
    if (noBlLines.length > 0) {
      result.push({
        numBL: '',
        dateBL: undefined,
        lines: noBlLines,
        totalHT: noBlLines.reduce((sum, l) => sum + l.montantHT, 0),
      });
    }
    return result;
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-sm text-slate-400">
            Consultez vos factures et bons de livraison.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          {/* Date Filters */}
          <div className="flex items-center space-x-2 glass-light p-1 rounded-lg border border-accent/20">
            <input
              type="date"
              className="text-xs border-none focus:ring-0 p-1 text-slate-300 bg-transparent"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              title="Date début"
            />
            <span className="text-slate-500">-</span>
            <input
              type="date"
              className="text-xs border-none focus:ring-0 p-1 text-slate-300 bg-transparent"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              title="Date fin"
            />
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="border-b border-accent/10 mb-4">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('INVOICE')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${activeTab === 'INVOICE'
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-400 hover:text-white hover:border-accent/30'}
            `}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Factures
          </button>
          <button
            onClick={() => setActiveTab('BL')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${activeTab === 'BL'
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-400 hover:text-white hover:border-accent/30'}
            `}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            Bons de Livraison
          </button>
        </nav>
      </div>

      <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)', maxHeight: 'calc(100vh - 280px)' }}>
        {/* Fixed header with filters */}
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full text-left table-fixed" style={{ minWidth: isInternal ? (activeTab === 'BL' ? '1050px' : '950px') : (activeTab === 'BL' ? '850px' : '750px') }}>
            <colgroup>
              {isInternal && <col style={{ width: '180px' }} />}
              <col style={{ width: '130px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              {activeTab === 'BL' && <col style={{ width: '130px' }} />}
              <col style={{ width: '130px' }} />
            </colgroup>
            <thead className="bg-brand-900/50 border-b border-accent/10">
              {/* Header row with sort */}
              <tr>
                {isInternal && (
                  <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('companyName')}>
                    Client <SortIcon columnKey="companyName" />
                  </th>
                )}
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('dmsRef')}>
                  Référence <SortIcon columnKey="dmsRef" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('date')}>
                  Date <SortIcon columnKey="date" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('totalHT')}>
                  Montant HT <SortIcon columnKey="totalHT" />
                </th>
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('totalTTC')}>
                  Montant TTC <SortIcon columnKey="totalTTC" />
                </th>
                {activeTab === 'BL' && (
                  <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-brand-800/40 select-none" onClick={() => handleSort('numFacture')}>
                    N° Facture <SortIcon columnKey="numFacture" />
                  </th>
                )}
                <th className="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Actions</th>
              </tr>
              {/* Filter row */}
              <tr className="bg-brand-900/40">
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
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.date}
                    onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.totalHT}
                    onChange={e => setFilters(f => ({ ...f, totalHT: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  />
                </th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Filtrer..."
                    value={filters.totalTTC}
                    onChange={e => setFilters(f => ({ ...f, totalTTC: e.target.value }))}
                    className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                  />
                </th>
                {activeTab === 'BL' && (
                  <th className="px-3 py-2">
                    <input
                      type="text"
                      placeholder="Filtrer..."
                      value={filters.numFacture}
                      onChange={e => setFilters(f => ({ ...f, numFacture: e.target.value }))}
                      className="w-full text-xs border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                    />
                  </th>
                )}
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
          <table className="w-full text-left table-fixed" style={{ minWidth: isInternal ? (activeTab === 'BL' ? '1050px' : '950px') : (activeTab === 'BL' ? '850px' : '750px') }}>
            <colgroup>
              {isInternal && <col style={{ width: '180px' }} />}
              <col style={{ width: '130px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              {activeTab === 'BL' && <col style={{ width: '130px' }} />}
              <col style={{ width: '130px' }} />
            </colgroup>
            <tbody className="divide-y divide-accent/10">
              {isLoading ? (
                <tr>
                  <td colSpan={isInternal ? (activeTab === 'BL' ? 7 : 6) : (activeTab === 'BL' ? 6 : 5)} className="px-6 py-8 text-center text-slate-500">Chargement...</td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={isInternal ? (activeTab === 'BL' ? 7 : 6) : (activeTab === 'BL' ? 6 : 5)} className="text-center py-12">
                    <div className="text-slate-500">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="font-medium text-slate-400">{docs?.length === 0 ? 'Aucun document' : 'Aucun résultat'}</p>
                      <p className="text-sm mt-1">
                        {docs?.length === 0 ? 'Aucun document disponible' : 'Essayez de modifier vos filtres'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : displayedDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-brand-800/40 text-sm">
                  {isInternal && (
                    <td className="px-3 py-3 font-bold text-white truncate" title={(doc as any).companyName}>
                      {(doc as any).companyName}
                    </td>
                  )}
                  <td className="px-3 py-3 font-medium text-accent">{doc.dmsRef}</td>
                  <td className="px-3 py-3 text-slate-400">{doc.date}</td>
                  <td className="px-3 py-3 text-right font-medium text-accent">
                    {(doc.totalHT || doc.amount) > 0 ? formatPriceWithCurrency(doc.totalHT || doc.amount) : '-'}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-neon-green">
                    {doc.totalTTC > 0 ? formatPriceWithCurrency(doc.totalTTC) : '-'}
                  </td>
                  {activeTab === 'BL' && (
                    <td className="px-3 py-3">
                      {doc.numFacture ? (
                        <span className="text-accent font-medium">{doc.numFacture}</span>
                      ) : (
                        <span className="text-slate-500 italic text-xs">Non facturé</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {/* Preview button */}
                      <button
                        onClick={() => handlePreview(doc)}
                        disabled={!!loadingPreview}
                        className={`flex items-center justify-center transition-colors p-2 rounded-full ${loadingPreview === doc.id
                          ? 'text-accent cursor-wait'
                          : 'text-slate-500 hover:text-accent hover:bg-accent/10'
                          }`}
                        title="Visualiser le document"
                      >
                        {loadingPreview === doc.id ? (
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                      {/* Main download button */}
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={!!downloadingId}
                        className={`flex items-center justify-center transition-colors p-2 rounded-full ${downloadingId === doc.id
                          ? 'text-accent cursor-wait'
                          : 'text-slate-500 hover:text-neon-pink hover:bg-neon-pink/10'
                          }`}
                        title="Télécharger PDF complet (DUPLICATA)"
                      >
                        {downloadingId === doc.id ? (
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      {/* Summary download button (only for invoices) */}
                      {activeTab === 'INVOICE' && (
                        <button
                          onClick={() => handleDownload(doc, true)}
                          disabled={!!downloadingId}
                          className={`flex items-center justify-center transition-colors p-2 rounded-full ${downloadingId === doc.id + '_summary'
                            ? 'text-accent cursor-wait'
                            : 'text-slate-500 hover:text-neon-green hover:bg-neon-green/10'
                            }`}
                          title="Télécharger récapitulatif BL"
                        >
                          {downloadingId === doc.id + '_summary' ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {/* Loading more indicator */}
              {displayCount < filteredDocs.length && (
                <tr>
                  <td colSpan={isInternal ? (activeTab === 'BL' ? 7 : 6) : (activeTab === 'BL' ? 6 : 5)} className="text-center py-4 text-slate-500">
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
            Affichage de {displayedDocs.length} documents sur {filteredDocs.length}
            {filteredDocs.length !== (docs?.filter(d => d.type === activeTab).length || 0) && (
              <span className="text-slate-500"> (filtré de {docs?.filter(d => d.type === activeTab).length || 0} total)</span>
            )}
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => { setFilters({ companyName: '', dmsRef: '', date: '', totalHT: '', totalTTC: '', numFacture: '' }); setStartDate(''); setEndDate(''); }}
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

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewDoc(null)}>
          <div
            className="bg-brand-900 border border-accent/20 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header with close button */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-accent/10">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Aperçu du document</span>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-2 rounded-full hover:bg-brand-800 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Company Header */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b border-accent/10">
                {/* Left: Logo and Company Info */}
                <div className="flex items-start gap-4">
                  {config.documentLogoUrl && (
                    <img
                      src={config.documentLogoUrl}
                      alt="Logo"
                      className="h-16 w-auto object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div>
                    {config.companyName && (
                      <h3 className="text-lg font-bold text-accent">{config.companyName}</h3>
                    )}
                    {config.companyAddress && (
                      <p className="text-xs text-slate-400">{config.companyAddress}</p>
                    )}
                    {(config.companyPostalCode || config.companyCity) && (
                      <p className="text-xs text-slate-400">
                        {[config.companyPostalCode, config.companyCity, config.companyCountry].filter(Boolean).join(' - ')}
                      </p>
                    )}
                    {(config.companyPhone || config.companyFax) && (
                      <p className="text-xs text-slate-400">
                        {config.companyPhone && <span>Tél: {config.companyPhone}</span>}
                        {config.companyPhone && config.companyFax && <span className="mx-2">|</span>}
                        {config.companyFax && <span>Fax: {config.companyFax}</span>}
                      </p>
                    )}
                    {(config.companyEmail || config.companyWebsite) && (
                      <p className="text-xs text-slate-400">
                        {config.companyEmail && <span>{config.companyEmail}</span>}
                        {config.companyEmail && config.companyWebsite && <span className="mx-2">|</span>}
                        {config.companyWebsite && <span>{config.companyWebsite}</span>}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Legal Info */}
                <div className="text-right text-xs text-slate-500">
                  {config.companyTaxId && <p>MF: {config.companyTaxId}</p>}
                  {config.companyRegistration && <p>RC: {config.companyRegistration}</p>}
                  {config.companyCapital && <p>Capital: {config.companyCapital}</p>}
                  {config.companyBankName && <p>Banque: {config.companyBankName}</p>}
                  {config.companyBankRib && <p>RIB: {config.companyBankRib}</p>}
                </div>
              </div>

              {/* Document Title and Info */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {previewDoc.type === 'INVOICE' ? 'FACTURE' : 'BON DE LIVRAISON'}
                  </h2>
                  <div className="text-right">
                    <p className="text-lg font-bold text-accent">N° {previewDoc.dmsRef}</p>
                    <p className="text-sm text-slate-400">Date: {previewDoc.date}</p>
                  </div>
                </div>

                {/* Client Info */}
                <div className="bg-brand-800/30 rounded-lg p-4 border border-accent/10">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase">Client</span>
                      <p className="text-white font-medium">{previewDoc.companyName || '-'}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase">Code Client</span>
                      <p className="text-accent font-medium">{previewDoc.codeClient || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {previewDoc.observation && (
                <div className="mb-4 p-3 bg-brand-800/50 rounded-lg border border-accent/10">
                  <span className="text-xs font-bold text-slate-400 uppercase">Observation:</span>
                  <p className="text-slate-300 text-sm mt-1">{previewDoc.observation}</p>
                </div>
              )}

              {/* Check if we should group by BL */}
              {previewDoc.type === 'INVOICE' && previewDoc.lines.some(l => l.numBL) ? (
                // Grouped by BL display for invoices
                <div className="space-y-6">
                  {groupLinesByBL(previewDoc.lines).map((group, gIdx) => (
                    <div key={gIdx} className="border border-accent/10 rounded-xl overflow-hidden">
                      {/* BL Group Header */}
                      <div className="bg-accent/10 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                          <span className="font-bold text-white">
                            {group.numBL ? `BL N° ${group.numBL}` : 'Autres lignes'}
                          </span>
                          {group.dateBL && <span className="text-slate-400 text-sm">- {group.dateBL}</span>}
                        </div>
                        <span className="text-accent font-bold">
                          Total HT: {formatPriceWithCurrency(group.totalHT)}
                        </span>
                      </div>

                      {/* BL Group Lines */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-brand-800/50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-bold text-slate-400">#</th>
                              <th className="px-3 py-2 text-left text-xs font-bold text-slate-400">Code</th>
                              <th className="px-3 py-2 text-left text-xs font-bold text-slate-400">Désignation</th>
                              <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">Qté</th>
                              <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">P.U. HT</th>
                              <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">Rem%</th>
                              <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">TVA%</th>
                              <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">Montant HT</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent/5">
                            {group.lines.map((line, lIdx) => (
                              <tr key={lIdx} className="hover:bg-brand-800/30">
                                <td className="px-3 py-2 text-slate-400">{line.numLigne}</td>
                                <td className="px-3 py-2 text-accent font-medium">{line.codeArticle}</td>
                                <td className="px-3 py-2 text-white">{line.designation}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{line.quantite}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{formatPriceWithCurrency(line.prixUnitaire)}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{line.remise ? `${line.remise}%` : '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{line.tauxTVA ? `${line.tauxTVA}%` : '-'}</td>
                                <td className="px-3 py-2 text-right text-neon-green font-medium">{formatPriceWithCurrency(line.montantHT)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Standard lines display (for BL or invoices without BL info)
                <div className="border border-accent/10 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-brand-800/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-bold text-slate-400">#</th>
                          <th className="px-3 py-2 text-left text-xs font-bold text-slate-400">Code</th>
                          <th className="px-3 py-2 text-left text-xs font-bold text-slate-400">Désignation</th>
                          <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">Qté</th>
                          <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">P.U. HT</th>
                          <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">Rem%</th>
                          <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">TVA%</th>
                          <th className="px-3 py-2 text-right text-xs font-bold text-slate-400">Montant HT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-accent/5">
                        {previewDoc.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-brand-800/30">
                            <td className="px-3 py-2 text-slate-400">{line.numLigne}</td>
                            <td className="px-3 py-2 text-accent font-medium">{line.codeArticle}</td>
                            <td className="px-3 py-2 text-white">{line.designation}</td>
                            <td className="px-3 py-2 text-right text-slate-300">{line.quantite}</td>
                            <td className="px-3 py-2 text-right text-slate-300">{formatPriceWithCurrency(line.prixUnitaire)}</td>
                            <td className="px-3 py-2 text-right text-slate-400">{line.remise ? `${line.remise}%` : '-'}</td>
                            <td className="px-3 py-2 text-right text-slate-400">{line.tauxTVA ? `${line.tauxTVA}%` : '-'}</td>
                            <td className="px-3 py-2 text-right text-neon-green font-medium">{formatPriceWithCurrency(line.montantHT)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="mt-6 flex justify-end">
                <div className="bg-brand-800/50 border border-accent/20 rounded-xl p-4 min-w-[280px]">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Total HT:</span>
                    <span className="text-white font-medium">{formatPriceWithCurrency(previewDoc.totalHT)}</span>
                  </div>
                  {previewDoc.totalTVA !== undefined && previewDoc.totalTVA > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-400">Total TVA:</span>
                      <span className="text-white font-medium">{formatPriceWithCurrency(previewDoc.totalTVA)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 mt-2 border-t border-accent/20">
                    <span className="text-accent font-bold">Total TTC:</span>
                    <span className="text-neon-green font-bold text-lg">{formatPriceWithCurrency(previewDoc.totalTTC)}</span>
                  </div>
                </div>
              </div>

              {/* Document Footer Text */}
              {config.documentFooterText && (
                <div className="mt-6 pt-4 border-t border-accent/10 text-center">
                  <p className="text-xs text-slate-500">{config.documentFooterText}</p>
                </div>
              )}

              {/* DUPLICATA notice */}
              <div className="mt-4 text-center">
                <p className="text-xs text-slate-600 italic">Ce document est un DUPLICATA</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-accent/10 bg-brand-900/50">
              <p className="text-xs text-slate-500">
                Document généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Fermer
                </button>
                <button
                  onClick={() => {
                    // Trigger download from preview
                    handleDownload({ type: previewDoc.type, dmsRef: previewDoc.dmsRef, id: previewDoc.dmsRef });
                    setPreviewDoc(null);
                  }}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Télécharger PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
