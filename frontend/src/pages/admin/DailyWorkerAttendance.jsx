import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('INPUT'); // INPUT or HISTORY
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
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
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000, onlyBhl: true }),
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
    if (statusFilter) {
      const s = statusInputs[e.dbId];
      if (statusFilter === 'PRESENT') {
        if (!['PRESENT', 'LATE'].includes(s)) return false;
      } else if (statusFilter === 'ABSENT') {
        if (!['ABSENT', 'MANGKIR'].includes(s)) return false;
      } else if (statusFilter === 'OTHER') {
        if (!['SAKIT', 'IZIN', 'HALF_DAY'].includes(s)) return false;
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
      alert(`${t('dailyWorker.alerts.saveFailed')}${err.message}`);
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
      alert(t('dailyWorker.alerts.noRecords'));
      return;
    }

    if (window.confirm(t('dailyWorker.alerts.confirmSave', { count: records.length, date: selectedDate }))) {
      saveMutation.mutate({
        date: selectedDate,
        records
      });
    }
  };

  const handleExportHistory = () => {
    if (!historyData?.data || historyData.data.length === 0) {
      alert(t('dailyWorker.alerts.noExportData'));
      return;
    }

    const lang = i18n.language || 'id';
    const isIndo = lang.startsWith('id');
    const isKo = lang.startsWith('ko');
    const isZh = lang.startsWith('zh');

    const headers = {
      no: isIndo ? 'No' : isKo ? '번호' : isZh ? '序号' : 'No',
      nik: 'NIK',
      name: isIndo ? 'Nama Karyawan' : isKo ? '사원명' : isZh ? '员工姓名' : 'Employee Name',
      dept: isIndo ? 'Departemen' : isKo ? '부서' : isZh ? '部门' : 'Department',
      dailyRate: isIndo ? 'Upah Harian' : isKo ? '일급' : isZh ? '日薪' : 'Daily Wage',
      effectiveDays: isIndo ? 'Hari Efektif' : isKo ? '실근무일수' : isZh ? '实际工日' : 'Effective Days',
      workingDays: isIndo ? 'Hadir Penuh' : isKo ? '만근' : isZh ? '全勤' : 'Full Attendance',
      halfDays: isIndo ? 'Setengah Hari' : isKo ? '반차' : isZh ? '半天' : 'Half Days',
      sickDays: isIndo ? 'Sakit' : isKo ? '병가' : isZh ? '病假' : 'Sick Days',
      leaveDays: isIndo ? 'Izin' : isKo ? '공가' : isZh ? '事假' : 'Leave Days',
      absentDays: isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent Days',
      totalWage: isIndo ? 'Total Upah' : isKo ? '총 급여' : isZh ? '总薪资' : 'Total Wage'
    };

    const exportData = historyData.data.map((item, idx) => ({
      [headers.no]: idx + 1,
      [headers.nik]: item.employeeCode,
      [headers.name]: item.name,
      [headers.dept]: item.department,
      [headers.dailyRate]: item.dailyRate,
      [headers.effectiveDays]: item.effectiveDays,
      [headers.workingDays]: item.workingDays,
      [headers.halfDays]: item.halfDays,
      [headers.sickDays]: item.sickDays,
      [headers.leaveDays]: item.leaveDays,
      [headers.absentDays]: item.absentDays,
      [headers.totalWage]: item.totalWage
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isIndo ? "Rekap Upah BHL" : isKo ? "BHL 급여 요약" : isZh ? "BHL工资汇总" : "BHL Wage Summary");
    
    const wscols = [
      {wch:5}, {wch:15}, {wch:25}, {wch:20}, {wch:15}, {wch:12}, {wch:12}, {wch:15}, {wch:10}, {wch:10}, {wch:10}, {wch:20}
    ];
    ws['!cols'] = wscols;

    const filePrefix = isIndo ? 'Rekap_Upah_BHL' : isKo ? 'BHL_급여_요약' : isZh ? 'BHL_工资汇总' : 'BHL_Wage_Summary';
    XLSX.writeFile(wb, `${filePrefix}_${selectedMonth}.xlsx`);
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
          <span className="text-[10px] font-bold uppercase tracking-wider">{t('dailyWorker.filters.search')}</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{t('dailyWorker.tag', 'BHL Massal')}</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              {t('dailyWorker.title')}
            </h1>
            <p className="text-xs text-slate-500 mt-1">{t('dailyWorker.subtitle')}</p>
          </div>
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('INPUT')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'INPUT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('dailyWorker.tabs.input')}
            </button>
            <button 
              onClick={() => setActiveTab('MASTER')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'MASTER' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              {t('dailyWorker.tabs.master')}
            </button>
            <button 
              onClick={() => setActiveTab('MONTHLY_GRID')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'MONTHLY_GRID' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {t('dailyWorker.tabs.detail')}
            </button>
            <button 
              onClick={() => setActiveTab('HISTORY')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'HISTORY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              {t('dailyWorker.tabs.payroll')}
            </button>
            <button 
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'SETTINGS' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              {t('dailyWorker.tabs.settings')}
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
              return <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title={t('dailyWorker.statuses.present')}>H</span>;
            case 'HALF_DAY':
              return <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title={t('dailyWorker.statuses.half_day')}>½</span>;
            case 'SAKIT':
              return <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title={t('dailyWorker.statuses.sakit')}>S</span>;
            case 'IZIN':
              return <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title={t('dailyWorker.statuses.izin')}>I</span>;
            case 'ABSENT':
            case 'MANGKIR':
              return <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black shadow-sm" title={t('dailyWorker.statuses.absent')}>A</span>;
            default:
              return <span className="text-slate-300 font-normal">-</span>;
          }
        };

        const handleExportMonthlyGrid = (gridData, days, yearMonthStr) => {
          if (!gridData || gridData.length === 0) {
            alert(t('dailyWorker.alerts.noExportGrid'));
            return;
          }

          const lang = i18n.language || 'id';
          const isIndo = lang.startsWith('id');
          const isKo = lang.startsWith('ko');
          const isZh = lang.startsWith('zh');

          const headers = {
            no: isIndo ? 'No' : isKo ? '번호' : isZh ? '序号' : 'No',
            nik: 'NIK',
            name: isIndo ? 'Nama Lengkap' : isKo ? '성명' : isZh ? '姓名' : 'Full Name',
            dept: isIndo ? 'Departemen' : isKo ? '부서' : isZh ? '部门' : 'Department',
            section: isIndo ? 'Bagian / Section' : isKo ? '파트' : isZh ? '班组' : 'Section',
            hadir: isIndo ? 'Hadir (H)' : isKo ? '출석 (출)' : isZh ? '出勤 (出)' : 'Present (P)',
            halfDay: isIndo ? 'Setengah Hari (½)' : isKo ? '반차 (반)' : isZh ? '半天 (半)' : 'Half Day (½)',
            sakit: isIndo ? 'Sakit (S)' : isKo ? '병가 (병)' : isZh ? '病假 (病)' : 'Sick (S)',
            izin: isIndo ? 'Izin (I)' : isKo ? '공가 (공)' : isZh ? '事假 (事)' : 'Leave (L)',
            alpa: isIndo ? 'Alpa (A)' : isKo ? '결근 (결)' : isZh ? '缺勤 (缺)' : 'Absent (A)',
            effective: isIndo ? 'Hari Efektif' : isKo ? '실근무일수' : isZh ? '实际工日' : 'Effective Days'
          };

          const exportRows = gridData.map((emp, idx) => {
             const row = {
               [headers.no]: idx + 1,
               [headers.nik]: emp.employeeCode,
               [headers.name]: emp.name,
               [headers.dept]: emp.department,
               [headers.section]: emp.section || '-'
             };
            
            days.forEach(day => {
              const status = getDayStatus(emp, day, yearMonthStr);
              let statusChar = '-';
              if (status === 'PRESENT' || status === 'LATE') statusChar = isIndo ? 'H' : isKo ? '출' : isZh ? '出' : 'P';
              else if (status === 'HALF_DAY') statusChar = isIndo ? '½' : isKo ? '반' : isZh ? '半' : '½';
              else if (status === 'SAKIT') statusChar = isIndo ? 'S' : isKo ? '병' : isZh ? '病' : 'S';
              else if (status === 'IZIN') statusChar = isIndo ? 'I' : isKo ? '공' : isZh ? '事' : 'L';
              else if (status === 'ABSENT' || status === 'MANGKIR') statusChar = isIndo ? 'A' : isKo ? '결' : isZh ? '缺' : 'A';
              
              row[`${isIndo ? 'Tanggal' : isKo ? '날짜' : isZh ? '日期' : 'Date'} ${day}`] = statusChar;
            });
            
            row[headers.hadir] = emp.workingDays;
            row[headers.halfDay] = emp.halfDays;
            row[headers.sakit] = emp.sickDays;
            row[headers.izin] = emp.leaveDays;
            row[headers.alpa] = emp.absentDays;
            row[headers.effective] = emp.effectiveDays;
            
            return row;
          });

          const ws = XLSX.utils.json_to_sheet(exportRows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, isIndo ? "Detail Presensi BHL" : isKo ? "BHL 출석 상세" : isZh ? "BHL出勤明细" : "BHL Attendance Details");
          
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

          const filePrefix = isIndo ? 'Laporan_Kehadiran_BHL' : isKo ? 'BHL_출석_보고서' : isZh ? 'BHL_出勤报告' : 'BHL_Attendance_Report';
          XLSX.writeFile(wb, `${filePrefix}_${yearMonthStr}.xlsx`);
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
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('dailyWorker.filters.targetMonth')}</label>
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
                  <FileDown className="w-4 h-4" /> {t('dailyWorker.filters.exportGrid')}
                </button>
              </div>

              {/* Advanced Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('dailyWorker.filters.searchGrid')}</label>
                  <div className="relative group">
                    <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="text" 
                      placeholder={t('dailyWorker.filters.searchGridPlaceholder')} 
                      value={searchGrid}
                      onChange={(e) => setSearchGrid(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('dailyWorker.filters.department')}</label>
                  <select 
                    value={deptGrid}
                    onChange={(e) => { setDeptGrid(e.target.value); setSecGrid(''); }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm uppercase tracking-wider"
                  >
                    <option value="">{t('dailyWorker.filters.allDepartments')}</option>
                    {[...new Set(rawGridList.map(e => e.department).filter(Boolean))].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('dailyWorker.filters.section')}</label>
                  <select 
                    value={secGrid}
                    onChange={(e) => setSecGrid(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm uppercase tracking-wider"
                  >
                    <option value="">{t('dailyWorker.filters.allSections')}</option>
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
                    {t('dailyWorker.table.infoDetail', { count: filteredGridList.length })}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <th className="px-4 py-3 border-r border-slate-200 w-10 text-center bg-slate-50">{t('dailyWorker.table.no')}</th>
                      <th className="px-4 py-3 border-r border-slate-200 w-48 bg-slate-50">{t('dailyWorker.table.employee')}</th>
                      <th className="px-3 py-3 border-r border-slate-200 bg-slate-50">{t('dailyWorker.table.department')}</th>
                      <th className="px-3 py-3 border-r border-slate-200 bg-slate-50">{t('dailyWorker.table.section')}</th>
                      
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
                            <p className="text-xs font-bold text-slate-400">{t('dailyWorker.table.loadingGrid')}</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredGridList.length === 0 ? (
                      <tr>
                        <td colSpan={days.length + 10} className="text-center py-20">
                          <HardHat className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm font-bold text-slate-400">{t('dailyWorker.table.noEmployees')}</p>
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
              <span className="text-slate-400">{t('dailyWorker.legend.title')}</span>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black">H</span>
                <span>{t('dailyWorker.legend.present')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-[9px] font-black">½</span>
                <span>{t('dailyWorker.legend.halfDay')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-black">S</span>
                <span>{t('dailyWorker.legend.sick')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-black">I</span>
                <span>{t('dailyWorker.legend.leave')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-black">A</span>
                <span>{t('dailyWorker.legend.absent')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-normal">-</span>
                <span>{t('dailyWorker.legend.off')}</span>
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
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('dailyWorker.stats.totalEmployees')}</p>
              <h3 className="text-2xl font-black text-slate-800">{historyData?.totals?.totalEmployees || 0}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('dailyWorker.stats.totalWorkingDays')}</p>
              <h3 className="text-2xl font-black text-slate-800">{historyData?.totals?.totalWorkingDays || 0} <span className="text-sm font-medium text-slate-400">${t('dailyWorker.stats.days')}</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <FileDown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('dailyWorker.stats.totalEstimatedWage')}</p>
              <h3 className="text-2xl font-black text-slate-800">
                Rp {(historyData?.totals?.totalWage || 0).toLocaleString('id-ID')}
              </h3>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'INPUT' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div 
            onClick={() => setStatusFilter('')}
            className={`cursor-pointer transition-all p-4 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm text-center border ${
              statusFilter === '' ? 'ring-2 ring-slate-500 bg-slate-50/50 border-slate-400 scale-98 shadow-inner' : 'bg-white border-slate-200 hover:border-slate-300 hover:-translate-y-0.5'
            }`}
          >
            <span className="text-2xl font-black text-slate-800">{currentStats.total}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('dailyWorker.stats.registered')}</span>
          </div>
          <div 
            onClick={() => setStatusFilter(prev => prev === 'PRESENT' ? '' : 'PRESENT')}
            className={`cursor-pointer transition-all p-4 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm text-center border ${
              statusFilter === 'PRESENT' ? 'ring-2 ring-emerald-500 bg-emerald-50/50 border-emerald-400 scale-98 shadow-inner' : 'bg-white border-emerald-200 hover:border-emerald-300 bg-emerald-50/30 hover:-translate-y-0.5'
            }`}
          >
            <span className="text-2xl font-black text-emerald-600">{currentStats.present}</span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">{t('dailyWorker.stats.present')}</span>
          </div>
          <div 
            onClick={() => setStatusFilter(prev => prev === 'ABSENT' ? '' : 'ABSENT')}
            className={`cursor-pointer transition-all p-4 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm text-center border ${
              statusFilter === 'ABSENT' ? 'ring-2 ring-rose-500 bg-rose-50/50 border-rose-400 scale-98 shadow-inner' : 'bg-white border-rose-200 hover:border-rose-300 bg-rose-50/30 hover:-translate-y-0.5'
            }`}
          >
            <span className="text-2xl font-black text-rose-600">{currentStats.absent}</span>
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">{t('dailyWorker.stats.absent')}</span>
          </div>
          <div 
            onClick={() => setStatusFilter(prev => prev === 'OTHER' ? '' : 'OTHER')}
            className={`cursor-pointer transition-all p-4 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm text-center border ${
              statusFilter === 'OTHER' ? 'ring-2 ring-amber-500 bg-amber-50/50 border-amber-400 scale-98 shadow-inner' : 'bg-white border-amber-200 hover:border-amber-300 bg-amber-50/30 hover:-translate-y-0.5'
            }`}
          >
            <span className="text-2xl font-black text-amber-600">{currentStats.other}</span>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{t('dailyWorker.stats.other')}</span>
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
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('dailyWorker.filters.targetDate')}</label>
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
                  <FileDown className="w-4 h-4" /> {t('dailyWorker.filters.exportExcel')}
                </button>
              )}
            </div>

            {activeTab === 'INPUT' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 items-end bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('dailyWorker.filters.search')}</label>
                  <div className="relative group">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="text" 
                      placeholder={t('dailyWorker.filters.searchPlaceholder')} 
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
                        <option value="">{t('dailyWorker.filters.globalArchive')}</option>
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
                    ? t('dailyWorker.table.infoInput', { count: filteredEmployees.length })
                    : t('dailyWorker.table.infoPayroll', { month: selectedMonth, count: (historyData?.data || []).length })
                  }
                </p>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4 w-12 text-center">{t('dailyWorker.table.no')}</th>
                    <th className="px-6 py-4">{t('dailyWorker.table.employee')}</th>
                    <th className="px-4 py-4">{t('dailyWorker.table.department')}</th>
                    
                    {activeTab === 'INPUT' ? (
                      <th className="px-6 py-4 text-center bg-emerald-50/50 text-emerald-700">{t('dailyWorker.table.attendanceStatus')}</th>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-center">{t('dailyWorker.table.effectiveDays')}</th>
                        <th className="px-6 py-4 text-right">{t('dailyWorker.table.dailyRate')}</th>
                        <th className="px-6 py-4 text-right bg-emerald-50/50 text-emerald-700">{t('dailyWorker.table.totalWage')}</th>
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
                          <p className="text-xs font-bold text-slate-400">{t('dailyWorker.table.loading')}</p>
                        </div>
                      </td>
                    </tr>
                  ) : activeTab === 'INPUT' ? (
                    filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-20">
                          <HardHat className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm font-bold text-slate-400">{t('dailyWorker.table.noEmployees')}</p>
                          <p className="text-xs text-slate-400 mt-1">{t('dailyWorker.table.noEmployeesSub')}</p>
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
                                      {t('dailyWorker.statuses.' + opt.val.toLowerCase())}
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
                          {t('dailyWorker.table.noDataMonth')}
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
              <p className="text-[10px] font-bold text-slate-500 uppercase">{t('dailyWorker.floatingSave.title')}</p>
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
            <span>{t('dailyWorker.floatingSave.btnSave')}</span>
          </button>
        </div>
      )}

    </div>
  );
};

export default DailyWorkerAttendance;
