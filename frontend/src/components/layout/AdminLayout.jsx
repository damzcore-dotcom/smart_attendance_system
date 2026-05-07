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
  Database
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, dashboardAPI } from '../../services/api';

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
    { name: 'Settings', path: '/admin/settings', icon: Settings, key: 'settings' },
  ];

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const { data: notificationsData } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => dashboardAPI.getAdminNotifications(),
    refetchInterval: 60000, // Refresh every minute
  });

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.length;

  const user = userData?.data || authAPI.getStoredUser() || { name: 'Admin', role: 'ADMIN' };

  const filteredMenuItems = menuItems.filter(item => {
    if (user.role === 'SUPER_ADMIN' || user.permissions === 'ALL') return true;
    if (!user.permissions || !Array.isArray(user.permissions)) {
      return false;
    }
    const perm = user.permissions.find(p => p.menuKey === item.key);
    return perm?.canRead;
  });

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-slate-200 transition-all duration-300 flex flex-col z-30 shadow-sm`}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          {isSidebarOpen && (
            <span className="font-bold text-xl text-slate-800 tracking-tight">Smart Attend</span>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1.5 mt-2 overflow-y-auto custom-scrollbar">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-primary'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'group-hover:scale-110 transition-transform'}`} />
                {isSidebarOpen && <span className="font-semibold text-sm">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 mb-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 hover:gap-4 transition-all duration-300 group"
          >
            <LogOut className="w-5 h-5 shrink-0 group-hover:rotate-12 transition-transform" />
            {isSidebarOpen && <span className="font-bold text-sm">Logout System</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Nav */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="relative hidden md:block group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input 
                type="text" 
                placeholder="Search menus..." 
                className="bg-slate-50 border border-slate-100 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-64 focus:w-80 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <>
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2">
                      {filteredMenuItems
                        .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(item => (
                          <Link
                            key={item.key}
                            to={item.path}
                            onClick={() => setSearchQuery('')}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-primary transition-all group"
                          >
                            <item.icon className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                            <span className="text-sm font-medium">{item.name}</span>
                          </Link>
                        ))}
                      {filteredMenuItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No menu items found.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                className={`p-2 rounded-lg transition-colors relative ${isNotificationsOpen ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>

              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)}></div>
                  <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                      <span className="font-bold text-slate-800">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{unreadCount} NEW</span>
                      )}
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map((n) => (
                          <div key={n.id} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0 relative">
                            {n.type === 'warning' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>}
                            <p className="text-sm font-bold text-slate-800 mb-0.5">{n.title}</p>
                            <p className="text-xs text-slate-500 leading-relaxed mb-1">{n.desc}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{n.time}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-sm text-slate-500 font-medium">
                          No new notifications
                        </div>
                      )}
                    </div>
                    <button className="w-full py-3 text-xs font-bold text-primary hover:bg-primary/5 transition-colors">
                      View All Notifications
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
            
            <div className="flex items-center gap-3 group cursor-pointer p-1.5 hover:bg-slate-50 rounded-xl transition-colors">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-500">{user.role}</p>
              </div>
              <div className="w-10 h-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden group-hover:ring-2 group-hover:ring-primary/20 transition-all">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt="avatar" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
