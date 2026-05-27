import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, UserCheck, AlertCircle, RefreshCw, Upload, Loader2, CheckCircle, XCircle, ScanFace } from 'lucide-react';
import api from '../../services/api';

const FaceEnrollment = () => {
  const queryClient = useQueryClient();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [enrollmentStatus, setEnrollmentStatus] = useState(null); // null | 'capturing' | 'processing' | 'success' | 'error'
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const streamRef = useRef(null);

  // Interactive Phase variables
  const [phaseIndex, setPhaseIndex] = useState(-1);
  const [countdown, setCountdown] = useState(3);
  
  const phases = [
    { title: "Tatap Depan", desc: "Tatap lurus ke arah kamera", id: 'front' },
    { title: "Tengok Atas", desc: "Angkat dagu sedikit ke atas", id: 'up' },
    { title: "Tengok Bawah", desc: "Tundukkan wajah sedikit", id: 'down' },
    { title: "Tengok Kiri", desc: "Tengokkan wajah ke arah kiri", id: 'left' },
    { title: "Tengok Kanan", desc: "Tengokkan wajah ke arah kanan", id: 'right' },
  ];

  // Fetch employees
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-enrollment'],
    queryFn: () => api.get('/employees').then(r => r.data),
  });
  const employees = employeesData?.data || [];

  // Filter employees
  const filteredEmployees = employees.filter(emp =>
    (emp.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.employeeCode || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Start camera
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

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setPhaseIndex(-1);
  };

  useEffect(() => { return () => stopCamera(); }, []);

  // Capture a frame
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
    if (!selectedEmployee || !cameraActive) return;
    setCapturing(true);
    setEnrollmentStatus('capturing');
    setCapturedImages([]);
    setErrorMsg('');
    runPhase(0, []);
  };

  const runPhase = (index, currentImages) => {
    if (index >= phases.length) {
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
          setTimeout(() => {
            runPhase(index + 1, newImages);
          }, 800);
        } else {
          setCapturing(false);
          setPhaseIndex(-1);
          setEnrollmentStatus('error');
          setErrorMsg('Kamera gagal menangkap gambar.');
        }
      }
    }, 1000);
  };

  // Send to AI Engine for embedding extraction
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
        formData.append('employee_id', selectedEmployee.id);

        try {
          const response = await fetch(`${aiUrl}/enroll?employee_id=${selectedEmployee.id}`, {
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
        setErrorMsg(`Hanya ${embeddings.length} embedding berhasil diekstrak. Pastikan posisi wajah jelas & terang.`);
        return;
      }

      // Average all embeddings to get a robust representation
      const avgEmbedding = embeddings[0].map((_, idx) => {
        const sum = embeddings.reduce((acc, emb) => acc + emb[idx], 0);
        return sum / embeddings.length;
      });

      // Save averaged embedding to backend via bridge
      await api.post('/bridge/enrollment/save', {
        employeeId: selectedEmployee.id,
        embedding: avgEmbedding,
        samplesCount: embeddings.length,
      });

      setEnrollmentStatus('success');
      queryClient.invalidateQueries(['employees-enrollment']);
    } catch (err) {
      setEnrollmentStatus('error');
      setErrorMsg('Gagal memproses enrollment: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <ScanFace className="w-7 h-7 text-blue-600" />
            CCTV Face Enrollment
          </h1>
          <p className="text-sm text-slate-500 mt-1">Registrasi wajah karyawan untuk pengenalan via CCTV (InsightFace 512-dim)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Selection */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4" /> Pilih Karyawan
          </h3>

          <input
            type="text"
            placeholder="Cari nama / kode karyawan..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="max-h-96 overflow-y-auto space-y-1">
            {loadingEmployees ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : filteredEmployees.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Tidak ada karyawan ditemukan</p>
            ) : (
              filteredEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { setSelectedEmployee(emp); setEnrollmentStatus(null); setCapturedImages([]); setPhaseIndex(-1); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group ${
                    selectedEmployee?.id === emp.id
                      ? 'bg-blue-50 border border-blue-200 text-blue-800 font-semibold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-medium">{emp.name}</div>
                    <div className="text-xs text-slate-400">{emp.employeeCode} • {emp.department?.name}</div>
                  </div>
                  {emp.faceEmbeddingV2 ? (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">ENROLLED</span>
                  ) : (
                    <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">PENDING</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Camera + Capture */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
            <Camera className="w-4 h-4" /> Live Camera Preview
          </h3>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
            <strong className="text-slate-800">Sistem Guiding:</strong> Pendaftaran wajah akan dipandu menjadi 5 sisi (Depan, Atas, Bawah, Kiri, Kanan) agar deteksi CCTV lebih optimal saat karyawan berjalan masuk.
          </div>

          {/* Camera feed */}
          <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-slate-200 shadow-sm">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            
            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 space-y-3 z-20">
                <Camera className="w-12 h-12" />
                <p className="text-sm">Kamera belum aktif</p>
              </div>
            )}

            {/* Overlay info */}
            {selectedEmployee && cameraActive && (
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm z-30">
                {selectedEmployee.name} ({selectedEmployee.employeeCode})
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
          </div>

          <div className="flex justify-center mt-2">
            {capturedImages.length > 0 && (
              <div className="flex gap-2">
                {phases.map((p, idx) => (
                  <div key={p.id} className={`w-12 h-1.5 rounded-full transition-all duration-300 ${idx < capturedImages.length ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                ))}
              </div>
            )}
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            {!cameraActive ? (
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm"
              >
                <Camera className="w-4 h-4" /> Aktifkan Kamera
              </button>
            ) : (
              <>
                <button
                  onClick={startSequence}
                  disabled={!selectedEmployee || capturing || enrollmentStatus === 'processing'}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                >
                  {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {capturing ? 'Capturing...' : 'Mulai Panduan Wajah (5 Sisi)'}
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-all"
                >
                  Matikan Kamera
                </button>
              </>
            )}
          </div>

          {/* Status */}
          {enrollmentStatus === 'processing' && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
              <Loader2 className="w-5 h-5 animate-spin" /> Memproses AI embedding dari semua sisi wajah...
            </div>
          )}
          {enrollmentStatus === 'success' && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <CheckCircle className="w-5 h-5" /> Registrasi 5-Sisi berhasil! Wajah {selectedEmployee?.name} telah tersimpan.
            </div>
          )}
          {enrollmentStatus === 'error' && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <XCircle className="w-5 h-5" /> {errorMsg}
            </div>
          )}

          {/* Captured thumbnails */}
          {capturedImages.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2 font-medium">Foto yang diambil ({capturedImages.length}/5)</p>
              <div className="flex gap-2 flex-wrap">
                {capturedImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} alt={`cap-${i}`} className="w-16 h-16 rounded-lg object-cover border border-slate-200 shadow-sm" />
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-[9px] text-white text-center py-0.5 rounded-b-lg trunc">
                      {phases[i]?.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaceEnrollment;
