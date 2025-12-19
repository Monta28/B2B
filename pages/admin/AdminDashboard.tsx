import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Link } from 'react-router-dom';
import { useConfig } from '../../context/ConfigContext';
import { OrderStatus } from '../../types';

export const AdminDashboard = () => {
  const { data: companies } = useQuery({ queryKey: ['admin-companies'], queryFn: api.admin.getCompanies });
  const { data: orders } = useQuery({ queryKey: ['admin-orders'], queryFn: () => api.getOrders() });
  const { data: allDocuments } = useQuery({ queryKey: ['admin-documents'], queryFn: () => api.getDocuments() });
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: api.admin.getUsers });
  const { formatPrice, config } = useConfig();

  const activeClients = companies?.filter(c => c.isActive).length || 0;

  // User stats
  const userStats = useMemo(() => {
    if (!users) return { total: 0, active: 0, admins: 0 };
    const activeUsers = users.filter((u: any) => u.isActive);
    const adminUsers = users.filter((u: any) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
    return {
      total: users.length,
      active: activeUsers.length,
      admins: adminUsers.length
    };
  }, [users]);

  // Pending orders stats (need validation)
  const pendingOrdersStats = useMemo(() => {
    if (!orders) return { count: 0, amount: 0 };
    const pendingOrders = orders.filter((o: any) => o.status === OrderStatus.PENDING);
    return {
      count: pendingOrders.length,
      amount: pendingOrders.reduce((acc: number, o: any) => acc + (o.totalAmount || 0), 0)
    };
  }, [orders]);

  // Calculate detailed monthly stats
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Filter orders by current month
    const ordersThisMonth = orders?.filter((o: any) => {
      const orderDate = new Date(o.createdAt);
      return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
    }) || [];

    // Validated orders this month (VALIDATED + PREPARATION)
    const validatedOrders = ordersThisMonth.filter((o: any) =>
      o.status === OrderStatus.VALIDATED || o.status === OrderStatus.PREPARATION
    );
    const validatedTotal = validatedOrders.reduce((acc: number, o: any) => acc + (o.totalAmount || 0), 0);

    // Shipped orders this month
    const shippedOrders = ordersThisMonth.filter((o: any) => o.status === OrderStatus.SHIPPED);
    const shippedTotal = shippedOrders.reduce((acc: number, o: any) => acc + (o.totalAmount || 0), 0);

    // Filter documents by current month
    const docsThisMonth = allDocuments?.filter((d: any) => {
      const docDate = new Date(d.date);
      return docDate.getMonth() === currentMonth && docDate.getFullYear() === currentYear;
    }) || [];

    // Invoices (Factures) this month
    const invoices = docsThisMonth.filter((d: any) => d.type === 'INVOICE');
    const invoicesTotal = invoices.reduce((sum: number, d: any) => sum + (d.totalHT || 0), 0);

    // Delivery notes (BL) this month
    const deliveryNotes = docsThisMonth.filter((d: any) => d.type === 'BL');
    const blTotal = deliveryNotes.reduce((sum: number, d: any) => sum + (d.totalHT || 0), 0);

    return {
      validatedCount: validatedOrders.length,
      validatedTotal,
      shippedCount: shippedOrders.length,
      shippedTotal,
      invoicesCount: invoices.length,
      invoicesTotal,
      blCount: deliveryNotes.length,
      blTotal,
      totalCA: invoicesTotal // CA = Total des factures
    };
  }, [orders, allDocuments]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Vue d'ensemble Système</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1 - Clients actifs */}
        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clients actifs</h3>
          <p className="text-3xl font-bold text-white mt-2">
            {activeClients} <span className="text-sm text-slate-500 font-normal">/ {companies?.length || 0}</span>
          </p>
        </div>

        {/* Card 2 - Utilisateurs système */}
        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-neon-cyan/20">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Utilisateurs</h3>
          <p className="text-3xl font-bold text-neon-cyan mt-2">
            {userStats.active} <span className="text-sm text-slate-500 font-normal">/ {userStats.total}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">{userStats.admins} admin{userStats.admins > 1 ? 's' : ''} • {userStats.active} actif{userStats.active > 1 ? 's' : ''}</p>
        </div>

        {/* Card 3 - Commandes en attente de validation */}
        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-neon-orange/20">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">En attente validation</h3>
              <p className="text-3xl font-bold text-neon-orange mt-2">
                {formatPrice(pendingOrdersStats.amount)}
                <span className="text-lg ml-1">{config.currencySymbol}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">{pendingOrdersStats.count} commande{pendingOrdersStats.count > 1 ? 's' : ''} à valider</p>
            </div>
            {pendingOrdersStats.count > 0 && (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-orange opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-neon-orange"></span>
              </span>
            )}
          </div>
        </div>

        {/* Card 4 - État DMS */}
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

      {/* Statistiques détaillées du mois */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Commandes validées ce mois */}
        <div className="card-futuristic p-4 rounded-xl shadow-card border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-blue-400 uppercase">Validées (mois)</h4>
              <p className="text-xl font-bold text-white mt-1">
                {formatPrice(monthlyStats.validatedTotal)} <span className="text-sm text-slate-400">{config.currencySymbol}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-400">{monthlyStats.validatedCount}</span>
              <p className="text-xs text-slate-500">cmd</p>
            </div>
          </div>
        </div>

        {/* Commandes expédiées ce mois */}
        <div className="card-futuristic p-4 rounded-xl shadow-card border border-purple-500/20 bg-purple-500/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-purple-400 uppercase">Expédiées (mois)</h4>
              <p className="text-xl font-bold text-white mt-1">
                {formatPrice(monthlyStats.shippedTotal)} <span className="text-sm text-slate-400">{config.currencySymbol}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-purple-400">{monthlyStats.shippedCount}</span>
              <p className="text-xs text-slate-500">cmd</p>
            </div>
          </div>
        </div>

        {/* Factures ce mois */}
        <div className="card-futuristic p-4 rounded-xl shadow-card border border-neon-green/20 bg-neon-green/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-neon-green uppercase">Factures (mois)</h4>
              <p className="text-xl font-bold text-white mt-1">
                {formatPrice(monthlyStats.invoicesTotal)} <span className="text-sm text-slate-400">{config.currencySymbol}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-neon-green">{monthlyStats.invoicesCount}</span>
              <p className="text-xs text-slate-500">docs</p>
            </div>
          </div>
        </div>

        {/* BL ce mois */}
        <div className="card-futuristic p-4 rounded-xl shadow-card border border-neon-cyan/20 bg-neon-cyan/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-neon-cyan uppercase">Bons Livraison (mois)</h4>
              <p className="text-xl font-bold text-white mt-1">
                {formatPrice(monthlyStats.blTotal)} <span className="text-sm text-slate-400">{config.currencySymbol}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-neon-cyan">{monthlyStats.blCount}</span>
              <p className="text-xs text-slate-500">docs</p>
            </div>
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
