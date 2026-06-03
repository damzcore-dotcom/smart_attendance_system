import React, { useState, useEffect } from 'react';
import { FileText, Save, Layout, Palette, CheckCircle2, Sliders, Type, Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SlipTemplateBuilder = ({ formData, handleInputChange }) => {
  const { t } = useTranslation();
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [config, setConfig] = useState({
    themeStyle: 'modern',
    showCompanyLogo: true,
    showAttendanceStats: true,
    hideZeroAllowances: true,
    showOvertimeDetails: true,
    watermarkText: 'CONFIDENTIAL',
    footerNote: 'Dokumen ini rahasia. Dilarang menyebarkan informasi gaji.',
  });

  useEffect(() => {
    if (formData.slipConfig) {
      try {
        setConfig(JSON.parse(formData.slipConfig));
      } catch (err) {
        console.error('Failed to parse slipConfig', err);
      }
    }
  }, [formData.slipConfig]);

  const updateConfig = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    handleInputChange('slipConfig', JSON.stringify(newConfig));
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
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">{t('settingsPage.slipBuilder.title')}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.slipBuilder.subtitle')}</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Theme Dropdown */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-2">
                  <Palette className="w-3 h-3" /> {t('settingsPage.slipBuilder.layoutTheme')}
                </label>
                <select
                  value={config.themeStyle}
                  onChange={(e) => updateConfig('themeStyle', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="modern">{t('settingsPage.slipBuilder.themeModern')}</option>
                  <option value="classic">{t('settingsPage.slipBuilder.themeClassic')}</option>
                  <option value="thermal">{t('settingsPage.slipBuilder.themeThermal')}</option>
                </select>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'showCompanyLogo', label: t('settingsPage.slipBuilder.toggleCompanyLogo'), desc: t('settingsPage.slipBuilder.descCompanyLogo') },
                  { key: 'showAttendanceStats', label: t('settingsPage.slipBuilder.toggleAttendanceStats'), desc: t('settingsPage.slipBuilder.descAttendanceStats') },
                  { key: 'hideZeroAllowances', label: t('settingsPage.slipBuilder.toggleHideZero'), desc: t('settingsPage.slipBuilder.descHideZero') },
                  { key: 'showOvertimeDetails', label: t('settingsPage.slipBuilder.toggleOvertime'), desc: t('settingsPage.slipBuilder.descOvertime') },
                ].map(toggle => (
                  <label key={toggle.key} className="flex items-start gap-3 p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="mt-0.5">
                      <input 
                        type="checkbox" 
                        checked={config[toggle.key]} 
                        onChange={(e) => updateConfig(toggle.key, e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
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
                  <Type className="w-3 h-3" /> {t('settingsPage.slipBuilder.watermarkLabel')}
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
                  <Hash className="w-3 h-3" /> {t('settingsPage.slipBuilder.footerLabel')}
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
                <Layout className="w-4 h-4" /> {t('settingsPage.slipBuilder.livePreview')}
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowFullPreview(true)}
                  className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-3 h-3" /> {t('settingsPage.slipBuilder.btnFullSize')}
                </button>
                <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1.5 rounded border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {t('settingsPage.slipBuilder.autoSync')}
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
                      <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 font-bold text-xs">{t('settingsPage.idCardBuilder.logoLabel')}</div>
                    )}
                    {config.themeStyle === 'modern' && (
                      <div>
                        <h1 className="font-bold text-lg leading-tight">{formData.companyName || t('settingsPage.general.companyName')}</h1>
                        <p className="text-xs text-slate-500">{formData.companyAddress || t('settingsPage.general.companyAddress')}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className={config.themeStyle !== 'modern' ? 'mt-4' : 'text-right'}>
                  <h2 className={`font-black tracking-tight ${config.themeStyle === 'thermal' ? 'text-xl uppercase' : 'text-2xl text-blue-800'}`}>{t('settingsPage.slipBuilder.previewSlipTitle')}</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.slipBuilder.previewPeriod')}</p>
                </div>
              </div>

              {/* Employee Info */}
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">{t('settingsPage.slipBuilder.previewEmpName')}</p>
                  <p className="font-bold">Adam Z.</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">{t('settingsPage.slipBuilder.previewDept')}</p>
                  <p className="font-bold">Engineering</p>
                </div>
              </div>

              {/* Attendance Stats */}
              {config.showAttendanceStats && (
                <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center text-xs">
                  <div className="text-center">
                    <p className="text-slate-500 font-medium">{t('settingsPage.slipBuilder.previewWorkingDays')}</p>
                    <p className="font-bold text-slate-800 text-sm">22</p>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-600 font-medium">{t('settingsPage.slipBuilder.previewPresent')}</p>
                    <p className="font-bold text-emerald-700 text-sm">20</p>
                  </div>
                  <div className="text-center">
                    <p className="text-red-500 font-medium">{t('settingsPage.slipBuilder.previewAbsent')}</p>
                    <p className="font-bold text-red-600 text-sm">2</p>
                  </div>
                  <div className="text-center">
                    <p className="text-amber-500 font-medium">{t('settingsPage.slipBuilder.previewLate')}</p>
                    <p className="font-bold text-amber-600 text-sm">15</p>
                  </div>
                </div>
              )}

              {/* Salary Details */}
              <div className="mt-8 flex gap-8">
                <div className="flex-1 space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider border-b border-slate-200 pb-2">{t('settingsPage.slipBuilder.previewIncome')}</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t('settingsPage.slipBuilder.previewBasicSalary')}</span>
                    <span className="font-bold">Rp 10.000.000</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t('settingsPage.slipBuilder.previewPositionAllowance')}</span>
                    <span className="font-bold">Rp 1.500.000</span>
                  </div>
                  {(!config.hideZeroAllowances) && (
                    <div className="flex justify-between text-sm text-slate-400">
                      <span>{t('settingsPage.slipBuilder.previewTransportAllowance')}</span>
                      <span>Rp 0</span>
                    </div>
                  )}
                  {config.showOvertimeDetails && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t('settingsPage.slipBuilder.previewOvertime')} <span className="text-[10px] text-blue-500 font-bold ml-1">(5 Jam)</span></span>
                      <span className="font-bold">Rp 433.000</span>
                    </div>
                  )}
                  {!config.showOvertimeDetails && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t('settingsPage.slipBuilder.previewOvertime')}</span>
                      <span className="font-bold">Rp 433.000</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider border-b border-slate-200 pb-2">{t('settingsPage.slipBuilder.previewDeductions')}</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t('settingsPage.slipBuilder.previewBpjs')}</span>
                    <span className="font-bold text-red-500">-Rp 100.000</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t('settingsPage.slipBuilder.previewLateDeduction')}</span>
                    <span className="font-bold text-red-500">-Rp 50.000</span>
                  </div>
                </div>
              </div>

              {/* Total Net */}
              <div className={`mt-8 p-4 rounded-xl flex justify-between items-center ${config.themeStyle === 'modern' ? 'bg-blue-600 text-white' : 'border-t-2 border-slate-800'}`}>
                <span className="font-bold uppercase tracking-wider text-sm">{t('settingsPage.slipBuilder.previewNetSalary')}</span>
                <span className="text-xl font-black">Rp 11.783.000</span>
              </div>

              {/* Footer Note */}
              {config.footerNote && (
                <div className="mt-8 text-center text-[10px] text-slate-500 border-t border-dashed border-slate-200 pt-4 px-8">
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
                <Layout className="w-5 h-5 text-blue-600" /> {t('settingsPage.slipBuilder.btnFullSize')}
              </h3>
              <button 
                onClick={() => setShowFullPreview(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              >
                &times;
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
                <div className={`flex items-center ${config.themeStyle === 'modern' ? 'justify-between' : 'justify-center flex-col text-center'} border-b-2 pb-6 ${config.themeStyle === 'modern' ? 'border-blue-600' : 'border-slate-300'}`}>
                  {config.showCompanyLogo && (
                    <div className="flex items-center gap-4 mb-2 md:mb-0">
                      {formData.appLogo ? (
                        <img src={formData.appLogo} alt="Logo" className="w-16 h-16 object-contain" />
                      ) : (
                        <div className="w-16 h-16 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm">{t('settingsPage.idCardBuilder.logoLabel')}</div>
                      )}
                      {config.themeStyle === 'modern' && (
                        <div>
                          <h1 className="font-black text-2xl leading-tight">{formData.companyName || t('settingsPage.general.companyName')}</h1>
                          <p className="text-sm text-slate-500 font-medium">{formData.companyAddress || t('settingsPage.general.companyAddress')}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className={config.themeStyle !== 'modern' ? 'mt-6' : 'text-right'}>
                    <h2 className={`font-black tracking-tight ${config.themeStyle === 'thermal' ? 'text-2xl uppercase' : 'text-3xl text-blue-800'}`}>{t('settingsPage.slipBuilder.previewSlipTitle')}</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-1">{t('settingsPage.slipBuilder.previewPeriod')}</p>
                  </div>
                </div>

                {/* Employee Info */}
                <div className="mt-8 grid grid-cols-2 gap-6 text-base">
                  <div>
                    <p className="text-slate-500 text-sm">{t('settingsPage.slipBuilder.previewEmpName')}</p>
                    <p className="font-bold text-lg">Adam Z.</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-sm">{t('settingsPage.slipBuilder.previewDept')}</p>
                    <p className="font-bold text-lg">Engineering</p>
                  </div>
                </div>

                {/* Attendance Stats */}
                {config.showAttendanceStats && (
                  <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 flex justify-between items-center text-sm">
                    <div className="text-center px-4">
                      <p className="text-slate-500 font-medium mb-1">{t('settingsPage.slipBuilder.previewWorkingDays')}</p>
                      <p className="font-bold text-slate-800 text-lg">22</p>
                    </div>
                    <div className="w-px h-8 bg-slate-200"></div>
                    <div className="text-center px-4">
                      <p className="text-emerald-600 font-medium mb-1">{t('settingsPage.slipBuilder.previewPresent')}</p>
                      <p className="font-bold text-emerald-700 text-lg">20</p>
                    </div>
                    <div className="w-px h-8 bg-slate-200"></div>
                    <div className="text-center px-4">
                      <p className="text-red-500 font-medium mb-1">{t('settingsPage.slipBuilder.previewAbsent')}</p>
                      <p className="font-bold text-red-600 text-lg">2</p>
                    </div>
                    <div className="w-px h-8 bg-slate-200"></div>
                    <div className="text-center px-4">
                      <p className="text-amber-500 font-medium mb-1">{t('settingsPage.slipBuilder.previewLate')}</p>
                      <p className="font-bold text-amber-600 text-lg">15</p>
                    </div>
                  </div>
                )}

                {/* Salary Details */}
                <div className="mt-10 flex gap-10">
                  <div className="flex-1 space-y-4">
                    <h4 className="font-bold text-sm uppercase tracking-wider border-b-2 border-slate-200 pb-3">{t('settingsPage.slipBuilder.previewIncome')}</h4>
                    <div className="flex justify-between text-base">
                      <span className="text-slate-600 font-medium">Gaji Pokok</span>
                      <span className="font-bold">Rp 10.000.000</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span className="text-slate-600 font-medium">Tunjangan Jabatan</span>
                      <span className="font-bold">Rp 1.500.000</span>
                    </div>
                    {(!config.hideZeroAllowances) && (
                      <div className="flex justify-between text-base text-slate-400">
                        <span className="font-medium">Tunjangan Transport</span>
                        <span>Rp 0</span>
                      </div>
                    )}
                    {config.showOvertimeDetails && (
                      <div className="flex justify-between text-base">
                        <span className="text-slate-600 font-medium">Lembur <span className="text-xs text-blue-500 font-bold ml-1">(5 Jam)</span></span>
                        <span className="font-bold">Rp 433.000</span>
                      </div>
                    )}
                    {!config.showOvertimeDetails && (
                      <div className="flex justify-between text-base">
                        <span className="text-slate-600 font-medium">Lembur</span>
                        <span className="font-bold">Rp 433.000</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-4">
                    <h4 className="font-bold text-sm uppercase tracking-wider border-b-2 border-slate-200 pb-3">{t('settingsPage.slipBuilder.previewDeductions')}</h4>
                    <div className="flex justify-between text-base">
                      <span className="text-slate-600 font-medium">BPJS Kesehatan</span>
                      <span className="font-bold text-red-500">-Rp 100.000</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span className="text-slate-600 font-medium">Potongan Absen/Telat</span>
                      <span className="font-bold text-red-500">-Rp 50.000</span>
                    </div>
                  </div>
                </div>

                {/* Total Net */}
                <div className={`mt-10 p-5 rounded-2xl flex justify-between items-center ${config.themeStyle === 'modern' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'border-t-4 border-slate-800'}`}>
                  <span className="font-bold uppercase tracking-wider text-base">{t('settingsPage.slipBuilder.previewNetSalary')}</span>
                  <span className="text-3xl font-black">Rp 11.783.000</span>
                </div>

                {/* Footer Note */}
                {config.footerNote && (
                  <div className="mt-12 text-center text-xs text-slate-500 font-medium border-t border-dashed border-slate-200 pt-6 px-10">
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

export default SlipTemplateBuilder;
