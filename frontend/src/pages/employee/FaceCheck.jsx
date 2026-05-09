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
    <div className="min-h-screen relative overflow-hidden font-sans pb-20">
      <div className="relative z-10 p-2 space-y-5 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)} 
            className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Face ID Enrollment</h1>
            <p className="text-xs text-blue-600 font-semibold">Register your biometric data</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
            <Clock className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Time</p>
            <p className="font-bold text-slate-800 text-sm">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
            <MapPin className={`w-5 h-5 mb-2 transition-colors ${coords ? 'text-emerald-600' : 'text-slate-300'}`} />
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Location</p>
            <p className={`font-bold text-[10px] truncate w-full ${coords ? 'text-slate-800' : 'text-slate-300'}`}>
              {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Establishing...'}
            </p>
            {coords && (
              <p className="text-[8px] text-emerald-600 font-semibold mt-1">±{Math.round(coords.accuracy)}m</p>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col items-center">
          <div className="relative w-full max-w-[260px] aspect-square rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-inner">
            {!modelsLoaded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-xs font-semibold">Loading AI Models...</p>
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
              <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center backdrop-blur-[1px]">
                <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {scanStatus === 'success' && (
              <div className="absolute inset-0 bg-emerald-500/20 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-500">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-2" />
                <p className="text-emerald-700 font-bold text-xs uppercase tracking-wider">Enrolled!</p>
              </div>
            )}

            {/* Frame guides */}
            <div className="absolute inset-3 border-2 border-blue-200/50 rounded-xl pointer-events-none" />
          </div>

          <div className="mt-8 w-full max-w-[260px] space-y-4">
            <div className={`flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider ${
              scanStatus === 'success' ? 'text-emerald-600' : 
              scanStatus === 'error' ? 'text-rose-600' : 'text-slate-400'
            }`}>
              {scanStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
               scanStatus === 'error' ? <AlertCircle className="w-4 h-4" /> : <ScanFace className="w-4 h-4 text-blue-600" />}
              <span>{
                scanStatus === 'success' ? 'Enrollment Success' : 
                scanStatus === 'error' ? 'Detection Failed' : 'Ready to Scan'
              }</span>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-600 text-center leading-relaxed">
                {error}
              </div>
            )}

            <button
              onClick={scanStatus === 'success' || scanStatus === 'error' ? () => setScanStatus('ready') : handleCheck}
              disabled={!modelsLoaded || scanStatus === 'detecting'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all shadow-lg shadow-blue-600/20 disabled:opacity-30"
            >
              {scanStatus === 'success' || scanStatus === 'error' ? 'Try Again' : 'Capture & Enroll'}
            </button>
          </div>
        </div>

        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 border-l-4 border-l-blue-500">
          <h3 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            Guidelines
          </h3>
          <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
            <li className="flex gap-2"><span className="text-blue-600">•</span> Ensure good lighting conditions</li>
            <li className="flex gap-2"><span className="text-blue-600">•</span> Remove glasses or face coverings</li>
            <li className="flex gap-2"><span className="text-blue-600">•</span> Center your face in the frame</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FaceCheck;
