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
    return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  if (isError) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        {error?.message || 'Failed to load dashboard data'}
      </div>
    );
  }

  const stats = data?.data?.stats || { totalEmployees: 0, present: 0, late: 0, onLeave: 0, absent: 0 };
  const lateEmployees = data?.data?.lateEmployees || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manager Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Today's department overview</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-indigo-600">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Employees */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-medium text-sm mb-1">Total Team</p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{stats.totalEmployees}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-indigo-500" /> Active Members
          </p>
        </div>

        {/* Present */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-medium text-sm mb-1">Present</p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{stats.present}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <span className="text-emerald-500 font-bold">{Math.round((stats.present / (stats.totalEmployees || 1)) * 100)}%</span> Attendance Rate
          </p>
        </div>

        {/* Late */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-medium text-sm mb-1">Late Arrivals</p>
              <h3 className="text-3xl font-black text-amber-600 tracking-tight">{stats.late}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium">Needs Attention</p>
        </div>

        {/* On Leave / Absent */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-medium text-sm mb-1">On Leave</p>
              <h3 className="text-3xl font-black text-rose-600 tracking-tight">{stats.onLeave}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <CalendarOff className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <span className="text-slate-500 font-bold">{stats.onLeave}</span> Leave, <span className="text-slate-500 font-bold">{stats.absent}</span> Absent
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Late Employees List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Late Arrivals Today</h3>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold">{lateEmployees.length} Total</span>
          </div>
          <div className="p-0">
            {lateEmployees.length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {lateEmployees.map((emp, i) => (
                  <div key={i} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} alt="avatar" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{emp.name}</p>
                        <p className="text-xs text-slate-400">{emp.employeeCode}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-600">{emp.lateMinutes} min late</p>
                      <p className="text-xs text-slate-400 flex items-center justify-end gap-1"><MapPin className="w-3 h-3" /> {new Date(emp.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 text-emerald-100 mx-auto mb-3" />
                <p className="font-medium text-sm">Great job! Everyone is on time today.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
