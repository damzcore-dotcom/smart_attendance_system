import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  FileCheck2, 
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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 transition-all duration-300 flex flex-col shadow-2xl
          lg:relative lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full w-0 lg:w-20 lg:translate-x-0'}
        `}
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 60%, #1a4a7a 100%)' }}
      >
        {/* Brand */}
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
            <Building2 className="w-6 h-6 text-white" />
          </div>
          {(isSidebarOpen || !isMobile) && (
            <div className={`animate-in fade-in slide-in-from-left-2 duration-300 ${!isSidebarOpen && 'lg:hidden'}`}>
              <span className="font-bold text-white text-lg block tracking-tight">Director Portal</span>
              <span className="text-blue-400 text-[10px] font-bold tracking-widest uppercase">Executive View</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1.5 mt-6 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                  isActive 
                    ? 'text-white' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
                style={isActive ? { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 8px 20px rgba(37,99,235,0.3)' } : {}}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'group-hover:scale-110 transition-transform'}`} />
                {(isSidebarOpen || (isMobile && isSidebarOpen)) && (
                  <span className={`font-semibold text-sm tracking-wide ${!isSidebarOpen && 'lg:hidden'}`}>{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile Area */}
        <div className="p-4 mt-auto">
          <div className={`rounded-2xl border border-white/5 p-4 transition-all duration-300 ${isSidebarOpen ? 'bg-white/5' : 'bg-transparent'}`}>
            {isSidebarOpen && (
              <div className="flex items-center gap-3 mb-4 animate-in fade-in duration-300">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center overflow-hidden text-blue-200">
                   <UserCircle className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{user.name || user.username}</p>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">{user.role}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all duration-300 font-bold text-sm ${isSidebarOpen ? 'px-4 py-3' : 'px-0 py-2 justify-center'}`}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span>Logout Portal</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Nav */}
        <header className="h-16 lg:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 z-20 shadow-sm shrink-0">
          <div className="flex items-center gap-3 lg:gap-4">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 lg:p-2.5 hover:bg-slate-50 text-slate-500 rounded-xl transition-all border border-transparent hover:border-slate-100"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="md:block">
               <h2 className="text-base lg:text-lg font-bold text-slate-800 truncate max-w-[150px] lg:max-w-none">
                {menuItems.find(m => m.path === location.pathname)?.name || 'Dashboard'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
             <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl">
               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
               <span className="text-[10px] lg:text-[11px] font-bold text-blue-700 uppercase tracking-widest">EXECUTIVE</span>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 mx-1 lg:mx-2"></div>
            <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white text-xs lg:text-sm font-bold">
                {(user.name || user.username || 'D').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-[#f8fafc]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DirectorLayout;
