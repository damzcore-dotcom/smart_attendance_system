import { 
  Clock, 
  MapPin, 
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  Megaphone,
  User as UserIcon,
  Tag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, attendanceAPI, announcementAPI } from '../../services/api';

const EmployeeHome = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['today-attendance'],
    queryFn: () => attendanceAPI.getAll({ period: 'Today', search: user?.employee?.name }),
    enabled: !!user?.employee?.name,
  });
  
  const { data: annData } = useQuery({
    queryKey: ['active-announcements'],
    queryFn: () => announcementAPI.getAll({ activeOnly: 'true' }),
  });
  
  const announcements = annData?.data || [];

  const checkInMutation = useMutation({
    mutationFn: (mode) => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          return reject(new Error("Geolocation is not supported"));
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            attendanceAPI.checkIn(empId, mode, latitude, longitude, accuracy, pos.timestamp)
              .then(resolve)
              .catch(reject);
          },
          (err) => {
            reject(new Error("Please enable location services to check in."));
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      alert(data.message);
    },
    onError: (err) => alert(err.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => attendanceAPI.checkOut(empId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      alert(data.message);
    },
    onError: (err) => alert(err.message),
  });

  const todayRecord = attendanceData?.data?.[0];
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const currentDate = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  if (userLoading || attLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Info */}
      <div className="bg-primary p-6 rounded-[2rem] text-white shadow-xl shadow-primary/20 relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-primary-light font-bold text-sm uppercase tracking-widest mb-1">{currentDate}</p>
          <h2 className="text-4xl font-bold mb-6 tracking-tight">{currentTime}</h2>
          
          <div className="flex items-center gap-2 text-sm bg-white/10 w-fit px-3 py-1.5 rounded-full backdrop-blur-md">
            <MapPin className="w-4 h-4" />
            <span>HQ Office • Within Geofence</span>
          </div>
        </div>
        
        {/* Decorative circle */}
        <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      </div>

      {/* Attendance Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 flex flex-col items-center text-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${todayRecord?.checkIn ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Check In</p>
          <p className={`font-bold ${todayRecord?.checkIn ? 'text-slate-800' : 'text-slate-300'}`}>
            {todayRecord?.checkIn || '-- : --'}
          </p>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${todayRecord?.checkOut ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Check Out</p>
          <p className={`font-bold ${todayRecord?.checkOut && todayRecord?.checkOut !== '-- : --' ? 'text-slate-800' : 'text-slate-300'}`}>
            {todayRecord?.checkOut && todayRecord?.checkOut !== '-- : --' ? todayRecord.checkOut : '-- : --'}
          </p>
        </div>
      </div>

      {/* Lateness Analytics Widget */}
      <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-black text-slate-800 text-lg tracking-tight">Analytics</h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-slate-500 font-medium">Late Frequency</span>
              <span className="text-xs font-bold text-slate-800">{userData?.user?.employee?.stats?.lateFrequency || 0} Days</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-400 rounded-full" 
                style={{ width: `${Math.min(((userData?.user?.employee?.stats?.lateFrequency || 0) / 5) * 100, 100)}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-slate-500 font-medium">Minutes</span>
              <span className="text-sm font-black text-amber-600">{userData?.user?.employee?.stats?.totalLateMinutes || 0}m</span>
            </div>
          </div>
          <div className="border-l border-slate-100 pl-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Sisa Cuti</p>
                <p className="text-sm font-black text-slate-800">{userData?.user?.employee?.remainingLeave || 0} Hari</p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full" 
                style={{ width: `${((userData?.user?.employee?.remainingLeave || 0) / (userData?.user?.employee?.leaveQuota || 12)) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Area */}
      <div className="pt-4">
        {!todayRecord?.checkIn ? (
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => navigate('/employee/scan')}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-primary/25 active:scale-95 transition-transform flex items-center justify-center gap-3"
            >
              <Camera className="w-5 h-5 text-white/70" />
              Scan Face ID
            </button>
          </div>
        ) : (!todayRecord?.checkOut || todayRecord?.checkOut === '-- : --') ? (
          <button 
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-slate-900/20 active:scale-95 transition-transform flex items-center justify-center gap-3"
          >
            {checkOutMutation.isPending ? <Loader2 className="animate-spin" /> : 'Check Out Now'}
          </button>
        ) : (
          <div className="w-full bg-emerald-50 text-emerald-600 py-4 rounded-2xl font-bold text-lg text-center border border-emerald-100">
            Work Day Completed!
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button 
          onClick={() => navigate('/employee/correction')}
          className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-5 h-5" />
          Request Correction
        </button>
      </div>

      {/* Announcements Section */}
      {announcements.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              Latest Announcements
            </h3>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-2 snap-x hide-scrollbar">
            {announcements.map((ann) => (
              <div 
                key={ann.id} 
                className={`min-w-[280px] p-5 rounded-[2rem] border snap-start transition-all ${
                  ann.type === 'Urgent' 
                    ? 'bg-rose-50 border-rose-100 text-rose-900 shadow-lg shadow-rose-500/10' 
                    : 'bg-white border-slate-100 text-slate-800 shadow-xl shadow-slate-200/50'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                    ann.type === 'Urgent' ? 'bg-rose-500 text-white border-rose-400' : 'bg-primary/10 text-primary border-primary/20'
                  }`}>
                    {ann.type}
                  </span>
                  <span className="text-[9px] font-bold opacity-50 uppercase tracking-tighter">
                    {new Date(ann.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h4 className="font-black text-sm mb-2 line-clamp-1">{ann.title}</h4>
                <p className={`text-xs leading-relaxed line-clamp-2 ${ann.type === 'Urgent' ? 'text-rose-700/80' : 'text-slate-500'}`}>
                  {ann.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Schedule */}
      <div>
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="font-bold text-slate-800">Today's Schedule</h3>
          <button 
            onClick={() => navigate('/employee/schedule')}
            className="text-primary text-sm font-bold"
          >
            View All
          </button>
        </div>
        <div 
          onClick={() => navigate('/employee/schedule')}
          className="card p-5 flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center font-bold">
              GS
            </div>
            <div>
              <p className="font-bold text-slate-800">General Shift</p>
              <p className="text-xs text-slate-400">08:00 AM - 05:00 PM</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
        </div>
      </div>

      {/* Recent History Preview */}
      <div className="pb-8">
        <h3 className="font-bold text-slate-800 mb-4 px-2">Recent Attendance</h3>
        <div className="space-y-3">
          {userData?.user?.employee?.stats?.recentActivity?.length > 0 ? (
            userData.user.employee.stats.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.status === 'LATE' ? 'bg-amber-500' : 
                    activity.status === 'PRESENT' ? 'bg-emerald-500' : 'bg-slate-300'
                  }`} />
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {new Date(activity.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      IN: {activity.checkIn ? new Date(activity.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-black ${
                    activity.status === 'LATE' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {activity.status}
                  </p>
                  {activity.lateMinutes > 0 && (
                    <p className="text-[9px] font-bold text-slate-400">-{activity.lateMinutes}m</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 opacity-40">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No Recent Attendance</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeHome;
