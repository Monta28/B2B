import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuth();
  const { config } = useConfig();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const appName = config.companyName || 'AutoPartPro';
  const appLogoUrl = config.logoUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password, rememberMe);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    }
  };

  return (
    <div className="min-h-screen flex bg-brand-950 relative overflow-hidden">

      {/* Theme Toggle Button - Top Right */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 z-50 p-3 rounded-xl glass border border-accent/20 hover:border-accent/40 shadow-card hover:shadow-glow transition-all duration-300 theme-toggle group"
        title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      >
        {isDark ? (
          <svg className="w-5 h-5 text-amber-400 group-hover:text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient Orbs */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-neon-purple/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl"></div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-grid opacity-30"></div>

        {/* Floating Particles */}
        <div className="absolute top-20 left-1/4 w-2 h-2 bg-accent/40 rounded-full animate-pulse"></div>
        <div className="absolute top-40 right-1/3 w-1.5 h-1.5 bg-neon-purple/40 rounded-full animate-pulse" style={{ animationDelay: '-1s' }}></div>
        <div className="absolute bottom-32 left-1/3 w-1 h-1 bg-neon-green/40 rounded-full animate-pulse" style={{ animationDelay: '-2s' }}></div>
      </div>

      {/* Left Panel - Branding (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12">

        {/* Top Section - Logo & Tagline */}
        <div className="relative z-10">
          <div className="flex items-center space-x-4 mb-8">
            {appLogoUrl ? (
              <img src={appLogoUrl} alt="Logo" className="w-16 h-16 object-contain drop-shadow-lg" />
            ) : (
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white">{appName}</h1>
              <p className="text-slate-400 text-sm font-medium mt-1">Plateforme B2B Nouvelle Génération</p>
            </div>
          </div>


          <div className="max-w-lg">
            <h2 className="text-3xl font-bold text-white leading-tight">
              Gérez vos commandes de pièces détachées
              <span className="text-accent"> en temps réel</span>
            </h2>
            <p className="mt-4 text-slate-400 text-lg leading-relaxed">
              Une solution complète et intuitive pour optimiser votre activité et renforcer votre relation client.
            </p>
          </div>
        </div>

        {/* Center - Feature Cards */}
        <div className="relative z-10 grid grid-cols-2 gap-4 my-8">
          <div className="group card-futuristic p-5 rounded-2xl border border-accent/20 hover:border-accent/40 transition-all duration-300 hover:shadow-glow">
            <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-accent/30">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Synchronisation</h3>
            <p className="text-sm text-slate-400 mt-2">Stock et prix synchronisés en temps réel avec votre DMS.</p>
          </div>

          <div className="group card-futuristic p-5 rounded-2xl border border-neon-green/20 hover:border-neon-green/40 transition-all duration-300 hover:shadow-glow">
            <div className="w-12 h-12 bg-neon-green/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-neon-green/30">
              <svg className="w-6 h-6 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Fiabilité</h3>
            <p className="text-sm text-slate-400 mt-2">Suivi précis des commandes et facturation automatisée.</p>
          </div>

          <div className="group card-futuristic p-5 rounded-2xl border border-neon-purple/20 hover:border-neon-purple/40 transition-all duration-300 hover:shadow-glow-purple">
            <div className="w-12 h-12 bg-neon-purple/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-neon-purple/30">
              <svg className="w-6 h-6 text-neon-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Sécurité</h3>
            <p className="text-sm text-slate-400 mt-2">Données protégées avec chiffrement de bout en bout.</p>
          </div>

          <div className="group card-futuristic p-5 rounded-2xl border border-neon-orange/20 hover:border-neon-orange/40 transition-all duration-300">
            <div className="w-12 h-12 bg-neon-orange/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-neon-orange/30">
              <svg className="w-6 h-6 text-neon-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Performance</h3>
            <p className="text-sm text-slate-400 mt-2">Interface ultra-rapide pour une productivité maximale.</p>
          </div>
        </div>

        {/* Bottom - Copyright */}
        <div className="relative z-10 flex items-center justify-between">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} {appName}. Tous droits réservés.</p>
          <div className="flex items-center space-x-4">
            <a href="#" className="text-xs text-slate-500 hover:text-accent transition-colors">Conditions</a>
            <a href="#" className="text-xs text-slate-500 hover:text-accent transition-colors">Confidentialité</a>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center py-12 px-6 sm:px-12 lg:px-16 relative bg-grid">

        {/* Decorative Border Line */}
        <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 h-[70%] w-px bg-gradient-to-b from-transparent via-accent/30 to-transparent"></div>

        <div className="mx-auto w-full max-w-md">

          {/* Mobile Logo */}
          <div className="lg:hidden mb-10 text-center">
            <div className="inline-flex items-center justify-center space-x-3">
              {appLogoUrl ? (
                <img src={appLogoUrl} alt="Logo" className="w-14 h-14 object-contain drop-shadow-lg" />
              ) : (
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              <h1 className="text-2xl font-extrabold text-white">{appName}</h1>
            </div>
          </div>

          {/* Login Header */}
          <div className="text-center lg:text-left mb-8">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium mb-4">
              <span className="w-2 h-2 bg-accent rounded-full mr-2 animate-pulse"></span>
              Espace Professionnel
            </div>
            <h2 className="text-3xl font-bold text-white">Bienvenue</h2>
            <p className="mt-2 text-slate-400">
              Connectez-vous pour accéder à votre espace personnalisé.
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center p-4 rounded-xl bg-neon-pink/10 border border-neon-pink/30 animate-fadeIn">
                <div className="flex-shrink-0 w-10 h-10 bg-neon-pink/20 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-neon-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-neon-pink">{error}</p>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div className="relative">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email ou Nom d'utilisateur
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'email' ? 'ring-2 ring-accent/50' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className={`w-5 h-5 transition-colors ${focusedField === 'email' ? 'text-accent' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="Entrez votre identifiant"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className="block w-full pl-12 pr-4 py-4 bg-brand-800/80 border border-accent/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Mot de passe
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'password' ? 'ring-2 ring-accent/50' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className={`w-5 h-5 transition-colors ${focusedField === 'password' ? 'text-accent' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Entrez votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="block w-full pl-12 pr-12 py-4 bg-brand-800/80 border border-accent/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-accent transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${rememberMe ? 'bg-accent border-accent' : 'border-slate-600 group-hover:border-accent/50'}`}>
                    {rememberMe && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="ml-3 text-sm text-slate-300 group-hover:text-white transition-colors">Se souvenir de moi</span>
              </label>

              <a href="#" className="text-sm font-medium text-accent hover:text-accent-hover transition-colors">
                Mot de passe oublié ?
              </a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="relative w-full flex justify-center items-center py-4 px-6 rounded-xl text-white font-bold text-base overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed transition-all"
            >
              {/* Button Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-accent to-accent-dark transition-all group-hover:opacity-90"></div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-accent-dark to-accent"></div>

              {/* Glow Effect */}
              <div className="absolute inset-0 shadow-glow opacity-50 group-hover:opacity-100 transition-opacity"></div>

              {/* Button Content */}
              <span className="relative flex items-center">
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connexion en cours...
                  </>
                ) : (
                  <>
                    Se connecter
                    <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
