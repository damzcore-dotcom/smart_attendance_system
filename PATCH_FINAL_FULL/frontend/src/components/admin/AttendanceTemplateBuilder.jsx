import React, { useState, useEffect } from 'react';
import { FileText, Save, Layout, Palette, CheckCircle2, Sliders, Type, Hash } from 'lucide-react';

const AttendanceTemplateBuilder = ({ formData, handleInputChange }) => {
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [config, setConfig] = useState({
    themeStyle: 'modern',
    showCompanyLogo: true,
    showLatePenalty: true,
    showDailyLogs: true,
    watermarkText: 'CONFIDENTIAL',
    footerNote: 'Dokumen ini otomatis di-generate oleh sistem.',
  });

  useEffect(() => {
    if (formData.attendanceReportConfig) {
      try {
        setConfig(JSON.parse(formData.attendanceReportConfig));
      } catch (err) {
        console.error('Failed to parse attendanceReportConfig', err);
      }
    }
  }, [formData.attendanceReportConfig]);

  const updateConfig = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    handleInputChange('attendanceReportConfig', JSON.stringify(newConfig));
  };

  const getThemeColors = () => {
    switch (config.themeStyle) {
      case 'classic': return 'border-slate-800 text-slate-800';
      case 'thermal': return 'border-slate-400 font-mono text-slate-700 bg-yellow-50/30';
      default: return 'border-blue-600 text-slate-800';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col 2xl:flex-row gap-6">
        
        {/* LEFT PANEL: CONTROLS */}
        <div className="w-full 2xl:w-[40%] space-y-6">
          <div className="bg-white p-8 border border-slate-200 shadow-sm rounded-3xl">
            <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Visual Configuration (Laporan Absen)</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Adjust attendance report layout</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Theme Dropdown */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-2">
                  <Palette className="w-3 h-3" /> Layout Theme
                </label>
                <select
                  value={config.themeStyle}
                  onChange={(e) => updateConfig('themeStyle', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="modern">Modern Corporate (A4/A5)</option>
                  <option value="classic">Classic Minimalist</option>
                  <option value="thermal">Thermal Receipt Style (POS)</option>
                </select>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'showCompanyLogo', label: 'Company Logo', desc: 'Display logo at top' },
                  { key: 'showLatePenalty', label: 'Late Penalty', desc: 'Show deduction in attendance report' },
                  { key: 'showDailyLogs', label: 'Daily Logs', desc: 'List daily check in/out table' },
                ].map(toggle => (
                  <label key={toggle.key} className="flex items-start gap-3 p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="mt-0.5">
                      <input 
                        type="checkbox" 
                        checked={config[toggle.key]} 
                        onChange={(e) => updateConfig(toggle.key, e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-700">{toggle.label}</div>
                      <div className="text-[9px] text-slate-500">{toggle.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Texts */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-2">
                  <Type className="w-3 h-3" /> Watermark Text
                </label>
                <input 
                  type="text" 
                  value={config.watermarkText} 
                  onChange={(e) => updateConfig('watermarkText', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-2">
                  <Hash className="w-3 h-3" /> Footer Note / Disclaimer
                </label>
                <textarea 
                  value={config.footerNote} 
                  onChange={(e) => updateConfig('footerNote', e.target.value)}
                  rows="3"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700"
                />
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT PANEL: LIVE PREVIEW */}
        <div className="w-full 2xl:w-[60%]">
          <div className="sticky top-8 space-y-3">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Layout className="w-4 h-4" /> Live Preview
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowFullPreview(true)}
                  className="text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-3 h-3" /> Full Size View
                </button>
                <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1.5 rounded border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Auto-sync
                </div>
              </div>
            </div>

            {/* Dummy Paper Preview - Scalable/Scrollable Container */}
            <div className="w-full overflow-x-auto pb-6 rounded-xl custom-scrollbar flex justify-center">
              <div className={`w-full max-w-[650px] min-w-[500px] shrink-0 h-fit bg-white shadow-xl rounded-lg overflow-hidden border border-slate-200 min-h-[500px] relative p-8 ${getThemeColors()}`}>
              
              {/* Watermark */}
              {config.watermarkText && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] overflow-hidden">
                  <span className="text-6xl font-black transform -rotate-45 text-slate-900 select-none text-center leading-tight whitespace-pre-wrap px-6">
                    {config.watermarkText}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className={`flex items-center ${config.themeStyle === 'modern' ? 'justify-between' : 'justify-center flex-col text-center'} border-b-2 pb-6 ${config.themeStyle === 'modern' ? 'border-blue-600' : 'border-slate-300'}`}>
                {config.showCompanyLogo && (
                  <div className="flex items-center gap-3 mb-2 md:mb-0">
                    {formData.appLogo ? (
                      <img src={formData.appLogo} alt="Logo" className="w-12 h-12 object-contain" />
                    ) : (
                      <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 font-bold text-xs">LOGO</div>
                    )}
                    {config.themeStyle === 'modern' && (
                      <div>
                        <h1 className="font-bold text-lg leading-tight">{formData.companyName || 'Nama Perusahaan'}</h1>
                        <p className="text-xs text-slate-500">{formData.companyAddress || 'Alamat Perusahaan'}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className={config.themeStyle !== 'modern' ? 'mt-4' : 'text-right'}>
                  <h2 className={`font-black tracking-tight ${config.themeStyle === 'thermal' ? 'text-xl uppercase' : 'text-2xl text-blue-800'}`}>LAPORAN ABSENSI</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Periode: MEI 2026</p>
                </div>
              </div>

              {/* Employee Info */}
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Nama Karyawan</p>
                  <p className="font-bold">Adam Z.</p>
                  <p className="text-xs text-slate-500 mt-1">NIK: EMP-001</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Departemen / Posisi</p>
                  <p className="font-bold">Engineering</p>
                  <p className="text-xs text-slate-500 mt-1">TETAP - MONTHLY</p>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="mt-6 border border-slate-200 rounded-lg p-4 grid grid-cols-4 md:grid-cols-5 gap-4 text-center text-xs">
                <div>
                  <p className="text-slate-500 font-medium">Hari Kerja</p>
                  <p className="font-bold text-slate-800 text-sm">22</p>
                </div>
                <div>
                  <p className="text-emerald-600 font-medium">Hadir</p>
                  <p className="font-bold text-emerald-700 text-sm">20</p>
                </div>
                <div>
                  <p className="text-red-500 font-medium">Absen</p>
                  <p className="font-bold text-red-600 text-sm">2</p>
                </div>
                <div>
                  <p className="text-amber-500 font-medium">Telat (Kali)</p>
                  <p className="font-bold text-amber-600 text-sm">1</p>
                </div>
                <div>
                  <p className="text-amber-600 font-medium">Total Menit Telat</p>
                  <p className="font-bold text-amber-700 text-sm">15 Mnt</p>
                </div>
              </div>

              {/* Penalty Calculation Box */}
              {config.showLatePenalty && (
                <div className="mt-4 bg-red-50 border border-red-100 rounded-lg p-4 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-bold text-red-700 uppercase tracking-wider text-xs">Potongan Keterlambatan</span>
                    <p className="text-[10px] text-red-500 mt-0.5">Berlaku pemotongan gaji berdasarkan akumulasi menit telat & mangkir.</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-red-600">-Rp 50.000</span>
                  </div>
                </div>
              )}

              {/* Daily Logs Table */}
              {config.showDailyLogs && (
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
                      <tr className="border-b border-slate-100">
                        <td className="py-2 px-2">Sen, 04 Mei 2026</td>
                        <td className="py-2 px-2">08:00</td>
                        <td className="py-2 px-2">17:00</td>
                        <td className="py-2 px-2 font-semibold text-emerald-600">PRESENT</td>
                        <td className="py-2 px-2 text-right text-amber-600 font-bold">-</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 px-2">Sel, 05 Mei 2026</td>
                        <td className="py-2 px-2">08:15</td>
                        <td className="py-2 px-2">17:00</td>
                        <td className="py-2 px-2 font-semibold text-amber-600">LATE</td>
                        <td className="py-2 px-2 text-right text-amber-600 font-bold">15</td>
                      </tr>
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
          </div>
        </div>
      </div>
    </div>
      
      {/* Full Preview Modal */}
      {showFullPreview && (
        <div className="fixed inset-0 z-[999] flex flex-col justify-end lg:justify-center lg:items-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom-10 lg:zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Layout className="w-5 h-5 text-emerald-600" /> Full Size Preview (Laporan Absen)
              </h3>
              <button 
                onClick={() => setShowFullPreview(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar bg-slate-100/50 flex justify-center items-start">
              <div className={`w-[700px] shrink-0 h-fit bg-white shadow-sm rounded-lg overflow-hidden border border-slate-200 min-h-[600px] relative p-10 ${getThemeColors()}`}>
                
                {/* Watermark */}
                {config.watermarkText && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] overflow-hidden">
                    <span className="text-6xl md:text-8xl font-black transform -rotate-45 text-slate-900 select-none text-center leading-tight whitespace-pre-wrap px-10">
                      {config.watermarkText}
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className={`flex items-center ${config.themeStyle === 'modern' ? 'justify-between' : 'justify-center flex-col text-center'} border-b-2 pb-6 ${config.themeStyle === 'modern' ? 'border-emerald-600' : 'border-slate-300'}`}>
                  {config.showCompanyLogo && (
                    <div className="flex items-center gap-4 mb-2 md:mb-0">
                      {formData.appLogo ? (
                        <img src={formData.appLogo} alt="Logo" className="w-16 h-16 object-contain" />
                      ) : (
                        <div className="w-16 h-16 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm">LOGO</div>
                      )}
                      {config.themeStyle === 'modern' && (
                        <div>
                          <h1 className="font-black text-2xl leading-tight">{formData.companyName || 'Nama Perusahaan'}</h1>
                          <p className="text-sm text-slate-500 font-medium">{formData.companyAddress || 'Alamat Perusahaan'}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className={config.themeStyle !== 'modern' ? 'mt-6' : 'text-right'}>
                    <h2 className={`font-black tracking-tight ${config.themeStyle === 'thermal' ? 'text-2xl uppercase' : 'text-3xl text-emerald-800'}`}>LAPORAN ABSENSI</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-1">Periode: MEI 2026</p>
                  </div>
                </div>

                {/* Employee Info */}
                <div className="mt-8 grid grid-cols-2 gap-6 text-base">
                  <div>
                    <p className="text-slate-500 text-sm">Nama Karyawan</p>
                    <p className="font-bold text-lg">Adam Z.</p>
                    <p className="text-xs text-slate-500 mt-1">NIK: EMP-001</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-sm">Departemen / Posisi</p>
                    <p className="font-bold text-lg">Engineering</p>
                    <p className="text-xs text-slate-500 mt-1">TETAP - MONTHLY</p>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="mt-8 border border-slate-200 rounded-xl p-5 grid grid-cols-4 md:grid-cols-5 gap-4 text-center text-sm">
                  <div>
                    <p className="text-slate-500 font-medium mb-1">Hari Kerja</p>
                    <p className="font-bold text-slate-800 text-lg">22</p>
                  </div>
                  <div>
                    <p className="text-emerald-600 font-medium mb-1">Hadir</p>
                    <p className="font-bold text-emerald-700 text-lg">20</p>
                  </div>
                  <div>
                    <p className="text-red-500 font-medium mb-1">Absen</p>
                    <p className="font-bold text-red-600 text-lg">2</p>
                  </div>
                  <div>
                    <p className="text-amber-500 font-medium mb-1">Telat (Kali)</p>
                    <p className="font-bold text-amber-600 text-lg">1</p>
                  </div>
                  <div>
                    <p className="text-amber-600 font-medium mb-1">Menit Telat</p>
                    <p className="font-bold text-amber-700 text-lg">15 Mnt</p>
                  </div>
                </div>

                {/* Penalty Calculation Box */}
                {config.showLatePenalty && (
                  <div className="mt-6 bg-red-50 border border-red-100 rounded-xl p-5 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-red-700 uppercase tracking-wider text-sm">Potongan Keterlambatan</span>
                      <p className="text-xs text-red-500 mt-1">Berlaku pemotongan gaji berdasarkan akumulasi menit telat & mangkir.</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-red-600">-Rp 50.000</span>
                    </div>
                  </div>
                )}

                {/* Daily Logs Table */}
                {config.showDailyLogs && (
                  <div className="mt-10">
                    <h4 className="font-bold text-sm uppercase tracking-wider border-b-2 border-slate-200 pb-3 mb-6">Rincian Absensi Harian</h4>
                    <table className="w-full text-sm text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-y border-slate-200">
                          <th className="py-3 px-4 font-semibold text-slate-600">Tanggal</th>
                          <th className="py-3 px-4 font-semibold text-slate-600">Masuk</th>
                          <th className="py-3 px-4 font-semibold text-slate-600">Keluar</th>
                          <th className="py-3 px-4 font-semibold text-slate-600">Status</th>
                          <th className="py-3 px-4 font-semibold text-slate-600 text-right">Telat (Mnt)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="py-3 px-4">Sen, 04 Mei 2026</td>
                          <td className="py-3 px-4">08:00</td>
                          <td className="py-3 px-4">17:00</td>
                          <td className="py-3 px-4 font-bold text-emerald-600">PRESENT</td>
                          <td className="py-3 px-4 text-right text-amber-600 font-bold">-</td>
                        </tr>
                        <tr className="border-b border-slate-100 bg-amber-50/30">
                          <td className="py-3 px-4">Sel, 05 Mei 2026</td>
                          <td className="py-3 px-4 text-amber-700">08:15</td>
                          <td className="py-3 px-4">17:00</td>
                          <td className="py-3 px-4 font-bold text-amber-600">LATE</td>
                          <td className="py-3 px-4 text-right text-amber-600 font-bold">15</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer Note */}
                {config.footerNote && (
                  <div className="mt-16 text-center text-xs text-slate-500 font-medium border-t border-dashed border-slate-200 pt-6 px-10">
                    {config.footerNote}
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AttendanceTemplateBuilder;
