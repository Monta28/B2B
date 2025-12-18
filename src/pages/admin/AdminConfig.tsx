
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../services/api';
import { SqlServerConfig } from '../../types';
import { useConfig } from '../../context/ConfigContext';
import { ConfirmModal } from '../../components/ConfirmModal';

export const AdminConfig = () => {
  const { config: appConfig, updateConfig } = useConfig();
  const [config, setConfig] = useState<SqlServerConfig>({ host: '', port: 1433, database: '', user: '', encrypted: false, syncInterval: 5 });
  
  const [currency, setCurrency] = useState('');
  const [decimals, setDecimals] = useState(0);
  const [cooldown, setCooldown] = useState(30);
  const [logos, setLogos] = useState<string[]>([]);
  const [weatherLocation, setWeatherLocation] = useState('Tunis');

  const [showConfigConfirm, setShowConfigConfirm] = useState(false);
  const [showSqlConfirm, setShowSqlConfirm] = useState(false);

  const { data } = useQuery({ queryKey: ['sql-config'], queryFn: api.admin.getSqlConfig });

  useEffect(() => {
    if (data) setConfig(data);
    setCurrency(appConfig.currencySymbol);
    setDecimals(appConfig.decimalPlaces);
    setCooldown(appConfig.validationCooldownSeconds);
    setLogos(appConfig.brandLogos || []);
    setWeatherLocation(appConfig.weatherLocation || 'Tunis');
  }, [data, appConfig]);

  const mutation = useMutation({ mutationFn: api.admin.updateSqlConfig, onSuccess: () => alert('Configuration SQL sauvegardée avec succès.') });

  const confirmAppConfigSubmit = async () => {
    await updateConfig({ 
      currencySymbol: currency, decimalPlaces: decimals, validationCooldownSeconds: cooldown, brandLogos: logos, weatherLocation: weatherLocation
    });
    alert('Configuration mise à jour.');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => { if (reader.result) setLogos(prev => [...prev, reader.result as string]); };
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Configuration Globale</h1>
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-700">Paramètres d'Affichage & Sécurité</h2>
        <form onSubmit={(e) => { e.preventDefault(); setShowConfigConfirm(true); }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700">Symbole Devise</label><input type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={currency} onChange={e => setCurrency(e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700">Décimales</label><input type="number" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={decimals} onChange={e => setDecimals(Number(e.target.value))} /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700">Délai sécurité validation (s)</label><input type="number" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={cooldown} onChange={e => setCooldown(Number(e.target.value))} /></div>
          <div><label className="block text-sm font-medium text-gray-700">Ville (Météo)</label><input type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={weatherLocation} onChange={e => setWeatherLocation(e.target.value)} /></div>
          <div className="border-t pt-4">
             <label className="block text-sm font-medium text-gray-700 mb-2">Logos Branding</label>
             <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
             <div className="flex flex-wrap gap-3 mt-3">{logos.map((logo, idx) => (<div key={idx} className="relative group border p-1"><img src={logo} alt="Logo" className="h-10 w-auto object-contain" /><button type="button" onClick={() => setLogos(logos.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button></div>))}</div>
          </div>
          <div className="flex justify-end"><button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">Mettre à jour</button></div>
        </form>
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-700">Connexion SQL Server</h2>
        <form onSubmit={(e) => { e.preventDefault(); setShowSqlConfirm(true); }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700">Hôte</label><input type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={config.host} onChange={e => setConfig({...config, host: e.target.value})} /></div>
            <div><label className="block text-sm font-medium text-gray-700">Port</label><input type="number" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={config.port} onChange={e => setConfig({...config, port: Number(e.target.value)})} /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700">Base de données</label><input type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" value={config.database} onChange={e => setConfig({...config, database: e.target.value})} /></div>
          <div className="flex justify-end"><button type="submit" className="bg-accent text-white px-6 py-2 rounded-lg font-bold">Sauvegarder SQL</button></div>
        </form>
      </div>
      <ConfirmModal isOpen={showConfigConfirm} onClose={() => setShowConfigConfirm(false)} onConfirm={confirmAppConfigSubmit} title="Confirmation" message="Mettre à jour la configuration ?" confirmLabel="Mettre à jour" />
      <ConfirmModal isOpen={showSqlConfirm} onClose={() => setShowSqlConfirm(false)} onConfirm={() => mutation.mutate(config)} title="Sauvegarder SQL ?" message="Attention aux changements de connexion." isDestructive confirmLabel="Sauvegarder" />
    </div>
  );
};
