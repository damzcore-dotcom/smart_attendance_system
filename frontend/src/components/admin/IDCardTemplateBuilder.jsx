import React, { useState, useEffect } from 'react';
import { Settings2, Palette, Layout, QrCode, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PrintableIDCard from './PrintableIDCard';

const IDCardTemplateBuilder = ({ formData, handleInputChange }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState({
    primaryColor: '#1e40af',
    orientation: 'vertical',
    backgroundStyle: 'gradient',
    designTemplate: 'classic',
    showQR: true,
    showLogo: true
  });

  // Load initial config from formData
  useEffect(() => {
    if (formData.idCardConfig) {
      try {
        setConfig(JSON.parse(formData.idCardConfig));
      } catch (err) {
        console.error('Failed to parse idCardConfig', err);
      }
    }
  }, [formData.idCardConfig]);

  // Update formData when config changes
  const updateConfig = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    handleInputChange('idCardConfig', JSON.stringify(newConfig));
  };

  const demoEmployee = {
    employeeCode: 'EMP-001',
    id: 'EMP-001',
    name: 'JOHN DOE',
    position: 'SOFTWARE ENGINEER',
    dept: 'IT DEPARTMENT',
    facePhoto: ''
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">{t('settingsPage.idCardBuilder.title')}</h2>
          <p className="text-xs text-slate-500 font-medium">{t('settingsPage.idCardBuilder.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: Configuration Panel */}
        <div className="w-full lg:w-1/2 space-y-6">
          
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-4 h-4 text-blue-500" /> {t('settingsPage.idCardBuilder.presetsLabel')}
            </h3>
            
            <div className="space-y-6">
              {/* Quick Themes */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 block">{t('settingsPage.idCardBuilder.presetsLabel')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { name: 'Corporate', color: '#1e40af', style: 'gradient', bgClass: 'bg-blue-800' },
                    { name: 'Midnight', color: '#0f172a', style: 'solid', bgClass: 'bg-slate-900' },
                    { name: 'Ruby', color: '#9f1239', style: 'gradient', bgClass: 'bg-rose-800' },
                    { name: 'Emerald', color: '#065f46', style: 'gradient', bgClass: 'bg-emerald-800' }
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        updateConfig('primaryColor', preset.color);
                        updateConfig('backgroundStyle', preset.style);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                        config.primaryColor === preset.color 
                          ? 'border-blue-500 bg-blue-50 shadow-sm' 
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${preset.bgClass} shadow-inner`}></div>
                      <span className="text-[9px] font-bold text-slate-600 uppercase">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px w-full bg-slate-200"></div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">{t('settingsPage.idCardBuilder.colorLabel')}</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={config.primaryColor}
                    onChange={(e) => updateConfig('primaryColor', e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <input 
                    type="text" 
                    value={config.primaryColor}
                    onChange={(e) => updateConfig('primaryColor', e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono text-slate-700 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">{t('settingsPage.idCardBuilder.orientationLabel')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateConfig('orientation', 'vertical')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.orientation === 'vertical' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.orientationVertical')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('orientation', 'horizontal')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.orientation === 'horizontal' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.orientationHorizontal')}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">{t('settingsPage.idCardBuilder.layoutDesignLabel')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateConfig('designTemplate', 'classic')}
                    className={`py-2 px-2 rounded-xl text-[10px] font-bold tracking-wider uppercase border transition-all ${config.designTemplate === 'classic' || !config.designTemplate ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.layoutClassic')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('designTemplate', 'modern')}
                    className={`py-2 px-2 rounded-xl text-[10px] font-bold tracking-wider uppercase border transition-all ${config.designTemplate === 'modern' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.layoutModern')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('designTemplate', 'minimalist')}
                    className={`py-2 px-2 rounded-xl text-[10px] font-bold tracking-wider uppercase border transition-all ${config.designTemplate === 'minimalist' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.layoutMinimalist')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('designTemplate', 'professional')}
                    className={`py-2 px-2 rounded-xl text-[10px] font-bold tracking-wider uppercase border transition-all ${config.designTemplate === 'professional' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.layoutProfessional')}
                  </button>
                </div>
                
                <div className="mt-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                  <p className="text-[9.5px] text-slate-600 leading-relaxed font-medium">
                    {(!config.designTemplate || config.designTemplate === 'classic') && <><strong className="text-blue-700">{t('settingsPage.idCardBuilder.layoutClassic')}:</strong> {t('settingsPage.idCardBuilder.descClassic')}</>}
                    {config.designTemplate === 'modern' && <><strong className="text-blue-700">{t('settingsPage.idCardBuilder.layoutModern')}:</strong> {t('settingsPage.idCardBuilder.descModern')}</>}
                    {config.designTemplate === 'minimalist' && <><strong className="text-blue-700">{t('settingsPage.idCardBuilder.layoutMinimalist')}:</strong> {t('settingsPage.idCardBuilder.descMinimalist')}</>}
                    {config.designTemplate === 'professional' && <><strong className="text-blue-700">{t('settingsPage.idCardBuilder.layoutProfessional')}:</strong> {t('settingsPage.idCardBuilder.descProfessional')}</>}
                  </p>
                </div>
              </div>
              
              <div className="h-px w-full bg-slate-200"></div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">{t('settingsPage.idCardBuilder.bgFillLabel')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateConfig('backgroundStyle', 'gradient')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.backgroundStyle === 'gradient' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.bgGradient')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('backgroundStyle', 'solid')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.backgroundStyle === 'solid' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {t('settingsPage.idCardBuilder.bgSolid')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Layout className="w-4 h-4 text-emerald-500" /> {t('settingsPage.idCardBuilder.elementsTitle')}
            </h3>
            
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-300 transition-colors" onClick={(e) => { e.preventDefault(); updateConfig('showQR', !config.showQR); }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{t('settingsPage.idCardBuilder.toggleQrCode')}</p>
                    <p className="text-[10px] text-slate-500">{t('settingsPage.idCardBuilder.descQrCode')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig('showQR', !config.showQR)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${config.showQR ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${config.showQR ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>

              <label className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-300 transition-colors" onClick={(e) => { e.preventDefault(); updateConfig('showLogo', !config.showLogo); }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{t('settingsPage.idCardBuilder.toggleCompanyLogo')}</p>
                    <p className="text-[10px] text-slate-500">{t('settingsPage.idCardBuilder.descCompanyLogo')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig('showLogo', !config.showLogo)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${config.showLogo ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${config.showLogo ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>
          </div>

        </div>

        {/* Right: Live Preview */}
        <div className="w-full lg:w-1/2 bg-slate-100/50 rounded-3xl p-8 flex flex-col items-center justify-center relative border-2 border-dashed border-slate-200 min-h-[500px]">
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-200">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t('settingsPage.idCardBuilder.livePreview')}</span>
          </div>

          <div className="transform scale-[0.85] sm:scale-100 origin-center transition-all duration-300 drop-shadow-2xl">
             <PrintableIDCard employee={demoEmployee} company={formData} config={config} isPreview={true} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default IDCardTemplateBuilder;
