import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const PrintableIDCard = ({ employee, company, config, isPreview = false, isBulk = false }) => {
  if (!employee) return null;

  const defaultTheme = '#1e40af';
  const themeColor = config?.primaryColor || defaultTheme;
  const isHorizontal = config?.orientation === 'horizontal';
  const design = config?.designTemplate || 'classic'; // classic | modern | minimalist
  const showQR = config?.showQR !== false;
  const showLogo = config?.showLogo !== false;

  const getGradientStyle = () => {
    if (config?.backgroundStyle === 'solid') return { backgroundColor: themeColor };
    return { background: `linear-gradient(135deg, ${themeColor} 0%, #000000 150%)` };
  };

  const wrapperClass = isBulk ? "inline-block" : `print-id-card-container flex items-center justify-center print:bg-white print:p-0 ${isPreview ? '' : 'p-8 min-h-screen bg-slate-100 print:min-h-0'}`;
  const cardBaseClass = "bg-white relative overflow-hidden flex border border-slate-200 print:border-none print:shadow-none mx-auto shadow-2xl";

  const renderLogo = (isDarkBg = true) => {
    if (!showLogo) return null;
    if (company?.appLogo) {
      return <img src={company.appLogo} alt="Logo" className="max-h-8 max-w-[90px] object-contain drop-shadow-md z-20 relative" />;
    }
    return <div className={`px-3 py-1 ${isDarkBg ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-800'} backdrop-blur-sm rounded-full border ${isDarkBg ? 'border-white/30' : 'border-slate-200'} flex items-center justify-center font-bold text-[8px] z-20 relative`}>LOGO</div>;
  };

  const renderPhoto = (sizeClass, borderStyle) => {
    return (
      <div className={`${sizeClass} ${borderStyle} overflow-hidden bg-slate-200 flex items-center justify-center flex-shrink-0 z-20 relative shadow-sm`}>
        {employee.facePhoto ? (
          <img src={employee.facePhoto} alt={employee.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl font-bold text-slate-400">
            {employee.name ? employee.name.charAt(0).toUpperCase() : '?'}
          </span>
        )}
      </div>
    );
  };

  if (isHorizontal) {
    // --- HORIZONTAL DESIGNS ---
    if (design === 'modern') {
      return (
        <div className={wrapperClass}>
          <div className={`${cardBaseClass} w-[86mm] h-[54mm] rounded-xl flex-row items-center p-0`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
            <div className="absolute top-0 right-0 w-3/4 h-full" style={{...getGradientStyle(), clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0% 100%)', opacity: 0.1}}></div>
            <div className="absolute top-0 right-0 w-2/3 h-full" style={{...getGradientStyle(), clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0% 100%)'}}></div>
            
            <div className="w-1/3 h-full pl-4 py-4 flex flex-col justify-center relative z-20">
               {renderPhoto("w-[22mm] h-[22mm] rounded-2xl shadow-xl", "border-4 border-white")}
               {showQR && (
                 <div className="mt-3 bg-white p-1 rounded-md shadow-sm self-start">
                   <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={32} level="H" />
                 </div>
               )}
            </div>

            <div className="w-2/3 h-full pr-6 py-4 flex flex-col items-end text-right relative z-20 text-white">
              <div className="mb-auto flex flex-col items-end">
                {renderLogo(true)}
                <h1 className="text-[9px] font-bold uppercase tracking-widest mt-1 opacity-90">{company?.companyName || 'COMPANY NAME'}</h1>
              </div>
              <div className="mt-auto flex flex-col items-end">
                <h2 className="text-sm font-black leading-tight uppercase tracking-tight">{employee.name}</h2>
                <p className="text-[10px] font-bold text-white/80 uppercase tracking-wider">{employee.position || 'STAFF'}</p>
                <div className="w-12 h-[2px] my-1 bg-white/40"></div>
                <p className="text-[9px] font-bold uppercase text-white/90">{employee.dept || 'UMUM'}</p>
                <p className="text-[8px] opacity-75 font-mono">{employee.id || employee.employeeCode}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    if (design === 'minimalist') {
      return (
        <div className={wrapperClass}>
          <div className={`${cardBaseClass} w-[86mm] h-[54mm] rounded-xl flex-col bg-white p-4 justify-between`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', borderTop: `8px solid ${themeColor}` }}>
            <div className="flex justify-between items-start w-full">
              <div className="flex items-center gap-4">
                {renderPhoto("w-[20mm] h-[20mm] rounded-xl", "border border-slate-200")}
                <div>
                  <h2 className="text-[13px] font-black text-slate-800 leading-tight uppercase tracking-tight">{employee.name}</h2>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider" style={{ color: themeColor }}>{employee.position || 'STAFF'}</p>
                  <p className="text-[8px] font-bold text-slate-700 uppercase mt-1">{employee.dept || 'UMUM'}</p>
                  <p className="text-[7px] text-slate-400 font-mono mt-0.5">{employee.id || employee.employeeCode}</p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                {renderLogo(false)}
                <h1 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-1">{company?.companyName || 'COMPANY NAME'}</h1>
              </div>
            </div>
            <div className="flex justify-between items-end w-full border-t border-slate-100 pt-2">
              <p className="text-[6px] text-slate-400 w-2/3 leading-tight">Property of {company?.companyName}. If found, please return to the HR Department.</p>
              {showQR && (
                 <div className="bg-white">
                   <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={28} level="H" />
                 </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (design === 'professional') {
      return (
        <div className={wrapperClass}>
          <div className={`${cardBaseClass} w-[86mm] h-[54mm] rounded-xl flex-row bg-white overflow-hidden border`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', borderColor: themeColor, borderWidth: '2px' }}>
            
            {/* Left Header Sidebar */}
            <div className="w-[22mm] h-full flex flex-col items-center justify-center text-white py-3 px-1" style={getGradientStyle()}>
               {renderLogo(true)}
               <div className="mt-auto mb-auto transform -rotate-90 origin-center whitespace-nowrap w-[40mm] text-center">
                 <h1 className="text-[7px] font-bold uppercase tracking-widest leading-tight">{company?.companyName || 'COMPANY NAME'}</h1>
               </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex py-3 px-3 gap-3 bg-white">
               <div className="flex flex-col items-center justify-center">
                 {renderPhoto("w-[22mm] h-[28mm] rounded-sm", "border border-slate-300 shadow-sm")}
               </div>
               
               <div className="flex-1 flex flex-col justify-center">
                 <h2 className="text-[13px] font-black text-slate-800 leading-tight uppercase tracking-tight">{employee.name}</h2>
                 <div className="self-start px-1.5 py-0.5 mt-0.5 text-[6px] font-bold uppercase tracking-wider text-white rounded-sm" style={{ backgroundColor: themeColor }}>
                    {employee.position || 'STAFF'}
                 </div>
                 
                 <div className="w-full border-t border-slate-200 my-1.5"></div>
                 
                 <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[6px] uppercase mt-0.5">
                   <div className="text-slate-400 font-bold">DEPT</div>
                   <div className="text-slate-800 font-bold">{employee.dept || 'UMUM'}</div>
                   <div className="text-slate-400 font-bold">ID</div>
                   <div className="text-slate-800 font-bold font-mono">{employee.id || employee.employeeCode}</div>
                 </div>
                 
                 <div className="mt-auto pt-1 flex justify-between items-end w-full">
                   <p className="text-[4px] text-slate-500 font-medium leading-tight max-w-[65%] mb-0.5">AUTHORIZED PERSONNEL ONLY.<br/>If found, please return to {company?.companyName}.</p>
                   {showQR && (
                     <div className="bg-white p-0.5 border border-slate-200">
                       <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={20} level="H" />
                     </div>
                   )}
                 </div>
               </div>
            </div>
          </div>
        </div>
      );
    }

    // Default Horizontal Classic
    return (
      <div className={wrapperClass}>
        <div className={`${cardBaseClass} w-[86mm] h-[54mm] rounded-xl flex-row`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <div className="w-1/3 h-full flex flex-col items-center py-4 text-center text-white" style={getGradientStyle()}>
            <div className="mb-2">{renderLogo(true)}</div>
            <h1 className="text-[8px] font-bold uppercase tracking-widest px-2 mb-auto leading-tight">{company?.companyName || 'COMPANY'}</h1>
            {showQR && (
              <div className="bg-white p-1 rounded-md shadow-sm mb-2 mt-2">
                <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={40} level="H" />
              </div>
            )}
          </div>
          <div className="w-2/3 h-full flex flex-col p-4 relative bg-slate-50">
            <div className="flex gap-4 items-center mb-3 relative z-10">
              {renderPhoto("w-[18mm] h-[18mm] rounded-full", `border-4 shadow-md bg-white border-[${themeColor}]`)}
              <div className="flex-1">
                <h2 className="text-[13px] font-black text-slate-800 leading-tight uppercase tracking-tight" style={{ color: themeColor }}>{employee.name}</h2>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{employee.position || 'STAFF'}</p>
                <div className="w-full h-[2px] my-1" style={{ backgroundColor: themeColor, opacity: 0.2 }}></div>
                <p className="text-[9px] font-bold text-slate-700 uppercase">{employee.dept || 'UMUM'}</p>
                <p className="text-[8px] text-slate-500 font-mono mt-0.5">{employee.id || employee.employeeCode}</p>
              </div>
            </div>
            <div className="mt-auto border-t border-slate-200 pt-2 relative z-10">
              <p className="text-[7px] text-slate-400 italic text-center leading-tight">Property of {company?.companyName}. If found, please return.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VERTICAL DESIGNS ---
  if (design === 'modern') {
    return (
      <div className={wrapperClass}>
        <div className={`${cardBaseClass} w-[54mm] h-[86mm] rounded-xl flex-col bg-slate-50`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <div className="absolute top-0 right-0 w-[150%] h-[50%]" style={{...getGradientStyle(), clipPath: 'polygon(0 0, 100% 0, 100% 80%, 0 100%)', transform: 'translateX(-10%)'}}></div>
          
          <div className="w-full flex justify-between items-start pt-4 px-4 z-20 text-white">
            <div className="w-full flex justify-center">
              {renderLogo(true)}
            </div>
          </div>
          
          <div className="relative mt-2 z-20 flex justify-center px-4">
            <div className="flex flex-col items-center">
               {renderPhoto("w-[26mm] h-[26mm] rounded-3xl", "border-4 border-white shadow-xl")}
               <div className="bg-white px-4 py-2 mt-4 rounded-xl shadow-md border border-slate-100 text-center w-[46mm]">
                 <h2 className="text-[12px] font-black text-slate-800 leading-tight uppercase tracking-tight" style={{ color: themeColor }}>{employee.name}</h2>
                 <p className="text-[8px] font-bold text-slate-500 mt-1 uppercase tracking-wider">{employee.position || 'STAFF'}</p>
               </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center mt-3 px-4 text-center z-20">
            <div className="w-8 h-[2px] mb-2 rounded-full" style={{ backgroundColor: themeColor }}></div>
            <p className="text-[9px] font-bold text-slate-700 uppercase">{employee.dept || 'UMUM'}</p>
            <p className="text-[8px] text-slate-500 font-mono">{employee.id || employee.employeeCode}</p>
          </div>

          <div className="w-full flex justify-between items-end p-4 z-20 mt-auto">
            {showQR && (
              <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={28} level="H" />
              </div>
            )}
            <div className="flex-1 pl-3 text-right">
              <h1 className="text-[8px] font-bold text-slate-800 uppercase tracking-widest">{company?.companyName || 'COMPANY'}</h1>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (design === 'minimalist') {
    return (
      <div className={wrapperClass}>
        <div className={`${cardBaseClass} w-[54mm] h-[86mm] rounded-xl flex-col bg-white border`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', borderColor: themeColor, borderWidth: '2px' }}>
          
          <div className="w-full flex flex-col items-center pt-5 pb-3">
             {renderLogo(false)}
             <h1 className="text-[7px] font-bold text-slate-600 uppercase tracking-widest mt-1.5">{company?.companyName || 'COMPANY NAME'}</h1>
          </div>

          <div className="w-full flex justify-center mb-4">
             {renderPhoto("w-[28mm] h-[28mm] rounded-xl", "border border-slate-100 shadow-sm")}
          </div>

          <div className="flex-1 flex flex-col items-center px-4 text-center">
            <h2 className="text-[14px] font-black text-slate-800 leading-tight uppercase tracking-tight">{employee.name}</h2>
            <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: themeColor }}>{employee.position || 'STAFF'}</p>
            
            <div className="w-full border-t border-dashed border-slate-200 my-3"></div>
            
            <p className="text-[8px] font-bold text-slate-700 uppercase">{employee.dept || 'UMUM'}</p>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">{employee.id || employee.employeeCode}</p>
          </div>

          {showQR && (
            <div className="w-full flex justify-center pb-5 pt-2">
              <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={36} level="H" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (design === 'professional') {
    return (
      <div className={wrapperClass}>
        <div className={`${cardBaseClass} w-[54mm] h-[86mm] rounded-xl flex-col bg-white border overflow-hidden`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', borderColor: themeColor, borderWidth: '2px' }}>
          
          {/* Header */}
          <div className="w-full h-[18mm] flex flex-col items-center justify-center text-white" style={getGradientStyle()}>
             {renderLogo(true)}
             <h1 className="text-[6px] font-bold uppercase tracking-widest mt-0.5 text-center px-1 leading-tight">{company?.companyName || 'COMPANY NAME'}</h1>
          </div>

          {/* Body */}
          <div className="flex-1 w-full flex flex-col items-center px-3 pt-3">
             {/* Photo (Standard 3x4 ratio) */}
             {renderPhoto("w-[24mm] h-[32mm] rounded-sm", "border border-slate-300 shadow-sm")}
             
             {/* Info */}
             <div className="w-full flex flex-col items-center mt-2 text-center">
                <h2 className="text-[12px] font-black text-slate-800 leading-tight uppercase tracking-tight">{employee.name}</h2>
                <div className="px-2 py-0.5 mt-1 text-[6.5px] font-bold uppercase tracking-wider text-white rounded-sm" style={{ backgroundColor: themeColor }}>
                  {employee.position || 'STAFF'}
                </div>
                
                <div className="w-full grid grid-cols-[1fr_1fr] gap-x-1.5 mt-2 text-[6px] uppercase border-t border-slate-200 pt-1.5">
                  <div className="text-right text-slate-500 font-bold border-r border-slate-200 pr-1.5">DEPT</div>
                  <div className="text-left text-slate-800 font-bold pl-1">{employee.dept || 'UMUM'}</div>
                  
                  <div className="text-right text-slate-500 font-bold border-r border-slate-200 pr-1.5 mt-0.5">EMP. ID</div>
                  <div className="text-left text-slate-800 font-bold font-mono pl-1 mt-0.5">{employee.id || employee.employeeCode}</div>
                </div>
             </div>
          </div>

          {/* Footer Grid */}
          <div className="w-full mt-auto flex items-end justify-between px-3 pb-2 pt-1">
             {showQR ? (
               <div className="bg-white p-0.5 border border-slate-200">
                 <QRCodeSVG value={employee.id || employee.employeeCode || 'UNKNOWN'} size={22} level="H" />
               </div>
             ) : <div className="w-[22px]"></div>}
             <div className="flex-1 pl-2 text-right">
                <p className="text-[4px] text-slate-500 font-medium leading-tight mb-0.5">AUTHORIZED PERSONNEL ONLY.<br/>If found, return to HR Dept.</p>
             </div>
          </div>

          {/* Bottom color line */}
          <div className="h-1.5 w-full" style={{ backgroundColor: themeColor }}></div>
        </div>
      </div>
    );
  }

  // Default Vertical Classic
  return (
    <div className={wrapperClass}>
      <div className={`${cardBaseClass} w-[54mm] h-[86mm] rounded-xl flex-col bg-white`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        <div className="h-[110px] w-full absolute top-0 left-0 rounded-b-[35%] flex flex-col items-center pt-4 shadow-inner" style={getGradientStyle()}>
          <div className="mb-1">{renderLogo(true)}</div>
          <h1 className="text-[9px] font-bold text-white uppercase tracking-widest text-center px-4 leading-tight drop-shadow-md">{company?.companyName || 'COMPANY NAME'}</h1>
        </div>
        <div className="relative mt-[75px] z-10 flex justify-center">
          {renderPhoto("w-24 h-24 rounded-full", "border-[4px] border-white shadow-xl")}
        </div>
        <div className="flex-1 flex flex-col items-center mt-2 px-3 text-center relative z-20">
          <h2 className="text-sm font-black text-slate-800 leading-tight mb-0.5 uppercase tracking-tight" style={{ color: themeColor }}>{employee.name}</h2>
          <p className="text-[9px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{employee.position || 'STAFF'}</p>
          <div className="w-full h-[2px] my-0.5" style={{ backgroundColor: themeColor, opacity: 0.2 }}></div>
          <p className="text-[9px] font-bold text-slate-700 uppercase mt-1">{employee.dept || 'UMUM'}</p>
          <p className="text-[8px] text-slate-500 font-mono mt-0.5">{employee.id || employee.employeeCode}</p>
        </div>
        <div className="bg-slate-50 p-1.5 w-full flex flex-col items-center border-t border-slate-100 mt-auto z-20 pb-2">
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
