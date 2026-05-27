import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceAPI, employeeAPI, payrollAPI, settingsAPI } from '../../services/api';
import PrintableAttendanceReport from '../../components/payroll/PrintableAttendanceReport';
import { 
  Calendar, Search, Download, Filter, CheckCircle2, XCircle, Clock, 
  ArrowRight, Scan, Upload, FileSpreadsheet, X, Loader2, AlertCircle, RefreshCw,
  FileText, ChevronLeft, ChevronRight, LayoutDashboard, Edit2, ArrowUpDown,
  ArrowUp, ArrowDown, Printer
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_MAP = {
  'PRESENT': 'Hadir',
  'LATE': 'Terlambat',
  'ABSENT': 'Alpa',
  'MANGKIR': 'Mangkir',
  'HOLIDAY': 'Libur',
  'CUTI': 'Cuti',
  'SAKIT': 'Sakit',
  'IZIN': 'Izin'
};

const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
};

const Attendance = () => {
  const queryClient = useQueryClient();
  const [isImportOpen, setImportOpen] = useState(false);
  const [isRecalcModalOpen, setRecalcModalOpen] = useState(false);
  const [isSwapModalOpen, setSwapModalOpen] = useState(false);
  
  const [recalcRange, setRecalcRange] = useState({ start: '', end: '' });
  const [swapRange, setSwapRange] = useState({ sourceDate: '', targetDate: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'date', order: 'desc' });
  const [correctionModal, setCorrectionModal] = useState({ isOpen: false, recordId: null, employeeName: '', currentStatus: '', newStatus: 'CUTI', notes: '', overtimeHours: 0, checkInTime: '', checkOutTime: '', lateMinutes: 0, attachment: '' });

  const parseTimeForInput = (timeStr) => {
    if (!timeStr || timeStr.includes('--')) return '';
    const [time, modifier] = timeStr.split(' ');
    if (!time || !modifier) return timeStr;
    let [hours, minutes] = time.split(':');
    if (hours === '12') hours = '00';
    if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12);
    return `${hours.padStart(2, '0')}:${minutes}`;
  };
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [importProgress, setImportProgress] = useState({ percent: 0, phase: '', detail: '' });
  const [appliedFilters, setAppliedFilters] = useState({
    page: 1,
    period: 'Today',
    startDate: '',
    endDate: '',
    dept: '',
    section: '',
    position: '',
    status: '',
    search: '',
    sortBy: 'date',
    order: 'desc'
  });

  const [isReportModalOpen, setReportModalOpen] = useState(false);
  const [reportEmployees, setReportEmployees] = useState(null);
  const [reportSearch, setReportSearch] = useState('');
  const [reportDept, setReportDept] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [companySettings, setCompanySettings] = useState({});
  const [attendanceReportConfig, setAttendanceReportConfig] = useState(null);
  const [printReport, setPrintReport] = useState(null);
  const [printLogs, setPrintLogs] = useState([]);

  const fetchReportSettings = async () => {
    try {
      const res = await settingsAPI.getAll();
      setCompanySettings(res.data);
      if (res.data.attendanceReportConfig) {
        setAttendanceReportConfig(JSON.parse(res.data.attendanceReportConfig));
      } else if (res.data.slipConfig) {
        setAttendanceReportConfig(JSON.parse(res.data.slipConfig));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openReportModal = async () => {
    setReportModalOpen(true);
    setReportEmployees(null);
    setReportSearch('');
    setReportDept('');
    fetchReportSettings();
    try {
      const res = await employeeAPI.getAll({ limit: 10000 });
      setReportEmployees(res.data || []);
    } catch (err) {
      console.error(err);
      setReportEmployees([]);
    }
  };


      
  const [printReports, setPrintReports] = useState([]);
  
  const handlePrintAllReports = async () => {
    try {
      const filteredEmps = reportEmployees.filter(emp => {
        const searchLower = reportSearch.toLowerCase();
        const matchSearch = emp.name.toLowerCase().includes(searchLower) || 
                            (emp.id || '').toLowerCase().includes(searchLower);
        const matchDept = reportDept ? (emp.dept || 'UMUM') === reportDept : true;
        return matchSearch && matchDept;
      });

      if (filteredEmps.length === 0) {
        alert('Tidak ada data karyawan yang sesuai filter.');
        return;
      }
      
      if (filteredEmps.length > 50) {
         if(!window.confirm(`Anda akan mencetak ${filteredEmps.length} laporan sekaligus. Proses ini mungkin memakan waktu. Lanjutkan?`)) return;
      }

      const year = parseInt(selectedMonth.split('-')[0]);
      const monthIdx = parseInt(selectedMonth.split('-')[1]) - 1;
      const startDate = new Date(year, monthIdx, 1).toISOString().split('T')[0];
      const endDate = new Date(year, monthIdx + 1, 0).toISOString().split('T')[0];
      const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
      const periodName = `${monthNames[monthIdx]} ${year}`;

      const reportsArray = [];
      for(const emp of filteredEmps) {
        const res = await attendanceAPI.getHistory(emp.dbId, { startDate, endDate });
        const logs = res.data || [];
        
        let daysPresent = 0;
        let totalLateMinutes = 0;
        logs.forEach(log => {
          if (log.status === 'PRESENT' || log.status === 'LATE' || log.status === 'Hadir' || log.status === 'Terlambat') {
             daysPresent++;
          }
          if (log.status === 'LATE' || log.status === 'Terlambat') {
             totalLateMinutes += (log.lateMinutes || 0);
          }
          if (log.status === 'MANGKIR' || log.status === 'MISSING' || log.status === 'ABSENT' || log.status === 'Tanpa Keterangan (Alpa)') {
             totalLateMinutes += 30;
          }
        });
        
        reportsArray.push({
          detail: {
            employeeId: emp.dbId,
            employeeName: emp.name,
            employeeCode: emp.id,
            department: emp.dept || 'UMUM',
            employmentType: emp.employmentStatus || 'TETAP',
            daysPresent,
            totalLateMinutes,
            payroll: { periodName }
          },
          logs
        });
      }
      
      setPrintReports(reportsArray);
      
      setTimeout(() => {
        window.print();
        setTimeout(() => { setPrintReports([]); }, 1000);
      }, 1000);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil rincian absensi masal');
    }
  };

  const handlePrintReport = async (emp) => {
    try {
      const year = parseInt(selectedMonth.split('-')[0]);
      const monthIdx = parseInt(selectedMonth.split('-')[1]) - 1;
      
      const startDate = new Date(year, monthIdx, 1).toISOString().split('T')[0];
      const endDate = new Date(year, monthIdx + 1, 0).toISOString().split('T')[0];
      
      const res = await attendanceAPI.getHistory(emp.dbId, { startDate, endDate });
      const logs = res.data || [];
      
      let daysPresent = 0;
      let totalLateMinutes = 0;
      
      logs.forEach(log => {
        if (log.status === 'PRESENT' || log.status === 'LATE' || log.status === 'Hadir' || log.status === 'Terlambat') {
           daysPresent++;
        }
        if (log.status === 'LATE' || log.status === 'Terlambat') {
           totalLateMinutes += (log.lateMinutes || 0);
        }
        if (log.status === 'MANGKIR' || log.status === 'MISSING' || log.status === 'ABSENT' || log.status === 'Tanpa Keterangan (Alpa)') {
           totalLateMinutes += 30;
        }
      });
      
      const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
      const periodName = `${monthNames[monthIdx]} ${year}`;

      const detail = {
        employeeId: emp.dbId,
        employeeName: emp.name,
        employeeCode: emp.id,
        department: emp.dept || 'UMUM',
        employmentType: emp.employmentStatus || 'TETAP',
        daysPresent,
        totalLateMinutes,
        payroll: { periodName }
      };
      
      setPrintReports([{ detail, logs }]);
      
      setTimeout(() => {
        window.print();
        setTimeout(() => { setPrintReports([]); }, 1000);
      }, 500);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil rincian absensi');
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', appliedFilters],
    queryFn: () => attendanceAPI.getAll(appliedFilters),
  });

  let filteredData = data?.data || [];
  let displaySummary = data?.summary || null;

  if (!isLoading && data?.summary?.uniqueEmployeeCount === 1 && appliedFilters.search && filteredData.length > 0) {
    let startDate, endDate;
    if (appliedFilters.period === 'This Month') {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      // Padded to the end of the month
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); 
    } else if (appliedFilters.period === 'Custom' && appliedFilters.startDate && appliedFilters.endDate) {
      startDate = new Date(appliedFilters.startDate);
      endDate = new Date(appliedFilters.endDate);
    }

    if (startDate && endDate) {
      const padData = [];
      const dataMap = {};
      
      // Simpan data asli ke map untuk lookup cepat berdasarkan tanggal absolut ISO
      filteredData.forEach(r => {
        // Gunakan date parser yang kuat untuk menstandarisasi key
        const parsedObj = new Date(r.date);
        const isoMatch = `${parsedObj.getFullYear()}-${String(parsedObj.getMonth()+1).padStart(2,'0')}-${String(parsedObj.getDate()).padStart(2,'0')}`;
        dataMap[isoMatch] = r; 
      });

      const empRef = filteredData[0]; // Ambil data master karyawan dari row pertama
      const overrides = data?.summary?.calendarOverrides || [];
      const overrideMap = {};
      overrides.forEach(c => {
         const dStr = c.date.split('T')[0];
         overrideMap[dStr] = c.type;
      });
      const workingDays = data?.summary?.workingDays || [1,2,3,4,5]; // default mon-fri

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const isoKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const displayDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
        
        if (dataMap[isoKey]) {
          padData.push(dataMap[isoKey]);
        } else {
          const isoDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().split('T')[0];
          const dayOfWeek = d.getDay();
          const overrideType = overrideMap[isoDate];
          
          let isLibur = false;
          if (overrideType) {
             isLibur = overrideType === 'HOLIDAY';
          } else {
             isLibur = !workingDays.includes(dayOfWeek);
          }

          padData.push({
            id: `pad-${d.getTime()}`, // Fake ID untuk key React
            name: empRef.name,
            employeeCode: empRef.employeeCode,
            dept: empRef.dept,
            section: empRef.section,
            position: empRef.position,
            date: displayDate,
            checkIn: '--:--',
            checkOut: '--:--',
            status: isLibur ? 'Libur' : 'Alpa',
            lateMinutes: 0, // Alpa sanksi +30m dihitung terpisah di kolom Terlambat
            overtimeHours: 0,
            mode: '-',
          });
        }
      }
      // Adjust order based on sortConfig
      if (sortConfig.order === 'desc') {
        filteredData = padData.reverse(); 
      } else {
        filteredData = padData; 
      }

      // Compute displaySummary from the padded data 
      displaySummary = {
        total: filteredData.length,
        hadir: filteredData.filter(d => d.status === 'Hadir').length,
        telat: filteredData.filter(d => d.status === 'Terlambat').length,
        mangkir: filteredData.filter(d => d.status === 'Mangkir').length,
        absen: filteredData.filter(d => d.status === 'Alpa').length,
        holiday: filteredData.filter(d => d.status === 'Libur').length,
        cuti: filteredData.filter(d => d.status === 'Cuti').length,
        sakit: filteredData.filter(d => d.status === 'Sakit').length,
        izin: filteredData.filter(d => d.status === 'Izin').length,
        totalLate: filteredData.reduce((sum, d) => sum + (d.lateMinutes || 0) + ((d.status === 'Mangkir' || d.status === 'Alpa') ? 30 : 0), 0),
        uniqueEmployeeCount: 1
      };
    }
  }

  const handleSort = (key) => {
    const newOrder = sortConfig.key === key && sortConfig.order === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, order: newOrder });
    setAppliedFilters(prev => ({ ...prev, sortBy: key, order: newOrder, page: 1 }));
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortConfig.order === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    setIsCorrecting(true);
    try {
      await attendanceAPI.update(correctionModal.recordId, { 
        status: correctionModal.newStatus, 
        notes: correctionModal.notes, 
        overtimeHours: correctionModal.overtimeHours,
        checkInTime: correctionModal.checkInTime,
        checkOutTime: correctionModal.checkOutTime,
        lateMinutes: correctionModal.lateMinutes,
        attachment: correctionModal.attachment
      });
      setCorrectionModal({ isOpen: false, recordId: null, employeeName: '', currentStatus: '', newStatus: 'CUTI', notes: '', overtimeHours: 0, checkInTime: '', checkOutTime: '', lateMinutes: 0, attachment: '' });
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      alert('Status absensi berhasil dikoreksi!');
    } catch (err) {
      alert(`Gagal koreksi data: ${err.message}`);
    } finally {
      setIsCorrecting(false);
    }
  };

  const handleRecalculate = async () => {
    if (!recalcRange.start || !recalcRange.end) {
      alert('Pilih rentang tanggal terlebih dahulu.');
      return;
    }
    
    setIsRecalculating(true);
    try {
      const res = await attendanceAPI.recalculate(recalcRange.start, recalcRange.end);
      alert(res.message);
      setRecalcModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSwapDays = async () => {
    if (!swapRange.sourceDate || !swapRange.targetDate) {
      alert('Pilih Tanggal Sumber dan Tanggal Tujuan');
      return;
    }
    
    if (swapRange.sourceDate === swapRange.targetDate) {
      alert('Tanggal Sumber dan Tujuan tidak boleh sama');
      return;
    }

    if (!window.confirm(`Peringatan: Aksi ini akan MEMINDAHKAN SELURUH DATA ABSENSI dari ${swapRange.sourceDate} ke ${swapRange.targetDate} secara permanen. Lanjutkan?`)) {
      return;
    }

    setIsRecalculating(true);
    try {
      const res = await attendanceAPI.swapDays(swapRange.sourceDate, swapRange.targetDate);
      alert(res.message || 'Berhasil menukar data absensi');
      setSwapModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch (err) {
      alert(`Gagal menukar data absensi: ${err.message}`);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const jobId = `att_${Date.now()}`;
    setIsUploading(true);
    setImportResult(null);
    setImportProgress({ percent: 0, phase: 'initializing', detail: 'Menyiapkan upload...' });

    // Polling function for progress
    const pollInterval = setInterval(async () => {
      try {
        const progressRes = await attendanceAPI.getImportProgress(jobId);
        if (progressRes.success) {
          setImportProgress({
            percent: progressRes.progress,
            phase: progressRes.phase,
            detail: progressRes.detail
          });
        }
      } catch (err) {
        console.error('Progress polling error:', err);
      }
    }, 800);

    try {
      const res = await attendanceAPI.importExcel(file, jobId);
      setImportResult(res);
      // HARD REFRESH: Force the UI to discard cache and fetch fresh database records
      await queryClient.resetQueries({ queryKey: ['attendance'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch (err) {
      setImportResult({ success: false, message: err.message });
    } finally {
      clearInterval(pollInterval);
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleExportExcel = () => {
    // Sort data ascending by date (oldest first)
    const sortedData = [...filteredData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const exportData = sortedData.map(row => {
      const penalty = (row.status === 'MANGKIR' || row.status === 'MISSING') ? 30 : 0;
      return {
        'Employee Name': row.name,
        'Department': row.dept,
        'Section': row.section,
        'Position': row.position,
        'Date': row.date,
        'Check In': row.checkIn,
        'Check Out': row.checkOut,
        'Late Minutes': (row.lateMinutes || 0) + penalty,
        'Status': row.status,
        'Mode': row.mode
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_Report_${appliedFilters.period}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235); // Blue 600 accent
    doc.text('SMART ATTENDANCE PRO', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Report Period: ${appliedFilters.period} (${appliedFilters.startDate || '-'} to ${appliedFilters.endDate || '-'})`, 14, 28);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 33);

    const total = filteredData.length;
    const late = filteredData.filter(r => r.status === 'Terlambat').length;
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(pageWidth - 80, 15, 66, 22, 3, 3, 'FD');
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('SUMMARY STATISTICS', pageWidth - 76, 21);
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Total: ${total} | Late: ${late}`, pageWidth - 76, 28);

    // Sort data ascending by date (oldest first)
    const sortedData = [...filteredData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const tableData = sortedData.map(row => {
      const penalty = (row.status === 'MANGKIR' || row.status === 'MISSING') ? 30 : 0;
      return [
        row.name,
        row.dept,
        row.section,
        row.position,
        row.date,
        row.checkIn,
        row.checkOut,
        `${(row.lateMinutes || 0) + penalty} min`,
        row.status
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: [['Employee', 'Dept', 'Section', 'Position', 'Date', 'In', 'Out', 'Late', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8, halign: 'center' },
      styles: { fontSize: 7, cellPadding: 2, fillColor: [255, 255, 255], textColor: [51, 65, 85] },
      columnStyles: {
        7: { halign: 'center', fontStyle: 'bold' },
        8: { halign: 'center' }
      }
    });

    doc.save(`Attendance_Report_${new Date().getTime()}.pdf`);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await attendanceAPI.getTemplate(); // Use the standardized service call
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'attendance_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download error:', err);
      alert('Gagal mengunduh template');
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="print:hidden space-y-8">
      {/* Header */}
      <div className="px-1 space-y-3">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <LayoutDashboard className="w-3 h-3 text-slate-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Administrative Oversight</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Hardware Sync Hub</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
          <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3 whitespace-nowrap">
            <span>Attendance Archive</span>
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              Live Terminal Feed
            </div>
          </h1>

          {/* Right Actions - Inline */}
          <div className="flex flex-row flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200 shadow-sm shrink-0">
              <button 
                onClick={() => setRecalcModalOpen(true)}
                disabled={isRecalculating}
                className="group flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all border border-slate-200 shadow-sm active:scale-95 uppercase tracking-wider"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} /> 
                <span>Sync</span>
              </button>
              <button 
                onClick={() => setSwapModalOpen(true)}
                className="group flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all border border-slate-200 shadow-sm active:scale-95 uppercase tracking-wider"
              >
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-500" /> 
                <span>Geser</span>
              </button>
              <button 
                onClick={() => setImportOpen(true)}
                className="group flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold text-slate-600 hover:text-emerald-600 hover:border-emerald-200 transition-all border border-slate-200 shadow-sm active:scale-95 uppercase tracking-wider"
              >
                <Upload className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" /> 
                <span>Upload</span>
              </button>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200 shadow-sm">
              <button 
                onClick={openReportModal}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-all group shadow-sm"
                title="Cetak Laporan Absen (Individu)"
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover:text-emerald-600 transition-all" />
              </button>
              <button 
                onClick={handleExportPDF}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-all group shadow-sm"
                title="Export PDF Document"
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover:text-rose-600 transition-all" />
              </button>
              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 group"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:rotate-12 transition-transform" /> 
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Filter */}
      <FilterBar 
        onApply={setAppliedFilters}
        isLoading={isLoading}
        currentSearch={appliedFilters.search}
      />

      {/* Operational Summary Metrics */}
      {!isLoading && displaySummary && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: 'Total Data', value: displaySummary.total, color: 'blue', icon: Filter, desc: 'Semua Absen' },
              { label: 'Hadir', value: displaySummary.hadir, color: 'emerald', icon: CheckCircle2, desc: 'Tepat Waktu' },
              { label: 'Terlambat', value: displaySummary.telat, color: 'amber', icon: Clock, desc: 'Pelanggaran Waktu' },
              { label: 'Mangkir', value: displaySummary.mangkir, color: 'rose', icon: AlertCircle, desc: 'Kurang Finger (+30m)' },
              { label: 'Alpa', value: displaySummary.absen, color: 'red', icon: XCircle, desc: 'Tidak Ada Finger' },
              { label: 'Total Terlambat', value: formatDuration(displaySummary.totalLate || 0), color: 'rose', icon: Clock, desc: 'Akumulasi Waktu' },
              { label: 'Lainnya', value: (displaySummary.holiday || 0) + (displaySummary.cuti || 0) + (displaySummary.sakit || 0) + (displaySummary.izin || 0), color: 'slate', icon: Calendar, desc: 'Libur/Cuti/Sakit' },
            ].map((item) => (
              <div key={item.label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 hover:shadow-md hover:border-blue-200 transition-all group">
                <div className="flex justify-between items-start">
                  <div className={`w-8 h-8 rounded-xl bg-${item.color}-50 flex items-center justify-center border border-${item.color}-100 transition-transform group-hover:scale-110 group-hover:-rotate-3`}>
                    <item.icon className={`w-4 h-4 text-${item.color}-600`} />
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                  <p className="text-lg font-bold text-slate-800 leading-tight">{item.value}</p>
                </div>
                <div className="pt-2 border-t border-slate-50">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Individual Search Summary Card */}
          {appliedFilters.search && displaySummary.uniqueEmployeeCount === 1 && displaySummary.totalLate > 0 && (
            <div className="bg-gradient-to-r from-rose-500 to-orange-600 rounded-2xl p-0.5 shadow-lg shadow-rose-100 animate-in slide-in-from-top-4 duration-500">
              <div className="bg-white rounded-[14px] p-6 flex items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center border border-rose-100 shadow-inner shrink-0 group-hover:rotate-6 transition-transform">
                    <Clock className="w-8 h-8 text-rose-600 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Akumulasi Terlambat Personal</h3>
                    <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                      {formatDuration(displaySummary.totalLate)}
                    </p>
                    <p className="text-[10px] font-bold text-rose-500 uppercase mt-2 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Termasuk sanksi alpa (+30 menit/hari)
                    </p>
                  </div>
                </div>
                <div className="hidden lg:block h-16 w-px bg-slate-100" />
                <div className="hidden lg:flex flex-col items-end text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Employee Profile</p>
                  <p className="text-2xl font-black text-slate-800 uppercase">{data?.data[0]?.name}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Central Intelligence Data Grid */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shadow-[0_0_5px_rgba(37,99,235,0.5)]" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Data Absensi <span className="text-slate-300 mx-2">|</span> 
              Total Data: <span className="text-slate-700 ml-1">{displaySummary?.total || 0} Baris</span>
            </p>
          </div>
        </div>
        
        <div className="relative overflow-auto min-h-[600px] hide-scrollbar custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="sticky top-0 z-30 bg-slate-50 border-b border-slate-100 shadow-sm">
              <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <th className="px-6 py-4">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-2 group/btn">
                    Nama Karyawan
                    <SortIcon column="name" />
                  </button>
                </th>
                <th className="px-4 py-4">
                  <button onClick={() => handleSort('date')} className="flex items-center gap-2 group/btn">
                    Tanggal
                    <SortIcon column="date" />
                  </button>
                </th>
                <th className="px-4 py-4 text-center">Jam Masuk</th>
                <th className="px-4 py-4 text-center">Jam Keluar</th>
                <th className="px-6 py-4">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-2 mx-auto group/btn">
                    Status
                    <SortIcon column="status" />
                  </button>
                </th>
                <th className="px-4 py-4 text-center">Terlambat</th>
                <th className="px-4 py-4 text-center">Lembur (Jam)</th>
                <th className="px-4 py-4">
                  <button onClick={() => handleSort('dept')} className="flex items-center gap-2 group/btn">
                    Departemen
                    <SortIcon column="dept" />
                  </button>
                </th>
                <th className="px-4 py-4">Bagian / Seksi</th>
                <th className="px-4 py-4">Jabatan</th>
                <th className="px-4 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">Memuat Data...</p>
                    </div>
                  </td>
                </tr>
              ) : (!filteredData || filteredData.length === 0) ? (
                <tr>
                  <td colSpan="9" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4 opacity-70">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                        <Calendar className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Kosong</p>
                      <p className="text-[9px] text-slate-400 uppercase font-medium">Tidak ada data absensi untuk periode ini</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <tr
                    key={row.id}
                    className="group transition-all duration-300 hover:bg-blue-50/50"
                  >
                    <td 
                      className="px-6 py-4 cursor-pointer group/name"
                      onClick={() => {
                        setAppliedFilters(prev => ({ ...prev, search: row.name, page: 1 }));
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800 tracking-tight group-hover/name:text-blue-600 transition-colors uppercase">{row.name}</span>
                        <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5 group-hover/name:text-blue-400">{row.employeeCode || 'SYS_ID_ERR'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{row.date}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-bold text-slate-800 tracking-widest">{row.checkIn || '--:--'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-rose-500" />
                        <span className="text-xs font-bold text-slate-800 tracking-widest">{row.checkOut || '--:--'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all ${
                        row.status === 'Hadir' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                        row.status === 'Terlambat' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        row.status === 'Alpa' || row.status === 'Mangkir' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                        row.status === 'Libur' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                        row.status === 'Cuti' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                        row.status === 'Sakit' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                        row.status === 'Izin' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                        'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {row.status === 'Terlambat' || row.status === 'LATE' ? (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">+{row.lateMinutes}m</span>
                      ) : (row.status === 'Mangkir' || row.status === 'MANGKIR') ? (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">+30m</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {row.overtimeHours > 0 ? (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">{row.overtimeHours}h</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200 uppercase tracking-widest">{row.dept || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-4 text-[10px] font-bold text-slate-600 uppercase tracking-wider">{row.section || '—'}</td>
                    <td className="px-4 py-4 text-[10px] font-bold text-slate-600 uppercase tracking-wider">{row.position || '—'}</td>
                    <td className="px-4 py-4 text-center">
                      <button 
                        onClick={() => setCorrectionModal({
                          isOpen: true,
                          recordId: row.id,
                          employeeName: row.name,
                          currentStatus: row.status,
                          newStatus: 'CUTI',
                          newStatus: row.status !== 'PRESENT' && row.status !== 'Hadir' ? 'PRESENT' : 'PRESENT',
                          notes: '',
                          overtimeHours: row.overtimeHours || 0,
                          checkInTime: parseTimeForInput(row.checkIn),
                          checkOutTime: parseTimeForInput(row.checkOut),
                          lateMinutes: row.lateMinutes || 0,
                          attachment: ''
                        })}
                        className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-200 transition-all"
                        title="Koreksi Status"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Controller */}
        {!isLoading && filteredData.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Registry Page <span className="text-slate-800 mx-1">{appliedFilters.page}</span> / <span className="text-slate-600 ml-1">{data?.totalPages || 1}</span>
              </p>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Total Nodes: <span className="text-blue-600 font-bold">{data?.total || 0}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={appliedFilters.page <= 1}
                onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95 text-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={appliedFilters.page >= (data?.totalPages || 1)}
                onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95 text-slate-600"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Sync Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !isUploading && setImportOpen(false)} />
          
          <div className="bg-white w-full max-w-xl relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg tracking-tight">Terminal Sync</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Mass Biometric Ingestion</p>
                </div>
              </div>
              <button onClick={() => !isUploading && setImportOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8">
              {!importResult && !isUploading ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 group hover:border-blue-300 transition-all">
                      <Scan className="w-5 h-5 text-blue-600 mb-3" />
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Architecture</p>
                      <p className="text-[10px] text-slate-800 font-bold uppercase tracking-tighter">NIK_PROTOCOL_V2</p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 group hover:border-emerald-300 transition-all">
                      <Calendar className="w-5 h-5 text-emerald-600 mb-3" />
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Temporal Range</p>
                      <p className="text-[10px] text-slate-800 font-bold uppercase tracking-tighter">MULTI_VECTOR_SYNC</p>
                    </div>
                  </div>

                  <label className="group block relative cursor-pointer">
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImport} />
                    <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center transition-all group-hover:border-blue-400 group-hover:bg-blue-50/50">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6 transition-all group-hover:scale-110 group-hover:border-blue-200">
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
                      </div>
                      <h4 className="font-bold text-slate-800 uppercase tracking-wider text-sm">Inject Local Archives</h4>
                      <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-wider">Matrix: XLSX, XLS, CSV</p>
                      
                      <div className="mt-8 px-8 py-3 bg-slate-100 group-hover:bg-blue-600 text-slate-600 group-hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
                        SELECT TERMINAL LOG
                      </div>
                    </div>
                  </label>
                </div>
              ) : isUploading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="relative mb-8">
                    <div className="w-24 h-24 border-4 border-slate-100 rounded-full" />
                    <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0 shadow-[0_0_20px_rgba(37,99,235,0.2)]" />
                    <div className="absolute inset-0 flex items-center justify-center text-blue-600 font-bold text-lg">
                      {importProgress.percent}%
                    </div>
                  </div>
                  
                  <div className="w-full max-w-sm space-y-4">
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                        style={{ width: `${importProgress.percent}%` }}
                      />
                    </div>
                    
                    <div className="text-center">
                      <h4 className="font-bold text-slate-800 uppercase tracking-wider text-sm">
                        {importProgress.phase === 'saving' ? 'Committing to Database' : 
                         importProgress.phase === 'parsing' ? 'Parsing Matrix' :
                         importProgress.phase === 'matching' ? 'Employee Mapping' :
                         'Ingesting Log Nodes'}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest animate-pulse">
                        {importProgress.detail || 'Processing...'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                  <div className={`p-6 rounded-2xl flex items-center gap-6 border ${importResult.success ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${importResult.success ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                      {importResult.success ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg tracking-tight">{importResult.success ? 'Import Selesai' : 'Import Gagal'}</h4>
                      <p className="text-[11px] text-slate-600 font-medium mt-1 leading-relaxed">{importResult.message}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Baris Excel', val: importResult.data?.totalRows, color: 'blue' },
                      { label: 'Berhasil Diproses', val: importResult.data?.imported, color: 'emerald' },
                      { label: 'Tidak Ditemukan', val: importResult.data?.unmatchedCount || 0, color: 'rose' },
                    ].map((m, i) => (
                      <div key={i} className={`bg-white p-5 rounded-2xl border border-slate-200 flex flex-col items-center transition-all shadow-sm`}>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">{m.label}</span>
                        <span className={`text-3xl font-bold tracking-tight text-${m.color}-600`}>{m.val || 0}</span>
                      </div>
                    ))}
                  </div>

                  {/* Unmatched Employees List */}
                  {importResult.data?.unmatched?.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 bg-rose-100/50 border-b border-rose-200 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span className="text-[10px] font-bold text-rose-700 uppercase tracking-widest">
                          Karyawan Tidak Ditemukan di Sistem ({importResult.data.unmatched.length})
                        </span>
                      </div>
                      <div className="p-4 max-h-48 overflow-y-auto space-y-1.5">
                        {importResult.data.unmatched.map((name, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-rose-100">
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span className="text-xs font-semibold text-slate-700">{name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-5 py-3 bg-rose-100/30 border-t border-rose-200">
                        <p className="text-[9px] text-rose-600 font-bold uppercase tracking-wider">
                          Pastikan nama dan NIK karyawan di atas sudah terdaftar di menu Employees sebelum import ulang.
                        </p>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setImportResult(null)}
                    className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    TUTUP
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audit Reconstruction Modal */}
      {isRecalcModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !isRecalculating && setRecalcModalOpen(false)}></div>
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <RefreshCw className={`w-5 h-5 text-blue-600 ${isRecalculating ? 'animate-spin' : ''}`} />
                </div>
                <h3 className="font-bold text-slate-800 text-lg tracking-tight">Audit Recon</h3>
              </div>
              <button onClick={() => !isRecalculating && setRecalcModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl flex gap-4">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-[10px] text-blue-800 leading-relaxed font-bold uppercase tracking-wider">
                  Caution: This protocol forces a deep recalculation of check-in latencies against defined shift parameters.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Temporal Start</label>
                  <input 
                    type="date" 
                    value={recalcRange.start}
                    onChange={(e) => setRecalcRange({...recalcRange, start: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Temporal End</label>
                  <input 
                    type="date" 
                    value={recalcRange.end}
                    onChange={(e) => setRecalcRange({...recalcRange, end: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button onClick={() => setRecalcModalOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl uppercase tracking-wider transition-all">Abort</button>
              <button 
                disabled={isRecalculating}
                onClick={handleRecalculate}
                className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 transition-all"
              >
                {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : 'Execute Audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Attendance Modal */}
      {isSwapModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !isRecalculating && setSwapModalOpen(false)}></div>
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shadow-sm">
                  <RefreshCw className={`w-5 h-5 text-indigo-600 ${isRecalculating ? 'animate-spin' : 'rotate-90'}`} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg tracking-tight">Geser Data Absensi</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Tukar Hari Otomatis</p>
                </div>
              </div>
              <button onClick={() => !isRecalculating && setSwapModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl flex gap-4">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <p className="text-[10px] text-amber-800 leading-relaxed font-bold uppercase tracking-wider">
                  Fitur ini akan secara massal MEMINDAHKAN jam absensi fisik seluruh karyawan dari Tanggal Sumber ke Tanggal Tujuan. Berguna untuk merapikan laporan akibat "Tukar Hari".
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 relative">
                <div className="space-y-2 relative z-10">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tanggal Sumber (Ada Data Fisik)</label>
                  <input 
                    type="date" 
                    value={swapRange.sourceDate}
                    onChange={(e) => setSwapRange({...swapRange, sourceDate: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
                  />
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Contoh: 17 Agustus (Karyawan masuk & scan mesin)</p>
                </div>
                
                <div className="absolute left-8 top-1/2 -translate-y-1/2 w-0.5 h-16 bg-slate-200 z-0 border-l border-dashed border-slate-300"></div>

                <div className="space-y-2 relative z-10">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tanggal Tujuan (Data Akan Dipindah)</label>
                  <input 
                    type="date" 
                    value={swapRange.targetDate}
                    onChange={(e) => setSwapRange({...swapRange, targetDate: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
                  />
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Contoh: 18 Agustus (Hari pengganti, mesin kosong)</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button onClick={() => setSwapModalOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl uppercase tracking-wider transition-all">Batal</button>
              <button 
                disabled={isRecalculating}
                onClick={handleSwapDays}
                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 transition-all"
              >
                {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : 'Mulai Pindahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Correction Modal */}
      {correctionModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !isCorrecting && setCorrectionModal(prev => ({ ...prev, isOpen: false }))} />
          
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100 shadow-sm">
                  <Edit2 className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg tracking-tight">Koreksi Absensi</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{correctionModal.employeeName}</p>
                </div>
              </div>
              <button onClick={() => !isCorrecting && setCorrectionModal(prev => ({ ...prev, isOpen: false }))} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8">
              <form onSubmit={handleCorrectionSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Status Saat Ini</label>
                  <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700">
                    {correctionModal.currentStatus}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Pilih Status Baru</label>
                  <select
                    value={correctionModal.newStatus}
                    onChange={(e) => setCorrectionModal(prev => ({ ...prev, newStatus: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold text-slate-700 outline-none transition-all"
                    required
                  >
                    <option value="CUTI">Cuti</option>
                    <option value="SAKIT">Sakit</option>
                    <option value="IZIN">Izin</option>
                    <option value="ABSENT">Alpa</option>
                    <option value="MANGKIR">Mangkir (Kurang Finger)</option>
                    <option value="HOLIDAY">Libur</option>
                    <option value="PRESENT">Hadir (Manual)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Jam Masuk (Manual)</label>
                    <input
                      type="time"
                      value={correctionModal.checkInTime}
                      onChange={(e) => setCorrectionModal(prev => ({ ...prev, checkInTime: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold text-slate-700 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Jam Keluar (Manual)</label>
                    <input
                      type="time"
                      value={correctionModal.checkOutTime}
                      onChange={(e) => setCorrectionModal(prev => ({ ...prev, checkOutTime: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold text-slate-700 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Pemutihan Terlambat (Menit)</label>
                    <input
                      type="number"
                      min="0"
                      value={correctionModal.lateMinutes}
                      onChange={(e) => setCorrectionModal(prev => ({ ...prev, lateMinutes: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold text-slate-700 outline-none transition-all"
                      placeholder="Contoh: 0"
                    />
                     <p className="text-[9px] text-slate-400 mt-1">Ubah ke 0 untuk menghapus denda terlambat HRD.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Jam Lembur Manual</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={correctionModal.overtimeHours}
                      onChange={(e) => setCorrectionModal(prev => ({ ...prev, overtimeHours: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold text-slate-700 outline-none transition-all"
                      placeholder="Contoh: 2.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Upload Form Koreksi / SPV (Opsional)</label>
                  <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">
                      {correctionModal.attachment ? "Dokumen Terlampir" : "Pilih File Gambar..."}
                    </span>
                    <input 
                       type="file" 
                       accept="image/*" 
                       className="hidden" 
                       onChange={(e) => {
                         const file = e.target.files[0];
                         if (file) {
                           const reader = new FileReader();
                           reader.onloadend = () => setCorrectionModal(prev => ({ ...prev, attachment: reader.result }));
                           reader.readAsDataURL(file);
                         }
                       }} 
                     />
                  </label>
                </div>


                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Keterangan / Alasan (Opsional)</label>
                  <textarea
                    value={correctionModal.notes}
                    onChange={(e) => setCorrectionModal(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium text-slate-700 outline-none transition-all resize-none h-24"
                    placeholder="Masukkan alasan koreksi status..."
                  />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCorrectionModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all text-xs uppercase tracking-wider"
                    disabled={isCorrecting}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isCorrecting}
                    className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
                  >
                    {isCorrecting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Simpan Koreksi</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Cetak Laporan Absen (Individu) Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setReportModalOpen(false)}></div>
          <div className="bg-white w-full max-w-4xl relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 shadow-sm">
                  <Printer className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg tracking-tight">Cetak Laporan Absensi</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Laporan Rekapitulasi per Individu</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintAllReports} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm active:scale-95">
                  <Printer className="w-3.5 h-3.5" /> Cetak Semua
                </button>
                <button onClick={() => setReportModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            
            <div className="p-6 border-b border-slate-100 flex flex-col gap-4 bg-white shrink-0">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="w-full md:w-1/3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Pilih Periode Bulan</label>
                  <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 uppercase"
                  />
                </div>
                <div className="w-full md:w-2/3 bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-start gap-3 mt-4 md:mt-0">
                  <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
                  <p className="text-xs text-blue-800 font-medium leading-relaxed">
                    Laporan akan ditarik secara <span className="font-bold">Real-Time</span> dari riwayat absensi pada bulan terpilih, lengkap dengan format A4 dan detail keterlambatan.
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <div className="w-full md:w-1/2 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Cari Nama / NIK Karyawan..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                  />
                </div>
                <div className="w-full md:w-1/2 relative">
                  <select 
                    value={reportDept}
                    onChange={(e) => setReportDept(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-2 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 appearance-none uppercase"
                  >
                    <option value="">SEMUA DEPARTEMEN</option>
                    {reportEmployees && Array.from(new Set(reportEmployees.map(e => e.dept || 'UMUM'))).sort().map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <Filter className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50/50 p-6">
              {reportEmployees ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reportEmployees.filter(emp => {
                    const searchLower = reportSearch.toLowerCase();
                    const matchSearch = emp.name.toLowerCase().includes(searchLower) || 
                                        (emp.id || '').toLowerCase().includes(searchLower);
                    const matchDept = reportDept ? (emp.dept || 'UMUM') === reportDept : true;
                    return matchSearch && matchDept;
                  }).map(emp => (
                    <div key={emp.id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 transition-all shadow-sm flex flex-col gap-4">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm truncate" title={emp.name}>{emp.name}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{emp.id} | {emp.dept || 'UMUM'}</p>
                      </div>
                      
                      <div className="flex justify-between items-end mt-auto">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 inline-block uppercase tracking-wider">
                            {selectedMonth}
                          </p>
                        </div>
                        <button 
                          onClick={() => handlePrintReport(emp)}
                          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 shadow-sm"
                        >
                          <Printer className="w-3 h-3" /> Cetak
                        </button>
                      </div>
                    </div>
                  ))}
                  {reportEmployees.filter(emp => {
                    const searchLower = reportSearch.toLowerCase();
                    const matchSearch = emp.name.toLowerCase().includes(searchLower) || 
                                        (emp.id || '').toLowerCase().includes(searchLower);
                    const matchDept = reportDept ? (emp.dept || 'UMUM') === reportDept : true;
                    return matchSearch && matchDept;
                  }).length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 font-medium text-sm">Tidak ada karyawan yang sesuai filter.</div>
                  )}
                </div>
              ) : (
                <div className="py-24 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-4 animate-pulse">Memuat Data Karyawan...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Hidden Print Container for Attendance Report */}
      {printReports && printReports.length > 0 && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
          {printReports.map((report, idx) => (
            <div key={idx} style={{ pageBreakAfter: idx < printReports.length - 1 ? 'always' : 'auto' }}>
              <PrintableAttendanceReport 
                detail={report.detail} 
                logs={report.logs}
                company={companySettings} 
                config={attendanceReportConfig} 
              />
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

// --- Sub-component to optimize performance ---

const FilterBar = ({ onApply, isLoading, currentSearch }) => {
  const [filterDate, setFilterDate] = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (currentSearch !== undefined) {
      setSearchQuery(currentSearch);
    }
  }, [currentSearch]);

  const { data: optionsData } = useQuery({
    queryKey: ['attendance-options-reactive', { period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: debouncedSearch }],
    queryFn: () => attendanceAPI.getMasterOptions({ period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: debouncedSearch }),
    staleTime: 30000,
  });

  const masterOptions = optionsData?.data || { departments: [], sections: [], positions: [], statuses: [] };

  const handleApply = () => {
    onApply({
      page: 1,
      period: filterDate,
      startDate: customStart,
      endDate: customEnd,
      dept: filterDept,
      section: filterSection,
      position: filterPosition,
      status: filterStatus,
      search: searchQuery
    });
  };

  return (
    <div className="bg-white p-6 border border-slate-200 shadow-sm rounded-2xl">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-3 min-w-max">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Temporal Scope:</label>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            {['Today', 'This Week', 'This Month', 'Custom'].map((period) => (
              <button
                key={period}
                onClick={() => setFilterDate(period)}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                  filterDate === period 
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200 relative z-10' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {period === 'Today' ? 'Today' : period === 'This Week' ? 'Week' : period === 'This Month' ? 'Month' : 'Manual'}
              </button>
            ))}
          </div>

          {filterDate === 'Custom' && (
            <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
              <input 
                type="date" 
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm"
              />
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-2 lg:col-span-1 xl:col-span-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Personnel Filter</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="ID SEQUENCE..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
              />
            </div>
          </div>

          {[
            { label: 'Department', val: filterDept, setter: setFilterDept, opts: masterOptions.departments.map(d => ({ v: d.name, l: d.name })), onChg: () => { setFilterSection(''); setFilterPosition(''); } },
            { label: 'Section', val: filterSection, setter: setFilterSection, opts: masterOptions.sections.map(s => ({ v: s, l: s })) },
            { label: 'Rank', val: filterPosition, setter: setFilterPosition, opts: masterOptions.positions.map(p => ({ v: p, l: p })) },
            { label: 'Status Protocol', val: filterStatus, setter: setFilterStatus, opts: masterOptions.statuses.map(s => ({ v: s, l: STATUS_MAP[s] || s })) }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => { field.setter(e.target.value); field.onChg?.(); }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none uppercase tracking-wider transition-all shadow-sm truncate"
                >
                  <option value="">GLOBAL ARCHIVE</option>
                  {field.opts.map((o, i) => <option key={i} value={o.v}>{o.l}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          ))}
          <div className="lg:col-span-1 xl:col-span-1 sm:col-span-2 lg:col-start-auto">
            <button 
              onClick={handleApply}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
            >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="text-[10px] font-bold tracking-wider uppercase">COMMIT FILTERS</span>
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
