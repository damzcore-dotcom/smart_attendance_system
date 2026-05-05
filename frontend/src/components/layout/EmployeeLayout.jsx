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

const EmployeeLayout = () => {
  const location = useLocation();

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const user = userData?.data || authAPI.getStoredUser() || { name: 'Employee' };
  const empId = user?.employee?.id;

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
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">{user.name?.[0] || 'S'}</span>
          </div>
          <span className="font-bold text-slate-800">Hello, {user.name?.split(' ')[0] || 'User'}</span>
        </div>
        <Link to="/employee/notifications" className="p-2 text-slate-400 relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          )}
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-md mx-auto min-h-full">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-slate-100 flex items-center justify-around px-2 z-50">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          if (item.primary) {
            return (
              <Link 
                key={item.name} 
                to={item.path}
                className="relative -top-6 w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 text-white transition-transform active:scale-90"
              >
                <Icon className="w-6 h-6" />
              </Link>
            );
          }

          return (
            <Link 
              key={item.name} 
              to={item.path}
              className={`flex flex-col items-center gap-1 w-16 transition-colors relative ${
                isActive ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[8px] px-1 rounded-full border border-white">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default EmployeeLayout;
