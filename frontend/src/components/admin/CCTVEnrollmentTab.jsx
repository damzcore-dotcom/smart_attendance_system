import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, AlertCircle, Upload, Loader2, CheckCircle, XCircle, ScanFace } from 'lucide-react';
import api from '../../services/api';

const CCTVEnrollmentTab = ({ employee }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [enrollmentStatus, setEnrollmentStatus] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setEnrollmentStatus(null);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg('Gagal mengakses kamera: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  const startCapture = async () => {
    if (!employee?.dbId || !cameraActive) return;
    setCapturing(true);
    setEnrollmentStatus('capturing');
    setCapturedImages([]);
    setErrorMsg('');

    const images = [];
    const totalShots = 15;

    for (let i = 0; i < totalShots; i++) {
      await new Promise(r => setTimeout(r, 600));
      const img = captureFrame();
      if (img) {
        images.push(img);
        setCapturedImages([...images]);
      }
    }

    setCapturing(false);

    if (images.length >= 10) {
      setEnrollmentStatus('processing');
      processEnrollment(images);
    } else {
      setEnrollmentStatus('error');
      setErrorMsg(`Hanya ${images.length} foto berhasil diambil. Minimal 10 diperlukan.`);
    }
  };

  const processEnrollment = async (images) => {
    try {
      const embeddings = [];

      for (const imgData of images) {
        const fetchRes = await fetch(imgData);
        if(!fetchRes.ok) continue;
        const blob = await fetchRes.blob();
        
        const formData = new FormData();
        formData.append('file', blob, 'face.jpg');
        formData.append('employee_id', employee.employeeCode);

        try {
          const aiUrl = import.meta.env.VITE_AI_ENGINE_URL || 'http://localhost:8001';
          const response = await fetch(`${aiUrl}/enroll?employee_id=${employee.employeeCode}`, {
            method: 'POST',
            body: formData
          });
          const result = await response.json();
          if (result.success && result.embedding) {
            embeddings.push(result.embedding);
          }
        } catch (e) {
          console.warn('Single frame enrollment failed:', e);
        }
      }

      if (embeddings.length < 5) {
        setEnrollmentStatus('error');
        setErrorMsg(`Hanya ${embeddings.length} embedding diekstrak. Pastikan cahaya cukup.`);
        return;
      }

      const avgEmbedding = embeddings[0].map((_, idx) => {
        const sum = embeddings.reduce((acc, emb) => acc + emb[idx], 0);
        return sum / embeddings.length;
      });

      await api.post('/bridge/enrollment/save', {
        employeeId: employee.employeeCode,
        embedding: avgEmbedding,
        samplesCount: embeddings.length,
      });

      setEnrollmentStatus('success');
    } catch (err) {
      setEnrollmentStatus('error');
      setErrorMsg('Gagal memproses: ' + (err.response?.data?.message || err.message));
    }
  };

  if (!employee?.dbId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h4 className="text-lg font-bold text-slate-800">Save Employee First</h4>
        <p className="text-sm text-slate-500 mt-2">
          Anda harus menyimpan (Save) data karyawan ini terlebih dahulu sebelum melakukan pendaftaran wajah CCTV.
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center pb-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
            <ScanFace className="w-5 h-5" /> Registrasi CCTV Face (InsightFace)
          </h4>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600">
          <strong className="text-slate-800">Petunjuk:</strong> Modul ini mendaftarkan wajah karyawan spesifik untuk <strong>Kamera CCTV</strong> (High Accuracy AI), berbeda dengan wajah untuk Tablet/Webcam. Pastikan wajah terlihat jelas.
        </div>

        <div className="relative bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center border border-slate-200 shadow-sm">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          
          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Camera className="w-12 h-12 opacity-50" />
              <p className="text-sm font-medium">Kamera belum aktif</p>
            </div>
          )}

          {capturing && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10">
              <div className="bg-white/95 rounded-2xl px-8 py-6 text-center shadow-2xl">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-base font-bold text-slate-800 mb-1">Merekam Wajah...</p>
                <p className="text-xs font-semibold text-blue-600">({capturedImages.length}/15 foto)</p>
                <p className="text-[10px] text-slate-500 mt-2">Gerakkan kepala perlahan</p>
              </div>
            </div>
          )}
          
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex gap-3 justify-center">
          {!cameraActive ? (
            <button
              type="button"
              onClick={startCamera}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm"
            >
              <Camera className="w-4 h-4" /> Aktifkan Kamera
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={startCapture}
                disabled={capturing || enrollmentStatus === 'processing'}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Mulai Rekam (15 frame)
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-all"
              >
                Matikan
              </button>
            </>
          )}
        </div>

        {/* Status Messages */}
        {enrollmentStatus === 'processing' && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm font-medium text-blue-800 animate-in fade-in">
            <Loader2 className="w-5 h-5 animate-spin" /> Memproses AI Embedding ke Server...
          </div>
        )}
        {enrollmentStatus === 'success' && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-bold text-emerald-800 animate-in fade-in">
            <CheckCircle className="w-5 h-5" /> Registrasi CCTV Berhasil!
          </div>
        )}
        {enrollmentStatus === 'error' && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm font-medium text-rose-800 animate-in fade-in">
            <XCircle className="w-5 h-5 shrink-0" /> {errorMsg}
          </div>
        )}
        {errorMsg && !enrollmentStatus && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm font-medium text-rose-800 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" /> {errorMsg}
          </div>
        )}

      </div>
    </div>
  );
};

export default CCTVEnrollmentTab;
