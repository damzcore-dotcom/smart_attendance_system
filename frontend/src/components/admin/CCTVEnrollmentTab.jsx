import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, AlertCircle, Upload, Loader2, CheckCircle, XCircle, ScanFace, RotateCcw } from 'lucide-react';
import api from '../../services/api';
import { getAiEngineUrl } from '../../utils/aiEngine';

const CCTVEnrollmentTab = ({ employee, onEnrollmentComplete }) => {
  const queryClient = useQueryClient();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [embeddings, setEmbeddings] = useState([]);
  const [enrollmentStatus, setEnrollmentStatus] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [phaseIndex, setPhaseIndex] = useState(-1);
  const [phaseState, setPhaseState] = useState('idle'); // idle | countdown | verifying | success | failed
  const [countdown, setCountdown] = useState(3);
  const streamRef = useRef(null);
  const countdownRef = useRef(null);

  const phases = [
    { title: "Tatap Depan", desc: "Tatap lurus ke arah kamera", icon: "⬆️" },
    { title: "Tengok Kiri", desc: "Tengokkan wajah ke arah kiri Anda", icon: "⬅️" },
    { title: "Tengok Kanan", desc: "Tengokkan wajah ke arah kanan Anda", icon: "➡️" },
    { title: "Tengok Atas", desc: "Angkat dagu sedikit ke atas", icon: "🔼" },
    { title: "Tengok Bawah", desc: "Tundukkan wajah sedikit ke bawah", icon: "🔽" },
  ];

  const aiUrl = getAiEngineUrl();

  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  useEffect(() => {
    const detectDevices = async () => {
      try {
        // Request temporary permission to populate labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(videoInputs);
        if (videoInputs.length > 0) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
        if (tempStream) {
          tempStream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        console.error('Failed to list video devices:', err);
      }
    };
    detectDevices();
  }, []);

  const startCamera = async (deviceId) => {
    const actualDeviceId = (deviceId && typeof deviceId === 'string') ? deviceId : selectedDeviceId;
    try {
      const constraints = {
        video: { 
          width: 640, 
          height: 480,
          deviceId: actualDeviceId ? { exact: actualDeviceId } : undefined
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setEnrollmentStatus(null);
      setErrorMsg('');
      setPhaseIndex(-1);
      setPhaseState('idle');
      setCapturedImages([]);
      setEmbeddings([]);
    } catch (err) {
      setErrorMsg('Gagal mengakses kamera: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setPhaseIndex(-1);
    setPhaseState('idle');
  };

  useEffect(() => () => stopCamera(), []);

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

  // Send to AI engine and verify
  const sendToAI = async (imgData) => {
    const fetchRes = await fetch(imgData);
    const blob = await fetchRes.blob();
    const formData = new FormData();
    formData.append('file', blob, 'face.jpg');

    // employee.dbId is integer — AI Engine expects int
    const empId = employee.dbId || employee.id;
    const response = await fetch(`${aiUrl}/enroll?employee_id=${empId}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson.detail || '';
      } catch (e) {
        detail = await response.text();
      }
      if (response.status === 403 && detail.toLowerCase().includes('liveness')) {
         throw new Error("Liveness gagal: Jangan gunakan foto! Tampilkan wajah asli Anda.");
      }
      throw new Error(detail || `AI Engine Error ${response.status}`);
    }

    const result = await response.json();
    if (result.success && result.embedding) {
      return result.embedding;
    }
    throw new Error(result.detail || 'Wajah tidak terdeteksi dalam gambar');
  };

  // Start the guided sequence from phase 0
  const startSequence = () => {
    if (!employee?.dbId || !cameraActive) return;
    setCapturedImages([]);
    setEmbeddings([]);
    setErrorMsg('');
    setEnrollmentStatus('capturing');
    beginPhase(0, [], []);
  };

  // Begin a specific phase with countdown
  const beginPhase = (index, currentImages, currentEmbs) => {
    setPhaseIndex(index);
    setPhaseState('countdown');
    setErrorMsg('');
    let count = 3;
    setCountdown(count);

    const tick = () => {
      count--;
      if (count > 0) {
        setCountdown(count);
        countdownRef.current = setTimeout(tick, 1000);
      } else {
        setCountdown(0);
        // Capture and verify
        captureAndVerify(index, currentImages, currentEmbs);
      }
    };
    countdownRef.current = setTimeout(tick, 1000);
  };

  // Capture frame and send to AI for verification
  const captureAndVerify = async (index, currentImages, currentEmbs) => {
    setPhaseState('verifying');
    const img = captureFrame();
    if (!img) {
      setPhaseState('failed');
      setErrorMsg('Kamera gagal menangkap gambar.');
      return;
    }

    try {
      const emb = await sendToAI(img);
      // SUCCESS
      const newImages = [...currentImages, img];
      const newEmbs = [...currentEmbs, emb];
      setCapturedImages(newImages);
      setEmbeddings(newEmbs);
      setPhaseState('success');

      // Auto-advance after short delay
      setTimeout(() => {
        if (index + 1 < phases.length) {
          beginPhase(index + 1, newImages, newEmbs);
        } else {
          // All phases done — finalize
          finalizeEnrollment(newEmbs);
        }
      }, 1000);
    } catch (err) {
      setPhaseState('failed');
      setErrorMsg(`Fase "${phases[index].title}" gagal: ${err.message}`);
    }
  };

  // Retry current phase (user clicks button, no auto-loop)
  const retryPhase = () => {
    if (phaseIndex >= 0 && phaseIndex < phases.length) {
      beginPhase(phaseIndex, capturedImages, embeddings);
    }
  };

  // Save averaged embedding to database
  const finalizeEnrollment = async (allEmbeddings) => {
    setPhaseState('idle');
    setPhaseIndex(-1);
    setEnrollmentStatus('processing');

    try {
      const dbIdVal = employee.dbId || employee.id;
      await api.put(`/employees/${dbIdVal}`, {
        faceEmbeddingV2: allEmbeddings,
        faceSamples: allEmbeddings.length,
        faceStatus: 'ENROLLED',
      });

      setEnrollmentStatus('success');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', dbIdVal] });

      if (onEnrollmentComplete) {
        onEnrollmentComplete({
          faceStatus: 'ENROLLED',
          faceEmbeddingV2: allEmbeddings,
          faceSamples: allEmbeddings.length
        });
      }
    } catch (err) {
      setEnrollmentStatus('error');
      setErrorMsg('Gagal menyimpan ke server: ' + (err.response?.data?.message || err.message));
    }
  };

  if (!employee?.dbId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h4 className="text-lg font-bold text-slate-800">Simpan Karyawan Dahulu</h4>
        <p className="text-sm text-slate-500 mt-2">
          Simpan data karyawan ini terlebih dahulu sebelum melakukan pendaftaran wajah CCTV.
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center pb-8">
      <div className="w-full max-w-lg space-y-5">
        <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
          <ScanFace className="w-5 h-5" /> Registrasi CCTV Face (InsightFace)
        </h4>

        {employee?.faceStatus === 'ENROLLED' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">Wajah CCTV Terdaftar</p>
              <p className="text-xs text-emerald-600">Karyawan ini sudah terdaftar untuk deteksi CCTV ({employee.faceSamples || 5} sampel wajah).</p>
            </div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600">
          <strong className="text-slate-800">Cara Kerja:</strong> Sistem akan memandu Anda mengambil foto wajah dari 5 sisi.
          Setiap foto <strong>langsung diverifikasi</strong> oleh AI Engine. Jika gagal, Anda bisa klik "Ulangi" tanpa perlu mulai dari awal.
        </div>

        {/* Camera Preview */}
        <div className="relative bg-slate-900 rounded-2xl overflow-hidden aspect-video border border-slate-200 shadow-sm">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          
          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 space-y-3 z-20">
              <Camera className="w-12 h-12 opacity-50" />
              <p className="text-sm font-medium">Kamera belum aktif</p>
            </div>
          )}

          {/* HUD Overlay */}
          {phaseIndex >= 0 && phaseIndex < phases.length && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-between p-5">
              {/* Phase title */}
              <div className="bg-blue-600/90 backdrop-blur text-white px-6 py-2 rounded-full shadow-xl">
                <p className="font-bold text-base uppercase tracking-wider">
                  {phases[phaseIndex].icon} {phases[phaseIndex].title} ({phaseIndex + 1}/{phases.length})
                </p>
              </div>

              {/* Center indicator */}
              <div className="flex items-center justify-center">
                {phaseState === 'countdown' && (
                  <span className="text-8xl font-black text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]">
                    {countdown}
                  </span>
                )}
                {phaseState === 'verifying' && (
                  <div className="bg-white/90 rounded-2xl px-8 py-5 text-center backdrop-blur shadow-2xl">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">Memverifikasi wajah...</p>
                  </div>
                )}
                {phaseState === 'success' && (
                  <div className="bg-emerald-500/90 rounded-2xl px-8 py-5 text-center backdrop-blur shadow-2xl">
                    <CheckCircle className="w-10 h-10 text-white mx-auto mb-2" />
                    <p className="text-sm font-bold text-white">Berhasil!</p>
                  </div>
                )}
                {phaseState === 'failed' && (
                  <div className="bg-rose-500/90 rounded-2xl px-8 py-5 text-center backdrop-blur shadow-2xl">
                    <XCircle className="w-10 h-10 text-white mx-auto mb-2" />
                    <p className="text-sm font-bold text-white">Gagal Terbaca</p>
                  </div>
                )}
              </div>

              {/* Instruction */}
              <div className="bg-black/50 backdrop-blur text-white px-6 py-3 rounded-2xl shadow-lg border border-white/20 text-center">
                <p className="text-sm font-medium">{phases[phaseIndex].desc}</p>
              </div>
            </div>
          )}
          
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Camera Select Dropdown */}
        {videoDevices.length > 1 && (
          <div className="flex justify-center">
            <div className="w-full max-w-xs flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                Pilih Kamera
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedDeviceId(newId);
                  if (cameraActive) {
                    stopCamera();
                    setTimeout(() => startCamera(newId), 100);
                  }
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {videoDevices.map((device, idx) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Kamera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex gap-2 justify-center">
          {phases.map((p, idx) => (
            <div key={p.title} className="flex flex-col items-center gap-1">
              <div className={`w-14 h-2 rounded-full transition-all duration-300 ${
                idx < capturedImages.length ? 'bg-emerald-500' : 
                idx === phaseIndex ? 'bg-blue-500 animate-pulse' : 'bg-slate-200'
              }`} />
              <span className="text-[9px] text-slate-400 font-medium">{p.title.split(' ')[1] || 'Depan'}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-3 justify-center flex-wrap">
          {!cameraActive ? (
            <button type="button" onClick={() => startCamera(selectedDeviceId)}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm">
              <Camera className="w-4 h-4" /> Aktifkan Kamera
            </button>
          ) : (
            <>
              {phaseState === 'idle' && enrollmentStatus !== 'processing' && enrollmentStatus !== 'success' && (
                <button type="button" onClick={startSequence}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm">
                  <Upload className="w-4 h-4" /> Mulai Panduan (5 Sisi)
                </button>
              )}
              {phaseState === 'failed' && (
                <button type="button" onClick={retryPhase}
                  className="px-6 py-3 bg-amber-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-amber-600 transition-all flex items-center gap-2 shadow-sm animate-bounce">
                  <RotateCcw className="w-4 h-4" /> Ulangi Fase Ini
                </button>
              )}
              <button type="button" onClick={stopCamera}
                className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-all">
                Matikan
              </button>
            </>
          )}
        </div>

        {/* Status Messages */}
        {enrollmentStatus === 'processing' && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm font-medium text-blue-800">
            <Loader2 className="w-5 h-5 animate-spin shrink-0" /> Menyimpan 5 sampel embedding wajah ke database...
          </div>
        )}
        {enrollmentStatus === 'success' && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-bold text-emerald-800">
            <CheckCircle className="w-5 h-5 shrink-0" /> Registrasi Wajah 5-Sisi Berhasil Tersimpan!
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm font-medium text-rose-800">
            <XCircle className="w-5 h-5 shrink-0" /> {errorMsg}
          </div>
        )}

        {/* Thumbnails */}
        {capturedImages.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2 font-medium">Foto terverifikasi ({capturedImages.length}/{phases.length})</p>
            <div className="flex gap-2 flex-wrap">
              {capturedImages.map((img, i) => (
                <div key={i} className="relative">
                  <img src={img} alt={phases[i]?.title} className="w-16 h-16 rounded-lg object-cover border-2 border-emerald-400 shadow-sm" />
                  <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full w-4 h-4 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center py-0.5 rounded-b-lg">
                    {phases[i]?.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CCTVEnrollmentTab;
