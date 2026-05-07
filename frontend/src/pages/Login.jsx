import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, Fingerprint, Camera, X, Loader2, ScanFace, CheckCircle2, AlertCircle, User } from 'lucide-react';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import { authAPI } from '../services/api';

const Login = () => {
  const [loginMode, setLoginMode] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState(null);
  const [scanStatus, setScanStatus] = useState('ready'); // ready, detecting, verifying, success, error
  
  const webcamRef = useRef(null);
  const navigate = useNavigate();
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [publicSettings, setPublicSettings] = useState({ companyName: 'Smart Attend Pro' });

  // Load public settings
  useEffect(() => {
    import('../services/api').then(({ settingsAPI }) => {
      settingsAPI.getPublicInfo().then(res => {
        if (res.success) setPublicSettings(res.data);
      }).catch(err => console.error('Failed to load public settings', err));
    });
  }, []);

  // Load models on mount
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
      }
    };
    loadModels();
  }, []);

  const handleCredentialLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoggingIn(true);
    try {
      const result = await authAPI.login(username, password);
      if (result.user.role === 'ADMIN' || result.user.role === 'SUPER_ADMIN') {
        navigate('/admin');
      } else if (result.user.role === 'MANAGER') {
        navigate('/manager');
      } else if (result.user.role === 'DIREKTUR') {
        navigate('/director');
      } else {
        navigate('/employee');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
      setIsLoggingIn(false);
    }
  };

  const capture = useCallback(async () => {
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
          image.onerror = () => reject(new Error('Failed to load captured image'));
        });

        // Detect face and get descriptor
        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (detection) {
          setScanStatus('verifying');
          const descriptorArray = Array.from(detection.descriptor);
          console.log('Face detected, descriptor length:', descriptorArray.length);
          const result = await authAPI.verifyFace(descriptorArray);
          
          if (result.success) {
            setScanStatus('success');
            setTimeout(() => {
              if (result.user.role === 'ADMIN' || result.user.role === 'SUPER_ADMIN') {
                navigate('/admin');
              } else if (result.user.role === 'MANAGER') {
                navigate('/manager');
              } else if (result.user.role === 'DIREKTUR') {
                navigate('/director');
              } else {
                navigate('/employee');
              }
            }, 1200);
          } else {
            setScanStatus('error');
            setError(result.message || 'Wajah tidak dikenali. Silakan coba lagi.');
          }
        } else {
          setScanStatus('error');
          setError('Wajah tidak terdeteksi. Pastikan posisi wajah di tengah frame.');
        }
      } catch (err) {
        console.error('Face verification error:', err);
        setScanStatus('error');
        setError(err.message || 'Verifikasi gagal. Silakan coba lagi.');
      }
    } else {
      setError('Kamera belum siap. Mohon tunggu sebentar.');
    }
  }, [webcamRef, navigate, modelsLoaded]);

  const resetScan = () => {
    setScanStatus('ready');
    setError(null);
  };

  const closeScan = () => {
    setIsScanning(false);
    setScanStatus('ready');
    setError(null);
  };

  // Status color/ring mapping
  const handleForgotPassword = () => {
    alert("Please contact your HR Department or System Administrator to reset your password.");
  };

  const getStatusRingColor = () => {
    switch (scanStatus) {
      case 'detecting': return 'border-amber-400 shadow-amber-400/30';
      case 'verifying': return 'border-blue-400 shadow-blue-400/30';
      case 'success': return 'border-emerald-400 shadow-emerald-400/40';
      case 'error': return 'border-red-400 shadow-red-400/30';
      default: return 'border-primary/30 shadow-primary/10';
    }
  };

  const getStatusLabel = () => {
    switch (scanStatus) {
      case 'detecting': return { text: 'Mendeteksi Wajah...', color: 'text-amber-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> };
      case 'verifying': return { text: 'Memverifikasi Identitas...', color: 'text-blue-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> };
      case 'success': return { text: 'Identitas Terverifikasi!', color: 'text-emerald-500', icon: <CheckCircle2 className="w-4 h-4" /> };
      case 'error': return { text: 'Verifikasi Gagal', color: 'text-red-500', icon: <AlertCircle className="w-4 h-4" /> };
      default: return { text: 'Siap Untuk Scan', color: 'text-slate-400', icon: <ScanFace className="w-4 h-4" /> };
    }
  };

  const statusLabel = getStatusLabel();
  const isBusy = scanStatus === 'detecting' || scanStatus === 'verifying' || scanStatus === 'success';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden font-sans">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse delay-1000 pointer-events-none" />
      
      {/* Main Container */}
      <div className="w-full max-w-[460px] bg-white/90 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_80px_-15px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden z-10 border border-white p-6 sm:p-8 md:p-10 relative">
        
        {/* Top Decorative Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-emerald-500/10 blur-[50px] pointer-events-none" />

        <div className="relative z-10 w-full">
          
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-[1.25rem] flex items-center justify-center mb-4 border border-emerald-100 shadow-sm">
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{publicSettings.companyName}</h1>
          </div>

          {/* Greeting - Removed or Minimized */}
          <div className="mb-6 text-center">
            <p className="text-slate-500 font-medium text-xs px-4">Please enter your credentials to access the portal.</p>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex p-1.5 bg-slate-100/80 backdrop-blur-sm rounded-2xl mb-8 border border-slate-200/50">
            <button
              onClick={() => setLoginMode('credentials')}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-300 ${
                loginMode === 'credentials' 
                  ? 'bg-white text-emerald-700 shadow-sm border border-slate-100 scale-[1.02]' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Credentials
            </button>
            <button
              onClick={() => {
                setLoginMode('face');
                setIsScanning(false);
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-300 ${
                loginMode === 'face' 
                  ? 'bg-white text-emerald-700 shadow-sm border border-slate-100 scale-[1.02]' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ScanFace className="w-4 h-4" />
              Face ID
            </button>
          </div>

          {/* Form Content */}
          {loginMode === 'credentials' ? (
            <form onSubmit={handleCredentialLogin} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-4">
                <div className="group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-emerald-600 transition-colors">Username</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Fingerprint className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all duration-300 font-medium text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-emerald-600 transition-colors">Password</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all duration-300 font-medium text-slate-700 placeholder:text-slate-400 tracking-widest"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-bold flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 group disabled:opacity-70 active:scale-95 transition-all shadow-xl shadow-slate-900/10"
                >
                  {isLoggingIn ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                  ) : (
                    <>Sign In <LogIn className="w-3.5 h-3.5" /></>
                  )}
                </button>
                <div className="mt-4 flex justify-center">
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    className="text-emerald-600 hover:text-emerald-700 text-[10px] font-bold transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>
            </form>
          ) : (
              <div className="p-8 sm:p-10 bg-slate-50/80 rounded-[2rem] border border-slate-200 group hover:border-emerald-200 hover:bg-emerald-50/50 transition-all duration-500 shadow-sm hover:shadow-md">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500 shadow-sm border border-emerald-200/50">
                  <ScanFace className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Biometric Access</h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed">Secure, passwordless entry using AI facial recognition.</p>
                <button
                  onClick={() => setIsScanning(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Start Scanner
                </button>
              </div>
          )}
        </div>
      </div>

      {/* ─── Professional Face Scanning Modal ─── */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 face-modal-backdrop">
          <div className="face-modal-card w-full max-w-md relative">
            {/* Close Button */}
            <button 
              onClick={closeScan}
              className="absolute top-5 right-5 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-all duration-200"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="text-center pt-8 pb-4 px-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm mb-4">
                <ScanFace className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Verifikasi Wajah</h2>
              <p className="text-sm text-white/60">Posisikan wajah Anda di dalam frame</p>
            </div>

            {/* Camera Area */}
            <div className="px-6 pb-4">
              <div className="relative mx-auto" style={{ maxWidth: 'min(280px, 70vw)' }}>
                {/* Animated outer ring */}
                <div className={`absolute -inset-3 rounded-[2rem] border-2 transition-all duration-700 ${getStatusRingColor()} ${isBusy ? 'face-ring-pulse' : ''}`} />
                
                {/* Corner Brackets */}
                <div className="absolute -inset-1 z-10 pointer-events-none">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-white/70 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-white/70 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-white/70 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-white/70 rounded-br-xl" />
                </div>

                {/* Camera Feed */}
                <div className="aspect-square rounded-2xl overflow-hidden bg-slate-900 relative">
                  {scanStatus !== 'success' ? (
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover"
                      videoConstraints={{ facingMode: "user", width: 480, height: 480 }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-600 to-emerald-800">
                      <CheckCircle2 className="w-16 h-16 text-white mb-3 face-success-pop" />
                      <p className="text-white font-bold text-lg">Berhasil!</p>
                      <p className="text-white/70 text-sm">Mengalihkan...</p>
                    </div>
                  )}
                  
                  {/* Scanning line overlay */}
                  {scanStatus === 'ready' && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="face-scan-line" />
                    </div>
                  )}

                  {/* Detecting overlay */}
                  {scanStatus === 'detecting' && (
                    <div className="absolute inset-0 bg-amber-500/10 pointer-events-none flex items-center justify-center">
                      <div className="face-detect-ring" />
                    </div>
                  )}

                  {/* Verifying overlay */}
                  {scanStatus === 'verifying' && (
                    <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
                      <div className="face-verify-spinner" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="px-8 py-3">
              <div className={`flex items-center justify-center gap-2 text-sm font-semibold ${statusLabel.color}`}>
                {statusLabel.icon}
                <span>{statusLabel.text}</span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
               <div className="mx-8 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                 <p className="text-red-300 text-sm text-center font-medium">{error}</p>
               </div>
            )}

            {/* Action Buttons */}
            <div className="px-8 pb-8 pt-3 flex gap-3">
              <button
                onClick={closeScan}
                className="flex-1 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm backdrop-blur-sm transition-all duration-200"
              >
                Batal
              </button>
              {scanStatus === 'error' ? (
                <button
                  onClick={resetScan}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-amber-500/25"
                >
                  Coba Lagi
                </button>
              ) : (
                <button
                  onClick={capture}
                  disabled={isBusy || !modelsLoaded}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {!modelsLoaded ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                  ) : (
                    <><ScanFace className="w-4 h-4" /> Capture & Verify</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Face Scanner Styles */}
      <style>{`
        .face-modal-backdrop {
          background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(0,40,30,0.95));
          backdrop-filter: blur(20px);
          animation: fadeIn 0.3s ease-out;
        }
        .face-modal-card {
          background: linear-gradient(145deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 2rem;
          box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 80px rgba(16,185,129,0.1);
          animation: slideUp 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(30px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
        
        .face-scan-line {
          position: absolute;
          left: 10%; right: 10%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(16,185,129,0.8), transparent);
          box-shadow: 0 0 15px rgba(16,185,129,0.5);
          animation: scanMove 2.5s ease-in-out infinite;
        }
        @keyframes scanMove { 0%,100% { top:15% } 50% { top:85% } }
        
        .face-ring-pulse { animation: ringPulse 1.5s ease-in-out infinite; }
        @keyframes ringPulse { 0%,100% { opacity:0.5; transform:scale(1) } 50% { opacity:1; transform:scale(1.02) } }
        
        .face-detect-ring {
          width: 80px; height: 80px;
          border: 3px solid transparent;
          border-top-color: rgba(245,158,11,0.8);
          border-right-color: rgba(245,158,11,0.4);
          border-radius: 50%;
          animation: detectSpin 1s linear infinite;
        }
        @keyframes detectSpin { to { transform: rotate(360deg) } }
        
        .face-verify-spinner {
          width: 90px; height: 90px;
          border: 3px solid transparent;
          border-top-color: rgba(59,130,246,0.8);
          border-left-color: rgba(59,130,246,0.4);
          border-radius: 50%;
          animation: detectSpin 0.8s linear infinite;
          box-shadow: 0 0 20px rgba(59,130,246,0.2);
        }
        
        .face-success-pop { animation: successPop 0.5s cubic-bezier(0.16,1,0.3,1); }
        @keyframes successPop { 0% { transform: scale(0); opacity:0 } 60% { transform: scale(1.2) } 100% { transform: scale(1); opacity:1 } }
        
        .border-3 { border-width: 3px; }
      `}</style>
    </div>
  );
};

export default Login;
