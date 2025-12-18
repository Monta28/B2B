import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Link } from 'react-router-dom';
import { useConfig } from '../../context/ConfigContext';

export const AdminDashboard = () => {
  const { data: companies } = useQuery({ queryKey: ['admin-companies'], queryFn: api.admin.getCompanies });
  const { data: orders } = useQuery({ queryKey: ['admin-orders'], queryFn: () => api.getOrders() });
  const { formatPrice } = useConfig();

  const activeClients = companies?.filter(c => c.isActive).length || 0;
  const pendingOrders = orders?.filter(o => o.status === 'PENDING' || o.status === 'PREPARATION').length || 0;
  const totalRevenue = orders?.reduce((acc, o) => acc + o.totalAmount, 0) || 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Vue d'ensemble Système</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clients actifs</h3>
          <p className="text-3xl font-bold text-white mt-2">
            {activeClients} <span className="text-sm text-slate-500 font-normal">/ {companies?.length}</span>
          </p>
        </div>

        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Commandes en cours</h3>
          <p className="text-3xl font-bold text-accent mt-2">{pendingOrders}</p>
        </div>

        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chiffre d'affaires (mois)</h3>
          <p className="text-3xl font-bold text-neon-green mt-2">{formatPrice(totalRevenue)}</p>
        </div>

        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">État DMS SQL Server</h3>
          <div className="flex items-center mt-3 space-x-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-neon-green"></span>
            </span>
            <span className="font-bold text-slate-200">Connecté</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-white">Dernières commandes</h3>
            <Link to="/admin/orders" className="text-sm text-accent hover:text-accent-hover">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {orders?.slice(0, 5).map(order => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 bg-brand-800/30 rounded-xl border border-accent/10 hover:border-accent/20 hover:bg-brand-800/40 transition-all"
              >
                <div>
                  <p className="font-bold text-sm text-white">{order.companyName}</p>
                  <p className="text-xs text-slate-400">{order.dmsRef} • {order.itemCount} articles</p>
                </div>
                <span className="font-mono font-semibold text-slate-200">{formatPrice(order.totalAmount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-white">Derniers clients inscrits</h3>
            <Link to="/admin/clients" className="text-sm text-accent hover:text-accent-hover">Gérer</Link>
          </div>
          <div className="space-y-3">
            {companies?.slice(0, 5).map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 bg-brand-800/30 rounded-xl border border-accent/10 hover:border-accent/20 hover:bg-brand-800/40 transition-all"
              >
                <div>
                  <p className="font-bold text-sm text-white">{c.name}</p>
                  <p className="text-xs text-slate-400">Code DMS: {c.dmsClientCode}</p>
                </div>
                <span className={`px-2 py-1 text-[10px] font-bold rounded border ${c.isActive ? 'bg-neon-green/20 text-neon-green border-neon-green/30' : 'bg-neon-pink/20 text-neon-pink border-neon-pink/30'}`}>
                  {c.isActive ? 'ACTIF' : 'INACTIF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
