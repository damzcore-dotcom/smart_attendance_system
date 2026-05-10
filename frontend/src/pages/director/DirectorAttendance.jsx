import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Download, Loader2, ChevronLeft, ChevronRight,
  Calendar, Filter, CheckCircle2, XCircle, Clock, AlertCircle, ArrowRight
} from 'lucide-react';
import { direkturAPI } from '../../services/api';
import * as XLSX from 'xlsx';

const STATUS_CONFIG = {
  Present:  { label: 'Present', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  Late:     { label: 'Late', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500',  icon: Clock },
  Absent:   { label: 'Absent', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500',   icon: XCircle },
  Mangkir:  { label: 'Missing', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: AlertCircle },
  Sakit:    { label: 'Medical', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500',   icon: AlertCircle },
  Izin:     { label: 'Permit', color: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500',    icon: AlertCircle },
  Cuti:     { label: 'Leave', color: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', icon: AlertCircle },
  Holiday:  { label: 'Holiday', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500',  icon: AlertCircle },
};

const AVATAR_COLORS = [
  'bg-blue-50 text-blue-600 border-blue-100',
  'bg-indigo-50 text-indigo-600 border-indigo-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-amber-50 text-amber-600 border-amber-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-violet-50 text-violet-600 border-violet-100',
];

const PERIODS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
];

const formatTime = (timeString) => {
  if (!timeString || timeString === '-' || timeString === '-- : --') return '-- : --';
  // Sometimes it's ISO, sometimes HH:mm. Assume HH:mm if it doesn't contain T
  if (!timeString.includes('T')) return timeString;
  return new Date(timeString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const DirectorAttendance = () => {
  const [period, setPeriod]         = useState('today');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [deptFilter, setDept]       = useState('');
  const [sectionFilter, setSection] = useState('');
  const [positionFilter, setPosition] = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);

  const [applied, setApplied] = useState({
    period: 'today', startDate: '', endDate: '',
    dept: '', section: '', position: '', status: '', search: '', page: 1,
  });

  const handleApplyFilters = () => {
    setPage(1);
    setApplied({ period, startDate, endDate, dept: deptFilter, section: sectionFilter, position: positionFilter, status: statusFilter, search, page: 1 });
  };

  const { data: optionsData } = useQuery({
    queryKey: ['director-att-options', { period, startDate, endDate, dept: deptFilter, search }],
    queryFn: () => direkturAPI.getAttendanceOptions({ period, startDate, endDate, dept: deptFilter, search }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['director-attendance', applied],
    queryFn: () => direkturAPI.getAttendance({ ...applied, limit: 50 }),
  });

  const departments = optionsData?.data?.departments || [];
  const sections    = optionsData?.data?.sections    || [];
  const positions   = optionsData?.data?.positions   || [];
  const records     = data?.data || [];
  const total       = data?.total || 0;
  const totalPages  = data?.totalPages || 1;

  const summary = {
    total:   records.length,
    hadir:   records.filter(r => r.status?.toUpperCase() === 'PRESENT').length,
    telat:   records.filter(r => r.status?.toUpperCase() === 'LATE').length,
    mangkir: records.filter(r => r.status?.toUpperCase() === 'MANGKIR').length,
    absen:   records.filter(r => r.status?.toUpperCase() === 'ABSENT').length,
  };

  const handleExport = () => {
    const rows = records.map(r => ({
      'NIK': r.nik || r.employeeCode || '-', 
      'Nama': r.name, 
      'Departemen': r.dept,
      'Bagian': r.section || '-', 
      'Jabatan': r.position || '-',
      'Tanggal': new Date(r.date).toLocaleDateString('id-ID'),
      'Check In': formatTime(r.checkIn), 'Check Out': formatTime(r.checkOut),
      'Status': STATUS_CONFIG[r.status]?.label || r.status,
      'Terlambat (menit)': r.lateMinutes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi');
    XLSX.writeFile(wb, `Rekap_Absensi_${applied.period}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Attendance Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Enterprise-wide temporal monitoring (Read-Only)</p>
        </div>
        <button onClick={handleExport} disabled={!records.length}
          className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-30 transition-all active:scale-95">
          <Download className="w-4 h-4" /> Export Data
        </button>
      </div>

      {/* Filter Matrix */}
      <div className="bg-white p-8 border border-slate-200 rounded-2xl shadow-sm">
        <div className="space-y-8">
          <div className="flex flex-col xl:flex-row xl:items-center gap-6 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date Range</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => { setPeriod(p.key); }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 border ${
                    period === p.key ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none" />
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6">
            <div className="xl:col-span-2 space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Search Personnel</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input type="text" placeholder="Name or NIK..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Department</label>
              <div className="relative group">
                <Filter className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select value={deptFilter} onChange={e => { setDept(e.target.value); setSection(''); setPosition(''); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none appearance-none cursor-pointer">
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Section</label>
              <select value={sectionFilter} onChange={e => setSection(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none appearance-none cursor-pointer">
                <option value="">All Sections</option>
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Status</label>
              <select value={statusFilter} onChange={e => setStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none appearance-none cursor-pointer">
                <option value="">All Status</option>
                {Object.keys(STATUS_CONFIG).map(k => (
                  <option key={k} value={k}>{STATUS_CONFIG[k]?.label || k}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button onClick={handleApplyFilters} disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-30 h-[46px] shadow-sm transition-all active:scale-[0.98]">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Matrix */}
      {!isLoading && records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: summary.total, icon: Filter, color: 'text-slate-500', iconBg: 'bg-slate-50 border-slate-200' },
            { label: 'Present', value: summary.hadir, icon: CheckCircle2, color: 'text-emerald-600', iconBg: 'bg-emerald-50 border-emerald-100' },
            { label: 'Late', value: summary.telat, icon: Clock, color: 'text-amber-600', iconBg: 'bg-amber-50 border-amber-100' },
            { label: 'Missing', value: summary.mangkir, icon: AlertCircle, color: 'text-orange-600', iconBg: 'bg-orange-50 border-orange-100' },
            { label: 'Absent', value: summary.absen, icon: XCircle, color: 'text-rose-600', iconBg: 'bg-rose-50 border-rose-100' },
          ].map(card => (
            <div key={card.label} className="bg-white p-5 border border-slate-200 rounded-2xl flex items-center gap-4 shadow-sm hover:border-blue-200 transition-all duration-300">
              <div className={`w-10 h-10 rounded-xl ${card.iconBg} border flex items-center justify-center shrink-0 transition-all duration-300`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">{card.label}</p>
                <p className="text-xl font-bold text-slate-800">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Data Terminal */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Data Feed <span className="text-slate-300 mx-2">|</span> 
              <span className="text-slate-800">{total} Records</span>
            </p>
          </div>
        </div>
        
        <div className="relative overflow-x-auto overflow-y-auto max-h-[calc(100vh-450px)]">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-40 bg-slate-50">
              <tr>
                <th className="px-6 py-4 md:sticky left-0 top-0 z-50 bg-slate-50 border-b border-slate-200 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Personnel</span>
                </th>
                <th className="px-4 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Department</span>
                </th>
                <th className="px-4 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Date</span>
                </th>
                <th className="px-4 py-4 border-b border-slate-200 text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Entry</span>
                </th>
                <th className="px-4 py-4 border-b border-slate-200 text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Exit</span>
                </th>
                <th className="px-4 py-4 border-b border-slate-200 text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Late</span>
                </th>
                <th className="px-6 py-4 md:sticky right-0 top-0 z-50 bg-slate-50 border-b border-slate-200 border-l border-slate-200 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Loading Data...</p>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <Calendar className="w-8 h-8 text-slate-300" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-bold text-slate-800">No Records Found</p>
                        <p className="text-xs text-slate-500">Adjust filters to find data</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : records.map((r, idx) => {
                const initials = r.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                const avatarStyle = AVATAR_COLORS[r.name.charCodeAt(0) % AVATAR_COLORS.length];
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG[Object.keys(STATUS_CONFIG).find(k => k.toUpperCase() === r.status?.toUpperCase())] || { label: r.status, color: 'bg-slate-50 text-slate-600 border-slate-200', icon: AlertCircle };
                return (
                  <tr key={`${r.id}-${idx}`}
                    className="group hover:bg-blue-50/30 transition-colors duration-200">
                    <td className="px-6 py-4 md:sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                      <div className="flex items-center gap-4 min-w-[200px]">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border shrink-0 transition-all duration-300 group-hover:scale-105 ${avatarStyle}`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{r.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{r.nik || r.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-slate-700 truncate max-w-[150px]">{r.dept || 'Uncategorized'}</p>
                        <p className="text-[10px] font-medium text-slate-400">{r.position || 'Staff'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                       <span className="text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                        {new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                       </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-sm font-semibold ${r.checkIn !== '-' ? 'text-slate-800' : 'text-slate-400'}`}>
                        {formatTime(r.checkIn)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-sm font-semibold ${r.checkOut !== '-' ? 'text-slate-800' : 'text-slate-400'}`}>
                        {formatTime(r.checkOut)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {r.status?.toUpperCase() === 'LATE' && r.lateMinutes > 0 ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                          <span className="text-xs font-bold text-rose-600">+{r.lateMinutes}m</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-bold">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 md:sticky right-0 z-20 bg-white group-hover:bg-blue-50/50 transition-colors border-l border-slate-100 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {!isLoading && records.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Page <span className="text-slate-800 font-bold">{applied.page}</span> of <span className="text-slate-800 font-bold">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                disabled={applied.page <= 1}
                onClick={() => setApplied(prev => ({ ...prev, page: prev.page - 1 }))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={applied.page >= totalPages}
                onClick={() => setApplied(prev => ({ ...prev, page: prev.page + 1 }))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectorAttendance;
