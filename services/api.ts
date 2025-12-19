// Real API service - replaces mockApi.ts
import { getToken, saveToken, clearToken } from './auth-storage';

// En production, utiliser l'URL complète du backend
// En développement, utiliser le proxy Vite (/api)
const getApiBaseUrl = () => {
  // Si VITE_API_URL est défini, l'utiliser
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // En mode développement avec Vite, utiliser le proxy
  if (import.meta.env.DEV) {
    return '/api';
  }

  // En production, construire l'URL avec le port backend
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '4001';
  return `http://${window.location.hostname}:${backendPort}/api`;
};

const API_BASE_URL = getApiBaseUrl();

// Helper function for API calls
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(error.message || `Erreur ${response.status}`);
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: async (email: string, password: string, rememberMe: boolean = false) => {
    const response = await fetchApi<{
      access_token: string;
      user: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        companyId?: string;
        companyName: string;
        dmsClientCode: string;
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Save token using the appropriate storage based on rememberMe
    saveToken(response.access_token, rememberMe);
    return response;
  },

  logout: async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
  },

  getProfile: () => fetchApi<any>('/auth/me'),
};

// Main API object with same structure as mockApi
export const api = {
  // Products / Catalog
  searchProducts: async (params?: { ref?: string; desig?: string; origine?: string; q?: string; limit?: number; offset?: number }) => {
    try {
      // Build URL with multi-criteria search parameters
      const urlParams = new URLSearchParams();
      if (params?.ref) urlParams.append('ref', params.ref);
      if (params?.desig) urlParams.append('desig', params.desig);
      if (params?.origine) urlParams.append('origine', params.origine);
      if (params?.q) urlParams.append('q', params.q);
      if (params?.limit) urlParams.append('limit', params.limit.toString());
      if (params?.offset) urlParams.append('offset', params.offset.toString());

      const queryString = urlParams.toString();
      const url = queryString ? `/products/search?${queryString}` : '/products/search';

      const result = await fetchApi<{ data: any[]; total: number }>(url);
      const data = (result.data || []).map((p: any) => {
        const priceHT = p.price || p.priceHT || 0;
        const tvaRate = p.tvaRate != null ? parseFloat(p.tvaRate) : null;
        const priceTTC = p.priceTTC || (tvaRate != null ? priceHT * (1 + tvaRate / 100) : priceHT);
        return {
          ...p,
          reference: p.reference || p.id,
          designation: p.name || p.designation,
          priceHT: priceHT, // Prix HT
          priceTTC: priceTTC, // Prix TTC calculé
          pricePublic: priceHT, // Alias rétrocompatibilité (maintenant HT)
          priceNet: p.priceNet || (priceHT * 0.65) || 0,
          discountPercent: p.discountPercent || 35,
          codeTva: p.codeTva || null,
          tvaRate: tvaRate,
        };
      });
      return { data, total: result.total || 0 };
    } catch {
      return { data: [], total: 0 };
    }
  },

  getPriceForClient: async (reference: string) => {
    try {
      const product = await fetchApi<any>(`/products/${reference}`);
      // Backend returns 'price' as the HT price (PV_HT)
      const priceHT = product.price || product.priceHT || 0;
      const tvaRaw =
        product.tvaRate ?? product.tauxTVA ?? product.tauxTva ?? product.tva ?? product.tvaCode ?? product.codeTva ??
        product.tva_rate ?? product.taux ?? product.taux_tva ?? product.code_tva ?? product.tva_code;
      const parsedTva = typeof tvaRaw === 'string' ? parseFloat(tvaRaw) : Number(tvaRaw);
      const tvaRate = Number.isFinite(parsedTva) ? parsedTva : null;
      const priceTTC = product.priceTTC || (tvaRate != null ? priceHT * (1 + tvaRate / 100) : priceHT);
      // Default discount is 35% for clients
      const discountPercentage = product.discountPercent || 35;
      const netPrice = product.priceNet || (priceHT * (1 - discountPercentage / 100));
      const tvaCode = product.codeTva ?? product.tvaCode ?? product.code_tva ?? product.tva_code;
      return {
        priceHT,
        priceTTC,
        publicPrice: priceHT, // Alias rétrocompatibilité
        netPrice,
        discountPercent: discountPercentage,
        discountPercentage, // Alias for compatibility
        tvaRate,
        tvaCode,
      };
    } catch {
      return { priceHT: 0, priceTTC: 0, publicPrice: 0, netPrice: 0, discountPercent: 0, discountPercentage: 0, tvaRate: null };
    }
  },

  // Récupérer les prix en lot (batch) - plus performant que les appels individuels
  getPricesBatch: async (references: string[]): Promise<Record<string, { priceHT: number; priceTTC: number; netPrice: number; stock: number; tvaRate: number | null }>> => {
    if (!references || references.length === 0) {
      return {};
    }
    try {
      return await fetchApi<Record<string, { priceHT: number; priceTTC: number; netPrice: number; stock: number; tvaRate: number | null }>>('/products/prices/batch', {
        method: 'POST',
        body: JSON.stringify({ references }),
      });
    } catch {
      return {};
    }
  },

  // Orders
  // Backend already filters by companyId for client users, no need to filter here
  getOrders: async () => {
    return fetchApi<any[]>('/orders');
  },

  updateOrderStatus: async (id: string, status: string) => {
    return fetchApi<any>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  setOrderEditing: async (id: string, isEditing: boolean) => {
    return fetchApi<any>(`/orders/${id}/editing`, {
      method: 'PATCH',
      body: JSON.stringify({ isEditing }),
    });
  },

  updateOrder: async (id: string, items: any[]) => {
    return fetchApi<any>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
  },

  submitOrder: async (items: any[], userEmail: string, companyName: string, orderType: string) => {
    // Transform items to backend format with availability
    // Note: unitPrice is already the net price (after discount), so discountPercent should be 0
    console.log('[DEBUG submitOrder] Items reçus:', JSON.stringify(items.map(i => ({ ref: i.reference, tvaRate: i.tvaRate, tauxTVA: i.tauxTVA, tva: i.tva })), null, 2));
    const orderItems = items.map((item: any) => {
      // Récupérer le taux TVA avec conversion robuste
      const rawTva = item.tvaRate ?? item.tauxTVA ?? item.tva ?? item.codeTva;
      const tvaRate = rawTva != null ? (typeof rawTva === 'string' ? parseFloat(rawTva) : Number(rawTva)) : 7;
      console.log(`[DEBUG submitOrder] ${item.reference}: rawTva=${rawTva}, tvaRate=${tvaRate}`);
      return {
        productRef: item.reference,
        productName: item.designation,
        quantity: item.quantity,
        unitPrice: item.clientNetPrice || item.pricePublic || 0,
        discountPercent: 0, // Discount already applied in clientNetPrice
        availability: item.availability || (item.stock > 0 ? 'DISPONIBLE' : 'RUPTURE'),
        tvaRate: Number.isFinite(tvaRate) ? tvaRate : 7, // Taux TVA avec fallback
      };
    });
    console.log('[DEBUG submitOrder] OrderItems à envoyer:', JSON.stringify(orderItems.map(i => ({ ref: i.productRef, tvaRate: i.tvaRate })), null, 2));

    const order = await fetchApi<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({ items: orderItems, orderType }),
    });
    return order.orderNumber || order.id;
  },

  printPreparationSlip: async (orderId: string) => {
    return fetchApi<any>(`/orders/${orderId}/print`, { method: 'POST' });
  },

  // Get article positions from DMS for preparation slip
  getOrderPositions: async (orderId: string): Promise<Record<string, string>> => {
    try {
      return await fetchApi<Record<string, string>>(`/orders/${orderId}/positions`);
    } catch {
      return {};
    }
  },

  // News
  getNews: async (activeOnly: boolean = false) => {
    const news = await fetchApi<any[]>(`/news${activeOnly ? '?activeOnly=true' : ''}`);
    return news.map((n: any) => ({
      ...n,
      date: n.publishDate || n.createdAt?.split('T')[0],
    }));
  },

  // Documents (from DMS via backend)
  getDocuments: async (companyName?: string) => {
    try {
      const docs = await fetchApi<any[]>('/documents');
      return docs.map((d: any) => ({
        id: d.id,
        dmsRef: d.dmsRef,
        type: d.type,
        date: d.date,
        amount: d.totalHT || 0,
        totalHT: d.totalHT || 0,
        totalTTC: d.totalTTC || 0,
        numFacture: d.numFacture,
        companyName: d.companyName || d.codeClient,
        downloadUrl: '',
      }));
    } catch {
      return [];
    }
  },

  getInvoices: async () => {
    try {
      const invoices = await fetchApi<any[]>('/documents/invoices');
      return invoices.map((d: any) => ({
        id: d.id,
        dmsRef: d.dmsRef,
        type: 'INVOICE' as const,
        date: d.date,
        amount: d.totalHT || 0,
        companyName: d.companyName || d.codeClient,
        downloadUrl: '',
      }));
    } catch {
      return [];
    }
  },

  getDeliveryNotes: async () => {
    try {
      const bls = await fetchApi<any[]>('/documents/delivery-notes');
      return bls.map((d: any) => ({
        id: d.id,
        dmsRef: d.dmsRef,
        type: 'BL' as const,
        date: d.date,
        amount: d.totalHT || 0,
        companyName: d.companyName || d.codeClient,
        downloadUrl: '',
      }));
    } catch {
      return [];
    }
  },

  getInvoiceDetail: async (numFacture: string) => {
    try {
      return fetchApi<any>(`/documents/invoices/${encodeURIComponent(numFacture)}`);
    } catch {
      return null;
    }
  },

  getDeliveryNoteDetail: async (numBL: string) => {
    try {
      return fetchApi<any>(`/documents/delivery-notes/${encodeURIComponent(numBL)}`);
    } catch {
      return null;
    }
  },

  // Notifications
  getNotifications: async (userId: string) => {
    return fetchApi<any[]>('/notifications');
  },

  markNotificationRead: async (id: string) => {
    return fetchApi<any>(`/notifications/${id}/read`, { method: 'PATCH' });
  },

  markAllNotificationsRead: async () => {
    return fetchApi<any>('/notifications/read-all', { method: 'PATCH' });
  },

  // Weather (simple mock - can be replaced with real API)
  getWeather: async () => {
    // Returns mock weather data - replace with real weather API if needed
    const temps = [18, 20, 22, 24, 26, 28, 30, 32];
    const icons = ['☀️', '⛅', '🌤️', '☁️'];
    return {
      temp: temps[Math.floor(Math.random() * temps.length)],
      icon: icons[Math.floor(Math.random() * icons.length)],
    };
  },

  // Config
  getAppConfig: async () => {
    const config = await fetchApi<any>('/config/app');
    return {
      currencySymbol: config.currencySymbol ?? 'TND',
      decimalPlaces: config.decimalPlaces ?? 3,
      validationCooldownSeconds: config.validationCooldownSeconds ?? ((config.orderCooldownMinutes || 30) * 60),
      brandLogos: config.brandLogos || [],
      weatherLocation: config.weatherCity
        ? `${config.weatherCity}${config.weatherCountry ? `, ${config.weatherCountry}` : ''}`
        : 'Tunis',
      fontFamily: config.fontFamily || 'Inter, "Segoe UI", sans-serif',
      borderRadiusStyle: config.borderRadiusStyle || '12px',
      ...config,
    };
  },

  getPublicConfig: async () => {
    const config = await fetchApi<any>('/config/public');
    return {
      currencySymbol: config.currencySymbol ?? 'TND',
      decimalPlaces: config.decimalPlaces ?? 3,
      brandLogos: config.brandLogos || [],
      ...config,
    };
  },

  updateAppConfig: async (data: any) => {
    const payload: any = { ...data };

    // Backward/UX compatibility: accept weatherLocation and map to DTO fields
    if (typeof payload.weatherLocation === 'string' && !payload.weatherCity) {
      const parts = payload.weatherLocation.split(',').map((p: string) => p.trim()).filter(Boolean);
      payload.weatherCity = parts[0] || payload.weatherLocation;
      payload.weatherCountry = parts[1] || payload.weatherCountry;
      delete payload.weatherLocation;
    }
    return fetchApi<any>('/config/app', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Admin functions
  admin: {
    // Users
    getUsers: () => fetchApi<any[]>('/users'),

    createUser: (data: any) => fetchApi<any>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    updateUser: (data: any) => fetchApi<any>(`/users/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

    toggleUserStatus: (id: string) => fetchApi<any>(`/users/${id}/status`, { method: 'PATCH' }),

    deleteUser: (id: string) => fetchApi<any>(`/users/${id}`, { method: 'DELETE' }),

    resetUserPassword: (userId: string, newPassword: string) => fetchApi<any>(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

    // Companies
    getCompanies: () => fetchApi<any[]>('/companies'),

    createCompany: (data: any) => fetchApi<any>('/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    updateCompany: (data: any) => fetchApi<any>(`/companies/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

    toggleCompanyStatus: (id: string) => fetchApi<any>(`/companies/${id}/status`, { method: 'PATCH' }),

    deleteCompany: (id: string) => fetchApi<{ message: string }>(`/companies/${id}`, { method: 'DELETE' }),

    bulkDeleteCompanies: (ids: string[]) => fetchApi<{ deleted: number; skipped: number; errors: string[] }>('/companies/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

    // DMS Import
    getDmsClients: () => fetchApi<{ success: boolean; clients?: any[]; message?: string }>('/companies/dms/clients'),

    importClients: (clients: any[]) => fetchApi<{ imported: number; skipped: number; errors: string[] }>('/companies/import', {
      method: 'POST',
      body: JSON.stringify({ clients }),
    }),

    // News
    createNews: (data: any) => fetchApi<any>('/news', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    updateNews: (data: any) => fetchApi<any>(`/news/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

    deleteNews: (id: string) => fetchApi<any>(`/news/${id}`, { method: 'DELETE' }),

    // Audit
    getAuditLogs: async () => {
      const result = await fetchApi<{ data: any[]; total: number }>('/audit');
      return (result.data || []).map((log: any) => ({
        id: log.id,
        timestamp: log.createdAt,
        userEmail: log.user?.email || 'Système',
        action: log.action,
        details: typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '',
        ip: log.ipAddress,
      }));
    },

    // SQL Server Config
    getSqlConfig: async () => {
      const config = await fetchApi<any>('/config/app');
      return {
        host: config.sqlServerHost || '',
        port: config.sqlServerPort || 1433,
        database: config.sqlServerDatabase || '',
        user: config.sqlServerUser || '',
        hasPassword: !!config.sqlServerPassword,
        encrypted: true,
        syncInterval: 5,
        catalogLoadMode: config.catalogLoadMode || 'auto',
      };
    },

    updateSqlConfig: async (data: any) => {
      const payload: any = {
        sqlServerHost: data.host,
        sqlServerPort: data.port,
        sqlServerDatabase: data.database,
        sqlServerUser: data.user,
        catalogLoadMode: data.catalogLoadMode,
      };
      // Only send password if it's provided (not empty)
      if (data.password) {
        payload.sqlServerPassword = data.password;
      }
      return fetchApi<any>('/config/app', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },

    testSqlConnection: async (data: any) => {
      return fetchApi<{ success: boolean; message: string; tables?: string[] }>('/config/test-sql-connection', {
        method: 'POST',
        body: JSON.stringify({
          host: data.host,
          port: data.port,
          user: data.user,
          password: data.password,
          database: data.database,
        }),
      });
    },

    // App Config
    getAppConfig: async () => {
      const config = await fetchApi<any>('/config/app');
      return {
        currencySymbol: config.currencySymbol ?? 'TND',
        decimalPlaces: config.decimalPlaces ?? 3,
        validationCooldownSeconds: config.validationCooldownSeconds ?? ((config.orderCooldownMinutes || 30) * 60),
        brandLogos: config.brandLogos || [],
        weatherLocation: config.weatherCity
          ? `${config.weatherCity}${config.weatherCountry ? `, ${config.weatherCountry}` : ''}`
          : 'Tunis',
        ...config,
      };
    },

    updateAppConfig: (data: any) => {
      const payload: any = { ...data };

      // Backward/UX compatibility: accept weatherLocation and map to DTO fields
      if (typeof payload.weatherLocation === 'string' && !payload.weatherCity) {
        const parts = payload.weatherLocation.split(',').map((p: string) => p.trim()).filter(Boolean);
        payload.weatherCity = parts[0] || payload.weatherLocation;
        payload.weatherCountry = parts[1] || payload.weatherCountry;
        delete payload.weatherLocation;
      }

      return fetchApi<any>('/config/app', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },

    // DMS Mapping
    getDmsMappings: () => fetchApi<any[]>('/admin/dms-mapping'),

    getDmsMappingByType: (type: string) => fetchApi<any>(`/admin/dms-mapping/type/${type}`),

    getDmsTables: () => fetchApi<string[]>('/admin/dms-mapping/tables'),

    getDmsTableColumns: (tableName: string) => fetchApi<any[]>(`/admin/dms-mapping/tables/${encodeURIComponent(tableName)}/columns`),

    getDmsDefaultFields: (type: string) => fetchApi<Record<string, string>>(`/admin/dms-mapping/defaults/${type}`),

    previewDmsData: (tableName: string, columnMappings: Record<string, string>) => fetchApi<any[]>('/admin/dms-mapping/preview', {
      method: 'POST',
      body: JSON.stringify({ tableName, columnMappings }),
    }),

    saveDmsMapping: (data: { mappingType: string; dmsTableName: string; columnMappings: Record<string, string>; filterClause?: string }) => fetchApi<any>('/admin/dms-mapping', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    deleteDmsMapping: (id: string) => fetchApi<{ message: string }>(`/admin/dms-mapping/${id}`, { method: 'DELETE' }),

    // DMS Sync - synchroniser les commandes avec BL/Factures du DMS
    syncDmsOrders: () => fetchApi<{ success: boolean; synced: number; errors: string[]; message: string }>('/orders/sync-dms', {
      method: 'POST',
    }),
  },
};

export default api;
