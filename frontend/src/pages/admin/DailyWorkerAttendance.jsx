import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, attendanceAPI } from '../../services/api';
import MasterDataBhl from './MasterDataBhl';
import BhlSettings from './BhlSettings';
import { 
  Users, Save, Calendar, Search, Filter, Loader2, AlertCircle, HardHat, History, FileDown,
  CheckCircle2, XCircle, Clock, Stethoscope, Briefcase, Database, Settings as SettingsIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';

const STATUS_OPTIONS = [
  { val: 'PRESENT', label: 'Hadir', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: 'bg-emerald-500 text-white border-emerald-600', icon: CheckCircle2 },
  { val: 'ABSENT', label: 'Alpa', color: 'bg-rose-50 text-rose-700 border-rose-200', active: 'bg-rose-500 text-white border-rose-600', icon: XCircle },
  { val: 'SAKIT', label: 'Sakit', color: 'bg-blue-50 text-blue-700 border-blue-200', active: 'bg-blue-500 text-white border-blue-600', icon: Stethoscope },
  { val: 'IZIN', label: 'Izin', color: 'bg-amber-50 text-amber-700 border-amber-200', active: 'bg-amber-500 text-white border-amber-600', icon: Briefcase },
  { val: 'HALF_DAY', label: 'Setengah Hari', color: 'bg-purple-50 text-purple-700 border-purple-200', active: 'bg-purple-500 text-white border-purple-600', icon: Clock },
];

const DailyWorkerAttendance = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('INPUT'); // INPUT or HISTORY
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  
  const [statusInputs, setStatusInputs] = useState({});
  const [searchGrid, setSearchGrid] = useState('');
  const [deptGrid, setDeptGrid] = useState('');
  const [secGrid, setSecGrid] = useState('');

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-bhl'],
    queryFn: () => employeeAPI.getAll({ limit: 1000, status: 'ACTIVE', light: true, onlyBhl: true }),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance-for-bhl', selectedDate],
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000 }),
  });

  const selectedMonth = selectedDate.substring(0, 7);
  
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['bhl-history', selectedMonth],
    queryFn: () => attendanceAPI.getBhlSummary(selectedMonth),
  });

  // Filter ONLY daily workers
  const bhlEmployees = (employeesData?.data || []).filter(e => {
    const isEmpStatusBHL = ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'].includes(e.employmentStatus);
    const isSalaryTypeBHL = ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'].includes(e.salary?.employmentType);
    return isEmpStatusBHL || isSalaryTypeBHL;
  });

  const filteredEmployees = bhlEmployees.filter(e => {
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

  // Pre-fill inputs when attendance data loads
  useEffect(() => {
    if (attendanceData?.data && bhlEmployees.length > 0) {
      const initialInputs = {};
      
      bhlEmployees.forEach(emp => {
         initialInputs[emp.dbId] = null; // No status yet
      });

      attendanceData.data.forEach(r => {
        if (r.status) {
          // Bug Fix: Match using dbId
          const emp = bhlEmployees.find(e => e.dbId === r.employeeId || e.id === r.employeeCode);
          if (emp) {
            initialInputs[emp.dbId] = r.status;
          }
        }
      });
      setStatusInputs(initialInputs);
    }
  }, [attendanceData, employeesData]);

  const handleStatusChange = (empId, val) => {
    setStatusInputs(prev => ({ ...prev, [empId]: prev[empId] === val ? null : val }));
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.bulkDailyWorkers(payload),
    onSuccess: (res) => {
      alert(res.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-for-bhl'] });
      queryClient.invalidateQueries({ queryKey: ['bhl-history'] });
    },
    onError: (err) => {
      alert(`Gagal menyimpan: ${err.message}`);
    }
  });

  const handleSaveAll = () => {
    const records = [];
    Object.keys(statusInputs).forEach(empId => {
      const val = statusInputs[empId];
      const originalRecord = attendanceData?.data?.find(r => r.employeeId === parseInt(empId));
      
      if (val) {
        records.push({
          employeeId: parseInt(empId),
          status: val
        });
      } else if (originalRecord) {
        records.push({
          employeeId: parseInt(empId),
          status: 'DELETE'
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

  const handleExportHistory = () => {
    if (!historyData?.data || historyData.data.length === 0) {
      alert("Tidak ada data BHL di bulan ini untuk diexport.");
      return;
    }

    const exportData = historyData.data.map((item, idx) => ({
      'No': idx + 1,
      'NIK': item.employeeCode,
      'Nama Karyawan': item.name,
      'Departemen': item.department,
      'Upah Harian': item.dailyRate,
      'Hari Efektif': item.effectiveDays,
      'Hadir Penuh': item.workingDays,
      'Setengah Hari': item.halfDays,
      'Sakit': item.sickDays,
      'Izin': item.leaveDays,
      'Alpa': item.absentDays,
      'Total Upah': item.totalWage
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Upah BHL");
    
    const wscols = [
      {wch:5}, {wch:15}, {wch:25}, {wch:20}, {wch:15}, {wch:12}, {wch:12}, {wch:15}, {wch:10}, {wch:10}, {wch:10}, {wch:20}
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `Rekap_Upah_BHL_${selectedMonth}.xlsx`);
  };

  const isLoading = empLoading || attLoading;

  // Calculate current stats
  const currentStats = {
    total: bhlEmployees.length,
    present: Object.values(statusInputs).filter(s => ['PRESENT', 'LATE'].includes(s)).length,
    absent: Object.values(statusInputs).filter(s => ['ABSENT', 'MANGKIR'].includes(s)).length,
    other: Object.values(statusInputs).filter(s => ['SAKIT', 'IZIN', 'HALF_DAY'].includes(s)).length
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-28">
      
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
            <p className="text-xs text-slate-500 mt-1">Input massal kehadiran & rekap upah pekerja harian lepas</p>
          </div>
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('INPUT')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'INPUT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Input Kehadiran
            </button>
            <button 
              onClick={() => setActiveTab('MASTER')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'MASTER' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Master Data BHL
            </button>
            <button 
              onClick={() => setActiveTab('MONTHLY_GRID')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'MONTHLY_GRID' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Detail Kehadiran
            </button>
            <button 
              onClick={() => setActiveTab('HISTORY')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'HISTORY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Rekap Upah
            </button>
            <button 
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'SETTINGS' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Pengaturan
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'SETTINGS' && (
        <BhlSettings />
      )}

      {activeTab === 'MASTER' && (
        <MasterDataBhl />
      )}

      {activeTab === 'MONTHLY_GRID' && (() => {
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

        const getDayStatus = (emp, dayNumber, yearMonthStr) => {
          if (!emp.attendanceDetails) return null;
          const [year, month] = yearMonthStr.split('-');
          const targetDateStr = `${year}-${month}-${String(dayNumber).padStart(2, '0')}`;
          const record = emp.attendanceDetails.find(a => a.date === targetDateStr);
          return record ? record.status : null;
        };

        const renderStatusBadge = (status) => {
          if (!status) return <span className="text-slate-300 font-normal">-</span>;
          switch (status) {
            case 'PRESENT':
            case 'LATE':
              return <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title="Hadir">H</span>;
            case 'HALF_DAY':
              return <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title="Setengah Hari">½</span>;
            case 'SAKIT':
              return <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title="Sakit">S</span>;
            case 'IZIN':
              return <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title="Izin">I</span>;
            case 'ABSENT':
            case 'MANGKIR':
              return <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title="Alpa / Mangkir">A</span>;
            default:
              return <span className="text-slate-300 font-normal">-</span>;
          }
        };

        const handleExportMonthlyGrid = (gridData, days, yearMonthStr) => {
          if (!gridData || gridData.length === 0) {
            alert("Tidak ada data untuk diekspor.");
            return;
          }

          const exportRows = gridData.map((emp, idx) => {
            const row = {
              'No': idx + 1,
              'NIK': emp.employeeCode,
              'Nama Lengkap': emp.name,
              'Departemen': emp.department,
              'Bagian / Section': emp.section || '-'
            };
            
            days.forEach(day => {
              const status = getDayStatus(emp, day, yearMonthStr);
              let statusChar = '-';
              if (status === 'PRESENT' || status === 'LATE') statusChar = 'H';
              else if (status === 'HALF_DAY') statusChar = '½';
              else if (status === 'SAKIT') statusChar = 'S';
              else if (status === 'IZIN') statusChar = 'I';
              else if (status === 'ABSENT' || status === 'MANGKIR') statusChar = 'A';
              
              row[`Tanggal ${day}`] = statusChar;
            });
            
            row['Hadir (H)'] = emp.workingDays;
            row['Setengah Hari (½)'] = emp.halfDays;
            row['Sakit (S)'] = emp.sickDays;
            row['Izin (I)'] = emp.leaveDays;
            row['Alpa (A)'] = emp.absentDays;
            row['Hari Efektif'] = emp.effectiveDays;
            
            return row;
          });

          const ws = XLSX.utils.json_to_sheet(exportRows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Detail Presensi BHL");
          
          const wscols = [
            {wch: 5},
            {wch: 12},
            {wch: 22},
            {wch: 15},
            {wch: 15},
          ];
          days.forEach(() => wscols.push({wch: 4}));
          wscols.push(
            {wch: 10}, {wch: 15}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 12}
          );
          ws['!cols'] = wscols;

          XLSX.writeFile(wb, `Laporan_Kehadiran_BHL_${yearMonthStr}.xlsx`);
        };

        const rawGridList = historyData?.data || [];
        const filteredGridList = rawGridList.filter(emp => {
          if (deptGrid && emp.department !== deptGrid) return false;
          if (secGrid && emp.section !== secGrid) return false;
          if (searchGrid) {
            const lower = searchGrid.toLowerCase();
            if (!emp.name.toLowerCase().includes(lower) && !emp.employeeCode.toLowerCase().includes(lower)) {
              return false;
            }
          }
          return true;
        });

        const days = getDaysInMonth(selectedMonth);

        return (
          <div className="space-y-6">
            {/* Filters Bar for Grid */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                    </div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">BULAN TARGET:</label>
                  </div>
                  <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                    <input 
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedDate(e.target.value + '-01')}
                      className="bg-transparent px-4 py-1 text-xs font-bold text-slate-700 outline-none uppercase tracking-wider"
                    />
                  </div>
                </div>

                <button
                  onClick={() => handleExportMonthlyGrid(filteredGridList, days, selectedMonth)}
                  className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ml-auto self-end shadow-sm"
                >
                  <FileDown className="w-4 h-4" /> Export Grid Excel
                </button>
              </div>

              {/* Advanced Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">PENCARIAN KARYAWAN</label>
                  <div className="relative group">
                    <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="text" 
                      placeholder="NAMA / NIK..." 
                      value={searchGrid}
                      onChange={(e) => setSearchGrid(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">DEPARTEMEN</label>
                  <select 
                    value={deptGrid}
                    onChange={(e) => { setDeptGrid(e.target.value); setSecGrid(''); }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm uppercase tracking-wider"
                  >
                    <option value="">SEMUA DEPARTEMEN</option>
                    {[...new Set(rawGridList.map(e => e.department).filter(Boolean))].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">BAGIAN / SECTION</label>
                  <select 
                    value={secGrid}
                    onChange={(e) => setSecGrid(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm uppercase tracking-wider"
                  >
                    <option value="">SEMUA BAGIAN</option>
                    {[...new Set(rawGridList.filter(e => !deptGrid || e.department === deptGrid).map(e => e.section).filter(Boolean))].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Grid Presensi */}
            <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Detail Presensi Bulanan BHL | Menampilkan {filteredGridList.length} Karyawan
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <th className="px-4 py-3 border-r border-slate-200 w-10 text-center bg-slate-50">No</th>
                      <th className="px-4 py-3 border-r border-slate-200 w-48 bg-slate-50">Karyawan BHL</th>
                      <th className="px-3 py-3 border-r border-slate-200 bg-slate-50">Dept</th>
                      <th className="px-3 py-3 border-r border-slate-200 bg-slate-50">Bagian</th>
                      
                      {days.map(day => (
                        <th key={day} className="px-1 py-3 text-center border-r border-slate-100 min-w-[28px] max-w-[28px]">{day}</th>
                      ))}
                      <th className="px-2 py-3 text-center border-l border-r border-slate-200 bg-emerald-50 text-emerald-800 font-bold min-w-[36px]" title="Hadir (H)">H</th>
                      <th className="px-2 py-3 text-center border-r border-slate-200 bg-purple-50 text-purple-800 font-bold min-w-[36px]" title="Setengah Hari (½)">½</th>
                      <th className="px-2 py-3 text-center border-r border-slate-200 bg-blue-50 text-blue-800 font-bold min-w-[36px]" title="Sakit (S)">S</th>
                      <th className="px-2 py-3 text-center border-r border-slate-200 bg-amber-50 text-amber-800 font-bold min-w-[36px]" title="Izin (I)">I</th>
                      <th className="px-2 py-3 text-center border-r border-slate-200 bg-rose-50 text-rose-800 font-bold min-w-[36px]" title="Alpa / Mangkir (A)">A</th>
                      <th className="px-2 py-3 text-center bg-slate-100 text-slate-800 font-bold min-w-[50px]" title="Hari Kerja Efektif">Efk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyLoading ? (
                      <tr>
                        <td colSpan={days.length + 10} className="text-center py-20">
                          <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                            <p className="text-xs font-bold text-slate-400">Loading Data Grid...</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredGridList.length === 0 ? (
                      <tr>
                        <td colSpan={days.length + 10} className="text-center py-20">
                          <HardHat className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm font-bold text-slate-400">Tidak ada data kehadiran ditemukan.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredGridList.map((emp, index) => (
                        <tr key={emp.employeeId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 text-center text-slate-400 border-r border-slate-200 font-medium">{index + 1}</td>
                          <td className="px-4 py-2 border-r border-slate-200 font-bold text-slate-800 uppercase">
                            <div className="flex flex-col">
                              <span>{emp.name}</span>
                              <span className="text-[9px] text-slate-500 font-medium">{emp.employeeCode}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 font-semibold text-slate-600">{emp.department}</td>
                          <td className="px-3 py-2 border-r border-slate-200 font-semibold text-slate-600">{emp.section || '-'}</td>
                          
                          {days.map(day => {
                            const status = getDayStatus(emp, day, selectedMonth);
                            return (
                              <td key={day} className="p-1 border-r border-slate-100 text-center align-middle">
                                <div className="flex items-center justify-center">
                                  {renderStatusBadge(status)}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center border-l border-r border-slate-200 font-bold text-emerald-700 bg-emerald-50/20">{emp.workingDays}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 font-bold text-purple-700 bg-purple-50/20">{emp.halfDays}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 font-bold text-blue-700 bg-blue-50/20">{emp.sickDays}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 font-bold text-amber-700 bg-amber-50/20">{emp.leaveDays}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 font-bold text-rose-700 bg-rose-50/20">{emp.absentDays}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-800 bg-slate-50">{emp.effectiveDays}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend Guide */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-6 text-[10px] font-bold text-slate-500 uppercase shadow-sm">
              <span className="text-slate-400">Keterangan:</span>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black">H</span>
                <span>Hadir</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-[9px] font-black">½</span>
                <span>Setengah Hari</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-black">S</span>
                <span>Sakit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-black">I</span>
                <span>Izin</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-black">A</span>
                <span>Alpa / Mangkir</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-normal">-</span>
                <span>Libur / Tidak Ada Data</span>
              </div>
            </div>
          </div>
        );
      })()}

      {activeTab === 'HISTORY' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pekerja BHL</p>
              <h3 className="text-2xl font-black text-slate-800">{historyData?.totals?.totalEmployees || 0}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Hari Kerja</p>
              <h3 className="text-2xl font-black text-slate-800">{historyData?.totals?.totalWorkingDays || 0} <span className="text-sm font-medium text-slate-400">hari</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <FileDown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Estimasi Upah</p>
              <h3 className="text-2xl font-black text-slate-800">
                Rp {(historyData?.totals?.totalWage || 0).toLocaleString('id-ID')}
              </h3>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'INPUT' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center">
            <span className="text-2xl font-black text-slate-800">{currentStats.total}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">BHL Terdaftar</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center bg-emerald-50/30">
            <span className="text-2xl font-black text-emerald-600">{currentStats.present}</span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Hadir</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-rose-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center bg-rose-50/30">
            <span className="text-2xl font-black text-rose-600">{currentStats.absent}</span>
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Alpa / Mangkir</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center bg-amber-50/30">
            <span className="text-2xl font-black text-amber-600">{currentStats.other}</span>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Lainnya (Sakit/Izin)</span>
          </div>
        </div>
      )}

      {/* Advanced Filter Bar & Main Grid - Only in INPUT or HISTORY tabs */}
      {(activeTab === 'INPUT' || activeTab === 'HISTORY') && (
        <>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
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

              {activeTab === 'HISTORY' && (
                <button
                  onClick={handleExportHistory}
                  className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
                >
                  <FileDown className="w-4 h-4" /> Export Excel
                </button>
              )}
            </div>

            {activeTab === 'INPUT' && (
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
                  { 
                    label: 'DEPARTMENT', 
                    val: deptFilter, 
                    setter: (val) => { setDeptFilter(val); setSectionFilter(''); setRankFilter(''); }, 
                    opts: [...new Set((bhlEmployees || []).map(e => e.department?.name || e.dept).filter(Boolean))] 
                  },
                  { 
                    label: 'SECTION', 
                    val: sectionFilter, 
                    setter: (val) => { setSectionFilter(val); setRankFilter(''); }, 
                    opts: [...new Set((bhlEmployees || [])
                      .filter(e => !deptFilter || (e.department?.name === deptFilter || e.dept === deptFilter))
                      .map(e => e.section).filter(Boolean))] 
                  },
                  { 
                    label: 'RANK', 
                    val: rankFilter, 
                    setter: setRankFilter, 
                    opts: [...new Set((bhlEmployees || [])
                      .filter(e => !deptFilter || (e.department?.name === deptFilter || e.dept === deptFilter))
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
            )}
          </div>

          <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {activeTab === 'INPUT' 
                    ? `Papan Kehadiran BHL | Menampilkan ${filteredEmployees.length} Karyawan`
                    : `Rekap Upah BHL Bulan ${selectedMonth} | ${(historyData?.data || []).length} Karyawan`
                  }
                </p>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4 w-12 text-center">No</th>
                    <th className="px-6 py-4">Karyawan BHL</th>
                    <th className="px-4 py-4">Departemen</th>
                    
                    {activeTab === 'INPUT' ? (
                      <th className="px-6 py-4 text-center bg-emerald-50/50 text-emerald-700">Status Kehadiran</th>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-center">Hari Efektif</th>
                        <th className="px-6 py-4 text-right">Upah Harian</th>
                        <th className="px-6 py-4 text-right bg-emerald-50/50 text-emerald-700">Total Upah</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(activeTab === 'INPUT' ? isLoading : historyLoading) ? (
                    <tr>
                      <td colSpan={activeTab === 'INPUT' ? 4 : 6} className="text-center py-20">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                          <p className="text-xs font-bold text-slate-400">Loading Data...</p>
                        </div>
                      </td>
                    </tr>
                  ) : activeTab === 'INPUT' ? (
                    filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-20">
                          <HardHat className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm font-bold text-slate-400">Tidak ada karyawan BHL ditemukan.</p>
                          <p className="text-xs text-slate-400 mt-1">Pastikan status karyawan diset ke HARIAN.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp, index) => {
                        const currentStatus = statusInputs[emp.dbId];
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
                            <td className="px-6 py-3 bg-emerald-50/10 group-hover:bg-emerald-50/30 transition-colors">
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                {STATUS_OPTIONS.map(opt => {
                                  const isActive = currentStatus === opt.val || 
                                    (opt.val === 'PRESENT' && currentStatus === 'LATE') ||
                                    (opt.val === 'ABSENT' && currentStatus === 'MANGKIR');
                                  const Icon = opt.icon;

                                  return (
                                    <button
                                      key={opt.val}
                                      onClick={() => handleStatusChange(emp.dbId, opt.val)}
                                      className={`
                                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all
                                        ${isActive ? opt.active + ' shadow-md scale-105' : opt.color + ' hover:brightness-95'}
                                      `}
                                    >
                                      <Icon className="w-3.5 h-3.5" />
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )
                  ) : (
                    (historyData?.data || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-20 text-slate-400">
                          Tidak ada data BHL di bulan ini
                        </td>
                      </tr>
                    ) : (
                      (historyData?.data || []).map((emp, index) => (
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
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-bold text-slate-800">{emp.effectiveDays}</span>
                              <span className="text-[9px] text-slate-400">(Hadir {emp.workingDays}, Setengah {emp.halfDays})</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-slate-600">
                            Rp {(emp.dailyRate || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-black text-emerald-600 bg-emerald-50/30">
                            Rp {emp.totalWage.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Floating Save Bar - Only in INPUT mode and has employees */}
      {activeTab === 'INPUT' && filteredEmployees.length > 0 && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-4 px-6 flex items-center justify-between z-40 floating-save-bar">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
               <AlertCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Status Perubahan</p>
              <p className="text-sm font-bold text-slate-800">
                {Object.keys(statusInputs).filter(k => statusInputs[k]).length} Karyawan akan di-update
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSaveAll}
            disabled={saveMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg hover:shadow-xl hover:shadow-emerald-500/20 active:scale-95 transition-all outline-none"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Simpan Absen BHL</span>
          </button>
        </div>
      )}

    </div>
  );
};

export default DailyWorkerAttendance;
