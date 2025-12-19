
import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useConfig } from '../context/ConfigContext';
import { useNotification } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { UserRole } from '../types';
import { api } from '../services/api';

// Icons
const Icons = {
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Catalog: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
  Cart: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  Orders: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  Docs: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Logout: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  Users: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Config: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Team: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  News: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>,
  Audit: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Bell: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Close: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
};

export const Layout = () => {
  const { user, logout, hasRole } = useAuth();
  const { itemCount, totalAmount } = useCart();
  const { config, formatPriceWithCurrency } = useConfig();
  const { notifications, unreadCount, markAsRead } = useNotification();
  const { toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [weather, setWeather] = useState<{ temp: number, icon: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Poll weather mock
    api.getWeather().then(setWeather);
    const weatherInterval = setInterval(() => api.getWeather().then(setWeather), 60000);

    // Update clock every second
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(weatherInterval);
      clearInterval(clockInterval);
    };
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const navItemClass = (path: string, isMobile: boolean = false) => `flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${location.pathname.startsWith(path)
    ? 'bg-accent/15 text-white font-semibold shadow-glow border border-accent/50'
    : 'text-slate-400 hover:bg-glass-light hover:text-white hover:border-accent/20 border border-transparent'
    } ${!isMobile && isCollapsed ? 'justify-center !px-2' : ''}`;

  const isInternal = hasRole([UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN]);
  const isSystemAdmin = hasRole([UserRole.SYSTEM_ADMIN]);
  const isFullAdmin = hasRole([UserRole.FULL_ADMIN]);
  const isClientUser = hasRole([UserRole.CLIENT_USER]);

  const appName = config.companyName || 'AutoPartPro';
  const appLogoUrl = config.logoUrl;

  // Sidebar content (shared between desktop and mobile)
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* User Info Compact */}
      {(isMobile || !isCollapsed) ? (
        <div className="p-4 z-10">
          <div className="glass rounded-xl p-4 shadow-inner-glow">
            <p className="text-[10px] text-accent uppercase font-bold tracking-wider mb-1">
              Connecté en tant que
            </p>
            <p className="font-semibold text-white truncate text-sm tracking-wide">{user?.fullName}</p>
            <p className="text-[11px] text-accent font-semibold mt-2 bg-accent/10 inline-block px-2 py-1 rounded-lg border border-accent/20 truncate max-w-full">
              B2B de {config.companyLegalName || 'SoftNex'}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-2 z-10 text-center pb-4 mt-4">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center mx-auto text-xs font-bold border border-accent/30 text-accent shadow-glow">
            {user?.fullName.charAt(0)}
          </div>
        </div>
      )}

      <div className="p-4 flex-1 overflow-y-auto z-10 custom-scrollbar">
        <nav className="space-y-1">

          {/* COMMON: Dashboard */}
          <Link to={isInternal ? "/admin/dashboard" : "/dashboard"} className={navItemClass(isInternal ? '/admin/dashboard' : '/dashboard', isMobile)} title="Tableau de bord">
            <Icons.Dashboard />
            {(isMobile || !isCollapsed) && <span>Tableau de bord</span>}
          </Link>

          {/* SYSTEM ADMIN & AGENCY ADMIN */}
          {(isSystemAdmin || isFullAdmin) && (
            <>
              {(isMobile || !isCollapsed) && <div className="pt-6 pb-2 px-4 text-[10px] font-bold text-neon-purple uppercase tracking-widest">Administration</div>}
              {!isMobile && isCollapsed && <div className="h-4"></div>}
              <Link to="/admin/clients" className={navItemClass('/admin/clients', isMobile)} title="Entreprises">
                <Icons.Team />
                {(isMobile || !isCollapsed) && <span>Entreprises</span>}
              </Link>
              <Link to="/admin/users" className={navItemClass('/admin/users', isMobile)} title="Utilisateurs">
                <Icons.Users />
                {(isMobile || !isCollapsed) && <span>Utilisateurs</span>}
              </Link>
              <Link to="/admin/news" className={navItemClass('/admin/news', isMobile)} title="Actualités">
                <Icons.News />
                {(isMobile || !isCollapsed) && <span>Actualités</span>}
              </Link>
              {/* Configuration - SYSTEM_ADMIN only */}
              {isSystemAdmin && (
                <Link to="/admin/config" className={navItemClass('/admin/config', isMobile)} title="Configuration">
                  <Icons.Config />
                  {(isMobile || !isCollapsed) && <span>Configuration</span>}
                </Link>
              )}
              <Link to="/admin/audit" className={navItemClass('/admin/audit', isMobile)} title="Audit & Logs">
                <Icons.Audit />
                {(isMobile || !isCollapsed) && <span>Audit & Logs</span>}
              </Link>
            </>
          )}

          {(isMobile || !isCollapsed) && <div className="pt-6 pb-2 px-4 text-[10px] font-bold text-neon-cyan uppercase tracking-widest">Opérations</div>}
          {!isMobile && isCollapsed && <div className="h-4"></div>}

          {/* CATALOG (ALL ROLES) */}
          <Link to="/catalog" className={navItemClass('/catalog', isMobile)} title="Catalogue">
            <Icons.Catalog />
            {(isMobile || !isCollapsed) && <span>Catalogue Pièces</span>}
          </Link>

          {/* ORDERS (ALL ROLES - View differs by role) */}
          <Link to={isInternal ? "/admin/orders" : "/orders"} className={navItemClass(isInternal ? '/admin/orders' : '/orders', isMobile)} title="Commandes">
            <Icons.Orders />
            {(isMobile || !isCollapsed) && <span>Commandes</span>}
          </Link>

          {/* DOCUMENTS (ALL ROLES) */}
          <Link to="/documents" className={navItemClass('/documents', isMobile)} title="Documents">
            <Icons.Docs />
            {(isMobile || !isCollapsed) && <span>Factures & BL</span>}
          </Link>

          {/* CLIENT ADMIN ONLY */}
          {hasRole([UserRole.CLIENT_ADMIN]) && (
            <>
              {(isMobile || !isCollapsed) && <div className="pt-6 pb-2 px-4 text-[10px] font-bold text-neon-green uppercase tracking-widest">Mon Compte</div>}
              {!isMobile && isCollapsed && <div className="h-4"></div>}
              <Link to="/team" className={navItemClass('/team', isMobile)} title="Mon Équipe">
                <Icons.Users />
                {(isMobile || !isCollapsed) && <span>Mon Équipe</span>}
              </Link>
            </>
          )}

          {/* CART for mobile - Client users */}
          {isMobile && !isInternal && !isClientUser && (
            <>
              <div className="pt-6 pb-2 px-4 text-[10px] font-bold text-neon-orange uppercase tracking-widest">Panier</div>
              <Link to="/cart" className={navItemClass('/cart', isMobile)} title="Panier">
                <Icons.Cart />
                <span>Panier ({itemCount})</span>
                {itemCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {formatPriceWithCurrency(totalAmount)}
                  </span>
                )}
              </Link>
            </>
          )}

        </nav>
      </div>

      <div className="p-4 border-t border-accent/10 bg-brand-950/50 z-10">
        {!isMobile && isCollapsed && (
          <button onClick={() => setIsCollapsed(false)} className="mx-auto block text-slate-500 hover:text-accent mb-4 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>
        )}
        <button onClick={logout} className={`logout-btn flex items-center space-x-2 px-4 py-3 w-full transition-all rounded-xl border-2 ${!isMobile && isCollapsed ? 'justify-center' : ''}`} title="Déconnexion">
          <Icons.Logout />
          {(isMobile || !isCollapsed) && <span className="text-sm font-bold">Déconnexion</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-brand-950 overflow-hidden font-sans bg-grid">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 w-72 bg-brand-900 text-white flex flex-col z-50
        transform transition-transform duration-300 ease-in-out lg:hidden glass
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Abstract Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none z-0 bg-gradient-neon"></div>

        {/* Header / Logo with close button */}
        <div className="p-6 z-10 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
              <span className="bg-accent rounded-lg p-1.5 mr-2 shadow-glow animate-pulse-glow">
                {appLogoUrl ? (
                  <img src={appLogoUrl} alt="Logo" className="w-5 h-5 object-contain" />
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                )}
              </span>
              <span className="tracking-tight">{appName}</span>
            </h1>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-slate-400 hover:text-accent transition-colors p-2"
          >
            <Icons.Close />
          </button>
        </div>

        <SidebarContent isMobile={true} />
      </aside>

      {/* Desktop Sidebar - Professional Dark Theme with Pattern */}
      <aside className={`${isCollapsed ? 'w-20' : 'w-72'} bg-brand-900 text-white flex-col hidden lg:flex shadow-2xl z-30 relative transition-all duration-300 ease-in-out border-r border-accent/10`}>

        {/* Abstract Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none z-0 bg-gradient-neon"></div>

        {/* Header / Logo */}
        <div className={`p-6 z-10 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className={`${isCollapsed ? 'justify-center' : 'justify-start'} flex items-center gap-2`}>
              {appLogoUrl ? (
                <img src={appLogoUrl} alt="Logo" className={isCollapsed ? "w-8 h-8 object-contain drop-shadow-lg" : "w-8 h-8 object-contain drop-shadow-lg"} />
              ) : (
                <svg className={isCollapsed ? "w-6 h-6 text-white" : "w-5 h-5 text-white"} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              )}
              {!isCollapsed && (
                <span className="tracking-tight text-white font-bold">{appName}</span>
              )}
            </div>
          </div>

          {/* Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`text-slate-400 hover:text-accent transition-colors ${isCollapsed ? 'hidden' : 'ml-2'}`}
            title="Réduire le menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          </button>
        </div>

        <SidebarContent isMobile={false} />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-brand-950">
        <header className="glass shadow-card border-b border-accent/10 h-16 lg:h-20 flex items-center justify-between px-4 lg:px-8 z-20 sticky top-0 transition-all">

          {/* LEFT: Menu Button (Mobile) + Logo/Breadcrumbs */}
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-400 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
            >
              <Icons.Menu />
            </button>

            {/* Mobile Logo */}
            <div className="lg:hidden font-bold text-white text-lg flex items-center gap-2">
              {appLogoUrl ? (
                <img src={appLogoUrl} alt="Logo" className="w-8 h-8 object-contain drop-shadow-lg" />
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              )}
              <span className="hidden sm:inline">{appName}</span>
            </div>

            {/* Desktop Breadcrumbs */}
            <div className="hidden lg:block text-sm text-slate-400 font-medium">
              Plateforme <span className="mx-2 text-accent/50">/</span> <span className="text-accent">{location.pathname.split('/')[1] ? location.pathname.split('/')[1].charAt(0).toUpperCase() + location.pathname.split('/')[1].slice(1) : 'Accueil'}</span>
            </div>
          </div>

          {/* CENTER: Branding OR Weather Widget - Dynamic width */}
          <div className="flex-1 flex items-center h-full overflow-hidden justify-center mx-2 lg:mx-4">
            {/* Brand Logo Marquee - Only if configured - Takes full available space */}
            {config.brandLogos && config.brandLogos.length > 0 ? (
              <div className="hidden md:flex relative h-14 overflow-hidden items-center w-full">
                <div className="absolute inset-y-0 left-0 w-8 lg:w-16 bg-gradient-to-r from-brand-900/80 to-transparent z-10"></div>
                <div className="absolute inset-y-0 right-0 w-8 lg:w-16 bg-gradient-to-l from-brand-900/80 to-transparent z-10"></div>

                <div className="flex animate-marquee whitespace-nowrap space-x-8 lg:space-x-16 items-center">
                  {[...config.brandLogos, ...config.brandLogos, ...config.brandLogos, ...config.brandLogos].map((logo, idx) => (
                    <img key={idx} src={logo} alt="Partner Logo" className="h-8 lg:h-10 w-auto object-contain transition-all duration-300 opacity-60 hover:opacity-100 brightness-150" />
                  ))}
                </div>
              </div>
            ) : (
              /* Fallback Widget: Date, Time & Weather */
              <>
                {/* Desktop/Tablet version */}
                <div className="hidden md:flex items-center space-x-3 xl:space-x-6 text-slate-400 glass-light px-3 xl:px-6 py-2 xl:py-2.5 rounded-full border border-accent/20">
                  {/* Date - Hidden until xl (1280px) */}
                  <div className="hidden xl:block text-xs font-bold uppercase tracking-widest border-r border-accent/20 pr-6 text-slate-300">
                    {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>

                  {/* Real-time Clock */}
                  <div className="flex items-center xl:border-r xl:border-accent/20 xl:pr-6">
                    <svg className="w-4 h-4 mr-2 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm xl:text-lg font-mono font-bold text-white tabular-nums">
                      {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  {/* Weather - Compact version between lg-xl, full version on xl+ */}
                  {weather && (
                    <div className="flex items-center text-sm font-medium">
                      <span className="text-lg xl:text-xl mr-1 xl:mr-2">{weather.icon}</span>
                      <span className="font-bold text-white">{weather.temp}°C</span>
                      <span className="hidden xl:inline text-xs ml-2 text-slate-400">à {config.weatherLocation || 'Tunis'}</span>
                    </div>
                  )}
                </div>

                {/* Mobile version - Just time */}
                <div className="flex md:hidden items-center text-accent">
                  <span className="text-sm font-mono font-bold tabular-nums">
                    {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4 lg:space-x-6">

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-400 hover:text-accent transition-all duration-300 theme-toggle rounded-lg hover:bg-accent/10"
              title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {isDark ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                className="relative p-2 text-slate-400 hover:text-accent transition-colors"
              >
                <Icons.Bell />
                {unreadCount > 0 && (
                  <span className="notification-indicator absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-md animate-pulse"></span>
                )}
              </button>

              {showNotifDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)}></div>
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 glass rounded-xl shadow-card border border-accent/20 z-50 overflow-hidden animate-fadeIn">
                    <div className="p-3 border-b border-accent/10 flex justify-between items-center bg-brand-800/50">
                      <h3 className="text-xs font-bold text-accent uppercase">Notifications</h3>
                      {unreadCount > 0 && <span className="text-[10px] bg-neon-pink/20 text-neon-pink px-1.5 py-0.5 rounded font-bold">{unreadCount} non lues</span>}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-500 italic">Aucune notification</div>
                      ) : (
                        notifications.map(notif => (
                          <div
                            key={notif.id}
                            className={`p-3 border-b border-accent/5 hover:bg-accent/10 transition-colors cursor-pointer ${!notif.isRead ? 'bg-accent/5' : ''}`}
                            onClick={() => markAsRead(notif.id)}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-[10px] font-bold px-1.5 rounded ${notif.type === 'NEW_ORDER' ? 'bg-neon-green/20 text-neon-green' :
                                notif.type === 'ORDER_STATUS' ? 'bg-neon-blue/20 text-neon-blue' : 'bg-slate-700 text-slate-300'
                                }`}>{notif.type === 'NEW_ORDER' ? 'Nouvelle commande' : notif.type === 'ORDER_STATUS' ? 'Commande' : 'Système'}</span>
                              <span className="text-[10px] text-slate-500">{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className={`text-sm text-white ${!notif.isRead ? 'font-bold' : 'font-medium'}`}>{notif.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notif.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Internal / Role Badges - Hidden on mobile */}
            {isInternal ? (
              <div className="hidden md:flex items-center space-x-2 glass-light px-3 py-1.5 rounded-full border border-neon-purple/30">
                <div className={`w-2 h-2 rounded-full ${isSystemAdmin ? 'bg-neon-purple animate-pulse' : isFullAdmin ? 'bg-neon-orange animate-pulse' : 'bg-neon-blue'}`}></div>
                <span className={`text-xs font-bold uppercase tracking-wide ${isSystemAdmin ? 'text-neon-purple' : isFullAdmin ? 'text-neon-orange' : 'text-neon-blue'}`}>
                  {isSystemAdmin ? 'Super Admin' : isFullAdmin ? 'Admin Complet' : 'Admin Gestion'}
                </span>
              </div>
            ) : isClientUser ? (
              <div className="hidden md:block text-xs font-bold text-slate-400 glass-light px-3 py-1 rounded-full border border-slate-600">
                Consultation Seule
              </div>
            ) : null}

            {/* Cart Icon - Desktop only, hidden on mobile (available in mobile menu) */}
            {!isInternal && !isClientUser && (
              <Link to="/cart" className="hidden sm:flex items-center space-x-2 lg:space-x-4 group glass-light border border-accent/20 px-3 lg:px-5 py-2 rounded-full hover:border-accent/50 hover:shadow-glow transition-all duration-300">
                <div className="text-right hidden lg:block">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Panier</p>
                  <p className="font-bold text-white text-sm">{formatPriceWithCurrency(totalAmount)}</p>
                </div>
                <div className="relative p-2 bg-accent/20 text-accent rounded-full group-hover:bg-accent group-hover:text-white transition-colors duration-300">
                  <Icons.Cart />
                  {itemCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-neon-pink text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full ring-2 ring-brand-900 shadow-glow-pink">
                      {itemCount}
                    </span>
                  )}
                </div>
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-8 bg-brand-950 bg-grid scroll-smooth pb-20 lg:pb-8">
          <div className="max-w-[1800px] mx-auto animate-fadeIn">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass border-t border-accent/20 shadow-card z-30">
          <div className="flex items-center justify-around h-16">
            <Link
              to={isInternal ? "/admin/dashboard" : "/dashboard"}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${location.pathname.includes('dashboard') ? 'text-accent' : 'text-slate-500'
                }`}
            >
              <Icons.Dashboard />
              <span className="text-[10px] mt-1 font-medium">Accueil</span>
            </Link>

            <Link
              to="/catalog"
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${location.pathname === '/catalog' ? 'text-accent' : 'text-slate-500'
                }`}
            >
              <Icons.Catalog />
              <span className="text-[10px] mt-1 font-medium">Catalogue</span>
            </Link>

            {!isInternal && !isClientUser && (
              <Link
                to="/cart"
                className={`flex flex-col items-center justify-center flex-1 h-full relative transition-colors ${location.pathname === '/cart' ? 'text-accent' : 'text-slate-500'
                  }`}
              >
                <div className="relative">
                  <Icons.Cart />
                  {itemCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-neon-pink text-white text-[8px] font-bold h-4 w-4 flex items-center justify-center rounded-full animate-pulse">
                      {itemCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-1 font-medium">Panier</span>
              </Link>
            )}

            <Link
              to={isInternal ? "/admin/orders" : "/orders"}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${location.pathname.includes('orders') ? 'text-accent' : 'text-slate-500'
                }`}
            >
              <Icons.Orders />
              <span className="text-[10px] mt-1 font-medium">Commandes</span>
            </Link>

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full text-slate-500 hover:text-accent transition-colors"
            >
              <Icons.Menu />
              <span className="text-[10px] mt-1 font-medium">Menu</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
};
