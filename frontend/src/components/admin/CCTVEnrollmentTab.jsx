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
  
  // Interactive Phase variables
  const [phaseIndex, setPhaseIndex] = useState(-1);
  const [countdown, setCountdown] = useState(3);
  
  const streamRef = useRef(null);
  
  const phases = [
    { title: "Tatap Depan", desc: "Tatap lurus ke arah kamera", id: 'front' },
    { title: "Tengok Atas", desc: "Angkat dagu sedikit ke atas", id: 'up' },
    { title: "Tengok Bawah", desc: "Tundukkan wajah sedikit", id: 'down' },
    { title: "Tengok Kiri", desc: "Tengokkan wajah ke arah kiri", id: 'left' },
    { title: "Tengok Kanan", desc: "Tengokkan wajah ke arah kanan", id: 'right' },
  ];

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
      setPhaseIndex(-1);
      setCapturedImages([]);
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
    setPhaseIndex(-1);
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

  const startSequence = () => {
    if (!employee?.dbId || !cameraActive) return;
    setCapturing(true);
    setEnrollmentStatus('capturing');
    setCapturedImages([]);
    setErrorMsg('');
    runPhase(0, []);
  };

  const runPhase = (index, currentImages) => {
    if (index >= phases.length) {
      // Selesai semua fase
      setCapturing(false);
      setPhaseIndex(-1);
      setEnrollmentStatus('processing');
      processEnrollment(currentImages);
      return;
    }

    setPhaseIndex(index);
    let count = 3;
    setCountdown(count);

    const intv = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(intv);
        // SNAP
        const img = captureFrame();
        if (img) {
          const newImages = [...currentImages, img];
          setCapturedImages(newImages);
          // Beri jeda 800ms sebelum fase berikutnya
          setTimeout(() => {
            runPhase(index + 1, newImages);
          }, 800);
        } else {
          // Gagal snap
          setCapturing(false);
          setPhaseIndex(-1);
          setEnrollmentStatus('error');
          setErrorMsg('Kamera gagal menangkap gambar.');
        }
      }
    }, 1000);
  };

  const processEnrollment = async (images) => {
    try {
      const embeddings = [];
      const aiUrl = import.meta.env.VITE_AI_ENGINE_URL || `${window.location.protocol}//${window.location.hostname}:8001`;

      for (const imgData of images) {
        const fetchRes = await fetch(imgData);
        if(!fetchRes.ok) continue;
        const blob = await fetchRes.blob();
        
        const formData = new FormData();
        formData.append('file', blob, 'face.jpg');
        formData.append('employee_id', employee.employeeCode);

        try {
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

      if (embeddings.length < 3) {
        setEnrollmentStatus('error');
        setErrorMsg(`Hanya ${embeddings.length} embedding diekstrak. Pastikan cahaya cukup & wajah terlihat.`);
        return;
      }

      // Hitung mean embedding
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
      setErrorMsg('Gagal menyimpan: ' + (err.response?.data?.message || err.message));
    }
  };

  if (!employee?.dbId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h4 className="text-lg font-bold text-slate-800">Save Employee First</h4>
        <p className="text-sm text-slate-500 mt-2">
          Simpan data karyawan ini terlebih dahulu sebelum melakukan pendaftaran wajah CCTV.
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
          <strong className="text-slate-800">Sistem Guiding:</strong> Pendaftaran wajah akan dipandu menjadi 5 sisi (Depan, Atas, Bawah, Kiri, Kanan) agar deteksi CCTV saat bergerak lebih optimal.
        </div>

        <div className="relative bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center border border-slate-200 shadow-sm transition-all">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          
          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 space-y-3 z-20">
              <Camera className="w-12 h-12 opacity-50" />
              <p className="text-sm font-medium">Kamera belum aktif</p>
            </div>
          )}

          {/* Guiding HUD */}
          {capturing && phaseIndex >= 0 && phaseIndex < phases.length && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-between p-6 bg-black/30">
              <div className="bg-blue-600/90 backdrop-blur text-white px-6 py-2.5 rounded-full shadow-xl animate-in slide-in-from-top fade-in">
                <p className="font-bold text-lg uppercase tracking-wider">{phases[phaseIndex].title}</p>
              </div>
              
              <div className="flex items-center justify-center">
                <span className="text-7xl font-extrabold text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-pulse">
                  {countdown}
                </span>
              </div>
              
              <div className="bg-black/50 backdrop-blur text-white px-6 py-3 rounded-2xl shadow-lg border border-white/20 text-center animate-in slide-in-from-bottom fade-in">
                <p className="text-sm font-medium">{phases[phaseIndex].desc}</p>
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
                onClick={startSequence}
                disabled={capturing || enrollmentStatus === 'processing'}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Mulai Panduan (5 Sisi)
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

        {/* Phase Progress Bar */}
        {capturedImages.length > 0 && (
          <div className="flex gap-2 justify-center">
            {phases.map((p, idx) => (
              <div key={p.id} className={`w-12 h-1.5 rounded-full transition-all duration-300 ${idx < capturedImages.length ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            ))}
          </div>
        )}

        {/* Status Messages */}
        {enrollmentStatus === 'processing' && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm font-medium text-blue-800 animate-in fade-in">
            <Loader2 className="w-5 h-5 animate-spin" /> Memproses AI Embedding dari 5 sisi wajah ke Server...
          </div>
        )}
        {enrollmentStatus === 'success' && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-bold text-emerald-800 animate-in fade-in">
            <CheckCircle className="w-5 h-5" /> Registrasi Wajah 5-Sisi Berhasil Tersimpan!
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
