
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Product, ClientPrice } from '../types';
import { useConfig } from '../context/ConfigContext';
import { ConfirmModal } from '../components/ConfirmModal';

interface OrderLine {
  id: string;
  product: Product;
  price: ClientPrice;
  quantity: number;
  availability: 'DISPONIBLE' | 'RUPTURE'; // Disponibilité au moment de l'ajout
}

interface ConflictState {
  existingLineId: string;
  productName: string;
  oldQty: number;
  newQty: number;
}

export const QuickOrder = () => {
  const { user } = useAuth();
  const { formatPrice, formatPriceWithCurrency } = useConfig();
  const navigate = useNavigate();

  // State for the main list
  const [lines, setLines] = useState<OrderLine[]>([]);

  // --- Search fields (3 separate fields) ---
  const [searchRef, setSearchRef] = useState('');
  const [searchDesig, setSearchDesig] = useState('');
  const [searchOEM, setSearchOEM] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activePrice, setActivePrice] = useState<ClientPrice | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Duplicate Conflict State
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // Refs for focus management
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const searchRefInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Combine search terms for API query
  const hasSearch = searchRef.length > 1 || searchDesig.length > 2 || searchOEM.length > 1;

  // 1. Search Logic
  const { data: searchResults, isFetching } = useQuery({
    queryKey: ['quick-search', searchRef, searchDesig, searchOEM],
    queryFn: async () => {
      const result = await api.searchProducts({
        ref: searchRef || undefined,
        desig: searchDesig || undefined,
        origine: searchOEM || undefined,
        limit: 20,
      });
      return result.data;
    },
    enabled: hasSearch && !selectedProduct,
  });

  // 2. Calculate Price when product selected using client's globalDiscount
  useEffect(() => {
    if (selectedProduct) {
      // Use priceHT from selected product and calculate net price with user's globalDiscount
      const priceHT = selectedProduct.priceHT || selectedProduct.pricePublic || 0;
      const clientDiscount = user?.globalDiscount || 0;
      const netPrice = priceHT * (1 - clientDiscount / 100);

      setActivePrice({
        reference: selectedProduct.reference,
        priceHT,
        publicPrice: priceHT,
        netPrice,
        discountPercent: clientDiscount,
        discountPercentage: clientDiscount,
        tvaRate: selectedProduct.tvaRate ?? null,
        tvaCode: selectedProduct.codeTva || selectedProduct.tvaCode || null,
      });

      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select(); // Select all text so user can type directly
      }, 50);
      setShowDropdown(false);
    } else {
      setActivePrice(null);
    }
  }, [selectedProduct, user?.globalDiscount]);

  // Show dropdown when we have results
  useEffect(() => {
    if (searchResults && searchResults.length > 0 && hasSearch && !selectedProduct) {
      setShowDropdown(true);
      setHighlightedIndex(0); // Reset to first item when results change
    } else if (!hasSearch) {
      setShowDropdown(false);
    }
  }, [searchResults, hasSearch, selectedProduct]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (showDropdown && dropdownRef.current && searchResults && searchResults.length > 0) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, showDropdown, searchResults]);

  // Keyboard navigation handler
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || !searchResults || searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (searchResults[highlightedIndex]) {
          handleSelectProduct(searchResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
    }
  };

  // Handle quantity keyboard: arrows to increment/decrement, Enter to add
  const handleQtyKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setQuantity(prev => prev + 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setQuantity(prev => (prev > 1 ? prev - 1 : 1));
        break;
      case 'Enter':
        e.preventDefault();
        addLine();
        break;
    }
  };

  // Actions
  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setSearchRef(p.reference);
    setSearchDesig(p.designation);
    setSearchOEM(p.codeOrigine || '');
    setShowDropdown(false);
  };

  const resetInput = () => {
    setSearchRef('');
    setSearchDesig('');
    setSearchOEM('');
    setSelectedProduct(null);
    setActivePrice(null);
    setQuantity(1);
    setShowDropdown(false);
    setHighlightedIndex(0);
    // Focus back on the first search field
    setTimeout(() => searchRefInputRef.current?.focus(), 50);
  };

  const clearSearch = (field: 'ref' | 'desig' | 'oem') => {
    if (field === 'ref') setSearchRef('');
    if (field === 'desig') setSearchDesig('');
    if (field === 'oem') setSearchOEM('');
    setSelectedProduct(null);
  };

  const addLine = () => {
    if (selectedProduct && activePrice && quantity > 0) {
      // Check for duplicates
      const existingLine = lines.find(l => l.product.reference === selectedProduct.reference);

      if (existingLine) {
        setConflict({
          existingLineId: existingLine.id,
          productName: selectedProduct.reference + ' - ' + selectedProduct.designation,
          oldQty: existingLine.quantity,
          newQty: quantity
        });
        return;
      }

      const newLine: OrderLine = {
        id: Date.now().toString(),
        product: selectedProduct,
        price: activePrice,
        quantity: quantity,
        availability: selectedProduct.stock > 0 ? 'DISPONIBLE' : 'RUPTURE'
      };
      setLines([...lines, newLine]);
      resetInput();
    }
  };

  // Conflict Resolution Handlers
  const handleResolveConflict = (action: 'CANCEL' | 'REPLACE' | 'ADD') => {
    if (!conflict) return;

    if (action === 'CANCEL') {
      // Do nothing, just close modal
    } else if (action === 'REPLACE') {
      setLines(lines.map(l => l.id === conflict.existingLineId ? { ...l, quantity: conflict.newQty } : l));
      resetInput();
    } else if (action === 'ADD') {
      setLines(lines.map(l => l.id === conflict.existingLineId ? { ...l, quantity: l.quantity + conflict.newQty } : l));
      resetInput();
    }

    setConflict(null);
  };

  // Keyboard handler for conflict modal
  useEffect(() => {
    if (!conflict) return;

    // Small delay to avoid catching the Enter key that triggered the conflict modal
    const timeoutId = setTimeout(() => {
      const handleConflictKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
          case 'a':
          case 'A':
          case 'Enter':
            e.preventDefault();
            // ADD: cumulate quantities
            setLines(prev => prev.map(l => l.id === conflict.existingLineId ? { ...l, quantity: l.quantity + conflict.newQty } : l));
            setConflict(null);
            resetInput();
            break;
          case 'r':
          case 'R':
            e.preventDefault();
            // REPLACE: set exact quantity
            setLines(prev => prev.map(l => l.id === conflict.existingLineId ? { ...l, quantity: conflict.newQty } : l));
            setConflict(null);
            resetInput();
            break;
          case 'Escape':
            e.preventDefault();
            setConflict(null);
            break;
        }
      };

      window.addEventListener('keydown', handleConflictKeyDown);
      // Store cleanup function
      (window as any).__conflictCleanupQuick = () => window.removeEventListener('keydown', handleConflictKeyDown);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if ((window as any).__conflictCleanupQuick) {
        (window as any).__conflictCleanupQuick();
        delete (window as any).__conflictCleanupQuick;
      }
    };
  }, [conflict]);

  const removeLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const getTvaRatePercent = (line: any): number | null => {
    const raw =
      line?.product?.tvaRate ?? line?.product?.tauxTVA ?? line?.product?.tauxTva ?? line?.product?.tva ?? line?.product?.tvaCode ?? line?.product?.codeTva ?? line?.product?.tva_rate ?? line?.product?.taux ??
      line?.product?.taux_tva ?? line?.product?.code_tva ?? line?.product?.tva_code ??
      line?.tvaRate ?? line?.tauxTVA ?? line?.tauxTva ?? line?.tva ?? line?.tvaCode ?? line?.codeTva ?? line?.tva_rate ?? line?.taux ?? line?.taux_tva ?? line?.code_tva ?? line?.tva_code;
    if (raw === null || raw === undefined) return null;
    const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (!Number.isFinite(num)) return null;
    return num;
  };

  const handleSubmitOrder = async () => {
    if (!user || lines.length === 0) return;

    setIsSubmitting(true);
    try {
      // Map lines to format expected by submitOrder (CartItem-like)
      const orderItems = lines.map(l => ({
        ...l.product,
        quantity: l.quantity,
        clientNetPrice: l.price.netPrice,
        availability: l.availability
      }));

      // OrderType = QUICK for QuickOrder
      await api.submitOrder(orderItems, user.email, user.companyName, 'QUICK');
      navigate('/orders');
    } catch (e) {
      toast.error("Erreur lors de la création de la commande.");
      setIsSubmitting(false);
      setShowConfirmSubmit(false);
    }
  };

  // Calculations
  const totalHT = lines.reduce((acc, l) => acc + (l.price.netPrice * l.quantity), 0);
  const tvaGroups: Record<string, { rate: number; vat: number }> = {};
  lines.forEach(line => {
    const rate = getTvaRatePercent(line);
    if (rate === null) return;
    const ht = line.price.netPrice * line.quantity;
    const vat = ht * (rate / 100);
    const key = `${rate}`;
    tvaGroups[key] = {
      rate,
      vat: (tvaGroups[key]?.vat || 0) + vat,
    };
  });
  const totalTVA = Object.values(tvaGroups).reduce((sum, g) => sum + g.vat, 0);
  const totalTTC = totalHT + totalTVA;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-white">Saisie Rapide de Commande</h1>
           <p className="text-sm text-slate-400">Ajoutez rapidement des références par code ou désignation.</p>
        </div>
      </div>

      {/* SEARCH SECTION - Full width, 3 fields */}
      <div className="card-futuristic rounded-2xl shadow-card border border-accent/20 ring-2 ring-accent/10 p-4 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          {/* Code Article */}
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Code Article
            </label>
            <div className="relative">
              <input
                ref={searchRefInputRef}
                type="text"
                value={searchRef}
                onChange={(e) => {
                  setSearchRef(e.target.value);
                  if(selectedProduct) setSelectedProduct(null);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Référence..."
                className="w-full px-3 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
              {searchRef && (
                <button onClick={() => clearSearch('ref')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">×</button>
              )}
            </div>
          </div>

          {/* Code OEM */}
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Code OEM
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchOEM}
                onChange={(e) => {
                  setSearchOEM(e.target.value);
                  if(selectedProduct) setSelectedProduct(null);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Code OEM..."
                className="w-full px-3 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
              {searchOEM && (
                <button onClick={() => clearSearch('oem')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">×</button>
              )}
            </div>
          </div>

          {/* Désignation */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Désignation
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchDesig}
                onChange={(e) => {
                  setSearchDesig(e.target.value);
                  if(selectedProduct) setSelectedProduct(null);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Nom du produit..."
                className="w-full px-3 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
              {searchDesig && (
                <button onClick={() => clearSearch('desig')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">×</button>
              )}
            </div>
          </div>

          {/* Prix Net */}
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prix Net</label>
            <div className="w-full px-3 py-2 bg-brand-900/50 border border-accent/20 rounded-lg font-mono text-right text-accent text-sm h-[38px] flex items-center justify-end">
              {activePrice ? formatPrice(activePrice.netPrice) : '-'}
            </div>
          </div>

          {/* Quantité + Ajouter */}
          <div className="md:col-span-1 flex gap-2">
            <div className="w-20">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Qté</label>
              <input
                ref={qtyInputRef}
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                onKeyDown={handleQtyKeyDown}
                className="w-full px-2 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 opacity-0">.</label>
              <button
                onClick={addLine}
                disabled={!selectedProduct}
                className="w-full h-[38px] bg-accent text-white px-4 rounded-lg font-bold text-sm hover:bg-accent-hover shadow-glow btn-glow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Loading indicator */}
        {isFetching && (
          <div className="mt-2 flex items-center gap-2 text-sm text-accent">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Recherche en cours...
          </div>
        )}

        {/* Selected product info */}
        {selectedProduct && (
          <div className="mt-3 p-3 bg-accent/10 rounded-lg border border-accent/30 flex items-center justify-between">
            <div>
              <span className="font-bold text-white">{selectedProduct.reference}</span>
              <span className="mx-2 text-slate-500">-</span>
              <span className="text-slate-300">{selectedProduct.designation}</span>
              {selectedProduct.stock < 1 && (
                <span className="ml-2 text-xs text-neon-pink font-bold">Rupture de stock</span>
              )}
            </div>
            <button onClick={resetInput} className="text-accent hover:text-accent-hover text-sm font-medium">
              Changer
            </button>
          </div>
        )}

        {/* Dropdown Results */}
        {showDropdown && searchResults && searchResults.length > 0 && !selectedProduct && (
          <div ref={dropdownRef} className="absolute left-4 right-4 top-full mt-1 card-futuristic border border-accent/20 rounded-xl shadow-card max-h-80 overflow-auto z-50">
            {searchResults.map((p, index) => (
              <div
                key={p.reference}
                className={`p-3 cursor-pointer border-b border-accent/10 last:border-0 ${index === highlightedIndex ? 'bg-accent/20' : 'hover:bg-brand-800/60'}`}
                onClick={() => handleSelectProduct(p)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{p.reference}</span>
                  {p.stock > 0 ? (
                    <span className="text-[10px] font-bold bg-neon-green/20 text-neon-green px-2 py-0.5 rounded border border-neon-green/30">Dispo</span>
                  ) : (
                    <span className="text-[10px] font-bold bg-neon-pink/20 text-neon-pink px-2 py-0.5 rounded border border-neon-pink/30">Rupture</span>
                  )}
                </div>
                <div className="text-sm text-slate-400">{p.designation}</div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    {p.codeOrigine && (
                      <span className="text-xs text-accent font-mono bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">OEM: {p.codeOrigine}</span>
                    )}
                    {p.brand && (
                      <span className="text-xs text-slate-400 bg-brand-800/60 px-1.5 py-0.5 rounded border border-accent/10">{p.brand}</span>
                    )}
                  </div>
                  {/* Prix HT + TVA section */}
                  <div className="flex items-center gap-3 text-xs">
                    {(() => {
                      const priceHT = p.priceHT || p.pricePublic || 0;
                      const tvaRate = p.tvaRate;
                      const clientDiscount = user?.globalDiscount || 0;
                      const calculatedNetPrice = priceHT * (1 - clientDiscount / 100);
                      return (
                        <>
                          <div className="text-right">
                            <span className="text-slate-500">{formatPrice(priceHT)} HT</span>
                            {tvaRate != null && (
                              <span className="ml-1 text-neon-orange font-bold">TVA {tvaRate}%</span>
                            )}
                            {clientDiscount > 0 && (
                              <span className="ml-1 text-accent font-bold">-{clientDiscount}%</span>
                            )}
                          </div>
                          <div className="bg-neon-green/10 border border-neon-green/30 px-2 py-1 rounded">
                            <span className="text-neon-green font-bold">{formatPrice(calculatedNetPrice)}</span>
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
        {showDropdown && searchResults && searchResults.length === 0 && hasSearch && !isFetching && (
          <div className="absolute left-4 right-4 top-full mt-1 card-futuristic border border-accent/20 rounded-xl shadow-card p-4 z-50">
            <p className="text-sm text-slate-400 text-center">Aucun produit trouvé</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Lines Table */}
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
                 {lines.length === 0 ? (
                   <tr><td colSpan={7} className="p-8 text-center text-slate-500">Aucune ligne saisie. Utilisez le formulaire ci-dessus.</td></tr>
                 ) : lines.map(line => (
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
                         const rate = getTvaRatePercent(line);
                         return rate !== null ? (
                           <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-neon-orange/10 text-neon-orange border border-neon-orange/30">{rate}%</span>
                         ) : '-';
                       })()}
                     </td>
                     <td className="px-4 py-3 text-right">
                       <button onClick={() => removeLine(line.id)} className="text-neon-pink/60 hover:text-neon-pink">✕</button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-1">
           <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-6 sticky top-6">
              <h3 className="text-lg font-bold text-white mb-4">Récapitulatif</h3>

              <div className="space-y-3 text-sm border-b border-accent/10 pb-4 mb-4">
                 <div className="flex justify-between">
                    <span className="text-slate-400">Lignes</span>
                    <span className="font-medium text-slate-200">{lines.length}</span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-slate-400">Total HT</span>
                    <span className="font-medium text-slate-200">{formatPriceWithCurrency(totalHT)}</span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-slate-400">Total TVA</span>
                    <span className="font-medium text-slate-200">{totalTVA > 0 ? formatPriceWithCurrency(totalTVA) : '-'}</span>
                 </div>
              </div>

              {/* TVA défalquée par taux */}
              {Object.keys(tvaGroups).length > 0 && (
                <div className="space-y-2 text-xs border-b border-accent/10 pb-4 mb-4">
                  <div className="text-slate-500 uppercase tracking-wider font-bold mb-2">Détail TVA</div>
                  {Object.values(tvaGroups)
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
                 <span className="font-bold text-2xl text-accent">{formatPriceWithCurrency(totalTTC)}</span>
              </div>

              <button
                onClick={() => setShowConfirmSubmit(true)}
                disabled={lines.length === 0 || isSubmitting}
                className="w-full py-3 bg-neon-green text-brand-950 rounded-lg font-bold hover:bg-neon-green/80 shadow-glow btn-glow disabled:opacity-50 disabled:shadow-none"
              >
                Valider la Commande
              </button>

              <button
                 onClick={() => navigate('/orders')}
                 className="w-full py-2 mt-3 text-slate-500 text-sm hover:text-slate-300"
              >
                 Annuler / Retour
              </button>
           </div>
        </div>

      </div>

      {/* FINAL SUBMIT CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={showConfirmSubmit}
        onClose={() => setShowConfirmSubmit(false)}
        onConfirm={handleSubmitOrder}
        title="Confirmer la commande ?"
        message={
          <div>
            <p className="mb-2">Vous êtes sur le point de valider une commande d'un montant total de <strong className="text-lg text-accent">{formatPriceWithCurrency(totalTTC)} TTC</strong>.</p>
            <div className="bg-accent/10 p-3 rounded-lg text-xs text-accent border border-accent/20">
               <strong>Information importante :</strong>
               <br/>
               Une fois transmise, votre commande sera en attente de validation. Tant qu'elle n'est pas validée par nos équipes, vous pourrez encore l'annuler si nécessaire.
            </div>
          </div>
        }
        confirmLabel="Confirmer et Envoyer"
      />

      {/* DUPLICATE CONFLICT MODAL */}
      {conflict && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-futuristic rounded-2xl max-w-md w-full shadow-card border border-accent/20 p-6 animate-fadeIn">
             <div className="text-center mb-6">
               <div className="w-12 h-12 bg-neon-orange/20 border border-neon-orange/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner-glow">
                  <svg className="w-6 h-6 text-neon-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
               </div>
               <h3 className="text-lg font-bold text-white">Article déjà présent</h3>
               <p className="text-sm text-slate-400 mt-2">
                 L'article <strong className="text-white">{conflict.productName}</strong> est déjà dans votre liste avec une quantité de <strong className="text-white">{conflict.oldQty}</strong>.
               </p>
               <p className="text-sm text-slate-400 mt-1">
                 Vous voulez ajouter <strong className="text-white">{conflict.newQty}</strong>. Que faire ?
               </p>
             </div>

             <div className="grid grid-cols-1 gap-3">
               <button
                 onClick={() => handleResolveConflict('ADD')}
                 className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-bold shadow-glow btn-glow flex justify-between px-4 items-center group"
               >
                 <span className="flex items-center gap-2">
                   <span className="bg-accent-hover text-xs px-1.5 py-0.5 rounded font-mono">A</span>
                   Ajouter (Cumuler)
                 </span>
                 <span className="bg-accent-hover px-2 py-0.5 rounded text-sm">Total: {conflict.oldQty + conflict.newQty}</span>
               </button>

               <button
                 onClick={() => handleResolveConflict('REPLACE')}
                 className="w-full py-3 glass-light border border-accent/20 hover:border-accent/40 text-slate-200 rounded-lg font-bold flex justify-between px-4 items-center group"
               >
                 <span className="flex items-center gap-2">
                   <span className="bg-brand-800/60 text-xs px-1.5 py-0.5 rounded font-mono">R</span>
                   Remplacer la quantité
                 </span>
                 <span className="bg-brand-800/60 px-2 py-0.5 rounded text-sm text-slate-400">Total: {conflict.newQty}</span>
               </button>

               <button
                 onClick={() => handleResolveConflict('CANCEL')}
                 className="w-full py-2 text-slate-500 hover:text-slate-300 font-medium text-sm mt-2 flex items-center justify-center gap-2"
               >
                 <span className="bg-brand-800/60 text-xs px-1.5 py-0.5 rounded font-mono">Esc</span>
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
