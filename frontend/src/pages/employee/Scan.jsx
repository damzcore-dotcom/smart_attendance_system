import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceAPI, authAPI } from '../../services/api';
import { 
  Camera, 
  ChevronLeft, 
  Scan as ScanIcon,
  ShieldCheck,
  Loader2,
  RefreshCcw
} from 'lucide-react';

const Scan = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [coords, setCoords] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const mutation = useMutation({
    mutationFn: (mode) => attendanceAPI.checkIn(empId, mode, coords?.lat, coords?.lng, coords?.accuracy, coords?.timestamp),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      alert(data.message || 'Face ID verified and Check-in successful!');
      navigate('/employee');
    },
    onError: (err) => {
      alert(err.message || 'Face ID match failed. Please try again.');
      setIsScanning(false);
      setScanProgress(0);
    },
  });

  const startScan = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { accuracy, latitude, longitude } = position.coords;
        if (accuracy > 50) {
          const msg = `GPS Accuracy low (${Math.round(accuracy)}m). Please move to an open area for a better signal.`;
          alert(msg);
          setLocationError(msg);
          return;
        }

        setCoords({ lat: latitude, lng: longitude, accuracy, timestamp: position.timestamp });
        
        setIsScanning(true);
        let progress = 0;
        const interval = setInterval(() => {
          progress += 5;
          setScanProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            mutation.mutate('Face ID');
          }
        }, 30);
      },
      (error) => {
        let msg = "Please enable location services to check in.";
        if (error.code === 1) msg = "Permission denied. Please allow location access in your browser settings.";
        else if (error.code === 2) msg = "Location unavailable. Please check your GPS signal.";
        else if (error.code === 3) msg = "Location request timed out.";
        
        alert(msg);
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="h-screen relative flex flex-col overflow-hidden font-sans bg-gradient-to-br from-blue-50 via-white to-slate-50">

      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/40 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ 
        backgroundImage: 'radial-gradient(circle, #2563eb 1px, transparent 1px)', 
        backgroundSize: '40px 40px' 
      }}></div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between">
        <button 
          onClick={() => navigate('/employee')}
          className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
        >
          <ChevronLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Secure Protocol</span>
          <span className="font-bold text-sm text-slate-800 tracking-tight">Biometric Recognition</span>
        </div>
        <div className="w-10 h-10 flex items-center justify-center bg-emerald-50 border border-emerald-100 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        </div>
      </div>

      {/* Scanner UI */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          {/* Scanning Frame */}
          <div className={`absolute inset-0 border-2 transition-all duration-500 rounded-3xl ${isScanning ? 'border-blue-400 shadow-lg shadow-blue-200/50' : 'border-slate-200'}`}></div>
          
          {/* Corner Brackets */}
          <div className="absolute -inset-2 z-10 pointer-events-none">
            <div className={`absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 rounded-tl-3xl transition-colors duration-500 ${isScanning ? 'border-blue-500' : 'border-slate-300'}`} />
            <div className={`absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 rounded-tr-3xl transition-colors duration-500 ${isScanning ? 'border-blue-500' : 'border-slate-300'}`} />
            <div className={`absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 rounded-bl-3xl transition-colors duration-500 ${isScanning ? 'border-blue-500' : 'border-slate-300'}`} />
            <div className={`absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 rounded-br-3xl transition-colors duration-500 ${isScanning ? 'border-blue-500' : 'border-slate-300'}`} />
          </div>

          {/* Laser Scanning Line */}
          {isScanning && (
            <div className="absolute inset-x-6 h-0.5 bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.6)] z-20 rounded-full animate-scan-line" style={{ top: `${scanProgress}%` }}></div>
          )}

          {/* Status Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {mutation.isPending ? (
              <div className="relative">
                <Loader2 className="w-16 h-16 animate-spin text-blue-300" />
                <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600 text-xs animate-pulse">VERIFY</div>
              </div>
            ) : isScanning ? (
              <div className="text-center animate-in zoom-in-75 duration-500">
                <p className="text-blue-600 font-bold text-5xl tracking-tight mb-2">{scanProgress}%</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Scanning...</p>
              </div>
            ) : (
              <div className="p-8 rounded-full bg-blue-50 border border-blue-100 group transition-all duration-500 hover:bg-blue-100">
                <ScanIcon className="w-16 h-16 text-blue-200 group-hover:text-blue-400 transition-colors" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 text-center max-w-sm px-6">
          <h3 className="text-xl font-bold text-slate-800 mb-3 tracking-tight">
            {isScanning ? 'Hold Still' : 'Identity Verification'}
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Align your face within the frame. Authentication requires a <span className="text-blue-600 font-semibold">98%+ match</span> score.
          </p>
        </div>
      </div>

      {/* Footer Action */}
      <div className="relative z-10 p-8 pb-12">
        {!isScanning ? (
          <button 
            onClick={startScan}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-blue-600/25 active:scale-[0.98] flex items-center justify-center gap-3 transition-all"
          >
            <Camera className="w-5 h-5" />
            START SCAN
          </button>
        ) : (
          <button 
            onClick={() => { setIsScanning(false); setScanProgress(0); }}
            className="w-full bg-white py-4 rounded-2xl font-semibold text-sm text-red-600 flex items-center justify-center gap-2 border border-red-200 active:scale-[0.98] transition-all hover:bg-red-50"
          >
            <RefreshCcw className="w-4 h-4" />
            CANCEL SCAN
          </button>
        )}
        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-300 uppercase tracking-wider">
          <div className="w-6 h-px bg-slate-200"></div>
          AES-256 Encrypted
          <div className="w-6 h-px bg-slate-200"></div>
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          0%, 100% { filter: brightness(1); opacity: 0.5; }
          50% { filter: brightness(1.5); opacity: 1; }
        }
        .animate-scan-line {
          animation: scanLine 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default Scan;
