import React, { useState, useEffect } from 'react';
import { Product, ClientPrice, UserRole } from '../types';
import { api } from '../services/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [price, setPrice] = useState<ClientPrice | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [qty, setQty] = useState(1);
  const { addToCart } = useCart();
  const { hasRole } = useAuth();
  const { formatPrice, formatPriceWithCurrency } = useConfig();

  const isClient = hasRole([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]);
  const canBuy = isClient; // Only clients can buy

  useEffect(() => {
    let mounted = true;
    api.getPriceForClient(product.reference)
      .then(p => {
        if(mounted) {
          setPrice(p);
          setLoadingPrice(false);
        }
      })
      .catch(err => {
        console.error(err);
        if(mounted) setLoadingPrice(false);
      });
    return () => { mounted = false; };
  }, [product.reference]);

  const handleAdd = () => {
    if (price && canBuy) {
      addToCart(product, price.netPrice, qty);
      setQty(1);
    }
  };

  return (
    <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-6 flex flex-col h-full hover:shadow-card-hover hover:border-accent/30 transition-all duration-300 group relative overflow-hidden">
      
      {/* Brand & Stock Header */}
      <div className="flex justify-between items-start mb-4 relative z-10">
        <span className="bg-brand-800/60 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border border-accent/10">
          {product.brand}
        </span>
        {product.stock > 0 ? (
          <span className="bg-neon-green/10 text-neon-green text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center border border-neon-green/30">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green mr-1.5 shadow-sm"></span>
            {isClient ? 'Disponible' : `En Stock (${product.stock})`}
          </span>
        ) : (
          <span className="bg-neon-pink/10 text-neon-pink text-[10px] font-bold px-2.5 py-1 rounded-full border border-neon-pink/30">
            Rupture
          </span>
        )}
      </div>

      {/* Product Info */}
      <div className="flex-1 relative z-10">
        <h3 className="text-lg font-bold text-white leading-snug group-hover:text-accent transition-colors mb-2">
          {product.designation}
        </h3>
        <p className="text-xs text-slate-400 font-mono bg-brand-800/40 inline-block px-2 py-1 rounded border border-accent/10 select-all">
          Ref: {product.reference}
        </p>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-gradient-to-br from-accent/10 to-transparent rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      {/* Price & Action Area */}
      <div className="mt-6 pt-5 border-t border-accent/10 relative z-10">
        <div className="mb-5 flex items-end justify-between">
          {loadingPrice ? (
            <div className="space-y-2">
              <div className="h-3 bg-brand-800/60 animate-pulse rounded w-16"></div>
              <div className="h-6 bg-brand-800/60 animate-pulse rounded w-24"></div>
            </div>
          ) : price ? (
            <>
               <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Votre Prix Net HT</p>
                  <div className="text-2xl font-bold text-white tracking-tight flex items-baseline">
                    {formatPriceWithCurrency(price.netPrice)}
                  </div>
               </div>
               <div className="text-right">
                  <span className="text-xs text-slate-500 line-through block decoration-slate-600">{formatPriceWithCurrency(product.priceHT || product.pricePublic)}</span>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    {product.tvaRate != null && (
                      <span className="text-[10px] font-bold text-neon-orange bg-neon-orange/10 px-1.5 py-0.5 rounded border border-neon-orange/30">TVA {product.tvaRate}%</span>
                    )}
                    <span className="text-[10px] font-bold text-neon-green bg-neon-green/10 px-2 py-0.5 rounded border border-neon-green/30">-{price.discountPercentage}%</span>
                  </div>
               </div>
            </>
          ) : (
             <span className="text-neon-pink text-xs font-medium">Prix indisponible</span>
          )}
        </div>

        {canBuy ? (
          <div className="flex gap-3">
            <div className="relative w-20">
              <input 
                type="number" 
                min="1" 
                max={product.stock > 0 ? product.stock : 99}
                value={qty} 
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                className="w-full h-11 border border-accent/20 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-accent/30 focus:border-accent/40 bg-brand-800/60 text-slate-100 hover:bg-brand-800/80 transition-colors"
              />
            </div>
            <button 
              onClick={handleAdd}
              disabled={product.stock <= 0 || loadingPrice}
              className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all transform active:scale-[0.98] flex items-center justify-center border ${
                product.stock > 0 
                  ? 'bg-accent hover:bg-accent-hover text-white border-accent/40 shadow-glow btn-glow' 
                  : 'bg-brand-800/60 text-slate-500 cursor-not-allowed border-accent/10'
              }`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Ajouter
            </button>
          </div>
        ) : (
          <div className="bg-brand-800/40 text-slate-400 text-xs py-3 px-3 rounded-xl text-center border border-accent/10 font-medium">
            Mode Consultation (Lecture seule)
          </div>
        )}
      </div>
    </div>
  );
};
