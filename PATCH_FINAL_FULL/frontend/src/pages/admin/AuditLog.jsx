import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogAPI } from '../../services/api';
import { 
  Shield, Search, Calendar, ChevronLeft, ChevronRight, Loader2, 
  LayoutDashboard, ArrowRight, Activity, Users, UserCircle, Clock,
  FileSpreadsheet, Edit2, Trash2, Upload, RefreshCw, LogIn, Filter
} from 'lucide-react';

const ACTION_ICONS = {
  CREATE: { icon: Upload, color: 'emerald', label: 'Tambah Data' },
  UPDATE: { icon: Edit2, color: 'blue', label: 'Ubah Data' },
  DELETE: { icon: Trash2, color: 'rose', label: 'Hapus Data' },
  IMPORT: { icon: FileSpreadsheet, color: 'violet', label: 'Import Data' },
  EXPORT: { icon: FileSpreadsheet, color: 'indigo', label: 'Export Data' },
  SYNC: { icon: RefreshCw, color: 'cyan', label: 'Sinkronisasi' },
  LOGIN: { icon: LogIn, color: 'slate', label: 'Login' },
  CORRECTION: { icon: Edit2, color: 'amber', label: 'Koreksi' },
};

const AuditLog = () => {
  const [filters, setFilters] = useState({
    page: 1,
    action: '',
    entity: '',
    username: '',
    startDate: '',
    endDate: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditLogAPI.getAll(filters),
  });

  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => auditLogAPI.getStats(),
  });

  const logs = data?.data || [];
  const stats = statsData?.data || {};

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const parseDetails = (details) => {
    if (!details) return null;
    try { return typeof details === 'string' ? JSON.parse(details) : details; } catch { return details; }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="px-1 space-y-3">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <Shield className="w-3 h-3 text-slate-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Super Admin Access</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Restricted Zone</span>
        </div>
        
        <div className="flex flex-row items-center justify-between w-full gap-4">
          <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3 whitespace-nowrap">
            <span>Histori Aktivitas Admin</span>
            <div className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              Audit Trail
            </div>
          </h1>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Log', value: stats.totalLogs || 0, color: 'blue', icon: Activity, desc: 'Seluruh Aktivitas' },
          { label: 'Hari Ini', value: stats.todayLogs || 0, color: 'emerald', icon: Calendar, desc: 'Aktivitas Hari Ini' },
          { label: '7 Hari Terakhir', value: stats.weekLogs || 0, color: 'amber', icon: Clock, desc: 'Aktivitas Minggu Ini' },
          { label: 'Admin Aktif', value: stats.uniqueAdmins || 0, color: 'violet', icon: Users, desc: 'Pengguna Unik' },
        ].map((item) => (
          <div key={item.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 hover:shadow-md hover:border-blue-200 transition-all group">
            <div className="flex justify-between items-start">
              <div className={`w-10 h-10 rounded-xl bg-${item.color}-50 flex items-center justify-center border border-${item.color}-100 transition-transform group-hover:scale-110 group-hover:-rotate-3`}>
                <item.icon className={`w-5 h-5 text-${item.color}-600`} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{item.label}</p>
                <p className="text-2xl font-bold text-slate-800 leading-none">{item.value}</p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Username</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Cari admin..." 
                value={filters.username}
                onChange={(e) => setFilters(prev => ({ ...prev, username: e.target.value, page: 1 }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Aksi</label>
            <div className="relative">
              <select 
                value={filters.action}
                onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value, page: 1 }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm"
              >
                <option value="">Semua Aksi</option>
                <option value="CREATE">Tambah Data</option>
                <option value="UPDATE">Ubah Data</option>
                <option value="DELETE">Hapus Data</option>
                <option value="IMPORT">Import</option>
                <option value="CORRECTION">Koreksi</option>
                <option value="SYNC">Sinkronisasi</option>
                <option value="LOGIN">Login</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Entitas</label>
            <div className="relative">
              <select 
                value={filters.entity}
                onChange={(e) => setFilters(prev => ({ ...prev, entity: e.target.value, page: 1 }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm"
              >
                <option value="">Semua Entitas</option>
                <option value="Employee">Karyawan</option>
                <option value="Attendance">Absensi</option>
                <option value="User">User</option>
                <option value="Leave">Cuti</option>
                <option value="Settings">Pengaturan</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Dari Tanggal</label>
            <input 
              type="date" 
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value, page: 1 }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Sampai Tanggal</label>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value, page: 1 }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
            />
          </div>

          <div>
            <button
              onClick={() => setFilters({ page: 1, action: '', entity: '', username: '', startDate: '', endDate: '' })}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-rose-600 animate-pulse shadow-[0_0_5px_rgba(225,29,72,0.5)]" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Audit Trail <span className="text-slate-300 mx-2">|</span> 
              Total Log: <span className="text-slate-700 ml-1">{data?.total || 0} Entri</span>
            </p>
          </div>
        </div>
        
        <div className="relative overflow-auto min-h-[400px] hide-scrollbar custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="sticky top-0 z-30 bg-slate-50 border-b border-slate-100 shadow-sm">
              <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Waktu</th>
                <th className="px-4 py-4">Admin</th>
                <th className="px-4 py-4">Role</th>
                <th className="px-4 py-4">Aksi</th>
                <th className="px-4 py-4">Entitas</th>
                <th className="px-4 py-4">Detail</th>
                <th className="px-4 py-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">Memuat Data Audit...</p>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4 opacity-70">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                        <Shield className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Audit Kosong</p>
                      <p className="text-[9px] text-slate-400 uppercase font-medium">Belum ada aktivitas admin yang tercatat</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actionInfo = ACTION_ICONS[log.action] || { icon: Activity, color: 'slate', label: log.action };
                  const ActionIcon = actionInfo.icon;
                  const details = parseDetails(log.details);

                  return (
                    <tr key={log.id} className="group transition-all duration-300 hover:bg-blue-50/50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-800 tracking-widest">{formatDate(log.createdAt)}</span>
                          <span className="text-[9px] text-slate-500 font-semibold tracking-wider mt-0.5">{formatTime(log.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.username}`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{log.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border ${
                          log.role === 'SUPER_ADMIN' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                          log.role === 'ADMIN' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {log.role}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg bg-${actionInfo.color}-50 flex items-center justify-center border border-${actionInfo.color}-100`}>
                            <ActionIcon className={`w-3.5 h-3.5 text-${actionInfo.color}-600`} />
                          </div>
                          <span className={`text-[10px] font-bold text-${actionInfo.color}-600 uppercase tracking-wider`}>{actionInfo.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200 uppercase tracking-widest">
                          {log.entity}
                        </span>
                        {log.entityId && (
                          <span className="ml-1.5 text-[9px] text-slate-400 font-semibold">#{log.entityId}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 max-w-[300px]">
                        {details ? (
                          typeof details === 'object' ? (
                            <div className="flex flex-col gap-0.5">
                              {Object.entries(details).slice(0, 3).map(([key, val]) => (
                                <span key={key} className="text-[9px] text-slate-500 font-medium truncate">
                                  <span className="text-slate-400 uppercase">{key}:</span> <span className="text-slate-700 font-semibold">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600 font-medium truncate block max-w-[250px]">{String(details)}</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[10px] font-mono text-slate-500">{log.ipAddress || '—'}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && logs.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Halaman <span className="text-slate-800 mx-1">{filters.page}</span> / <span className="text-slate-600 ml-1">{data?.totalPages || 1}</span>
              </p>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Total: <span className="text-blue-600 font-bold">{data?.total || 0}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={filters.page <= 1}
                onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95 text-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={filters.page >= (data?.totalPages || 1)}
                onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95 text-slate-600"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
