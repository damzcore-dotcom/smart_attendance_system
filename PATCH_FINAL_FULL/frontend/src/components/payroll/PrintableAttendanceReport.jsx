import React from 'react';

const PrintableAttendanceReport = ({ detail, logs, company, config }) => {
  if (!detail || !config) return null;


  const getThemeColors = () => {
    switch (config.themeStyle) {
      case 'classic': return 'border-slate-800 text-slate-800';
      case 'thermal': return 'border-slate-400 font-mono text-slate-700';
      default: return 'border-blue-600 text-slate-800';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`print-slip-container w-full bg-white text-black p-8 ${getThemeColors()} print:p-0 print:m-0`}>
      {/* Watermark */}
      {config.watermarkText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] overflow-hidden print:opacity-[0.05]">
          <span className="text-8xl font-black transform -rotate-45 text-slate-900 whitespace-nowrap">
            {config.watermarkText}
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-center ${config.themeStyle === 'modern' ? 'justify-between' : 'justify-center flex-col text-center'} border-b-2 pb-6 ${config.themeStyle === 'modern' ? 'border-blue-600' : 'border-slate-300'}`}>
        {config.showCompanyLogo && (
          <div className="flex items-center gap-3 mb-2 md:mb-0">
            {company?.appLogo ? (
              <img src={company.appLogo} alt="Logo" className="w-12 h-12 object-contain" />
            ) : (
              <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 font-bold text-xs">LOGO</div>
            )}
            {config.themeStyle === 'modern' && (
              <div>
                <h1 className="font-bold text-lg leading-tight">{company?.companyName || 'Nama Perusahaan'}</h1>
                <p className="text-xs text-slate-500">{company?.companyAddress || 'Alamat Perusahaan'}</p>
              </div>
            )}
          </div>
        )}
        <div className={config.themeStyle !== 'modern' ? 'mt-4' : 'text-right'}>
          <h2 className={`font-black tracking-tight ${config.themeStyle === 'thermal' ? 'text-xl uppercase' : 'text-2xl text-blue-800'}`}>LAPORAN ABSENSI</h2>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Periode: {detail.payroll?.periodName || 'N/A'}</p>
        </div>
      </div>

      {/* Employee Info */}
      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 text-xs">Nama Karyawan</p>
          <p className="font-bold">{detail.employeeName}</p>
          <p className="text-xs text-slate-500 mt-1">NIK: {detail.employeeCode}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs">Departemen / Posisi</p>
          <p className="font-bold">{detail.department}</p>
          <p className="text-xs text-slate-500 mt-1">{detail.employmentType}</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-6 border border-slate-200 rounded-lg p-4 grid grid-cols-4 md:grid-cols-5 gap-4 text-center text-xs">
        <div>
          <p className="text-slate-500 font-medium">Hari Kerja</p>
          <p className="font-bold text-slate-800 text-sm">{detail.workingDays}</p>
        </div>
        <div>
          <p className="text-emerald-600 font-medium">Hadir</p>
          <p className="font-bold text-emerald-700 text-sm">{detail.daysPresent}</p>
        </div>
        <div>
          <p className="text-red-500 font-medium">Absen/Mangkir</p>
          <p className="font-bold text-red-600 text-sm">{detail.daysAbsent}</p>
        </div>
        <div>
          <p className="text-amber-500 font-medium">Telat (Kali)</p>
          <p className="font-bold text-amber-600 text-sm">{detail.daysLate}</p>
        </div>
        <div>
          <p className="text-amber-600 font-medium">Total Menit Telat</p>
          <p className="font-bold text-amber-700 text-sm">{detail.totalLateMinutes} Mnt</p>
        </div>
      </div>


      {/* Daily Logs Table */}
      {config.showDailyLogs && logs && logs.length > 0 && (
        <div className="mt-8">
          <h4 className="font-bold text-xs uppercase tracking-wider border-b border-slate-200 pb-2 mb-4">Rincian Absensi Harian</h4>
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200">
                <th className="py-2 px-2">Tanggal</th>
                <th className="py-2 px-2">Masuk</th>
                <th className="py-2 px-2">Keluar</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2 text-right">Telat (Mnt)</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-2 px-2">{log.date ? formatDate(log.date) : (log.day ? `${log.weekday}, ${log.day}` : '-')}</td>
                  <td className="py-2 px-2">{log.checkIn ? formatTime(log.checkIn) : (log.in || '-')}</td>
                  <td className="py-2 px-2">{log.checkOut ? formatTime(log.checkOut) : (log.out || '-')}</td>
                  <td className="py-2 px-2 font-semibold">
                    <span className={
                      (log.status === 'LATE' || log.status === 'Terlambat') ? 'text-amber-600' :
                      (log.status === 'ABSENT' || log.status === 'MANGKIR' || log.status === 'Mangkir' || log.status === 'Alpa' || log.status === 'Tanpa Keterangan (Alpa)') ? 'text-red-600' :
                      (log.status === 'PRESENT' || log.status === 'Hadir') ? 'text-emerald-600' : 'text-blue-600'
                    }>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-amber-600 font-bold">{log.lateMinutes > 0 ? log.lateMinutes : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Note */}
      {config.footerNote && (
        <div className="mt-12 text-center text-[10px] text-slate-500 border-t border-dashed border-slate-200 pt-4 px-8">
          {config.footerNote}
        </div>
      )}
    </div>
  );
};

export default PrintableAttendanceReport;
