import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import { settingsAPI } from '../services/api';

const LicenseFooter = () => {
  const [license, setLicense] = useState(null);

  useEffect(() => {
    settingsAPI.getLicenseInfo?.()
      .then(res => { if (res?.data) setLicense(res.data); })
      .catch(() => {});
  }, []);

  if (!license) return null;

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return dateStr; }
  };

  // Calculate days remaining
  const daysLeft = license.expiry ? Math.ceil((new Date(license.expiry) - new Date()) / (1000*60*60*24)) : 0;
  const isWarning = daysLeft > 0 && daysLeft <= 30;

  return (
    <div className={`flex items-center justify-center gap-2 py-2 px-4 text-[11px] font-medium select-none ${
      !license.valid || license.expired 
        ? 'bg-red-50 text-red-600 border-t border-red-100' 
        : isWarning 
          ? 'bg-amber-50 text-amber-700 border-t border-amber-100' 
          : 'bg-slate-50 text-slate-400 border-t border-slate-100'
    }`}>
      {!license.valid || license.expired ? (
        <>
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Lisensi {license.expired ? `kedaluwarsa (${formatDate(license.expiry)})` : license.message || 'tidak valid'} — Hubungi vendor</span>
        </>
      ) : isWarning ? (
        <>
          <Clock className="w-3.5 h-3.5" />
          <span>Lisensi aktif sampai {formatDate(license.expiry)} ({daysLeft} hari lagi) — Segera perpanjang</span>
        </>
      ) : (
        <>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Lisensi aktif sampai {formatDate(license.expiry)}</span>
        </>
      )}
    </div>
  );
};

export default LicenseFooter;
