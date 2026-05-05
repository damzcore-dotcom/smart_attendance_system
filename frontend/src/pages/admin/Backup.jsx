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
      // Show loading state if needed (optional)
      const data = await backupAPI.export();
      
      // Convert the JSON object to a string
      const jsonString = JSON.stringify(data, null, 2);
      
      // Create a Blob from the JSON string
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create temporary download link
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart_attendance_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Database Management</h1>
          <p className="text-slate-500 mt-1 font-medium">Securely backup and restore your system data.</p>
        </div>
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200">
          <Database className="w-6 h-6" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Export Card */}
        <div className="card p-8 group hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 border-b-4 border-b-primary">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
            <Download className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Create Backup</h3>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            Generate a full snapshot of your database including employees, attendance records, settings, and configurations.
          </p>
          <button 
            onClick={handleExport}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            Download JSON Backup
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Restore Card */}
        <div className="card p-8 group hover:shadow-2xl hover:shadow-rose/10 transition-all duration-500 border-b-4 border-b-rose-500">
          <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-6 group-hover:scale-110 transition-transform border border-rose-100">
            <RefreshCw className={`w-7 h-7 ${isRestoring ? 'animate-spin' : ''}`} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Restore System</h3>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            Restore data from a previously created backup file. <span className="text-rose-500 font-bold uppercase text-[10px] tracking-widest bg-rose-50 px-1.5 py-0.5 rounded ml-1">Danger Zone</span>
          </p>
          
          <label className={`w-full py-4 border-2 border-dashed border-rose-200 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-rose-50/50 transition-all ${isRestoring ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input 
              type="file" 
              accept=".json" 
              onChange={handleRestore}
              disabled={isRestoring}
              className="hidden" 
            />
            <Upload className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-bold text-rose-600 uppercase tracking-widest">Select Backup File</span>
          </label>
        </div>
      </div>

      {/* Security Warning */}
      <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-6">
        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100 shrink-0">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-amber-900 flex items-center gap-2">
            Important Security Notice
            <AlertTriangle className="w-4 h-4" />
          </h4>
          <p className="text-sm text-amber-700/80 leading-relaxed">
            Database backups contain sensitive employee data and face biometric descriptors. Store these files in a secure, encrypted location. Never share backup files through unencrypted channels. Only <strong>Super Admins</strong> should have access to these tools.
          </p>
        </div>
      </div>

      {/* Restore Progress Modal */}
      {isRestoring && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md" />
          <div className="bg-white rounded-[3rem] p-12 max-w-sm w-full relative z-10 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Restoring Data</h3>
              <p className="text-sm text-slate-400 mt-2 font-medium">{restoreStatus}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              Please do not close this window or refresh the page.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backup;
