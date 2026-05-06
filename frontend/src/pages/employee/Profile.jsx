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
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authAPI } from '../../services/api';

const Profile = () => {
  const navigate = useNavigate();

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
    { name: 'Personal Information', icon: User, color: 'blue', path: '/employee/profile' },
    { name: 'Face ID Enrollment', icon: Camera, color: 'emerald', path: '/employee/face-check' },
    { name: 'Notifications', icon: Bell, color: 'amber', path: '/employee/notifications' },
    { name: 'Privacy & Security', icon: ShieldCheck, color: 'indigo', path: '/employee/profile' },
    { name: 'App Settings', icon: SettingsIcon, color: 'slate', path: '/employee/profile' },
  ];

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-8">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center pt-4">
        <div className="relative mb-4">
          <div className="w-28 h-28 rounded-full border-4 border-white shadow-xl overflow-hidden bg-slate-200">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${employee.name || 'user'}`} alt="profile" />
          </div>
          <button className="absolute bottom-1 right-1 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white">
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{employee.name || 'Employee'}</h2>
        <p className="text-slate-500 font-medium">{employee.position || 'Employee'}</p>
        <div className="flex items-center gap-2 mt-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3 h-3" />
          Face ID Verified
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-3">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</p>
            <p className="text-sm font-bold text-slate-800 truncate">{employee.email || 'N/A'}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone Number</p>
            <p className="text-sm font-bold text-slate-800 truncate">{employee.phone || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Settings Menu */}
      <div className="space-y-3">
        <h3 className="font-bold text-slate-800 px-2">Account Settings</h3>
        <div className="card divide-y divide-slate-50">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button 
                key={item.name} 
                onClick={() => navigate(item.path)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${item.color}-50 text-${item.color}-500`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Logout */}
      <button 
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-3 p-4 bg-rose-50 text-rose-600 rounded-2xl font-bold active:scale-[0.98] transition-transform"
      >
        <LogOut className="w-5 h-5" />
        Log Out Account
      </button>

      <p className="text-center text-xs text-slate-400 font-medium">
        Version 1.0.4 • Smart Attendance Pro
      </p>
    </div>
  );
};

export default Profile;
