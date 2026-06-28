import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../common/LanguageSelector';
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
  ChevronUp,
  FileText,
  GraduationCap,
  UserMinus
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, dashboardAPI, employeeAPI } from '../../services/api';
import { AppLogo } from '../AppLogo';
import LicenseFooter from '../LicenseFooter';
import AiAssistantChat from '../chat/AiAssistantChat';

const AdminLayout = () => {
  const { t } = useTranslation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Debounce the search box so we don't query the API on every keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Scroll the content area back to the top on every route change so a new page
  // never opens mid-scroll. Also close the search dropdown after navigating.
  const mainRef = useRef(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setSearchOpen(false);
  }, [location.pathname]);

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

  // Collapsible top-level groups (grup aktif terbuka secara default, lainnya tertutup)
  const [openGroups, setOpenGroups] = useState({});
  const isGroupActive = (group) => group.items.some(it =>
    location.pathname === it.path || (it.subItems && it.subItems.some(s => location.pathname === s.path))
  );
  const isGroupOpen = (group, idx) => (openGroups[idx] !== undefined ? openGroups[idx] : isGroupActive(group));
  const toggleGroup = (group, idx) => setOpenGroups(prev => ({ ...prev, [idx]: !isGroupOpen(group, idx) }));

  const menuGroups = [
    {
      title: t('navigation.groups.main'),
      icon: LayoutDashboard,
      items: [
        { name: t('navigation.dashboard'), path: '/admin', icon: LayoutDashboard, key: 'dashboard' },
        { name: t('navigation.announcements'), path: '/admin/announcements', icon: Megaphone, key: 'announcements' },
      ]
    },
    {
      title: t('navigation.groups.workforce'),
      icon: Users,
      items: [
        { name: t('navigation.employees'), path: '/admin/employees', icon: Users, key: 'employees' },
        { name: t('navigation.contracts'), path: '/admin/contracts', icon: FileText, key: 'contracts' },
        { name: t('navigation.training'), path: '/admin/training', icon: GraduationCap, key: 'training' },
        { name: t('navigation.terminated'), path: '/admin/terminated', icon: UserMinus, key: 'employees' },
        { name: t('navigation.shiftRoster'), path: '/admin/shift-roster', icon: CalendarCheck, key: 'shift-roster' },
        { name: t('navigation.leaveRequests'), path: '/admin/leave-requests', icon: CalendarCheck, key: 'leave-requests' },
        { name: t('navigation.profileRequests'), path: '/admin/profile-requests', icon: Users, key: 'profile-requests' },
        { name: t('navigation.kpiEvaluation'), path: '/admin/kpi', icon: Shield, key: 'kpi' }
      ]
    },
    {
      title: t('navigation.groups.attendance'),
      icon: CalendarCheck,
      items: [
        { name: t('navigation.attendanceData'), path: '/admin/attendance', icon: CalendarCheck, key: 'attendance' },
        { name: t('navigation.overtimeSpl'), path: '/admin/overtime-spl', icon: Clock, key: 'overtime-spl' },
        { name: t('navigation.dailyWorkers'), path: '/admin/daily-workers', icon: HardHat, key: 'daily-workers' },
        { name: t('navigation.manualCorrection'), path: '/admin/manual-correction', icon: Edit3, key: 'manual-correction' },
        { name: t('navigation.corrections'), path: '/admin/corrections', icon: Edit3, key: 'corrections' }
      ]
    },
    {
      title: t('navigation.groups.payroll'),
      icon: Banknote,
      items: [
        { name: t('navigation.payrollProcess'), path: '/admin/payroll', icon: Banknote, key: 'payroll' },
        { name: t('navigation.payrollSettings'), path: '/admin/payroll-settings', icon: Receipt, key: 'payroll-settings' },
        { name: t('navigation.claimApproval'), path: '/admin/claims', icon: Receipt, key: 'claims' }
      ]
    },
    {
      title: t('navigation.groups.devicesBiometric', 'Perangkat & biometrik'),
      icon: Fingerprint,
      items: [
        { name: t('navigation.devices'), path: '/admin/devices', icon: Fingerprint, key: 'devices' },
        { name: t('navigation.fingerprintData'), path: '/admin/fingerprint', icon: Fingerprint, key: 'fingerprint' },
        { name: t('navigation.faceCheck'), path: '/admin/face-check', icon: ScanFace, key: 'face-check' },
        { name: t('navigation.faceEnrollment'), path: '/admin/face-enrollment', icon: Camera, key: 'face-check' },
        { name: t('navigation.cameras'), path: '/admin/cameras', icon: Video, key: 'face-check' },
        { name: t('navigation.unknownAlerts'), path: '/admin/unknown-alerts', icon: AlertTriangle, key: 'face-check' }
      ]
    },
    {
      title: t('navigation.groups.system'),
      icon: Settings,
      items: [
        { name: t('navigation.users'), path: '/admin/users', icon: UserCircle, key: 'users' },
        { name: t('navigation.backup'), path: '/admin/backup', icon: Database, key: 'backup' },
        {
          name: t('navigation.settings'),
          path: '/admin/settings',
          icon: Settings,
          key: 'settings',
          subItems: [
            { name: t('navigation.generalSettings'), path: '/admin/settings', tab: 'General' },
            { name: t('navigation.adminPermissions'), path: '/admin/settings', tab: 'Permissions', superAdminOnly: true },
            { name: t('navigation.systemLicense'), path: '/admin/settings', tab: 'License', superAdminOnly: true }
          ]
        },
        { name: t('navigation.auditLog'), path: '/admin/audit-log', icon: Shield, key: 'audit-log', superAdminOnly: true }
      ]
    }
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

  const { data: empSearchData, isFetching: empSearching } = useQuery({
    queryKey: ['global-employee-search', debouncedSearch],
    queryFn: () => employeeAPI.getAll({ search: debouncedSearch, limit: 6, light: 'true' }),
    enabled: searchOpen && debouncedSearch.length >= 2,
    staleTime: 30000,
  });
  const employeeResults = (debouncedSearch.length >= 2 && empSearchData?.data) ? empSearchData.data : [];

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.length;

  const user = userData?.data || authAPI.getStoredUser() || { name: 'Admin', role: 'ADMIN' };

  // Filter groups
  const visibleGroups = menuGroups.map(group => {
    return {
      ...group,
      items: group.items.filter(item => {
        if (item.superAdminOnly) return user.role === 'SUPER_ADMIN';
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

  // Menu/page shortcuts matching the query (respects the same permission filtering as the sidebar)
  const pageResults = debouncedSearch.length >= 1
    ? visibleGroups.flatMap(g => g.items.flatMap(it => {
        const q = debouncedSearch.toLowerCase();
        const matches = [];
        if ((it.name || '').toLowerCase().includes(q)) matches.push({ name: it.name, path: it.path, icon: it.icon, group: g.title });
        if (it.subItems) it.subItems.forEach(s => {
          if ((s.name || '').toLowerCase().includes(q)) matches.push({ name: s.name, path: s.path, icon: it.icon, group: g.title, tab: s.tab });
        });
        return matches;
      })).slice(0, 6)
    : [];

  const hasResults = employeeResults.length > 0 || pageResults.length > 0;
  const showSearchDropdown = searchOpen && debouncedSearch.length >= 1;

  const closeSearch = () => { setSearchOpen(false); setSearchQuery(''); };
  const goToEmployee = (emp) => {
    closeSearch();
    navigate('/admin/employees', { state: { editEmployeeCode: emp.employeeCode, cameFrom: location.pathname } });
  };
  const goToPage = (pg) => {
    closeSearch();
    navigate(pg.path, pg.tab ? { state: { tab: pg.tab } } : undefined);
  };
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') { setSearchOpen(false); e.currentTarget.blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (employeeResults[0]) goToEmployee(employeeResults[0]);
      else if (pageResults[0]) goToPage(pageResults[0]);
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  return (
    <div className={`flex h-screen print:h-auto relative overflow-hidden print:overflow-visible font-sans bg-[#F6F3EC] print:bg-white ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>

      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-[#ECE6DA] transition-all duration-500 flex flex-col z-30 shrink-0 print:hidden`}
      >
        <div className="p-6 flex items-center justify-center border-b border-[#ECE6DA] min-h-[88px]">
          {isSidebarOpen ? (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-left-2 duration-700 w-full px-4 pt-1 group relative">
              <div className="w-full max-w-[180px] flex justify-center transition-transform duration-500 group-hover:scale-105">
                <AppLogo className="w-full h-auto object-contain text-[#1B1A17]" />
              </div>
              <span className="text-[11px] font-medium text-[#8A3A18] tracking-wide text-center mt-1">Smart HRIS Platform</span>
            </div>
          ) : (
            <div className="w-10 h-10 bg-[#C0532B] rounded-xl flex items-center justify-center shrink-0">
              <span className="text-white font-medium text-lg">I</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {visibleGroups.map((group, idx) => {
            const GroupIcon = group.icon || LayoutDashboard;
            const open = isSidebarOpen ? isGroupOpen(group, idx) : true;
            return (
              <div key={idx} className="space-y-0.5">
                {isSidebarOpen ? (
                  <button
                    onClick={() => toggleGroup(group, idx)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-[#FBF8F2] transition-colors cursor-pointer"
                  >
                    <GroupIcon className="w-[18px] h-[18px] shrink-0 text-[#C0532B]" />
                    <span className="flex-1 text-[13px] font-medium text-[#1B1A17] truncate">{group.title}</span>
                    <ChevronDown className={`w-4 h-4 text-[#9A9488] transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                  </button>
                ) : (
                  <div className="w-full h-px bg-[#ECE6DA] my-2" />
                )}

                {open && group.items.map((item) => {
                  const Icon = item.icon;
                  const hasSubItems = item.subItems && item.subItems.length > 0;
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
                      <div key={item.name} className="space-y-0.5">
                        <button
                          onClick={() => toggleMenu(item.key)}
                          className={`w-full flex items-center gap-2.5 pl-9 pr-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                            isAnySubActive ? 'bg-[#F4E4DB] text-[#8A3A18] font-medium' : 'text-[#6E6A60] hover:text-[#1B1A17] hover:bg-[#FBF8F2]'
                          }`}
                        >
                          <span className="flex-1 text-[13px] truncate">{item.name}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#9A9488]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#9A9488]" />}
                        </button>
                        {isExpanded && (
                          <div className="space-y-0.5 pl-12 animate-in slide-in-from-top-1 duration-200">
                            {visibleSubItems.map(sub => {
                              const isActive = location.pathname === sub.path &&
                                (location.state?.tab === sub.tab || (!location.state?.tab && sub.tab === 'General'));
                              return (
                                <Link
                                  key={sub.name}
                                  to={sub.path}
                                  state={{ tab: sub.tab }}
                                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                                    isActive ? 'bg-[#F4E4DB] text-[#8A3A18] font-medium' : 'text-[#6E6A60] hover:text-[#1B1A17] hover:bg-[#FBF8F2]'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#C0532B]' : 'bg-[#CFC8BA]'}`} />
                                  {sub.name}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      title={!isSidebarOpen ? item.name : undefined}
                      className={`flex items-center ${isSidebarOpen ? 'gap-2.5 pl-9 pr-2.5' : 'justify-center'} py-2 rounded-lg transition-colors ${
                        isActive ? 'bg-[#F4E4DB] text-[#8A3A18] font-medium' : 'text-[#6E6A60] hover:text-[#1B1A17] hover:bg-[#FBF8F2]'
                      }`}
                    >
                      {!isSidebarOpen && <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#C0532B]' : 'text-[#9A9488]'}`} />}
                      {isSidebarOpen && <span className="text-[13px] truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-[#ECE6DA]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#6E6A60] hover:text-red-600 hover:bg-red-50 transition-all duration-200 group cursor-pointer"
          >
            <LogOut className="w-5 h-5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            {isSidebarOpen && <span className="text-sm font-medium">{t('common.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 print:overflow-visible">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-[#ECE6DA] flex items-center justify-between px-6 z-20 shrink-0 shadow-sm print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-all active:scale-90"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            <div className="relative hidden lg:block">
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C0532B] transition-colors z-10" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  className="bg-[#FBF8F2] border border-[#ECE6DA] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0532B]/20 focus:border-[#E0B9A6] w-64 focus:w-96 transition-all text-slate-700 placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>

              {showSearchDropdown && (
                <div className="absolute left-0 mt-2 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left">
                  <div className="max-h-[420px] overflow-y-auto py-1">
                    {pageResults.length > 0 && (
                      <div className="px-2 pt-1">
                        <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('navigation.menu', 'Halaman')}</p>
                        {pageResults.map((pg, i) => {
                          const Ic = pg.icon || LayoutDashboard;
                          return (
                            <button
                              key={`pg-${i}`}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); goToPage(pg); }}
                              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#FBF8F2] text-left transition-colors cursor-pointer"
                            >
                              <span className="w-8 h-8 rounded-lg bg-[#F4E4DB] text-[#C0532B] flex items-center justify-center shrink-0"><Ic className="w-4 h-4" /></span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-slate-700 truncate">{pg.name}</span>
                                <span className="block text-[10px] text-slate-400 truncate">{pg.group}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className={`px-2 pt-1 ${pageResults.length > 0 ? 'border-t border-slate-100 mt-1' : ''}`}>
                      <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        {t('navigation.employees')}
                        {empSearching && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                      </p>
                      {debouncedSearch.length < 2 ? (
                        <p className="px-2 py-2 text-xs text-slate-400">Ketik minimal 2 huruf untuk mencari karyawan…</p>
                      ) : employeeResults.length === 0 ? (
                        !empSearching && <p className="px-2 py-2 text-xs text-slate-400">Tidak ada karyawan yang cocok.</p>
                      ) : (
                        employeeResults.map(emp => (
                          <button
                            key={emp.dbId}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); goToEmployee(emp); }}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#FBF8F2] text-left transition-colors cursor-pointer"
                          >
                            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 text-xs font-bold uppercase">{emp.name?.charAt(0) || '?'}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-slate-700 truncate">{emp.name}</span>
                              <span className="block text-[10px] text-slate-400 truncate">{emp.employeeCode} · {emp.dept}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                    {!hasResults && debouncedSearch.length >= 2 && !empSearching && (
                      <div className="px-4 py-6 text-center text-xs text-slate-400">Tidak ada hasil untuk “{debouncedSearch}”.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all relative cursor-pointer ${isNotificationsOpen ? 'bg-[#F4E4DB] text-[#8A3A18]' : 'hover:bg-slate-50 text-slate-400'}`}
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
                        <span className="font-bold text-slate-800 text-sm">{t('common.notifications')}</span>
                        <span className="text-xs text-slate-500 mt-0.5">{t('common.realtimeAlerts')}</span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="text-xs bg-[#C0532B] text-white px-2.5 py-1 rounded-lg font-semibold">{unreadCount} {t('common.new')}</span>
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
                          <span className="text-xs text-slate-400 font-medium">{t('common.noNotifications')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Language Selector */}
            <LanguageSelector />

            <div className="h-8 w-px bg-slate-200"></div>

            
            {/* User Profile */}
            <div className="flex items-center gap-3 group cursor-pointer px-3 py-2 hover:bg-slate-50 rounded-xl transition-all">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                <p className="text-[10px] text-[#8A3A18] font-semibold uppercase tracking-wide">{user.role}</p>
              </div>
              <div className="w-10 h-10 rounded-xl border border-[#ECE6DA] shadow-sm overflow-hidden group-hover:border-[#E0B9A6] transition-all">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt="avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible">
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
