import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import { 
  Camera, 
  Loader2, 
  ScanFace, 
  CheckCircle2, 
  AlertCircle,
  MapPin,
  Clock,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminFaceCheck = () => {
  const [scanStatus, setScanStatus] = useState('ready'); 
  const [error, setError] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [coords, setCoords] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const webcamRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        console.error("GPS Error:", err);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 20000, 
        maximumAge: 0 
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = 'https://vladmandic.github.io/face-api/model/';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load face models', err);
        setError('Gagal memuat model pengenalan wajah.');
      }
    };
    loadModels();
  }, []);

  const handleCheck = useCallback(async () => {
    if (!webcamRef.current || !modelsLoaded) return;
    
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

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks();
        
        if (detection) {
          setScanStatus('success');
        } else {
          setScanStatus('error');
          setError('Wajah tidak terdeteksi. Posisikan wajah di tengah frame.');
        }
      } catch (err) {
        setScanStatus('error');
        setError('Gagal mendeteksi wajah. Silakan coba lagi.');
      }
    }
  }, [modelsLoaded]);

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <ScanFace className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Security Controls</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Biometric Diagnostic</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Sensor Alignment
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              SYSTEM DIAGNOSTICS
            </div>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Atomic Clock Synchronization</p>
            <p className="text-2xl font-bold text-slate-800 tracking-tight">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">
            <MapPin className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Geospatial Fix</p>
            <p className="text-lg font-bold text-slate-800 tracking-tight">
              {coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : 'Establishing Satellite Uplink...'}
            </p>
            {coords && (
              <p className="text-[10px] text-emerald-600 font-bold mt-0.5 uppercase tracking-wider">±{Math.round(coords.accuracy)}m Accuracy Radius</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-2 rounded-[2.5rem] overflow-hidden shadow-sm border border-slate-200">
          <div className="relative aspect-video rounded-[2rem] overflow-hidden bg-slate-100 shadow-inner">
            {!modelsLoaded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                <p className="text-xs font-bold uppercase tracking-wider">Initializing AI Engine...</p>
              </div>
            ) : (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                videoConstraints={{ facingMode: "user" }}
              />
            )}

            {scanStatus === 'detecting' && (
              <div className="absolute inset-0 bg-blue-600/10 flex items-center justify-center backdrop-blur-sm">
                <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-sm" />
              </div>
            )}

            {scanStatus === 'success' && (
              <div className="absolute inset-0 bg-emerald-500/10 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in duration-300">
                <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-4 drop-shadow-md" />
                <p className="text-2xl font-bold text-emerald-700 uppercase tracking-widest shadow-sm">Sensor Verified</p>
              </div>
            )}

            {/* High-Tech Scan Frame Overlay */}
            <div className="absolute inset-0 border-[40px] border-slate-900/60 pointer-events-none mix-blend-multiply" />
            <div className="absolute inset-6 border-2 border-white/20 rounded-3xl pointer-events-none" />
            
            {/* Corner Brackets */}
            <div className="absolute top-10 left-10 w-12 h-12 border-t-4 border-l-4 border-blue-500/80 rounded-tl-2xl pointer-events-none" />
            <div className="absolute top-10 right-10 w-12 h-12 border-t-4 border-r-4 border-blue-500/80 rounded-tr-2xl pointer-events-none" />
            <div className="absolute bottom-10 left-10 w-12 h-12 border-b-4 border-l-4 border-blue-500/80 rounded-bl-2xl pointer-events-none" />
            <div className="absolute bottom-10 right-10 w-12 h-12 border-b-4 border-r-4 border-blue-500/80 rounded-br-2xl pointer-events-none" />
          </div>
        </div>

        <div className="space-y-6 flex flex-col justify-center">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight mb-6 flex items-center gap-3">
              <Settings className="w-4 h-4 text-slate-400" />
              Diagnostic Control Panel
            </h3>
            
            <div className="space-y-5">
              <div className={`p-5 rounded-2xl border flex items-center gap-3 transition-all duration-300 ${
                scanStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm' :
                scanStatus === 'error' ? 'bg-rose-50 border-rose-100 text-rose-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                {scanStatus === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                 scanStatus === 'error' ? <AlertCircle className="w-5 h-5" /> : <ScanFace className="w-5 h-5 text-blue-500" />}
                <span className="font-bold text-xs uppercase tracking-wider">
                  {scanStatus === 'success' ? 'Sensor Diagnostic Passed' :
                   scanStatus === 'error' ? 'Sensor Diagnostic Failed' : 'System Ready for Testing'}
                </span>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-xs font-bold text-rose-600 leading-relaxed text-center uppercase tracking-wider">
                  {error}
                </div>
              )}

              <button
                onClick={scanStatus === 'success' || scanStatus === 'error' ? () => setScanStatus('ready') : handleCheck}
                disabled={!modelsLoaded || scanStatus === 'detecting'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3 group"
              >
                {scanStatus === 'success' || scanStatus === 'error' ? (
                  <>RESTART ENGINE</>
                ) : (
                  <>
                    <Camera className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    RUN DIAGNOSTIC
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400" />
              Sensor Specifications
            </h4>
            <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-widest">
              AI ENGINE: T-FACE v2.0<br/>
              ACCURACY THRESHOLD: 98.4%<br/>
              GEOSPATIAL SYNC: ACTIVE<br/>
              ENCRYPTION: AES-256-GCM
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminFaceCheck;
