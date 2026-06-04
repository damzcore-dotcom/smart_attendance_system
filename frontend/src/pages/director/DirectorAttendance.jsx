import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Search, Download, Loader2, ChevronLeft, ChevronRight,
  Calendar, Filter, CheckCircle2, XCircle, Clock, AlertCircle,
  ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, ArrowRight,
  Camera, Smartphone, Key, Fingerprint, Edit2, TrendingUp, ShieldCheck
} from 'lucide-react';
import { direkturAPI } from '../../services/api';
import * as XLSX from 'xlsx';

const STATUS_MAP = {
  'PRESENT': 'Present',
  'LATE': 'Late',
  'MANGKIR': 'Unexcused',
  'HOLIDAY': 'Holiday',
  'CUTI': 'Leave',
  'SAKIT': 'Medical',
  'IZIN': 'Permit',
  'ABSENT': 'Absent',
  'EARLY_DEPARTURE': 'Early Departure'
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

const isAnomaly = (row) => {
  const hasIn = row.checkIn && row.checkIn !== '-- : --' && row.checkIn !== '--:--' && row.checkIn !== '-';
  const hasOut = row.checkOut && row.checkOut !== '-- : --' && row.checkOut !== '--:--' && row.checkOut !== '-';
  
  if ((row.status === 'MANGKIR' || row.status === 'ABSENT' || row.status === 'Alpa' || row.status === 'Mangkir') && hasOut) {
    return true;
  }
  if (hasIn && !hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday', 'Cuti', 'Sakit', 'Izin'].includes(row.status)) {
    return true;
  }
  if (!hasIn && hasOut && !['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY', 'Libur', 'Holiday', 'Cuti', 'Sakit', 'Izin'].includes(row.status)) {
    return true;
  }
  return false;
};

const STATUS_CONFIG = {
  'PRESENT': { label: 'Present', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  'LATE': { label: 'Late', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', icon: Clock },
  'ABSENT': { label: 'Absent', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', icon: XCircle },
  'MANGKIR': { label: 'Unexcused', color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: AlertCircle },
  'SAKIT': { label: 'Medical', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', icon: AlertCircle },
  'IZIN': { label: 'Permit', color: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500', icon: AlertCircle },
  'CUTI': { label: 'Leave', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: AlertCircle },
  'HOLIDAY': { label: 'Holiday', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500', icon: AlertCircle },
  'EARLY_DEPARTURE': { label: 'Early Departure', color: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-500', icon: AlertCircle },
};

const AVATAR_COLORS = [
  'bg-blue-50 text-blue-600 border-blue-100',
  'bg-indigo-50 text-indigo-600 border-indigo-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-amber-50 text-amber-600 border-amber-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-violet-50 text-violet-600 border-violet-100',
];

const formatTime = (timeStr) => {
  if (!timeStr || timeStr === '-' || timeStr === '-- : --') return '-- : --';
  if (!timeStr.includes('T')) return timeStr;
  return new Date(timeStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateVal, lang = 'id') => {
  try {
    if (!dateVal) return '-';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return dateVal;
    const localeStr = lang.startsWith('id') ? 'id-ID' : lang.startsWith('ko') ? 'ko-KR' : lang.startsWith('zh') ? 'zh-CN' : 'en-US';
    return d.toLocaleDateString(localeStr);
  } catch (e) {
    return dateVal;
  }
};

const formatLateAccumulation = (minutes, lang = 'id') => {
  const isIndo = lang.startsWith('id');
  const isKo = lang.startsWith('ko');
  const isZh = lang.startsWith('zh');
  
  if (!minutes || minutes <= 0) {
    return isIndo ? '0 menit' : isKo ? '0분' : isZh ? '0分钟' : '0 minutes';
  }
  
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  
  const hrStr = isIndo ? 'jam' : isKo ? '시간' : isZh ? '小时' : 'hr';
  const minStr = isIndo ? 'menit' : isKo ? '분' : isZh ? '分钟' : 'min';
  
  if (h === 0) return `${m} ${minStr}`;
  if (m === 0) return `${h} ${hrStr}`;
  return `${h} ${hrStr} ${m} ${minStr}`;
};

const DirectorAttendance = () => {
  const { t, i18n } = useTranslation();
  const [appliedFilters, setAppliedFilters] = useState({
    page: 1,
    period: 'today',
    startDate: '',
    endDate: '',
    dept: '',
    section: '',
    position: '',
    status: '',
    search: '',
    limit: 50,
    sortBy: 'date',
    order: 'desc'
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-attendance', appliedFilters],
    queryFn: () => direkturAPI.getAttendance(appliedFilters),
    keepPreviousData: true
  });

  const [activeViewTab, setActiveViewTab] = useState('DETAIL'); // 'DETAIL' | 'REKAPITULASI'

  const { data: fullDataForRekap, isLoading: isRekapLoading } = useQuery({
    queryKey: ['director-attendance-full-rekap', appliedFilters],
    queryFn: () => direkturAPI.getAttendance({ ...appliedFilters, limit: 99999, page: 1 }),
    enabled: activeViewTab === 'REKAPITULASI',
    keepPreviousData: true
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
        g.pulangCepatDetails.push({ date: row.date, checkIn: row.checkIn, checkOut: row.checkOut, shiftEnd: '17:00' });
      } else if (status === 'MANGKIR' || status === 'Mangkir') {
        g.mangkir++;
        const penalty = (row.lateMinutes || 0) === 0 ? 30 : 0;
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

  const records = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const summary = data?.summary || {};
  const [showOnlyAnomalies, setShowOnlyAnomalies] = useState(false);
  const displayedRecords = showOnlyAnomalies ? records.filter(isAnomaly) : records;

  const handleApplyFilters = (newFilters) => {
    setAppliedFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handleSort = (key) => {
    const newOrder = appliedFilters.sortBy === key && appliedFilters.order === 'asc' ? 'desc' : 'asc';
    setAppliedFilters(prev => ({ ...prev, sortBy: key, order: newOrder, page: 1 }));
  };

  const SortIcon = ({ column }) => {
    if (appliedFilters.sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return appliedFilters.order === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  const handleExport = () => {
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
          other: isIndo ? 'Lainnya (Libur/Cuti/Sakit)' : isKo ? '기타 (공휴일/휴가/병가)' : isZh ? '기타 (节假日/休假/病假)' : 'Others (Holiday/Leave/Medical)',
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
            [headers.totalLate]: formatLateAccumulation(g.totalLateMinutes, lang)
          };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isIndo ? 'Rekapitulasi' : isKo ? '부서별 요약' : isZh ? '部门汇总' : 'Recapitulation');
        XLSX.writeFile(wb, `Rekap_Absensi_Per_Dept_Director_${new Date().toISOString().split('T')[0]}.xlsx`);
        return;
      }

      const headers = {
        nik: isIndo ? 'NIK' : isKo ? '사원번호' : isZh ? '工号' : 'Employee ID',
        name: isIndo ? 'Nama' : isKo ? '이름' : isZh ? '姓名' : 'Name',
        dept: isIndo ? 'Departemen' : isKo ? '부서' : isZh ? '部门' : 'Department',
        section: isIndo ? 'Bagian' : isKo ? '파트' : isZh ? '班组' : 'Section',
        position: isIndo ? 'Jabatan' : isKo ? '직급' : isZh ? '职位' : 'Position',
        date: isIndo ? 'Tanggal' : isKo ? '날짜' : isZh ? '日期' : 'Date',
        checkIn: isIndo ? 'Check In' : isKo ? '출근' : isZh ? '签到' : 'Check In',
        checkOut: isIndo ? 'Check Out' : isKo ? '퇴근' : isZh ? '签退' : 'Check Out',
        status: isIndo ? 'Status' : isKo ? '상태' : isZh ? '状态' : 'Status',
        lateness: isIndo ? 'Terlambat (menit)' : isKo ? '지각 (분)' : isZh ? '迟到 (分钟)' : 'Lateness (min)',
        method: isIndo ? 'Metode' : isKo ? '인증 방식' : isZh ? '打卡方式' : 'Method',
      };

      const sortedRecords = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));

      const rows = sortedRecords.map(r => {
        const statusUpper = (r.status || '').toUpperCase();
        const isMangkir = (statusUpper === 'MANGKIR' || statusUpper === 'MISSING' || r.status === 'Mangkir');
        const penalty = (isMangkir && (r.lateMinutes || 0) === 0) ? 30 : 0;

        let rawMethod = 'Manual';
        const modeUpper = (r.mode || '').toUpperCase();
        const srcUpper = (r.source || '').toUpperCase();

        if (modeUpper === 'FACE CCTV' || srcUpper === 'FACE_CCTV') {
          rawMethod = 'Face CCTV';
        } else if (modeUpper === 'FACE ID' || modeUpper === 'FACE HP' || srcUpper === 'FACE_WEB') {
          rawMethod = 'Face HP';
        } else if (modeUpper === 'PINNED' || modeUpper === 'PIN') {
          rawMethod = 'Pinned';
        } else if (modeUpper === 'FINGERED' || modeUpper === 'FINGERPRINT' || modeUpper === 'FINGER' || srcUpper === 'FINGERPRINT') {
          rawMethod = 'Fingered';
        } else if (r.mode === '-') {
          rawMethod = '-';
        }

        const transStatus = translateStatus(r.status, lang);
        const transMethod = translateMethod(rawMethod, lang);

        return {
          [headers.nik]: r.employeeCode || r.nik || '-',
          [headers.name]: r.name,
          [headers.dept]: r.dept,
          [headers.section]: r.section || '-',
          [headers.position]: r.position || '-',
          [headers.date]: formatDate(r.date, lang),
          [headers.checkIn]: formatTime(r.checkIn),
          [headers.checkOut]: formatTime(r.checkOut),
          [headers.status]: transStatus,
          [headers.lateness]: (r.lateMinutes || 0) + penalty,
          [headers.method]: transMethod
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Summary');
      XLSX.writeFile(wb, `Rekap_Absensi_Director_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal export data: ' + err.message);
    }
  };

  const isSingleEmployee = !!appliedFilters.search;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Attendance Analytics</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Enterprise-wide temporal monitoring (Director View)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport} 
            disabled={!records.length}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-30 transition-all active:scale-95 uppercase tracking-wider"
          >
            <Download className="w-4 h-4" />
            {t('attendancePage.btnExportExcel')}
          </button>
        </div>
      </div>

      <FilterBar 
        onApply={handleApplyFilters} 
        isLoading={isLoading} 
        currentSearch={appliedFilters.search}
      />

      {/* Summary Matrix */}
      {!isLoading && records.length > 0 && (
        <div className="space-y-6">
          {/* Visual Analytics Widget Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Widget 1: Attendance Rate Gauge */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-6 hover:shadow-md transition-all">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t('attendancePage.attendanceRate')}</span>
                <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                  {(() => {
                    const totalHadir = (summary.hadir || 0) + (summary.telat || 0);
                    const totalExcludeOff = (total || 0) - ((summary.holiday || 0) + (summary.cuti || 0) + (summary.sakit || 0) + (summary.izin || 0));
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
                      const totalHadir = (summary.hadir || 0) + (summary.telat || 0);
                      const totalExcludeOff = (total || 0) - ((summary.holiday || 0) + (summary.cuti || 0) + (summary.sakit || 0) + (summary.izin || 0));
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
                    const totalLateDays = (summary.telat || 0);
                    const totalDays = (total || 0);
                    return totalDays > 0 ? Math.round((totalLateDays / totalDays) * 100) : 0;
                  })()}%
                </p>
                <span className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1.5 mt-1">
                  <Clock className="w-3.5 h-3.5" /> {t('attendancePage.lateArrival')}
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
                      const totalLateDays = (summary.telat || 0);
                      const totalDays = (total || 0);
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
              records.filter(isAnomaly).length > 0 
                ? 'bg-amber-50/50 border-amber-200 animate-pulse' 
                : 'bg-white border-slate-200'
            }`}>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t('attendancePage.anomalies')}</span>
                <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                  {records.filter(isAnomaly).length} {t('attendancePage.records', { count: records.filter(isAnomaly).length })}
                </p>
                <button 
                  onClick={() => setShowOnlyAnomalies(true)}
                  className="text-[9px] font-bold text-amber-600 hover:text-amber-800 underline uppercase flex items-center gap-1.5 transition-colors cursor-pointer mt-1"
                >
                  {t('attendancePage.tinjauAnomali')}
                </button>
              </div>
              
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0 shadow-sm border border-amber-200">
                <AlertCircle className="w-8 h-8 text-amber-600" />
              </div>
            </div>
          </div>

          {/* Personal Accumulation Card */}
          {isSingleEmployee && records.length > 0 && (
            <div className="bg-white border-2 border-rose-500 rounded-[2rem] p-8 relative overflow-hidden shadow-xl shadow-rose-100/50 animate-in slide-in-from-bottom-4 duration-700">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center shadow-inner border border-rose-100 group">
                    <Clock className="w-10 h-10 text-rose-500 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{t('attendancePage.personalLate')}</p>
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-5xl font-black text-slate-800 tracking-tighter">
                        {formatLateAccumulation(summary.totalLate, i18n.language)}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 text-rose-600 font-bold text-xs mt-3 bg-rose-50 px-3 py-1.5 rounded-full w-fit">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {t('attendancePage.includesPenalty', { penalty: 30 })}
                    </div>
                  </div>
                </div>
                
                <div className="h-24 w-px bg-slate-100 hidden md:block" />

                <div className="text-right flex flex-col items-end">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{t('attendancePage.employeeProfile')}</p>
                  <h3 className="text-4xl font-black text-slate-800 uppercase tracking-tight">
                    {records[0].name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">{records[0].employeeCode}</span>
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-[10px] font-black text-blue-600 uppercase tracking-widest border border-blue-100">{records[0].dept}</span>
                  </div>
                </div>
              </div>
              
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-rose-50 rounded-full opacity-50 blur-3xl" />
              <div className="absolute -left-10 -top-10 w-40 h-40 bg-rose-50 rounded-full opacity-50 blur-3xl" />
            </div>
          )}
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
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

        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-xs font-semibold text-slate-500">
            {activeViewTab === 'DETAIL' ? (
              <>
                {t('attendancePage.showing')} <span className="text-slate-800 font-bold">{showOnlyAnomalies ? displayedRecords.length : total}</span> {t('attendancePage.records')}
              </>
            ) : (
              <>
                {t('attendancePage.showing')} <span className="text-slate-800 font-bold">{rekapData.length}</span> {t('attendancePage.records')}
              </>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowOnlyAnomalies(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !showOnlyAnomalies 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-white text-slate-500 hover:text-slate-800 border border-slate-200'
              }`}
            >
              {t('attendancePage.semua')}
            </button>
            <button
              onClick={() => setShowOnlyAnomalies(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                showOnlyAnomalies 
                  ? 'bg-amber-600 text-white shadow-sm' 
                  : 'bg-white text-slate-500 hover:text-slate-800 border border-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {t('attendancePage.hanyaAnomali')}
            </button>
          </div>
          <div className="flex gap-2">
            <button 
              disabled={appliedFilters.page <= 1} 
              onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page - 1 }))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              disabled={appliedFilters.page >= totalPages} 
              onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page + 1 }))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-50 transition-all shadow-sm active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeViewTab === 'DETAIL' ? (
          <div className="overflow-x-auto max-h-[800px] custom-scrollbar">
            <table className="w-full text-left whitespace-nowrap border-separate border-spacing-0">
              <thead className="sticky top-0 z-40 bg-slate-50">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 md:sticky left-0 top-0 z-50 bg-slate-50 border-b border-slate-200 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-2 group/btn">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.employeeName')}</span>
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 border-b border-slate-200">
                    <button onClick={() => handleSort('dept')} className="flex items-center gap-2 group/btn">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.department')}</span>
                      <SortIcon column="dept" />
                    </button>
                  </th>
                  <th className="px-4 py-3 border-b border-slate-200">
                    <button onClick={() => handleSort('date')} className="flex items-center gap-2 group/btn">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.date')}</span>
                      <SortIcon column="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.method')}</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.checkIn')}</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.checkOut')}</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.late')}</th>
                  <th className="px-6 py-3 md:sticky right-0 top-0 z-50 bg-slate-50 border-b border-slate-200 border-l border-slate-200 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <button onClick={() => handleSort('status')} className="flex items-center gap-2 mx-auto group/btn">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('attendancePage.status')}</span>
                      <SortIcon column="status" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan="8" className="py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">{t('attendancePage.msgLoading')}</p>
                    </div>
                  </td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan="8" className="py-24 text-center">
                    <div className="flex flex-col items-center gap-5 opacity-40">
                      <Calendar className="w-16 h-16 text-slate-300" />
                      <p className="text-base font-bold text-slate-800">{t('attendancePage.msgNoData')}</p>
                    </div>
                  </td></tr>
                ) : displayedRecords.map((r, idx) => {
                  const initials = r.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                  const avatarColor = AVATAR_COLORS[r.name.charCodeAt(0) % AVATAR_COLORS.length];
                  const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: AlertCircle };
                  const Icon = cfg.icon;

                  return (
                    <tr key={`${r.id}-${idx}`} className="group hover:bg-blue-50/40 transition-colors duration-200">
                      <td className="px-6 py-2 md:sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] border shrink-0 ${avatarColor}`}>
                            {initials}
                          </div>
                          <div>
                            <p 
                              onClick={() => handleApplyFilters({ search: r.name })}
                              className="font-bold text-slate-800 text-sm uppercase tracking-tight leading-none cursor-pointer hover:text-blue-600 hover:underline decoration-blue-500/30 transition-all"
                            >
                              {r.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{r.employeeCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs font-bold text-slate-700 block truncate max-w-[150px]">{r.dept || '-'}</span>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{r.position || '-'}</p>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                         <span className="text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                          {formatDate(r.date, i18n.language)}
                         </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {(r.mode === 'Face CCTV' || r.source === 'face_cctv') ? (
                          <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-indigo-100 shadow-sm" title="Face Detection via CCTV">
                            <Camera className="w-3 h-3 text-indigo-500" />
                            Face CCTV
                          </span>
                        ) : (r.mode === 'Face ID' || r.mode === 'Face HP' || r.source === 'face_web') ? (
                          <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-teal-100 shadow-sm" title="Face Detection via HP">
                            <Smartphone className="w-3 h-3 text-teal-500" />
                            Face HP
                          </span>
                        ) : (r.mode === 'Pinned' || r.mode === 'Pin') ? (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-amber-100 shadow-sm" title="Menggunakan PIN pada Mesin">
                            <Key className="w-3 h-3 text-amber-500" />
                            Pinned
                          </span>
                        ) : (r.mode === 'Fingered' || r.mode === 'Fingerprint' || r.mode === 'Finger' || r.source === 'fingerprint') ? (
                          <span className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-sky-100 shadow-sm" title="Menggunakan Sidik Jari (Fingerprint)">
                            <Fingerprint className="w-3 h-3 text-sky-500" />
                            Fingered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-slate-200 shadow-sm" title="Manual / Koreksi HRD">
                            <Edit2 className="w-3 h-3 text-slate-400" />
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-sm font-bold text-slate-800">{formatTime(r.checkIn)}</td>
                      <td className="px-4 py-2 text-center text-sm font-bold text-slate-800">{formatTime(r.checkOut)}</td>
                      <td className="px-4 py-2 text-center">
                        {(r.status?.toUpperCase() === 'LATE' || r.status === 'Terlambat' || r.status === 'Late') && r.lateMinutes > 0 ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                            <span className="text-xs font-bold text-rose-600">+{r.lateMinutes}m</span>
                          </div>
                        ) : (r.status?.toUpperCase() === 'MANGKIR' || r.status?.toUpperCase() === 'MISSING' || r.status === 'Mangkir') ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                            <span className="text-xs font-bold text-slate-500">+{ (r.lateMinutes || 0) + ((r.lateMinutes || 0) === 0 ? 30 : 0) }m</span>
                          </div>
                        ) : (
                          <span className="text-slate-200 font-black">—</span>
                        )}
                      </td>
                      <td className="px-6 py-2 md:sticky right-0 z-20 bg-white group-hover:bg-blue-50/50 transition-colors border-l border-slate-100 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative overflow-x-auto overflow-y-visible min-h-[400px] pb-48 hide-scrollbar custom-scrollbar animate-in fade-in duration-300">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-30 bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50">
                  <th className="px-6 py-3 text-center">{rekapHeaders.no}</th>
                  <th className="px-6 py-3">{rekapHeaders.employee}</th>
                  <th className="px-6 py-3">{rekapHeaders.dept}</th>
                  <th className="px-4 py-3">{rekapHeaders.section}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.total}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.present}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.late}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.early}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.mangkir}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.absent}</th>
                  <th className="px-4 py-3 text-center">{rekapHeaders.other}</th>
                  <th className="px-6 py-3 text-center">{rekapHeaders.rate}</th>
                  <th className="px-6 py-3 text-center">{rekapHeaders.totalLate}</th>
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
                        <td className="px-6 py-3 text-xs font-semibold text-slate-500 text-center border-b border-slate-100">{index + 1}</td>
                        <td className="px-6 py-3 border-b border-slate-100">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800 uppercase">{row.name}</span>
                            <span className="text-[9px] text-slate-500 font-semibold uppercase mt-0.5">{row.employeeCode}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 border-b border-slate-100">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200 uppercase tracking-widest shadow-sm">
                            {row.dept}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100">
                          {row.section || '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-800 border-b border-slate-100">{row.total}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-emerald-600 border-b border-slate-100">{row.present}</td>
                        
                        {/* Terlambat Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-3 text-center text-xs font-bold text-amber-600 cursor-help border-b border-slate-100">
                          <span className={row.late > 0 ? "underline decoration-dotted decoration-amber-450" : ""}>{row.late}</span>
                          {row.late > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-amber-450">{tooltipLabels.lateTitle}</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.lateDetails.map((d, i) => (
                                  <div key={i} className="flex items-center justify-between gap-3 py-0.5 border-b border-slate-800 last:border-0">
                                    <span className="font-bold text-slate-200">{formatDate(d.date, i18n.language)}</span>
                                    <span className="text-slate-400 text-[9px]">IN {d.checkIn || '--:--'}</span>
                                    <span className="text-amber-400 font-extrabold text-[9px]">+{d.lateMinutes}m</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        
                        {/* Pulang Cepat Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-3 text-center text-xs font-bold text-blue-600 cursor-help border-b border-slate-100">
                          <span className={row.pulangCepat > 0 ? "underline decoration-dotted decoration-blue-400" : ""}>{row.pulangCepat || 0}</span>
                          {row.pulangCepat > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-blue-400">{tooltipLabels.earlyTitle}</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.pulangCepatDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{formatDate(d.date, i18n.language)}</span>
                                    <span className="text-slate-400">({d.checkOut || '--:--'} / Jdwl: {d.shiftEnd || '17:00'})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        
                        {/* Mangkir Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-3 text-center text-xs font-bold text-orange-600 cursor-help border-b border-slate-100">
                          <span className={row.mangkir > 0 ? "underline decoration-dotted decoration-orange-400" : ""}>{row.mangkir}</span>
                          {row.mangkir > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-orange-400">{tooltipLabels.mangkirTitle}</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.mangkirDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{formatDate(d.date, i18n.language)}</span>
                                    <span className="text-slate-400">({d.checkIn || '--:--'} - {d.checkOut || '--:--'})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Alpa Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-3 text-center text-xs font-bold text-rose-600 cursor-help border-b border-slate-100">
                          <span className={row.absent > 0 ? "underline decoration-dotted decoration-rose-450" : ""}>{row.absent}</span>
                          {row.absent > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-rose-400">{tooltipLabels.absentTitle}</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.absentDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{formatDate(d.date, i18n.language)}</span>
                                    <span className="text-rose-455">Alpa</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Cuti/Sakit/Izin Column with Tooltip */}
                        <td className="relative group/tooltip px-4 py-3 text-center text-xs font-bold text-slate-500 cursor-help border-b border-slate-100">
                          <span className={row.other > 0 ? "underline decoration-dotted decoration-slate-400" : ""}>{row.other}</span>
                          {row.other > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-none transition-all duration-200">
                              <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-blue-400">{tooltipLabels.otherTitle}</p>
                              <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                                {row.otherDetails.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-850 last:border-0">
                                    <span className="font-bold text-slate-250">{formatDate(d.date, i18n.language)}</span>
                                    <span className="text-blue-400 font-extrabold uppercase text-[8px] tracking-wider bg-blue-950 px-1.5 py-0.5 rounded border border-blue-900">{translateStatus(d.status, lang)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-3 text-center border-b border-slate-100">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            rate >= 95 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            rate >= 90 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            rate >= 80 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {rate}%
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center text-xs font-bold text-rose-600 border-b border-slate-100">
                          {row.totalLateMinutes > 0 ? formatLateAccumulation(row.totalLateMinutes, i18n.language) : '—'}
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
    </div>
  );
};

// ─── Sub-component FilterBar ─────────────────────────────────

const FilterBar = ({ onApply, isLoading, currentSearch }) => {
  const { t } = useTranslation();
  const [filterDate, setFilterDate] = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentSearch !== undefined) setSearchQuery(currentSearch);
  }, [currentSearch]);

  const { data: optionsData } = useQuery({
    queryKey: ['director-att-options-reactive', { period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: searchQuery }],
    queryFn: () => direkturAPI.getAttendanceOptions({ period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, search: searchQuery }),
    staleTime: 30000,
  });

  const masterOptions = optionsData?.data || { departments: [], sections: [], positions: [], statuses: [] };

  const handleApply = () => {
    const periodMap = { 'Today': 'today', 'This Week': 'week', 'This Month': 'month', 'Custom': 'custom' };
    onApply({
      page: 1,
      period: periodMap[filterDate],
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
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('attendancePage.temporalScope')}</label>
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
                {period === 'Today' ? t('attendancePage.today') : period === 'This Week' ? t('attendancePage.week') : period === 'This Month' ? t('attendancePage.month') : t('attendancePage.manual')}
              </button>
            ))}
          </div>

          {filterDate === 'Custom' && (
            <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
              <input 
                type="date" 
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
              />
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('attendancePage.personnelFilter')}</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder={t('attendancePage.idSequence')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 shadow-sm transition-all"
              />
            </div>
          </div>

          {[
            { label: t('attendancePage.department'), val: filterDept, setter: setFilterDept, opts: masterOptions.departments.map(d => ({ v: d.name, l: d.name })), onChg: () => { setFilterSection(''); setFilterPosition(''); } },
            { label: t('attendancePage.section'), val: filterSection, setter: setFilterSection, opts: (masterOptions.sections || []).map(s => ({ v: s, l: s })) },
            { label: t('attendancePage.position'), val: filterPosition, setter: setFilterPosition, opts: (masterOptions.positions || []).map(p => ({ v: p, l: p })) },
            { label: t('attendancePage.status'), val: filterStatus, setter: setFilterStatus, opts: (masterOptions.statuses || []).map(s => ({ v: s, l: STATUS_MAP[s] || s })) }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => { field.setter(e.target.value); field.onChg?.(); }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm truncate transition-all"
                >
                  <option value="">{t('attendancePage.globalArchive')}</option>
                  {field.opts.map((o, i) => <option key={i} value={o.v}>{o.l}</option>)}
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          ))}

          <button 
            onClick={handleApply}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white h-[45px] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('attendancePage.commitFilters')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DirectorAttendance;
