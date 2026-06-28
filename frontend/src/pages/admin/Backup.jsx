import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileJson,
  ArrowRight,
  Clock,
  Save,
  Trash2,
  FolderArchive,
  Server,
  HardDrive,
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowUp,
  Plus,
  Check,
  X
} from 'lucide-react';
import { backupAPI, authAPI } from '../../services/api';

const formatBytes = (b) => {
  if (!b) return '0 B';
  const k = 1024, units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const Backup = () => {
  const { t } = useTranslation();
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const user = authAPI.getStoredUser();

  // ── Jadwal backup otomatis ──
  const [schedule, setSchedule] = useState({ enabled: false, frequency: 'daily', time: '02:00', weekday: 1, retention: 7, lastRun: null, customLocation: '' });
  const [backupLocation, setBackupLocation] = useState('');
  const [backupFiles, setBackupFiles] = useState([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isBackingUpNow, setIsBackingUpNow] = useState(false);

  // ── Folder picker ──
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerData, setPickerData] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const browseTo = async (p) => {
    setPickerLoading(true);
    try {
      const res = await backupAPI.browse(p);
      if (res.success) setPickerData(res.data);
      else throw new Error(res.message);
    } catch (err) {
      alert(err.message);
    } finally {
      setPickerLoading(false);
    }
  };

  const openPicker = () => {
    setNewFolderName('');
    setPickerOpen(true);
    // Mulai dari lokasi yang sedang dipilih bila ada, jika tidak dari root (daftar drive)
    browseTo(schedule.customLocation || backupLocation || 'root');
  };

  const selectCurrentFolder = () => {
    if (!pickerData?.current) return;
    setSchedule(s => ({ ...s, customLocation: pickerData.current }));
    setPickerOpen(false);
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim() || !pickerData?.current) return;
    try {
      const res = await backupAPI.createFolder(pickerData.current, newFolderName.trim());
      if (res.success) {
        setNewFolderName('');
        await browseTo(pickerData.current);
      } else throw new Error(res.message);
    } catch (err) {
      alert(`Gagal membuat folder: ${err.message}`);
    }
  };

  const loadSchedule = async () => {
    try {
      const res = await backupAPI.getSchedule();
      if (res.success) {
        setSchedule(res.data.config);
        setBackupLocation(res.data.location);
        setBackupFiles(res.data.files || []);
      }
    } catch (err) {
      console.error('Gagal memuat jadwal backup:', err);
    }
  };

  useEffect(() => { loadSchedule(); }, []);

  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true);
    try {
      const res = await backupAPI.updateSchedule({ ...schedule, location: schedule.customLocation || '' });
      if (res.success) {
        await loadSchedule();
        alert('Jadwal backup otomatis tersimpan.');
      } else throw new Error(res.message);
    } catch (err) {
      alert(`Gagal menyimpan jadwal: ${err.message}`);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleBackupNow = async () => {
    setIsBackingUpNow(true);
    try {
      const res = await backupAPI.runNow();
      if (res.success) {
        await loadSchedule();
        alert(`Backup berhasil dibuat di server: ${res.data.fileName}`);
      } else throw new Error(res.message);
    } catch (err) {
      alert(`Gagal membuat backup: ${err.message}`);
    } finally {
      setIsBackingUpNow(false);
    }
  };

  const handleDownloadServerFile = async (name) => {
    try {
      const blob = await backupAPI.downloadFile(name);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', name);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Gagal mengunduh: ${err.message}`);
    }
  };

  const handleDeleteServerFile = async (name) => {
    if (!window.confirm(`Hapus file backup "${name}"?`)) return;
    try {
      const res = await backupAPI.deleteFile(name);
      if (res.success) loadSchedule();
      else throw new Error(res.message);
    } catch (err) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus(t('backup.statusGeneratingBackup') || 'Generating database backup snapshot...');
    try {
      const data = await backupAPI.export();
      
      const jsonString = JSON.stringify(data, null, 2);
      
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart_attendance_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(t('backup.alertExportFailed', { message: err.message }));
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const confirm = window.confirm(t('backup.confirmRestore'));
    if (!confirm) return;

    setIsRestoring(true);
    setRestoreStatus(t('backup.statusReadingFile'));

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const backupData = JSON.parse(event.target.result);
          setRestoreStatus(t('backup.statusProcessingRestore'));
          const res = await backupAPI.restore(backupData);
          if (res.success) {
            alert(t('backup.alertSuccessRestore'));
            window.location.reload();
          } else {
            throw new Error(res.message);
          }
        } catch (err) {
          alert(t('backup.alertRestoreFailed', { message: err.message }));
          setIsRestoring(false);
          setRestoreStatus(null);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      alert(t('backup.alertReadFailed', { message: err.message }));
      setIsRestoring(false);
      setRestoreStatus(null);
    }
  };

  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500 relative">
      {isDemoMode && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '24px',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-500 mb-4 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Fitur Tidak Tersedia</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-4">
            Fitur Backup & Restore tidak tersedia di versi Demo untuk menjaga stabilitas data demonstrasi.
          </p>
          <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs font-semibold text-amber-800 shadow-sm">
            📞 Hubungi: 082124130065 untuk lisensi penuh
          </div>
        </div>
      )}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <Database className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('backup.systemAdministration')}</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t('backup.dataOperations')}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            {t('backup.title')}
            <div className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('backup.systemSecure')}
            </div>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Export Card */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm group hover:border-blue-300 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full opacity-50 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform shadow-sm">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{t('backup.createBackupTitle')}</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              {t('backup.createBackupDesc')}
            </p>
            <button 
              onClick={handleExport}
              disabled={isExporting}
              className={`w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('backup.processing') || 'Processing...'}
                </>
              ) : (
                <>
                  {t('backup.downloadJsonBackup')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Restore Card */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm group hover:border-rose-300 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-bl-full opacity-50 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mb-6 group-hover:scale-110 transition-transform shadow-sm">
              <RefreshCw className={`w-6 h-6 ${isRestoring ? 'animate-spin' : ''}`} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{t('backup.restoreSystemTitle')}</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              {t('backup.restoreSystemDesc')} <span className="text-rose-600 font-bold uppercase text-[9px] tracking-widest bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md ml-1 inline-flex items-center">{t('backup.dangerZone')}</span>
            </p>
            
            <label className={`w-full py-4 border-2 border-dashed border-rose-200 bg-rose-50/30 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-rose-50 hover:border-rose-300 transition-all ${isRestoring ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleRestore}
                disabled={isRestoring}
                className="hidden" 
              />
              <Upload className="w-5 h-5 text-rose-500" />
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">{t('backup.selectBackupFile')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Backup Otomatis Terjadwal */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#F4E4DB] border border-[#E0B9A6] rounded-2xl flex items-center justify-center text-[#C0532B] shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Backup Otomatis Terjadwal</h3>
              <p className="text-sm text-slate-500">Sistem membuat cadangan ke server secara otomatis sesuai jadwal.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSchedule(s => ({ ...s, enabled: !s.enabled }))}
            className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${schedule.enabled ? 'bg-[#C0532B]' : 'bg-slate-300'}`}
            aria-pressed={schedule.enabled}
          >
            <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${schedule.enabled ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity ${schedule.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Frekuensi</label>
            <select
              value={schedule.frequency}
              onChange={e => setSchedule(s => ({ ...s, frequency: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#C0532B]/20 focus:border-[#E0B9A6] appearance-none cursor-pointer"
            >
              <option value="daily">Harian</option>
              <option value="weekly">Mingguan</option>
            </select>
          </div>
          {schedule.frequency === 'weekly' && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Hari</label>
              <select
                value={schedule.weekday}
                onChange={e => setSchedule(s => ({ ...s, weekday: parseInt(e.target.value) }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#C0532B]/20 focus:border-[#E0B9A6] appearance-none cursor-pointer"
              >
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Jam (24 jam)</label>
            <input
              type="time"
              value={schedule.time}
              onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#C0532B]/20 focus:border-[#E0B9A6]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Simpan (jumlah file)</label>
            <input
              type="number"
              min="1"
              value={schedule.retention}
              onChange={e => setSchedule(s => ({ ...s, retention: parseInt(e.target.value) || 1 }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#C0532B]/20 focus:border-[#E0B9A6]"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-400">
            {schedule.lastRun
              ? <>Backup otomatis terakhir: <span className="font-bold text-slate-600">{new Date(schedule.lastRun).toLocaleString('id-ID')}</span></>
              : 'Belum pernah ada backup otomatis.'}
          </p>
          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={isSavingSchedule}
            className="bg-[#C0532B] hover:bg-[#A8421F] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {isSavingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Jadwal
          </button>
        </div>

        {/* Lokasi penyimpanan (dapat diubah) + backup manual ke server */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FolderArchive className="w-5 h-5 text-[#C0532B] shrink-0" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lokasi penyimpanan backup</p>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
              <FolderOpen className="w-4 h-4 text-[#C0532B] shrink-0" />
              <span className="text-sm font-mono text-slate-700 truncate" title={schedule.customLocation || backupLocation}>
                {schedule.customLocation || backupLocation || '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openPicker}
                className="bg-[#C0532B] hover:bg-[#A8421F] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
              >
                <Folder className="w-4 h-4" /> Pilih Folder
              </button>
              <button
                type="button"
                onClick={handleBackupNow}
                disabled={isBackingUpNow}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                {isBackingUpNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                Backup sekarang
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 ml-1">
            {schedule.customLocation
              ? <>Pilih <span className="font-bold">Simpan Jadwal</span> untuk menerapkan lokasi baru. <button type="button" onClick={() => setSchedule(s => ({ ...s, customLocation: '' }))} className="text-[#C0532B] font-bold hover:underline">Gunakan default</button></>
              : <>Memakai lokasi default. Klik <span className="font-bold">Pilih Folder</span> untuk mengubah.</>}
          </p>
        </div>

        {/* Daftar file backup di server */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4" /> Backup tersimpan di server ({backupFiles.length})
          </h4>
          {backupFiles.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">Belum ada file backup di server.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {backupFiles.map(f => (
                <div key={f.name} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all">
                  <div className="w-9 h-9 rounded-lg bg-[#F4E4DB] text-[#C0532B] flex items-center justify-center shrink-0">
                    <FileJson className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{f.name}</p>
                    <p className="text-[10px] text-slate-400">{new Date(f.createdAt).toLocaleString('id-ID')} · {formatBytes(f.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadServerFile(f.name)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-[#F4E4DB] hover:text-[#C0532B] transition-all"
                    title="Unduh"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteServerFile(f.name)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Security Warning */}
      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-8 flex flex-col md:flex-row items-center gap-6 shadow-sm">
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100 shrink-0">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1 text-center md:text-left">
          <h4 className="font-bold text-amber-900 flex items-center justify-center md:justify-start gap-2 text-lg">
            {t('backup.securityNoticeTitle')}
            <AlertTriangle className="w-4 h-4" />
          </h4>
          <p className="text-xs text-amber-700/80 font-medium leading-relaxed max-w-3xl">
            {t('backup.securityNoticeDesc')}
          </p>
        </div>
      </div>

      {/* Export Progress Modal */}
      {isExporting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full relative z-10 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">{t('backup.exportingDataTitle') || 'Mengekspor Data'}</h3>
              <p className="text-xs text-slate-500 mt-2 font-medium">{exportStatus}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-[10px] text-slate-400 font-bold uppercase tracking-wider border border-slate-100">
              {t('backup.exportingDataWarn') || 'Harap jangan tutup jendela ini atau menyegarkan halaman.'}
            </div>
          </div>
        </div>
      )}

      {/* Restore Progress Modal */}
      {isRestoring && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full relative z-10 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">{t('backup.restoringDataTitle')}</h3>
              <p className="text-xs text-slate-500 mt-2 font-medium">{restoreStatus}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-[10px] text-slate-400 font-bold uppercase tracking-wider border border-slate-100">
              {t('backup.restoringDataWarn')}
            </div>
          </div>
        </div>
      )}

      {/* Folder Picker Modal */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
          <div className="bg-white rounded-3xl w-full max-w-lg relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F4E4DB] text-[#C0532B] flex items-center justify-center">
                  <Folder className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Pilih folder penyimpanan</h3>
                  <p className="text-[11px] text-slate-400">Telusuri folder di server backup</p>
                </div>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Path bar */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => pickerData?.parent !== null && pickerData?.parent !== undefined && browseTo(pickerData.parent)}
                disabled={pickerData?.parent === null || pickerData?.parent === undefined}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                title="Naik satu tingkat"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-slate-600 truncate flex-1" title={pickerData?.current}>
                {pickerData?.isRoot ? 'Komputer (pilih drive)' : (pickerData?.current || '…')}
              </span>
            </div>

            {/* Folder list */}
            <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
              {pickerLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#C0532B]" /></div>
              ) : !pickerData || pickerData.folders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Tidak ada subfolder di sini.</p>
              ) : (
                pickerData.folders.map(f => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => browseTo(f.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#FBF8F2] text-left transition-colors group"
                  >
                    <Folder className="w-4 h-4 text-[#C0532B] shrink-0" />
                    <span className="flex-1 text-sm text-slate-700 truncate">{f.name}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))
              )}
            </div>

            {/* New folder (only inside a real folder, not at drive list) */}
            {pickerData && !pickerData.isRoot && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createNewFolder(); }}
                  placeholder="Nama folder baru…"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#C0532B]/20 focus:border-[#E0B9A6]"
                />
                <button
                  type="button"
                  onClick={createNewFolder}
                  disabled={!newFolderName.trim()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" /> Buat
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50 rounded-b-3xl">
              <button type="button" onClick={() => setPickerOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-all">
                Batal
              </button>
              <button
                type="button"
                onClick={selectCurrentFolder}
                disabled={!pickerData?.current || pickerData?.isRoot}
                className="bg-[#C0532B] hover:bg-[#A8421F] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" /> Pilih folder ini
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backup;
