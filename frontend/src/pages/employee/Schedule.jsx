import { 
  Clock, 
  MapPin, 
  Calendar, 
  ChevronLeft,
  Coffee,
  Sun,
  Moon,
  Info,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { authAPI, scheduleAPI } from '../../services/api';

const Schedule = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { data: userData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const { data: overridesData } = useQuery({
    queryKey: ['schedule-overrides', empId],
    queryFn: () => scheduleAPI.getOverrides(),
    enabled: !!empId,
  });

  const myOverrides = useMemo(() => {
    const list = overridesData?.data || overridesData || [];
    if (!Array.isArray(list) || !empId) return [];
    return list.filter(o => o.employeeId === empId && new Date(o.endDate) >= new Date())
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [overridesData, empId]);

  const shift = userData?.user?.employee?.shift || { name: t('employee.schedulePage.noShiftAssigned', 'No Shift Assigned'), startTime: '--:--', endTime: '--:--', breakStart: '12:00', breakEnd: '13:00', gracePeriod: 15 };

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/employee')}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-slate-800">{t('employee.schedulePage.title')}</h1>
      </div>

      {/* Primary Shift Card */}
      <div className="bg-primary p-8 rounded-[2.5rem] text-white shadow-xl shadow-primary/20 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className="bg-white/20 px-4 py-1.5 rounded-full backdrop-blur-md text-xs font-bold uppercase tracking-widest">
              {t('employee.schedulePage.currentShift')}
            </div>
            <Sun className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="text-3xl font-black mb-2 tracking-tight">{shift.name}</h2>
          <p className="text-primary-light font-medium">{t('employee.schedulePage.workSchedule')}</p>
          
          <div className="h-[1px] bg-white/10 my-6"></div>
          
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-primary-light uppercase tracking-widest mb-1">{t('employee.schedulePage.startTime')}</p>
              <p className="text-xl font-bold">{shift.startTime}</p>
            </div>
            <div className="w-[1px] h-8 bg-white/10"></div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-primary-light uppercase tracking-widest mb-1">{t('employee.schedulePage.endTime')}</p>
              <p className="text-xl font-bold">{shift.endTime}</p>
            </div>
          </div>
        </div>
        
        {/* Decorative circle */}
        <div className="absolute bottom-[-40px] right-[-40px] w-48 h-48 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Details List */}
      <div className="space-y-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shrink-0">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('employee.schedulePage.breakTime')}</p>
            <p className="text-sm font-bold text-slate-800">
              {shift.breakStart && shift.breakEnd ? `${shift.breakStart} - ${shift.breakEnd}` : t('employee.schedulePage.notSpecified')}
            </p>
          </div>
        </div>

        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('employee.schedulePage.gracePeriod')}</p>
            <p className="text-sm font-bold text-slate-800">{shift.gracePeriod || 0} {t('employee.schedulePage.minutes')}</p>
          </div>
        </div>

        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('employee.schedulePage.workLocation')}</p>
            <p className="text-sm font-bold text-slate-800">
              {userData?.user?.employee?.location || userData?.user?.location || t('employee.schedulePage.officeLocation', 'Lokasi Kantor')}
            </p>
          </div>
        </div>
      </div>

      {/* Shift Overrides Section */}
      {myOverrides && myOverrides.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">{t('employee.schedulePage.shiftOverrides')}</h3>
          {myOverrides.map((override) => (
            <div key={override.id} className="bg-amber-50/50 border border-amber-100 p-5 rounded-3xl flex gap-4 relative overflow-hidden">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-800">{override.shift?.name}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {t('employee.schedulePage.overridePeriod', {
                    start: new Date(override.startDate).toLocaleDateString(i18n.language || 'id-ID'),
                    end: new Date(override.endDate).toLocaleDateString(i18n.language || 'id-ID')
                  })}
                </p>
              </div>
              <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                {t('employee.schedulePage.overrideLabel')}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-100 p-6 rounded-3xl flex gap-4">
        <Info className="w-6 h-6 text-slate-400 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-slate-700 mb-1">{t('employee.schedulePage.shiftPolicy')}</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            {t('employee.schedulePage.shiftPolicyDesc', { startTime: shift.startTime, gracePeriod: shift.gracePeriod })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
