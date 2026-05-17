import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const PrintableIDCard = ({ employee, company, config, isPreview = false }) => {
  if (!employee) return null;

  const defaultTheme = '#1e40af'; // blue-800
  const themeColor = config?.primaryColor || defaultTheme;
  const isHorizontal = config?.orientation === 'horizontal';
  const showQR = config?.showQR !== false;
  const showLogo = config?.showLogo !== false;

  const getGradientStyle = () => {
    if (config?.backgroundStyle === 'solid') return { backgroundColor: themeColor };
    return { background: `linear-gradient(135deg, ${themeColor} 0%, #000000 150%)` };
  };

  if (isHorizontal) {
    return (
      <div className={`print-id-card-container flex items-center justify-center print:bg-white print:p-0 ${isPreview ? '' : 'p-8 min-h-screen bg-slate-100 print:min-h-0'}`}>
        <div className="w-[86mm] h-[54mm] bg-white rounded-xl shadow-2xl relative overflow-hidden flex border border-slate-200 print:border-none print:shadow-none mx-auto" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          
          {/* Left Sidebar (Theme) */}
          <div className="w-1/3 h-full flex flex-col items-center py-4 text-center text-white" style={getGradientStyle()}>
            {showLogo && (
              <div className="mb-2">
                {company?.appLogo ? (
                  <img src={company.appLogo} alt="Logo" className="max-h-12 max-w-[80px] object-contain drop-shadow-sm" />
                ) : (
                  <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 flex items-center justify-center text-white font-bold text-[8px]">LOGO</div>
                )}
              </div>
            )}
            <h1 className="text-[10px] font-bold uppercase tracking-widest px-2 mb-auto leading-tight">{company?.companyName || 'COMPANY NAME'}</h1>
            
            {showQR && (
              <div className="bg-white p-1 rounded-md shadow-sm mb-2 mt-2">
                <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={45} level="H" />
              </div>
            )}
          </div>

          {/* Right Content */}
          <div className="w-2/3 h-full flex flex-col p-4 relative bg-slate-50">
            {/* Removed Watermark */}

            <div className="flex gap-4 items-center mb-3 relative z-10">
              <div className="w-20 h-20 rounded-full border-4 shadow-md overflow-hidden bg-white flex items-center justify-center flex-shrink-0" style={{ borderColor: themeColor }}>
                {employee.facePhoto ? (
                  <img src={employee.facePhoto} alt={employee.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-slate-400">
                    {employee.name ? employee.name.charAt(0).toUpperCase() : '?'}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-base font-black text-slate-800 leading-tight uppercase tracking-tight" style={{ color: themeColor }}>{employee.name}</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{employee.position || 'STAFF'}</p>
                <div className="w-full h-[2px] my-1" style={{ backgroundColor: themeColor, opacity: 0.2 }}></div>
                <p className="text-[10px] font-bold text-slate-700 uppercase">{employee.dept || 'UMUM'}</p>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">{employee.id || employee.employeeCode}</p>
              </div>
            </div>
            
            <div className="mt-auto border-t border-slate-200 pt-2 relative z-10">
              <p className="text-[7px] text-slate-400 italic text-center leading-tight">Property of {company?.companyName}. If found, please return to the HR Department.</p>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Vertical Template
  return (
    <div className={`print-id-card-container flex items-center justify-center print:bg-white print:p-0 ${isPreview ? '' : 'p-8 min-h-screen bg-slate-100 print:min-h-0'}`}>
      <div className="w-[54mm] h-[86mm] bg-white rounded-xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 print:border-none print:shadow-none mx-auto" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        
        {/* Header Background */}
        <div className="h-[110px] w-full absolute top-0 left-0 rounded-b-[35%] flex flex-col items-center pt-4 shadow-inner" style={getGradientStyle()}>
          {showLogo && (
            company?.appLogo ? (
              <img src={company.appLogo} alt="Logo" className="max-h-8 max-w-[90px] object-contain drop-shadow-md mb-1" />
            ) : (
              <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 flex items-center justify-center text-white font-bold text-[8px] mb-1">LOGO</div>
            )
          )}
          <h1 className="text-[9px] font-bold text-white uppercase tracking-widest text-center px-4 leading-tight drop-shadow-md">{company?.companyName || 'COMPANY NAME'}</h1>
        </div>

        {/* Photo Container */}
        <div className="relative mt-[75px] z-10 flex justify-center">
          <div className="w-24 h-24 rounded-full border-[4px] border-white shadow-xl overflow-hidden bg-slate-200 flex items-center justify-center">
            {employee.facePhoto ? (
              <img src={employee.facePhoto} alt={employee.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-slate-400">
                {employee.name ? employee.name.charAt(0).toUpperCase() : '?'}
              </span>
            )}
          </div>
        </div>

        {/* Employee Info */}
        <div className="flex-1 flex flex-col items-center mt-2 px-3 text-center relative">
          {/* Removed Watermark */}

          <h2 className="text-sm font-black text-slate-800 leading-tight mb-0.5 uppercase tracking-tight relative z-10" style={{ color: themeColor }}>{employee.name}</h2>
          <p className="text-[9px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider relative z-10">{employee.position || 'STAFF'}</p>
          
          <div className="w-full h-[2px] my-0.5 relative z-10" style={{ backgroundColor: themeColor, opacity: 0.2 }}></div>
          
          <p className="text-[9px] font-bold text-slate-700 uppercase relative z-10 mt-1">{employee.dept || 'UMUM'}</p>
          <p className="text-[8px] text-slate-500 font-mono mt-0.5 relative z-10">{employee.id || employee.employeeCode}</p>
        </div>

        {/* QR Code footer */}
        <div className="bg-slate-50 p-1.5 w-full flex flex-col items-center border-t border-slate-100 mt-auto relative z-10 pb-2">
          {showQR && (
            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm mb-1">
              <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={32} level="H" />
            </div>
          )}
          <p className="text-[6px] text-slate-400 italic text-center px-2 leading-tight">Property of {company?.companyName}. If found, please return.</p>
        </div>

      </div>
    </div>
  );
};

export default PrintableIDCard;
