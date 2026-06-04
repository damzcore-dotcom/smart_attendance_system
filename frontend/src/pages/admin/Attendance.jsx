import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { attendanceAPI, employeeAPI, payrollAPI, settingsAPI, getFileUrl } from '../../services/api';
import PrintableAttendanceReport from '../../components/payroll/PrintableAttendanceReport';
import { Edit2, LayoutDashboard, Calendar, Clock, RefreshCw, Upload, AlertCircle, CheckCircle2, XCircle, Search, Filter, Scan, X, FileSpreadsheet, Printer, FileText, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight, Loader2, AlertTriangle, ShieldCheck, ShieldAlert, TrendingUp, Fingerprint, Camera, Eye, Smartphone, Key } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getStatusLabel, getStatusColor, isPresent, isAbsent } from '../../utils/statusUtils';

const STATUS_MAP = {
  'PRESENT': 'Hadir',
  'LATE': 'Terlambat',
  'ABSENT': 'Alpa',
  'MANGKIR': 'Mangkir',
  'EARLY_DEPARTURE': 'Pulang Cepat',
  'HOLIDAY': 'Libur',
  'CUTI': 'Cuti',
  'SAKIT': 'Sakit',
  'IZIN': 'Izin'
};

const formatDuration = (minutes, lang = 'id') => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');
  
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  
  const hrStr = isIndo ? 'jam' : isKo ? '시간' : isZh ? '小时' : 'hr';
  const minStr = isIndo ? 'menit' : isKo ? '분' : isZh ? '分钟' : 'min';
  
  if (h === 0) return `${m} ${minStr}`;
  if (m === 0) return `${h} ${hrStr}`;
  return `${h} ${hrStr} ${m} ${minStr}`;
};

const getReportPeriodLabel = (filters, lang = 'id') => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');

  const monthsIndo = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const monthsEng = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let dateObj = new Date();
  if (filters.startDate) {
    const parsed = new Date(filters.startDate);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
  } else if (filters.endDate) {
    const parsed = new Date(filters.endDate);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
  }

  const y = dateObj.getFullYear();
  const m = dateObj.getMonth();

  if (isIndo) {
    return `${monthsIndo[m]} ${y}`;
  } else if (isKo) {
    return `${y}년 ${m + 1}월`;
  } else if (isZh) {
    return `${y}年 ${m + 1}月`;
  } else {
    return `${monthsEng[m]} ${y}`;
  }
};

const getRowPenalty = (row, mangkirPenalty = 30) => {
  const status = (row.status || '').toUpperCase();
  const isMangkir = (status === 'MANGKIR' || status === 'MISSING');
  
  if (isMangkir) {
    return (row.lateMinutes || 0) === 0 ? mangkirPenalty : 0;
  }
  return 0;
};

const getPaddedRecords = (rawRecords, summary, appliedFilters, sortConfig) => {
  if (!rawRecords || rawRecords.length === 0) return [];
  
  const uniqueEmployeeCount = summary?.uniqueEmployeeCount || 1;
  
  if (uniqueEmployeeCount === 1 && appliedFilters.search) {
    let startDate, endDate;
    const now = new Date();
    
    if (appliedFilters.period === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(); // Show all dates up to today/print date
    } else if (appliedFilters.period === 'Custom' && appliedFilters.startDate && appliedFilters.endDate) {
      startDate = new Date(appliedFilters.startDate);
      endDate = new Date(appliedFilters.endDate);
      if (endDate > now) {
        endDate = now;
      }
    } else {
      const sorted = [...rawRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
      return sortConfig?.order === 'desc' ? sorted.reverse() : sorted;
    }

    const padData = [];
    const dataMap = {};
    
    rawRecords.forEach(r => {
      const parsedObj = new Date(r.date);
      if (!isNaN(parsedObj.getTime())) {
        const isoMatch = `${parsedObj.getFullYear()}-${String(parsedObj.getMonth()+1).padStart(2,'0')}-${String(parsedObj.getDate()).padStart(2,'0')}`;
        dataMap[isoMatch] = r; 
      }
    });

    const empRef = rawRecords[0];
    const overrides = summary?.calendarOverrides || [];
    const overrideMap = {};
    overrides.forEach(c => {
       const dStr = c.date.split('T')[0];
       overrideMap[dStr] = c.type;
    });
    const workingDays = summary?.workingDays || [1,2,3,4,5];

    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const isoKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const displayDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      
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
          id: `pad-${d.getTime()}`,
          name: empRef.name,
          employeeCode: empRef.employeeCode,
          dept: empRef.dept,
          section: empRef.section,
          position: empRef.position,
          date: displayDate,
          checkIn: '--:--',
          checkOut: '--:--',
          status: isLibur ? 'Libur' : 'Alpa',
          lateMinutes: 0,
          overtimeHours: 0,
          mode: '-',
        });
      }
    }
    
    const sorted = [...padData].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sortConfig?.order === 'desc' ? sorted.reverse() : sorted;
  }
  
  const sorted = [...rawRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sortConfig?.order === 'desc' ? sorted.reverse() : sorted;
};

const getPrintPaddedLogs = (rawLogs, emp, selectedMonth, summary) => {
  const year = parseInt(selectedMonth.split('-')[0]);
  const monthIdx = parseInt(selectedMonth.split('-')[1]) - 1;
  const now = new Date();
  
  const start = new Date(year, monthIdx, 1);
  let end = new Date(year, monthIdx + 1, 0);
  
  if (year === now.getFullYear() && monthIdx === now.getMonth()) {
    end = now;
  }
  
  const dataMap = {};
  rawLogs.forEach(r => {
    const parsedObj = new Date(r.date);
    if (!isNaN(parsedObj.getTime())) {
      const isoMatch = `${parsedObj.getFullYear()}-${String(parsedObj.getMonth()+1).padStart(2,'0')}-${String(parsedObj.getDate()).padStart(2,'0')}`;
      dataMap[isoMatch] = r; 
    }
  });

  const overrides = summary?.calendarOverrides || [];
  const overrideMap = {};
  overrides.forEach(c => {
     const dStr = c.date.split('T')[0];
     overrideMap[dStr] = c.type;
  });
  const workingDays = summary?.workingDays || [1,2,3,4,5];

  const padData = [];
  const loopStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const loopEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
    const isoKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const displayDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    
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
        id: `pad-${d.getTime()}`,
        name: emp.name,
        employeeCode: emp.id,
        dept: emp.dept || 'UMUM',
        section: emp.section || '—',
        position: emp.position || '—',
        date: displayDate,
        checkIn: '--:--',
        checkOut: '--:--',
        status: isLibur ? 'Libur' : 'Alpa',
        lateMinutes: 0,
        overtimeHours: 0,
        mode: '-',
      });
    }
  }
  
  return [...padData].sort((a, b) => new Date(a.date) - new Date(b.date));
};

const translateStatus = (status, lang) => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');
  
  const normalized = (status || '').toUpperCase();
  
  const map = {
    'PRESENT': isIndo ? 'Hadir' : isKo ? '출석' : isZh ? '出勤' : 'Present',
    'HADIR': isIndo ? 'Hadir' : isKo ? '출석' : isZh ? '出勤' : 'Present',
    'LATE': isIndo ? 'Terlambat' : isKo ? '지각' : isZh ? '迟到' : 'Late',
    'TERLAMBAT': isIndo ? 'Terlambat' : isKo ? '지각' : isZh ? '迟到' : 'Late',
    'MANGKIR': isIndo ? 'Mangkir' : isKo ? '무단결근' : isZh ? '旷工' : 'Unexcused',
    'MISSING': isIndo ? 'Mangkir' : isKo ? '무단결근' : isZh ? '旷工' : 'Unexcused',
    'HOLIDAY': isIndo ? 'Libur' : isKo ? '공휴일' : isZh ? '节假日' : 'Holiday',
    'LIBUR': isIndo ? 'Libur' : isKo ? '공휴일' : isZh ? '节假日' : 'Holiday',
    'CUTI': isIndo ? 'Cuti' : isKo ? '휴가' : isZh ? '请假' : 'Leave',
    'LEAVE': isIndo ? 'Cuti' : isKo ? '휴가' : isZh ? '请假' : 'Leave',
    'SAKIT': isIndo ? 'Sakit' : isKo ? '병가' : isZh ? '病假' : 'Medical',
    'MEDICAL': isIndo ? 'Sakit' : isKo ? '병가' : isZh ? '病假' : 'Medical',
    'IZIN': isIndo ? 'Izin' : isKo ? '외출/조퇴' : isZh ? '事假' : 'Permit',
    'PERMIT': isIndo ? 'Izin' : isKo ? '외출/조퇴' : isZh ? '事假' : 'Permit',
    'ABSENT': isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
    'ALPA': isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
    'ALPHA': isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
    'EARLY_DEPARTURE': isIndo ? 'Pulang Cepat' : isKo ? '조기 퇴근' : isZh ? '早退' : 'Early Departure',
    'PULANG CEPAT': isIndo ? 'Pulang Cepat' : isKo ? '조기 퇴근' : isZh ? '早退' : 'Early Departure',
  };
  
  return map[normalized] || status;
};

const translateMethod = (method, lang) => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');
  
  const map = {
    'Face CCTV': isIndo ? 'Face CCTV' : isKo ? '페이스 CCTV' : isZh ? '人脸CCTV' : 'Face CCTV',
    'Face HP': isIndo ? 'Face HP' : isKo ? '페이스 HP' : isZh ? '手机人脸' : 'Face HP',
    'Pinned': isIndo ? 'Pinned' : isKo ? 'PIN 입력' : isZh ? 'PIN密码' : 'Pinned',
    'Fingered': isIndo ? 'Fingered' : isKo ? '지문 인식' : isZh ? '指纹打卡' : 'Fingered',
    'Manual': isIndo ? 'Manual' : isKo ? '수동 입력' : isZh ? '手工录入' : 'Manual',
    '-': '-'
  };
  
  return map[method] || method;
};

