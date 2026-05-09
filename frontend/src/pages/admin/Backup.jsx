import { useState } from 'react';
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
  ArrowRight
} from 'lucide-react';
import { backupAPI, authAPI } from '../../services/api';

const Backup = () => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState(null);
  const user = authAPI.getStoredUser();

  const handleExport = async () => {
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
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const confirm = window.confirm('WARNING: Restoring will overwrite ALL current data. This cannot be undone. Are you sure?');
    if (!confirm) return;

    setIsRestoring(true);
    setRestoreStatus('Reading file...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const backupData = JSON.parse(event.target.result);
          setRestoreStatus('Processing database restore...');
          const res = await backupAPI.restore(backupData);
          if (res.success) {
            alert('Database restored successfully! The application will now reload.');
            window.location.reload();
          } else {
            throw new Error(res.message);
          }
        } catch (err) {
          alert(`Restore failed: ${err.message}`);
          setIsRestoring(false);
          setRestoreStatus(null);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      alert(`Error reading file: ${err.message}`);
      setIsRestoring(false);
      setRestoreStatus(null);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <Database className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">System Administration</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Data Operations</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Database Backup
            <div className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SYSTEM SECURE
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
            <h3 className="text-xl font-bold text-slate-800 mb-2">Create Backup</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              Generate a full snapshot of your database including employees, attendance records, settings, and configurations.
            </p>
            <button 
              onClick={handleExport}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              Download JSON Backup
              <ArrowRight className="w-4 h-4" />
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
            <h3 className="text-xl font-bold text-slate-800 mb-2">Restore System</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              Restore data from a previously created backup file. <span className="text-rose-600 font-bold uppercase text-[9px] tracking-widest bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md ml-1 inline-flex items-center">Danger Zone</span>
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
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Select Backup File</span>
            </label>
          </div>
        </div>
      </div>

      {/* Security Warning */}
      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-8 flex flex-col md:flex-row items-center gap-6 shadow-sm">
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100 shrink-0">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1 text-center md:text-left">
          <h4 className="font-bold text-amber-900 flex items-center justify-center md:justify-start gap-2 text-lg">
            Important Security Notice
            <AlertTriangle className="w-4 h-4" />
          </h4>
          <p className="text-xs text-amber-700/80 font-medium leading-relaxed max-w-3xl">
            Database backups contain sensitive employee data and face biometric descriptors. Store these files in a secure, encrypted location. Never share backup files through unencrypted channels. Only <span className="font-bold">Super Admins</span> should have access to these tools.
          </p>
        </div>
      </div>

      {/* Restore Progress Modal */}
      {isRestoring && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full relative z-10 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Restoring Data</h3>
              <p className="text-xs text-slate-500 mt-2 font-medium">{restoreStatus}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-[10px] text-slate-400 font-bold uppercase tracking-wider border border-slate-100">
              Please do not close this window or refresh the page.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backup;
