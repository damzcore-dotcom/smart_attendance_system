import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, attendanceAPI } from '../../services/api';
import { 
  Users, Save, Calendar, Search, Filter, Loader2, AlertCircle, Clock 
} from 'lucide-react';

const OvertimeSPL = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  
  // Local state for exactly what we type into inputs
  const [overtimeInputs, setOvertimeInputs] = useState({}); // { empId: "2.5" }

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-spl', deptFilter],
    queryFn: () => employeeAPI.getAll({ limit: 1000, status: 'ACTIVE', dept: deptFilter === 'All' ? '' : deptFilter }),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance-for-spl', selectedDate],
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000 }),
  });

  // Pre-fill inputs when attendance data loads
  useEffect(() => {
    if (attendanceData?.data && employeesData?.data) {
      const initialInputs = {};
      attendanceData.data.forEach(r => {
        // Only fetch if they have overtime
        if (r.overtimeHours) {
          const emp = employeesData.data.find(e => e.id === r.id || e.employeeCode === r.employeeCode || e.name === r.name);
          if (emp) {
            initialInputs[emp.id] = r.overtimeHours.toString();
          }
        }
      });
      setOvertimeInputs(initialInputs);
    }
  }, [attendanceData, employeesData]);

  const handleInputChange = (empId, val) => {
    setOvertimeInputs(prev => ({ ...prev, [empId]: val }));
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.bulkOvertime(payload),
    onSuccess: (res) => {
      alert(res.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-for-spl'] });
    },
    onError: (err) => {
      alert(`Gagal menyimpan: ${err.message}`);
    }
  });

  const handleSaveAll = () => {
    const records = [];
    Object.keys(overtimeInputs).forEach(empId => {
      const val = overtimeInputs[empId];
      if (val !== undefined && val !== null && val !== '') {
        records.push({
          employeeId: parseInt(empId),
          overtimeHours: parseFloat(val)
        });
      }
    });

    if (records.length === 0) {
      alert("Tidak ada data lembur yang diinput. Isi setidaknya 1.");
      return;
    }

    if (window.confirm(`Simpan lembur untuk ${records.length} karyawan di tanggal ${selectedDate}?`)) {
      saveMutation.mutate({
        date: selectedDate,
        records
      });
    }
  };

  const filteredEmployees = (employeesData?.data || []).filter(e => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return e.name.toLowerCase().includes(lower) || e.employeeCode.toLowerCase().includes(lower);
  });

  const isLoading = empLoading || attLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Header */}
      <div className="px-1 space-y-3">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <Clock className="w-3 h-3 text-slate-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Payroll Control</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">SPL Massal</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              Manajemen Lembur
            </h1>
            <p className="text-xs text-slate-500 mt-1">Input massal jam lembur akurat per-individu (Spreadsheet Mode)</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-center">
        <div className="flex items-center gap-3 w-full lg:w-1/3">
           <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
             <Calendar className="w-5 h-5 text-indigo-600" />
           </div>
           <div className="flex-1">
             <label className="text-[10px] font-bold text-slate-500 uppercase">Tanggal Target</label>
             <input 
               type="date"
               value={selectedDate}
               onChange={(e) => setSelectedDate(e.target.value)}
               className="w-full text-sm font-semibold border-b border-slate-200 pb-1 focus:outline-none focus:border-indigo-600 bg-transparent"
             />
           </div>
        </div>

        <div className="h-10 w-px bg-slate-200 hidden lg:block" />

        <div className="flex items-center gap-3 w-full lg:w-1/3">
           <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
             <Filter className="w-5 h-5 text-slate-500" />
           </div>
           <div className="flex-1">
             <label className="text-[10px] font-bold text-slate-500 uppercase">Departemen</label>
             <select 
               value={deptFilter}
               onChange={(e) => setDeptFilter(e.target.value)}
               className="w-full text-sm font-semibold border-b border-slate-200 pb-1 focus:outline-none focus:border-indigo-600 bg-transparent"
             >
               <option value="">Semua Departemen</option>
               <option value="Produksi">Produksi</option>
               <option value="Sewing">Sewing</option>
               <option value="Cutting">Cutting</option>
               <option value="Finishing">Finishing</option>
               <option value="HRD">HRD</option>
             </select>
           </div>
        </div>

        <div className="h-10 w-px bg-slate-200 hidden lg:block" />

        <div className="flex items-center gap-3 w-full lg:w-1/3">
           <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
             <Search className="w-5 h-5 text-slate-500" />
           </div>
           <div className="flex-1">
             <label className="text-[10px] font-bold text-slate-500 uppercase">Cari Karyawan</label>
             <input 
               type="text"
               placeholder="Ketik Nama/NIK..."
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full text-sm font-semibold border-b border-slate-200 pb-1 focus:outline-none focus:border-indigo-600 bg-transparent"
             />
           </div>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Spreadsheet Lembur <span className="text-slate-300 mx-2">|</span> 
              Menampilkan {filteredEmployees.length} Karyawan
            </p>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
           <table className="w-full text-left whitespace-nowrap">
             <thead className="bg-slate-50 border-b border-slate-100">
               <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                 <th className="px-6 py-4 w-12 text-center">No</th>
                 <th className="px-6 py-4">Karyawan</th>
                 <th className="px-4 py-4">Departemen</th>
                 <th className="px-6 py-4 text-center bg-indigo-50/50 text-indigo-700">Jam Lembur Input (Jml)</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                        <p className="text-xs font-bold text-slate-400">Loading Data...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-20 text-slate-400">
                      Tidak ada karyawan di filter ini
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp, index) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center text-xs text-slate-400 font-medium">{index + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 uppercase">{emp.name}</span>
                          <span className="text-[10px] text-slate-500">{emp.employeeCode}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-600">
                        {emp.department?.name || 'UMUM'}
                      </td>
                      <td className="px-6 py-2 text-center bg-indigo-50/10 group-hover:bg-indigo-50/50 transition-colors">
                        <input
                           type="number"
                           step="0.5"
                           min="0"
                           max="24"
                           placeholder="0"
                           value={overtimeInputs[emp.id] || ''}
                           onChange={(e) => handleInputChange(emp.id, e.target.value)}
                           className="w-24 text-center bg-white border border-slate-300 rounded-lg py-1.5 text-sm font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
                        />
                      </td>
                    </tr>
                  ))
                )}
             </tbody>
           </table>
        </div>
      </div>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-4 px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
             <AlertCircle className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Status Perubahan</p>
            <p className="text-sm font-bold text-slate-800">
              {Object.keys(overtimeInputs).filter(k => overtimeInputs[k] !== '' && overtimeInputs[k] !== undefined).length} Karyawan akan di-update
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSaveAll}
          disabled={saveMutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg hover:shadow-xl hover:shadow-indigo-500/20 active:scale-95 transition-all outline-none"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Simpan Semua Lembur</span>
        </button>
      </div>

    </div>
  );
};

export default OvertimeSPL;
