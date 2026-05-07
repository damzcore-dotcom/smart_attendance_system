import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, Download, Loader2, ChevronLeft, ChevronRight,
  Filter, CheckCircle2, XCircle, Clock, AlertCircle, FileText, Calendar
} from 'lucide-react';
import { direkturAPI } from '../../services/api';
import * as XLSX from 'xlsx';

const STATUS_CONFIG = {
  PENDING:  { label: 'Waiting',  color: 'bg-amber-50 text-amber-700 border-amber-200',  icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200',      icon: XCircle },
};

const DirectorLeave = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['director-leave', { status, search, dept, page }],
    queryFn: () => direkturAPI.getLeave({ status, search, dept, page, limit: 20 }),
  });

  const { data: deptData } = useQuery({
    queryKey: ['director-depts'],
    queryFn: () => direkturAPI.getDepartments(),
  });

  const records = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const departments = deptData?.data || [];

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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Review</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Review and monitor employee leave requests — executive view</p>
        </div>
        <button 
          onClick={handleExport}
          disabled={!records.length}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-40 transition-all active:scale-95"
        >
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* Filter Card */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[240px] space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Search Employee</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Name or NIK..." 
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5 min-w-[160px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Status</label>
              <select 
                value={status} 
                onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-bold text-slate-700 cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="PENDING">Waiting</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div className="space-y-1.5 min-w-[160px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Department</label>
              <select 
                value={dept} 
                onChange={e => { setDept(e.target.value); setPage(1); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-bold text-slate-700 cursor-pointer"
              >
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">
            Showing <span className="text-slate-900">{records.length}</span> of <span className="text-slate-900">{total}</span> requests
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Period</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-medium">Loading requests...</p>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-20">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">No leave requests found</p>
                  </td>
                </tr>
              ) : records.map((r) => {
                const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-slate-100 text-slate-500' };
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {(r.name || 'E').charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{r.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{r.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wide border border-indigo-100">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(r.startDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                        <span className="text-slate-300">—</span>
                        {new Date(r.endDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-slate-800">{r.duration} Days</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 max-w-[200px] truncate italic">"{r.reason}"</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${cfg.color}`}>
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400 font-medium">
              Page <span className="font-bold text-slate-600">{page}</span> of <span className="font-bold text-slate-600">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectorLeave;
