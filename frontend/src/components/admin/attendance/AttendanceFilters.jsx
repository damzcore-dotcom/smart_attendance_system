import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar, ArrowRight, Search, Filter, Loader2, RefreshCw 
} from 'lucide-react';
import { attendanceAPI, settingsAPI } from '../../../services/api';

const translateStatus = (status, lang) => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');
  
  const normalized = (status || '').toUpperCase();
  
  const map = {
    'PRESENT': isIndo ? 'Hadir' : isKo ? '출석' : isZh ? '出勤' : 'Present',
    'HADIR': isIndo ? 'Hadir' : isKo ? '출석' : isZh ? '出勤' : 'Present',
    'LATE': isIndo ? 'Terlambat' : isKo ? '지각' : isZh ? '迟到' : 'Late',
    'TERLAMBAT': isIndo ? 'Terlambat' : isKo ? '지각' : isZh ? '迟到' : 'Late',
    'MANGKIR': isIndo ? 'Mangkir' : isKo ? '무단결근' : isZh ? '旷工' : 'Unexcused',
    'MISSING': isIndo ? 'Mangkir' : isKo ? '무단결근' : isZh ? '旷工' : 'Unexcused',
    'HOLIDAY': isIndo ? 'Libur' : isKo ? '공휴일' : isZh ? '节假日' : 'Holiday',
    'LIBUR': isIndo ? 'Libur' : isKo ? '공휴일' : isZh ? '节假日' : 'Holiday',
    'CUTI': isIndo ? 'Cuti' : isKo ? '휴가' : isZh ? '请假' : 'Leave',
    'LEAVE': isIndo ? 'Cuti' : isKo ? '휴가' : isZh ? '请假' : 'Leave',
    'SAKIT': isIndo ? 'Sakit' : isKo ? '병가' : isZh ? '病假' : 'Medical',
    'MEDICAL': isIndo ? 'Sakit' : isKo ? '병가' : isZh ? '病假' : 'Medical',
    'IZIN': isIndo ? 'Izin' : isKo ? '외출/조퇴' : isZh ? '事假' : 'Permit',
    'PERMIT': isIndo ? 'Izin' : isKo ? '외출/조퇴' : isZh ? '事假' : 'Permit',
    'ABSENT': isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
    'ALPA': isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
    'ALPHA': isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
    'EARLY_DEPARTURE': isIndo ? 'Pulang Cepat' : isKo ? '조기 퇴근' : isZh ? '早退' : 'Early Departure',
    'PULANG CEPAT': isIndo ? 'Pulang Cepat' : isKo ? '조기 퇴근' : isZh ? '早退' : 'Early Departure',
  };
  
  return map[normalized] || status;
};

const AttendanceFilters = ({ onApply, isLoading, currentSearch, initialFilters }) => {
  const { t, i18n } = useTranslation();
  const [filterDate, setFilterDate] = useState(initialFilters?.period || 'Today');
  const [customStart, setCustomStart] = useState(initialFilters?.startDate || '');
  const [customEnd, setCustomEnd] = useState(initialFilters?.endDate || '');
  const [filterDept, setFilterDept] = useState(initialFilters?.dept || '');
  const [filterSection, setFilterSection] = useState(initialFilters?.section || '');
  const [filterPosition, setFilterPosition] = useState(initialFilters?.position || '');
  const [filterStatus, setFilterStatus] = useState(initialFilters?.status || '');
  const [filterLocation, setFilterLocation] = useState(initialFilters?.locationId || '');
  const [searchQuery, setSearchQuery] = useState(currentSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(currentSearch || '');

  useEffect(() => {
    if (initialFilters) {
      setFilterDate(initialFilters.period || 'Today');
      setCustomStart(initialFilters.startDate || '');
      setCustomEnd(initialFilters.endDate || '');
      setFilterDept(initialFilters.dept || '');
      setFilterSection(initialFilters.section || '');
      setFilterPosition(initialFilters.position || '');
      setFilterStatus(initialFilters.status || '');
      setFilterLocation(initialFilters.locationId || '');
      setSearchQuery(initialFilters.search || '');
    }
  }, [initialFilters]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (currentSearch !== undefined) {
      setSearchQuery(currentSearch);
    }
  }, [currentSearch]);

  const { data: optionsData } = useQuery({
    queryKey: ['attendance-options-reactive', { period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: debouncedSearch }],
    queryFn: () => attendanceAPI.getMasterOptions({ period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: debouncedSearch }),
    staleTime: 30000,
  });

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => settingsAPI.getLocations(),
    staleTime: 60000,
  });

  const masterOptions = optionsData?.data || { departments: [], sections: [], positions: [], statuses: [] };
  const locations = locationsData?.data || [];

  const handleApply = () => {
    onApply({
      page: 1,
      period: filterDate,
      startDate: customStart,
      endDate: customEnd,
      dept: filterDept,
      section: filterSection,
      position: filterPosition,
      status: filterStatus,
      locationId: filterLocation,
      search: searchQuery
    });
  };

  return (
    <div className="bg-white p-6 border border-slate-200 shadow-sm rounded-2xl">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-3 min-w-max">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('attendancePage.filterTimeRange')}:</label>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            {['Today', 'This Week', 'This Month', 'Custom'].map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setFilterDate(period)}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                  filterDate === period 
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200 relative z-10' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {period === 'Today' ? t('attendancePage.filterToday') : period === 'This Week' ? t('attendancePage.filterThisWeek') : period === 'This Month' ? t('attendancePage.filterThisMonth') : t('attendancePage.filterSelectDate')}
              </button>
            ))}
          </div>

          {filterDate === 'Custom' && (
            <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
              <input 
                type="date" 
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm"
              />
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-2 lg:col-span-1 xl:col-span-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('attendancePage.filterSearch')}</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder={t('attendancePage.placeholderSearch')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
              />
            </div>
          </div>

          {[
            { label: t('attendancePage.department'), val: filterDept, setter: setFilterDept, opts: masterOptions.departments.map(d => ({ v: d.name, l: d.name })), onChg: () => { setFilterSection(''); setFilterPosition(''); } },
            { label: t('attendancePage.section'), val: filterSection, setter: setFilterSection, opts: masterOptions.sections.map(s => ({ v: s, l: s })) },
            { label: t('attendancePage.position'), val: filterPosition, setter: setFilterPosition, opts: masterOptions.positions.map(p => ({ v: p, l: p })) },
            { label: t('attendancePage.filterStatus'), val: filterStatus, setter: setFilterStatus, opts: masterOptions.statuses.map(s => ({ v: s, l: translateStatus(s, i18n.language) || s })) }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => { field.setter(e.target.value); field.onChg?.(); }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none uppercase tracking-wider transition-all shadow-sm truncate"
                >
                  <option value="">{t('attendancePage.semua')}</option>
                  {field.opts.map((o, i) => <option key={i} value={o.v}>{o.l}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Cabang / Lokasi</label>
            <div className="relative">
              <select 
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none uppercase tracking-wider transition-all shadow-sm truncate"
              >
                <option value="">Semua Cabang</option>
                {locations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 xl:col-span-1 sm:col-span-2 lg:col-start-auto">
            <button 
              type="button"
              onClick={handleApply}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="text-[10px] font-bold tracking-wider uppercase">{t('attendancePage.btnApplyFilter')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceFilters;