const Attendance = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
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
  
  const [photoModal, setPhotoModal] = useState({
    isOpen: false,
    photoUrl: '',
    employeeName: '',
    date: '',
    type: '',
    similarity: null,
    cameraId: ''
  });

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
  const [anomalyFilter, setAnomalyFilter] = useState('ALL'); // 'ALL' | 'ANOMALY'
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
    order: 'desc',
    excludeBhl: true
  });

  useEffect(() => {
    if (location.state) {
      const { date, search, status, viewTab } = location.state;
      setAppliedFilters(prev => {
        const updated = { ...prev };
        if (date) {
          updated.period = 'Custom';
          updated.startDate = date;
          updated.endDate = date;
        }
        if (search !== undefined) {
          updated.search = search;
        }
        if (status !== undefined) {
          updated.status = status;
        }
        return updated;
      });
      if (viewTab) {
        setActiveViewTab(viewTab);
      }
      // Clear location state so it doesn't freeze the filters on subsequent reloads
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, navigate]);

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
      const res = await employeeAPI.getAll({ limit: 10000, excludeBhl: true });
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
        const rawLogs = res.data || [];
        const logs = getPrintPaddedLogs(rawLogs, emp, selectedMonth, data?.summary);
        
        let daysPresent = 0;
        let daysLate = 0;
        let daysAbsent = 0;
        let totalLateMinutes = 0;
        logs.forEach(log => {
          const status = (log.status || '').toUpperCase();
          if (isPresent(log.status)) {
            daysPresent++;
            if (status === 'LATE' || status === 'TERLAMBAT') daysLate++;
            totalLateMinutes += (log.lateMinutes || 0);
          } else if (status === 'MANGKIR' || status === 'MISSING') {
            daysAbsent++;
            const hasLate = (log.lateMinutes || 0) > 0;
            const penalty = !hasLate ? (parseInt(companySettings?.mangkirPenaltyMinutes) || 30) : 0;
            totalLateMinutes += (log.lateMinutes || 0) + penalty;
          } else if (isAbsent(log.status) || status === 'TANPA KETERANGAN (ALPA)' || status === 'ABSENT' || status === 'ALPA') {
            daysAbsent++;
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
      const rawLogs = res.data || [];
      const logs = getPrintPaddedLogs(rawLogs, emp, selectedMonth, data?.summary);
      
      let daysPresent = 0;
      let totalLateMinutes = 0;
      
      logs.forEach(log => {
        const status = (log.status || '').toUpperCase();
        if (status === 'PRESENT' || status === 'LATE' || status === 'HADIR' || status === 'TERLAMBAT') {
           daysPresent++;
        }
        if (status === 'LATE' || status === 'TERLAMBAT') {
           totalLateMinutes += (log.lateMinutes || 0);
        }
        if (status === 'MANGKIR' || status === 'MISSING') {
           const hasLate = (log.lateMinutes || 0) > 0;
           const penalty = !hasLate ? (parseInt(companySettings?.mangkirPenaltyMinutes) || 30) : 0;
           totalLateMinutes += (log.lateMinutes || 0) + penalty;
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

  const [activeViewTab, setActiveViewTab] = useState('DETAIL'); // 'DETAIL' | 'REKAPITULASI'

  const { data: fullDataForRekap, isLoading: isRekapLoading } = useQuery({
    queryKey: ['attendance-full-rekap', { ...appliedFilters, limit: 99999, page: 1 }],
    queryFn: () => attendanceAPI.getAll({ ...appliedFilters, limit: 99999, page: 1 }),
    enabled: activeViewTab === 'REKAPITULASI'
  });

  const rekapData = useMemo(() => {
    const rawLogs = fullDataForRekap?.data || [];
    const groups = {};

    rawLogs.forEach(row => {
      const empCode = row.employeeCode || 'SYS_ID_ERR';
      const name = row.name || '—';
      const dept = row.dept || 'UMUM';
      const sec = row.section || '—';
      const pos = row.position || '—';
      const key = empCode;

      if (!groups[key]) {
        groups[key] = {
          employeeCode: empCode,
          name,
          dept,
          section: sec,
          position: pos,
          total: 0,
          present: 0,
          late: 0,
          pulangCepat: 0,
          mangkir: 0,
          absent: 0,
          other: 0,
          totalLateMinutes: 0,
          mangkirDetails: [],
          absentDetails: [],
          otherDetails: [],
          lateDetails: [],
          pulangCepatDetails: []
        };
      }

      const g = groups[key];
      g.total++;
      
      const status = row.status;
      if (status === 'PRESENT' || status === 'Hadir') {
        g.present++;
      } else if (status === 'LATE' || status === 'Terlambat') {
        g.present++;
        g.late++;
        g.totalLateMinutes += (row.lateMinutes || 0);
        g.lateDetails.push({ date: row.date, checkIn: row.checkIn, lateMinutes: row.lateMinutes || 0 });
      } else if (status === 'EARLY_DEPARTURE' || status === 'Pulang Cepat') {
        g.present++;
        g.pulangCepat++;
        const shiftEnd = row.shiftTime ? row.shiftTime.split(' - ')[1] : '17:00';
        g.pulangCepatDetails.push({ date: row.date, checkIn: row.checkIn, checkOut: row.checkOut, shiftEnd });
      } else if (status === 'MANGKIR' || status === 'Mangkir') {
        g.mangkir++;
        const rule1Enabled = companySettings?.penaltyRule1Enabled !== 'false';
        const rule3Enabled = companySettings?.penaltyRule3Enabled !== 'false';
        const rule1Mins = parseInt(companySettings?.penaltyRule1Minutes || '30', 10);
        const rule3Mins = parseInt(companySettings?.penaltyRule3Minutes || '30', 10);
        const penaltyVal = !row.checkIn ? (rule1Enabled ? rule1Mins : 0) : (rule3Enabled ? rule3Mins : 0);
        const penalty = (row.lateMinutes || 0) === 0 ? penaltyVal : 0;
        g.totalLateMinutes += (row.lateMinutes || 0) + penalty;
        g.mangkirDetails.push({ date: row.date, checkIn: row.checkIn, checkOut: row.checkOut });
      } else if (status === 'ABSENT' || status === 'Alpa' || status === 'MISSING') {
        g.absent++;
        g.absentDetails.push({ date: row.date, checkIn: row.checkIn, checkOut: row.checkOut });
      } else {
        g.other++;
        g.otherDetails.push({ date: row.date, status: row.status });
      }
    });

    return Object.values(groups).sort((a, b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));
  }, [fullDataForRekap]);

  const isAnomaly = (row) => {
    const hasIn = row.checkIn && row.checkIn !== '-- : --' && row.checkIn !== '--:--' && row.checkIn !== '-';
    const hasOut = row.checkOut && row.checkOut !== '-- : --' && row.checkOut !== '--:--' && row.checkOut !== '-';
    
    if ((row.status === 'MANGKIR' || row.status === 'ABSENT' || row.status === 'Alpa') && hasOut) {
      return true;
    }
    if (hasIn && !hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday'].includes(row.status)) {
      return true;
    }
    if (!hasIn && hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday'].includes(row.status)) {
      return true;
    }
    return false;
  };

  let filteredData = data?.data || [];
  let displaySummary = data?.summary ? {
    ...data.summary,
    pulangCepat: data.summary.pulangCepat ?? data.summary.earlyDeparture ?? 0
  } : null;

  if (anomalyFilter === 'ANOMALY') {
    filteredData = filteredData.filter(isAnomaly);
  }

  if (!isLoading && data?.summary?.uniqueEmployeeCount === 1 && appliedFilters.search && filteredData.length > 0) {
    filteredData = getPaddedRecords(filteredData, data?.summary, appliedFilters, sortConfig);

    // Compute displaySummary from the padded data 
    displaySummary = {
      total: filteredData.length,
      hadir: filteredData.filter(d => d.status === 'Hadir' || d.status === 'PRESENT').length,
      telat: filteredData.filter(d => d.status === 'Terlambat' || d.status === 'LATE').length,
      pulangCepat: filteredData.filter(d => d.status === 'Pulang Cepat' || d.status === 'EARLY_DEPARTURE').length,
      mangkir: filteredData.filter(d => d.status === 'Mangkir' || d.status === 'MANGKIR').length,
      absen: filteredData.filter(d => d.status === 'Alpa' || d.status === 'ABSENT').length,
      holiday: filteredData.filter(d => d.status === 'Libur' || d.status === 'HOLIDAY').length,
      cuti: filteredData.filter(d => d.status === 'Cuti' || d.status === 'CUTI').length,
      sakit: filteredData.filter(d => d.status === 'Sakit' || d.status === 'SAKIT').length,
      izin: filteredData.filter(d => d.status === 'Izin' || d.status === 'IZIN').length,
      totalLate: filteredData.reduce((sum, d) => {
        const hasLate = (d.lateMinutes || 0) > 0;
        const isMangkir = d.status === 'Mangkir' || d.status === 'MANGKIR' || d.status === 'MISSING';
        let penaltyVal = 30;
        if (isMangkir) {
          const rule1Enabled = companySettings?.penaltyRule1Enabled !== 'false';
          const rule3Enabled = companySettings?.penaltyRule3Enabled !== 'false';
          const rule1Mins = parseInt(companySettings?.penaltyRule1Minutes || '30', 10);
          const rule3Mins = parseInt(companySettings?.penaltyRule3Minutes || '30', 10);
          penaltyVal = !d.checkIn ? (rule1Enabled ? rule1Mins : 0) : (rule3Enabled ? rule3Mins : 0);
        }
        const penalty = (isMangkir && !hasLate) ? penaltyVal : 0;
        return sum + (d.lateMinutes || 0) + penalty;
      }, 0),
      uniqueEmployeeCount: 1
    };
  }

  const handleCardClick = (label) => {
    let targetStatus = '';
    if (label === 'Hadir') targetStatus = 'PRESENT';
    else if (label === 'Terlambat' || label === 'Total Terlambat') targetStatus = 'LATE';
    else if (label === 'Pulang Cepat') targetStatus = 'EARLY_DEPARTURE';
    else if (label === 'Mangkir') targetStatus = 'MANGKIR';
    else if (label === 'Alpa') targetStatus = 'ABSENT';
    else if (label === 'Lainnya') targetStatus = 'HOLIDAY';
    
    setAppliedFilters(prev => ({ ...prev, status: targetStatus, page: 1 }));
    setActiveViewTab('DETAIL');
    setAnomalyFilter('ALL');
  };

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
      const payload = { 
        status: correctionModal.newStatus, 
        notes: correctionModal.notes, 
        overtimeHours: correctionModal.overtimeHours,
        checkInTime: correctionModal.checkInTime,
        checkOutTime: correctionModal.checkOutTime,
        lateMinutes: correctionModal.lateMinutes,
        attachment: correctionModal.attachment
      };
      // For padded (non-existent) rows, include employeeCode and date so the backend can create a new record
      const isPadded = String(correctionModal.recordId).startsWith('pad-');
      if (isPadded && correctionModal.employeeCode && correctionModal.rawDate) {
        payload.employeeCode = correctionModal.employeeCode;
        // rawDate is in display format ("May 29, 2026"), convert to ISO
        const parsed = new Date(correctionModal.rawDate);
        if (!isNaN(parsed.getTime())) {
          payload.date = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
        }
      }
      await attendanceAPI.update(correctionModal.recordId, payload);
      setCorrectionModal({ isOpen: false, recordId: null, employeeName: '', employeeCode: '', rawDate: '', currentStatus: '', newStatus: 'CUTI', notes: '', overtimeHours: 0, checkInTime: '', checkOutTime: '', lateMinutes: 0, attachment: '' });
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      alert('Status absensi berhasil dikoreksi!');
    } catch (err) {
      alert(`Gagal koreksi data: ${err.message}`);
    } finally {
      setIsCorrecting(false);
    }
  };

  const handleQuickWaiver = async (row) => {
    if (!window.confirm(`Berikan dispensasi keterlambatan untuk ${row.name} pada tanggal ${row.date}? Status akan diset menjadi Hadir Normal dan penalti menit akan dinolkan.`)) {
      return;
    }
    
    setIsCorrecting(true);
    try {
      const payload = { 
        status: 'PRESENT', 
        notes: 'Dispensasi keterlambatan oleh HRD', 
        overtimeHours: row.overtimeHours || 0,
        checkInTime: parseTimeForInput(row.checkIn),
        checkOutTime: parseTimeForInput(row.checkOut),
        lateMinutes: 0,
        attachment: ''
      };
      
      const isPadded = String(row.id).startsWith('pad-');
      if (isPadded) {
        payload.employeeCode = row.employeeCode;
        const parsed = new Date(row.date);
        if (!isNaN(parsed.getTime())) {
          payload.date = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
        }
      }

      await attendanceAPI.update(row.id, payload);
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      alert('Dispensasi keterlambatan berhasil diberikan!');
    } catch (err) {
      alert(`Gagal memberikan dispensasi: ${err.message}`);
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

  const handleExportExcel = async () => {
    try {
      const lang = i18n.language || 'id';
      const isIndo = lang.startsWith('id');
      const isKo = lang.startsWith('ko');
      const isZh = lang.startsWith('zh');

      if (activeViewTab === 'REKAPITULASI') {
        const headers = {
          no: isIndo ? 'No' : isKo ? '번호' : isZh ? '序号' : 'No',
          nik: isIndo ? 'NIK' : isKo ? '사원번호' : isZh ? '工号' : 'Employee ID',
          name: isIndo ? 'Nama Karyawan' : isKo ? '사원명' : isZh ? '员工姓名' : 'Employee Name',
          dept: isIndo ? 'Departemen' : isKo ? '부서' : isZh ? '部门' : 'Department',
          section: isIndo ? 'Bagian / Seksi' : isKo ? '파트' : isZh ? '班组' : 'Section',
          total: isIndo ? 'Total Jadwal (Hari-Karyawan)' : isKo ? '총 일정 (일-사원)' : isZh ? '总计划 (工日)' : 'Total Schedule (Day-Employee)',
          present: isIndo ? 'Kehadiran (Hadir/Telat)' : isKo ? '출석 (출석/지각)' : isZh ? '出勤 (出勤/迟到)' : 'Presence (Present/Late)',
          late: isIndo ? 'Terlambat (Hari)' : isKo ? '지각 (일)' : isZh ? '迟到 (天)' : 'Lateness (Days)',
          early: isIndo ? 'Pulang Cepat (Hari)' : isKo ? '조기 퇴근 (일)' : isZh ? '早退 (天)' : 'Early Leave (Days)',
          mangkir: isIndo ? 'Mangkir (Hari)' : isKo ? '무단결근 (일)' : isZh ? '旷工 (天)' : 'Unexcused (Days)',
          absent: isIndo ? 'Alpa (Hari)' : isKo ? '결근 (일)' : isZh ? '缺勤 (天)' : 'Absent (Days)',
          other: isIndo ? 'Lainnya (Libur/Cuti/Sakit)' : isKo ? '기타 (공휴일/휴가/병가)' : isZh ? '其他 (节假日/休假/病假)' : 'Others (Holiday/Leave/Medical)',
          rate: isIndo ? 'Persentase Kehadiran (%)' : isKo ? '출석률 (%)' : isZh ? '出勤率 (%)' : 'Presence Rate (%)',
          totalLate: isIndo ? 'Akumulasi Keterlambatan' : isKo ? '누적 지각 시간' : isZh ? '累计迟到时长' : 'Accumulated Lateness',
        };

        const exportData = rekapData.map((g, idx) => {
          const totalExcludeOff = g.total - g.other;
          const rate = totalExcludeOff > 0 ? Math.round((g.present / totalExcludeOff) * 100) : 100;
          return {
            [headers.no]: idx + 1,
            [headers.nik]: g.employeeCode || '-',
            [headers.name]: g.name || '-',
            [headers.dept]: g.dept,
            [headers.section]: g.section,
            [headers.total]: g.total,
            [headers.present]: g.present,
            [headers.late]: g.late,
            [headers.early]: g.pulangCepat || 0,
            [headers.mangkir]: g.mangkir,
            [headers.absent]: g.absent,
            [headers.other]: g.other,
            [headers.rate]: `${rate}%`,
            [headers.totalLate]: formatDuration(g.totalLateMinutes, lang)
          };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isIndo ? 'Rekapitulasi' : isKo ? '부서별 요약' : isZh ? '部门汇总' : 'Recapitulation');
        XLSX.writeFile(wb, `${isIndo ? 'Rekap_Absensi_Per_Dept' : isKo ? '부서별_근태_요약' : isZh ? '部门考勤汇总' : 'Attendance_Recapitulation'}_${appliedFilters.period}_${new Date().toISOString().split('T')[0]}.xlsx`);
        return;
      }

      // H6 FIX: Fetch ALL records from API, not just the current page
      const allParams = { ...appliedFilters, page: 1, limit: 99999 };
      const allDataResponse = await attendanceAPI.getAll(allParams);
      let allRecords = allDataResponse?.data || filteredData;

      // Pad records for single employee to ensure completeness in Excel
      if (allDataResponse?.summary?.uniqueEmployeeCount === 1 && appliedFilters.search && allRecords.length > 0) {
        allRecords = getPaddedRecords(allRecords, allDataResponse?.summary, appliedFilters, { order: 'asc' });
      }

      // Sort data ascending by date (oldest first)
      const sortedData = [...allRecords].sort((a, b) => new Date(a.date) - new Date(b.date));

      const headers = {
        nik: isIndo ? 'NIK' : isKo ? '사원번호' : isZh ? '工号' : 'Employee ID',
        name: isIndo ? 'Nama Karyawan' : isKo ? '사원명' : isZh ? '员工姓名' : 'Employee Name',
        dept: isIndo ? 'Departemen' : isKo ? '부서' : isZh ? '部门' : 'Department',
        section: isIndo ? 'Bagian' : isKo ? '파트' : isZh ? '班组' : 'Section',
        position: isIndo ? 'Jabatan' : isKo ? '직급' : isZh ? '职位' : 'Position',
        date: isIndo ? 'Tanggal' : isKo ? '날짜' : isZh ? '日期' : 'Date',
        checkIn: isIndo ? 'Jam Masuk' : isKo ? '출근 시간' : isZh ? '签到时间' : 'Check In',
        checkOut: isIndo ? 'Jam Keluar' : isKo ? '퇴근 시간' : isZh ? '签退时间' : 'Check Out',
        lateness: isIndo ? 'Menit Terlambat' : isKo ? '지각 (분)' : isZh ? '迟到 (分钟)' : 'Lateness (min)',
        status: isIndo ? 'Status' : isKo ? '상태' : isZh ? '状态' : 'Status',
        method: isIndo ? 'Metode' : isKo ? '인증 방식' : isZh ? '打卡方式' : 'Method',
      };

      const exportData = sortedData.map(row => {
        const isMangkir = (row.status === 'MANGKIR' || row.status === 'MISSING' || row.status === 'Mangkir');
        const penalty = (isMangkir && (row.lateMinutes || 0) === 0) ? (allDataResponse?.summary?.mangkirPenalty || 30) : 0;
        
        let rawMethod = 'Manual';
        const modeUpper = (row.mode || '').toUpperCase();
        const srcUpper = (row.source || '').toUpperCase();

        if (modeUpper === 'FACE CCTV' || srcUpper === 'FACE_CCTV') {
          rawMethod = 'Face CCTV';
        } else if (modeUpper === 'FACE ID' || modeUpper === 'FACE HP' || srcUpper === 'FACE_WEB') {
          rawMethod = 'Face HP';
        } else if (modeUpper === 'PINNED' || modeUpper === 'PIN') {
          rawMethod = 'Pinned';
        } else if (modeUpper === 'FINGERED' || modeUpper === 'FINGERPRINT' || modeUpper === 'FINGER' || srcUpper === 'FINGERPRINT') {
          rawMethod = 'Fingered';
        } else if (row.mode === '-') {
          rawMethod = '-';
        }

        const transStatus = translateStatus(row.status, lang);
        const transMethod = translateMethod(rawMethod, lang);

        return {
          [headers.nik]: row.employeeCode || row.nik || '-',
          [headers.name]: row.name,
          [headers.dept]: row.dept,
          [headers.section]: row.section,
          [headers.position]: row.position,
          [headers.date]: row.date,
          [headers.checkIn]: row.checkIn,
          [headers.checkOut]: row.checkOut,
          [headers.lateness]: (row.lateMinutes || 0) + penalty,
          [headers.status]: transStatus,
          [headers.method]: transMethod
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isIndo ? 'Kehadiran' : isKo ? '일별 근태' : isZh ? '每日考勤' : 'Attendance');
      const filePrefix = isIndo ? 'Laporan_Absensi' : isKo ? '근태_보고서' : isZh ? '考勤报告' : 'Attendance_Report';
      XLSX.writeFile(wb, `${filePrefix}_${appliedFilters.period}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal export data: ' + err.message);
    }
  };

  const handleExportPDF = async () => {
    const drawKpiBlock = (doc, x, y, width, height, label, value, theme) => {
      doc.setDrawColor(theme.stroke[0], theme.stroke[1], theme.stroke[2]);
      doc.setFillColor(theme.fill[0], theme.fill[1], theme.fill[2]);
      doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');
      
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + 3, y + 4.5);
      
      doc.setFontSize(10);
      doc.setTextColor(theme.text[0], theme.text[1], theme.text[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value), x + 3, y + 10.5);
      doc.setFont('helvetica', 'normal');
    };

    const themes = {
      emerald: { fill: [240, 253, 244], stroke: [187, 247, 208], text: [21, 128, 61] },
      blue: { fill: [239, 246, 255], stroke: [191, 219, 254], text: [29, 78, 216] },
      sky: { fill: [240, 249, 255], stroke: [186, 230, 253], text: [3, 105, 161] },
      violet: { fill: [250, 245, 255], stroke: [233, 213, 255], text: [109, 40, 217] },
      amber: { fill: [255, 251, 235], stroke: [254, 243, 199], text: [180, 83, 9] },
      rose: { fill: [254, 242, 242], stroke: [254, 202, 202], text: [185, 28, 28] },
      fuchsia: { fill: [253, 242, 248], stroke: [251, 207, 232], text: [190, 24, 93] }
    };

    try {
      const lang = i18n.language || 'id';
      const isIndo = lang.startsWith('id');
      const isKo = lang.startsWith('ko');
      const isZh = lang.startsWith('zh');
      const minStr = isIndo ? 'menit' : isKo ? '분' : isZh ? '分钟' : 'min';

      const labels = {
        titleRekap: isIndo ? 'REKAPITULASI ABSENSI' : isKo ? '부서별 근태 요약' : isZh ? '部门考勤汇总' : 'ATTENDANCE RECAPITULATION',
        titleDetail: isIndo ? 'LAPORAN ABSENSI' : isKo ? '근태 보고서' : isZh ? '考勤报告' : 'ATTENDANCE REPORT',
        period: isIndo ? 'Periode' : isKo ? '기간' : isZh ? '期间' : 'Period',
        printed: isIndo ? 'Dicetak' : isKo ? '인쇄일' : isZh ? '打印时间' : 'Printed',
        kpis: {
          hadir: isIndo ? 'Hadir' : isKo ? '출석' : isZh ? '出勤' : 'Present',
          sakit: isIndo ? 'Sakit' : isKo ? '병가' : isZh ? '病假' : 'Medical',
          izin: isIndo ? 'Izin' : isKo ? '외출/조퇴' : isZh ? '事假' : 'Permit',
          cuti: isIndo ? 'Cuti' : isKo ? '휴가' : isZh ? '请假' : 'Leave',
          mangkir: isIndo ? 'Mangkir' : isKo ? '무단결근' : isZh ? '旷工' : 'Unexcused',
          alpa: isIndo ? 'Alpa' : isKo ? '결근' : isZh ? '缺勤' : 'Absent',
          totalLate: isIndo ? 'Total Jam Terlambat' : isKo ? '총 지각 시간' : isZh ? '累计迟到时长' : 'Total Lateness',
        }
      };

      // H6 FIX: Fetch ALL records from API, not just the current page
      const allParams = { ...appliedFilters, page: 1, limit: 99999 };
      const allDataResponse = await attendanceAPI.getAll(allParams);
      let rawLogs = allDataResponse?.data || filteredData;

      if (anomalyFilter === 'ANOMALY') {
        rawLogs = rawLogs.filter(isAnomaly);
      }

      // Pad records for single employee to ensure completeness in PDF
      if (allDataResponse?.summary?.uniqueEmployeeCount === 1 && appliedFilters.search && rawLogs.length > 0) {
        rawLogs = getPaddedRecords(rawLogs, allDataResponse?.summary, appliedFilters, { order: 'asc' });
      }

      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(20);
      doc.setTextColor(37, 99, 235);
      
      let titleStr = activeViewTab === 'REKAPITULASI' ? labels.titleRekap : labels.titleDetail;
      if (activeViewTab === 'REKAPITULASI') {
        if (appliedFilters.dept) {
          titleStr = isIndo 
            ? `REKAP ABSENSI DEPARTEMENT ${appliedFilters.dept.toUpperCase()}` 
            : isKo 
            ? `${appliedFilters.dept.toUpperCase()} 부서 근태 요약` 
            : isZh 
            ? `${appliedFilters.dept.toUpperCase()} 部门考勤汇总` 
            : `${appliedFilters.dept.toUpperCase()} DEPARTMENT RECAPITULATION`;
        }
      } else {
        const isSingleEmployee = allDataResponse?.summary?.uniqueEmployeeCount === 1 && rawLogs.length > 0;
        if (isSingleEmployee) {
          const empName = rawLogs[0].name.toUpperCase();
          titleStr = isIndo 
            ? `LAPORAN ABSENSI ${empName}` 
            : isKo 
            ? `${empName} 근태 보고서` 
            : isZh 
            ? `${empName} 考勤报告` 
            : `${empName} ATTENDANCE REPORT`;
        } else if (appliedFilters.dept) {
          titleStr = isIndo 
            ? `LAPORAN ABSENSI DEPARTEMENT ${appliedFilters.dept.toUpperCase()}` 
            : isKo 
            ? `${appliedFilters.dept.toUpperCase()} 부서 근태 보고서` 
            : isZh 
            ? `${appliedFilters.dept.toUpperCase()} 部门考勤报告` 
            : `${appliedFilters.dept.toUpperCase()} DEPARTMENT ATTENDANCE REPORT`;
        }
      }
      doc.text(titleStr, 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${labels.period}: ${getReportPeriodLabel(appliedFilters, lang)}`, 14, 28);
      
      const localeStr = isIndo ? 'id-ID' : isKo ? 'ko-KR' : isZh ? 'zh-CN' : 'en-US';
      doc.text(`${labels.printed}: ${new Date().toLocaleString(localeStr)}`, 14, 33);

      const logsForKpis = activeViewTab === 'REKAPITULASI' ? (fullDataForRekap?.data || []) : rawLogs;
      const totalHadir = logsForKpis.filter(d => d.status === 'Hadir' || d.status === 'PRESENT' || d.status === 'Terlambat' || d.status === 'LATE').length;
      const totalSakit = logsForKpis.filter(d => d.status === 'Sakit' || d.status === 'SAKIT').length;
      const totalIzin = logsForKpis.filter(d => d.status === 'Izin' || d.status === 'IZIN').length;
      const totalCuti = logsForKpis.filter(d => d.status === 'Cuti' || d.status === 'CUTI').length;
      const totalMangkir = logsForKpis.filter(d => d.status === 'Mangkir' || d.status === 'MANGKIR').length;
      const totalAlpa = logsForKpis.filter(d => d.status === 'Alpa' || d.status === 'ABSENT').length;

      const totalLateMinutes = logsForKpis.reduce((sum, d) => {
        const isMangkir = (d.status === 'Mangkir' || d.status === 'MANGKIR' || d.status === 'MISSING');
        const hasLate = (d.lateMinutes || 0) > 0;
        const penalty = (isMangkir && !hasLate) ? (allDataResponse?.summary?.mangkirPenalty || displaySummary?.mangkirPenalty || 30) : 0;
        return sum + (d.lateMinutes || 0) + penalty;
      }, 0);

      // Draw 7 KPI Cards (Hadir, Sakit, Izin, Cuti, Mangkir, Alpa, Total Jam Terlambat)
      const blockWidth = 35;
      const blockHeight = 14;
      const gap = 4.0;

      drawKpiBlock(doc, 14, 37, blockWidth, blockHeight, labels.kpis.hadir, totalHadir, themes.emerald);
      drawKpiBlock(doc, 14 + 1 * (blockWidth + gap), 37, blockWidth, blockHeight, labels.kpis.sakit, totalSakit, themes.blue);
      drawKpiBlock(doc, 14 + 2 * (blockWidth + gap), 37, blockWidth, blockHeight, labels.kpis.izin, totalIzin, themes.sky);
      drawKpiBlock(doc, 14 + 3 * (blockWidth + gap), 37, blockWidth, blockHeight, labels.kpis.cuti, totalCuti, themes.violet);
      drawKpiBlock(doc, 14 + 4 * (blockWidth + gap), 37, blockWidth, blockHeight, labels.kpis.mangkir, totalMangkir, themes.amber);
      drawKpiBlock(doc, 14 + 5 * (blockWidth + gap), 37, blockWidth, blockHeight, labels.kpis.alpa, totalAlpa, themes.rose);
      drawKpiBlock(doc, 14 + 6 * (blockWidth + gap), 37, blockWidth, blockHeight, labels.kpis.totalLate, formatDuration(totalLateMinutes, lang), themes.fuchsia);

      if (activeViewTab === 'REKAPITULASI') {
        const tableData = rekapData.map((g, idx) => {
          const totalExcludeOff = g.total - g.other;
          const rate = totalExcludeOff > 0 ? Math.round((g.present / totalExcludeOff) * 100) : 100;
          return [
            g.employeeCode || '-',
            g.name,
            g.dept,
            g.section,
            g.total,
            g.present,
            g.late,
            g.pulangCepat || 0,
            g.mangkir,
            g.absent,
            g.other,
            `${rate}%`,
            formatDuration(g.totalLateMinutes, lang)
          ];
        });

        const rekapHead = isIndo 
          ? [['NIK', 'Nama Karyawan', 'Departemen', 'Bagian / Seksi', 'Total', 'Hadir', 'Terlambat', 'P. Cepat', 'Mangkir', 'Alpa', 'Lainnya', 'Rasio %', 'Durasi Telat']]
          : isKo
          ? [['사원번호', '사원명', '부서', '파트', '총 일정', '출석', '지각', '조기 퇴근', '무단결근', '결근', '기타', '출석률 %', '지각 시간']]
          : isZh
          ? [['工号', '员工姓名', '部门', '班组', '总数', '出勤', '迟到', '早退', '旷工', '缺勤', '其他', '比例 %', '迟到时长']]
          : [['NIK', 'Employee Name', 'Department', 'Section', 'Total', 'Present', 'Late', 'Early Leave', 'Unexcused', 'Absent', 'Others', 'Rate %', 'Late Duration']];

        autoTable(doc, {
          startY: 56,
          head: rekapHead,
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8, halign: 'center' },
          styles: { fontSize: 8, cellPadding: 2.5, fillColor: [255, 255, 255], textColor: [51, 65, 85] }
        });

        const filePrefix = isIndo ? 'Rekap_Absensi_Per_Dept' : isKo ? '부서별_근태_요약' : isZh ? '部门考勤汇总' : 'Attendance_Recapitulation';
        doc.save(`${filePrefix}_${new Date().getTime()}.pdf`);
        return;
      }

      // Sort data ascending by date (oldest first)
      const sortedData = [...rawLogs].sort((a, b) => new Date(a.date) - new Date(b.date));

      const tableData = sortedData.map(row => {
        const isMangkir = (row.status === 'MANGKIR' || row.status === 'MISSING' || row.status === 'Mangkir');
        const penalty = (isMangkir && (row.lateMinutes || 0) === 0) ? (allDataResponse?.summary?.mangkirPenalty || displaySummary?.mangkirPenalty || 30) : 0;
        const transStatus = translateStatus(row.status, lang);
        
        let rawMethod = 'Manual';
        const modeUpper = (row.mode || '').toUpperCase();
        const srcUpper = (row.source || '').toUpperCase();

        if (modeUpper === 'FACE CCTV' || srcUpper === 'FACE_CCTV') {
          rawMethod = 'Face CCTV';
        } else if (modeUpper === 'FACE ID' || modeUpper === 'FACE HP' || srcUpper === 'FACE_WEB') {
          rawMethod = 'Face HP';
        } else if (modeUpper === 'PINNED' || modeUpper === 'PIN') {
          rawMethod = 'Pinned';
        } else if (modeUpper === 'FINGERED' || modeUpper === 'FINGERPRINT' || modeUpper === 'FINGER' || srcUpper === 'FINGERPRINT') {
          rawMethod = 'Fingered';
        } else if (row.mode === '-') {
          rawMethod = '-';
        }

        const transMethod = translateMethod(rawMethod, lang);
        
        return [
          row.name,
          row.dept,
          row.section,
          row.position,
          row.date,
          row.checkIn,
          row.checkOut,
          `${(row.lateMinutes || 0) + penalty} ${minStr}`,
          transStatus,
          transMethod
        ];
      });

      const detailHead = isIndo
        ? [['Karyawan', 'Dept', 'Bagian', 'Jabatan', 'Tanggal', 'Masuk', 'Keluar', 'Telat', 'Status', 'Metode']]
        : isKo
        ? [['사원명', '부서', '파트', '직급', '날짜', '출근', '퇴근', '지각', '상태', '인증 방식']]
        : isZh
        ? [['员工', '部门', '班组', '职位', '日期', '签到', '签退', '迟到', '状态', '打卡方式']]
        : [['Employee', 'Dept', 'Section', 'Position', 'Date', 'Check In', 'Check Out', 'Lateness', 'Status', 'Method']];

      autoTable(doc, {
        startY: 56,
        head: detailHead,
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, fillColor: [255, 255, 255], textColor: [51, 65, 85] },
        columnStyles: {
          7: { halign: 'center', fontStyle: 'bold' },
          8: { halign: 'center' },
          9: { halign: 'center' }
        }
      });

      const filePrefix = isIndo ? 'Laporan_Absensi' : isKo ? '근태_보고서' : isZh ? '考勤报告' : 'Attendance_Report';
      doc.save(`${filePrefix}_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal export PDF: ' + err.message);
    }
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
          <span className="text-[10px] font-bold uppercase tracking-wider">{t('attendancePage.categoryTitle')}</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t('attendancePage.syncCenter')}</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
          <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3 whitespace-nowrap">
            <span>{t('attendancePage.title')}</span>
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              {t('attendancePage.realtimeData')}
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
                <span>{t('attendancePage.btnSync')}</span>
              </button>
              <button 
                onClick={() => setSwapModalOpen(true)}
                className="group flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all border border-slate-200 shadow-sm active:scale-95 uppercase tracking-wider"
              >
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-500" /> 
                <span>{t('attendancePage.btnShift')}</span>
              </button>
              <button 
                onClick={() => setImportOpen(true)}
                className="group flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold text-slate-600 hover:text-emerald-600 hover:border-emerald-200 transition-all border border-slate-200 shadow-sm active:scale-95 uppercase tracking-wider"
              >
                <Upload className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" /> 
                <span>{t('attendancePage.btnUpload')}</span>
              </button>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200 shadow-sm">
              <button 
                onClick={openReportModal}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-all group shadow-sm"
                title={t('attendancePage.tooltipPrintDetail')}
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover:text-emerald-600 transition-all" />
              </button>
              <button 
                onClick={handleExportPDF}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-all group shadow-sm"
                title={t('attendancePage.tooltipExportPDF')}
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover:text-rose-600 transition-all" />
              </button>
              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 group"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:rotate-12 transition-transform" /> 
                <span>{t('attendancePage.btnExportExcel')}</span>
              </button>
              
              <button 
                onClick={() => {
                  let activeDate = new Date().toISOString().split('T')[0];
                  if (appliedFilters.period !== 'Today' && appliedFilters.startDate) {
                    activeDate = appliedFilters.startDate;
                  }
                  navigate('/admin/manual-correction', { state: { date: activeDate } });
                }}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 group cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:scale-110 transition-transform" /> 
                <span>{t('attendancePage.btnBulkCorrection')}</span>
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
        initialFilters={appliedFilters}
      />

      {/* Operational Summary Metrics */}
      {!isLoading && displaySummary && (
        <div className="space-y-6">
          {/* Visual Analytics Widget Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Widget 1: Attendance Rate Gauge */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-6 hover:shadow-md transition-all">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t('attendancePage.attendanceRate')}</span>
                <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                  {(() => {
                    const totalHadir = (displaySummary.hadir || 0) + (displaySummary.telat || 0);
                    const totalExcludeOff = (displaySummary.total || 0) - ((displaySummary.holiday || 0) + (displaySummary.cuti || 0) + (displaySummary.sakit || 0) + (displaySummary.izin || 0));
                    return totalExcludeOff > 0 ? Math.round((totalHadir / totalExcludeOff) * 100) : 100;
                  })()}%
                </p>
                <span className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t('attendancePage.presentOnTime')}
                </span>
              </div>
              
              <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-emerald-500 transition-all duration-1000 ease-out"
                    strokeDasharray={`${(() => {
                      const totalHadir = (displaySummary.hadir || 0) + (displaySummary.telat || 0);
                      const totalExcludeOff = (displaySummary.total || 0) - ((displaySummary.holiday || 0) + (displaySummary.cuti || 0) + (displaySummary.sakit || 0) + (displaySummary.izin || 0));
                      return totalExcludeOff > 0 ? Math.round((totalHadir / totalExcludeOff) * 100) : 100;
                    })()}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <TrendingUp className="w-5 h-5 text-emerald-500 absolute" />
              </div>
            </div>

            {/* Widget 2: Lateness Rate Gauge */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-6 hover:shadow-md transition-all">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t('attendancePage.lateRatio')}</span>
                <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                  {(() => {
                    const totalLateDays = (displaySummary.telat || 0);
                    const totalDays = (displaySummary.total || 0);
                    return totalDays > 0 ? Math.round((totalLateDays / totalDays) * 100) : 0;
                  })()}%
                </p>
                <span className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1.5 mt-1">
                  <Clock className="w-3.5 h-3.5 animate-pulse" /> {t('attendancePage.lateArrival')}
                </span>
              </div>
              
              <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-amber-500 transition-all duration-1000 ease-out"
                    strokeDasharray={`${(() => {
                      const totalLateDays = (displaySummary.telat || 0);
                      const totalDays = (displaySummary.total || 0);
                      return totalDays > 0 ? Math.round((totalLateDays / totalDays) * 100) : 0;
                    })()}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <Clock className="w-5 h-5 text-amber-500 absolute" />
              </div>
            </div>

            {/* Widget 3: Anomalies Alert Card */}
            <div className={`p-6 rounded-2xl border flex items-center justify-between gap-6 hover:shadow-md transition-all ${
              data?.data?.filter(isAnomaly).length > 0 
                ? 'bg-amber-50/50 border-amber-200 animate-pulse' 
                : 'bg-white border-slate-200'
            }`}>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t('attendancePage.anomalies')}</span>
                <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                  {data?.data?.filter(isAnomaly).length} {t('attendancePage.records', { count: data?.data?.filter(isAnomaly).length })}
                </p>
                {data?.data?.filter(isAnomaly).length > 0 ? (
                  <button 
                    onClick={() => setAnomalyFilter('ANOMALY')}
                    className="text-[9px] font-bold text-amber-600 hover:text-amber-800 underline uppercase flex items-center gap-1.5 transition-colors cursor-pointer mt-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> {t('attendancePage.tinjauAnomali')}
                  </button>
                ) : (
                  <span className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t('attendancePage.cleanValid')}
                  </span>
                )}
              </div>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${
                data?.data?.filter(isAnomaly).length > 0
                  ? 'bg-amber-100 border-amber-200 text-amber-600'
                  : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}>
                <ShieldAlert className="w-7 h-7" />
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-${displaySummary.uniqueEmployeeCount === 1 ? '8' : '7'} gap-4`}>
            {[
              { key: 'Total Data', label: t('attendancePage.kpiTotal'), value: displaySummary.total, color: 'blue', icon: Filter, desc: t('attendancePage.semua') },
              { key: 'Hadir', label: t('attendancePage.kpiPresent'), value: displaySummary.hadir, color: 'emerald', icon: CheckCircle2, desc: t('attendancePage.presentOnTime') },
              { key: 'Terlambat', label: t('attendancePage.kpiLate'), value: displaySummary.telat, color: 'amber', icon: Clock, desc: t('attendancePage.kpiTotal') },
              { key: 'Pulang Cepat', label: t('attendancePage.kpiEarlyDeparture'), value: displaySummary.pulangCepat || 0, color: 'purple', icon: Clock, desc: t('attendancePage.kpiEarlyDeparture') },
              { key: 'Mangkir', label: t('attendancePage.kpiMangkir'), value: displaySummary.mangkir, color: 'rose', icon: AlertCircle, desc: t('attendancePage.kpiMangkir') },
              { key: 'Alpa', label: t('attendancePage.kpiAbsent'), value: displaySummary.absen, color: 'red', icon: XCircle, desc: t('attendancePage.kpiAbsent') },
              displaySummary.uniqueEmployeeCount === 1 && { key: 'Total Terlambat', label: t('attendancePage.kpiTotalLate'), value: formatDuration(displaySummary.totalLate || 0, i18n.language), color: 'rose', icon: Clock, desc: t('attendancePage.kpiTotalLate') },
              { key: 'Lainnya', label: t('attendancePage.kpiOther'), value: (displaySummary.holiday || 0) + (displaySummary.cuti || 0) + (displaySummary.sakit || 0) + (displaySummary.izin || 0), color: 'slate', icon: Calendar, desc: t('attendancePage.kpiOther') },
            ].filter(Boolean).map((item) => {
              const isActive = 
                (item.key === 'Total Data' && !appliedFilters.status) ||
                (item.key === 'Hadir' && appliedFilters.status === 'PRESENT') ||
                ((item.key === 'Terlambat' || item.key === 'Total Terlambat') && appliedFilters.status === 'LATE') ||
                (item.key === 'Pulang Cepat' && appliedFilters.status === 'EARLY_DEPARTURE') ||
                (item.key === 'Mangkir' && appliedFilters.status === 'MANGKIR') ||
                (item.key === 'Alpa' && appliedFilters.status === 'ABSENT') ||
                (item.key === 'Lainnya' && appliedFilters.status === 'HOLIDAY');

              return (
                <div 
                  key={item.key} 
                  onClick={() => handleCardClick(item.key)}
                  className={`bg-white p-4 rounded-2xl border shadow-sm flex flex-col gap-3 hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 cursor-pointer active:scale-95 transition-all duration-200 group ${
                    isActive 
                      ? 'ring-2 ring-blue-500/50 border-blue-400 bg-blue-50/10' 
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className={`w-8 h-8 rounded-xl bg-${item.color}-50 flex items-center justify-center border border-${item.color}-100 transition-transform group-hover:scale-110 group-hover:-rotate-3`}>
                      <item.icon className={`w-4 h-4 text-${item.color}-600`} />
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping shadow-[0_0_5px_rgba(37,99,235,0.5)]" />
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-slate-800 leading-tight">{item.value}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-50">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{item.desc}</p>
                  </div>
                </div>
              );
            })}
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
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('attendancePage.personalLate')}</h3>
                    <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                      {formatDuration(displaySummary.totalLate, i18n.language)}
                    </p>
                  </div>
                </div>
                <div className="hidden lg:block h-16 w-px bg-slate-100" />
                <div className="hidden lg:flex flex-col items-end text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('attendancePage.employeeProfile')}</p>
                  <p className="text-2xl font-black text-slate-800 uppercase">{data?.data[0]?.name}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Central Intelligence Data Grid */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl">
        {/* Primary View Tab Controls */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 print:hidden text-[11px] font-bold uppercase tracking-wider">
          <button
            onClick={() => setActiveViewTab('DETAIL')}
            className={`flex-1 sm:flex-initial px-6 py-3.5 transition-all text-center border-b-2 ${
              activeViewTab === 'DETAIL'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('attendancePage.tabDetail')}
          </button>
          <button
            onClick={() => setActiveViewTab('REKAPITULASI')}
            className={`flex-1 sm:flex-initial px-6 py-3.5 transition-all text-center border-b-2 ${
              activeViewTab === 'REKAPITULASI'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('attendancePage.tabDeptRecap')}
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shadow-[0_0_5px_rgba(37,99,235,0.5)]" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {activeViewTab === 'DETAIL' ? t('navigation.attendanceData') : t('attendancePage.tabDeptRecap')} <span className="text-slate-300 mx-2">|</span> 
              Total: <span className="text-slate-700 ml-1">{activeViewTab === 'DETAIL' ? `${displaySummary?.total || 0} ${t('attendancePage.rows')}` : `${rekapData.length} ${t('attendancePage.records')}`}</span>
            </p>
          </div>
          
          {/* Anomaly filter selector tabs */}
          {activeViewTab === 'DETAIL' && (
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[9px] font-bold tracking-wider uppercase">
               <button 
                 onClick={() => setAnomalyFilter('ALL')}
                 className={`px-3 py-1.5 rounded-md transition-all ${
                   anomalyFilter === 'ALL' 
                     ? 'bg-white text-blue-600 shadow-sm' 
                     : 'text-slate-500 hover:text-slate-800'
                 }`}
               >
                 {t('attendancePage.semua')}
               </button>
               <button 
                 onClick={() => setAnomalyFilter('ANOMALY')}
                 className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                   anomalyFilter === 'ANOMALY' 
                     ? 'bg-amber-500 text-white shadow-sm' 
                     : 'text-slate-500 hover:text-slate-800'
                 }`}
               >
                 <AlertTriangle className="w-3.5 h-3.5" />
                 {t('attendancePage.hanyaAnomali')}
               </button>
            </div>
          )}
        </div>
        
        {activeViewTab === 'DETAIL' ? (
          <>
            <div className="relative overflow-auto min-h-[600px] hide-scrollbar custom-scrollbar">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 z-30 bg-slate-50 border-b border-slate-100 shadow-sm">
                  <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">
                      <button onClick={() => handleSort('name')} className="flex items-center gap-2 group/btn">
                        {t('attendancePage.employeeName')}
                        <SortIcon column="name" />
                      </button>
                    </th>
                    <th className="px-4 py-4">
                      <button onClick={() => handleSort('date')} className="flex items-center gap-2 group/btn">
                        {t('attendancePage.date')}
                        <SortIcon column="date" />
                      </button>
                    </th>
                    <th className="px-4 py-4 text-center">{t('attendancePage.method')}</th>
                    <th className="px-4 py-4 text-center">{t('attendancePage.checkIn')}</th>
                    <th className="px-4 py-4 text-center">{t('attendancePage.checkOut')}</th>
                    <th className="px-6 py-4">
                      <button onClick={() => handleSort('status')} className="flex items-center gap-2 mx-auto group/btn">
                        {t('attendancePage.status')}
                        <SortIcon column="status" />
                      </button>
                    </th>
                    <th className="px-4 py-4 text-center">{t('attendancePage.late')}</th>
                    <th className="px-4 py-4 text-center">{t('attendancePage.overtime')}</th>
                    <th className="px-4 py-4">
                      <button onClick={() => handleSort('dept')} className="flex items-center gap-2 group/btn">
                        {t('attendancePage.department')}
                        <SortIcon column="dept" />
                      </button>
                    </th>
                    <th className="px-4 py-4">{t('attendancePage.section')}</th>
                    <th className="px-4 py-4">{t('attendancePage.position')}</th>
                    <th className="px-4 py-4 text-center">{t('attendancePage.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan="12" className="text-center py-24">
                        <div className="flex flex-col items-center gap-4">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">{t('attendancePage.msgLoading')}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (!filteredData || filteredData.length === 0) ? (
                    <tr>
                      <td colSpan="12" className="text-center py-24">
                        <div className="flex flex-col items-center gap-4 opacity-70">
                          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                            <Calendar className="w-8 h-8 text-slate-400" />
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.msgEmpty')}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-medium">{t('attendancePage.msgNoData')}</p>
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
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider group-hover/name:text-blue-400">{row.employeeCode || 'SYS_ID_ERR'}</span>
                              <span className="text-[8px] text-slate-300 font-black">•</span>
                              <span 
                                className="inline-flex items-center text-[8px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-widest shadow-sm cursor-help hover:bg-blue-100 transition-all"
                                title={`Jam Kerja: ${row.shiftTime || '08:00 - 17:00'}`}
                              >
                                {row.shiftName || 'Default Shift'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{row.date}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {(row.source === 'face_cctv' || row.mode === 'Face CCTV') ? (
                            <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-indigo-100 shadow-sm" title={i18n.language.startsWith('id') ? 'Deteksi Wajah via CCTV' : 'Face Detection via CCTV'}>
                              <Camera className="w-3.5 h-3.5 text-indigo-500" />
                              {translateMethod('Face CCTV', i18n.language)}
                            </span>
                          ) : (row.source === 'face_web' || row.mode === 'Face ID' || row.mode === 'Face HP') ? (
                            <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-teal-100 shadow-sm" title={i18n.language.startsWith('id') ? 'Deteksi Wajah via HP' : 'Face Detection via HP'}>
                              <Smartphone className="w-3.5 h-3.5 text-teal-500" />
                              {translateMethod('Face HP', i18n.language)}
                            </span>
                          ) : (row.mode === 'Pinned' || row.mode === 'Pin') ? (
                            <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-amber-100 shadow-sm" title={i18n.language.startsWith('id') ? 'Menggunakan PIN pada Mesin' : 'Using PIN on Device'}>
                              <Key className="w-3.5 h-3.5 text-amber-500" />
                              {translateMethod('Pinned', i18n.language)}
                            </span>
                          ) : (row.mode === 'Fingered' || row.mode === 'Fingerprint' || row.source === 'fingerprint') ? (
                            <span className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-sky-100 shadow-sm" title={i18n.language.startsWith('id') ? 'Menggunakan Sidik Jari (Fingerprint)' : 'Using Fingerprint'}>
                              <Fingerprint className="w-3.5 h-3.5 text-sky-500" />
                              {translateMethod('Fingered', i18n.language)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 shadow-sm" title={i18n.language.startsWith('id') ? 'Manual / Koreksi HRD' : 'Manual / HR Correction'}>
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                              {translateMethod('Manual', i18n.language)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-xs font-bold text-slate-800 tracking-widest">{row.checkIn || '--:--'}</span>
                            {row.checkinPhotoUrl && (
                              <button
                                onClick={() => setPhotoModal({
                                  isOpen: true,
                                  photoUrl: row.checkinPhotoUrl,
                                  employeeName: row.name,
                                  date: row.date,
                                  type: 'Check-In',
                                  similarity: row.checkinSimilarity,
                                  cameraId: row.checkinCameraId
                                })}
                                className="p-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 text-indigo-500 border border-indigo-100 transition-all hover:scale-110 active:scale-95 ml-1"
                                title={i18n.language.startsWith('id') ? 'Lihat Foto CCTV Masuk' : i18n.language.startsWith('ko') ? 'CCTV 입실 사진 보기' : i18n.language.startsWith('zh') ? '查看CCTV签到照片' : 'View Check-In CCTV Photo'}
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-rose-500" />
                            <span className="text-xs font-bold text-slate-800 tracking-widest">{row.checkOut || '--:--'}</span>
                            {row.checkoutPhotoUrl && (
                              <button
                                onClick={() => setPhotoModal({
                                  isOpen: true,
                                  photoUrl: row.checkoutPhotoUrl,
                                  employeeName: row.name,
                                  date: row.date,
                                  type: 'Check-Out',
                                  similarity: row.checkoutSimilarity,
                                  cameraId: row.checkoutCameraId
                                })}
                                className="p-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 text-indigo-500 border border-indigo-100 transition-all hover:scale-110 active:scale-95 ml-1"
                                title={i18n.language.startsWith('id') ? 'Lihat Foto CCTV Pulang' : i18n.language.startsWith('ko') ? 'CCTV 퇴실 사진 보기' : i18n.language.startsWith('zh') ? '查看CCTV签退照片' : 'View Check-Out CCTV Photo'}
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all ${getStatusColor(row.status)}`}>
                              {translateStatus(row.status, i18n.language)}
                            </span>
                            {row.source === 'face_cctv' && (row.checkinSimilarity || row.checkoutSimilarity) && (
                              <div className="flex flex-col items-center gap-0.5 mt-0.5 text-[8px] font-black text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                {row.checkinSimilarity && (
                                  <span>In: {Math.round(row.checkinSimilarity * 100)}%</span>
                                )}
                                {row.checkoutSimilarity && (
                                  <span>Out: {Math.round(row.checkoutSimilarity * 100)}%</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {(row.status === 'Terlambat' || row.status === 'LATE') ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">+{row.lateMinutes}m</span>
                          ) : (row.status === 'Mangkir' || row.status === 'MANGKIR') ? (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                              +{ (row.lateMinutes || 0) + ((row.lateMinutes || 0) === 0 ? (
                                !row.checkIn 
                                  ? (companySettings?.penaltyRule1Enabled !== 'false' ? parseInt(companySettings?.penaltyRule1Minutes || '30', 10) : 0)
                                  : (companySettings?.penaltyRule3Enabled !== 'false' ? parseInt(companySettings?.penaltyRule3Minutes || '30', 10) : 0)
                              ) : 0) }m
                            </span>
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
                          <button
                            onClick={() => {
                              if (row.dept) {
                                setAppliedFilters(prev => ({ ...prev, dept: row.dept, section: '', page: 1 }));
                              }
                            }}
                            className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm"
                            title={i18n.language.startsWith('id') ? 'Klik untuk memfilter departemen ini' : i18n.language.startsWith('ko') ? '이 부서를 필터링하려면 클릭하십시오' : i18n.language.startsWith('zh') ? '点击筛选此部门' : 'Click to filter this department'}
                          >
                            {row.dept || 'N/A'}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          {row.section ? (
                            <button
                              onClick={() => {
                                setAppliedFilters(prev => ({ ...prev, dept: row.dept || '', section: row.section, page: 1 }));
                              }}
                              className="text-[10px] font-bold text-slate-600 hover:text-blue-600 hover:underline uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
                              title={i18n.language.startsWith('id') ? 'Klik untuk memfilter bagian ini' : i18n.language.startsWith('ko') ? '이 파트를 필터링하려면 클릭하십시오' : i18n.language.startsWith('zh') ? '点击筛选此班组' : 'Click to filter this section'}
                            >
                              {row.section}
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-[10px] font-bold text-slate-600 uppercase tracking-wider">{row.position || '—'}</td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {(row.status === 'Terlambat' || row.status === 'LATE') && (
                              <button
                                onClick={() => handleQuickWaiver(row)}
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-255 hover:border-emerald-300 transition-all active:scale-95"
                                title="Beri Dispensasi Keterlambatan"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={() => setCorrectionModal({
                                isOpen: true,
                                recordId: row.id,
                                employeeName: row.name,
                                employeeCode: row.employeeCode,
                                rawDate: row.date,
                                currentStatus: row.status,
                                newStatus: row.status !== 'PRESENT' && row.status !== 'Hadir' ? 'PRESENT' : 'PRESENT',
                                notes: '',
                                overtimeHours: row.overtimeHours || 0,
                                checkInTime: parseTimeForInput(row.checkIn),
                                checkOutTime: parseTimeForInput(row.checkOut),
                                lateMinutes: row.lateMinutes || 0,
                                attachment: ''
                              })}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-200 transition-all active:scale-95"
                              title="Koreksi Status"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => navigate('/admin/manual-correction', { 
                                state: { 
                                  date: row.date, 
                                  search: row.employeeCode 
                                } 
                              })}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-all active:scale-95 cursor-pointer"
                              title="Koreksi Bulk HRD"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
                    {t('attendancePage.page')} <span className="text-slate-800 mx-1">{appliedFilters.page}</span> / <span className="text-slate-600 ml-1">{data?.totalPages || 1}</span>
                  </p>
                  <div className="w-1 h-1 rounded-full bg-slate-300" />
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    {t('attendancePage.kpiTotal')}: <span className="text-blue-600 font-bold">{data?.total || 0}</span>
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
          </>
        ) : (
          <div className="relative overflow-x-auto overflow-y-visible min-h-[400px] pb-48 hide-scrollbar custom-scrollbar animate-in fade-in duration-300">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="sticky top-0 z-30 bg-slate-50 border-b border-slate-100 shadow-sm">
                <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-6 py-4 text-center">{t('attendancePage.no', 'No')}</th>
                  <th className="px-6 py-4">{t('attendancePage.employeeName')}</th>
                  <th className="px-6 py-4">{t('attendancePage.department')}</th>
                  <th className="px-4 py-4">{t('attendancePage.section')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiTotal')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiPresent')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiLate')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiEarlyDeparture')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiMangkir')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiAbsent')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.kpiOther')}</th>
                  <th className="px-6 py-4 text-center">{t('attendancePage.attendanceRate')}</th>
                  <th className="px-6 py-4 text-center">{t('attendancePage.kpiTotalLate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isRekapLoading ? (
                  <tr>
                    <td colSpan="13" className="text-center py-24">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">{t('attendancePage.msgLoading')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (!rekapData || rekapData.length === 0) ? (
                  <tr>
                    <td colSpan="13" className="text-center py-24">
                      <div className="flex flex-col items-center gap-4 opacity-70">
                        <Calendar className="w-16 h-16 text-slate-300" />
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.msgNoData')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rekapData.map((row, index) => {
                    const totalExcludeOff = row.total - row.other;
                    const rate = totalExcludeOff > 0 ? Math.round((row.present / totalExcludeOff) * 100) : 100;
                    
                    return (
                      <tr key={index} className="group transition-all duration-300 hover:bg-blue-50/50 bg-white">
                        <td className="px-6 py-4 text-xs font-semibold text-slate-500 text-center border-b border-slate-100">{index + 1}</td>
                        <td className="px-6 py-4 border-b border-slate-100">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800 uppercase">{row.name}</span>
                            <span className="text-[9px] text-slate-500 font-semibold uppercase mt-0.5">{row.employeeCode}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 border-b border-slate-100">
                          <button
                            onClick={() => {
                              if (row.dept) {
                                setAppliedFilters(prev => ({ ...prev, dept: row.dept, section: '', page: 1 }));
                              }
                            }}
                            className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm"
                            title={i18n.language.startsWith('id') ? 'Klik untuk memfilter departemen ini' : i18n.language.startsWith('ko') ? '이 부서를 필터링하려면 클릭하십시오' : i18n.language.startsWith('zh') ? '点击筛选此部门' : 'Click to filter this department'}
                          >
                            {row.dept}
                          </button>
                        </td>
                        <td className="px-4 py-4 border-b border-slate-100">
                          {row.section ? (
                            <button
                              onClick={() => {
                                setAppliedFilters(prev => ({ ...prev, dept: row.dept || '', section: row.section, page: 1 }));
                              }}
                              className="text-[10px] font-bold text-slate-700 hover:text-blue-600 hover:underline uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
                              title={i18n.language.startsWith('id') ? 'Klik untuk memfilter bagian ini' : i18n.language.startsWith('ko') ? '이 파트를 필터링하려면 클릭하십시오' : i18n.language.startsWith('zh') ? '点击筛选此班组' : 'Click to filter this section'}
                            >
                              {row.section}
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center text-xs font-bold text-slate-800 border-b border-slate-100">{row.total}</td>
                        <td className="px-4 py-4 text-center text-xs font-bold text-emerald-600 border-b border-slate-100">{row.present}</td>
                        
                        {/* Terlambat Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-4 text-center text-xs font-bold text-amber-600 cursor-help border-b border-slate-100">
                          <span className={row.late > 0 ? "underline decoration-dotted decoration-amber-450" : ""}>{row.late}</span>
                          {row.late > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-amber-450">{t('attendancePage.kpiLate')} (Detail)</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.lateDetails.map((d, i) => (
                                  <div key={i} className="flex items-center justify-between gap-3 py-0.5 border-b border-slate-800 last:border-0">
                                    <span className="font-bold text-slate-250">{d.date}</span>
                                    <span className="text-slate-400 text-[9px]">IN {d.checkIn || '--:--'}</span>
                                    <span className="text-amber-400 font-extrabold text-[9px]">+{d.lateMinutes}m</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        
                        {/* Pulang Cepat Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-4 text-center text-xs font-bold text-blue-600 cursor-help border-b border-slate-100">
                          <span className={row.pulangCepat > 0 ? "underline decoration-dotted decoration-blue-400" : ""}>{row.pulangCepat || 0}</span>
                          {row.pulangCepat > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-blue-400">{t('attendancePage.kpiEarlyDeparture')} (Detail)</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.pulangCepatDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{d.date}</span>
                                    <span className="text-slate-400">({d.checkOut || '--:--'} / Jdwl: {d.shiftEnd || '17:00'})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        
                        {/* Mangkir Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-4 text-center text-xs font-bold text-orange-600 cursor-help border-b border-slate-100">
                          <span className={row.mangkir > 0 ? "underline decoration-dotted decoration-orange-400" : ""}>{row.mangkir}</span>
                          {row.mangkir > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-orange-400">{t('attendancePage.kpiMangkir')} (Detail)</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.mangkirDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{d.date}</span>
                                    <span className="text-slate-400">({d.checkIn || '--:--'} - {d.checkOut || '--:--'})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Alpa Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-4 text-center text-xs font-bold text-rose-600 cursor-help border-b border-slate-100">
                          <span className={row.absent > 0 ? "underline decoration-dotted decoration-rose-450" : ""}>{row.absent}</span>
                          {row.absent > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-rose-450">{t('attendancePage.kpiAbsent')} (Detail)</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.absentDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{d.date}</span>
                                    <span className="text-rose-450">{translateStatus('ABSENT', i18n.language)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Cuti/Sakit/Izin Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-4 text-center text-xs font-bold text-slate-500 cursor-help border-b border-slate-100">
                          <span className={row.other > 0 ? "underline decoration-dotted decoration-slate-400" : ""}>{row.other}</span>
                          {row.other > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-blue-400">{t('attendancePage.kpiOther')} (Detail)</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.otherDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{d.date}</span>
                                    <span className="text-blue-400 font-extrabold uppercase text-[8px] tracking-wider bg-blue-950 px-1.5 py-0.5 rounded border border-blue-900">{translateStatus(d.status, i18n.language)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center border-b border-slate-100">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            rate >= 95 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            rate >= 90 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            rate >= 80 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {rate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-xs font-bold text-rose-600 border-b border-slate-100">
                          {row.totalLateMinutes > 0 ? formatDuration(row.totalLateMinutes, i18n.language) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
                  <h3 className="font-bold text-slate-800 text-lg tracking-tight">Sinkronisasi Mesin</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Impor Data Biometrik</p>
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
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Arsitektur</p>
                      <p className="text-[10px] text-slate-800 font-bold uppercase tracking-tighter">NIK_PROTOCOL_V2</p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 group hover:border-emerald-300 transition-all">
                      <Calendar className="w-5 h-5 text-emerald-600 mb-3" />
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rentang Waktu</p>
                      <p className="text-[10px] text-slate-800 font-bold uppercase tracking-tighter">MULTI_VECTOR_SYNC</p>
                    </div>
                  </div>

                  <label className="group block relative cursor-pointer">
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImport} />
                    <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center transition-all group-hover:border-blue-400 group-hover:bg-blue-50/50">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6 transition-all group-hover:scale-110 group-hover:border-blue-200">
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
                      </div>
                      <h4 className="font-bold text-slate-800 uppercase tracking-wider text-sm">Unggah File Absensi</h4>
                      <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-wider">Format: XLSX, XLS, CSV</p>
                      
                      <div className="mt-8 px-8 py-3 bg-slate-100 group-hover:bg-blue-600 text-slate-600 group-hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
                        PILIH FILE ABSENSI
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
                        {importProgress.phase === 'saving' ? 'Menyimpan ke Database' : 
                         importProgress.phase === 'parsing' ? 'Membaca Data' :
                         importProgress.phase === 'matching' ? 'Mencocokkan Karyawan' :
                         'Memproses Data'}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest animate-pulse">
                        {importProgress.detail || 'Sedang memproses...'}
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
                <h3 className="font-bold text-slate-800 text-lg tracking-tight">Audit Absensi</h3>
              </div>
              <button onClick={() => !isRecalculating && setRecalcModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl flex gap-4">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-[10px] text-blue-800 leading-relaxed font-bold uppercase tracking-wider">
                  Peringatan: Protokol ini akan memaksa perhitungan ulang mendalam untuk keterlambatan jam masuk berdasarkan parameter shift yang ditentukan.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tanggal Mulai</label>
                  <input 
                    type="date" 
                    value={recalcRange.start}
                    onChange={(e) => setRecalcRange({...recalcRange, start: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tanggal Selesai</label>
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
              <button onClick={() => setRecalcModalOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl uppercase tracking-wider transition-all">Batal</button>
              <button 
                disabled={isRecalculating}
                onClick={handleRecalculate}
                className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 transition-all"
              >
                {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : 'Jalankan Audit'}
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

      {/* CCTV Photo Modal */}
      {photoModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" 
            onClick={() => setPhotoModal(prev => ({ ...prev, isOpen: false }))} 
          />
          
          <div className="bg-white w-full max-w-lg relative z-10 overflow-hidden shadow-2xl rounded-3xl border border-slate-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shadow-sm">
                  <Camera className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm tracking-tight">Foto Capture CCTV</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{photoModal.employeeName}</p>
                </div>
              </div>
              <button 
                onClick={() => setPhotoModal(prev => ({ ...prev, isOpen: false }))} 
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-all"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">
                {photoModal.photoUrl ? (
                  <img 
                    src={getFileUrl(photoModal.photoUrl)} 
                    alt="CCTV Snap" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="text-slate-500 text-xs uppercase font-bold tracking-widest">Foto tidak ditemukan</p>
                )}
                {photoModal.similarity && (
                  <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur text-white px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-700 shadow flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>AI MATCH: {Math.round(photoModal.similarity * 100)}%</span>
                  </div>
                )}
              </div>

              {/* Metadata Info */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-bold text-slate-700">
                <div className="space-y-1">
                  <span className="block text-[9px] text-slate-400 uppercase tracking-wider">Tipe Deteksi</span>
                  <span className="text-slate-800 uppercase">{photoModal.type}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[9px] text-slate-400 uppercase tracking-wider">Kamera / Gate</span>
                  <span className="text-slate-800 uppercase">{photoModal.cameraId || 'CAMERA_01'}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setPhotoModal(prev => ({ ...prev, isOpen: false }))}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 shadow-sm"
              >
                Tutup Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// --- Sub-component to optimize performance ---

const FilterBar = ({ onApply, isLoading, currentSearch, initialFilters }) => {
  const { t, i18n } = useTranslation();
  const [filterDate, setFilterDate] = useState(initialFilters?.period || 'Today');
  const [customStart, setCustomStart] = useState(initialFilters?.startDate || '');
  const [customEnd, setCustomEnd] = useState(initialFilters?.endDate || '');
  const [filterDept, setFilterDept] = useState(initialFilters?.dept || '');
  const [filterSection, setFilterSection] = useState(initialFilters?.section || '');
  const [filterPosition, setFilterPosition] = useState(initialFilters?.position || '');
  const [filterStatus, setFilterStatus] = useState(initialFilters?.status || '');
  const [searchQuery, setSearchQuery] = useState(currentSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(currentSearch || '');

  useEffect(() => {
    if (initialFilters) {
      setFilterDate(initialFilters.period || 'Today');
      setCustomStart(initialFilters.startDate || '');
      setCustomEnd(initialFilters.endDate || '');
      setFilterDept(initialFilters.dept || '');
      setFilterSection(initialFilters.section || '');
      setFilterPosition(initialFilters.position || '');
      setFilterStatus(initialFilters.status || '');
      setSearchQuery(initialFilters.search || '');
    }
  }, [initialFilters]);

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
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('attendancePage.filterTimeRange')}:</label>
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
                {period === 'Today' ? t('attendancePage.filterToday') : period === 'This Week' ? t('attendancePage.filterThisWeek') : period === 'This Month' ? t('attendancePage.filterThisMonth') : t('attendancePage.filterSelectDate')}
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
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('attendancePage.filterSearch')}</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder={t('attendancePage.placeholderSearch')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
              />
            </div>
          </div>

          {[
            { label: t('attendancePage.department'), val: filterDept, setter: setFilterDept, opts: masterOptions.departments.map(d => ({ v: d.name, l: d.name })), onChg: () => { setFilterSection(''); setFilterPosition(''); } },
            { label: t('attendancePage.section'), val: filterSection, setter: setFilterSection, opts: masterOptions.sections.map(s => ({ v: s, l: s })) },
            { label: t('attendancePage.position'), val: filterPosition, setter: setFilterPosition, opts: masterOptions.positions.map(p => ({ v: p, l: p })) },
            { label: t('attendancePage.filterStatus'), val: filterStatus, setter: setFilterStatus, opts: masterOptions.statuses.map(s => ({ v: s, l: translateStatus(s, i18n.language) || s })) }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => { field.setter(e.target.value); field.onChg?.(); }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none uppercase tracking-wider transition-all shadow-sm truncate"
                >
                  <option value="">{t('attendancePage.semua')}</option>
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
            <span className="text-[10px] font-bold tracking-wider uppercase">{t('attendancePage.btnApplyFilter')}</span>
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
