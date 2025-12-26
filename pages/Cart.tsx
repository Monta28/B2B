
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../context/CartContext';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Product, ClientPrice } from '../types';
import { useConfig } from '../context/ConfigContext';
import { ConfirmModal } from '../components/ConfirmModal';

interface ConflictState {
  product: Product;
  price: ClientPrice;
  oldQty: number;
  newQty: number;
}

export const Cart = () => {
  const { items, removeFromCart, updateQuantity, addToCart, clearCart } = useCart();
  const { user } = useAuth();
  const { formatPrice, formatPriceWithCurrency } = useConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const navigate = useNavigate();

  // --- Search fields (3 separate fields) ---
  const [searchRef, setSearchRef] = useState('');
  const [searchDesig, setSearchDesig] = useState('');
  const [searchOEM, setSearchOEM] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activePrice, setActivePrice] = useState<ClientPrice | null>(null);
  const [qty, setQty] = useState(1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Conflict State
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const getTvaRatePercent = (item: any): number | null => {
    const raw =
      item?.tvaRate ?? item?.tauxTVA ?? item?.tauxTva ?? item?.tva ?? item?.tvaCode ?? item?.codeTva ?? item?.tva_rate ?? item?.taux ??
      item?.taux_tva ?? item?.code_tva ?? item?.tva_code;
    if (raw === null || raw === undefined) return null;
    const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (!Number.isFinite(num)) return null;
    return num;
  };

  const totalHT = items.reduce((sum, item) => sum + (item.clientNetPrice || 0) * item.quantity, 0);
  const tvaGroups: Record<string, { rate: number; vat: number }> = {};
  items.forEach(item => {
    const rate = getTvaRatePercent(item);
    if (rate === null) return;
    const ht = (item.clientNetPrice || 0) * item.quantity;
    const vat = ht * (rate / 100);
    const key = `${rate}`;
    tvaGroups[key] = {
      rate,
      vat: (tvaGroups[key]?.vat || 0) + vat,
    };
  });
  const totalTVA = Object.values(tvaGroups).reduce((s, g) => s + g.vat, 0);
  const totalTTC = totalHT + totalTVA;

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const searchRefInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Combine search terms for API query
  const hasSearch = searchRef.length > 1 || searchDesig.length > 2 || searchOEM.length > 1;

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ['cart-search', searchRef, searchDesig, searchOEM],
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

  // Check if client has majoration (typeRemise 2 or 4)
  const hasMajoration = user?.typeRemise && [2, 4].includes(user.typeRemise) && user?.tauxMajoration && user.tauxMajoration > 0;
  const majorationRate = hasMajoration ? user.tauxMajoration : 0;

  // Calculate Price when product selected (apply majoration if applicable)
  useEffect(() => {
    if (selectedProduct) {
      // Use priceHT from selected product and apply majoration if client has typeRemise 2 or 4
      const basePriceHT = selectedProduct.priceHT || selectedProduct.pricePublic || 0;
      const priceHT = basePriceHT * (1 + majorationRate / 100);

      setActivePrice({
        reference: selectedProduct.reference,
        priceHT,
        publicPrice: basePriceHT,
        netPrice: priceHT,
        discountPercent: 0,
        discountPercentage: 0,
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
  }, [selectedProduct, majorationRate]);

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
        setQty(prev => prev + 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setQty(prev => (prev > 1 ? prev - 1 : 1));
        break;
      case 'Enter':
        e.preventDefault();
        handleQuickAdd();
        break;
    }
  };

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setSearchRef(p.reference);
    setSearchDesig(p.designation);
    setSearchOEM(p.codeOrigine || '');
    setShowDropdown(false);
  };

  const resetFields = () => {
    setSearchRef('');
    setSearchDesig('');
    setSearchOEM('');
    setSelectedProduct(null);
    setActivePrice(null);
    setQty(1);
    setShowDropdown(false);
    setHighlightedIndex(0);
    // Focus back on the first search field
    setTimeout(() => searchRefInputRef.current?.focus(), 50);
  };

  const handleQuickAdd = () => {
    if(selectedProduct && activePrice && qty > 0) {
      const existingItem = items.find(i => i.reference === selectedProduct.reference);

      if (existingItem) {
        setConflict({
          product: selectedProduct,
          price: activePrice,
          oldQty: existingItem.quantity,
          newQty: qty
        });
        return;
      }

      addToCart(selectedProduct, activePrice.netPrice, qty);
      resetFields();
    }
  };

  const handleResolveConflict = (action: 'ADD' | 'REPLACE') => {
    if (!conflict) return;

    if (action === 'ADD') {
      addToCart(conflict.product, conflict.price.netPrice, conflict.newQty);
    } else {
      updateQuantity(conflict.product.reference, conflict.newQty);
    }

    setConflict(null);
    resetFields();
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
            // ADD: cumulate quantities using addToCart (it auto-cumulates)
            addToCart(conflict.product, conflict.price.netPrice, conflict.newQty);
            setConflict(null);
            resetFields();
            break;
          case 'r':
          case 'R':
            e.preventDefault();
            // REPLACE: set exact quantity
            updateQuantity(conflict.product.reference, conflict.newQty);
            setConflict(null);
            resetFields();
            break;
          case 'Escape':
            e.preventDefault();
            setConflict(null);
            break;
        }
      };

      window.addEventListener('keydown', handleConflictKeyDown);
      // Store cleanup function
      (window as any).__conflictCleanup = () => window.removeEventListener('keydown', handleConflictKeyDown);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if ((window as any).__conflictCleanup) {
        (window as any).__conflictCleanup();
        delete (window as any).__conflictCleanup;
      }
    };
  }, [conflict, addToCart, updateQuantity]);

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const orderRef = await api.submitOrder(items, user.email, user.companyName, 'STOCK');
      clearCart();
      navigate('/orders', { state: { newOrder: orderRef } });
    } catch (e) {
      toast.error("Erreur lors de la validation");
    } finally {
      setIsSubmitting(false);
      setShowConfirmSubmit(false);
    }
  };

  const clearSearch = (field: 'ref' | 'desig' | 'oem') => {
    if (field === 'ref') setSearchRef('');
    if (field === 'desig') setSearchDesig('');
    if (field === 'oem') setSearchOEM('');
    setSelectedProduct(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-white">Mon Panier</h1>
           <p className="text-sm text-slate-400">Gérez votre panier et validez votre commande.</p>
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

          {/* Prix HT */}
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prix HT</label>
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
                value={qty}
                onChange={e => setQty(Number(e.target.value))}
                onKeyDown={handleQtyKeyDown}
                className="w-full px-2 py-2 border border-accent/20 bg-brand-800/60 text-slate-100 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 opacity-0">.</label>
              <button
                onClick={handleQuickAdd}
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
            <button onClick={resetFields} className="text-accent hover:text-accent-hover text-sm font-medium">
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
                      const basePriceHT = p.priceHT || p.pricePublic || 0;
                      const tvaRate = p.tvaRate;
                      const finalPriceHT = basePriceHT * (1 + majorationRate / 100);
                      return (
                        <>
                          {tvaRate != null && (
                            <span className="text-neon-orange font-bold">TVA {tvaRate}%</span>
                          )}
                          <div className="bg-accent/10 border border-accent/30 px-2 py-1 rounded">
                            <span className="text-accent font-bold">{formatPrice(finalPriceHT)}</span>
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

        {/* Left: Table */}
        <div className="lg:col-span-2">
          <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden min-h-[300px]">
             <table className="w-full text-left table-fixed">
                 <thead className="bg-brand-900/50 border-b border-accent/10">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-[32%]">Ref / Produit</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-center w-[12%]">Dispo.</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-center w-[8%]">Qté</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-right w-[14%]">P.U. HT</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-right w-[14%]">Total HT</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-center w-[10%]">TVA</th>
                    <th className="px-4 py-3 w-[10%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-accent/10">
                  {items.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-500">
                     <div className="mb-4">
                       <svg className="h-10 w-10 text-slate-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                     </div>
                     <p className="font-medium text-slate-400">Votre panier est vide</p>
                     <p className="text-sm mt-1">Utilisez la recherche ci-dessus ou parcourez le <Link to="/catalog" className="text-accent hover:underline">catalogue</Link>.</p>
                   </td></tr>
                 ) : items.map((item) => (
                   <tr key={item.reference} className="hover:bg-brand-800/40">
                     <td className="px-4 py-3">
                       <div className="font-bold text-white text-sm truncate">{item.reference}</div>
                       <div className="text-xs text-slate-500 truncate" title={item.designation}>{item.designation}</div>
                     </td>
                     <td className="px-4 py-3 text-center">
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
                     <td className="px-4 py-3 text-center">
                        <input
                         type="number"
                         min="1"
                         value={item.quantity}
                         onChange={(e) => updateQuantity(item.reference, parseInt(e.target.value))}
                         className="w-14 border border-accent/20 bg-brand-800/60 text-slate-100 rounded-lg p-1 text-center text-sm font-bold focus:ring-accent/40 focus:border-accent/40"
                        />
                     </td>
                     <td className="px-4 py-3 text-right text-sm text-slate-300">{formatPrice(item.clientNetPrice)}</td>
                     <td className="px-4 py-3 text-right font-bold text-accent">{formatPrice((item.clientNetPrice || 0) * item.quantity)}</td>
                     <td className="px-4 py-3 text-center text-sm text-slate-300">
                       {(() => {
                         const rate = getTvaRatePercent(item);
                         return rate !== null ? (
                           <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-neon-orange/10 text-neon-orange border border-neon-orange/30">{rate}%</span>
                         ) : '-';
                       })()}
                     </td>
                     <td className="px-4 py-3 text-right">
                       <button onClick={() => removeFromCart(item.reference)} className="text-neon-pink/60 hover:text-neon-pink">✕</button>
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
                    <span className="font-medium text-slate-200">{items.length}</span>
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
                disabled={items.length === 0 || isSubmitting}
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
        onConfirm={handleSubmit}
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
               <h3 className="text-lg font-bold text-white">Article déjà dans le panier</h3>
               <p className="text-sm text-slate-400 mt-2">
                 L'article <strong className="text-white">{conflict.product.reference}</strong> est déjà présent avec une quantité de <strong className="text-white">{conflict.oldQty}</strong>.
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
                 onClick={() => setConflict(null)}
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
