import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  LogOut, 
  Bell,
  Menu,
  X,
  UserCircle,
  Building2,
  Users
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI } from '../../services/api';
import { IgaLogo } from '../IgaLogo';

const DirectorLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  const menuItems = [
    { name: 'Dashboard', path: '/director', icon: LayoutDashboard },
    { name: 'Leave Approval', path: '/director/leave', icon: Users },
    { name: 'Attendance', path: '/director/attendance', icon: CalendarCheck },
  ];

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const user = userData?.data || authAPI.getStoredUser() || { name: 'Direktur', role: 'DIREKTUR' };

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen relative overflow-hidden font-sans bg-[#f7f8fc]">

      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 transition-all duration-500 flex flex-col bg-white border-r border-slate-200 shadow-lg
          lg:relative lg:translate-x-0 lg:shadow-none
          ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full w-0 lg:w-20 lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div className="p-6 flex items-center justify-center border-b border-slate-100 min-h-[88px]">
          {isSidebarOpen ? (
            <div className="h-10 animate-in fade-in slide-in-from-left-2 duration-500">
              <IgaLogo className="w-full h-full" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 shadow-md">
              <span className="text-white font-black text-lg">I</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-semibold' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {isActive && (
                   <div className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full" />
                )}
                <Icon className={`w-5 h-5 shrink-0 transition-all duration-200 ${isActive ? 'text-blue-600' : 'group-hover:scale-105 group-hover:text-slate-700'}`} />
                {(isSidebarOpen || (isMobile && isSidebarOpen)) && (
                  <span className={`text-sm ${!isSidebarOpen && 'lg:hidden'}`}>{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile Area */}
        <div className="p-4 mt-auto">
          <div className="rounded-xl border border-slate-100 p-4 bg-slate-50 transition-all duration-500">
            {isSidebarOpen && (
              <div className="flex items-center gap-3 mb-4 animate-in fade-in duration-500">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center overflow-hidden text-blue-600">
                   <UserCircle className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{user.name || user.username}</p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{user.role}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200 text-sm font-medium ${isSidebarOpen ? 'px-3 py-2.5' : 'px-0 py-2 justify-center'}`}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span>Secure Exit</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 z-20 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-xl transition-all text-slate-400"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              {menuItems.find(m => m.path === location.pathname)?.name || 'Executive Analytics'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
               <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
               <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Director Mode</span>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="w-10 h-10 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt="avatar" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DirectorLayout;
