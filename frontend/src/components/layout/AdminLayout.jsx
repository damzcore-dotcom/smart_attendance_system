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
  Fingerprint,
  Shield,
  Banknote,
  Receipt,
  HardHat,
  Clock,
  Video,
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, dashboardAPI } from '../../services/api';
import { AppLogo } from '../AppLogo';
import LicenseFooter from '../LicenseFooter';
import AiAssistantChat from '../chat/AiAssistantChat';

const AdminLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Collapsible menus state
  const [expandedMenus, setExpandedMenus] = useState({
    settings: true // default expanded
  });

  const toggleMenu = (menuKey) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }));
  };

  const menuGroups = [
    {
      title: 'Utama',
      items: [
        { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, key: 'dashboard' },
        { name: 'Pengumuman', path: '/admin/announcements', icon: Megaphone, key: 'announcements' },
      ]
    },
    {
      title: 'Tenaga Kerja',
      items: [
        { name: 'Karyawan', path: '/admin/employees', icon: Users, key: 'employees' },
        { name: 'Rotasi Shift', path: '/admin/shift-roster', icon: CalendarCheck, key: 'shift-roster' },
        { name: 'Cuti & Kalender', path: '/admin/leave-requests', icon: CalendarCheck, key: 'leave-requests' }
      ]
    },
    {
      title: 'Absensi',
      items: [
        { name: 'Data Absensi', path: '/admin/attendance', icon: CalendarCheck, key: 'attendance' },
        { name: 'Lembur (SPL)', path: '/admin/overtime-spl', icon: Clock, key: 'overtime-spl' },
        { name: 'Absen Harian (BHL)', path: '/admin/daily-workers', icon: HardHat, key: 'daily-workers' },
        { name: 'Koreksi Manual HRD', path: '/admin/manual-correction', icon: Edit3, key: 'manual-correction' },
        { name: 'Permintaan Koreksi', path: '/admin/corrections', icon: Edit3, key: 'corrections' }
      ]
    },
    {
      title: 'Penggajian',
      items: [
        { name: 'Proses Payroll', path: '/admin/payroll', icon: Banknote, key: 'payroll' },
        { name: 'Pengaturan Payroll', path: '/admin/payroll-settings', icon: Receipt, key: 'payroll-settings' }
      ]
    },
    {
      title: 'CCTV Deteksi Wajah',
      items: [
        { name: 'Log Deteksi Wajah', path: '/admin/face-check', icon: ScanFace, key: 'face-check' },
        { name: 'Pendaftaran CCTV', path: '/admin/face-enrollment', icon: Camera, key: 'face-check' },
        { name: 'Kamera Langsung', path: '/admin/cameras', icon: Video, key: 'face-check' },
        { name: 'Alert Wajah Asing', path: '/admin/unknown-alerts', icon: AlertTriangle, key: 'face-check' }
      ]
    },
    {
      title: 'Sidik Jari',
      items: [
        { name: 'Mesin Finger', path: '/admin/devices', icon: Fingerprint, key: 'devices' },
        { name: 'Data Sidik Jari', path: '/admin/fingerprint', icon: Fingerprint, key: 'fingerprint' }
      ]
    },
    {
      title: 'IT & Sistem',
      items: [
        { name: 'Hak Akses User', path: '/admin/users', icon: UserCircle, key: 'users' },
        { name: 'Backup Data', path: '/admin/backup', icon: Database, key: 'backup' },
        { 
          name: 'Pengaturan', 
          path: '/admin/settings', 
          icon: Settings, 
          key: 'settings',
          subItems: [
            { name: 'Pengaturan Umum', path: '/admin/settings', tab: 'General' },
            { name: 'Hak Akses Admin', path: '/admin/settings', tab: 'Permissions', superAdminOnly: true },
            { name: 'Lisensi Sistem', path: '/admin/settings', tab: 'License', superAdminOnly: true }
          ]
        }
      ]
    }
  ];

  const superAdminGroup = {
    title: 'Super Admin',
    items: [
      { name: 'Log Audit', path: '/admin/audit-log', icon: Shield, key: 'audit-log' }
    ]
  };

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

  // Filter groups
  const visibleGroups = menuGroups.map(group => {
    return {
      ...group,
      items: group.items.filter(item => {
        if (user.role === 'SUPER_ADMIN' || user.permissions === 'ALL') return true;
        if (!user.permissions || !Array.isArray(user.permissions)) return false;
        
        // Settings menu visibility check
        if (item.key === 'settings') {
          const hasMaster = user.permissions.some(p => p.menuKey === 'settings' && p.canRead);
          const hasSub = user.permissions.some(p => p.menuKey.startsWith('settings-') && p.canRead);
          return hasMaster || hasSub;
        }

        const perm = user.permissions.find(p => p.menuKey === item.key);
        return perm?.canRead;
      })
    };
  }).filter(group => group.items.length > 0);

  if (user.role === 'SUPER_ADMIN') {
    visibleGroups.push(superAdminGroup);
  }

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  return (
    <div className={`flex h-screen print:h-auto relative overflow-hidden print:overflow-visible font-sans bg-[#f7f8fc] print:bg-white ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>

      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-72' : 'w-20'
        } bg-white border-r border-slate-200 transition-all duration-500 flex flex-col z-30 shrink-0 print:hidden`}
      >
        <div className="p-6 flex items-center justify-center border-b border-slate-100 min-h-[88px]">
          {isSidebarOpen ? (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-left-2 duration-700 w-full px-4 pt-1 group relative gap-2">
              <div className="w-full max-w-[200px] flex justify-center transition-transform duration-500 group-hover:scale-105 relative z-0">
                <AppLogo className="w-full h-auto max-h-[56px] object-contain drop-shadow-sm text-slate-800" />
              </div>
              <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-slate-500 tracking-wider uppercase text-center relative z-10 drop-shadow-sm">Smart Attendance Pro</span>
            </div>
          ) : (
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 shadow-md">
              <span className="text-white font-black text-lg">I</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-4 mt-6 overflow-y-auto custom-scrollbar">
          {visibleGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {isSidebarOpen ? (
                <div className="px-3 mb-2">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{group.title}</span>
                </div>
              ) : (
                <div className="w-full h-px bg-slate-100 my-2" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const hasSubItems = item.subItems && item.subItems.length > 0;
                
                // Filter subItems based on role
                const visibleSubItems = hasSubItems 
                  ? item.subItems.filter(sub => !sub.superAdminOnly || user.role === 'SUPER_ADMIN')
                  : [];
                
                const isExpanded = expandedMenus[item.key];
                
                if (isSidebarOpen && visibleSubItems.length > 0) {
                  const isAnySubActive = visibleSubItems.some(sub => 
                    location.pathname === sub.path && 
                    (location.state?.tab === sub.tab || (!location.state?.tab && sub.tab === 'General'))
                  );
                  
                  return (
                    <div key={item.name} className="space-y-1">
                      {/* Parent Menu Header */}
                      <button
                        onClick={() => toggleMenu(item.key)}
                        className={`w-[calc(100%-12px)] flex items-center gap-3 ml-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative text-left cursor-pointer ${
                          isAnySubActive 
                            ? 'bg-blue-50/40 text-blue-700 font-semibold' 
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`w-5 h-5 shrink-0 transition-all duration-200 ${isAnySubActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        <span className="text-sm tracking-wide flex-1">{item.name}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>
                      
                      {/* Expanded Sub-items */}
                      {isExpanded && (
                        <div className="space-y-1 pl-7 animate-in slide-in-from-top-1 duration-200">
                          {visibleSubItems.map(sub => {
                            const isActive = location.pathname === sub.path && 
                              (location.state?.tab === sub.tab || (!location.state?.tab && sub.tab === 'General'));
                            
                            return (
                              <Link
                                key={sub.name}
                                to={sub.path}
                                state={{ tab: sub.tab }}
                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 border border-transparent ${
                                  isActive
                                    ? 'bg-blue-50/70 text-blue-700 border-blue-100/30 font-bold'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full transition-all ${isActive ? 'bg-blue-500 scale-110 shadow-[0_0_4px_rgba(59,130,246,0.5)]' : 'bg-slate-300'}`} />
                                {sub.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Normal Flat Link
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center gap-3 ml-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                      isActive 
                        ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm border border-blue-100/50' 
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                    title={!isSidebarOpen ? item.name : undefined}
                  >
                    {isActive && (
                       <div className="absolute -left-3 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full shadow-sm" />
                    )}
                    <Icon className={`w-5 h-5 shrink-0 transition-all duration-200 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'}`} />
                    {isSidebarOpen && <span className="text-sm tracking-wide">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200 group"
          >
            <LogOut className="w-5 h-5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            {isSidebarOpen && <span className="text-sm font-medium">Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 print:overflow-visible">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20 shrink-0 shadow-sm print:hidden">
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
                placeholder="Cari..." 
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
                        <span className="font-bold text-slate-800 text-sm">Notifikasi</span>
                        <span className="text-xs text-slate-500 mt-0.5">Peringatan real-time</span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg font-semibold">{unreadCount} Baru</span>
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
                          <span className="text-xs text-slate-400 font-medium">Tidak ada notifikasi</span>
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
        <main className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 print:animate-none">
            <Outlet />
          </div>
        </main>
        <div className="print:hidden">
          <LicenseFooter />
        </div>
        <AiAssistantChat />
      </div>
    </div>
  );
};

export default AdminLayout;
