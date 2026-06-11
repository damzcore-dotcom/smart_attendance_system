import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { attendanceAPI, employeeAPI, settingsAPI, getFileUrl } from '../../services/api';
import PrintableAttendanceReport from '../../components/payroll/PrintableAttendanceReport';
import { 
  Edit2, LayoutDashboard, Clock, RefreshCw, Upload, 
  FileSpreadsheet, Printer, FileText 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { isPresent, isAbsent } from '../../utils/statusUtils';

// Import our modular sub-components
import AttendanceSummary from '../../components/admin/attendance/AttendanceSummary';
import AttendanceFilters from '../../components/admin/attendance/AttendanceFilters';
import AttendanceTable from '../../components/admin/attendance/AttendanceTable';
import AttendanceModals from '../../components/admin/attendance/AttendanceModals';

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
    'IZIN': isIndo ? 'Izin' : isKo ? '외출/조退' : isZh ? '事假' : 'Permit',
    'PERMIT': isIndo ? 'Izin' : isKo ? '외출/조退' : isZh ? '事假' : 'Permit',
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

const getPaddedRecords = (rawRecords, summary, appliedFilters, sortConfig) => {
  if (!rawRecords || rawRecords.length === 0) return [];
  const uniqueEmployeeCount = summary?.uniqueEmployeeCount || 1;
  
  if (uniqueEmployeeCount === 1 && appliedFilters.search) {
    let startDate, endDate;
    const now = new Date();
    
    if (appliedFilters.period === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date();
    } else if (appliedFilters.period === 'This Week') {
      const day = now.getDay();
      const diff = now.getDate() - (day === 0 ? 6 : day - 1);
      startDate = new Date(now.getFullYear(), now.getMonth(), diff);
      endDate = new Date();
    } else if (appliedFilters.period === 'Custom' && appliedFilters.startDate && appliedFilters.endDate) {
      startDate = new Date(appliedFilters.startDate);
      endDate = new Date(appliedFilters.endDate);
      if (endDate > now) endDate = now;
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
  const [anomalyFilter, setAnomalyFilter] = useState('ALL');
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
    locationId: '',
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
        if (search !== undefined) updated.search = search;
        if (status !== undefined) updated.status = status;
        return updated;
      });
      if (viewTab) setActiveViewTab(viewTab);
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
  const [printReports, setPrintReports] = useState([]);

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

  const [activeViewTab, setActiveViewTab] = useState('DETAIL');

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
  }, [fullDataForRekap, companySettings]);

  const isAnomaly = (row) => {
    const hasIn = row.checkIn && row.checkIn !== '-- : --' && row.checkIn !== '--:--' && row.checkIn !== '-';
    const hasOut = row.checkOut && row.checkOut !== '-- : --' && row.checkOut !== '--:--' && row.checkOut !== '-';
    
    if ((row.status === 'MANGKIR' || row.status === 'ABSENT' || row.status === 'Alpa') && hasOut) return true;
    if (hasIn && !hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday'].includes(row.status)) return true;
    if (!hasIn && hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday'].includes(row.status)) return true;
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
    else if (label === 'Terlambat') targetStatus = 'LATE';
    else if (label === 'Total Terlambat') targetStatus = 'LATE,MANGKIR';
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
      const isPadded = String(correctionModal.recordId).startsWith('pad-');
      if (isPadded && correctionModal.employeeCode && correctionModal.rawDate) {
        payload.employeeCode = correctionModal.employeeCode;
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

      const allParams = { ...appliedFilters, page: 1, limit: 99999 };
      const allDataResponse = await attendanceAPI.getAll(allParams);
      let allRecords = allDataResponse?.data || filteredData;

      if (allDataResponse?.summary?.uniqueEmployeeCount === 1 && appliedFilters.search && allRecords.length > 0) {
        allRecords = getPaddedRecords(allRecords, allDataResponse?.summary, appliedFilters, { order: 'asc' });
      }

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

      const allParams = { ...appliedFilters, page: 1, limit: 99999 };
      const allDataResponse = await attendanceAPI.getAll(allParams);
      let rawLogs = allDataResponse?.data || filteredData;

      if (anomalyFilter === 'ANOMALY') {
        rawLogs = rawLogs.filter(isAnomaly);
      }

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
            : `${appliedFilters.dept.toUpperCase()} DEPARTMENT RECAPITULATION`;
        }
      } else {
        const isSingleEmployee = allDataResponse?.summary?.uniqueEmployeeCount === 1 && rawLogs.length > 0;
        if (isSingleEmployee) {
          const empName = rawLogs[0].name.toUpperCase();
          titleStr = isIndo ? `LAPORAN ABSENSI ${empName}` : `${empName} ATTENDANCE REPORT`;
        } else if (appliedFilters.dept) {
          titleStr = isIndo 
            ? `LAPORAN ABSENSI DEPARTEMENT ${appliedFilters.dept.toUpperCase()}` 
            : `${appliedFilters.dept.toUpperCase()} DEPARTMENT ATTENDANCE REPORT`;
        }
      }
      doc.text(titleStr, 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${labels.period}: ${getReportPeriodLabel(appliedFilters, lang)}`, 14, 28);
      
      const localeStr = isIndo ? 'id-ID' : 'en-US';
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
          : [['NIK', 'Employee Name', 'Department', 'Section', 'Total', 'Present', 'Late', 'Early Leave', 'Unexcused', 'Absent', 'Others', 'Rate %', 'Late Duration']];

        autoTable(doc, {
          startY: 56,
          head: rekapHead,
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 8, halign: 'center' },
          styles: { fontSize: 8, cellPadding: 2.5, fillColor: [255, 255, 255], textColor: [51, 65, 85] }
        });

        const filePrefix = isIndo ? 'Rekap_Absensi_Per_Dept' : 'Attendance_Recapitulation';
        doc.save(`${filePrefix}_${new Date().getTime()}.pdf`);
        return;
      }

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

      const filePrefix = isIndo ? 'Laporan_Absensi' : 'Attendance_Report';
      doc.save(`${filePrefix}_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal export PDF: ' + err.message);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await attendanceAPI.getTemplate();
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

            {/* Right Actions */}
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

        {/* Filter Controls Component */}
        <AttendanceFilters 
          onApply={setAppliedFilters}
          isLoading={isLoading}
          currentSearch={appliedFilters.search}
          initialFilters={appliedFilters}
        />

        {/* Summary Statistics Cards Component */}
        <AttendanceSummary 
          displaySummary={displaySummary}
          isLoading={isLoading}
          appliedFilters={appliedFilters}
          handleCardClick={handleCardClick}
          setAnomalyFilter={setAnomalyFilter}
          employeeName={appliedFilters.search && data?.data?.[0]?.name}
          dataList={data?.data}
        />

        {/* Navigation Tabs (Detail / Recap) */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveViewTab('DETAIL')}
            className={`flex-1 sm:flex-initial px-6 py-3.5 transition-all text-center border-b-2 font-bold text-xs uppercase tracking-wider ${
              activeViewTab === 'DETAIL'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('attendancePage.tabDetail')}
          </button>
          <button
            onClick={() => setActiveViewTab('REKAPITULASI')}
            className={`flex-1 sm:flex-initial px-6 py-3.5 transition-all text-center border-b-2 font-bold text-xs uppercase tracking-wider ${
              activeViewTab === 'REKAPITULASI'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('attendancePage.tabDeptRecap')}
          </button>
        </div>

        {/* Attendance Data Table Component */}
        <AttendanceTable 
          activeViewTab={activeViewTab}
          anomalyFilter={anomalyFilter}
          setAnomalyFilter={setAnomalyFilter}
          isLoading={isLoading}
          isRekapLoading={isRekapLoading}
          filteredData={filteredData}
          rekapData={rekapData}
          appliedFilters={appliedFilters}
          setAppliedFilters={setAppliedFilters}
          displaySummary={displaySummary}
          dataTotal={data?.total}
          dataTotalPages={data?.totalPages}
          companySettings={companySettings}
          sortConfig={sortConfig}
          handleSort={handleSort}
          handleQuickWaiver={handleQuickWaiver}
          setCorrectionModal={setCorrectionModal}
          setPhotoModal={setPhotoModal}
        />
      </div>

      {/* Modular Modals Coordinator */}
      <AttendanceModals 
        isImportOpen={isImportOpen}
        setImportOpen={setImportOpen}
        handleImport={handleImport}
        isUploading={isUploading}
        importProgress={importProgress}
        importResult={importResult}
        setImportResult={setImportResult}

        isRecalcOpen={isRecalcModalOpen}
        setRecalcOpen={setRecalcModalOpen}
        recalcRange={recalcRange}
        setRecalcRange={setRecalcRange}
        isRecalculating={isRecalculating}
        handleRecalculate={handleRecalculate}

        isSwapOpen={isSwapModalOpen}
        setSwapOpen={setSwapModalOpen}
        swapRange={swapRange}
        setSwapRange={setSwapRange}
        handleSwapDays={handleSwapDays}

        correctionModal={correctionModal}
        setCorrectionModal={setCorrectionModal}
        handleCorrectionSubmit={handleCorrectionSubmit}
        isCorrecting={isCorrecting}

        isReportOpen={isReportModalOpen}
        setReportOpen={setReportModalOpen}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        reportSearch={reportSearch}
        setReportSearch={setReportSearch}
        reportDept={reportDept}
        setReportDept={setReportDept}
        reportEmployees={reportEmployees}
        handlePrintAllReports={handlePrintAllReports}
        handlePrintReport={handlePrintReport}

        photoModal={photoModal}
        setPhotoModal={setPhotoModal}
        getFileUrl={getFileUrl}
      />

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

export default Attendance;
