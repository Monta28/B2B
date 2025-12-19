import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { NewsType } from '../types';
import { useConfig } from '../context/ConfigContext';

export const Dashboard = () => {
  const { user } = useAuth();
  const { formatPrice, formatPriceWithCurrency, config } = useConfig();

  const { data: newsItems, isLoading: newsLoading } = useQuery({
    queryKey: ['news', 'active'],
    queryFn: () => api.getNews(true) 
  });

  const getNewsIcon = (type: NewsType) => {
    switch(type) {
      case 'WARNING':
        return <div className="bg-neon-pink/20 text-neon-pink p-3 rounded-xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>;
      case 'PROMO':
        return <div className="bg-neon-green/20 text-neon-green p-3 rounded-xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg></div>;
      default: // INFO
        return <div className="bg-accent/20 text-accent p-3 rounded-xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>;
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-4 border-b border-accent/20">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Bonjour, <span className="text-accent">{user?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || 'Utilisateur'}</span></h1>
          <p className="text-slate-400 mt-2 text-lg font-light flex items-center gap-2 flex-wrap">
            Espace client <span className="font-semibold text-accent">{user?.companyName}</span>
            {user?.dmsClientCode && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 shadow-sm">
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                {user.dmsClientCode}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Card 1 */}
        <div className="card-futuristic p-7 rounded-2xl group">
          <div className="flex justify-between items-start">
            <div className="p-3.5 bg-accent/20 rounded-2xl text-accent group-hover:bg-accent group-hover:text-white transition-colors duration-300 shadow-glow">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            </div>
            <span className="flex h-3 w-3 relative">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
            </span>
          </div>
          <div className="mt-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Commandes en cours</h3>
            <p className="text-4xl font-extrabold text-white mt-2 tracking-tight">3</p>
          </div>
          <div className="mt-6 pt-4 border-t border-accent/10 flex justify-between items-center">
            <span className="text-xs font-medium text-slate-400 bg-accent/10 px-2 py-1 rounded">2 en livraison</span>
            <Link to="/orders" className="text-sm font-semibold text-accent hover:text-accent-hover flex items-center group-hover:translate-x-1 transition-transform">
              Voir détails <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>

        {/* Card 2 */}
        <div className="card-futuristic p-7 rounded-2xl group">
          <div className="flex justify-between items-start">
             <div className="p-3.5 bg-neon-purple/20 rounded-2xl text-neon-purple group-hover:bg-neon-purple group-hover:text-white transition-colors duration-300 shadow-glow-purple">
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
             </div>
          </div>
          <div className="mt-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Factures (Mois)</h3>
            <p className="text-4xl font-extrabold text-white mt-2 tracking-tight flex items-baseline">
              {formatPrice(1240.500)}
              <span className="text-2xl text-slate-500 font-normal ml-1">{config.currencySymbol}</span>
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-neon-purple/10 flex justify-between items-center">
             <span className="text-xs font-medium text-slate-400 bg-neon-purple/10 px-2 py-1 rounded">3 nouvelles</span>
             <Link to="/documents" className="text-sm font-semibold text-neon-purple hover:text-neon-purple/80 flex items-center group-hover:translate-x-1 transition-transform">
               Accéder <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
             </Link>
          </div>
        </div>

        {/* Card 3 */}
        <div className="card-futuristic p-7 rounded-2xl group">
          <div className="flex justify-between items-start">
             <div className="p-3.5 bg-neon-green/20 rounded-2xl text-neon-green group-hover:bg-neon-green group-hover:text-white transition-colors duration-300">
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </div>
          </div>
          <div className="mt-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Remise Globale</h3>
            <p className="text-4xl font-extrabold text-neon-green mt-2 tracking-tight">-35%</p>
          </div>
          <div className="mt-6 pt-4 border-t border-neon-green/10 flex justify-between items-center">
            <span className="text-xs text-slate-400">Famille FREINAGE</span>
            <span className="text-xs font-bold bg-neon-green/20 text-neon-green px-2 py-1 rounded border border-neon-green/30">ACTIVE</span>
          </div>
        </div>
      </div>

      <div className="card-futuristic rounded-2xl overflow-hidden">
        <div className="px-8 py-6 border-b border-accent/10 bg-brand-800/30 flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">Actualités & Informations</h3>
          <span className="text-xs font-semibold text-accent bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
            Mises à jour
          </span>
        </div>
        <div className="p-8">
          <div className="space-y-6">
            {newsLoading ? (
               <div className="space-y-4">
                 {[1,2].map(i => <div key={i} className="h-24 bg-brand-800/30 rounded-xl animate-pulse"></div>)}
               </div>
            ) : newsItems?.length === 0 ? (
               <p className="text-slate-500 text-sm italic text-center py-4">Aucune actualité récente à afficher.</p>
            ) : (
              newsItems?.map(news => (
                <div key={news.id} className="flex items-start space-x-6 p-5 rounded-2xl bg-brand-800/20 hover:bg-brand-800/40 transition-all border border-accent/5 hover:border-accent/20">
                  <div className="flex-shrink-0">
                     {getNewsIcon(news.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        news.type === 'WARNING' ? 'bg-neon-pink/20 text-neon-pink' :
                        news.type === 'PROMO' ? 'bg-neon-green/20 text-neon-green' : 'bg-accent/20 text-accent'
                      }`}>
                        {news.type}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">{news.date}</span>
                    </div>
                    <h4 className="font-bold text-white text-lg mb-2">{news.title}</h4>
                    <p className="text-slate-400 leading-relaxed text-sm">{news.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};