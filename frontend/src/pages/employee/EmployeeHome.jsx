import { 
  Clock, 
  MapPin, 
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  Megaphone,
  User as UserIcon,
  Tag,
  LogOut
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, attendanceAPI, announcementAPI } from '../../services/api';
import { verifyRealLocation } from '../../utils/geoUtils';
import { resolveAttendanceAction, getEffectiveShiftEnd, parseClockToday } from '../../utils/attendanceMode';

const EmployeeHome = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const [toast, setToast] = useState(null);
  const [timeState, setTimeState] = useState(new Date());

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeState(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const { data: statsData } = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => authAPI.getMeStats(),
    enabled: !!empId,
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['today-attendance', empId],
    queryFn: () => attendanceAPI.getAll({ period: 'Today', search: user?.employee?.name }),
    enabled: !!user?.employee?.name && !!empId,
  });
  
  const { data: annData } = useQuery({
    queryKey: ['active-announcements'],
    queryFn: () => announcementAPI.getAll({ activeOnly: 'true' }),
  });
  
  const announcements = annData?.data || [];

  // Offline Sync Effect
  useEffect(() => {
    const syncOffline = async () => {
      if (!navigator.onLine) return;
      const pendingText = localStorage.getItem('pending_sync');
      if (!pendingText) return;
      
      try {
        const pending = JSON.parse(pendingText);
        if (pending.length === 0) return;
        
        let successCount = 0;
        for (const record of pending) {
          try {
            if (record.type === 'OUT') {
              await attendanceAPI.checkOut(record.employeeId, record.photoData);
            } else {
              await attendanceAPI.checkIn(
                record.employeeId, 
                record.mode, 
                record.lat, 
                record.lng, 
                record.accuracy, 
                record.timestamp, 
                record.photoData
              );
            }
            successCount++;
          } catch (e) {
            console.error('Sync error for record:', e);
          }
        }
        
        if (successCount > 0) {
          showToast(t('employee.homeState.syncSuccess', { count: successCount }), 'success');
          localStorage.removeItem('pending_sync');
          queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
        }
      } catch (err) {
        console.error('Failed to parse pending auth', err);
      }
    };
    
    // Attempt sync
    syncOffline();
    window.addEventListener('online', syncOffline);
    return () => window.removeEventListener('online', syncOffline);
  }, [queryClient]);

  const checkInMutation = useMutation({
    mutationFn: (mode) => {
      return new Promise((resolve, reject) => {
        verifyRealLocation(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            attendanceAPI.checkIn(empId, mode, latitude, longitude, accuracy, pos.timestamp)
              .then(resolve)
              .catch(reject);
          },
          (err) => reject(err)
        );
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      showToast(data.message, 'success');
    },
    onError: (err) => showToast(err.message || t('employee.scanPage.failedCheckIn', 'Failed to check in'), 'error'),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => {
      return new Promise((resolve, reject) => {
        verifyRealLocation(
          (pos) => {
            // Kita bisa juga nge-pass coordinates checkout ke backend kalau backend mendukung,
            // tapi saat ini API attendanceAPI.checkOut(empId) tidak mengirim lat/lng.
            // Namun, proses ini memastikan pengguna harus berada di lokasi yang valid (tidak fake) saat checkout.
            attendanceAPI.checkOut(empId)
              .then(resolve)
              .catch(reject);
          },
          (err) => reject(err)
        );
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      showToast(data.message, 'success');
    },
    onError: (err) => showToast(err.message || t('employee.scanPage.failedCheckOut', 'Failed to check out'), 'error'),
  });

  const todayRecord = attendanceData?.data?.find(r => r.employeeId === empId);
  const currentTime = timeState.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const currentDate = timeState.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });

  // Robust check: treat '-- : --' as empty/null
  const hasCheckedIn = todayRecord?.checkIn && todayRecord.checkIn !== '-- : --';
  const hasCheckedOut = todayRecord?.checkOut && todayRecord.checkOut !== '-- : --';

  // Get shift info for display
  const shift = userData?.user?.employee?.shift;
  const shiftStart = shift?.startTime || '08:00';
  const shiftEnd = shift?.endTime || '17:00';

  // ─── Gating jendela waktu tombol Check-in / Check-out (logika bersama) ───
  const effectiveShiftEnd = getEffectiveShiftEnd(shift, timeState);
  const checkInAt = parseClockToday(todayRecord?.checkIn, timeState);
  const attCfg = userData?.user?.attendanceConfig || {};
  const attendanceAction = resolveAttendanceAction({
    shiftStart,
    shiftEnd: effectiveShiftEnd,
    checkInAt,
    hasCheckedIn,
    hasCheckedOut,
    now: timeState,
    checkinEarlyMinutes: attCfg.checkinEarlyMinutes,
    checkoutGuardMinutes: attCfg.checkoutGuardMinutes,
  });
  const fmtWindow = (d) => (d ? d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : '');

  const hasFaceData = userData?.user?.faceDescriptor || userData?.user?.biometricKey || userData?.user?.employee?.faceDescriptor;

  if (userLoading || attLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;
  }

  return (
    <div className="min-h-screen relative overflow-hidden font-sans pb-20">
      <div className="relative z-10 p-2 space-y-5">
        {/* Biometric Warning Banner */}
        {!hasFaceData && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 shadow-sm animate-in slide-in-from-top-4 duration-300">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-800">{t('employee.homeState.biometricsNotRegistered')}</p>
              <p className="text-[10px] text-rose-600 mt-0.5">{t('employee.homeState.biometricsNotRegisteredDesc')}</p>
            </div>
          </div>
        )}

        {/* Header Info */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-blue-600 font-semibold text-xs uppercase tracking-wider mb-2">{currentDate}</p>
            <h2 className="text-5xl font-bold text-slate-800 mb-6 tracking-tight">
              {currentTime}
            </h2>
            
            <div className="flex items-center gap-2 text-xs bg-slate-50 w-fit px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 font-medium">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              <span>{t('employee.homeState.officeLocation')} • {t('employee.homeState.connected')}</span>
            </div>
          </div>
          
          <div className="absolute top-[-30px] right-[-30px] w-48 h-48 bg-blue-50 rounded-full blur-[80px] pointer-events-none" />
        </div>

        {/* Attendance Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-blue-200 transition-all">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${hasCheckedIn ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-400'}`}>
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{t('employee.checkIn')}</p>
            <p className={`text-xl font-bold ${hasCheckedIn ? 'text-slate-800' : 'text-slate-300'}`}>
              {hasCheckedIn ? todayRecord.checkIn : '-- : --'}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-blue-200 transition-all">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${hasCheckedOut ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-400'}`}>
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{t('employee.checkOut')}</p>
            <p className={`text-xl font-bold ${hasCheckedOut ? 'text-slate-800' : 'text-slate-300'}`}>
              {hasCheckedOut ? todayRecord.checkOut : '-- : --'}
            </p>
          </div>
        </div>

        {/* Shift Info */}
        <div className="bg-blue-50/50 px-4 py-2.5 rounded-xl border border-blue-100 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Shift: {shift?.name || 'Default'}</span>
          <span className="text-xs font-bold text-blue-700">{shiftStart} — {shiftEnd}</span>
        </div>

        {/* Monthly Performance */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 text-base">{t('employee.monthlyPerformance')}</h3>
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="w-2 h-2 bg-slate-200 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">{t('employee.lateness')}</span>
                <span className="text-xs font-bold text-blue-600">{statsData?.stats?.lateFrequency || 0} {t('employee.days')}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full" 
                  style={{ width: `${Math.min(((statsData?.stats?.lateFrequency || 0) / 5) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-400 font-medium">Total: {statsData?.stats?.totalLateMinutes || 0} {t('employee.minutes')}</span>
              </div>
            </div>
            <div className="border-l border-slate-100 pl-6 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('employee.leaveAvailable')}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-slate-800">{userData?.user?.employee?.remainingLeave || 0}</span>
                  <span className="text-xs font-medium text-slate-400">{t('employee.days')}</span>
                </div>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-200 rounded-full" 
                  style={{ width: `${((userData?.user?.employee?.remainingLeave || 0) / (userData?.user?.employee?.leaveQuota || 12)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          {attendanceAction.state === 'check-in' ? (
            <button
              onClick={() => navigate('/employee/scan?mode=check-in')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Camera className="w-5 h-5" />
              {t('employee.checkInNow')}
            </button>
          ) : attendanceAction.state === 'check-out' ? (
            <button
              onClick={() => navigate('/employee/scan?mode=check-out')}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-orange-600/25 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Camera className="w-5 h-5" />
              {t('employee.checkOutNow')}
            </button>
          ) : attendanceAction.state === 'early' ? (
            <div className="w-full bg-slate-50 text-slate-400 py-4 rounded-2xl font-bold text-center border border-slate-200 flex flex-col items-center gap-1">
              <span className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4" /> {t('employee.homeState.notOpen')}</span>
              <span className="text-[11px] font-medium text-slate-400 normal-case">{t('employee.homeState.opensAt', { time: fmtWindow(attendanceAction.opensAt) })}</span>
            </div>
          ) : attendanceAction.state === 'guard' ? (
            <div className="w-full bg-slate-50 text-slate-400 py-4 rounded-2xl font-bold text-center border border-slate-200 flex flex-col items-center gap-1">
              <span className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4" /> {t('employee.homeState.justCheckedIn')}</span>
              <span className="text-[11px] font-medium text-slate-400 normal-case">{t('employee.homeState.checkoutReadyAt', { time: fmtWindow(attendanceAction.readyAt) })}</span>
            </div>
          ) : attendanceAction.state === 'closed' ? (
            <div className="w-full bg-amber-50 border border-amber-200 py-4 px-4 rounded-2xl flex flex-col items-center gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-amber-700"><AlertCircle className="w-4 h-4" /> {t('employee.homeState.outsideHours')}</span>
              <span className="text-[11px] font-medium text-amber-600 text-center">{t('employee.homeState.outsideHoursDesc')}</span>
              <button
                onClick={() => navigate('/employee/correction')}
                className="mt-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                {t('employee.homeState.applyCorrection')}
              </button>
            </div>
          ) : (
            <div className="w-full bg-emerald-50 text-emerald-700 py-4 rounded-2xl font-bold text-base text-center border border-emerald-200">
              ✓ {t('employee.shiftCompleted')}
            </div>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-3 gap-2">
          <button 
            onClick={() => navigate('/employee/correction')}
            className="bg-white py-3 px-1 rounded-xl font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex flex-col items-center justify-center gap-1 border border-slate-200 text-xs shadow-sm"
          >
            {t('employee.correction')}
          </button>
          <button 
            onClick={() => navigate('/employee/leave')}
            className="bg-white py-3 px-1 rounded-xl font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex flex-col items-center justify-center gap-1 border border-slate-200 text-xs shadow-sm"
          >
            {t('employee.leaveRequest')}
          </button>
          <button 
            onClick={() => navigate('/employee/claims')}
            className="bg-white py-3 px-1 rounded-xl font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex flex-col items-center justify-center gap-1 border border-slate-200 text-xs shadow-sm"
          >
            {t('employee.myClaims')}
          </button>
        </div>

        {/* Quick Logout Action */}
        <div className="pt-2">
          <button 
            onClick={() => { authAPI.logout(); navigate('/login'); }}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-red-50 text-red-600 rounded-xl font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all hover:bg-red-600 hover:text-white hover:border-red-600 shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            {t('employee.logout')}
          </button>
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-slate-400 flex items-center gap-2 px-1 text-xs uppercase tracking-wider">
              <Megaphone className="w-4 h-4 text-blue-600" />
              {t('employee.announcements')}
            </h3>
            <div className="flex overflow-x-auto gap-4 pb-4 snap-x px-1" style={{ scrollbarWidth: 'none' }}>
              {announcements.map((ann) => (
                <div 
                  key={ann.id} 
                  className={`min-w-[280px] p-6 rounded-2xl border snap-start transition-all shadow-sm ${
                    ann.type === 'Urgent' 
                      ? 'bg-blue-600 text-white border-blue-500' 
                      : 'bg-white text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${
                      ann.type === 'Urgent' ? 'bg-white/20 text-white border-white/30' : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      {ann.type}
                    </span>
                    <span className="text-[10px] font-medium opacity-50">
                      {new Date(ann.createdAt).toLocaleDateString(i18n.language)}
                    </span>
                  </div>
                  <h4 className="font-bold text-base mb-2 line-clamp-1">{ann.title}</h4>
                  <p className={`text-sm leading-relaxed line-clamp-2 ${ann.type === 'Urgent' ? 'text-white/80' : 'text-slate-500'}`}>
                    {ann.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-2xl shadow-xl z-50 transition-all duration-300 flex items-center gap-2 border text-sm font-semibold animate-in fade-in slide-in-from-bottom-4 ${
          toast.type === 'error' 
            ? 'bg-rose-50 text-rose-700 border-rose-200' 
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default EmployeeHome;
