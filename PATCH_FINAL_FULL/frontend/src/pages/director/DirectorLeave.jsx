import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, Download, Loader2, ChevronLeft, ChevronRight,
  Filter, CheckCircle2, XCircle, Clock, AlertCircle, FileText, Calendar,
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { direkturAPI } from '../../services/api';
import * as XLSX from 'xlsx';

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  color: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200',       icon: XCircle },
};

const DirectorLeave = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', order: 'desc' });

  const { data, isLoading } = useQuery({
    queryKey: ['director-leave', { status, search, dept, page, sortBy: sortConfig.key, order: sortConfig.order }],
    queryFn: () => direkturAPI.getLeave({ status, search, dept, page, limit: 20, sortBy: sortConfig.key, order: sortConfig.order }),
  });

  const { data: deptData } = useQuery({
    queryKey: ['director-depts'],
    queryFn: () => direkturAPI.getDepartments(),
  });

  const records = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const departments = deptData?.data || [];

  const handleSort = (key) => {
    const newOrder = sortConfig.key === key && sortConfig.order === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, order: newOrder });
    setPage(1);
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortConfig.order === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  const handleExport = () => {
    const rows = records.map(r => ({
      'NIK': r.employeeCode,
      'Nama': r.name,
      'Departemen': r.department,
      'Jenis Cuti': r.type,
      'Mulai': new Date(r.startDate).toLocaleDateString('id-ID'),
      'Selesai': new Date(r.endDate).toLocaleDateString('id-ID'),
      'Durasi': r.duration + ' hari',
      'Alasan': r.reason,
      'Status': STATUS_CONFIG[r.status]?.label || r.status
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leave Reports');
    XLSX.writeFile(wb, `Leave_Review_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Leave Review</h1>
          <p className="text-sm text-slate-500 mt-1">Institutional leave auditing</p>
        </div>
        <button 
          onClick={handleExport}
          disabled={!records.length}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-30 transition-all active:scale-95"
        >
          <Download className="w-4 h-4" /> Export Records
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Search</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Name or NIK..." 
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Status</label>
            <select 
              value={status} 
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 appearance-none cursor-pointer"
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Department</label>
            <select 
              value={dept} 
              onChange={e => { setDept(e.target.value); setPage(1); }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 appearance-none cursor-pointer"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800 font-bold">{total}</span> records
          </p>
        </div>
        
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-400px)]">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-2 group/btn">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover/btn:text-blue-600 transition-colors">Personnel</span>
                    <SortIcon column="name" />
                  </button>
                </th>
                <th className="px-4 py-4">
                  <button onClick={() => handleSort('type')} className="flex items-center gap-2 group/btn">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover/btn:text-blue-600 transition-colors">Type</span>
                    <SortIcon column="type" />
                  </button>
                </th>
                <th className="px-4 py-4">
                  <button onClick={() => handleSort('startDate')} className="flex items-center gap-2 group/btn">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover/btn:text-blue-600 transition-colors">Date Range</span>
                    <SortIcon column="startDate" />
                  </button>
                </th>
                <th className="px-4 py-4 text-center">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</span>
                </th>
                <th className="px-4 py-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</span>
                </th>
                <th className="px-6 py-4 text-center">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-2 mx-auto group/btn">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover/btn:text-blue-600 transition-colors">Status</span>
                    <SortIcon column="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-20">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                      <p className="text-sm text-slate-400">Loading...</p>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-20">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-500">No records found</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : records.map((r) => {
                const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-slate-50 text-slate-600 border-slate-200' };
                return (
                  <tr key={r.id} className="group hover:bg-blue-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4 min-w-[200px]">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs group-hover:scale-105 transition-transform">
                          {(r.name || 'E').charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{r.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{r.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                       <span className="px-3 py-1 rounded-lg bg-slate-50 text-slate-600 text-xs font-semibold border border-slate-200">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {new Date(r.startDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                        <span className="text-slate-300">→</span>
                        {new Date(r.endDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-semibold text-slate-700 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">{r.duration || 1}d</span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs text-slate-500 max-w-[180px] truncate italic">"{r.reason}"</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && records.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Page <span className="text-slate-800 font-bold">{page}</span> of <span className="text-slate-800 font-bold">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-20 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-20 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectorLeave;
