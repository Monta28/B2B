import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { AppConfig } from '../types';

interface ConfigContextType {
  config: AppConfig;
  formatPrice: (amount: number | undefined) => string;
  formatPriceWithCurrency: (amount: number | undefined) => string;
  updateConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  isLoading: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 6) return null;
  const n = parseInt(cleaned, 16);
  if (Number.isNaN(n)) return null;
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
};

const cssEscapeClass = (className: string) => className.replace(/\//g, '\\/');

export const ConfigProvider = ({ children }: React.PropsWithChildren) => {
  const [config, setConfig] = useState<AppConfig>({ 
    currencySymbol: 'TND', 
    decimalPlaces: 3, 
    validationCooldownSeconds: 30,
    brandLogos: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getAppConfig()
      .then(c => {
        if (mounted) {
          setConfig(c);
          setIsLoading(false);
        }
      })
      .catch(async () => {
        try {
          const publicCfg = await api.getPublicConfig();
          if (mounted) {
            setConfig(publicCfg);
          }
        } finally {
          if (mounted) setIsLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  const updateConfig = async (patch: Partial<AppConfig>) => {
    try {
      await api.updateAppConfig(patch);
    } catch (err) {
      throw err;
    }
    const refreshed = await api.getAppConfig();
    setConfig(refreshed);

    // Safety check: detect if backend rejected theme fields silently (e.g. DB not migrated or backend pas à jour)
    const themeKeys: (keyof AppConfig)[] = [
      'accentColor', 'accentHoverColor', 'accentDarkColor',
      'darkBrand950', 'darkBrand900', 'darkBrand800',
      'lightBrand950', 'lightBrand900', 'lightBrand800',
      'themeVariablesJson', 'logoUrl', 'faviconUrl',
    ];
    const hasThemeMismatch = themeKeys.some((key) => {
      if (patch[key] === undefined) return false;
      return `${(refreshed as any)[key] ?? ''}` !== `${(patch as any)[key] ?? ''}`;
    });
    if (hasThemeMismatch) {
      throw new Error("Les couleurs/branding n'ont pas été enregistrés (base non migrée ou backend non redémarré).");
    }

    return refreshed;
  };

  // Apply Branding/Theme to the whole app
  useEffect(() => {
    const root = document.documentElement;

    const companyName = config.companyName || 'AutoPartPro';
    if (companyName) {
      document.title = companyName;
    }

    // Favicon
    if (config.faviconUrl) {
      let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = config.faviconUrl;
    }

    const accent = config.accentColor || '#3b82f6';
    const accentHover = config.accentHoverColor || '#60a5fa';
    const accentDark = config.accentDarkColor || '#2563eb';

    const dark950 = config.darkBrand950 || '#0f172a';
    const dark900 = config.darkBrand900 || '#1e293b';
    const dark800 = config.darkBrand800 || '#334155';

    const light950 = config.lightBrand950 || '#e2e8f0';
    const light900 = config.lightBrand900 || '#cbd5e1';
    const light800 = config.lightBrand800 || '#f1f5f9';

    const accentRgb = hexToRgb(accent) || { r: 59, g: 130, b: 246 };
    const dark950Rgb = hexToRgb(dark950) || { r: 15, g: 23, b: 42 };
    const dark900Rgb = hexToRgb(dark900) || { r: 30, g: 41, b: 59 };
    const dark800Rgb = hexToRgb(dark800) || { r: 51, g: 65, b: 85 };
    const light950Rgb = hexToRgb(light950) || { r: 226, g: 232, b: 240 };
    const light900Rgb = hexToRgb(light900) || { r: 203, g: 213, b: 225 };
    const light800Rgb = hexToRgb(light800) || { r: 241, g: 245, b: 249 };

    const fontFamily = config.fontFamily || 'Inter, "Segoe UI", sans-serif';
    const borderRadius = config.borderRadiusStyle || '12px';
    const defaultFontSize = '14px';
    const primaryFontName = fontFamily.split(',')[0]?.replace(/"/g, '').trim() || 'Inter';

    // Optional advanced CSS variables map (JSON string)
    if (config.themeVariablesJson) {
      try {
        const parsed = JSON.parse(config.themeVariablesJson) as Record<string, string>;
        Object.entries(parsed).forEach(([key, value]) => {
          if (key.startsWith('--') && typeof value === 'string') {
            root.style.setProperty(key, value);
          }
        });
      } catch {
        // ignore invalid JSON
      }
    }

    // Base CSS variables (fallbacks) for typo & arrondis
    if (!root.style.getPropertyValue('--app-font-size')) {
      root.style.setProperty('--app-font-size', defaultFontSize);
    }
    root.style.setProperty('--app-font-family', fontFamily);
    root.style.setProperty('--app-radius', borderRadius);

    // Load Google font if needed
    const googleFonts: Record<string, string> = {
      'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      'Poppins': 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
      'Roboto': 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
      'Montserrat': 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
      'Open Sans': 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap',
    };
    const fontHref = googleFonts[primaryFontName];
    if (fontHref) {
      const linkId = 'dynamic-brand-font';
      let linkEl = document.getElementById(linkId) as HTMLLinkElement | null;
      if (!linkEl) {
        linkEl = document.createElement('link');
        linkEl.id = linkId;
        linkEl.rel = 'stylesheet';
        document.head.appendChild(linkEl);
      }
      linkEl.href = fontHref;
    }

    // Dynamic overrides stylesheet (keeps current theme but makes it configurable)
    const styleId = 'dynamic-branding-theme';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const bgAccent10 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.10)`;
    const bgAccent15 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.15)`;
    const bgAccent20 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.20)`;
    const bgAccent30 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.30)`;
    const bgAccent40 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.40)`;

    const bgDarkGrid = `linear-gradient(rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.02) 1px, transparent 1px)`;
    const bgLightGrid = `linear-gradient(rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.12) 1px, transparent 1px)`;

    styleEl.textContent = `
      :root {
        --app-accent: ${accent};
        --app-accent-hover: ${accentHover};
        --app-accent-dark: ${accentDark};
        --app-accent-rgb: ${accentRgb.r} ${accentRgb.g} ${accentRgb.b};
      }

      /* Background gradients (keep current look, configurable colors) */
      .dark-mode body {
        background: linear-gradient(135deg, ${dark950} 0%, ${dark900} 50%, ${dark950} 100%) !important;
      }
      .light-mode body {
        background: linear-gradient(135deg, ${light950} 0%, ${light900} 50%, ${light950} 100%) !important;
      }

      /* Brand surfaces */
      .dark-mode .bg-brand-950 { background-color: ${dark950} !important; }
      .dark-mode .bg-brand-900 { background-color: ${dark900} !important; }
      .dark-mode .bg-brand-800 { background-color: rgba(${dark800Rgb.r}, ${dark800Rgb.g}, ${dark800Rgb.b}, 0.9) !important; }
      .dark-mode .${cssEscapeClass('bg-brand-800/60')} { background-color: rgba(${dark800Rgb.r}, ${dark800Rgb.g}, ${dark800Rgb.b}, 0.60) !important; }
      .dark-mode .${cssEscapeClass('bg-brand-800/50')} { background-color: rgba(${dark800Rgb.r}, ${dark800Rgb.g}, ${dark800Rgb.b}, 0.50) !important; }
      .dark-mode .${cssEscapeClass('bg-brand-800/40')} { background-color: rgba(${dark800Rgb.r}, ${dark800Rgb.g}, ${dark800Rgb.b}, 0.40) !important; }
      .dark-mode .${cssEscapeClass('bg-brand-800/30')} { background-color: rgba(${dark800Rgb.r}, ${dark800Rgb.g}, ${dark800Rgb.b}, 0.30) !important; }
      .dark-mode .${cssEscapeClass('bg-brand-800/20')} { background-color: rgba(${dark800Rgb.r}, ${dark800Rgb.g}, ${dark800Rgb.b}, 0.20) !important; }
      .light-mode .bg-brand-950 { background-color: ${light950} !important; }
      .light-mode .bg-brand-900 { background-color: ${light900} !important; }
      .light-mode .bg-brand-800 { background-color: rgba(${light800Rgb.r}, ${light800Rgb.g}, ${light800Rgb.b}, 0.92) !important; }
      .light-mode .${cssEscapeClass('bg-brand-800/60')} { background-color: rgba(${light800Rgb.r}, ${light800Rgb.g}, ${light800Rgb.b}, 0.60) !important; }
      .light-mode .${cssEscapeClass('bg-brand-800/50')} { background-color: rgba(${light800Rgb.r}, ${light800Rgb.g}, ${light800Rgb.b}, 0.50) !important; }
      .light-mode .${cssEscapeClass('bg-brand-800/40')} { background-color: rgba(${light800Rgb.r}, ${light800Rgb.g}, ${light800Rgb.b}, 0.40) !important; }
      .light-mode .${cssEscapeClass('bg-brand-800/30')} { background-color: rgba(${light800Rgb.r}, ${light800Rgb.g}, ${light800Rgb.b}, 0.30) !important; }
      .light-mode .${cssEscapeClass('bg-brand-800/20')} { background-color: rgba(${light800Rgb.r}, ${light800Rgb.g}, ${light800Rgb.b}, 0.20) !important; }

      /* Typo & taille */
      :root, body { font-family: var(--app-font-family, ${fontFamily}) !important; font-size: var(--app-font-size, ${defaultFontSize}); }
      button, input, select, textarea { font-family: var(--app-font-family, ${fontFamily}) !important; }
      .font-sans, .font-medium, .font-bold, .font-extrabold, .font-semibold { font-family: var(--app-font-family, ${fontFamily}) !important; }

      /* Arrondis unifiés (boutons, inputs, menus) */
      button, input, select, textarea,
      .rounded, .rounded-md, .rounded-lg, .rounded-xl, .rounded-2xl,
      .dropdown, .menu, .glass, .glass-light {
        border-radius: var(--app-radius, ${borderRadius}) !important;
      }

      /* Accent utilities (override Tailwind generated values) */
      .text-accent { color: var(--app-accent) !important; }
      .bg-accent { background-color: var(--app-accent) !important; }
      .border-accent { border-color: var(--app-accent) !important; }
      .hover\\:text-accent-hover:hover { color: var(--app-accent-hover) !important; }
      .hover\\:bg-accent-hover:hover { background-color: var(--app-accent-hover) !important; }

      .${cssEscapeClass('bg-accent/10')} { background-color: ${bgAccent10} !important; }
      .${cssEscapeClass('bg-accent/15')} { background-color: ${bgAccent15} !important; }
      .${cssEscapeClass('bg-accent/20')} { background-color: ${bgAccent20} !important; }
      .${cssEscapeClass('bg-accent/30')} { background-color: ${bgAccent30} !important; }
      .${cssEscapeClass('bg-accent/40')} { background-color: ${bgAccent40} !important; }

      .${cssEscapeClass('border-accent/10')},
      .${cssEscapeClass('border-accent/20')},
      .${cssEscapeClass('border-accent/30')} { border-color: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25) !important; }

      /* Gradient helpers used across the app */
      .from-accent { --tw-gradient-from: var(--app-accent) var(--tw-gradient-from-position); --tw-gradient-to: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0) var(--tw-gradient-to-position); }
      .to-accent { --tw-gradient-to: var(--app-accent) var(--tw-gradient-to-position); }
      .from-accent-dark { --tw-gradient-from: var(--app-accent-dark) var(--tw-gradient-from-position); --tw-gradient-to: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0) var(--tw-gradient-to-position); }
      .to-accent-dark { --tw-gradient-to: var(--app-accent-dark) var(--tw-gradient-to-position); }

      /* Effects */
      .shadow-glow { box-shadow: 0 0 20px rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.18) !important; }
      .shadow-card { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18) !important; }

      /* Grid */
      .bg-grid { background-image: ${bgDarkGrid}; }
      .light-mode .bg-grid { background-image: ${bgLightGrid} !important; }

      /* Glass backgrounds match the brand surfaces */
      .dark-mode .glass { background: rgba(${dark900Rgb.r}, ${dark900Rgb.g}, ${dark900Rgb.b}, 0.80) !important; }
      .dark-mode .glass-light { background: rgba(${dark900Rgb.r}, ${dark900Rgb.g}, ${dark900Rgb.b}, 0.60) !important; }
      .light-mode .glass { background: rgba(255, 255, 255, 0.92) !important; }
      .light-mode .glass-light { background: rgba(255, 255, 255, 0.70) !important; }
    `;
  }, [config]);

  // Helper to format number with space as thousands separator
  const formatNumberWithSpaces = (num: number, decimals: number): string => {
    const fixed = num.toFixed(decimals);
    const [intPart, decPart] = fixed.split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return decPart ? `${formattedInt}.${decPart}` : formattedInt;
  };

  // Format price without currency symbol (for tables to save space)
  const formatPrice = (amount: number | undefined): string => {
    if (amount === undefined || amount === null) return '-';
    return formatNumberWithSpaces(amount, config.decimalPlaces);
  };

  // Format price with currency symbol (for summaries/totals)
  const formatPriceWithCurrency = (amount: number | undefined): string => {
    if (amount === undefined || amount === null) return '-';
    return `${formatNumberWithSpaces(amount, config.decimalPlaces)} ${config.currencySymbol}`;
  };

  return (
    <ConfigContext.Provider value={{ config, formatPrice, formatPriceWithCurrency, updateConfig, isLoading }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig must be used within a ConfigProvider');
  return context;
};
