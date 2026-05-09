import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck, 
  Settings, 
  LogOut, 
  Bell, 
  Search,
  Menu,
  X,
  Edit3,
  Loader2,
  UserCircle,
  Megaphone,
  ScanFace,
  Database,
  Fingerprint
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, dashboardAPI } from '../../services/api';
import { IgaLogo } from '../IgaLogo';

const AdminLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, key: 'dashboard' },
    { name: 'Employees', path: '/admin/employees', icon: Users, key: 'employees' },
    { name: 'Users', path: '/admin/users', icon: UserCircle, key: 'users' },
    { name: 'Attendance', path: '/admin/attendance', icon: CalendarCheck, key: 'attendance' },
    { name: 'Announcements', path: '/admin/announcements', icon: Megaphone, key: 'announcements' },
    { name: 'Face Check', path: '/admin/face-check', icon: ScanFace, key: 'face-check' },
    { name: 'Cuti & Kalender', path: '/admin/leave-requests', icon: CalendarCheck, key: 'leave-requests' },
    { name: 'Backup', path: '/admin/backup', icon: Database, key: 'backup' },
    { name: 'Corrections', path: '/admin/corrections', icon: Edit3, key: 'corrections' },
    { name: 'Mesin Finger', path: '/admin/devices', icon: Fingerprint, key: 'settings' },
    { name: 'Settings', path: '/admin/settings', icon: Settings, key: 'settings' },
  ];

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const { data: notificationsData } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => dashboardAPI.getAdminNotifications(),
    refetchInterval: 60000,
  });

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.length;

  const user = userData?.data || authAPI.getStoredUser() || { name: 'Admin', role: 'ADMIN' };

  const filteredMenuItems = menuItems.filter(item => {
    if (user.role === 'SUPER_ADMIN' || user.permissions === 'ALL') return true;
    if (!user.permissions || !Array.isArray(user.permissions)) return false;
    const perm = user.permissions.find(p => p.menuKey === item.key);
    return perm?.canRead;
  });

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen relative overflow-hidden font-sans bg-[#f7f8fc]">

      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-72' : 'w-20'
        } bg-white border-r border-slate-200 transition-all duration-500 flex flex-col z-30 shrink-0`}
      >
        <div className="p-6 flex items-center justify-center border-b border-slate-100 min-h-[88px]">
          {isSidebarOpen ? (
            <div className="h-10 animate-in fade-in slide-in-from-left-2 duration-500">
              <IgaLogo className="w-full h-full text-slate-800" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 shadow-md">
              <span className="text-white font-black text-lg">I</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-semibold' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {isActive && (
                   <div className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full" />
                )}
                <Icon className={`w-5 h-5 shrink-0 transition-all duration-200 ${isActive ? 'text-blue-600' : 'group-hover:text-slate-700'}`} />
                {isSidebarOpen && <span className="text-sm">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200 group"
          >
            <LogOut className="w-5 h-5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            {isSidebarOpen && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-all active:scale-90"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            <div className="relative hidden lg:block group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 w-64 focus:w-96 transition-all text-slate-700 placeholder:text-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all relative ${isNotificationsOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-400'}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white shadow-sm animate-pulse"></span>
                )}
              </button>

              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right rounded-2xl shadow-xl">
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm">Notifications</span>
                        <span className="text-xs text-slate-500 mt-0.5">Real-time alerts</span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg font-semibold">{unreadCount} New</span>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto p-2 space-y-1">
                      {notifications.length > 0 ? (
                        notifications.map((n) => (
                          <div key={n.id} className="p-4 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group">
                            {n.type === 'warning' && <div className="absolute left-0 top-4 bottom-4 w-1 bg-amber-500 rounded-r-full"></div>}
                            <p className="text-sm font-semibold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">{n.title}</p>
                            <p className="text-xs text-slate-500 leading-relaxed mb-2">{n.desc}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{n.time}</p>
                          </div>
                        ))
                      ) : (
                        <div className="py-12 text-center flex flex-col items-center gap-3">
                          <Bell className="w-8 h-8 text-slate-300" />
                          <span className="text-xs text-slate-400 font-medium">No notifications</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="h-8 w-px bg-slate-200"></div>
            
            {/* User Profile */}
            <div className="flex items-center gap-3 group cursor-pointer px-3 py-2 hover:bg-slate-50 rounded-xl transition-all">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">{user.role}</p>
              </div>
              <div className="w-10 h-10 rounded-xl border border-slate-200 shadow-sm overflow-hidden group-hover:border-blue-300 transition-all">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt="avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
