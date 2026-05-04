import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, Fingerprint, Camera, X, Loader2, ScanFace } from 'lucide-react';
import Webcam from 'react-webcam';
import { authAPI } from '../services/api';

const Login = () => {
  const [loginMode, setLoginMode] = useState('credentials'); // 'credentials' or 'face'
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState(null);
  
  const webcamRef = useRef(null);
  const navigate = useNavigate();

  const handleCredentialLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoggingIn(true);
    try {
      const result = await authAPI.login(username, password);
      if (result.user.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/employee');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
      setIsLoggingIn(false);
    }
  };

  const capture = useCallback(async () => {
    if (!webcamRef.current) return;
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setIsVerifying(true);
      setError(null);
      try {
        const result = await authAPI.verifyFace(imageSrc);
        if (result.success) {
          if (result.user.role === 'ADMIN') {
            navigate('/admin');
          } else {
            navigate('/employee');
          }
        } else {
          setError('Face not recognized. Please try again.');
          setIsVerifying(false);
        }
      } catch (err) {
        setError('Verification failed. Please check your connection.');
        setIsVerifying(false);
      }
    } else {
      setError('Camera not ready. Please wait a moment or check permissions.');
    }
  }, [webcamRef, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl animate-pulse delay-700" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-xl border border-slate-100 mb-6 group hover:scale-105 transition-transform duration-300">
            <Fingerprint className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Smart Attendance Pro</h1>
          <p className="text-slate-500">Enterprise Biometric Attendance System</p>
        </div>

        <div className="card glass p-8">
          {/* Tab Selection */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-8">
            <button
              onClick={() => setLoginMode('credentials')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                loginMode === 'credentials' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                loginMode === 'face' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ScanFace className="w-4 h-4" />
              Face ID
            </button>
          </div>

          {loginMode === 'credentials' ? (
            <form onSubmit={handleCredentialLogin} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role Select</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-200 ${
                        role === 'admin' 
                          ? 'border-primary bg-primary/5 text-primary' 
                          : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span className="font-semibold text-sm">Admin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('employee')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-200 ${
                        role === 'employee' 
                          ? 'border-primary bg-primary/5 text-primary' 
                          : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <LogIn className="w-4 h-4" />
                      <span className="font-semibold text-sm">Employee</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                  <input
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium text-center">
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full btn-primary py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 group disabled:opacity-70"
              >
                {isLoggingIn ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Signing In...</>
                ) : (
                  <>Sign In <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-800 mb-1">Face Recognition</h3>
                <p className="text-sm text-slate-500 mb-6">Login automatically by scanning your face.</p>
                <button
                  onClick={() => setIsScanning(true)}
                  className="btn-primary w-full py-3 rounded-xl font-bold"
                >
                  Start Scanning
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Ensure you are in a well-lit environment for better accuracy.
              </p>
            </div>
          )}

          <div className="text-center mt-6">
            <a href="#" className="text-sm font-medium text-slate-400 hover:text-primary transition-colors">
              Forgot password?
            </a>
          </div>
        </div>
        
        <p className="text-center text-slate-400 text-sm mt-8">
          &copy; 2026 Smart Attendance Pro. All rights reserved.
        </p>
      </div>

      {/* Face Scanning Modal */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] overflow-hidden relative shadow-2xl">
            <button 
              onClick={() => setIsScanning(false)}
              className="absolute top-6 right-6 p-2 bg-black/10 hover:bg-black/20 rounded-full text-slate-800 z-10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-10 text-center">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Face Identity</h2>
              <p className="text-slate-500 mb-8">Position your face within the frame</p>

              <div className="relative aspect-square max-w-[300px] mx-auto rounded-[3rem] overflow-hidden border-4 border-primary/20 shadow-inner bg-slate-100">
                {!isVerifying ? (
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover"
                    videoConstraints={{ facingMode: "user" }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="text-primary font-bold animate-pulse">Verifying Identity...</p>
                  </div>
                )}
                
                {/* Scanner Frame Overlay */}
                {!isVerifying && (
                  <div className="absolute inset-0 border-[20px] border-slate-900/10 pointer-events-none">
                    <div className="absolute inset-0 border-2 border-primary/50 animate-pulse rounded-[2rem]" />
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary/50 shadow-[0_0_15px_rgba(0,108,73,0.5)] animate-scan-y" />
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center justify-center gap-2">
                  <X className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-10 flex gap-4">
                <button
                  onClick={() => setIsScanning(false)}
                  className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={capture}
                  disabled={isVerifying}
                  className="flex-1 px-6 py-4 rounded-2xl btn-primary font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Capture & Verify
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add scanner animation to styles */}
      <style>{`
        @keyframes scan-y {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
        .animate-scan-y {
          animation: scan-y 3s ease-in-out infinite;
          position: absolute;
        }
      `}</style>
    </div>
  );
};

export default Login;
