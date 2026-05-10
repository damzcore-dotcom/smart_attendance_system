import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Download, Loader2, ChevronLeft, ChevronRight,
  Calendar, Filter, CheckCircle2, XCircle, Clock, AlertCircle
} from 'lucide-react';
import { managerAPI } from '../../services/api';
import * as XLSX from 'xlsx';

const STATUS_CONFIG = {
  Present:  { label: 'Hadir',     color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  Late:     { label: 'Terlambat', color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',  icon: Clock },
  Absent:   { label: 'Absen',     color: 'bg-rose-50 text-rose-700 border-rose-200',           dot: 'bg-rose-500',   icon: XCircle },
  Mangkir:  { label: 'Mangkir',   color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500', icon: AlertCircle },
  Sakit:    { label: 'Sakit',     color: 'bg-blue-50 text-blue-700 border-blue-200',           dot: 'bg-blue-500',   icon: AlertCircle },
  Izin:     { label: 'Izin',      color: 'bg-sky-50 text-sky-700 border-sky-200',              dot: 'bg-sky-500',    icon: AlertCircle },
  Cuti:     { label: 'Cuti',      color: 'bg-purple-50 text-purple-700 border-purple-200',     dot: 'bg-purple-500', icon: AlertCircle },
  Holiday:  { label: 'Libur',     color: 'bg-slate-50 text-slate-600 border-slate-200',        dot: 'bg-slate-400',  icon: AlertCircle },
};

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-600',
  'bg-blue-100 text-blue-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-600',
  'bg-rose-100 text-rose-600',
  'bg-cyan-100 text-cyan-600',
  'bg-indigo-100 text-indigo-600',
  'bg-pink-100 text-pink-600',
];

const PERIODS = [
  { key: 'today',  label: 'Hari Ini' },
  { key: 'week',   label: 'Minggu Ini' },
  { key: 'month',  label: 'Bulan Ini' },
  { key: 'custom', label: 'Kustom' },
];

const formatTime = (timeStr) => {
  if (!timeStr || timeStr === '-') return '-';
  try {
    if (timeStr.includes('T')) {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return timeStr.substring(0, 5);
  } catch (e) {
    return timeStr;
  }
};

const ManagerAttendance = () => {
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
    queryKey: ['manager-att-options', { period, startDate, endDate, dept: deptFilter, search }],
    queryFn: () => managerAPI.getAttendanceOptions({ period, startDate, endDate, dept: deptFilter, search }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['manager-attendance', applied],
    queryFn: () => managerAPI.getAttendance({ ...applied, limit: 50 }),
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
      'NIK': r.nik || r.nik || r.employeeCode || '-', 
      'Nama': r.name, 
      'Departemen': r.dept,
      'Bagian': r.section, 'Jabatan': r.position,
      'Tanggal': new Date(r.date).toLocaleDateString('id-ID'),
      'Check In': formatTime(r.checkIn), 'Check Out': formatTime(r.checkOut),
      'Status': STATUS_CONFIG[r.status]?.label || r.status,
      'Terlambat (menit)': r.lateMinutes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi');
    XLSX.writeFile(wb, `Rekap_Absensi_Manager_${applied.period}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Attendance Records</h1>
          <p className="text-sm text-slate-500 mt-1">Personnel attendance monitoring</p>
        </div>
        <button 
          onClick={handleExport} 
          disabled={!records.length}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-30 transition-all active:scale-95"
        >
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm space-y-6">
        {/* Period */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</label>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {PERIODS.map(p => (
              <button 
                key={p.key} 
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  period === p.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 animate-in slide-in-from-left-4 duration-500">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
              <span className="text-slate-400 text-xs font-medium">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-end">
          <div className="xl:col-span-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Search</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Name, NIK..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 placeholder:text-slate-400"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Department</label>
            <select 
              value={deptFilter} 
              onChange={e => { setDept(e.target.value); setSection(''); setPosition(''); }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Status</label>
            <select 
              value={statusFilter} 
              onChange={e => setStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none"
            >
              <option value="">All Status</option>
              {Object.keys(STATUS_CONFIG).map(k => (
                <option key={k} value={k}>{STATUS_CONFIG[k]?.label || k}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleApplyFilters} 
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white h-[48px] rounded-xl flex items-center justify-center gap-2 font-semibold text-sm disabled:opacity-30 transition-all shadow-sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            Apply
          </button>
        </div>
      </div>

      {/* Summary */}
      {!isLoading && records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: summary.total, icon: Filter, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
            { label: 'Hadir', value: summary.hadir, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Terlambat', value: summary.telat, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
            { label: 'Mangkir', value: summary.mangkir, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
            { label: 'Absen', value: summary.absen, icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
          ].map((card, idx) => (
            <div key={idx} className={`bg-white p-4 border ${card.border} rounded-xl flex items-center gap-4 shadow-sm`}>
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800 font-bold">{records.length}</span> records — Page <span className="text-blue-600">{applied.page}</span> of {totalPages}
          </p>
          <div className="flex gap-2">
            <button disabled={applied.page <= 1} onClick={() => setApplied(prev => ({ ...prev, page: prev.page - 1 }))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button disabled={applied.page >= totalPages} onClick={() => setApplied(prev => ({ ...prev, page: prev.page + 1 }))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-4 md:sticky left-0 bg-slate-50 z-10 border-r border-slate-100">Personnel</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4 text-center">Date</th>
                <th className="px-6 py-4 text-center">Check In</th>
                <th className="px-6 py-4 text-center">Check Out</th>
                <th className="px-6 py-4 text-center">Late</th>
                <th className="px-6 py-4 md:sticky right-0 bg-slate-50 z-10 border-l border-slate-100 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan="7" className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <p className="text-sm text-slate-400">Loading...</p>
                  </div>
                </td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="7" className="py-20 text-center">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No records found</p>
                </td></tr>
              ) : records.map((r, idx) => {
                const initials = r.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                const avatarColor = AVATAR_COLORS[r.name.charCodeAt(0) % AVATAR_COLORS.length];
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG[Object.keys(STATUS_CONFIG).find(k => k.toUpperCase() === r.status?.toUpperCase())] || { label: r.status, color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: AlertCircle };
                const Icon = cfg.icon;

                return (
                  <tr key={`${r.id}-${idx}`} className="group hover:bg-blue-50/50 transition-colors">
                    <td className="px-6 py-4 md:sticky left-0 bg-white group-hover:bg-blue-50/50 z-10 border-r border-slate-50">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${avatarColor}`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.nik || r.employeeCode || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{r.dept || '-'}</span>
                      <p className="text-xs text-slate-400">{r.section || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">{new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4 text-center text-sm font-medium text-slate-700">{formatTime(r.checkIn)}</td>
                    <td className="px-6 py-4 text-center text-sm font-medium text-slate-700">{formatTime(r.checkOut)}</td>
                    <td className="px-6 py-4 text-center">
                      {r.status?.toUpperCase() === 'LATE' && r.lateMinutes > 0 ? (
                        <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-200">{r.lateMinutes}m</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 md:sticky right-0 bg-white group-hover:bg-blue-50/50 z-10 border-l border-slate-50 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${cfg.color}`}>
                        <Icon className="w-3.5 h-3.5" />
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

export default ManagerAttendance;
