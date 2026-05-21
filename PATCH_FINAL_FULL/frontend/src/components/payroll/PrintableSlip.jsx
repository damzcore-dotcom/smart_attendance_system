import React from 'react';

const PrintableSlip = ({ detail, company, config }) => {
  if (!detail || !config) return null;

  const formatRupiah = (num) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
  };

  const getThemeColors = () => {
    switch (config.themeStyle) {
      case 'classic': return 'border-slate-800 text-slate-800';
      case 'thermal': return 'border-slate-400 font-mono text-slate-700';
      default: return 'border-blue-600 text-slate-800';
    }
  };

  const allowances = detail.allowances || [];
  const deductions = detail.deductions || [];

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
            {/* If there's an actual logo URL in company.appLogo, we use it. Otherwise placeholder */}
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
          <h2 className={`font-black tracking-tight ${config.themeStyle === 'thermal' ? 'text-xl uppercase' : 'text-2xl text-blue-800'}`}>SLIP GAJI</h2>
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
          <p className="text-xs text-slate-500 mt-1">{detail.employmentType} - {detail.salaryType}</p>
        </div>
      </div>

      {/* Attendance Stats */}
      {config.showAttendanceStats && (
        <div className="mt-6 border border-slate-200 rounded-lg p-4 flex justify-between items-center text-xs">
          <div className="text-center">
            <p className="text-slate-500 font-medium">Hari Kerja</p>
            <p className="font-bold text-slate-800 text-sm">{detail.workingDays}</p>
          </div>
          <div className="text-center">
            <p className="text-emerald-600 font-medium">Hadir</p>
            <p className="font-bold text-emerald-700 text-sm">{detail.daysPresent}</p>
          </div>
          <div className="text-center">
            <p className="text-red-500 font-medium">Absen</p>
            <p className="font-bold text-red-600 text-sm">{detail.daysAbsent}</p>
          </div>
          <div className="text-center">
            <p className="text-amber-500 font-medium">Telat (Mnt)</p>
            <p className="font-bold text-amber-600 text-sm">{detail.totalLateMinutes}</p>
          </div>
        </div>
      )}

      {/* Salary Details */}
      <div className="mt-8 flex gap-8">
        {/* PENDAPATAN */}
        <div className="flex-1 space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider border-b border-slate-200 pb-2">Pendapatan</h4>
          
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Gaji Pokok {detail.proRatedSalary < detail.baseSalary ? '(Pro-Rata)' : ''}</span>
            <span className="font-bold">{formatRupiah(detail.proRatedSalary)}</span>
          </div>

          {allowances.map((a, idx) => {
            if (config.hideZeroAllowances && a.value === 0) return null;
            return (
              <div key={idx} className={`flex justify-between text-sm ${a.value === 0 ? 'text-slate-400' : ''}`}>
                <span className="text-slate-600">{a.name}</span>
                <span className="font-bold">{formatRupiah(a.value)}</span>
              </div>
            );
          })}

          <div className="flex justify-between text-sm">
            <span className="text-slate-600">
              Lembur 
              {config.showOvertimeDetails && detail.overtimeHours > 0 && (
                <span className="text-[10px] text-blue-500 font-bold ml-1">({detail.overtimeHours} Jam)</span>
              )}
            </span>
            <span className="font-bold">{formatRupiah(detail.overtimePay)}</span>
          </div>
        </div>

        {/* POTONGAN */}
        <div className="flex-1 space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider border-b border-slate-200 pb-2">Potongan</h4>
          
          {deductions.map((d, idx) => {
            if (config.hideZeroAllowances && d.value === 0) return null;
            return (
              <div key={idx} className={`flex justify-between text-sm ${d.value === 0 ? 'text-slate-400' : ''}`}>
                <span className="text-slate-600">{d.name}</span>
                <span className="font-bold text-red-500">-{formatRupiah(d.value)}</span>
              </div>
            );
          })}

          {detail.attendancePenalty > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Potongan Keterlambatan</span>
              <span className="font-bold text-red-500">-{formatRupiah(detail.attendancePenalty)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-8 flex justify-end">
        <div className="w-1/2 space-y-2 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Total Pendapatan</span>
            <span>{formatRupiah(detail.grossPay)}</span>
          </div>
          <div className="flex justify-between text-slate-600 border-b border-slate-200 pb-2">
            <span>Total Potongan</span>
            <span className="text-red-500">-{formatRupiah(detail.totalDeduction)}</span>
          </div>
          <div className={`flex justify-between items-center pt-2 ${config.themeStyle === 'modern' ? 'text-blue-600' : ''}`}>
            <span className="font-bold uppercase tracking-wider text-sm">Penerimaan Bersih</span>
            <span className="text-xl font-black">{formatRupiah(detail.netPay)}</span>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      {config.footerNote && (
        <div className="mt-12 text-center text-[10px] text-slate-500 border-t border-dashed border-slate-200 pt-4 px-8">
          {config.footerNote}
        </div>
      )}
    </div>
  );
};

export default PrintableSlip;
