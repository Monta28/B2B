import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  isDestructive = false,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) setIsSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="card-futuristic rounded-2xl max-w-sm w-full shadow-card border border-accent/20 transform transition-all scale-100 animate-fadeIn">
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-brand-800/50 border border-accent/20 rounded-full mb-4 shadow-inner-glow">
            {isDestructive ? (
              <svg className="w-6 h-6 text-neon-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            ) : (
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
          </div>
          
          <h3 className="text-lg font-bold text-center text-white mb-2">{title}</h3>
          <div className="text-sm text-center text-slate-400 mb-6">
            {message}
          </div>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 glass-light border border-accent/20 rounded-lg text-sm font-semibold text-slate-200 hover:border-accent/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cancelLabel}
            </button>
            <button
              disabled={isSubmitting}
              onClick={async () => {
                if (isSubmitting) return;
                setIsSubmitting(true);
                try {
                  await onConfirm();
                  onClose();
                } catch {
                  // Keep modal open on error
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className={`flex-1 px-4 py-2 border border-transparent rounded-lg text-sm font-bold text-white shadow-glow focus:outline-none focus:ring-2 btn-glow disabled:opacity-60 disabled:cursor-not-allowed ${
                isDestructive
                  ? 'bg-neon-pink hover:bg-neon-pink/80 focus:ring-neon-pink/40'
                  : 'bg-accent hover:bg-accent-hover focus:ring-accent/40'
              }`}
            >
              {isSubmitting ? '...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
