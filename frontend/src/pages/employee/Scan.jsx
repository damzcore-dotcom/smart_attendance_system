import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceAPI, authAPI } from '../../services/api';
import { 
  Camera, 
  ChevronLeft, 
  ShieldCheck,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  ScanFace
} from 'lucide-react';
import { verifyRealLocation } from '../../utils/geoUtils';
import Webcam from 'react-webcam';
import { loadFaceModels, faceapi, areModelsLoaded } from '../../utils/faceModelLoader';

const Scan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isCheckOut = searchParams.get('mode') === 'check-out';

  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('ready'); // ready, detecting, verifying, success, error
  const [error, setError] = useState(null);
  
  const [coords, setCoords] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Face guide logic
  const [faceGuideStatus, setFaceGuideStatus] = useState('none'); // none, detected, not-detected
  const webcamRef = useRef(null);
  const faceGuideRef = useRef(null);
  const stableCountRef = useRef(0);
  const autoCaptureTriggeredRef = useRef(false);

  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  // Load models on mount
  useEffect(() => {
    loadFaceModels().then(() => setModelsLoaded(true)).catch(err => {
      console.error('Failed to load face models', err);
      setError('Gagal memuat model pendeteksi wajah. Coba muat ulang halaman.');
    });
  }, []);

  const mutation = useMutation({
    mutationFn: () => {
      if (isCheckOut) {
        return attendanceAPI.checkOut(empId);
      } else {
        return attendanceAPI.checkIn(empId, 'Face ID', coords?.lat, coords?.lng, coords?.accuracy, coords?.timestamp);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      setScanStatus('success');
      setTimeout(() => {
        alert(data.message || 'Verification successful!');
        navigate('/employee');
      }, 1000);
    },
    onError: (err) => {
      alert(err.message || 'Operation failed. Please try again.');
      setScanStatus('error');
      setError(err.message || 'Gagal memproses kehadiran.');
    },
  });

  const doVerify = async (descriptorArray) => {
    setScanStatus('verifying');
    try {
      const result = await authAPI.verifyFace(descriptorArray);
      if (result.success) {
        // Validate that the detected face actually belongs to the logged-in employee
        if (result.user.employee.id === empId) {
          mutation.mutate();
        } else {
          setScanStatus('error');
          setError('Wajah tidak cocok dengan akun Anda! (Dikenali sebagai: ' + result.user.employee.name + ')');
        }
      } else {
        setScanStatus('error');
        setError(result.message || 'Wajah tidak dikenali dalam sistem.');
      }
    } catch (err) {
      console.error('Face verification error:', err);
      setScanStatus('error');
      setError(err.message || 'Terjadi kesalahan saat memverifikasi wajah.');
    }
  };

  const capture = useCallback(async () => {
    if (!webcamRef.current || !areModelsLoaded()) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setScanStatus('detecting');
      setError(null);
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.src = imageSrc;
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Failed to load image'));
        });

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.15 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (detection) {
          doVerify(Array.from(detection.descriptor));
        } else {
          setScanStatus('error');
          setError('Wajah tidak terdeteksi dengan jelas. Pastikan posisi wajah di tengah frame.');
        }
      } catch (err) {
        console.error('Face capture error:', err);
        setScanStatus('error');
        setError(err.message || 'Gagal memindai wajah.');
      }
    } else {
      setError('Kamera belum siap. Mohon tunggu sebentar.');
    }
  }, [webcamRef, areModelsLoaded, empId]);

  // Real-time face guide loop
  useEffect(() => {
    if (!isScanning || !modelsLoaded || scanStatus !== 'ready') {
      if (faceGuideRef.current) clearInterval(faceGuideRef.current);
      faceGuideRef.current = null;
      return;
    }

    autoCaptureTriggeredRef.current = false;
    stableCountRef.current = 0;
    let isProcessing = false;

    faceGuideRef.current = setInterval(async () => {
      if (isProcessing || !webcamRef.current || autoCaptureTriggeredRef.current) return;
      isProcessing = true;
      try {
        const screenshot = webcamRef.current.getScreenshot();
        if (!screenshot) { isProcessing = false; return; }

        const img = new Image();
        img.src = screenshot;
        await new Promise(resolve => img.onload = resolve);

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.2 }));
        
        if (detection) {
          setFaceGuideStatus('detected');
          stableCountRef.current++;
          if (stableCountRef.current >= 5 && !autoCaptureTriggeredRef.current) {
            autoCaptureTriggeredRef.current = true;
            clearInterval(faceGuideRef.current);
            faceGuideRef.current = null;
            capture();
          }
        } else {
          setFaceGuideStatus('not-detected');
          stableCountRef.current = 0;
        }
      } catch {
        // silently ignore face guide errors
      } finally {
        isProcessing = false;
      }
    }, 150);

    return () => {
      if (faceGuideRef.current) clearInterval(faceGuideRef.current);
    };
  }, [isScanning, modelsLoaded, scanStatus, capture]);

  const startScan = () => {
    if (isCheckOut) {
      // For checkout, we optionally skip GPS check if not required, but let's just do it for consistency 
      // or we can bypass location requirement if it was inside checkOut logic earlier.
      // Wait, earlier the user could checkout anywhere? Let's check location anyway so coordinates can be used if backend wants.
    }
    setError(null);
    setIsScanning(true);
    setScanStatus('ready');
    
    // Check location for both
    verifyRealLocation(
      (position) => {
        const { accuracy, latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude, accuracy, timestamp: position.timestamp });
      },
      (error) => {
        // We log it but if it fails we show error. Note: CheckOut may not strictly require GPS but it's safe to enforce.
        alert(error.message);
        setError(error.message);
        setIsScanning(false);
      }
    );
  };

  const closeScan = () => {
    if (faceGuideRef.current) clearInterval(faceGuideRef.current);
    setIsScanning(false);
    setScanStatus('ready');
    setError(null);
    setFaceGuideStatus('none');
    stableCountRef.current = 0;
    autoCaptureTriggeredRef.current = false;
  };

  const resetScan = () => {
    setScanStatus('ready');
    setError(null);
    stableCountRef.current = 0;
    autoCaptureTriggeredRef.current = false;
  };

  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden font-sans bg-slate-50">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/40 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

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
          <span className="font-bold text-sm text-slate-800 tracking-tight">Biometric {isCheckOut ? 'Check-Out' : 'Check-In'}</span>
        </div>
        <div className="w-10 h-10 flex items-center justify-center bg-emerald-50 border border-emerald-100 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        </div>
      </div>

      {/* Scanner UI */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm aspect-[3/4] relative rounded-3xl overflow-hidden bg-slate-900 shadow-2xl ring-4 ring-white/50">
          
          {isScanning ? (
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={{ facingMode: "user", width: 640, height: 480, frameRate: 30 }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/50 backdrop-blur-sm">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border border-slate-200 mb-4 animate-bounce">
                <ScanFace className="w-10 h-10 text-blue-600" />
              </div>
              <p className="font-semibold text-slate-700">Kamera Siap</p>
              <p className="text-xs text-slate-500 mt-1">Tekan tombol Start Scan</p>
            </div>
          )}

          {/* Scanning Frame Guides */}
          {isScanning && (
            <>
              {/* Dark Overlay around face area */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.6) 75%)'
              }}></div>
              
              {/* Center Target Bracket */}
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 rounded-3xl transition-colors duration-500 pointer-events-none ${
                scanStatus === 'success' ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' :
                scanStatus === 'error' ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' :
                faceGuideStatus === 'detected' ? 'border-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.3)]' : 'border-white/30'
              }`}></div>
            </>
          )}

          {/* Status Overlay */}
          {isScanning && scanStatus !== 'ready' && (
             <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-20">
               {scanStatus === 'detecting' && (
                 <>
                   <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                   <p className="text-white font-semibold">Menganalisis Wajah...</p>
                 </>
               )}
               {scanStatus === 'verifying' && (
                 <>
                   <Loader2 className="w-12 h-12 text-amber-400 animate-spin mb-4" />
                   <p className="text-white font-semibold tracking-wider">Verifikasi Biometrik...</p>
                 </>
               )}
               {scanStatus === 'success' && (
                 <>
                   <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-4 animate-in zoom-in" />
                   <p className="text-emerald-400 font-bold text-lg">Terverifikasi!</p>
                 </>
               )}
               {scanStatus === 'error' && (
                 <div className="px-6 text-center animate-in zoom-in">
                   <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <ShieldCheck className="w-8 h-8 text-red-500" />
                   </div>
                   <p className="text-white font-bold text-lg mb-2">Verifikasi Gagal</p>
                   <p className="text-slate-300 text-sm mb-6">{error}</p>
                   <button 
                     onClick={(e) => { e.stopPropagation(); e.preventDefault(); resetScan(); }}
                     className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl text-sm font-semibold pointer-events-auto transition-colors"
                   >
                     Coba Lagi
                   </button>
                 </div>
               )}
             </div>
          )}

          {/* Guidelines Header */}
          {isScanning && scanStatus === 'ready' && (
            <div className="absolute top-6 left-0 right-0 flex justify-center z-10 pointer-events-none">
              <div className="bg-black/40 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 border border-white/10">
                {faceGuideStatus === 'detected' ? (
                  <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Tahan Posisi Anda</>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-amber-400"></span> Arahkan wajah ke bingkai</>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center max-w-sm px-6">
          <h3 className="text-xl font-bold text-slate-800 mb-2 tracking-tight">
            {isCheckOut ? 'Check Out Process' : 'Check In Process'}
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Pastikan wajah Anda mendapat cahaya yang cukup dan tidak tertutup aksesoris. 
          </p>
        </div>
      </div>

      {/* Footer Action */}
      <div className="relative z-10 p-6 pb-10">
        {!isScanning ? (
          <button 
            onClick={startScan}
            disabled={!modelsLoaded}
            className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all ${
               !modelsLoaded 
                 ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                 : isCheckOut 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-600/25 active:scale-[0.98]'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 active:scale-[0.98]'
            }`}
          >
            {modelsLoaded ? (
              <>
                <Camera className="w-5 h-5" />
                START {isCheckOut ? 'CHECK OUT' : 'CHECK IN'}
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Memuat Model...
              </>
            )}
          </button>
        ) : (
          <button 
            onClick={closeScan}
            className="w-full bg-white py-4 rounded-2xl font-semibold text-sm text-slate-600 flex items-center justify-center gap-2 border border-slate-200 active:scale-[0.98] transition-all hover:bg-slate-50 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Batal
          </button>
        )}
      </div>
    </div>
  );
};

export default Scan;
