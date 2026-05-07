import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Clock, CalendarCheck, FileCheck2, 
  TrendingUp, TrendingDown, UserX, ChevronRight,
  Loader2
} from 'lucide-react';
import api from '../../services/api';

const StatCard = ({ title, value, sub, icon: Icon, color, trend }) => (
  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      {trend && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
          trend === 'up' ? 'bg-emerald-50 text-emerald-600' : 
          trend === 'warn' ? 'bg-amber-50 text-amber-600' : 
          'bg-rose-50 text-rose-600'
        }`}>
          {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        </span>
      )}
    </div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
    <p className="text-3xl font-black text-slate-800">{value}</p>
    {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
  </div>
);

const DirectorDashboard = () => {
  const navigate = useNavigate();

  const { data: statsData, isLoading } = useQuery({
    queryKey: ['director-stats'],
    queryFn: () => api.get('/direktur/stats').then(r => r.data),
    refetchInterval: 60000,
  });

  const stats = statsData?.data || {};

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" 
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-full mb-3 border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Executive Dashboard — Read Only
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Selamat Datang, Direktur</h1>
          <p className="text-slate-500 text-sm mt-1">
            Pantau kondisi kehadiran dan pengajuan cuti karyawan secara real-time.
          </p>
        </div>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Karyawan Aktif" 
            value={stats.totalEmployees ?? 0} 
            sub="Karyawan terdaftar" 
            icon={Users} 
            color="bg-blue-500"
            trend="up"
          />
          <StatCard 
            title="Hadir Hari Ini" 
            value={stats.presentToday ?? 0} 
            sub={`dari ${stats.totalEmployees ?? 0} karyawan`}
            icon={CalendarCheck} 
            color="bg-emerald-500"
            trend="up"
          />
          <StatCard 
            title="Terlambat" 
            value={stats.lateToday ?? 0} 
            sub="Check-in melebihi batas waktu"
            icon={Clock} 
            color="bg-amber-500"
            trend="warn"
          />
          <StatCard 
            title="Cuti Pending" 
            value={stats.pendingLeave ?? 0} 
            sub="Menunggu persetujuan"
            icon={FileCheck2} 
            color="bg-purple-500"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/director/attendance')}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <CalendarCheck className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="font-bold text-slate-800">Rekap Absensi</p>
                <p className="text-xs text-slate-500 mt-0.5">Lihat data kehadiran seluruh karyawan</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => navigate('/director/leave')}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-purple-200 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <FileCheck2 className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="font-bold text-slate-800">Review Cuti</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {stats.pendingLeave > 0 ? (
                    <span className="text-amber-600 font-bold">{stats.pendingLeave} pengajuan menunggu review</span>
                  ) : 'Pantau semua pengajuan cuti karyawan'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-purple-400 transition-colors" />
          </div>
        </button>
      </div>

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
        <div className="w-5 h-5 mt-0.5 shrink-0 text-blue-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-blue-800">Mode Read-Only</p>
          <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
            Portal Direktur memberikan akses <strong>hanya untuk melihat</strong> data absensi dan cuti karyawan. 
            Persetujuan dan modifikasi data dilakukan oleh Admin atau Manager.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DirectorDashboard;
