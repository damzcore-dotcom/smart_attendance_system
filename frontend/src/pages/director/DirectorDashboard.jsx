import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Clock, CalendarCheck, FileCheck, 
  TrendingUp, TrendingDown, UserX, ChevronRight,
  Loader2, ShieldCheck
} from 'lucide-react';
import api from '../../services/api';

const StatCard = ({ title, value, sub, icon: Icon, color, trend }) => (
  <div className="bg-white p-6 border border-slate-200 rounded-2xl group hover:shadow-md hover:border-blue-200 transition-all duration-300 relative overflow-hidden shadow-sm">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm transition-all duration-300 ${color} group-hover:scale-105`}>
        <Icon className="w-6 h-6" />
      </div>
      {trend && (
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border ${
          trend === 'up' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
          trend === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
          'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {trend === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {trend === 'up' ? 'Good' : 'Watch'}
        </span>
      )}
    </div>
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
    <div className="flex items-baseline gap-2">
      <p className="text-3xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Header */}
      <div className="bg-white p-10 border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg mb-4 border border-blue-100">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            Director Dashboard — Active
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">
            Command Center, <span className="text-blue-600">Director</span>
          </h1>
          <p className="text-slate-500 text-sm max-w-2xl leading-relaxed">
            Real-time operational intelligence and personnel attendance metrics.
          </p>
        </div>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard 
            title="Active Personnel" 
            value={stats.totalEmployees ?? 0} 
            sub="Registered" 
            icon={Users} 
            color="bg-blue-50 border-blue-100 text-blue-600"
            trend="up"
          />
          <StatCard 
            title="Daily Presence" 
            value={stats.presentToday ?? 0} 
            sub={`of ${stats.totalEmployees ?? 0}`}
            icon={CalendarCheck} 
            color="bg-emerald-50 border-emerald-100 text-emerald-600"
            trend="up"
          />
          <StatCard 
            title="Late Today" 
            value={stats.lateToday ?? 0} 
            sub="Records"
            icon={Clock} 
            color="bg-amber-50 border-amber-100 text-amber-600"
            trend="warn"
          />
          <StatCard 
            title="Pending Leave" 
            value={stats.pendingLeave ?? 0} 
            sub="Awaiting"
            icon={FileCheck} 
            color="bg-violet-50 border-violet-100 text-violet-600"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <button
          onClick={() => navigate('/director/attendance')}
          className="bg-white p-8 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all duration-300 text-left group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 group-hover:scale-105 transition-transform shadow-sm">
                <CalendarCheck className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Attendance Analytics</p>
                <p className="text-sm text-slate-500 mt-0.5">Review comprehensive employee attendance data</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 group-hover:bg-blue-600 group-hover:text-white text-slate-400 transition-all duration-300">
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/director/leave')}
          className="bg-white p-8 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all duration-300 text-left group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center border border-violet-100 group-hover:scale-105 transition-transform shadow-sm">
                <FileCheck className="w-8 h-8 text-violet-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Leave Review</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {stats.pendingLeave > 0 ? (
                    <span className="text-amber-600 font-semibold">{stats.pendingLeave} requests awaiting review</span>
                  ) : 'Monitor all leave protocols'}
                </p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 group-hover:bg-blue-600 group-hover:text-white text-slate-400 transition-all duration-300">
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </button>
      </div>

      {/* Notice */}
      <div className="bg-blue-50 p-6 border border-blue-100 rounded-2xl flex gap-6 items-center">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 border border-blue-200">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">Read-Only Mode</h4>
          <p className="text-sm text-slate-600 leading-relaxed">
            This dashboard provides <strong>read-only oversight</strong> of organizational data. 
            Modifications and approvals are handled by Admin and Manager roles.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DirectorDashboard;
