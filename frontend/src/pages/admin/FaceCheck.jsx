import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import { 
  Camera, 
  X, 
  Loader2, 
  ScanFace, 
  CheckCircle2, 
  AlertCircle,
  ArrowLeft,
  MapPin,
  Clock,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminFaceCheck = () => {
  const [scanStatus, setScanStatus] = useState('ready'); // ready, detecting, success, error
  const [error, setError] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [coords, setCoords] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const webcamRef = useRef(null);
  const navigate = useNavigate();

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch location with watchPosition for better accuracy over time
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
    <div className="p-8 space-y-8 max-w-4xl animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ScanFace className="w-8 h-8 text-primary" />
            Biometric Diagnostic
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Test Face ID detection and verify system clock/GPS readiness.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6 flex items-center gap-4 border-l-4 border-primary">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-0.5">System Time</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="card p-6 flex items-center gap-4 border-l-4 border-emerald-500">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-0.5">Current Location</p>
            <p className="text-lg font-bold text-slate-800 truncate">
              {coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : 'Locating...'}
            </p>
            {coords && (
              <p className="text-[10px] text-emerald-600 font-black">Accuracy: ±{Math.round(coords.accuracy)}m</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card p-1 bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
          <div className="relative aspect-video rounded-[2.4rem] overflow-hidden bg-slate-800">
            {!modelsLoaded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-sm font-bold uppercase tracking-widest">Initializing AI Engine...</p>
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
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[2px]">
                <div className="w-24 h-24 border-8 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {scanStatus === 'success' && (
              <div className="absolute inset-0 bg-emerald-500/20 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in duration-300">
                <CheckCircle2 className="w-24 h-24 text-emerald-400 mb-4" />
                <p className="text-2xl font-black text-white uppercase tracking-widest shadow-lg">Face Detected</p>
              </div>
            )}

            {/* Scan overlay */}
            <div className="absolute inset-0 border-[40px] border-slate-900/40 pointer-events-none" />
            <div className="absolute inset-0 border-2 border-white/10 pointer-events-none rounded-[2.4rem]" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 bg-slate-50 border-none shadow-none">
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-400" />
              Control Panel
            </h3>
            
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${
                scanStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                scanStatus === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-white border-slate-200 text-slate-400'
              }`}>
                {scanStatus === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                 scanStatus === 'error' ? <AlertCircle className="w-5 h-5" /> : <ScanFace className="w-5 h-5" />}
                <span className="font-bold text-xs uppercase tracking-widest">
                  {scanStatus === 'success' ? 'Detection Success' :
                   scanStatus === 'error' ? 'Detection Failed' : 'Ready to Test'}
                </span>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-[10px] font-bold text-rose-500 leading-relaxed">
                  {error}
                </div>
              )}

              <button
                onClick={scanStatus === 'success' || scanStatus === 'error' ? () => setScanStatus('ready') : handleCheck}
                disabled={!modelsLoaded || scanStatus === 'detecting'}
                className="w-full py-4 rounded-2xl font-black bg-primary text-white shadow-xl shadow-primary/20 hover:bg-primary-dark hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {scanStatus === 'success' || scanStatus === 'error' ? (
                  <>Try Again</>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    Test Detection
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="card p-6 bg-blue-50 border-none">
            <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Admin Info
            </h4>
            <p className="text-[10px] text-blue-700/70 leading-relaxed font-medium">
              Use this tool to troubleshoot hardware or software issues for employees. 
              Ensure the camera has proper lighting and the GPS signal is within the allowed radius defined in settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminFaceCheck;
