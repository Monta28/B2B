import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CartItem, Product } from '../types';

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, netPrice: number, quantity: number) => void;
  removeFromCart: (reference: string) => void;
  updateQuantity: (reference: string, quantity: number) => void;
  clearCart: () => void;
  totalAmount: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: React.PropsWithChildren) => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (product: Product, netPrice: number, quantity: number) => {
    // Déterminer la disponibilité au moment de l'ajout au panier
    const availability: 'DISPONIBLE' | 'RUPTURE' = product.stock > 0 ? 'DISPONIBLE' : 'RUPTURE';

    setItems(prev => {
      const existing = prev.find(i => i.reference === product.reference);
      if (existing) {
        return prev.map(i =>
          i.reference === product.reference
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prev, { ...product, quantity, clientNetPrice: netPrice, availability }];
    });
  };

  const removeFromCart = (reference: string) => {
    setItems(prev => prev.filter(i => i.reference !== reference));
  };

  const updateQuantity = (reference: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(reference);
      return;
    }
    setItems(prev => prev.map(i => i.reference === reference ? { ...i, quantity } : i));
  };

  const clearCart = () => setItems([]);

  const totalAmount = items.reduce((sum, item) => sum + (item.clientNetPrice || 0) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalAmount, itemCount }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};