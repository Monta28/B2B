
import React, { useState, useMemo } from 'react';
import { Product, ClientPrice, UserRole } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';

interface ProductTableRowProps {
  product: Product;
}

export const ProductTableRow: React.FC<ProductTableRowProps> = ({ product }) => {
  const [qty, setQty] = useState(1);
  const { addToCart } = useCart();
  const { hasRole, user } = useAuth();
  const { formatPrice, formatPriceWithCurrency } = useConfig();

  const isInternal = hasRole([UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]);
  const isClient = hasRole([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]);
  const canBuy = isClient; // Only clients can buy

  // Prix HT et TVA
  const priceHT = product.priceHT || product.pricePublic || 0;
  const tvaRate = product.tvaRate != null ? product.tvaRate : null;

  // Calculer le prix net basé sur la remise du client (user.globalDiscount)
  const price: ClientPrice | null = useMemo(() => {
    const discountPercent = user?.globalDiscount || 0;
    const netPrice = priceHT * (1 - discountPercent / 100);
    return {
      reference: product.reference,
      netPrice,
      discountPercentage: discountPercent,
    };
  }, [product.reference, priceHT, user?.globalDiscount]);

  const handleAdd = () => {
    if (price && canBuy && qty > 0) {
      addToCart(product, price.netPrice, qty);
      setQty(1);
    }
  };

  return (
    <tr className="hover:bg-brand-800/30 transition-colors border-b border-accent/10 last:border-0 group">
      {/* Reference */}
      <td className="px-3 py-3">
        <div className="font-bold text-slate-100 text-sm truncate" title={product.reference}>{product.reference}</div>
        <div className="text-xs text-slate-400 font-medium truncate">{product.brand}</div>
      </td>
      {/* Code OEM */}
      <td className="px-3 py-3">
        {product.codeOrigine ? (
          <div className="text-sm text-accent font-mono truncate" title={product.codeOrigine}>{product.codeOrigine}</div>
        ) : (
          <span className="text-xs text-slate-600">-</span>
        )}
      </td>
      {/* Designation - with text truncation */}
      <td className="px-3 py-3">
        <div className="font-medium text-slate-100 text-sm truncate" title={product.designation}>{product.designation}</div>
        <div className="text-xs text-slate-500 truncate">{product.family}</div>
      </td>
      {/* Stock - Show "Dispo" or "Rupture" for clients, actual stock for admins */}
      <td className="px-3 py-3 text-center">
        {product.stock > 0 ? (
           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-neon-green/10 text-neon-green border border-neon-green/30 whitespace-nowrap">
             <span className="w-1.5 h-1.5 rounded-full bg-neon-green mr-1"></span>
             {isClient ? 'Disponible' : product.stock}
           </span>
        ) : (
           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-neon-pink/10 text-neon-pink border border-neon-pink/30 whitespace-nowrap">
             Rupture
           </span>
        )}
      </td>
      {/* Prix HT */}
      <td className={`px-3 py-3 text-right font-mono text-sm whitespace-nowrap ${isInternal ? 'text-slate-100 font-bold' : 'text-slate-500 line-through decoration-slate-600'}`}>
        {formatPriceWithCurrency(priceHT)}
      </td>
      {/* TVA */}
      <td className="px-3 py-3 text-center">
        {tvaRate != null ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-neon-orange/10 text-neon-orange border border-neon-orange/30 whitespace-nowrap">
            {tvaRate}%
          </span>
        ) : (
          <span className="text-xs text-slate-600">-</span>
        )}
      </td>
      {/* HIDE NET PRICE CELL FOR ADMINS */}
      {!isInternal && (
        <td className="px-3 py-3 text-right">
          {price ? (
            <div className="flex flex-col items-end">
              <div className="font-bold text-slate-100 font-mono text-sm whitespace-nowrap">{formatPriceWithCurrency(price.netPrice)}</div>
              <div className="text-[10px] text-neon-green font-bold bg-neon-green/10 px-1 rounded border border-neon-green/30 whitespace-nowrap">-{price.discountPercentage}%</div>
            </div>
          ) : <span className="text-xs text-neon-pink">Indisp.</span>}
        </td>
      )}

      {/* HIDE ACTION CELL FOR ADMINS */}
      {!isInternal && (
        <td className="px-3 py-3 text-right">
           {canBuy ? (
             <div className="flex items-center justify-end space-x-1">
               <input
                 type="number"
                 min="1"
                 max="999"
                 value={qty}
                 onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                 className="w-14 border border-accent/20 bg-brand-800/60 text-slate-100 rounded-lg p-1 text-center text-sm font-bold focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
               />
               <button
                 onClick={handleAdd}
                 className="bg-accent hover:bg-accent-hover text-white p-1.5 rounded-lg shadow-glow btn-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 border border-accent/40"
                 title="Ajouter au panier"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
               </button>
             </div>
           ) : (
             <span className="text-xs text-slate-500 italic">Lecture seule</span>
           )}
        </td>
      )}
    </tr>
  );
};
