import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { employeeAPI, attendanceAPI, settingsAPI } from '../../services/api';
import * as XLSX from 'xlsx';
import { 
  Users, Save, Calendar, Search, Filter, Loader2, AlertCircle, Edit3, 
  Clock, CheckSquare, Image as ImageIcon, X, History, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, Eye
} from 'lucide-react';

const ManualCorrectionHRD = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(() => {
    return location.state?.date || new Date().toISOString().split('T')[0];
  });
  const [search, setSearch] = useState(() => {
    return location.state?.search || '';
  });
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');

  useEffect(() => {
    if (location.state) {
      // Clear navigation state so reload/re-nav doesn't freeze the inputs
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, navigate]);
  
  const [activeTab, setActiveTab] = useState('KEHADIRAN'); // KEHADIRAN | LUPA_FINGER | RIWAYAT
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyDeptFilter, setHistoryDeptFilter] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [companySettings, setCompanySettings] = useState({});

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await settingsAPI.getAll();
        if (res?.data) {
          setCompanySettings(res.data);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, deptFilter, sectionFilter, rankFilter]);

  // State maps
  const [attendanceInputs, setAttendanceInputs] = useState({}); // { empId: 'SAKIT' }
  const [fingerInputs, setFingerInputs] = useState({}); // { empId: { checkIn: '', checkOut: '', photo: '' } }

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-correction'],
    queryFn: () => employeeAPI.getAll({ limit: 1000, status: 'ACTIVE', excludeBhl: true }),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance-for-correction', selectedDate],
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000 }),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['correction-history', historyMonth],
    queryFn: () => attendanceAPI.getCorrectionHistory(historyMonth),
    enabled: activeTab === 'RIWAYAT'
  });

  // Helpers
  const formatTime = (timeStr) => {
    if (!timeStr || timeStr === '-' || timeStr === '--:--') return '--:--';
    if (!timeStr.includes('T')) return timeStr;
    return new Date(timeStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusBadge = (status) => {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
          {t('manualCorrection.badge.notChecked')}
        </span>
      );
    }
    
    const config = {
      'PRESENT': { label: t('manualCorrection.badge.present'), color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      'LATE': { label: t('manualCorrection.badge.late'), color: 'bg-amber-50 text-amber-700 border-amber-200' },
      'ABSENT': { label: t('manualCorrection.badge.absent'), color: 'bg-rose-50 text-rose-700 border-rose-200' },
      'MANGKIR': { label: t('manualCorrection.badge.mangkir'), color: 'bg-orange-50 text-orange-700 border-orange-200' },
      'SAKIT': { label: t('manualCorrection.badge.sakit'), color: 'bg-blue-50 text-blue-700 border-blue-200' },
      'IZIN': { label: t('manualCorrection.badge.izin'), color: 'bg-sky-50 text-sky-700 border-sky-200' },
      'CUTI': { label: t('manualCorrection.badge.cuti'), color: 'bg-purple-50 text-purple-700 border-purple-200' },
      'HOLIDAY': { label: t('manualCorrection.badge.libur'), color: 'bg-slate-150 text-slate-700 border-slate-255' },
    };

    const cfg = config[status] || { label: status, color: 'bg-slate-50 text-slate-600 border-slate-200' };

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black border uppercase tracking-wider ${cfg.color}`}>
        {cfg.label}
      </span>
    );
  };

  const renderCorrectionDetails = (log) => {
    try {
      const data = JSON.parse(log.details);
      if (log.action === 'MANUAL_CORRECTION_STATUS') {
        const prevStatus = data.previousStatus;
        return (
          <div className="text-[11px] font-medium text-slate-600 space-y-1.5">
            <div>{t('manualCorrection.details.date')} <span className="font-bold text-slate-800">{data.date}</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status:</span>
              {prevStatus ? renderStatusBadge(prevStatus) : <span className="text-slate-400 italic text-[10px]">{t('manualCorrection.badge.old')}</span>}
              <span className="text-slate-400 font-bold">&rarr;</span>
              {renderStatusBadge(data.status)}
            </div>
          </div>
        );
      } else if (log.action === 'MANUAL_CORRECTION_TIME') {
        const hasPrev = 'previousCheckIn' in data;
        return (
          <div className="text-[11px] text-slate-600 font-medium space-y-1.5">
            <div>{t('manualCorrection.details.date')} <span className="font-bold text-slate-800">{data.date}</span></div>
            {!hasPrev ? (
              <div className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-100 rounded-lg p-1.5 w-fit flex gap-3">
                <span>CHECK IN: <span className="text-slate-800 font-extrabold">{data.checkIn || '--:--'}</span></span>
                <span className="text-slate-300">|</span>
                <span>CHECK OUT: <span className="text-slate-800 font-extrabold">{data.checkOut || '--:--'}</span></span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
                <div className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-200/60 rounded-lg p-2 flex flex-col">
                  <span className="text-[8px] text-slate-400 tracking-wider">{t('manualCorrection.details.previous')}</span>
                  <div className="flex gap-3 mt-0.5">
                    <span>IN: <span className="text-slate-700 font-black">{data.previousCheckIn || '--:--'}</span></span>
                    <span className="text-slate-300">|</span>
                    <span>OUT: <span className="text-slate-700 font-black">{data.previousCheckOut || '--:--'}</span></span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-700 font-bold bg-rose-50/40 border border-rose-100/50 rounded-lg p-2 flex flex-col">
                  <span className="text-[8px] text-rose-500 tracking-wider">{t('manualCorrection.details.after')}</span>
                  <div className="flex gap-3 mt-0.5">
                    <span>IN: <span className="text-rose-600 font-black">{data.checkIn || '--:--'}</span></span>
                    <span className="text-slate-300">|</span>
                    <span>OUT: <span className="text-rose-600 font-black">{data.checkOut || '--:--'}</span></span>
                  </div>
                </div>
              </div>
            )}
            {data.photoUrl && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase">{t('manualCorrection.details.evidence')}</span>
                <button 
                  onClick={() => setPreviewPhoto(data.photoUrl)}
                  className="flex items-center gap-1.5 text-[9px] text-rose-600 hover:text-rose-700 font-bold uppercase bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg px-2.5 py-1 transition-all shadow-sm hover:scale-105 active:scale-95"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{t('manualCorrection.details.viewPhoto')}</span>
                </button>
              </div>
            )}
          </div>
        );
      } else if (log.action === 'CORRECTION') {
        return (
          <div className="text-[11px] text-slate-600 font-medium space-y-1">
            <div>{t('manualCorrection.details.editSubmission')} <span className="font-bold text-slate-500">{data.oldStatus}</span> &rarr; <span className="font-bold text-rose-600">{data.newStatus}</span></div>
            {data.notes && <div className="text-[10px] text-slate-400 italic font-semibold">&ldquo;{data.notes}&rdquo;</div>}
          </div>
        );
      }
      return <span className="text-[11px] text-slate-600 font-medium">{log.details}</span>;
    } catch (e) {
      return <span className="text-[11px] text-slate-600 font-medium">{log.details}</span>;
    }
  };

  const getEmployeeFromLog = (log) => {
    try {
      const data = JSON.parse(log.details);
      const name = data.emp || data.employee || '-';
      const code = data.employeeCode || '';
      return { name, code };
    } catch (e) {
      return { name: '-', code: '' };
    }
  };

  const employees = employeesData?.data || [];

  const employeesMap = useMemo(() => {
    const map = {};
    employees.forEach(e => {
      map[e.employeeCode] = e;
    });
    return map;
  }, [employees]);

  const allDepts = useMemo(() => {
    return [...new Set(employees.map(e => e.department?.name || e.dept).filter(Boolean))];
  }, [employees]);

  const filteredHistoryLogs = useMemo(() => {
    const logs = historyData?.data || [];
    return logs.filter(log => {
      if (historyTypeFilter && log.action !== historyTypeFilter) return false;

      const empDetails = getEmployeeFromLog(log);
      const employeeObj = employeesMap[empDetails.code];
      const deptName = employeeObj?.department?.name || employeeObj?.dept || 'UMUM';

      if (historyDeptFilter && deptName !== historyDeptFilter) return false;

      if (historySearch) {
        const lower = historySearch.toLowerCase();
        const operatorMatch = log.username?.toLowerCase().includes(lower);
        const nameMatch = empDetails.name.toLowerCase().includes(lower);
        const codeMatch = empDetails.code.toLowerCase().includes(lower);
        const actionMatch = log.action?.toLowerCase().includes(lower);
        return operatorMatch || nameMatch || codeMatch || actionMatch;
      }
      return true;
    });
  }, [historyData, historySearch, historyTypeFilter, historyDeptFilter, employeesMap]);

  const historyStats = useMemo(() => {
    const logs = filteredHistoryLogs || [];
    let total = logs.length;
    let statusCorrections = 0;
    let timeCorrections = 0;
    let selfCorrections = 0;
    let photoCount = 0;

    logs.forEach(log => {
      if (log.action === 'MANUAL_CORRECTION_STATUS') statusCorrections++;
      else if (log.action === 'MANUAL_CORRECTION_TIME') timeCorrections++;
      else if (log.action === 'CORRECTION') selfCorrections++;

      try {
        const data = JSON.parse(log.details);
        if (data.photoUrl) photoCount++;
      } catch (e) {}
    });

    return { total, statusCorrections, timeCorrections, selfCorrections, photoCount };
  }, [filteredHistoryLogs]);

  const handleExportExcel = () => {
    try {
      if (filteredHistoryLogs.length === 0) {
        return alert(t('manualCorrection.alert.noHistoryExport'));
      }
      
      const lang = i18n.language || 'id';
      const isIndo = lang.startsWith('id');
      const isKo = lang.startsWith('ko');
      const isZh = lang.startsWith('zh');

      const headers = {
        no: isIndo ? 'No' : isKo ? '번호' : isZh ? '序号' : 'No',
        actionTime: isIndo ? 'Waktu Tindakan' : isKo ? '처리 시간' : isZh ? '操作时间' : 'Action Time',
        operator: 'Operator',
        role: isIndo ? 'Role Operator' : isKo ? '역할' : isZh ? '操作员角色' : 'Operator Role',
        nik: `NIK ${t('manualCorrection.table.employee')}`,
        name: `Nama ${t('manualCorrection.table.employee')}`,
        dept: t('manualCorrection.table.dept'),
        position: isIndo ? 'Jabatan' : isKo ? '직급' : isZh ? '职位' : 'Position',
        type: t('manualCorrection.table.type'),
        details: isIndo ? 'Detail Perubahan' : isKo ? '상세 변경 내용' : isZh ? '变更细节' : 'Change Details',
        ip: 'IP Address'
      };

      const exportData = filteredHistoryLogs.map((log, index) => {
        const empDetails = getEmployeeFromLog(log);
        const employeeObj = employeesMap[empDetails.code];
        const dept = employeeObj?.department?.name || employeeObj?.dept || 'UMUM';
        const position = employeeObj?.position || '-';

        let typeStr = 'UPDATE';
        if (log.action === 'MANUAL_CORRECTION_STATUS') typeStr = t('manualCorrection.alert.khdStatus');
        else if (log.action === 'MANUAL_CORRECTION_TIME') typeStr = t('manualCorrection.alert.lfTime');
        else if (log.action === 'CORRECTION') typeStr = t('manualCorrection.alert.empCorrection');

        let detailStr = '';
        try {
          const data = JSON.parse(log.details);
          if (log.action === 'MANUAL_CORRECTION_STATUS') {
            const st = data.status || 'ALPA';
            const prevSt = data.previousStatus || '-';
            detailStr = isIndo 
              ? `Override Status ke ${st} pada tgl ${data.date} (Sebelumnya: ${prevSt})` 
              : isKo 
              ? `${data.date}에 상태를 ${st}로 재설정 (이전 상태: ${prevSt})` 
              : isZh 
              ? `在 ${data.date} 将状态修改为 ${st} (原状态: ${prevSt})` 
              : `Override status to ${st} on ${data.date} (Previous: ${prevSt})`;
          } else if (log.action === 'MANUAL_CORRECTION_TIME') {
            detailStr = isIndo 
              ? `Revisi Waktu tgl ${data.date} -> IN: ${data.checkIn || '--:--'}, OUT: ${data.checkOut || '--:--'} (Sebelumnya -> IN: ${data.previousCheckIn || '--:--'}, OUT: ${data.previousCheckOut || '--:--'})` 
              : isKo 
              ? `${data.date} 시간 수정 -> 출근: ${data.checkIn || '--:--'}, 퇴근: ${data.checkOut || '--:--'} (이전 -> 출근: ${data.previousCheckIn || '--:--'}, 퇴근: ${data.previousCheckOut || '--:--'})` 
              : isZh 
              ? `修改 ${data.date} 时间 -> 签到: ${data.checkIn || '--:--'}, 签退: ${data.checkOut || '--:--'} (原时间 -> 签到: ${data.previousCheckIn || '--:--'}, 签退: ${data.previousCheckOut || '--:--'})` 
              : `Revise time on ${data.date} -> IN: ${data.checkIn || '--:--'}, OUT: ${data.checkOut || '--:--'} (Previous -> IN: ${data.previousCheckIn || '--:--'}, OUT: ${data.previousCheckOut || '--:--'})`;
          } else if (log.action === 'CORRECTION') {
            const oldS = data.oldStatus || '-';
            const newS = data.newStatus || '-';
            const notesStr = data.notes ? ` (${data.notes})` : '';
            detailStr = isIndo 
              ? `Edit Pengajuan: ${oldS} -> ${newS}${notesStr}` 
              : isKo 
              ? `신청 수정: ${oldS} -> ${newS}${notesStr}` 
              : isZh 
              ? `编辑申请: ${oldS} -> ${newS}${notesStr}` 
              : `Edit application: ${oldS} -> ${newS}${notesStr}`;
          }
        } catch (e) {
          detailStr = log.details;
        }

        const localeStr = isIndo ? 'id-ID' : isKo ? 'ko-KR' : isZh ? 'zh-CN' : 'en-US';

        return {
          [headers.no]: index + 1,
          [headers.actionTime]: new Date(log.createdAt).toLocaleString(localeStr),
          [headers.operator]: log.username || 'System',
          [headers.role]: log.role || 'HRD',
          [headers.nik]: empDetails.code,
          [headers.name]: empDetails.name,
          [headers.dept]: dept,
          [headers.position]: position,
          [headers.type]: typeStr,
          [headers.details]: detailStr,
          [headers.ip]: log.ipAddress || '-'
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('manualCorrection.tabs.history'));
      
      // Auto-fit columns
      const maxLens = {};
      exportData.forEach(row => {
        Object.keys(row).forEach(key => {
          const val = String(row[key] || '');
          maxLens[key] = Math.max(maxLens[key] || 10, val.length);
        });
      });
      ws['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] + 3 }));

      const filePrefix = isIndo ? 'Laporan_Koreksi_HRD' : isKo ? 'HRD_수정_보고서' : isZh ? 'HRD_更正报告' : 'HRD_Correction_Report';
      XLSX.writeFile(wb, `${filePrefix}_${historyMonth}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert(`${t('manualCorrection.alert.exportError')}${err.message}`);
    }
  };

  const handlePrintReport = () => {
    if (filteredHistoryLogs.length === 0) {
      return alert(t('manualCorrection.alert.noHistoryPrint'));
    }
    window.print();
  };

  const filteredEmployees = employees.filter(e => {
    if (deptFilter && e.dept !== deptFilter) return false;
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

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

  // Photo compression via canvas
  const handlePhotoUpload = (empId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // compress to high efficiency jpeg
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
        setFingerInputs(prev => ({
          ...prev,
          [empId]: {
            ...prev[empId],
            photo: dataUrl
          }
        }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.manualCorrection(payload),
    onSuccess: (res) => {
      alert(res.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-for-correction'] });
      // Clear inputs
      setAttendanceInputs({});
      setFingerInputs({});
    },
    onError: (err) => {
      alert(`${t('manualCorrection.alert.saveError')}${err.message}`);
    }
  });

  const handleSaveAll = () => {
    if (activeTab === 'KEHADIRAN') {
      const records = Object.keys(attendanceInputs)
        .filter(empId => attendanceInputs[empId] !== '' && attendanceInputs[empId] !== undefined)
        .map(empId => ({
          employeeId: parseInt(empId),
          status: attendanceInputs[empId]
        }));
      
      if (records.length === 0) return alert(t('manualCorrection.alert.noChanges'));
      if (window.confirm(t('manualCorrection.alert.confirmStatus', { count: records.length }))) {
        saveMutation.mutate({ type: 'KEHADIRAN', date: selectedDate, records });
      }
    } else {
      const records = Object.keys(fingerInputs)
        .filter(empId => fingerInputs[empId]?.checkIn || fingerInputs[empId]?.checkOut)
        .map(empId => ({
          employeeId: parseInt(empId),
          checkIn: fingerInputs[empId].checkIn || null,
          checkOut: fingerInputs[empId].checkOut || null,
          photo: fingerInputs[empId].photo || null
        }));
      
      if (records.length === 0) return alert(t('manualCorrection.alert.noFingerChanges'));
      if (window.confirm(t('manualCorrection.alert.confirmFinger', { count: records.length }))) {
        saveMutation.mutate({ type: 'LUPA_FINGER', date: selectedDate, records });
      }
    }
  };

  const isLoading = empLoading || attLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="px-1 space-y-3">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <Edit3 className="w-3 h-3 text-rose-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">{t('manualCorrection.categoryAdmin')}</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">{t('manualCorrection.categoryTitle')}</span>
        </div>
        
        <div className="flex flex-col xl:flex-row xl:items-center justify-between w-full gap-4">
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              {t('manualCorrection.title')}
            </h1>
            <p className="text-xs text-slate-500 mt-1">{t('manualCorrection.titleDesc')}</p>
          </div>
          
          <button 
            onClick={() => navigate('/admin/attendance', { state: { date: selectedDate } })}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group self-start xl:self-auto cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-0.5 transition-transform" />
            {t('manualCorrection.btnBackToLogs')}
          </button>
        </div>
      </div>

      {/* Advanced Filter Bar (Only shown for Kehadiran / Lupa Finger override) */}
      {activeTab !== 'RIWAYAT' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex items-center gap-3 min-w-max">
              <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-rose-600" />
              </div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('manualCorrection.filters.date')}</label>
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
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('manualCorrection.filters.search')}</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder={t('manualCorrection.filters.searchPlaceholder')} 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
                />
              </div>
            </div>

            {[
              { 
                label: t('manualCorrection.filters.dept'), 
                val: deptFilter, 
                setter: (val) => { setDeptFilter(val); setSectionFilter(''); setRankFilter(''); }, 
                opts: [...new Set((employees || []).map(e => e.dept).filter(Boolean))] 
              },
              { 
                label: t('manualCorrection.filters.section'), 
                val: sectionFilter, 
                setter: (val) => { setSectionFilter(val); setRankFilter(''); }, 
                opts: [...new Set((employees || [])
                  .filter(e => !deptFilter || e.dept === deptFilter)
                  .map(e => e.section).filter(Boolean))] 
              },
              { 
                label: t('manualCorrection.filters.rank'), 
                val: rankFilter, 
                setter: setRankFilter, 
                opts: [...new Set((employees || [])
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
                    className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm truncate transition-all"
                  >
                    <option value="">{t('manualCorrection.filters.all')}</option>
                    {field.opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Report Header & Filters */}
      {activeTab === 'RIWAYAT' && (
        <div className="space-y-6">
          {/* Summary Dashboard Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            {[
              { label: t('manualCorrection.stats.total'), value: historyStats.total, color: 'text-slate-800 border-slate-200 bg-white' },
              { label: t('manualCorrection.stats.status'), value: historyStats.statusCorrections, color: 'text-rose-600 border-rose-100 bg-rose-50/20' },
              { label: t('manualCorrection.stats.finger'), value: historyStats.timeCorrections, color: 'text-amber-600 border-amber-100 bg-amber-50/20' },
              { label: t('manualCorrection.stats.evidence'), value: historyStats.photoCount, color: 'text-blue-600 border-blue-100 bg-blue-50/20' }
            ].map((card, idx) => (
              <div key={idx} className={`p-5 rounded-2xl border shadow-sm ${card.color} flex flex-col justify-between h-28`}>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{card.label}</span>
                <span className="text-3xl font-black tracking-tight">{card.value}</span>
              </div>
            ))}
          </div>

          {/* Action Buttons & Advanced Filters */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t('manualCorrection.historyFilters.month')}</label>
                  <input 
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="font-bold text-slate-800 outline-none text-sm uppercase tracking-wider cursor-pointer mt-0.5 bg-transparent"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 hover:shadow-lg hover:shadow-emerald-500/10"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{t('manualCorrection.historyFilters.excel')}</span>
                </button>
                <button
                  onClick={handlePrintReport}
                  className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 hover:shadow-lg hover:shadow-rose-500/10"
                >
                  <Printer className="w-4 h-4" />
                  <span>{t('manualCorrection.historyFilters.print')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-450 uppercase tracking-wider ml-1">{t('manualCorrection.historyFilters.search')}</label>
                <div className="relative group">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
                  <input 
                    type="text" 
                    placeholder={t('manualCorrection.historyFilters.searchPlaceholder')} 
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-450 uppercase tracking-wider ml-1">{t('manualCorrection.historyFilters.type')}</label>
                <div className="relative">
                  <select 
                    value={historyTypeFilter}
                    onChange={(e) => setHistoryTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm transition-all"
                  >
                    <option value="">{t('manualCorrection.historyFilters.allTypes')}</option>
                    <option value="MANUAL_CORRECTION_STATUS">{t('manualCorrection.historyFilters.typeStatus')}</option>
                    <option value="MANUAL_CORRECTION_TIME">{t('manualCorrection.historyFilters.typeTime')}</option>
                    <option value="CORRECTION">{t('manualCorrection.historyFilters.typeEmployee')}</option>
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-450 uppercase tracking-wider ml-1">{t('manualCorrection.historyFilters.dept')}</label>
                <div className="relative">
                  <select 
                    value={historyDeptFilter}
                    onChange={(e) => setHistoryDeptFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm transition-all"
                  >
                    <option value="">{t('manualCorrection.historyFilters.allDepts')}</option>
                    {allDepts.map((d, i) => <option key={i} value={d}>{d}</option>)}
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab controls */}
      <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl w-max border border-slate-200">
        <button 
          onClick={() => setActiveTab('KEHADIRAN')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === 'KEHADIRAN' ? 'bg-white text-rose-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <CheckSquare className="w-4 h-4" />
          {t('manualCorrection.tabs.attendance')}
        </button>
        <button 
           onClick={() => setActiveTab('LUPA_FINGER')}
           className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === 'LUPA_FINGER' ? 'bg-white text-rose-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <Clock className="w-4 h-4" />
          {t('manualCorrection.tabs.finger')}
        </button>
        <button 
           onClick={() => setActiveTab('RIWAYAT')}
           className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === 'RIWAYAT' ? 'bg-white text-rose-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <History className="w-4 h-4" />
          {t('manualCorrection.tabs.history')}
        </button>
      </div>

      {/* Spreadsheet / Grid (For Kehadiran and Lupa Finger tab) */}
      {activeTab !== 'RIWAYAT' && (
        <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {t('manualCorrection.table.title')} <span className="text-slate-300 mx-2">|</span> 
                {t('manualCorrection.table.showing')} {filteredEmployees.length > 0 ? `${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, filteredEmployees.length)} ${t('manualCorrection.table.of')} ` : ''}{filteredEmployees.length} {t('manualCorrection.table.employees')}
              </p>
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage <= 1} 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-205 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-bold text-slate-600">
                  {t('manualCorrection.table.page')} {currentPage} / {totalPages}
                </span>
                <button 
                  disabled={currentPage >= totalPages} 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-205 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto min-h-[400px]">
             <table className="w-full text-left whitespace-nowrap">
               <thead className="bg-slate-50 border-b border-slate-100">
                 <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                   <th className="px-6 py-4 w-12 text-center">{t('manualCorrection.table.no')}</th>
                   <th className="px-6 py-4">{t('manualCorrection.table.employee')}</th>
                   <th className="px-4 py-4">{t('manualCorrection.table.dept')}</th>
                   
                   {activeTab === 'KEHADIRAN' ? (
                     <>
                       <th className="px-4 py-4 text-center">{t('manualCorrection.table.currentStatus')}</th>
                       <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">{t('manualCorrection.table.overrideStatus')}</th>
                     </>
                   ) : (
                     <>
                       <th className="px-4 py-4 text-center border-r border-slate-100">{t('manualCorrection.table.currentIn')}</th>
                       <th className="px-4 py-4 text-center border-r border-slate-100">{t('manualCorrection.table.currentOut')}</th>
                       <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">{t('manualCorrection.table.in')}</th>
                       <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">{t('manualCorrection.table.out')}</th>
                       <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">{t('manualCorrection.table.evidence')}</th>
                     </>
                   )}
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={activeTab === 'KEHADIRAN' ? 5 : 8} className="text-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-rose-600 mx-auto mb-3" />
                        <p className="text-xs font-bold text-slate-400">{t('manualCorrection.table.loading')}</p>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'KEHADIRAN' ? 5 : 8} className="text-center py-20 text-slate-400 text-xs">
                        {t('manualCorrection.table.noEmployees')}
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const attendanceList = attendanceData?.data || [];
                      const attendanceMap = attendanceList.reduce((acc, curr) => {
                        acc[curr.employeeId] = curr;
                        return acc;
                      }, {});

                      return paginatedEmployees.map((emp, index) => {
                        const currentAtt = attendanceMap[emp.dbId];
                        return (
                          <tr key={emp.dbId} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4 text-center text-xs text-slate-400 font-medium">{startIndex + index + 1}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-800 uppercase">{emp.name}</span>
                                <span className="text-[10px] text-slate-500">{emp.employeeCode}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-xs font-medium text-slate-600">
                              {emp.department?.name || 'UMUM'}
                            </td>

                            {activeTab === 'KEHADIRAN' ? (
                              <>
                                <td className="px-4 py-4 text-center">
                                  {renderStatusBadge(currentAtt?.status)}
                                </td>
                                <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors">
                                  <select
                                    value={attendanceInputs[emp.dbId] || ''}
                                    onChange={(e) => setAttendanceInputs(prev => ({ ...prev, [emp.dbId]: e.target.value }))}
                                    className="bg-white border border-slate-300 text-slate-700 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase transition-all"
                                  >
                                    <option value="">{t('manualCorrection.table.noChange')}</option>
                                    <option value="PRESENT">{t('manualCorrection.table.presentNormal')}</option>
                                    <option value="IZIN">{t('manualCorrection.table.izin')}</option>
                                    <option value="SAKIT">{t('manualCorrection.table.sakit')}</option>
                                    <option value="CUTI">{t('manualCorrection.table.cuti')}</option>
                                    <option value="HOLIDAY">{t('manualCorrection.table.holiday')}</option>
                                    <option value="ABSENT">{t('manualCorrection.table.absent')}</option>
                                  </select>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-4 text-center text-xs font-bold text-slate-700 bg-slate-50/30 border-r border-slate-100">
                                  {currentAtt?.checkIn ? formatTime(currentAtt.checkIn) : '--:--'}
                                </td>
                                <td className="px-4 py-4 text-center text-xs font-bold text-slate-700 bg-slate-50/30 border-r border-slate-100">
                                  {currentAtt?.checkOut ? formatTime(currentAtt.checkOut) : '--:--'}
                                </td>
                                <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors border-r border-white">
                                  <input
                                    type="time"
                                    value={fingerInputs[emp.dbId]?.checkIn || ''}
                                    onChange={(e) => setFingerInputs(prev => ({ ...prev, [emp.dbId]: { ...prev[emp.dbId], checkIn: e.target.value } }))}
                                    className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                                  />
                                </td>
                                <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors border-r border-white">
                                  <input
                                    type="time"
                                    value={fingerInputs[emp.dbId]?.checkOut || ''}
                                    onChange={(e) => setFingerInputs(prev => ({ ...prev, [emp.dbId]: { ...prev[emp.dbId], checkOut: e.target.value } }))}
                                    className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                                  />
                                </td>
                                <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors">
                                   <div className="flex items-center justify-center gap-3">
                                     {fingerInputs[emp.dbId]?.photo ? (
                                        <div className="relative group/img">
                                           <img src={fingerInputs[emp.dbId].photo} alt="Bukti" className="h-10 w-10 object-cover rounded-lg border-2 border-rose-200" />
                                           <button 
                                             onClick={() => setFingerInputs(prev => { const n = {...prev}; n[emp.dbId].photo = null; return n; })}
                                             className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
                                           >
                                             <X className="w-3 h-3" />
                                           </button>
                                        </div>
                                     ) : (
                                        <label className="bg-white border-rose-300 text-rose-450 cursor-pointer hover:bg-rose-50 flex flex-col items-center justify-center w-10 h-10 border-2 border-dashed rounded-lg transition-colors">
                                          <ImageIcon className="w-4 h-4 text-rose-400" />
                                          <input 
                                            type="file" 
                                            accept="image/*" 
                                            className="hidden" 
                                            onChange={(e) => handlePhotoUpload(emp.dbId, e)}
                                          />
                                        </label>
                                     )}
                                   </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      });
                    })()
                  )}
               </tbody>
             </table>
          </div>
        </div>
      )}

      {/* History Log View */}
      {activeTab === 'RIWAYAT' && (
        <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative animate-in fade-in duration-500 print:hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {t('manualCorrection.historyTable.title')} <span className="text-slate-300 mx-2">|</span> 
                {t('manualCorrection.historyTable.subtitle', { count: filteredHistoryLogs.length })}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
             <table className="w-full text-left whitespace-nowrap">
               <thead className="bg-slate-50 border-b border-slate-100">
                 <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                   <th className="px-6 py-4 w-12 text-center">No</th>
                   <th className="px-6 py-4">{t('manualCorrection.table.actionTime')}</th>
                   <th className="px-6 py-4">{t('manualCorrection.table.operator')}</th>
                   <th className="px-6 py-4">{t('manualCorrection.table.relatedEmployee')}</th>
                   <th className="px-4 py-4">{t('manualCorrection.table.dept')}</th>
                   <th className="px-6 py-4 text-center">{t('manualCorrection.table.type')}</th>
                   <th className="px-6 py-4">{t('manualCorrection.table.changesDetail')}</th>
                   <th className="px-6 py-4 text-center">{t('manualCorrection.table.ip')}</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-rose-600 mx-auto mb-3" />
                        <p className="text-xs font-bold text-slate-400">{t('manualCorrection.table.loadingHistory')}</p>
                      </td>
                    </tr>
                  ) : filteredHistoryLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-20 text-slate-400 text-xs font-bold">
                        {t('manualCorrection.table.noHistory')}
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryLogs.map((log, index) => {
                      const emp = getEmployeeFromLog(log);
                      const employeeObj = employeesMap[emp.code];
                      const dept = employeeObj?.department?.name || employeeObj?.dept || 'UMUM';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-center text-xs text-slate-400 font-medium">{index + 1}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-700">
                            {new Date(log.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            <span className="text-[10px] text-slate-400 font-medium ml-1.5">
                              {new Date(log.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800 uppercase">{log.username || 'System'}</span>
                              <span className="text-[9px] text-rose-600 uppercase font-black tracking-wider">{log.role || 'HRD'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800 uppercase">{emp.name}</span>
                              <span className="text-[10px] text-slate-500 font-semibold">{emp.code}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs font-medium text-slate-600">
                            {dept}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider border uppercase ${
                              log.action === 'MANUAL_CORRECTION_STATUS' 
                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                : log.action === 'MANUAL_CORRECTION_TIME'
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {log.action === 'MANUAL_CORRECTION_STATUS' ? t('manualCorrection.tabs.attendance') : log.action === 'MANUAL_CORRECTION_TIME' ? t('manualCorrection.tabs.finger') : 'UPDATE'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {renderCorrectionDetails(log)}
                          </td>
                          <td className="px-6 py-4 text-center text-xs font-mono text-slate-500">
                            {log.ipAddress || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
               </tbody>
             </table>
          </div>
        </div>
      )}

      {/* Floating Save Bar (Hidden for History tab) */}
      {activeTab !== 'RIWAYAT' && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-4 px-6 flex items-center justify-between z-40 floating-save-bar animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
               <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">{t('manualCorrection.floating.savedChanges')}</p>
              <p className="text-sm font-bold text-slate-800">
                {activeTab === 'KEHADIRAN' 
                   ? Object.keys(attendanceInputs).filter(k => attendanceInputs[k]).length 
                   : Object.keys(fingerInputs).filter(k => fingerInputs[k]?.checkIn || fingerInputs[k]?.checkOut).length
                } {t('manualCorrection.floating.ready')}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSaveAll}
            disabled={saveMutation.isPending}
            className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg hover:shadow-xl hover:shadow-rose-500/20 active:scale-95 transition-all outline-none"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{t('manualCorrection.floating.execute')} ({activeTab === 'KEHADIRAN' ? t('manualCorrection.tabs.attendance') : t('manualCorrection.tabs.finger')})</span>
          </button>
        </div>
      )}

      {/* Hidden Print Container for Correction Log Report */}
      {activeTab === 'RIWAYAT' && filteredHistoryLogs.length > 0 && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black overflow-visible font-sans">
          {/* Branded Header */}
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center gap-3">
              {companySettings?.appLogo ? (
                <img src={companySettings.appLogo} alt="Logo" className="w-12 h-12 object-contain" />
              ) : (
                <div className="w-12 h-12 bg-slate-100 border border-slate-205 rounded-lg flex items-center justify-center text-slate-400 font-bold text-[10px]">LOGO</div>
              )}
              <div className="text-left">
                <h1 className="font-extrabold text-base leading-tight uppercase tracking-tight">{companySettings?.companyName || t('manualCorrection.print.companyNameFallback')}</h1>
                <p className="text-[10px] text-slate-500 font-semibold">{companySettings?.companyAddress || t('manualCorrection.print.companyAddressFallback')}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="font-black text-lg text-slate-900 uppercase tracking-tight">{t('manualCorrection.print.title')}</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {t('manualCorrection.print.periode')} {new Date(historyMonth + '-02').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Report Metadata */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 mb-6 uppercase tracking-wider">
            <div>
              <p className="text-slate-400 font-medium">{t('manualCorrection.print.printDate')}</p>
              <p className="text-slate-800 font-bold text-xs mt-0.5">{new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">{t('manualCorrection.print.totalLogCorrection')}</p>
              <p className="text-slate-800 font-bold text-xs mt-0.5">{historyStats.total} {t('manualCorrection.print.records')}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">{t('manualCorrection.print.classification')}</p>
              <p className="text-slate-800 font-bold text-xs mt-0.5">
                KHD: {historyStats.statusCorrections} | LF: {historyStats.timeCorrections}
              </p>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-[10px] text-left border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-black uppercase text-slate-700 tracking-wider">
                <th className="py-2.5 px-3 border border-slate-300 w-8 text-center">{t('manualCorrection.print.no')}</th>
                <th className="py-2.5 px-3 border border-slate-300 w-24">{t('manualCorrection.print.dateTime')}</th>
                <th className="py-2.5 px-3 border border-slate-300 w-24">{t('manualCorrection.print.operator')}</th>
                <th className="py-2.5 px-3 border border-slate-300 w-32">{t('manualCorrection.print.employee')}</th>
                <th className="py-2.5 px-3 border border-slate-300 w-24 text-center">{t('manualCorrection.print.type')}</th>
                <th className="py-2.5 px-3 border border-slate-300">{t('manualCorrection.print.details')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistoryLogs.map((log, idx) => {
                const emp = getEmployeeFromLog(log);
                const employeeObj = employeesMap[emp.code];
                const dept = employeeObj?.department?.name || employeeObj?.dept || 'UMUM';
                
                let typeLabel = 'UPDATE';
                if (log.action === 'MANUAL_CORRECTION_STATUS') typeLabel = t('manualCorrection.print.typeAttendance');
                else if (log.action === 'MANUAL_CORRECTION_TIME') typeLabel = t('manualCorrection.print.typeFinger');
                else if (log.action === 'CORRECTION') typeLabel = t('manualCorrection.print.typeRequest');

                let detailsText = '';
                try {
                  const data = JSON.parse(log.details);
                  if (log.action === 'MANUAL_CORRECTION_STATUS') {
                    detailsText = `Status: ${data.previousStatus || 'BELUM ABSEN'} -> ${data.status} (Tgl: ${data.date})`;
                  } else if (log.action === 'MANUAL_CORRECTION_TIME') {
                    detailsText = `Clock: [IN: ${data.previousCheckIn || '--:--'} / OUT: ${data.previousCheckOut || '--:--'}] -> [IN: ${data.checkIn || '--:--'} / OUT: ${data.checkOut || '--:--'}] (Tgl: ${data.date})`;
                  } else if (log.action === 'CORRECTION') {
                    detailsText = `Pengajuan: ${data.oldStatus} -> ${data.newStatus} (${data.notes || ''})`;
                  }
                } catch (e) {
                  detailsText = log.details;
                }

                return (
                  <tr key={log.id} className="border-b border-slate-300">
                    <td className="py-2 px-3 border border-slate-300 text-center font-medium">{idx + 1}</td>
                    <td className="py-2 px-3 border border-slate-300 font-bold">
                      {new Date(log.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span className="block text-[8px] text-slate-500 font-medium">
                        {new Date(log.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-2 px-3 border border-slate-300">
                      <span className="font-bold uppercase block">{log.username || 'System'}</span>
                      <span className="text-[8px] font-black text-rose-600 tracking-wider block">{log.role || 'HRD'}</span>
                    </td>
                    <td className="py-2 px-3 border border-slate-300">
                      <span className="font-bold uppercase block">{emp.name}</span>
                      <span className="text-[8px] font-semibold text-slate-500 block">{emp.code} | {dept}</span>
                    </td>
                    <td className="py-2 px-3 border border-slate-300 text-center">
                      <span className="font-bold text-[9px] uppercase tracking-wider block">{typeLabel}</span>
                    </td>
                    <td className="py-2 px-3 border border-slate-300 leading-normal text-[9px] font-medium text-slate-700">
                      {detailsText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer Signature */}
          <div className="mt-16 grid grid-cols-2 gap-20 text-[10px] uppercase font-bold text-center">
            <div className="space-y-16">
              <p>{t('manualCorrection.print.creator')}</p>
              <div className="border-b border-slate-900 w-48 mx-auto" />
              <p className="text-slate-500">{t('manualCorrection.print.staff')}</p>
            </div>
            <div className="space-y-16">
              <p>{t('manualCorrection.print.approved')}</p>
              <div className="border-b border-slate-900 w-48 mx-auto" />
              <p className="text-slate-500">{t('manualCorrection.print.manager')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Foto Bukti Lupa Finger */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 max-w-lg w-full relative animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">{t('manualCorrection.print.evidenceTitle')}</span>
              <button 
                onClick={() => setPreviewPhoto(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-500 hover:text-white flex items-center justify-center text-slate-500 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 bg-slate-950 flex items-center justify-center min-h-[300px] max-h-[500px]">
              <img src={previewPhoto} alt="Bukti" className="max-w-full max-h-[400px] object-contain rounded-lg shadow-md" />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setPreviewPhoto(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                {t('manualCorrection.print.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualCorrectionHRD;
