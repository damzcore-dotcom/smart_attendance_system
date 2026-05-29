import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceAPI, authAPI, settingsAPI } from '../../services/api';

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
};
import { 
  ChevronLeft, 
  ShieldCheck,
  Loader2,
  CheckCircle2,
  ScanFace,
  XCircle
} from 'lucide-react';
import { verifyRealLocation } from '../../utils/geoUtils';
import Webcam from 'react-webcam';
import { loadFaceModels, faceapi, areModelsLoaded } from '../../utils/faceModelLoader';

const Scan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isCheckOut = searchParams.get('mode') === 'check-out';

  const queryClient = useQueryClient();
  const [scanStatus, setScanStatus] = useState('loading'); // loading, ready, detecting, verifying, success, error
  const [error, setError] = useState(null);
  const [statusText, setStatusText] = useState('Memuat model wajah...');
  
  const coordsRef = useRef(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [gpsReady, setGpsReady] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState({ checked: false, isInside: false, distance: null, name: '', radius: 100 });

  // Face guide
  const [faceGuideStatus, setFaceGuideStatus] = useState('none');
  const webcamRef = useRef(null);
  const faceGuideRef = useRef(null);
  const stableCountRef = useRef(0);
  const autoCaptureTriggeredRef = useRef(false);
  const boxHistoryRef = useRef([]);
  const lastImageSrcRef = useRef(null);

  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  // 1. Load face models on mount
  useEffect(() => {
    loadFaceModels()
      .then(() => {
        setModelsReady(true);
        setStatusText('Memverifikasi lokasi GPS...');
      })
      .catch(err => {
        console.error('Model load failed:', err);
        setScanStatus('error');
        setError('Gagal memuat model wajah. Coba muat ulang halaman.');
      });
  }, []);

  // 2. Get GPS location on mount
  useEffect(() => {
    verifyRealLocation(
      (position) => {
        const { accuracy, latitude, longitude } = position.coords;
        coordsRef.current = { lat: latitude, lng: longitude, accuracy, timestamp: position.timestamp };
        setGpsReady(true);
      },
      (err) => {
        console.warn('GPS error:', err.message);
        // For check-out, GPS is optional — proceed anyway
        if (isCheckOut) {
          setGpsReady(true);
        } else {
          setScanStatus('error');
          setError(err.message);
        }
      }
    );
  }, [isCheckOut]);

  // 3. When both models + GPS are ready → activate camera
  useEffect(() => {
    if (modelsReady && gpsReady) {
      setScanStatus('ready');
      setStatusText('Arahkan wajah Anda ke kamera');
    }
  }, [modelsReady, gpsReady]);

  // Geofence check
  useEffect(() => {
    if (gpsReady && coordsRef.current) {
      settingsAPI.getLocations()
        .then(res => {
          const locations = res.data || [];
          if (locations.length === 0) {
            setGeofenceStatus({ checked: true, isInside: true, distance: 0, name: 'Tanpa batas', radius: 0 });
            return;
          }
          let isInside = false;
          let nearestDist = Infinity;
          let matchedLoc = null;

          const myLat = coordsRef.current.lat;
          const myLng = coordsRef.current.lng;

          for (const loc of locations) {
            const dist = getDistance(myLat, myLng, parseFloat(loc.lat), parseFloat(loc.lng));
            if (dist <= loc.radius) {
              isInside = true;
              matchedLoc = loc;
              nearestDist = dist;
              break;
            }
            if (dist < nearestDist) {
              nearestDist = dist;
              matchedLoc = loc;
            }
          }

          setGeofenceStatus({
            checked: true,
            isInside,
            distance: Math.round(nearestDist),
            name: matchedLoc?.name || 'Kantor',
            radius: matchedLoc?.radius || 100
          });
        })
        .catch(err => {
          console.error('Failed to load locations for geofencing check:', err);
        });
    }
  }, [gpsReady]);

  // Attendance mutation
  const mutation = useMutation({
    mutationFn: async () => {
      const snap = lastImageSrcRef.current;
      
      // Offline Mode Fallback
      if (!navigator.onLine) {
        const pending = JSON.parse(localStorage.getItem('pending_sync') || '[]');
        const c = coordsRef.current;
        pending.push({
          type: isCheckOut ? 'OUT' : 'IN',
          employeeId: empId,
          mode: 'Face ID',
          lat: c?.lat,
          lng: c?.lng,
          accuracy: c?.accuracy,
          timestamp: c?.timestamp || Date.now(),
          photoData: snap
        });
        localStorage.setItem('pending_sync', JSON.stringify(pending));
        return { message: 'Offline! Absen disimpan di HP. Segera dapatkan sinyal agar data terkirim otomatis.', offline: true };
      }

      if (isCheckOut) {
        return attendanceAPI.checkOut(empId, snap);
      } else {
        const c = coordsRef.current;
        return attendanceAPI.checkIn(empId, 'Face ID', c?.lat, c?.lng, c?.accuracy, c?.timestamp, snap);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      setScanStatus('success');
      setStatusText(data.message || 'Berhasil!');
      setTimeout(() => navigate('/employee'), 2000);
    },
    onError: (err) => {
      setScanStatus('error');
      setError(err.message || 'Gagal memproses absensi.');
    },
  });

  // Face verification
  const doVerify = async (descriptorArray) => {
    setScanStatus('verifying');
    setStatusText('Memverifikasi wajah...');
    try {
      const result = await authAPI.verifyFace(descriptorArray);
      if (result.success) {
        if (result.user?.employee?.id === empId) {
          setStatusText('Wajah terverifikasi! Mencatat kehadiran...');
          mutation.mutate();
        } else {
          setScanStatus('error');
          setError('Wajah tidak cocok dengan akun Anda! (Terdeteksi: ' + (result.user?.employee?.name || 'Unknown') + ')');
        }
      } else {
        setScanStatus('error');
        setError(result.message || 'Wajah tidak dikenali dalam sistem.');
      }
    } catch (err) {
      console.error('Verify error:', err);
      setScanStatus('error');
      setError(err.message || 'Gagal memverifikasi wajah.');
    }
  };

  // Capture & detect face
  const capture = useCallback(async () => {
    if (!webcamRef.current || !areModelsLoaded()) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    lastImageSrcRef.current = imageSrc;

    setScanStatus('detecting');
    setStatusText('Menganalisis wajah...');
    setError(null);

    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.src = imageSrc;
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image'));
      });

      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (detection) {
        doVerify(Array.from(detection.descriptor));
      } else {
        setScanStatus('error');
        setError('Wajah tidak terdeteksi. Pastikan posisi wajah di tengah frame.');
      }
    } catch (err) {
      console.error('Capture error:', err);
      setScanStatus('error');
      setError(err.message || 'Gagal memindai wajah.');
    }
  }, [empId]);

  // Real-time face guide: auto-capture after stable ~2.5s
  useEffect(() => {
    if (scanStatus !== 'ready' || !modelsReady) {
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
          
          // Safely get box depending on whether landmarks were fetched
          const box = detection.box || (detection.detection && detection.detection.box) || detection.relativeBox;
          if (box) {
            boxHistoryRef.current.push({ x: box.x, y: box.y, w: box.width, h: box.height });
            if (boxHistoryRef.current.length > 5) boxHistoryRef.current.shift();
          }

          stableCountRef.current++;
          if (stableCountRef.current >= 6 && !autoCaptureTriggeredRef.current) {
            // Anti-Spoofing Check (Passive Liveness)
            // A real human face breathes and inherently has micro-jitters.
            // A printed photo or screen held at a fixed distance produces IDENTICAL bounding boxes.
            // Threshold is 2px — loose enough for a still person breathing, too tight for a static photo.
            let isCompletelyStatic = true;
            if (boxHistoryRef.current.length >= 5) {
              const hist = boxHistoryRef.current;
              for (let i = 1; i < hist.length; i++) {
                const diffX = Math.abs(hist[i].x - hist[i-1].x);
                const diffY = Math.abs(hist[i].y - hist[i-1].y);
                const diffW = Math.abs(hist[i].w - hist[i-1].w);
                // 2px threshold is sufficient to distinguish a live face from a static photo/screen
                if (diffX >= 2 || diffY >= 2 || diffW >= 2) {
                  isCompletelyStatic = false;
                  break;
                }
              }
            } else {
              // Not enough history yet — don't block capture
              isCompletelyStatic = false;
            }

            if (isCompletelyStatic) {
              console.warn('[Liveness] Static face detected. Box history:', boxHistoryRef.current);
              setScanStatus('error');
              setError('Anti-Spoofing: Wajah terdeteksi statis. Coba gerakkan kepala sedikit, pastikan wajah Anda asli.');
              clearInterval(faceGuideRef.current);
              faceGuideRef.current = null;
              return;
            }

            autoCaptureTriggeredRef.current = true;
            clearInterval(faceGuideRef.current);
            faceGuideRef.current = null;
            capture();
          }
        } else {
          setFaceGuideStatus('not-detected');
          stableCountRef.current = 0;
          boxHistoryRef.current = [];
        }
      } catch {
        // silently ignore
      } finally {
        isProcessing = false;
      }
    }, 200);

    return () => {
      if (faceGuideRef.current) clearInterval(faceGuideRef.current);
    };
  }, [scanStatus, modelsReady, capture]);

  const resetScan = () => {
    setScanStatus('ready');
    setError(null);
    setStatusText('Arahkan wajah Anda ke kamera');
    setFaceGuideStatus('none');
    stableCountRef.current = 0;
    autoCaptureTriggeredRef.current = false;
  };

  // Determine border color for the face frame
  const getBorderColor = () => {
    if (scanStatus === 'success') return 'border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.4)]';
    if (scanStatus === 'error') return 'border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.4)]';
    if (scanStatus === 'detecting' || scanStatus === 'verifying') return 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]';
    if (faceGuideStatus === 'detected') return 'border-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.3)]';
    return 'border-white/20';
  };

  const cameraActive = scanStatus === 'ready' || scanStatus === 'detecting' || scanStatus === 'verifying';

  return (
    <div className="fixed inset-0 flex flex-col font-sans bg-slate-900">
      {/* Header */}
      <div className="relative z-20 px-4 pt-4 pb-2 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent">
        <button 
          onClick={() => navigate('/employee')}
          className="w-9 h-9 flex items-center justify-center bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 rounded-xl transition-all"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-400 mb-0.5">Biometric Scan</span>
          <span className="font-bold text-sm text-white tracking-tight">
            {isCheckOut ? 'CHECK OUT' : 'CHECK IN'}
          </span>
        </div>
        <div className="w-9 h-9 flex items-center justify-center bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 rounded-xl">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
        </div>
      </div>

      {/* Camera Area - fills remaining space */}
      <div className="flex-1 relative">
        {/* Webcam - always try to render when camera should be active */}
        {cameraActive && (
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.92}
            videoConstraints={{ facingMode: "user", width: 640, height: 480, frameRate: 30 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Loading state */}
        {scanStatus === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-5 border border-slate-700">
              <ScanFace className="w-10 h-10 text-blue-400" />
            </div>
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
            <p className="text-white/70 text-sm font-medium">{statusText}</p>
          </div>
        )}

        {/* Dark overlay with circular cutout */}
        {cameraActive && (
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(circle at 50% 45%, transparent 28%, rgba(0,0,0,0.7) 65%)'
          }}></div>
        )}

        {/* Face Target Circle */}
        {cameraActive && (
          <div className={`absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 border-[3px] rounded-full transition-all duration-500 pointer-events-none ${getBorderColor()}`}></div>
        )}

        {/* Success Overlay */}
        {scanStatus === 'success' && (
          <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-sm flex flex-col items-center justify-center z-20">
            <CheckCircle2 className="w-20 h-20 text-emerald-400 mb-4" />
            <p className="text-emerald-400 font-bold text-xl mb-1">Terverifikasi!</p>
            <p className="text-white/60 text-sm">{statusText}</p>
          </div>
        )}

        {/* Error Overlay */}
        {scanStatus === 'error' && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center z-20 px-8">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 border border-red-400/30">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-white font-bold text-lg mb-2 text-center">Gagal</p>
            <p className="text-white/60 text-sm text-center mb-6 leading-relaxed">{error}</p>
            <button 
              onClick={resetScan}
              className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-xl text-sm font-semibold transition-colors border border-white/10"
            >
              Coba Lagi
            </button>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="relative z-20 px-6 py-5 bg-gradient-to-t from-black/80 to-transparent">
        {/* Geofencing Visual Feedback */}
        {geofenceStatus.checked && (
          <div className={`flex items-center justify-center gap-2 mb-3 py-1.5 px-4 rounded-full w-fit mx-auto border backdrop-blur-md text-[10px] font-bold uppercase tracking-wider ${
            geofenceStatus.isInside 
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-500/20 border-rose-500/30 text-rose-400 animate-pulse'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${geofenceStatus.isInside ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)] animate-ping'}`}></span>
            <span>
              {geofenceStatus.isInside 
                ? `Area Absen Terverifikasi: ${geofenceStatus.name}` 
                : `Di luar area: ±${geofenceStatus.distance}m dari ${geofenceStatus.name} (Max ${geofenceStatus.radius}m)`
              }
            </span>
          </div>
        )}

        {/* Face guide indicator */}
        {scanStatus === 'ready' && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full ${faceGuideStatus === 'detected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="text-white/80 text-xs font-medium">
              {faceGuideStatus === 'detected' ? 'Wajah terdeteksi — tahan posisi...' : 'Arahkan wajah ke lingkaran'}
            </span>
          </div>
        )}

        {(scanStatus === 'detecting' || scanStatus === 'verifying') && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-white/80 text-xs font-medium">{statusText}</span>
          </div>
        )}

        {scanStatus === 'loading' && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-white/60 text-xs font-medium">{statusText}</span>
          </div>
        )}

        <button 
          onClick={() => navigate('/employee')}
          className="w-full bg-white/10 hover:bg-white/15 backdrop-blur-sm text-white/80 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-white/10 active:scale-[0.98] transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Kembali
        </button>
      </div>
    </div>
  );
};

export default Scan;
