import React, { useMemo, useEffect } from 'react';
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
  const { formatPrice, formatPriceWithCurrency, config } = useConfig();

  // Fetch daily order stats for chart
  const { data: dailyStats } = useQuery({
    queryKey: ['dailyOrderStats'],
    queryFn: api.getDailyOrderStats,
    refetchInterval: 60000, // Refresh every minute
  });

  // Use ordersPerCommercialPerDay from the config context (already synced)
  const ordersPerCommercialPerDay = config?.ordersPerCommercialPerDay || 25;

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

  // Calculate B2B efficiency (how many commercials it can replace)
  const efficiency = useMemo(() => {
    if (!dailyStats) return null;

    const { monthOrderCount, avgPerDay } = dailyStats;

    // Calculate work days in current month (Mon-Fri + Sat half days)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let workDays = 0;
    let workHours = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        workDays++;
        workHours += 7; // 7h Mon-Fri
      } else if (dayOfWeek === 6) {
        workDays += 0.5;
        workHours += 4; // 4h Saturday
      }
    }

    // Orders a commercial can process per month
    const ordersPerCommercialPerMonth = ordersPerCommercialPerDay * workDays;

    // How many commercials the B2B replaces
    const commercialsReplaced = ordersPerCommercialPerMonth > 0
      ? monthOrderCount / ordersPerCommercialPerMonth
      : 0;

    // Daily equivalent
    const dailyCommercialsReplaced = ordersPerCommercialPerDay > 0
      ? avgPerDay / ordersPerCommercialPerDay
      : 0;

    return {
      monthOrderCount,
      avgPerDay,
      workDays,
      workHours,
      ordersPerCommercialPerMonth,
      commercialsReplaced: Math.round(commercialsReplaced * 100) / 100,
      dailyCommercialsReplaced: Math.round(dailyCommercialsReplaced * 100) / 100,
    };
  }, [dailyStats, ordersPerCommercialPerDay]);

  // Find max for chart scaling (consider all 3 series)
  const maxOrders = useMemo(() => {
    if (!dailyStats?.dailyOrders) return 10;
    const max = Math.max(
      ...dailyStats.dailyOrders.map(d => Math.max(d.created || 0, d.validated || 0, d.shipped || 0)),
      1
    );
    return Math.ceil(max * 1.2); // Add 20% headroom
  }, [dailyStats]);

  // Get current month name
  const monthName = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

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

      {/* Chart and Efficiency Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart - Daily Orders */}
        <div className="lg:col-span-2 card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-visible">
          <div className="px-6 py-3 border-b border-accent/10 bg-brand-800/30 flex justify-between items-center">
            <h3 className="font-bold text-white text-lg">Activité Commandes - {monthName}</h3>
            <div className="text-sm text-slate-400">
              Moyenne: <span className="text-accent font-bold">{dailyStats?.avgPerDay || 0}</span>/jour
            </div>
          </div>
          <div className="px-6 py-4 overflow-visible">
            <div className="h-48 flex items-end gap-[2px] overflow-visible">
              {dailyStats?.dailyOrders?.map((day) => {
                const createdHeight = maxOrders > 0 ? ((day.created || 0) / maxOrders) * 100 : 0;
                const validatedHeight = maxOrders > 0 ? ((day.validated || 0) / maxOrders) * 100 : 0;
                const shippedHeight = maxOrders > 0 ? ((day.shipped || 0) / maxOrders) * 100 : 0;
                const dayNum = parseInt(day.date.split('-')[2]);
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const isToday = day.date === todayStr;

                return (
                  <div
                    key={day.date}
                    className="flex-1 h-full flex flex-col items-center justify-end group relative"
                  >
                    {/* Tooltip - positioned to stay within bounds */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-50 left-1/2 -translate-x-1/2 pointer-events-none">
                      <div className="card-futuristic border border-accent/30 rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap">
                        <div className="font-bold text-white mb-1">{day.date.split('-')[2]}/{day.date.split('-')[1]}</div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-sky-400 rounded-full"></span>
                          <span className="text-sky-400">{day.created || 0} passées</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                          <span className="text-amber-500">{day.validated || 0} validées</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                          <span className="text-emerald-500">{day.shipped || 0} expédiées</span>
                        </div>
                        <div className="text-slate-400 mt-1 pt-1 border-t border-accent/20">{formatPriceWithCurrency(day.totalHT)} HT</div>
                      </div>
                    </div>

                    {/* Grouped Bars - distinct colors */}
                    <div className="flex items-end gap-[1px] w-full h-full">
                      {/* Passées (created) - Sky blue / Pink for today */}
                      <div
                        className={`flex-1 rounded-t transition-all duration-300 group-hover:opacity-80 ${isToday ? 'bg-fuchsia-500 shadow-glow' : 'bg-sky-400'}`}
                        style={{ height: `${Math.max(createdHeight, (day.created || 0) > 0 ? 4 : 0)}%` }}
                      />
                      {/* Validées - Amber/Orange / Pink for today */}
                      <div
                        className={`flex-1 rounded-t transition-all duration-300 group-hover:opacity-80 ${isToday ? 'bg-fuchsia-400' : 'bg-amber-500'}`}
                        style={{ height: `${Math.max(validatedHeight, (day.validated || 0) > 0 ? 4 : 0)}%` }}
                      />
                      {/* Expédiées - Emerald green / Pink for today */}
                      <div
                        className={`flex-1 rounded-t transition-all duration-300 group-hover:opacity-80 ${isToday ? 'bg-fuchsia-300' : 'bg-emerald-500'}`}
                        style={{ height: `${Math.max(shippedHeight, (day.shipped || 0) > 0 ? 4 : 0)}%` }}
                      />
                    </div>

                    {/* Day number and weekday */}
                    <div className="flex flex-col items-center mt-1 flex-shrink-0">
                      <span className={`text-[10px] font-medium ${isToday ? 'text-accent font-bold' : 'text-slate-400'}`}>
                        {dayNum}
                      </span>
                      <span className={`text-[9px] font-semibold ${isToday ? 'text-accent' : 'text-slate-500'}`}>
                        {['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(day.date).getDay()]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-4 text-xs text-white bg-brand-800/20 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-sky-400 rounded"></div>
                <span>Passées</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded"></div>
                <span>Validées</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                <span>Expédiées</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-fuchsia-500 rounded shadow-glow"></div>
                <span>Aujourd'hui</span>
              </div>
            </div>
          </div>
        </div>

        {/* Efficiency Card */}
        <div className="card-futuristic rounded-2xl shadow-card border border-accent/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-accent/10 bg-brand-800/30">
            <h3 className="font-bold text-white text-lg">Efficacité B2B</h3>
            <p className="text-xs text-slate-400 mt-1">Équivalent travail commercial automatisé</p>
          </div>
          <div className="p-6 space-y-5">
            {/* Two metrics side by side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Daily metric */}
              <div className="text-center p-4 rounded-xl bg-gradient-to-br from-neon-cyan/10 to-neon-cyan/5 border border-neon-cyan/20">
                <div className="text-3xl font-extrabold text-neon-cyan">
                  {efficiency?.dailyCommercialsReplaced.toFixed(2) || '0'}
                </div>
                <p className="text-xs font-semibold text-white mt-2">Par jour</p>
                <p className="text-[10px] text-slate-400 mt-1">commerciaux équivalents</p>
              </div>

              {/* Monthly metric */}
              <div className="text-center p-4 rounded-xl bg-gradient-to-br from-accent/10 to-neon-purple/10 border border-accent/20">
                <div className="text-3xl font-extrabold text-accent">
                  {efficiency?.commercialsReplaced.toFixed(2) || '0'}
                </div>
                <p className="text-xs font-semibold text-white mt-2">Ce mois</p>
                <p className="text-[10px] text-slate-400 mt-1">commerciaux équivalents</p>
              </div>
            </div>

            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-brand-800/30 rounded-lg">
                <div className="text-sm font-bold text-white">{efficiency?.monthOrderCount || 0}</div>
                <div className="text-[10px] text-slate-400">Cmd ce mois</div>
              </div>
              <div className="p-2 bg-brand-800/30 rounded-lg">
                <div className="text-sm font-bold text-white">{efficiency?.avgPerDay || 0}</div>
                <div className="text-[10px] text-slate-400">Cmd/jour moy.</div>
              </div>
              <div className="p-2 bg-brand-800/30 rounded-lg">
                <div className="text-sm font-bold text-accent">{ordersPerCommercialPerDay}</div>
                <div className="text-[10px] text-slate-400">Cmd/comm./jour</div>
              </div>
            </div>

            {/* Link to config */}
            <div className="text-center pt-2 border-t border-accent/10">
              <Link
                to="/admin/config"
                className="text-xs text-accent hover:text-accent-hover underline"
              >
                Modifier le paramètre Cmd/commercial/jour
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
