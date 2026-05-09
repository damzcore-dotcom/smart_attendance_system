import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  History, 
  User, 
  Bell,
  Scan,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, notificationAPI } from '../../services/api';
import { IgaLogo } from '../IgaLogo';

const EmployeeLayout = () => {
  const location = useLocation();

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const user = userData?.user || authAPI.getStoredUser();
  const employee = user?.employee || {};
  const empId = employee?.id;

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', empId],
    queryFn: () => notificationAPI.getByEmployee(empId),
    enabled: !!empId,
  });

  const unreadCount = notificationsData?.data?.filter(n => n.unread).length || 0;

  const navItems = [
    { name: 'Home', path: '/employee', icon: Home },
    { name: 'History', path: '/employee/history', icon: History },
    { name: 'Absen', path: '/employee/scan', icon: Scan, primary: true },
    { name: 'Leave', path: '/employee/leave', icon: ShieldCheck },
    { name: 'Profile', path: '/employee/profile', icon: User },
  ];

  if (userLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f7f8fc]">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen relative overflow-hidden font-sans bg-[#f7f8fc]">

      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-16 h-8 flex items-center justify-center">
            <IgaLogo className="w-full h-full" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Welcome</span>
            <span className="font-semibold text-slate-800 tracking-tight text-sm">{employee.name || 'Staff Member'}</span>
          </div>
        </div>
        <Link to="/employee/notifications" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-400 relative transition-all">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white shadow-sm animate-pulse"></span>
          )}
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-28 pt-2">
        <div className="max-w-md mx-auto min-h-full px-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-4 left-4 right-4 h-16 bg-white border border-slate-200 flex items-center justify-around px-4 z-50 rounded-2xl shadow-lg shadow-slate-200/50">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          if (item.primary) {
            return (
              <Link 
                key={item.name} 
                to={item.path}
                className="relative -top-8 w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30 text-white transition-all active:scale-90 group hover:bg-blue-700"
              >
                <Icon className="w-7 h-7" />
              </Link>
            );
          }

          return (
            <Link 
              key={item.name} 
              to={item.path}
              className={`flex flex-col items-center gap-1 w-14 transition-all duration-300 ${
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className={`w-5 h-5 transition-all ${isActive ? '' : ''}`} />
              <span className={`text-[9px] font-bold uppercase tracking-wide ${isActive ? 'opacity-100' : 'opacity-0'}`}>
                {item.name}
              </span>
              {isActive && (
                <div className="absolute -bottom-0.5 w-1 h-1 bg-blue-600 rounded-full"></div>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default EmployeeLayout;
