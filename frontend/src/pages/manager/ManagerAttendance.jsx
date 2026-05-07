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
  'bg-violet-100 text-violet-600 border-violet-200',
  'bg-blue-100 text-blue-600 border-blue-200',
  'bg-emerald-100 text-emerald-600 border-emerald-200',
  'bg-amber-100 text-amber-600 border-amber-200',
  'bg-rose-100 text-rose-600 border-rose-200',
  'bg-cyan-100 text-cyan-600 border-cyan-200',
  'bg-indigo-100 text-indigo-600 border-indigo-200',
  'bg-pink-100 text-pink-600 border-pink-200',
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
    // If it's an ISO string (contains T and Z)
    if (timeStr.includes('T')) {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    // If it's already HH:mm:ss format
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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rekap Absensi Karyawan</h1>
          <p className="text-slate-500 mt-1">Data kehadiran departemen — view only</p>
        </div>
        <button onClick={handleExport} disabled={!records.length}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm disabled:opacity-40 transition-all">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* Filter Card */}
      <div className="card p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Periode:</label>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => { setPeriod(p.key); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  period === p.key ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100'
                }`}>
                {p.label}
              </button>
            ))}
            {period === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-slate-600" />
                <span className="text-slate-400 text-xs font-bold">s/d</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-slate-600" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <div className="flex-1 min-w-[240px] space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Cari Karyawan</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Nama atau NIK..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-600" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Departemen</label>
                <select value={deptFilter} onChange={e => { setDept(e.target.value); setSection(''); setPosition(''); }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all hover:border-slate-300">
                  <option value="">Semua Departemen</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Bagian</label>
                <select value={sectionFilter} onChange={e => setSection(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all hover:border-slate-300">
                  <option value="">Semua</option>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Jabatan</label>
                <select value={positionFilter} onChange={e => setPosition(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all hover:border-slate-300">
                  <option value="">Semua</option>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Status</label>
                <select value={statusFilter} onChange={e => setStatus(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all hover:border-slate-300">
                  <option value="">Semua Status</option>
                  {Object.keys(STATUS_CONFIG).map(k => (
                    <option key={k} value={k}>{STATUS_CONFIG[k]?.label || k}</option>
                  ))}
                </select>
              </div>

              <div>
                <button onClick={handleApplyFilters} disabled={isLoading}
                  className="w-full bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 h-[42px]">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 transition-transform group-hover:scale-110" />}
                  Tampilkan
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>

      {!isLoading && records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sticky top-0 z-50 bg-slate-50/95 backdrop-blur-md py-3 shadow-sm -mx-1 px-1">
          {[
            { label: 'Total', value: summary.total, icon: Filter, color: 'border-slate-100', iconBg: 'bg-slate-50 border-slate-100', iconColor: 'text-slate-400', textColor: 'text-slate-800', labelColor: 'text-slate-400' },
            { label: 'Hadir', value: summary.hadir, icon: CheckCircle2, color: 'border-emerald-100', iconBg: 'bg-emerald-50 border-emerald-100', iconColor: 'text-emerald-500', textColor: 'text-emerald-600', labelColor: 'text-emerald-500' },
            { label: 'Terlambat', value: summary.telat, icon: Clock, color: 'border-amber-100', iconBg: 'bg-amber-50 border-amber-100', iconColor: 'text-amber-500', textColor: 'text-amber-600', labelColor: 'text-amber-500' },
            { label: 'Mangkir', value: summary.mangkir, icon: AlertCircle, color: 'border-orange-100', iconBg: 'bg-orange-50 border-orange-100', iconColor: 'text-orange-500', textColor: 'text-orange-600', labelColor: 'text-orange-500' },
            { label: 'Tidak Hadir', value: summary.absen, icon: XCircle, color: 'border-rose-100', iconBg: 'bg-rose-50 border-rose-100', iconColor: 'text-rose-500', textColor: 'text-rose-600', labelColor: 'text-rose-500' },
          ].map(card => (
            <div key={card.label} className={`bg-white border ${card.color} rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all`}>
              <div className={`w-9 h-9 rounded-xl ${card.iconBg} border flex items-center justify-center shrink-0`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${card.labelColor}`}>{card.label}</p>
                <p className={`text-xl font-black ${card.textColor}`}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden bg-white">
        <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between bg-white">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">
            Data Absensi <span className="text-slate-300 mx-2">|</span> 
            Menampilkan <span className="text-slate-800 font-black">{records.length}</span> dari <span className="text-slate-800 font-black">{total}</span> record
          </p>
        </div>
        <div className="relative overflow-auto max-h-[calc(100vh-340px)] scrollbar-thin">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-40">
              <tr className="bg-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest">
                <th className="px-3 py-4 sticky left-0 top-0 z-50 bg-slate-800 border-r border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">Karyawan</th>
                <th className="px-3 py-4 bg-slate-800">Departemen</th>
                <th className="px-3 py-4 bg-slate-800">Bagian</th>
                <th className="px-3 py-4 bg-slate-800">Jabatan</th>
                <th className="px-3 py-4 bg-slate-800">Tanggal</th>
                <th className="px-3 py-4 bg-slate-800 text-center">Masuk</th>
                <th className="px-3 py-4 bg-slate-800 text-center">Keluar</th>
                <th className="px-3 py-4 bg-slate-800 text-center">Terlambat</th>
                <th className="px-3 py-4 sticky right-0 top-0 z-50 bg-slate-800 border-l border-slate-700 text-center shadow-[-2px_0_5px_rgba(0,0,0,0.1)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-slate-400 font-medium">Memuat data kehadiran...</p>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                        <Calendar className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-500">Tidak ada data kehadiran</p>
                      <p className="text-xs text-slate-400">Coba ubah filter atau periode</p>
                    </div>
                  </td>
                </tr>
              ) : records.map((r, idx) => {
                const initials = r.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                const avatarColor = AVATAR_COLORS[r.name.charCodeAt(0) % AVATAR_COLORS.length];
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG[Object.keys(STATUS_CONFIG).find(k => k.toUpperCase() === r.status?.toUpperCase())] || { label: r.status, color: 'bg-slate-50 text-slate-500 border-slate-100', icon: AlertCircle };
                return (
                  <tr key={`${r.id}-${idx}`}
                    className={`group transition-colors duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-primary/5`}>
                    <td className={`px-3 py-3.5 border-b border-slate-100 sticky left-0 z-20 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fcfdfe]'} group-hover:bg-primary/5 border-r border-slate-50`}>
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] border shrink-0 ${avatarColor}`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-xs">{r.name}</p>
                          <p className="text-[9px] text-slate-400 font-medium">{r.nik || r.nik || r.employeeCode || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                       {r.dept || '-'}
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                      {r.section || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100 text-[11px] font-semibold text-slate-500 whitespace-nowrap max-w-[120px] truncate">
                      {r.position || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                         {new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100 text-center">
                      <span className={`text-xs font-bold ${r.checkIn !== '-' ? 'text-slate-800' : 'text-slate-300'}`}>
                        {formatTime(r.checkIn)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100 text-center">
                      <span className={`text-xs font-bold ${r.checkOut !== '-' ? 'text-slate-800' : 'text-slate-300'}`}>
                        {formatTime(r.checkOut)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 border-b border-slate-100 text-center">
                      {r.status?.toUpperCase() === 'LATE' && r.lateMinutes > 0 ? (
                        <span className="text-[11px] font-black text-amber-600 whitespace-nowrap">{r.lateMinutes} mnt</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-3.5 border-b border-slate-100 sticky right-0 z-20 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fcfdfe]'} group-hover:bg-primary/5 border-l border-slate-50 text-center`}>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && records.length > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400 font-medium">
              Halaman <span className="font-bold text-slate-600">{applied.page}</span> dari <span className="font-bold text-slate-600">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                disabled={applied.page <= 1}
                onClick={() => setApplied(prev => ({ ...prev, page: prev.page - 1 }))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                disabled={applied.page >= totalPages}
                onClick={() => setApplied(prev => ({ ...prev, page: prev.page + 1 }))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerAttendance;
