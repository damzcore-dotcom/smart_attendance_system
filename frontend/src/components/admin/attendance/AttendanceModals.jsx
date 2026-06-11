import { useTranslation } from 'react-i18next';
import { 
  FileSpreadsheet, Scan, Calendar, Upload, X, CheckCircle2, 
  AlertCircle, XCircle, RefreshCw, Loader2, Edit2, Printer, 
  Search, Filter, ShieldCheck 
} from 'lucide-react';

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

const AttendanceModals = ({
  // Import Modal States & Handlers
  isImportOpen,
  setImportOpen,
  handleImport,
  isUploading,
  importProgress,
  importResult,
  setImportResult,

  // Recalc Modal States & Handlers
  isRecalcOpen,
  setRecalcOpen,
  recalcRange,
  setRecalcRange,
  isRecalculating,
  handleRecalculate,

  // Swap Modal States & Handlers
  isSwapOpen,
  setSwapOpen,
  swapRange,
  setSwapRange,
  handleSwapDays,

  // Correction Modal States & Handlers
  correctionModal,
  setCorrectionModal,
  handleCorrectionSubmit,
  isCorrecting,

  // Report Modal States & Handlers
  isReportOpen,
  setReportOpen,
  selectedMonth,
  setSelectedMonth,
  reportSearch,
  setReportSearch,
  reportDept,
  setReportDept,
  reportEmployees,
  handlePrintAllReports,
  handlePrintReport,

  // Photo Modal States & Handlers
  photoModal,
  setPhotoModal,
  getFileUrl
}) => {
  const { t, i18n } = useTranslation();

  return (
    <>
      {/* 1. Terminal Sync Modal / Excel Import */}
      {isImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isUploading && setImportOpen(false)} />
          
          <div className="bg-white w-full max-w-xl relative z-10 overflow-hidden shadow-2xl rounded-3xl animate-in zoom-in-95 duration-200">
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
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
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
                      <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col items-center shadow-sm">
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
                    type="button"
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

      {/* 2. Audit Reconstruction Modal */}
      {isRecalcOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isRecalculating && setRecalcOpen(false)} />
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden shadow-2xl rounded-3xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <RefreshCw className={`w-5 h-5 text-blue-600 ${isRecalculating ? 'animate-spin' : ''}`} />
                </div>
                <h3 className="font-bold text-slate-800 text-lg tracking-tight">Audit Absensi</h3>
              </div>
              <button onClick={() => !isRecalculating && setRecalcOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
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
              <button type="button" onClick={() => setRecalcOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl uppercase tracking-wider transition-all">Batal</button>
              <button 
                type="button"
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

      {/* 3. Swap Attendance Modal */}
      {isSwapOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isRecalculating && setSwapOpen(false)} />
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden shadow-2xl rounded-3xl animate-in zoom-in-95 duration-200">
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
              <button onClick={() => !isRecalculating && setSwapOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
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
                
                <div className="absolute left-8 top-1/2 -translate-y-1/2 w-0.5 h-16 bg-slate-200 z-0 border-l border-dashed border-slate-300" />

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
              <button type="button" onClick={() => setSwapOpen(false)} className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl uppercase tracking-wider transition-all">Batal</button>
              <button 
                type="button"
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

      {/* 4. Correction Modal */}
      {correctionModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isCorrecting && setCorrectionModal(prev => ({ ...prev, isOpen: false }))} />
          
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden shadow-2xl rounded-3xl">
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
              <button type="button" onClick={() => !isCorrecting && setCorrectionModal(prev => ({ ...prev, isOpen: false }))} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8">
              <form onSubmit={handleCorrectionSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Status Saat Ini</label>
                  <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700">
                    {translateStatus(correctionModal.currentStatus, i18n.language) || correctionModal.currentStatus}
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
                    <option value="PRESENT">Hadir (Manual)</option>
                    <option value="CUTI">Cuti</option>
                    <option value="SAKIT">Sakit</option>
                    <option value="IZIN">Izin</option>
                    <option value="ABSENT">Alpa</option>
                    <option value="MANGKIR">Mangkir (Kurang Finger)</option>
                    <option value="HOLIDAY">Libur</option>
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

      {/* 5. Cetak Laporan Absen (Individu) Modal */}
      {isReportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="bg-white w-full max-w-4xl relative z-10 overflow-hidden shadow-2xl rounded-3xl flex flex-col max-h-[90vh]">
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
                <button type="button" onClick={handlePrintAllReports} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm active:scale-95">
                  <Printer className="w-3.5 h-3.5" /> Cetak Semua
                </button>
                <button type="button" onClick={() => setReportOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
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
                          type="button"
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

      {/* 6. CCTV Photo Modal */}
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
                type="button"
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
                type="button"
                onClick={() => setPhotoModal(prev => ({ ...prev, isOpen: false }))}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 shadow-sm"
              >
                Tutup Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AttendanceModals;
