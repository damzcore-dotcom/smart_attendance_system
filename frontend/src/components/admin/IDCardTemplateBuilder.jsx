import React, { useState, useEffect } from 'react';
import { Settings2, Palette, Layout, QrCode, Image as ImageIcon } from 'lucide-react';
import PrintableIDCard from './PrintableIDCard';

const IDCardTemplateBuilder = ({ formData, handleInputChange }) => {
  const [config, setConfig] = useState({
    primaryColor: '#1e40af',
    orientation: 'vertical',
    backgroundStyle: 'gradient',
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
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">ID Card Template Builder</h2>
          <p className="text-xs text-slate-500 font-medium">Customize the appearance of employee ID cards</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: Configuration Panel */}
        <div className="w-full lg:w-1/2 space-y-6">
          
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-4 h-4 text-blue-500" /> Theme & Layout
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Primary Color</label>
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
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Orientation</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateConfig('orientation', 'vertical')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.orientation === 'vertical' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Vertical
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('orientation', 'horizontal')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.orientation === 'horizontal' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Horizontal
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Background Style</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateConfig('backgroundStyle', 'gradient')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.backgroundStyle === 'gradient' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Gradient
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('backgroundStyle', 'solid')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${config.backgroundStyle === 'solid' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Solid
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Layout className="w-4 h-4 text-emerald-500" /> Elements
            </h3>
            
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">QR Code</p>
                    <p className="text-[10px] text-slate-500">Show employee QR code on card</p>
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
                    <p className="text-sm font-bold text-slate-700">Company Logo</p>
                    <p className="text-[10px] text-slate-500">Show company logo in header</p>
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
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Live Preview</span>
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
