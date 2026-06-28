import { useTranslation } from 'react-i18next';
import { 
  Clock, TrendingUp, ShieldCheck, CheckCircle2, AlertTriangle, ShieldAlert, 
  Filter, Calendar, AlertCircle, XCircle 
} from 'lucide-react';

const formatDuration = (minutes, lang = 'id') => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');
  
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  
  const hrStr = isIndo ? 'jam' : isKo ? '시간' : isZh ? '小时' : 'hr';
  const minStr = isIndo ? 'menit' : isKo ? '분' : isZh ? '分钟' : 'min';
  
  if (h === 0) return `${m} ${minStr}`;
  if (m === 0) return `${h} ${hrStr}`;
  return `${h} ${hrStr} ${m} ${minStr}`;
};

const AttendanceSummary = ({ 
  displaySummary, 
  isLoading, 
  appliedFilters, 
  handleCardClick, 
  setAnomalyFilter, 
  anomalyCount,
  employeeName,
  dataList = []
}) => {
  const { t, i18n } = useTranslation();

  if (isLoading || !displaySummary) return null;

  const isAnomaly = (row) => {
    const hasIn = row.checkIn && row.checkIn !== '-- : --' && row.checkIn !== '--:--' && row.checkIn !== '-';
    const hasOut = row.checkOut && row.checkOut !== '-- : --' && row.checkOut !== '--:--' && row.checkOut !== '-';
    
    if ((row.status === 'MANGKIR' || row.status === 'ABSENT' || row.status === 'Alpa') && hasOut) {
      return true;
    }
    if (hasIn && !hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday'].includes(row.status)) {
      return true;
    }
    if (!hasIn && hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday'].includes(row.status)) {
      return true;
    }
    return false;
  };

  const calculatedAnomalyCount = anomalyCount ?? dataList.filter(isAnomaly).length;

  // Tingkat kehadiran — null bila tidak ada hari kerja (jangan tampilkan 100% palsu saat 0 data).
  const totalHadir = (displaySummary.hadir || 0) + (displaySummary.telat || 0);
  const totalExcludeOff = (displaySummary.total || 0) - ((displaySummary.holiday || 0) + (displaySummary.cuti || 0) + (displaySummary.sakit || 0) + (displaySummary.izin || 0));
  const attendanceRatePct = totalExcludeOff > 0 ? Math.round((totalHadir / totalExcludeOff) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Visual Analytics Widget Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 1: Attendance Rate Gauge */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-6 hover:shadow-md transition-all">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              {t('attendancePage.attendanceRate')}
            </span>
            <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
              {attendanceRatePct === null ? '—' : `${attendanceRatePct}%`}
            </p>
            <span className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 mt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> {attendanceRatePct === null ? t('attendancePage.semua') : t('attendancePage.presentOnTime')}
            </span>
          </div>
          
          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-500 transition-all duration-1000 ease-out"
                strokeDasharray={`${attendanceRatePct ?? 0}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <TrendingUp className="w-5 h-5 text-emerald-500 absolute" />
          </div>
        </div>

        {/* Widget 2: Lateness Rate Gauge */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-6 hover:shadow-md transition-all">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              {t('attendancePage.lateRatio')}
            </span>
            <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
              {(() => {
                const totalLateDays = (displaySummary.telat || 0);
                const totalDays = (displaySummary.total || 0);
                return totalDays > 0 ? Math.round((totalLateDays / totalDays) * 100) : 0;
              })()}%
            </p>
            <span className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1.5 mt-1">
              <Clock className="w-3.5 h-3.5 animate-pulse" /> {t('attendancePage.lateArrival')}
            </span>
          </div>
          
          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-amber-500 transition-all duration-1000 ease-out"
                strokeDasharray={`${(() => {
                  const totalLateDays = (displaySummary.telat || 0);
                  const totalDays = (displaySummary.total || 0);
                  return totalDays > 0 ? Math.round((totalLateDays / totalDays) * 100) : 0;
                })()}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <Clock className="w-5 h-5 text-amber-500 absolute" />
          </div>
        </div>

        {/* Widget 3: Anomalies Alert Card */}
        <div className={`p-6 rounded-2xl border flex items-center justify-between gap-6 hover:shadow-md transition-all ${
          calculatedAnomalyCount > 0 
            ? 'bg-amber-50/50 border-amber-200 animate-pulse' 
            : 'bg-white border-slate-200'
        }`}>
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              {t('attendancePage.anomalies')}
            </span>
            <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
              {calculatedAnomalyCount} {t('attendancePage.records', { count: calculatedAnomalyCount })}
            </p>
            {calculatedAnomalyCount > 0 ? (
              <button 
                onClick={() => setAnomalyFilter('ANOMALY')}
                className="text-[9px] font-bold text-amber-600 hover:text-amber-800 underline uppercase flex items-center gap-1.5 transition-colors cursor-pointer mt-1"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> {t('attendancePage.tinjauAnomali')}
              </button>
            ) : (
              <span className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('attendancePage.cleanValid')}
              </span>
            )}
          </div>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${
            calculatedAnomalyCount > 0
              ? 'bg-amber-100 border-amber-200 text-amber-600'
              : 'bg-slate-50 border-slate-100 text-slate-400'
          }`}>
            <ShieldAlert className="w-7 h-7" />
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-${displaySummary.uniqueEmployeeCount === 1 ? '8' : '7'} gap-4`}>
        {[
          { key: 'Total Data', label: t('attendancePage.kpiTotal'), value: displaySummary.total, color: 'blue', icon: Filter, desc: t('attendancePage.semua') },
          { key: 'Hadir', label: t('attendancePage.kpiPresent'), value: displaySummary.hadir, color: 'emerald', icon: CheckCircle2, desc: t('attendancePage.presentOnTime') },
          { key: 'Terlambat', label: t('attendancePage.kpiLate'), value: displaySummary.telat, color: 'amber', icon: Clock, desc: t('attendancePage.kpiTotal') },
          { key: 'Pulang Cepat', label: t('attendancePage.kpiEarlyDeparture'), value: displaySummary.pulangCepat || 0, color: 'purple', icon: Clock, desc: t('attendancePage.kpiEarlyDeparture') },
          { key: 'Mangkir', label: t('attendancePage.kpiMangkir'), value: displaySummary.mangkir, color: 'rose', icon: AlertCircle, desc: t('attendancePage.kpiMangkir') },
          { key: 'Alpa', label: t('attendancePage.kpiAbsent'), value: displaySummary.absen, color: 'red', icon: XCircle, desc: t('attendancePage.kpiAbsent') },
          displaySummary.uniqueEmployeeCount === 1 && { key: 'Total Terlambat', label: t('attendancePage.kpiTotalLate'), value: formatDuration(displaySummary.totalLate || 0, i18n.language), color: 'rose', icon: Clock, desc: t('attendancePage.kpiTotalLate') },
          { key: 'Lainnya', label: t('attendancePage.kpiOther'), value: (displaySummary.holiday || 0) + (displaySummary.cuti || 0) + (displaySummary.sakit || 0) + (displaySummary.izin || 0), color: 'slate', icon: Calendar, desc: t('attendancePage.kpiOther') },
        ].filter(Boolean).map((item) => {
          const isActive = 
            (item.key === 'Total Data' && !appliedFilters.status) ||
            (item.key === 'Hadir' && appliedFilters.status === 'PRESENT') ||
            ((item.key === 'Terlambat' || item.key === 'Total Terlambat') && appliedFilters.status === 'LATE') ||
            (item.key === 'Pulang Cepat' && appliedFilters.status === 'EARLY_DEPARTURE') ||
            (item.key === 'Mangkir' && appliedFilters.status === 'MANGKIR') ||
            (item.key === 'Alpa' && appliedFilters.status === 'ABSENT') ||
            (item.key === 'Lainnya' && appliedFilters.status === 'HOLIDAY');

          return (
            <div 
              key={item.key} 
              onClick={() => handleCardClick(item.key)}
              className={`bg-white p-4 rounded-2xl border shadow-sm flex flex-col gap-3 hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 cursor-pointer active:scale-95 transition-all duration-200 group ${
                isActive 
                  ? 'ring-2 ring-blue-500/50 border-blue-400 bg-blue-50/10' 
                  : 'border-slate-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`w-8 h-8 rounded-xl bg-${item.color}-50 flex items-center justify-center border border-${item.color}-100 transition-transform group-hover:scale-110 group-hover:-rotate-3`}>
                  <item.icon className={`w-4 h-4 text-${item.color}-600`} />
                </div>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping shadow-[0_0_5px_rgba(37,99,235,0.5)]" />
                )}
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                <p className="text-lg font-bold text-slate-800 leading-tight">{item.value}</p>
              </div>
              <div className="pt-2 border-t border-slate-50">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Individual Search Summary Card */}
      {appliedFilters.search && displaySummary.uniqueEmployeeCount === 1 && displaySummary.totalLate > 0 && (
        <div className="bg-gradient-to-r from-rose-500 to-orange-600 rounded-2xl p-0.5 shadow-lg shadow-rose-100 animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white rounded-[14px] p-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center border border-rose-100 shadow-inner shrink-0 group-hover:rotate-6 transition-transform">
                <Clock className="w-8 h-8 text-rose-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t('attendancePage.personalLate')}
                </h3>
                <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                  {formatDuration(displaySummary.totalLate, i18n.language)}
                </p>
              </div>
            </div>
            <div className="hidden lg:block h-16 w-px bg-slate-100" />
            <div className="hidden lg:flex flex-col items-end text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {t('attendancePage.employeeProfile')}
              </p>
              <p className="text-2xl font-black text-slate-800 uppercase">
                {employeeName || (dataList[0] && dataList[0].name) || '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceSummary;
