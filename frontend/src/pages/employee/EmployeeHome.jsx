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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, attendanceAPI, announcementAPI } from '../../services/api';
import { verifyRealLocation } from '../../utils/geoUtils';

const EmployeeHome = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['today-attendance'],
    queryFn: () => attendanceAPI.getAll({ period: 'Today', search: user?.employee?.name }),
    enabled: !!user?.employee?.name,
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
          alert(`Berhasil sinkronisasi ${successCount} rekam absen offline ke server!`);
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
      alert(data.message);
    },
    onError: (err) => alert(err.message),
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
      alert(data.message);
    },
    onError: (err) => alert(err.message),
  });

  const todayRecord = attendanceData?.data?.[0];
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const currentDate = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  // Robust check: treat '-- : --' as empty/null
  const hasCheckedIn = todayRecord?.checkIn && todayRecord.checkIn !== '-- : --';
  const hasCheckedOut = todayRecord?.checkOut && todayRecord.checkOut !== '-- : --';

  // Get shift info for display
  const shift = userData?.user?.employee?.shift;
  const shiftStart = shift?.startTime || '08:00';
  const shiftEnd = shift?.endTime || '17:00';

  if (userLoading || attLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;
  }

  return (
    <div className="min-h-screen relative overflow-hidden font-sans pb-20">
      <div className="relative z-10 p-2 space-y-5">
        {/* Header Info */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-blue-600 font-semibold text-xs uppercase tracking-wider mb-2">{currentDate}</p>
            <h2 className="text-5xl font-bold text-slate-800 mb-6 tracking-tight">
              {currentTime}
            </h2>
            
            <div className="flex items-center gap-2 text-xs bg-slate-50 w-fit px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 font-medium">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              <span>HQ Office • Connected</span>
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
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Check In</p>
            <p className={`text-xl font-bold ${hasCheckedIn ? 'text-slate-800' : 'text-slate-300'}`}>
              {hasCheckedIn ? todayRecord.checkIn : '-- : --'}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-blue-200 transition-all">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${hasCheckedOut ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-400'}`}>
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Check Out</p>
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
            <h3 className="font-bold text-slate-800 text-base">Monthly Performance</h3>
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="w-2 h-2 bg-slate-200 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">Lateness</span>
                <span className="text-xs font-bold text-blue-600">{userData?.user?.employee?.stats?.lateFrequency || 0} days</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full" 
                  style={{ width: `${Math.min(((userData?.user?.employee?.stats?.lateFrequency || 0) / 5) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-400 font-medium">Total: {userData?.user?.employee?.stats?.totalLateMinutes || 0} min</span>
              </div>
            </div>
            <div className="border-l border-slate-100 pl-6 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Leave Available</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-slate-800">{userData?.user?.employee?.remainingLeave || 0}</span>
                  <span className="text-xs font-medium text-slate-400">Days</span>
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
          {!hasCheckedIn ? (
            <button 
              onClick={() => navigate('/employee/scan?mode=check-in')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Camera className="w-5 h-5" />
              CHECK IN NOW
            </button>
          ) : !hasCheckedOut ? (
            <button 
              onClick={() => navigate('/employee/scan?mode=check-out')}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-orange-600/25 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Camera className="w-5 h-5" />
              CHECK OUT NOW
            </button>
          ) : (
            <div className="w-full bg-emerald-50 text-emerald-700 py-4 rounded-2xl font-bold text-base text-center border border-emerald-200">
              ✓ SHIFT COMPLETED
            </div>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => navigate('/employee/correction')}
            className="bg-white py-3.5 rounded-xl font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2 border border-slate-200 text-sm shadow-sm"
          >
            Correction
          </button>
          <button 
            onClick={() => navigate('/employee/leave')}
            className="bg-white py-3.5 rounded-xl font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2 border border-slate-200 text-sm shadow-sm"
          >
            Leave Request
          </button>
        </div>

        {/* Quick Logout Action */}
        <div className="pt-2">
          <button 
            onClick={() => { authAPI.logout(); navigate('/login'); }}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-red-50 text-red-600 rounded-xl font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all hover:bg-red-600 hover:text-white hover:border-red-600 shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            Logout from Session
          </button>
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-slate-400 flex items-center gap-2 px-1 text-xs uppercase tracking-wider">
              <Megaphone className="w-4 h-4 text-blue-600" />
              Announcements
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
                      {new Date(ann.createdAt).toLocaleDateString()}
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
    </div>
  );
};

export default EmployeeHome;
