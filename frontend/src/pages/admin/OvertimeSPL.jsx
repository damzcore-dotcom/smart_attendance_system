import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, attendanceAPI, settingsAPI } from '../../services/api';
import { 
  Users, Save, Calendar, Search, Filter, Loader2, AlertCircle, Clock, FileDown, History, BarChart3, Wallet
} from 'lucide-react';
import * as XLSX from 'xlsx';

const OvertimeSPL = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('INPUT'); // INPUT or HISTORY
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [onlyPresent, setOnlyPresent] = useState(true);
  
  const [overtimeInputs, setOvertimeInputs] = useState({}); // { empId: "2.5" }
  const [reasonInputs, setReasonInputs] = useState({}); // { empId: "Alasan lembur" }
  const [settings, setSettings] = useState({ overtimeMaxPerDay: 4, overtimeMaxPerMonth: 40 });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.getAll()
  });

  useEffect(() => {
    if (settingsData?.data) {
      setSettings(prev => ({
        ...prev,
        overtimeMaxPerDay: parseFloat(settingsData.data.overtimeMaxPerDay || 4),
        overtimeMaxPerMonth: parseFloat(settingsData.data.overtimeMaxPerMonth || 40)
      }));
    }
  }, [settingsData]);

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-spl'],
    queryFn: () => employeeAPI.getAll({ limit: 1000, status: 'ACTIVE', light: true, excludeBhl: true }),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance-for-spl', selectedDate],
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000 }),
  });

  // Extract Month from selectedDate for history
  const selectedMonth = selectedDate.substring(0, 7);
  const getDaysInMonth = (yearMonthStr) => {
    if (!yearMonthStr) return [];
    const [year, month] = yearMonthStr.split('-').map(Number);
    const numDays = new Date(year, month, 0).getDate();
    const days = [];
    for (let i = 1; i <= numDays; i++) {
      days.push(i);
    }
    return days;
  };

  const getDayOvertime = (emp, dayNumber, yearMonthStr) => {
    if (!emp.records) return null;
    const [year, month] = yearMonthStr.split('-');
    const targetDateStr = `${year}-${month}-${String(dayNumber).padStart(2, '0')}`;
    const record = emp.records.find(r => r.date === targetDateStr);
    return record ? record.hours : null;
  };

  const days = getDaysInMonth(selectedMonth);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['overtime-history', selectedMonth],
    queryFn: () => attendanceAPI.getOvertimeSummary(selectedMonth),
  });

  // Pre-fill inputs when attendance data loads
  useEffect(() => {
    if (attendanceData?.data && employeesData?.data) {
      const initialHours = {};
      const initialReasons = {};
      attendanceData.data.forEach(r => {
        if (r.overtimeHours) {
          // Bug Fix: Match using employeeId, fallback to others if needed but employeeId is safest
          const emp = employeesData.data.find(e => e.dbId === r.employeeId || e.id === r.employeeCode);
          if (emp) {
            initialHours[emp.dbId] = r.overtimeHours.toString();
            if (r.notes) initialReasons[emp.dbId] = r.notes;
          }
        }
      });
      setOvertimeInputs(initialHours);
      setReasonInputs(initialReasons);
    }
  }, [attendanceData, employeesData]);

  const handleInputChange = (empId, val) => {
    setOvertimeInputs(prev => ({ ...prev, [empId]: val }));
  };

  const handleReasonChange = (empId, val) => {
    setReasonInputs(prev => ({ ...prev, [empId]: val }));
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.bulkOvertime(payload),
    onSuccess: (res) => {
      alert(res.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-for-spl'] });
      queryClient.invalidateQueries({ queryKey: ['overtime-history'] });
    },
    onError: (err) => {
      alert(`Gagal menyimpan: ${err.message}`);
    }
  });

  const handleSaveAll = () => {
    const records = [];
    let hasExceededLimit = false;

    Object.keys(overtimeInputs).forEach(empId => {
      const eId = parseInt(empId);
      if (isNaN(eId)) return; // safeguard

      const val = overtimeInputs[empId];
      if (val !== undefined && val !== null && val !== '') {
        const hours = parseFloat(val);
        if (hours > settings.overtimeMaxPerDay) {
          hasExceededLimit = true;
        }
        records.push({
          employeeId: eId,
          overtimeHours: hours,
          reason: reasonInputs[empId] || ''
        });
      }
    });

    if (records.length === 0) {
      alert("Tidak ada data lembur yang diinput. Isi setidaknya 1.");
      return;
    }

    if (hasExceededLimit) {
      if (!window.confirm(`Peringatan: Ada input yang melebihi batas lembur harian (${settings.overtimeMaxPerDay} jam). Tetap simpan?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Simpan lembur untuk ${records.length} karyawan di tanggal ${selectedDate}?`)) {
        return;
      }
    }

    saveMutation.mutate({
      date: selectedDate,
      records
    });
  };

  const handleExportHistory = () => {
    if (!historyData?.data || historyData.data.length === 0) {
      alert("Tidak ada data lembur di bulan ini untuk diexport.");
      return;
    }

    const exportData = historyData.data.map((item, idx) => ({
      'No': idx + 1,
      'NIK': item.employeeCode,
      'Nama Karyawan': item.name,
      'Departemen': item.department,
      'Total Jam Lembur': item.totalOvertimeHours,
      'Estimasi Biaya': item.totalCost
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Lembur");
    
    // Auto size columns
    const wscols = [
      {wch:5}, {wch:15}, {wch:25}, {wch:20}, {wch:15}, {wch:15}
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `Rekap_Lembur_${selectedMonth}.xlsx`);
  };

  const baseEmployeesForDate = (employeesData?.data || []).filter(e => {
    if (!onlyPresent) return true;
    // Only show employees that have some form of attendance (checkIn, checkOut, or present/late status) on this date
    return attendanceData?.data?.some(att => 
      (att.employeeId === e.dbId || att.employeeCode === e.id) && 
      (att.checkIn || att.checkOut || ['PRESENT', 'LATE'].includes(att.status))
    );
  });

  const filteredEmployees = baseEmployeesForDate.filter(e => {
    if (deptFilter && (e.department?.name !== deptFilter && e.dept !== deptFilter)) return false;
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

  const filteredHistory = (historyData?.data || []).filter(emp => {
    if (deptFilter && emp.department !== deptFilter) return false;
    if (sectionFilter && emp.section !== sectionFilter) return false;
    if (rankFilter && emp.position !== rankFilter) return false;
    if (search) {
      const lower = search.toLowerCase();
      if (!emp.name.toLowerCase().includes(lower) && !emp.employeeCode.toLowerCase().includes(lower)) {
        return false;
      }
    }
    return true;
  });

  const isLoading = empLoading || attLoading;

  // Calculate stats for current input view
  const currentInputStats = {
    totalEmployees: Object.keys(overtimeInputs).filter(k => overtimeInputs[k] !== '' && parseFloat(overtimeInputs[k]) > 0).length,
    totalHours: Object.values(overtimeInputs).reduce((acc, val) => acc + (parseFloat(val) || 0), 0)
  };

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
              Manajemen Surat Perintah Lembur
            </h1>
            <p className="text-xs text-slate-500 mt-1">Input massal jam lembur & rekap bulanan</p>
          </div>
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('INPUT')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'INPUT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Input Lembur
            </button>
            <button 
              onClick={() => setActiveTab('HISTORY')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'HISTORY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Riwayat {selectedMonth}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'HISTORY' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Karyawan Lembur</p>
              <h3 className="text-2xl font-black text-slate-800">{historyData?.totals?.totalEmployees || 0}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Jam Lembur</p>
              <h3 className="text-2xl font-black text-slate-800">{historyData?.totals?.totalHours || 0} <span className="text-sm font-medium text-slate-400">jam</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimasi Biaya</p>
              <h3 className="text-2xl font-black text-slate-800">
                Rp {(historyData?.totals?.estimatedCost || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}
              </h3>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'INPUT' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Input Aktif (Orang)</p>
              <h3 className="text-2xl font-black text-slate-800">{currentInputStats.totalEmployees}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Jam Input</p>
              <h3 className="text-2xl font-black text-slate-800">{currentInputStats.totalHours} <span className="text-sm font-medium text-slate-400">jam</span></h3>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3 min-w-max">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-indigo-600" />
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

            {activeTab === 'INPUT' && (
              <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-6">
                <button
                  type="button"
                  onClick={() => setOnlyPresent(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    onlyPresent ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      onlyPresent ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => setOnlyPresent(prev => !prev)}>
                  {onlyPresent ? 'Hanya Karyawan Hadir' : 'Semua Karyawan Aktif'}
                </span>
              </div>
            )}
          </div>

          {activeTab === 'HISTORY' && (
            <button
              onClick={handleExportHistory}
              className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
            >
              <FileDown className="w-4 h-4" /> Export Excel
            </button>
          )}
        </div>

        {(() => {
          // Source filter options based on the active tab context
          const filterSource = activeTab === 'INPUT' 
            ? baseEmployeesForDate.map(e => ({ dept: e.department?.name || e.dept, section: e.section, position: e.position }))
            : (historyData?.data || []).map(e => ({ dept: e.department, section: e.section, position: e.position }));
          
          return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 items-end bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">PENCARIAN KARYAWAN</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="NAMA / NIK..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
                />
              </div>
            </div>

            {[
              { 
                label: 'DEPARTEMEN', 
                val: deptFilter, 
                setter: (val) => { setDeptFilter(val); setSectionFilter(''); setRankFilter(''); }, 
                opts: [...new Set(filterSource.map(e => e.dept).filter(Boolean))] 
              },
              { 
                label: 'BAGIAN / SECTION', 
                val: sectionFilter, 
                setter: (val) => { setSectionFilter(val); setRankFilter(''); }, 
                opts: [...new Set(filterSource
                  .filter(e => !deptFilter || e.dept === deptFilter)
                  .map(e => e.section).filter(Boolean))] 
              },
              { 
                label: 'JABATAN / RANK', 
                val: rankFilter, 
                setter: setRankFilter, 
                opts: [...new Set(filterSource
                  .filter(e => !deptFilter || e.dept === deptFilter)
                  .filter(e => !sectionFilter || e.section === sectionFilter)
                  .map(e => e.position).filter(Boolean))] 
              }
            ].map((field, idx) => (
              <div key={idx} className="space-y-2">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
                <div className="relative">
                  <select 
                    value={field.val}
                    onChange={(e) => field.setter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm truncate transition-all"
                  >
                    <option value="">SEMUA</option>
                    {field.opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            ))}
          </div>
          );
        })()}
      </div>

      {/* Main Content Grid */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {activeTab === 'INPUT' 
                ? `Spreadsheet Lembur | Menampilkan ${filteredEmployees.length} Karyawan`
                : `Riwayat Lembur Bulan ${selectedMonth} | ${(historyData?.data || []).length} Karyawan`
              }
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
                 
                 {activeTab === 'INPUT' ? (
                   <>
                     <th className="px-6 py-4 text-center bg-indigo-50/50 text-indigo-700">Jam Lembur (Jml)</th>
                     <th className="px-6 py-4 bg-slate-50/50">Keterangan / Alasan</th>
                   </>
                 ) : (
                   <>
                     {days.map(day => (
                       <th key={day} className="px-1 py-3 text-center border-r border-slate-100 min-w-[28px] max-w-[28px]">{day}</th>
                     ))}
                     <th className="px-3 py-4 text-center border-l bg-indigo-50 text-indigo-800 font-bold min-w-[50px]">Total Jam</th>
                     <th className="px-4 py-4 text-left bg-slate-100 text-slate-800 font-bold min-w-[120px]">Estimasi Biaya</th>
                   </>
                 )}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
                {(activeTab === 'INPUT' ? isLoading : historyLoading) ? (
                  <tr>
                    <td colSpan={activeTab === 'INPUT' ? 5 : (days.length + 5)} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                        <p className="text-xs font-bold text-slate-400">Loading Data...</p>
                      </div>
                    </td>
                  </tr>
                ) : activeTab === 'INPUT' ? (
                  filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-20 text-slate-400">
                        Tidak ada karyawan di filter ini
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp, index) => {
                      const inputHours = parseFloat(overtimeInputs[emp.dbId]) || 0;
                      const isOverLimit = inputHours > settings.overtimeMaxPerDay;

                      return (
                        <tr key={emp.dbId} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 text-center text-xs text-slate-400 font-medium">{index + 1}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800 uppercase">{emp.name}</span>
                              <span className="text-[10px] text-slate-500">{emp.employeeCode || emp.id}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs font-medium text-slate-600">
                            {emp.department?.name || emp.dept || 'UMUM'}
                          </td>
                          <td className="px-6 py-2 text-center bg-indigo-50/10 group-hover:bg-indigo-50/50 transition-colors">
                            <div className="flex flex-col items-center">
                              <input
                                 type="number"
                                 step="0.5"
                                 min="0"
                                 max="24"
                                 placeholder="0"
                                 value={overtimeInputs[emp.dbId] || ''}
                                 onChange={(e) => handleInputChange(emp.dbId, e.target.value)}
                                 className={`w-24 text-center bg-white border rounded-lg py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner ${
                                   isOverLimit ? 'border-red-400 text-red-600' : 'border-slate-300 text-indigo-700'
                                 }`}
                              />
                              {isOverLimit && <span className="text-[9px] text-red-500 mt-1">Lebih dr batas ({settings.overtimeMaxPerDay})</span>}
                            </div>
                          </td>
                          <td className="px-6 py-2">
                            <input
                              type="text"
                              placeholder="Keterangan pekerjaan..."
                              value={reasonInputs[emp.dbId] || ''}
                              onChange={(e) => handleReasonChange(emp.dbId, e.target.value)}
                              className="w-full min-w-[200px] bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : (
                  filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={days.length + 5} className="text-center py-20 text-slate-400">
                        Tidak ada data lembur di bulan ini
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((emp, index) => (
                      <tr key={emp.employeeId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-center text-xs text-slate-400 font-medium">{index + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800 uppercase">{emp.name}</span>
                            <span className="text-[10px] text-slate-500">{emp.employeeCode}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-slate-600">
                          {emp.department}
                        </td>
                        {days.map(day => {
                           const hours = getDayOvertime(emp, day, selectedMonth);
                           return (
                             <td key={day} className="p-1 border-r border-slate-100 text-center align-middle text-[11px] font-bold text-slate-700">
                               {hours !== null && hours > 0 ? (
                                 <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100">
                                   {hours}
                                 </span>
                               ) : (
                                 <span className="text-slate-300 font-normal">-</span>
                               )}
                             </td>
                           );
                         })}
                        <td className="px-3 py-4 text-center text-sm font-black text-indigo-600 border-l bg-indigo-50/20">
                          {emp.totalOvertimeHours}
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-slate-800 bg-slate-50/50">
                          {emp.totalCost > 0 ? (
                             `Rp ${emp.totalCost.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                           ) : (
                             <span className="text-slate-400 font-normal">Rp 0 (Gaji Rp 0)</span>
                           )}
                        </td>
                      </tr>
                    ))
                  )
                )}
             </tbody>
           </table>
        </div>
      </div>

      {/* Floating Save Bar - Only in INPUT mode */}
      {activeTab === 'INPUT' && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-4 px-6 flex items-center justify-between z-40 floating-save-bar">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
               <AlertCircle className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Status Perubahan</p>
              <p className="text-sm font-bold text-slate-800">
                {Object.keys(overtimeInputs).filter(k => overtimeInputs[k] !== '' && parseFloat(overtimeInputs[k]) > 0).length} Karyawan akan di-update
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
      )}

    </div>
  );
};

export default OvertimeSPL;
