import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { attendanceAPI } from '../../services/api';
import { 
  Calendar, 
  Search, 
  Download, 
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Scan
} from 'lucide-react';

const Attendance = () => {
  const [filterDate, setFilterDate] = useState('Today');
  const [filterDept, setFilterDept] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', { period: filterDate, dept: filterDept, search: searchQuery }],
    queryFn: () => attendanceAPI.getAll({ period: filterDate, dept: filterDept, search: searchQuery }),
  });

  const filteredData = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Records</h1>
          <p className="text-slate-500 mt-1">Review and audit daily attendance logs.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            {['Today', 'This Week', 'This Month', 'Custom'].map((period) => (
              <button
                key={period}
                onClick={() => setFilterDate(period)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  filterDate === period ? 'bg-primary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search employee..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-100 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select 
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-medium cursor-pointer"
            >
              <option value="All">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Marketing">Marketing</option>
              <option value="HR">HR</option>
              <option value="Operations">Operations</option>
            </select>
            <button className="p-2 border border-slate-100 rounded-lg text-slate-500 hover:bg-slate-50">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Check In</th>
              <th className="px-6 py-4">Check Out</th>
              <th className="px-6 py-4">Verification</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-500">Loading attendance data...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-500">No attendance records found.</td></tr>
              ) : filteredData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${row.name}`} alt="avatar" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-800 text-sm block">{row.name}</span>
                      <span className="text-[10px] text-slate-500">{row.dept}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">{row.date}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-slate-700">{row.checkIn}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-300" />
                    <span className="text-sm font-bold text-slate-700">{row.checkOut}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${row.status === 'Late' ? 'text-amber-500' : 'text-slate-400'}`}>
                      {row.status === 'Late' ? `${row.lateMinutes} min` : '0 min'}
                    </span>
                    <span className="text-[10px] text-slate-400">Late Time</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                    <Scan className="w-3.5 h-3.5" />
                    {row.mode}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                    row.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                    row.status === 'Late' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    'bg-rose-50 text-rose-600 border border-rose-100'
                  }`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;
