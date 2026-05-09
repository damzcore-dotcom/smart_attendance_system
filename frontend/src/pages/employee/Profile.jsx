import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  ChevronRight, 
  LogOut,
  Camera,
  Settings as SettingsIcon,
  Bell,
  Loader2,
  X,
  Briefcase,
  Hash,
  Clock as ClockIcon
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authAPI } from '../../services/api';

const Profile = () => {
  const navigate = useNavigate();
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);

  const { data: userData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const user = userData?.user || authAPI.getStoredUser();
  const employee = user?.employee || {};

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Personal Information', icon: User, color: 'blue', action: () => setShowPersonalInfo(true) },
    { name: 'Face ID Enrollment', icon: Camera, color: 'emerald', path: '/employee/face-check' },
  ];

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center pt-6">
        <div className="relative mb-5">
          <div className="w-28 h-28 rounded-full border-2 border-slate-200 p-1 bg-white shadow-lg relative">
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-50 border border-slate-100">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${employee.name || 'user'}`} alt="profile" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="absolute bottom-1 right-1 w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 border-2 border-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-800">{employee.name || 'Staff Member'}</h2>
        <p className="text-blue-600 font-semibold text-xs uppercase tracking-wider mt-1">{employee.position || 'Operational Personnel'}</p>
        
        <div className="flex items-center gap-2 mt-4 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-semibold uppercase tracking-wider border border-emerald-200">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Verified
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-3 px-1">
        <div className="bg-white p-5 flex items-center gap-5 border border-slate-200 rounded-2xl hover:border-blue-200 transition-all shadow-sm">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0 border border-blue-100">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Email</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{employee.email || 'Not set'}</p>
          </div>
        </div>
        <div className="bg-white p-5 flex items-center gap-5 border border-slate-200 rounded-2xl hover:border-blue-200 transition-all shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Phone</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{employee.phone || 'Not set'}</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-3 px-1">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Settings</h3>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button 
                key={item.name} 
                onClick={item.action || (() => navigate(item.path))}
                className={`w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-all duration-200 group ${idx !== menuItems.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                    item.color === 'blue' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-slate-700 text-sm">{item.name}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-all duration-300 group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Logout */}
      <div className="px-1">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all hover:bg-red-600 hover:text-white hover:border-red-600"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      {/* Personal Info Modal */}
      {showPersonalInfo && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowPersonalInfo(false)} />
          <div className="relative bg-white border-t border-slate-200 rounded-t-3xl p-8 space-y-5 animate-in slide-in-from-bottom-20 duration-500 shadow-2xl">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2" onClick={() => setShowPersonalInfo(false)} />
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Personal Info</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your employment details</p>
              </div>
              <button onClick={() => setShowPersonalInfo(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 border border-blue-100"><Hash className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Employee ID (NIK)</p>
                  <p className="text-sm font-bold text-slate-800">{employee.employeeCode || 'Not set'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100"><Briefcase className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Department</p>
                  <p className="text-sm font-bold text-slate-800">{employee.department || 'General'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100"><User className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Position</p>
                  <p className="text-sm font-bold text-slate-800">{employee.position || 'Staff'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 border border-violet-100"><ClockIcon className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Shift</p>
                  <p className="text-sm font-bold text-slate-800">{employee.shift?.name || 'Default'} ({employee.shift?.startTime} - {employee.shift?.endTime})</p>
                </div>
              </div>
            </div>
            
            <button onClick={() => setShowPersonalInfo(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-semibold transition-all shadow-sm mt-2 active:scale-[0.98]">Close</button>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-slate-300 font-medium pb-8">
        Smart Attendance Pro v1.0.9
      </p>
    </div>
  );
};

export default Profile;
