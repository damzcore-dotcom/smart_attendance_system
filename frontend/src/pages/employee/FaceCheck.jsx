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
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, userAPI } from '../../services/api';

const FaceCheck = () => {
  const [scanStatus, setScanStatus] = useState('ready'); // ready, detecting, success, error
  const [error, setError] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [coords, setCoords] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const webcamRef = useRef(null);
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const user = authAPI.getStoredUser();

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch location
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => console.error("GPS Error:", err),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const saveBiometricsMutation = useMutation({
    mutationFn: (data) => userAPI.updateBiometrics(user.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      alert('Face ID Enrollment Sukses!');
      navigate('/employee/profile');
    },
    onError: (err) => {
      setError('Gagal menyimpan biometrik: ' + err.message);
      setScanStatus('error');
    }
  });

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
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (detection) {
          setScanStatus('success');
          // Automatically save if successful
          const descriptor = Array.from(detection.descriptor);
          saveBiometricsMutation.mutate({
            facePhoto: imageSrc,
            faceDescriptor: JSON.stringify(descriptor)
          });
        } else {
          setScanStatus('error');
          setError('Wajah tidak terdeteksi. Posisikan wajah di tengah frame.');
        }
      } catch (err) {
        console.error(err);
        setScanStatus('error');
        setError('Gagal mendeteksi wajah. Silakan coba lagi.');
      }
    }
  }, [modelsLoaded, user.id]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full">
          <ArrowLeft className="w-6 h-6 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Check Face Detection</h1>
          <p className="text-sm text-slate-500">Uji apakah wajah Anda terdeteksi oleh sistem</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 bg-white flex flex-col items-center text-center">
          <Clock className="w-5 h-5 text-primary mb-2" />
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Current Time</p>
          <p className="font-black text-slate-800 tracking-tight">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <div className="card p-4 bg-white flex flex-col items-center text-center">
          <MapPin className={`w-5 h-5 mb-2 ${coords ? 'text-emerald-500' : 'text-slate-300'}`} />
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">GPS Location</p>
          <p className={`font-bold text-xs truncate w-full ${coords ? 'text-slate-800' : 'text-slate-300'}`}>
            {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Locating...'}
          </p>
          {coords && (
            <p className="text-[8px] text-emerald-600 font-black mt-1">Accuracy: ±{Math.round(coords.accuracy)}m</p>
          )}
        </div>
      </div>

      <div className="card p-8 bg-slate-900 relative overflow-hidden flex flex-col items-center">
        <div className="relative w-full max-w-[300px] aspect-square rounded-[2rem] overflow-hidden bg-slate-800 border-4 border-white/10 shadow-2xl">
          {!modelsLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs font-medium">Memuat Model...</p>
            </div>
          ) : (
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full h-full object-cover"
              videoConstraints={{ facingMode: "user", width: 480, height: 480 }}
            />
          )}

          {scanStatus === 'detecting' && (
            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
              <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {scanStatus === 'success' && (
            <div className="absolute inset-0 bg-emerald-500/20 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-300">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-2" />
              <p className="text-white font-bold">Wajah Terdeteksi!</p>
            </div>
          )}

          {/* Decorative frame */}
          <div className="absolute inset-0 border-[20px] border-slate-900/40 pointer-events-none" />
        </div>

        <div className="mt-8 w-full max-w-[300px] space-y-4">
          <div className={`flex items-center justify-center gap-2 text-sm font-bold ${
            scanStatus === 'success' ? 'text-emerald-400' : 
            scanStatus === 'error' ? 'text-red-400' : 'text-slate-400'
          }`}>
            {scanStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
             scanStatus === 'error' ? <AlertCircle className="w-4 h-4" /> : <ScanFace className="w-4 h-4" />}
            <span>{
              scanStatus === 'success' ? 'Deteksi Berhasil' : 
              scanStatus === 'error' ? 'Gagal Mendeteksi' : 'Posisikan Wajah Anda'
            }</span>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 text-center">
              {error}
            </div>
          )}

          <button
            onClick={scanStatus === 'success' || scanStatus === 'error' ? () => setScanStatus('ready') : handleCheck}
            disabled={!modelsLoaded || scanStatus === 'detecting'}
            className="w-full py-4 rounded-2xl font-bold bg-primary text-white shadow-xl shadow-primary/20 active:scale-95 transition-all"
          >
            {scanStatus === 'success' || scanStatus === 'error' ? 'Coba Lagi' : 'Check Detection Now'}
          </button>
        </div>
      </div>

      <div className="card p-6 border-l-4 border-amber-400">
        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          Tips Deteksi
        </h3>
        <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
          <li>Pastikan pencahayaan cukup terang (tidak gelap).</li>
          <li>Lepaskan kacamata hitam atau penutup wajah jika ada.</li>
          <li>Posisikan wajah tepat di tengah kotak kamera.</li>
          <li>Jangan bergerak terlalu banyak saat proses deteksi.</li>
        </ul>
      </div>
    </div>
  );
};

export default FaceCheck;
