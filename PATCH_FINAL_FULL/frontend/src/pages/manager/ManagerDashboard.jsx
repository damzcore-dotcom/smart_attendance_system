import { 
  Users, 
  Clock, 
  AlertTriangle, 
  CalendarOff,
  Loader2,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { managerAPI } from '../../services/api';

const ManagerDashboard = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: () => managerAPI.getDashboard()
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-sm text-slate-400 font-medium">Loading dashboard...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-medium flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        {error?.message || 'Failed to load dashboard'}
      </div>
    );
  }

  const stats = data?.data?.stats || { totalEmployees: 0, present: 0, late: 0, onLeave: 0, absent: 0 };
  const lateEmployees = data?.data?.lateEmployees || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Unit Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time operational analytics</p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
           <CalendarOff className="w-4 h-4 text-slate-400" />
           <p className="text-sm font-medium text-slate-600">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Personnel', value: stats.totalEmployees, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', desc: 'Active staff' },
          { label: 'Present Today', value: stats.present, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', desc: `${Math.round((stats.present / (stats.totalEmployees || 1)) * 100)}% rate` },
          { label: 'Late Today', value: stats.late, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', desc: 'Late arrivals' },
          { label: 'On Leave', value: stats.onLeave, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', desc: `${stats.absent} absent` },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 rounded-xl ${item.bg} border ${item.border} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
            <h3 className="text-3xl font-bold text-slate-800">{item.value}</h3>
            <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Late Employees */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Late Arrivals</h3>
                <p className="text-xs text-slate-500">Employees who arrived late today</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">
              {lateEmployees.length} found
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {lateEmployees.length > 0 ? (
              lateEmployees.map((emp, i) => (
                <div key={i} className="group flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-amber-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm group-hover:text-amber-700 transition-colors">{emp.name}</p>
                      <p className="text-xs text-slate-500">{emp.employeeCode}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-600">{emp.lateMinutes}m late</p>
                    <p className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                      <MapPin className="w-3 h-3" /> {new Date(emp.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                <CheckCircle2 className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400 font-medium">No late arrivals today</p>
              </div>
            )}
          </div>
        </div>

        {/* Performance Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center mb-4">
            <TrendingUp className="w-10 h-10 text-blue-600" />
          </div>
          <h4 className="text-lg font-bold text-slate-800 mb-2">Operational Status</h4>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto mb-4">
            Current unit stability is within optimal parameters.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Optimal Performance
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
