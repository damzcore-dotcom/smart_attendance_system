import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Download, Loader2, ChevronLeft, ChevronRight,
  Calendar, Filter, CheckCircle2, XCircle, Clock, AlertCircle,
  ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, ArrowRight
} from 'lucide-react';
import { direkturAPI } from '../../services/api';
import * as XLSX from 'xlsx';

const STATUS_MAP = {
  'PRESENT': 'Present',
  'LATE': 'Late',
  'MANGKIR': 'Mangkir',
  'HOLIDAY': 'Holiday',
  'CUTI': 'Leave',
  'SAKIT': 'Medical',
  'IZIN': 'Permit',
  'ABSENT': 'Absent'
};

const STATUS_CONFIG = {
  'PRESENT': { label: 'Present', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  'LATE': { label: 'Late', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', icon: Clock },
  'ABSENT': { label: 'Absent', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', icon: XCircle },
  'MANGKIR': { label: 'Mangkir', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: AlertCircle },
  'SAKIT': { label: 'Medical', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', icon: AlertCircle },
  'IZIN': { label: 'Permit', color: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500', icon: AlertCircle },
  'CUTI': { label: 'Leave', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: AlertCircle },
  'HOLIDAY': { label: 'Holiday', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500', icon: AlertCircle },
};

const AVATAR_COLORS = [
  'bg-blue-50 text-blue-600 border-blue-100',
  'bg-indigo-50 text-indigo-600 border-indigo-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-amber-50 text-amber-600 border-amber-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-violet-50 text-violet-600 border-violet-100',
];

const formatTime = (timeStr) => {
  if (!timeStr || timeStr === '-' || timeStr === '-- : --') return '-- : --';
  if (!timeStr.includes('T')) return timeStr;
  return new Date(timeStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const formatLateAccumulation = (minutes) => {
  if (!minutes || minutes <= 0) return '0 minutes';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours} hr ${mins > 0 ? `${mins} min` : ''}`;
  return `${mins} minutes`;
};

const DirectorAttendance = () => {
  const [appliedFilters, setAppliedFilters] = useState({
    page: 1,
    period: 'today',
    startDate: '',
    endDate: '',
    dept: '',
    section: '',
    position: '',
    status: '',
    search: '',
    limit: 50,
    sortBy: 'date',
    order: 'desc'
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-attendance', appliedFilters],
    queryFn: () => direkturAPI.getAttendance(appliedFilters),
    keepPreviousData: true
  });

  const records = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const summary = data?.summary || {};

  const handleApplyFilters = (newFilters) => {
    setAppliedFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handleSort = (key) => {
    const newOrder = appliedFilters.sortBy === key && appliedFilters.order === 'asc' ? 'desc' : 'asc';
    setAppliedFilters(prev => ({ ...prev, sortBy: key, order: newOrder, page: 1 }));
  };

  const SortIcon = ({ column }) => {
    if (appliedFilters.sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return appliedFilters.order === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  const handleExport = () => {
    const sortedRecords = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
    const rows = sortedRecords.map(r => {
      const penalty = (r.status === 'MANGKIR' || r.status === 'MISSING') ? 30 : 0;
      return {
        'NIK': r.employeeCode,
        'Nama': r.name,
        'Departemen': r.dept,
        'Bagian': r.section || '-',
        'Jabatan': r.position || '-',
        'Tanggal': new Date(r.date).toLocaleDateString('id-ID'),
        'Check In': formatTime(r.checkIn),
        'Check Out': formatTime(r.checkOut),
        'Status': STATUS_MAP[r.status] || r.status,
        'Terlambat (menit)': (r.lateMinutes || 0) + penalty,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi');
    XLSX.writeFile(wb, `Rekap_Absensi_Director_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const isSingleEmployee = !!appliedFilters.search;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Attendance Analytics</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Enterprise-wide temporal monitoring (Director View)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport} 
            disabled={!records.length}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-30 transition-all active:scale-95 uppercase tracking-wider"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
        </div>
      </div>

      <FilterBar 
        onApply={handleApplyFilters} 
        isLoading={isLoading} 
        currentSearch={appliedFilters.search}
      />

      {/* Summary Matrix */}
      {!isLoading && records.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {[
              { label: 'TOTAL DATA', sub: 'ALL RECORDS', value: total, icon: Filter, color: 'text-blue-600', bg: 'bg-blue-50', filter: '' },
              { label: 'PRESENT', sub: 'ON TIME', value: summary.hadir, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', filter: 'PRESENT' },
              { label: 'LATE', sub: 'TIME VIOLATION', value: summary.telat, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', filter: 'LATE' },
              { label: 'MANGKIR', sub: 'NO EXPLANATION', value: summary.mangkir, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', filter: 'MANGKIR' },
              { label: 'HOLIDAY', sub: 'SUNDAY / HOLIDAY', value: summary.holiday || 0, icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50', filter: 'HOLIDAY' },
              { label: 'TOTAL LATE', sub: 'TIME ACCUMULATION', value: formatLateAccumulation(summary.totalLate), icon: Clock, color: 'text-rose-500', bg: 'bg-rose-50/50', filter: '' },
              { label: 'OTHERS', sub: 'LEAVE/MED/PERMIT', value: (summary.cuti || 0) + (summary.sakit || 0) + (summary.izin || 0), icon: XCircle, color: 'text-slate-600', bg: 'bg-slate-100', filter: 'OTHER' },
            ].map((card, idx) => {
              const isActive = appliedFilters.status === card.filter && card.filter !== '';
              return (
                <button 
                  key={idx} 
                  onClick={() => card.filter && handleApplyFilters({ status: isActive ? '' : card.filter })}
                  className={`group relative bg-white p-4 rounded-2xl border transition-all text-left active:scale-95 shadow-sm hover:shadow-md ${
                    isActive ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200 hover:border-blue-200'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full ${card.bg} flex items-center justify-center mb-4 transition-transform group-hover:scale-110 shadow-sm border border-white`}>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">{card.label}</p>
                    <p className={`font-black text-slate-800 leading-none ${card.label === 'TOTAL LATE' ? 'text-lg' : 'text-xl'}`}>{card.value}</p>
                    <div className="mt-3 pt-3 border-t border-slate-50">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter truncate">{card.sub}</p>
                    </div>
                  </div>
                  {isActive && <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                </button>
              );
            })}
          </div>

          {/* Personal Accumulation Card */}
          {isSingleEmployee && records.length > 0 && (
            <div className="bg-white border-2 border-rose-500 rounded-[2rem] p-8 relative overflow-hidden shadow-xl shadow-rose-100/50 animate-in slide-in-from-bottom-4 duration-700">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center shadow-inner border border-rose-100 group">
                    <Clock className="w-10 h-10 text-rose-500 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">PERSONAL LATE ACCUMULATION</p>
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-5xl font-black text-slate-800 tracking-tighter">
                        {formatLateAccumulation(summary.totalLate)}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 text-rose-600 font-bold text-xs mt-3 bg-rose-50 px-3 py-1.5 rounded-full w-fit">
                      <AlertCircle className="w-3.5 h-3.5" />
                      INCLUDES MANGKIR PENALTY (+30 MIN/DAY)
                    </div>
                  </div>
                </div>
                
                <div className="h-24 w-px bg-slate-100 hidden md:block" />

                <div className="text-right flex flex-col items-end">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">EMPLOYEE PROFILE</p>
                  <h3 className="text-4xl font-black text-slate-800 uppercase tracking-tight">
                    {records[0].name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">{records[0].employeeCode}</span>
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-[10px] font-black text-blue-600 uppercase tracking-widest border border-blue-100">{records[0].dept}</span>
                  </div>
                </div>
              </div>
              
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-rose-50 rounded-full opacity-50 blur-3xl" />
              <div className="absolute -left-10 -top-10 w-40 h-40 bg-rose-50 rounded-full opacity-50 blur-3xl" />
            </div>
          )}
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Showing <span className="text-slate-800">{records.length}</span> records <span className="text-slate-300 mx-2">|</span> 
            Page <span className="text-blue-600">{appliedFilters.page}</span> of {totalPages}
          </p>
          <div className="flex gap-2">
            <button 
              disabled={appliedFilters.page <= 1} 
              onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page - 1 }))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              disabled={appliedFilters.page >= totalPages} 
              onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page + 1 }))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[800px] custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap border-separate border-spacing-0">
            <thead className="sticky top-0 z-40 bg-slate-50">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 md:sticky left-0 top-0 z-50 bg-slate-50 border-b border-slate-200 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-2 group/btn">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Personnel</span>
                    <SortIcon column="name" />
                  </button>
                </th>
                <th className="px-4 py-3 border-b border-slate-200">
                  <button onClick={() => handleSort('dept')} className="flex items-center gap-2 group/btn">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Department</span>
                    <SortIcon column="dept" />
                  </button>
                </th>
                <th className="px-4 py-3 border-b border-slate-200">
                  <button onClick={() => handleSort('date')} className="flex items-center gap-2 group/btn">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</span>
                    <SortIcon column="date" />
                  </button>
                </th>
                <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry</th>
                <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Exit</th>
                <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Late</th>
                <th className="px-6 py-3 md:sticky right-0 top-0 z-50 bg-slate-50 border-b border-slate-200 border-l border-slate-200 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-2 mx-auto group/btn">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</span>
                    <SortIcon column="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan="7" className="py-24 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Synchronizing Data Feed...</p>
                  </div>
                </td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="7" className="py-24 text-center">
                  <div className="flex flex-col items-center gap-5 opacity-40">
                    <Calendar className="w-16 h-16 text-slate-300" />
                    <p className="text-base font-bold text-slate-800">No matching logs found</p>
                  </div>
                </td></tr>
              ) : records.map((r, idx) => {
                const initials = r.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                const avatarColor = AVATAR_COLORS[r.name.charCodeAt(0) % AVATAR_COLORS.length];
                const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: AlertCircle };
                const Icon = cfg.icon;

                return (
                  <tr key={`${r.id}-${idx}`} className="group hover:bg-blue-50/40 transition-colors duration-200">
                    <td className="px-6 py-2 md:sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] border shrink-0 ${avatarColor}`}>
                          {initials}
                        </div>
                        <div>
                          <p 
                            onClick={() => handleApplyFilters({ search: r.name })}
                            className="font-bold text-slate-800 text-sm uppercase tracking-tight leading-none cursor-pointer hover:text-blue-600 hover:underline decoration-blue-500/30 transition-all"
                          >
                            {r.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{r.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-bold text-slate-700 block truncate max-w-[150px]">{r.dept || '-'}</span>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{r.position || '-'}</p>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                       <span className="text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                        {new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                       </span>
                    </td>
                    <td className="px-4 py-2 text-center text-sm font-bold text-slate-800">{formatTime(r.checkIn)}</td>
                    <td className="px-4 py-2 text-center text-sm font-bold text-slate-800">{formatTime(r.checkOut)}</td>
                    <td className="px-4 py-2 text-center">
                      {r.status === 'LATE' && r.lateMinutes > 0 ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                          <span className="text-xs font-bold text-rose-600">+{r.lateMinutes}m</span>
                        </div>
                      ) : (r.status === 'MANGKIR' || r.status === 'MISSING') ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                          <span className="text-xs font-bold text-slate-500">+{30}m</span>
                        </div>
                      ) : (
                        <span className="text-slate-200 font-black">—</span>
                      )}
                    </td>
                    <td className="px-6 py-2 md:sticky right-0 z-20 bg-white group-hover:bg-blue-50/50 transition-colors border-l border-slate-100 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-component FilterBar ─────────────────────────────────

const FilterBar = ({ onApply, isLoading, currentSearch }) => {
  const [filterDate, setFilterDate] = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentSearch !== undefined) setSearchQuery(currentSearch);
  }, [currentSearch]);

  const { data: optionsData } = useQuery({
    queryKey: ['director-att-options-reactive', { period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: searchQuery }],
    queryFn: () => direkturAPI.getAttendanceOptions({ period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: searchQuery }),
    staleTime: 30000,
  });

  const masterOptions = optionsData?.data || { departments: [], sections: [], positions: [], statuses: [] };

  const handleApply = () => {
    const periodMap = { 'Today': 'today', 'This Week': 'week', 'This Month': 'month', 'Custom': 'custom' };
    onApply({
      page: 1,
      period: periodMap[filterDate],
      startDate: customStart,
      endDate: customEnd,
      dept: filterDept,
      section: filterSection,
      position: filterPosition,
      status: filterStatus,
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
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TEMPORAL SCOPE:</label>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            {['Today', 'This Week', 'This Month', 'Custom'].map((period) => (
              <button
                key={period}
                onClick={() => setFilterDate(period)}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                  filterDate === period 
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200 relative z-10' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {period === 'Today' ? 'Today' : period === 'This Week' ? 'Week' : period === 'This Month' ? 'Month' : 'Manual'}
              </button>
            ))}
          </div>

          {filterDate === 'Custom' && (
            <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
              <input 
                type="date" 
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
              />
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">PERSONNEL FILTER</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="ID SEQUENCE..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 shadow-sm transition-all"
              />
            </div>
          </div>

          {[
            { label: 'DEPARTMENT', val: filterDept, setter: setFilterDept, opts: masterOptions.departments.map(d => ({ v: d.name, l: d.name })), onChg: () => { setFilterSection(''); setFilterPosition(''); } },
            { label: 'SECTION', val: filterSection, setter: setFilterSection, opts: (masterOptions.sections || []).map(s => ({ v: s, l: s })) },
            { label: 'RANK', val: filterPosition, setter: setFilterPosition, opts: (masterOptions.positions || []).map(p => ({ v: p, l: p })) },
            { label: 'STATUS PROTOCOL', val: filterStatus, setter: setFilterStatus, opts: (masterOptions.statuses || []).map(s => ({ v: s, l: STATUS_MAP[s] || s })) }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => { field.setter(e.target.value); field.onChg?.(); }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm truncate transition-all"
                >
                  <option value="">GLOBAL ARCHIVE</option>
                  {field.opts.map((o, i) => <option key={i} value={o.v}>{o.l}</option>)}
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          ))}

          <button 
            onClick={handleApply}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white h-[45px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            COMMIT FILTERS
          </button>
        </div>
      </div>
    </div>
  );
};

export default DirectorAttendance;
