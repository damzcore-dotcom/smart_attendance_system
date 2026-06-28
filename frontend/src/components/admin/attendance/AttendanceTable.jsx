import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, Clock, Edit2, Camera, Smartphone, Key, Fingerprint, 
  ShieldCheck, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown, 
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, XCircle 
} from 'lucide-react';
import { getStatusColor } from '../../../utils/statusUtils';

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

const parseTimeForInput = (timeStr) => {
  if (!timeStr || timeStr.includes('--')) return '';
  const [time, modifier] = timeStr.split(' ');
  if (!time || !modifier) return timeStr;
  let [hours, minutes] = time.split(':');
  if (hours === '12') hours = '00';
  if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12);
  return `${hours.padStart(2, '0')}:${minutes}`;
};

const AttendanceTable = ({
  activeViewTab,
  anomalyFilter,
  setAnomalyFilter,
  isLoading,
  isRekapLoading,
  filteredData = [],
  rekapData = [],
  appliedFilters,
  setAppliedFilters,
  displaySummary,
  dataTotal,
  dataTotalPages,
  companySettings,
  sortConfig,
  handleSort,
  handleQuickWaiver,
  setCorrectionModal,
  setPhotoModal
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortConfig.order === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl">
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
               type="button"
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
               type="button"
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
                    <button type="button" onClick={() => handleSort('name')} className="flex items-center gap-2 group/btn">
                      {t('attendancePage.employeeName')}
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-4 py-4">
                    <button type="button" onClick={() => handleSort('date')} className="flex items-center gap-2 group/btn">
                      {t('attendancePage.date')}
                      <SortIcon column="date" />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.method')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.checkIn')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.checkOut')}</th>
                  <th className="px-6 py-4">
                    <button type="button" onClick={() => handleSort('status')} className="flex items-center gap-2 mx-auto group/btn">
                      {t('attendancePage.status')}
                      <SortIcon column="status" />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.late')}</th>
                  <th className="px-4 py-4 text-center">{t('attendancePage.overtime')}</th>
                  <th className="px-4 py-4">
                    <button type="button" onClick={() => handleSort('dept')} className="flex items-center gap-2 group/btn">
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
                          // Filter pakai NIK (unik & persis) agar tidak salah-cocok nama yang jadi sub-string nama lain
                          setAppliedFilters(prev => ({ ...prev, search: row.employeeCode || row.name, page: 1 }));
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
                        {((!row.checkIn || row.checkIn === '--:--' || row.checkIn === '-- : --') && (!row.checkOut || row.checkOut === '--:--' || row.checkOut === '-- : --')) ? (
                          <span className="text-slate-400">—</span>
                        ) : (row.source === 'face_cctv' || row.mode === 'Face CCTV') ? (
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
                              type="button"
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
                              title={i18n.language.startsWith('id') ? 'Lihat Foto CCTV Masuk' : 'View Check-In CCTV Photo'}
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
                              type="button"
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
                              title={i18n.language.startsWith('id') ? 'Lihat Foto CCTV Pulang' : 'View Check-Out CCTV Photo'}
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
                          type="button"
                          onClick={() => {
                            if (row.dept) {
                              setAppliedFilters(prev => ({ ...prev, dept: row.dept, section: '', page: 1 }));
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm"
                        >
                          {row.dept || 'N/A'}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        {row.section ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedFilters(prev => ({ ...prev, dept: row.dept || '', section: row.section, page: 1 }));
                            }}
                            className="text-[10px] font-bold text-slate-600 hover:text-blue-600 hover:underline uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
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
                              type="button"
                              onClick={() => handleQuickWaiver(row)}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 hover:border-emerald-300 transition-all active:scale-95"
                              title="Beri Dispensasi Keterlambatan"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button 
                            type="button"
                            onClick={() => setCorrectionModal({
                              isOpen: true,
                              recordId: row.id,
                              employeeName: row.name,
                              employeeCode: row.employeeCode,
                              rawDate: row.date,
                              currentStatus: row.status,
                              newStatus: 'PRESENT',
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
                            type="button"
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
                  {t('attendancePage.page')} <span className="text-slate-800 mx-1">{appliedFilters.page}</span> / <span className="text-slate-600 ml-1">{dataTotalPages || 1}</span>
                </p>
                <div className="w-1 h-1 rounded-full bg-slate-300" />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {t('attendancePage.kpiTotal')}: <span className="text-blue-600 font-bold">{dataTotal || 0}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={appliedFilters.page <= 1}
                  onClick={() => setAppliedFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95 text-slate-600"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={appliedFilters.page >= (dataTotalPages || 1)}
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
                          type="button"
                          onClick={() => {
                            if (row.dept) {
                              setAppliedFilters(prev => ({ ...prev, dept: row.dept, section: '', page: 1 }));
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm"
                        >
                          {row.dept}
                        </button>
                      </td>
                      <td className="px-4 py-4 border-b border-slate-100">
                        {row.section ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedFilters(prev => ({ ...prev, dept: row.dept || '', section: row.section, page: 1 }));
                            }}
                            className="text-[10px] font-bold text-slate-700 hover:text-blue-600 hover:underline uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
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
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-auto transition-all duration-200">
                            <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-amber-450">{t('attendancePage.kpiLate')} (Detail)</p>
                            <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                              {row.lateDetails.map((d, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 py-0.5 border-b border-slate-800 last:border-0">
                                  <span className="font-bold text-slate-200">{d.date}</span>
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
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-auto transition-all duration-200">
                            <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-blue-400">{t('attendancePage.kpiEarlyDeparture')} (Detail)</p>
                            <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                              {row.pulangCepatDetails.map((d, i) => (
                                <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-800 last:border-0">
                                  <span className="font-bold text-slate-200">{d.date}</span>
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
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-auto transition-all duration-200">
                            <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-orange-400">{t('attendancePage.kpiMangkir')} (Detail)</p>
                            <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                              {row.mangkirDetails.map((d, i) => (
                                <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-800 last:border-0">
                                  <span className="font-bold text-slate-200">{d.date}</span>
                                  <span className="text-slate-400">({d.checkIn || '--:--'} - {d.checkOut || '--:--'})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Alpa Column with Tooltip */}
                      <td className="relative group/tooltip px-4 py-4 text-center text-xs font-bold text-rose-600 cursor-help border-b border-slate-100">
                        <span className={row.absent > 0 ? "underline decoration-dotted decoration-rose-400" : ""}>{row.absent}</span>
                        {row.absent > 0 && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-auto transition-all duration-200">
                            <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-rose-450">{t('attendancePage.kpiAbsent')} (Detail)</p>
                            <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                              {row.absentDetails.map((d, i) => (
                                <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-800 last:border-0">
                                  <span className="font-bold text-slate-200">{d.date}</span>
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
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:block bg-slate-900/95 backdrop-blur text-white text-[10px] p-3 rounded-xl shadow-xl border border-slate-700 z-50 min-w-[220px] pointer-events-auto transition-all duration-200">
                            <p className="font-extrabold border-b border-slate-700 pb-1 mb-1.5 text-[9px] uppercase tracking-wider text-blue-400">{t('attendancePage.kpiOther')} (Detail)</p>
                            <div className="space-y-1 text-left max-h-[150px] overflow-y-auto custom-scrollbar">
                              {row.otherDetails.map((d, i) => (
                                <div key={i} className="flex justify-between gap-4 py-0.5 border-b border-slate-800 last:border-0">
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
  );
};

export default AttendanceTable;
