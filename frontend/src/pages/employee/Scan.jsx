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
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const mutation = useMutation({
    mutationFn: (mode) => attendanceAPI.checkIn(empId, mode),
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
    setIsScanning(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        mutation.mutate('Face ID');
      }
    }, 100);
  };

  return (
    <div className="h-screen bg-slate-900 flex flex-col text-white relative overflow-hidden">
      {/* Background Camera Mock */}
      <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
        <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800')] bg-cover bg-center opacity-40 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-transparent to-slate-900"></div>
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between">
        <button 
          onClick={() => navigate('/employee')}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Biometric Auth</span>
          <span className="font-bold text-sm">Face Recognition</span>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Scanner UI */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          {/* Scanning Frame */}
          <div className="absolute inset-0 border-2 border-white/20 rounded-[3rem]"></div>
          
          {/* Corner accents */}
          <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-[3rem]"></div>
          <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-[3rem]"></div>
          <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-[3rem]"></div>
          <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-[3rem]"></div>

          {/* Scanning Bar */}
          {isScanning && (
            <div 
              className="absolute left-0 right-0 h-1 bg-primary shadow-[0_0_15px_rgba(0,108,73,0.8)] z-20"
              style={{ top: `${scanProgress}%` }}
            ></div>
          )}

          {/* Icon/Status */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {mutation.isPending ? (
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            ) : isScanning ? (
              <div className="text-center">
                <p className="text-primary font-black text-2xl mb-1">{scanProgress}%</p>
                <p className="text-xs font-bold uppercase tracking-wider text-white/60">Analyzing...</p>
              </div>
            ) : (
              <ScanIcon className="w-16 h-16 text-white/20" />
            )}
          </div>
        </div>

        <div className="mt-12 text-center max-w-xs">
          <h3 className="text-xl font-bold mb-2">
            {isScanning ? 'Hold Steady' : 'Ready to Scan'}
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Position your face within the frame. Ensure good lighting for better accuracy.
          </p>
        </div>
      </div>

      {/* Footer Action */}
      <div className="relative z-10 p-8 pb-12">
        {!isScanning ? (
          <button 
            onClick={startScan}
            className="w-full btn-primary py-4 rounded-2xl font-bold text-lg shadow-xl shadow-primary/25 active:scale-95 transition-transform flex items-center justify-center gap-3"
          >
            <Camera className="w-5 h-5" />
            Start Face Scan
          </button>
        ) : (
          <div className="flex gap-4">
            <button 
              onClick={() => { setIsScanning(false); setScanProgress(0); }}
              className="flex-1 bg-white/10 py-4 rounded-2xl font-bold backdrop-blur-md flex items-center justify-center gap-2"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          End-to-End Encrypted Biometrics
        </div>
      </div>
    </div>
  );
};

export default Scan;
