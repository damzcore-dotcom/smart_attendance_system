import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Save, Loader2, AlertCircle } from 'lucide-react';
import { settingsAPI } from '../../services/api';

export default function BhlSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsAPI.getAll,
  });

  useEffect(() => {
    if (settingsData?.data) {
      setFormData(settingsData.data);
    }
  }, [settingsData]);

  const updateSettingsMutation = useMutation({
    mutationFn: settingsAPI.update,
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
      setSaveMessage({ type: 'success', text: 'Pengaturan BHL berhasil disimpan!' });
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.message || 'Gagal menyimpan pengaturan.' });
    },
    onSettled: () => setIsSaving(false)
  });

  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setIsSaving(true);
    const payload = {
      bhlContractStatus: formData.bhlContractStatus || 'NON_KONTRAK',
      bhlPaymentScheme: formData.bhlPaymentScheme || 'HARIAN',
      bhlDefaultDailyWage: formData.bhlDefaultDailyWage || '0',
    };
    updateSettingsMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-4" />
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Loading Settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-8 border border-slate-200 shadow-sm rounded-3xl">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Pengaturan BHL</h2>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Konfigurasi Default Karyawan Harian Lepas</p>
          </div>
        </div>

        {saveMessage.text && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm font-bold ${saveMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            <AlertCircle className="w-5 h-5" /> {saveMessage.text}
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Status Karyawan BHL Default</label>
            <select 
              value={formData.bhlContractStatus || 'NON_KONTRAK'}
              onChange={(e) => handleInputChange('bhlContractStatus', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
            >
              <option value="KONTRAK">Kontrak</option>
              <option value="NON_KONTRAK">Non-Kontrak (Freelance)</option>
            </select>
            <p className="text-[10px] text-slate-400 font-medium ml-1">Status ini akan otomatis terpilih saat Anda menambah data BHL baru.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Skema Upah BHL Default</label>
            <select 
              value={formData.bhlPaymentScheme || 'HARIAN'}
              onChange={(e) => handleInputChange('bhlPaymentScheme', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
            >
              <option value="HARIAN">Harian (Per Kehadiran)</option>
              <option value="BORONGAN">Borongan (Per Project)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Default Gaji Pokok Harian (Rp)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rp</span>
              <input 
                type="number"
                value={formData.bhlDefaultDailyWage || ''}
                onChange={(e) => handleInputChange('bhlDefaultDailyWage', e.target.value)}
                placeholder="Contoh: 150000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 font-medium ml-1">Gaji ini akan otomatis diisi saat membuat BHL baru, menghemat waktu input Anda.</p>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
