import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, attendanceAPI } from '../../services/api';
import { 
  Users, Save, Calendar, Search, Filter, Loader2, AlertCircle, HardHat 
} from 'lucide-react';

const DailyWorkerAttendance = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  
  // Local state for attendance status { empId: "PRESENT" }
  const [statusInputs, setStatusInputs] = useState({});

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-bhl'],
    queryFn: () => employeeAPI.getAll({ limit: 1000, status: 'ACTIVE' }),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance-for-bhl', selectedDate],
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000 }),
  });

  // Filter ONLY daily workers (HARIAN)
  const bhlEmployees = (employeesData?.data || []).filter(e => {
    // Assuming backend returns employmentType in salary relation or employmentStatus field
    return (e.employmentStatus === 'HARIAN' || e.employmentStatus === 'Harian' || e.salary?.employmentType === 'HARIAN' || e.salary?.employmentType === 'Harian');
  });

  const filteredEmployees = bhlEmployees.filter(e => {
    if (deptFilter && e.department?.name !== deptFilter) return false;
    if (sectionFilter && e.section !== sectionFilter) return false;
    if (rankFilter && e.position !== rankFilter) return false;
    if (search) {
      const lower = search.toLowerCase();
      if (!e.name.toLowerCase().includes(lower) && !e.employeeCode.toLowerCase().includes(lower)) {
        return false;
      }
    }
    return true;
  });

  // Pre-fill inputs when attendance data loads
  useEffect(() => {
    if (attendanceData?.data && bhlEmployees.length > 0) {
      const initialInputs = {};
      
      // First, set default empty/alpa for all BHL to ensure missing records are apparent
      bhlEmployees.forEach(emp => {
         initialInputs[emp.id] = null; // No status yet
      });

      attendanceData.data.forEach(r => {
        // Map backend translated status back to our Enum values
        // r.status might be "Hadir", "Alpa", "Setengah Hari" - wait, in attendanceController we use displayStatus
        let enumStatus = 'ABSENT';
        if (r.status === 'Hadir') enumStatus = 'PRESENT';
        else if (r.status === 'Cuti') enumStatus = 'CUTI';
        else if (r.status === 'Sakit') enumStatus = 'SAKIT';
        else if (r.status === 'Izin') enumStatus = 'IZIN';
        
        // We will just use 'PRESENT' or 'ABSENT' for quick UI
        const emp = bhlEmployees.find(e => e.id === r.id || e.employeeCode === r.employeeCode || e.name === r.name);
        if (emp) {
          initialInputs[emp.id] = enumStatus;
        }
      });
      setStatusInputs(initialInputs);
    }
  }, [attendanceData, employeesData]);

  const handleStatusChange = (empId, val) => {
    setStatusInputs(prev => ({ ...prev, [empId]: val }));
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.bulkDailyWorkers(payload),
    onSuccess: (res) => {
      alert(res.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-for-bhl'] });
    },
    onError: (err) => {
      alert(`Gagal menyimpan: ${err.message}`);
    }
  });

  const handleSaveAll = () => {
    const records = [];
    Object.keys(statusInputs).forEach(empId => {
      const val = statusInputs[empId];
      if (val) {
        records.push({
          employeeId: parseInt(empId),
          status: val
        });
      }
    });

    if (records.length === 0) {
      alert("Tidak ada data absen yang dipilih.");
      return;
    }

    if (window.confirm(`Simpan absen manual untuk ${records.length} Karyawan Harian (BHL) di tanggal ${selectedDate}?`)) {
      saveMutation.mutate({
        date: selectedDate,
        records
      });
    }
  };

  const isLoading = empLoading || attLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Header */}
      <div className="px-1 space-y-3">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <HardHat className="w-3 h-3 text-emerald-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Workforce Control</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">BHL Massal</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              Absen Harian (BHL)
            </h1>
            <p className="text-xs text-slate-500 mt-1">Input massal kehadiran pekerja harian lepas tanpa sidik jari</p>
          </div>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-3 min-w-max">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-emerald-600" />
            </div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TANGGAL TARGET:</label>
          </div>
          <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent px-4 py-2 text-sm font-bold text-slate-700 outline-none uppercase tracking-wider"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 items-end bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">PERSONNEL FILTER</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="text" 
                placeholder="ID SEQUENCE / NAMA..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
              />
            </div>
          </div>

          {[
            { label: 'DEPARTMENT', val: deptFilter, setter: setDeptFilter, opts: [...new Set((bhlEmployees || []).map(e => e.department?.name).filter(Boolean))] },
            { label: 'SECTION', val: sectionFilter, setter: setSectionFilter, opts: [...new Set((bhlEmployees || []).map(e => e.section).filter(Boolean))] },
            { label: 'RANK', val: rankFilter, setter: setRankFilter, opts: [...new Set((bhlEmployees || []).map(e => e.position).filter(Boolean))] }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => field.setter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm truncate transition-all"
                >
                  <option value="">GLOBAL ARCHIVE</option>
                  {field.opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Spreadsheet BHL <span className="text-slate-300 mx-2">|</span> 
              Menampilkan {filteredEmployees.length} Karyawan (Harian Only)
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
                 <th className="px-6 py-4 text-center bg-emerald-50/50 text-emerald-700">Pilih Kehadiran</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                        <p className="text-xs font-bold text-slate-400">Loading Data...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-20 text-slate-400">
                      Tidak ada Karyawan Harian ditemukan di departemen ini. (Pastikan status Employment karyawan adalah "HARIAN")
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
                      <td className="px-6 py-2 text-center transition-colors">
                        <div className="flex items-center justify-center gap-2">
                           <button 
                             onClick={() => handleStatusChange(emp.id, 'PRESENT')}
                             className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${statusInputs[emp.id] === 'PRESENT' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-500'}`}
                           >
                             HADIR
                           </button>
                           <button 
                             onClick={() => handleStatusChange(emp.id, 'ABSENT')}
                             className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${statusInputs[emp.id] === 'ABSENT' ? 'bg-red-50 border-red-200 text-red-600 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-500'}`}
                           >
                             ALPA
                           </button>
                        </div>
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
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
             <AlertCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Status Perubahan</p>
            <p className="text-sm font-bold text-slate-800">
              {Object.keys(statusInputs).filter(k => statusInputs[k] !== null).length} BHL akan diproses
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSaveAll}
          disabled={saveMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg hover:shadow-xl hover:shadow-emerald-500/20 active:scale-95 transition-all outline-none"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Simpan Kehadiran Harian</span>
        </button>
      </div>

    </div>
  );
};

export default DailyWorkerAttendance;
