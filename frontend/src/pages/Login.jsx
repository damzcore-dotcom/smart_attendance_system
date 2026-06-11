import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, Fingerprint, Camera, X, Loader2, ScanFace, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { AppLogo } from '../components/AppLogo';
import Webcam from 'react-webcam';
import { authAPI } from '../services/api';
import { loadFaceModels, faceapi, areModelsLoaded } from '../utils/faceModelLoader';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../components/common/LanguageSelector';



const Login = () => {
  const { t } = useTranslation();
  const [loginMode, setLoginMode] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState(null);
  const [scanStatus, setScanStatus] = useState('ready'); // ready, detecting, verifying, success, error
  
  const webcamRef = useRef(null);
  
  // Phase 5: Real-time face guide
  const [faceGuideStatus, setFaceGuideStatus] = useState('none'); // none, detected, not-detected
  const faceGuideRef = useRef(null);
  const stableCountRef = useRef(0);
  const autoCaptureTriggeredRef = useRef(false);
  const boxHistoryRef = useRef([]);
  
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
    loadFaceModels()
      .then(() => setModelsLoaded(true))
      .catch(err => {
        console.error('Failed to load face models', err);
      });
  }, []);

  // Force password change state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [loginResult, setLoginResult] = useState(null);

  const handleCredentialLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoggingIn(true);
    try {
      const result = await authAPI.login(username, password);
      
      // Check if user must change password before accessing system
      if (result.mustChangePassword) {
        setLoginResult(result);
        setShowChangePassword(true);
        setIsLoggingIn(false);
        return;
      }
      
      navigateByRole(result.user.role);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
      setIsLoggingIn(false);
    }
  };

  const navigateByRole = (role) => {
    if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTING') {
      navigate('/admin');
    } else if (role === 'MANAGER') {
      navigate('/manager');
    } else if (role === 'DIREKTUR') {
      navigate('/director');
    } else {
      navigate('/employee');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword === password) {
      setError('Password baru harus berbeda dari password lama.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }

    setChangingPassword(true);
    try {
      await authAPI.changePassword(password, newPassword);
      navigateByRole(loginResult.user.role);
    } catch (err) {
      setError(err.message || 'Gagal mengganti password.');
      setChangingPassword(false);
    }
  };

  const handleCloseChangePassword = () => {
    setShowChangePassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setChangingPassword(false);
  };

  const doVerify = async (descriptorArray) => {
    setScanStatus('verifying');
    try {
      const result = await authAPI.verifyFace(descriptorArray);
      if (result.success) {
        setScanStatus('success');
        setTimeout(() => {
          if (result.mustChangePassword) {
            setLoginResult(result);
            setShowChangePassword(true);
            setIsScanning(false);
          } else {
            navigateByRole(result.user.role);
          }
        }, 1200);
      } else {
        setScanStatus('error');
        setError(result.message || 'Wajah tidak dikenali. Silakan coba lagi.');
      }
    } catch (err) {
      console.error('Face verification error:', err);
      setScanStatus('error');
      setError(err.message || 'Verifikasi gagal. Silakan coba lagi.');
    }
  };

  const capture = useCallback(async () => {
    if (!webcamRef.current || !areModelsLoaded()) return;

    // Direct capture - no liveness detection
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

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (detection) {
          doVerify(Array.from(detection.descriptor));
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
    stableCountRef.current = 0;
    autoCaptureTriggeredRef.current = false;
  };

  const closeScan = () => {
    if (faceGuideRef.current) clearInterval(faceGuideRef.current);
    setIsScanning(false);
    setScanStatus('ready');
    setError(null);
    setFaceGuideStatus('none');
    stableCountRef.current = 0;
    autoCaptureTriggeredRef.current = false;
    boxHistoryRef.current = [];
  };

  // Phase 5: Real-time face guide loop - runs when camera is active & idle
  useEffect(() => {
    if (!isScanning || !areModelsLoaded() || scanStatus !== 'ready') {
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
          // Auto-capture after face stable for ~2.5s (5 consecutive detections)
          if (stableCountRef.current >= 6 && !autoCaptureTriggeredRef.current) {
            // Anti-Spoofing Check (Passive Liveness)
            let isCompletelyStatic = true;
            if (boxHistoryRef.current.length >= 5) {
              const hist = boxHistoryRef.current;
              for (let i = 1; i < hist.length; i++) {
                const diffX = Math.abs(hist[i].x - hist[i-1].x);
                const diffY = Math.abs(hist[i].y - hist[i-1].y);
                const diffW = Math.abs(hist[i].w - hist[i-1].w);
                if (diffX >= 2 || diffY >= 2 || diffW >= 2) {
                  isCompletelyStatic = false;
                  break;
                }
              }
            } else {
              isCompletelyStatic = false;
            }

            if (isCompletelyStatic) {
              console.warn('[Liveness] Static face detected on login.');
              setScanStatus('error');
              setError('Anti-Spoofing: Wajah terdeteksi statis (foto). Harap gunakan wajah hidup.');
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
        // silently ignore face guide errors
      } finally {
        isProcessing = false;
      }
    }, 200); // Check every 200ms for the guide (lightweight)

    return () => {
      if (faceGuideRef.current) clearInterval(faceGuideRef.current);
      faceGuideRef.current = null;
    };
  }, [isScanning, modelsLoaded, scanStatus, capture]);

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
      default:
        // Use face guide status for real-time feedback
        if (faceGuideStatus === 'detected') return 'border-emerald-400 shadow-emerald-400/30';
        if (faceGuideStatus === 'not-detected') return 'border-orange-400 shadow-orange-400/20';
        return 'border-blue-300 shadow-blue-300/10';
    }
  };

  const getStatusLabel = () => {
    switch (scanStatus) {
      case 'detecting': return { text: 'Mendeteksi Wajah...', color: 'text-amber-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> };
      case 'verifying': return { text: 'Memverifikasi Identitas...', color: 'text-blue-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> };
      case 'success': return { text: 'Identitas Terverifikasi!', color: 'text-emerald-500', icon: <CheckCircle2 className="w-4 h-4" /> };
      case 'error': return { text: 'Verifikasi Gagal', color: 'text-red-500', icon: <AlertCircle className="w-4 h-4" /> };
      default:
        if (faceGuideStatus === 'detected') return { text: `Wajah Terdeteksi — Auto-capture ${Math.min(stableCountRef.current, 5)}/5...`, color: 'text-emerald-500', icon: <CheckCircle2 className="w-4 h-4" /> };
        if (faceGuideStatus === 'not-detected') return { text: 'Posisikan wajah di tengah frame', color: 'text-orange-500', icon: <AlertCircle className="w-4 h-4" /> };
        return { text: 'Siap Untuk Scan', color: 'text-slate-400', icon: <ScanFace className="w-4 h-4" /> };
    }
  };

  const statusLabel = getStatusLabel();
  const isBusy = scanStatus === 'detecting' || scanStatus === 'verifying' || scanStatus === 'success';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-hidden font-sans bg-[#f8fafc] text-slate-800">
      
      {/* Light & Vibrant background glowing blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-sky-400/15 rounded-full blur-[130px] animate-pulse pointer-events-none" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-400/15 rounded-full blur-[140px] animate-pulse pointer-events-none" style={{ animationDuration: '12s' }} />
      <div className="absolute top-[30%] left-[-5%] w-[35%] h-[35%] bg-emerald-300/10 rounded-full blur-[110px] animate-pulse pointer-events-none" style={{ animationDuration: '10s' }} />
      
      {/* Light tech-grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40 -z-10" />

      {/* Language Selector at the top right of the viewport */}
      <div className="absolute top-6 right-6 z-50">
        <LanguageSelector />
      </div>

      {/* Centered Glassmorphic Card */}
      <div className="w-full max-w-[450px] bg-white/90 backdrop-blur-2xl border border-slate-200/60 rounded-[2.5rem] p-8 sm:p-10 md:p-12 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.08)] z-10 relative">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200/50 to-transparent" />
        
        <div className="relative z-10 w-full">
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-[180px] h-[70px] flex items-center justify-center mb-4 p-1 hover:scale-105 duration-300 transition-transform">
              <AppLogo className="w-full h-full object-contain filter drop-shadow-sm" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 text-center tracking-tight leading-tight max-w-[320px]">{publicSettings.companyName}</h1>
            <span className="text-[10px] font-black tracking-widest text-blue-600 uppercase bg-blue-50/60 px-3 py-1 rounded-full border border-blue-100/50 mt-2.5 backdrop-blur-sm">{t('login.subtitle')}</span>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex p-1 bg-slate-200/40 border border-slate-300/20 rounded-2xl mb-8 relative backdrop-blur-sm">
            <button
              onClick={() => setLoginMode('credentials')}
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${
                loginMode === 'credentials' 
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200/10' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" />
              {t('login.credentials')}
            </button>
            <button
              onClick={() => {
                setLoginMode('face');
                setIsScanning(false);
                setError(null);
              }}
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${
                loginMode === 'face' 
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200/10' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ScanFace className="w-4 h-4" />
              {t('login.faceId')}
            </button>
          </div>

          {/* Form Content */}
          {loginMode === 'credentials' ? (
            <form onSubmit={handleCredentialLogin} className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="space-y-5">
                <div className="group">
                  <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">{t('login.username')}</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-300">
                      <User className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      placeholder={t('login.username')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="w-full bg-white/60 hover:bg-white/80 focus:bg-white border border-slate-200/80 focus:border-blue-500 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 text-slate-800 placeholder:text-slate-400/80 transition-all duration-300 shadow-sm"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">{t('login.password')}</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-300">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-white/60 hover:bg-white/80 focus:bg-white border border-slate-200/80 focus:border-blue-500 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 text-slate-800 placeholder:text-slate-400/80 tracking-widest transition-all duration-300 shadow-sm"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm font-semibold flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:-translate-y-0.5 active:translate-y-0 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/35 disabled:opacity-75 disabled:pointer-events-none cursor-pointer"
                >
                  {isLoggingIn ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('login.loggingIn')}</>
                  ) : (
                    <>{t('login.loginBtn')} <LogIn className="w-4 h-4" /></>
                  )}
                </button>
                <div className="mt-6 flex justify-center">
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    className="text-slate-400 hover:text-blue-600 text-xs font-bold transition-colors duration-200 cursor-pointer"
                  >
                    {t('login.forgotPassword')}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="p-8 bg-blue-50/40 border border-blue-100/60 rounded-3xl group hover:border-blue-300/60 transition-all duration-500 text-center shadow-sm backdrop-blur-sm">
              <div className="w-20 h-20 bg-blue-100/70 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-500 shadow-inner">
                <ScanFace className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">{t('login.biometricTitle')}</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed max-w-[280px] mx-auto">{t('login.biometricDesc')}</p>
              <button
                onClick={() => setIsScanning(true)}
                type="button"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:-translate-y-0.5 active:translate-y-0 text-white py-4 rounded-2xl font-bold text-sm shadow-md shadow-blue-600/10 hover:shadow-blue-500/30 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" /> {t('login.initScanner')}
              </button>
            </div>
          )}

          {/* Copyright footer */}
          <p className="text-center text-[10px] text-slate-500 mt-8 pt-4 border-t border-slate-200/50">
            {t('login.copyright')}
          </p>
        </div>
      </div>

      {/* ─── Face Scanning Modal ─── */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 face-modal-backdrop">
          <div className="face-modal-card w-full max-w-md relative">
            {/* Close Button */}
            <button 
              onClick={closeScan}
              className="absolute top-5 right-5 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all duration-200"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="text-center pt-8 pb-4 px-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 mb-4">
                <ScanFace className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">Verifikasi Wajah</h2>
              <p className="text-sm text-slate-500">Posisikan wajah Anda di dalam frame</p>
            </div>

            {/* Camera Area */}
            <div className="px-6 pb-4">
              <div className="relative mx-auto" style={{ maxWidth: 'min(280px, 70vw)' }}>
                {/* Animated outer ring */}
                <div className={`absolute -inset-3 rounded-[2rem] border-2 transition-all duration-700 ${getStatusRingColor()} ${isBusy ? 'face-ring-pulse' : ''}`} />
                
                {/* Corner Brackets */}
                <div className="absolute -inset-1 z-10 pointer-events-none">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-blue-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-blue-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-blue-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-blue-400 rounded-br-xl" />
                </div>

                {/* Camera Feed */}
                <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 relative">
                  {scanStatus !== 'success' ? (
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover"
                      videoConstraints={{ facingMode: "user", width: 640, height: 480, frameRate: { ideal: 30 } }}
                      screenshotQuality={0.92}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-600">
                      <CheckCircle2 className="w-16 h-16 text-white mb-3 face-success-pop" />
                      <p className="text-white font-bold text-lg">Berhasil!</p>
                      <p className="text-white/70 text-sm">Mengalihkan...</p>
                    </div>
                  )}
                  
                  {/* Scanning line overlay + real-time face guide */}
                  {scanStatus === 'ready' && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="face-scan-line" />
                      {/* Face detection indicator */}
                      {faceGuideStatus === 'detected' && (
                        <div className="absolute inset-4 border-2 border-emerald-400 rounded-xl transition-all duration-300 animate-pulse" style={{ boxShadow: '0 0 15px rgba(52,211,153,0.3)' }} />
                      )}
                      {faceGuideStatus === 'not-detected' && (
                        <div className="absolute inset-4 border-2 border-orange-400/60 rounded-xl transition-all duration-300" />
                      )}
                      {/* Auto-capture progress bar */}
                      {faceGuideStatus === 'detected' && stableCountRef.current > 0 && (
                        <div className="absolute bottom-2 left-4 right-4 h-1.5 bg-white/30 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${Math.min((stableCountRef.current / 5) * 100, 100)}%` }} />
                        </div>
                      )}
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

            {/* Scanning Instructions/Tips */}
            <div className="mx-8 mb-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2 text-blue-600">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Tips Pemindaian</span>
              </div>
              <ul className="text-[10px] text-slate-500 space-y-1.5 font-medium">
                <li className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-blue-400 mt-1" />
                  Posisikan wajah tepat di tengah bingkai biru.
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-blue-400 mt-1" />
                  Pastikan pencahayaan cukup terang dan wajah tidak gelap.
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-blue-400 mt-1" />
                  Diam sejenak dan jaga kamera agar tetap fokus/stabil.
                </li>
              </ul>
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
               <div className="mx-8 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                 <p className="text-red-600 text-sm text-center font-medium">{error}</p>
               </div>
            )}

            {/* Action Buttons */}
            <div className="px-8 pb-8 pt-3 flex gap-3">
              <button
                onClick={closeScan}
                className="flex-1 px-5 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all duration-200"
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
                  disabled={isBusy || !areModelsLoaded()}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {!areModelsLoaded() ? (
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

      {/* ─── Force Password Change Modal ─── */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-300 relative">
            {/* Close Button */}
            <button 
              onClick={handleCloseChangePassword}
              className="absolute top-5 right-5 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all duration-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Ubah Password Anda</h2>
              <p className="text-sm text-slate-500 mt-2">Demi keamanan, Anda wajib mengganti password default sebelum melanjutkan.</p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 ml-1">Password Baru</label>
                <input
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-slate-800 placeholder:text-slate-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 ml-1">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  placeholder="Ketik ulang password baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-slate-800 placeholder:text-slate-400 transition-all"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseChangePassword}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all duration-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex-[2] bg-amber-500 hover:bg-amber-600 text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-70 cursor-pointer"
                >
                  {changingPassword ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4" /> Simpan</>
                  )}
                </button>
              </div>
            </form>

            <p className="text-[10px] text-slate-400 text-center mt-4">
              Password lama Anda tidak akan bisa digunakan lagi setelah diubah.
            </p>
          </div>
        </div>
      )}

      <style>{`
        .face-modal-backdrop {
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          animation: fadeIn 0.3s ease-out;
        }
        .face-modal-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 2rem;
          box-shadow: 0 25px 60px rgba(0,0,0,0.15);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        
        .face-scan-line {
          position: absolute;
          left: 5%; right: 5%;
          height: 3px;
          background: linear-gradient(90deg, transparent, #3b82f6, transparent);
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
          animation: scanMove 3s ease-in-out infinite;
        }
        @keyframes scanMove { 0%, 100% { top: 10% } 50% { top: 90% } }
        
        .face-ring-pulse { animation: ringPulse 2s ease-in-out infinite; }
        @keyframes ringPulse { 0%, 100% { opacity: 0.4; transform: scale(1) } 50% { opacity: 1; transform: scale(1.03) } }
        
        .face-detect-ring {
          width: 100px; height: 100px;
          border: 4px solid transparent;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: detectSpin 0.8s linear infinite;
        }
        @keyframes detectSpin { to { transform: rotate(360deg) } }
        
        .face-verify-spinner {
          width: 110px; height: 110px;
          border: 4px solid transparent;
          border-top-color: #3b82f6;
          border-right-color: #3b82f6;
          border-radius: 50%;
          animation: detectSpin 0.6s linear infinite;
        }
        
        .face-success-pop { animation: successPop 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes successPop { 0% { transform: scale(0); opacity: 0 } 60% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  );
};

export default Login;
