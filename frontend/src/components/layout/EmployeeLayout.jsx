import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../common/LanguageSelector';
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
import { authAPI, notificationAPI, attendanceAPI } from '../../services/api';
import { AppLogo } from '../AppLogo';
import LicenseFooter from '../LicenseFooter';
import { resolveAttendanceAction, getEffectiveShiftEnd, parseClockToday } from '../../utils/attendanceMode';

const EmployeeLayout = () => {
  const { t } = useTranslation();
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

  // Jam ringan (refresh 30 dtk) agar mode tombol scan tetap sinkron melewati batas jendela waktu
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Status absen hari ini — share cache dengan EmployeeHome (queryKey sama)
  const { data: attendanceData } = useQuery({
    queryKey: ['today-attendance', empId],
    queryFn: () => attendanceAPI.getAll({ period: 'Today', search: employee?.name }),
    enabled: !!employee?.name && !!empId,
  });
  const todayRecord = attendanceData?.data?.find(r => r.employeeId === empId);
  const hasCheckedIn = todayRecord?.checkIn && todayRecord.checkIn !== '-- : --';
  const hasCheckedOut = todayRecord?.checkOut && todayRecord.checkOut !== '-- : --';
  const attCfg = user?.attendanceConfig || {};
  const scanAction = resolveAttendanceAction({
    shiftStart: employee?.shift?.startTime || '08:00',
    shiftEnd: getEffectiveShiftEnd(employee?.shift, now),
    checkInAt: parseClockToday(todayRecord?.checkIn, now),
    hasCheckedIn,
    hasCheckedOut,
    now,
    checkinEarlyMinutes: attCfg.checkinEarlyMinutes,
    checkoutGuardMinutes: attCfg.checkoutGuardMinutes,
  });
  const scanTo = `/employee/scan${scanAction.mode ? `?mode=${scanAction.mode}` : ''}`;

  // Web Push PWA Notification Subscription
  useEffect(() => {
    if (!empId) return;

    const registerPushNotifications = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          console.warn('[Web Push] Service Worker or Push Notifications are not supported in this browser.');
          return;
        }

        // 1. Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[Web Push] Service Worker registered successfully:', registration);

        // 2. Request permission if not already granted
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
          console.log('[Web Push] Notification permission was not granted:', permission);
          return;
        }

        // 3. Get VAPID Public Key from backend
        const keyRes = await notificationAPI.getPublicKey();
        if (!keyRes.success || !keyRes.publicKey) {
          console.error('[Web Push] Failed to fetch VAPID public key.');
          return;
        }

        // Helper function to convert URL-safe base64 to Uint8Array VAPID key
        const urlBase64ToUint8Array = (base64String) => {
          const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        const convertedVapidKey = urlBase64ToUint8Array(keyRes.publicKey);

        // 4. Subscribe to push manager
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
          console.log('[Web Push] New subscription created:', subscription);
        } else {
          console.log('[Web Push] Existing subscription found:', subscription);
        }

        // 5. Register subscription on backend
        await notificationAPI.registerToken(subscription, 'web');
        console.log('[Web Push] Subscription successfully registered on backend.');
      } catch (err) {
        console.error('[Web Push] Error during push notification registration:', err);
      }
    };

    // Delay registration slightly to avoid delaying page load
    const timer = setTimeout(registerPushNotifications, 1000);
    return () => clearTimeout(timer);
  }, [empId]);

  const navItems = [
    { name: t('employee.home'), path: '/employee', icon: Home },
    { name: t('employee.history'), path: '/employee/history', icon: History },
    { name: t('employee.scan'), path: '/employee/scan', icon: Scan, primary: true },
    { name: t('employee.leave'), path: '/employee/leave', icon: ShieldCheck },
    { name: t('employee.profile'), path: '/employee/profile', icon: User },
  ];


  // Check if we are on the scan page to hide the layout chrome
  const isScanPage = location.pathname === '/employee/scan';

  if (userLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f7f8fc]">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen print:h-auto relative overflow-hidden print:overflow-visible font-sans bg-[#f7f8fc] print:bg-white">

      {/* Top Bar */}
      {!isScanPage && (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-50 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-28 sm:w-36 h-10 flex items-center justify-start">
              <AppLogo className="w-full h-auto max-h-full object-contain object-left" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{t('common.welcome')}</span>
              <span className="font-semibold text-slate-800 tracking-tight text-sm">{employee.name || 'Karyawan'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <Link to="/employee/notifications" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-400 relative transition-all">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white shadow-sm animate-pulse"></span>
              )}
            </Link>
          </div>
        </header>

      )}

      {/* Content */}
      <main className={`flex-1 overflow-y-auto ${isScanPage ? 'pb-0 pt-0' : 'pb-28 pt-2'} print:p-0 print:overflow-visible`}>
        <div className={`mx-auto min-h-full ${isScanPage ? 'w-full' : 'max-w-md px-4'} print:p-0 print:max-w-none`}>
          <Outlet />
        </div>
      </main>

      <div className="print:hidden">
        <LicenseFooter />
      </div>

      {/* Bottom Nav */}
      {!isScanPage && (
        <nav className="fixed bottom-6 left-4 right-4 h-20 bg-white border border-slate-200 flex items-center justify-around px-2 z-50 rounded-3xl shadow-xl shadow-blue-900/5 print:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            if (item.primary) {
              // Tombol scan tidak aktif saat tidak ada aksi presensi (sudah selesai / check-out belum dibuka)
              if (!scanAction.enabled) {
                return (
                  <div
                    key={item.name}
                    title={
                      scanAction.state === 'completed' ? 'Presensi hari ini selesai'
                        : scanAction.state === 'early' ? 'Check-in belum dibuka'
                        : scanAction.state === 'guard' ? 'Baru saja check-in, tunggu sebentar'
                        : scanAction.state === 'closed' ? 'Di luar jam kerja — ajukan Koreksi'
                        : 'Belum ada aksi presensi'
                    }
                    className="relative -top-10 w-16 h-16 bg-slate-300 rounded-2xl flex items-center justify-center shadow-xl text-white/80 cursor-not-allowed ring-4 ring-[#f7f8fc]"
                  >
                    <Icon className="w-8 h-8" />
                  </div>
                );
              }
              return (
                <Link
                  key={item.name}
                  to={scanTo}
                  className={`relative -top-10 w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl text-white transition-all active:scale-95 group ring-4 ring-[#f7f8fc] ${
                    scanAction.mode === 'check-out'
                      ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/40'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/40'
                  }`}
                >
                  <Icon className="w-8 h-8" />
                </Link>
              );
            }

            return (
              <Link 
                key={item.name} 
                to={item.path}
                className={`flex flex-col items-center justify-center gap-1.5 w-16 h-full transition-all duration-300 relative ${
                  isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className={`p-2 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-50' : ''}`}>
                  <Icon className={`w-5 h-5`} />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.name}
                </span>
                {isActive && (
                  <div className="absolute bottom-2 w-1.5 h-1.5 bg-blue-600 rounded-full animate-in zoom-in duration-300"></div>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
};

export default EmployeeLayout;
