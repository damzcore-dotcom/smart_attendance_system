import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, UserCheck, AlertCircle, Upload, Loader2, CheckCircle, XCircle, ScanFace, Search, RotateCcw } from 'lucide-react';
import api, { employeeAPI } from '../../services/api';

const FaceEnrollment = () => {
  const queryClient = useQueryClient();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownRef = useRef(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [capturedImages, setCapturedImages] = useState([]);
  const [collectedEmbeddings, setCollectedEmbeddings] = useState([]);
  const [enrollmentStatus, setEnrollmentStatus] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const streamRef = useRef(null);
  const [phaseIndex, setPhaseIndex] = useState(-1);
  const [phaseState, setPhaseState] = useState('idle'); // idle | countdown | verifying | success | failed
  const [countdown, setCountdown] = useState(3);

  const phases = [
    { title: "Tatap Depan", desc: "Tatap lurus ke arah kamera", icon: "⬆️" },
    { title: "Tengok Kiri", desc: "Tengokkan wajah ke arah kiri Anda", icon: "⬅️" },
    { title: "Tengok Kanan", desc: "Tengokkan wajah ke arah kanan Anda", icon: "➡️" },
    { title: "Tengok Atas", desc: "Angkat dagu sedikit ke atas", icon: "🔼" },
    { title: "Tengok Bawah", desc: "Tundukkan wajah sedikit ke bawah", icon: "🔽" },
  ];

  const envUrl = import.meta.env.VITE_AI_ENGINE_URL;
  const aiUrl = (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1'))
    ? envUrl
    : `${window.location.protocol}//${window.location.hostname}:8002`;

  // Data Options
  const { data: optionsData } = useQuery({
    queryKey: ['master-options'],
    queryFn: () => employeeAPI.getMasterOptions({}),
  });
  const masterOptions = optionsData?.data || { departments: [], positions: [], sections: [] };

  // Fetch employees
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-enrollment', { search: searchQuery, dept: deptFilter, position: positionFilter, excludeBhl: true }],
    queryFn: () => employeeAPI.getAll({ search: searchQuery, dept: deptFilter, position: positionFilter, limit: 100, excludeBhl: true }),
    keepPreviousData: true,
  });
  const filteredEmployees = employeesData?.data || [];

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setEnrollmentStatus(null);
      setErrorMsg('');
      setPhaseIndex(-1);
      setPhaseState('idle');
      setCapturedImages([]);
      setCollectedEmbeddings([]);
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

  // Send single image to AI Engine — uses integer ID
  const sendToAI = async (imgData) => {
    const fetchRes = await fetch(imgData);
    const blob = await fetchRes.blob();
    const formData = new FormData();
    formData.append('file', blob, 'face.jpg');

    const empId = selectedEmployee.id; // integer from DB
    const response = await fetch(`${aiUrl}/enroll?employee_id=${empId}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Engine Error ${response.status}: ${errText}`);
    }

    const result = await response.json();
    if (result.success && result.embedding) {
      return result.embedding;
    }
    throw new Error(result.detail || 'Wajah tidak terdeteksi dalam gambar');
  };

  const startSequence = () => {
    if (!selectedEmployee || !cameraActive) return;
    setCapturedImages([]);
    setCollectedEmbeddings([]);
    setErrorMsg('');
    setEnrollmentStatus('capturing');
    beginPhase(0, [], []);
  };

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
        captureAndVerify(index, currentImages, currentEmbs);
      }
    };
    countdownRef.current = setTimeout(tick, 1000);
  };

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
        setCollectedEmbeddings(newEmbs);
        setPhaseState('success');
  
        setTimeout(() => {
          if (index + 1 < phases.length) {
            beginPhase(index + 1, newImages, newEmbs);
          } else {
            finalizeEnrollment(newEmbs);
          }
        }, 1000);
      } catch (err) {
        setPhaseState('failed');
        setErrorMsg(`Fase "${phases[index].title}" gagal: ${err.message}`);
      }
    };
  
    const retryPhase = () => {
      if (phaseIndex >= 0 && phaseIndex < phases.length) {
        beginPhase(phaseIndex, capturedImages, collectedEmbeddings);
      }
    };

  const finalizeEnrollment = async (allEmbeddings) => {
    setPhaseState('idle');
    setPhaseIndex(-1);
    setEnrollmentStatus('processing');

    try {
      const avgEmbedding = allEmbeddings[0].map((_, idx) => {
        const sum = allEmbeddings.reduce((acc, emb) => acc + emb[idx], 0);
        return sum / allEmbeddings.length;
      });

      const dbIdVal = selectedEmployee.dbId || selectedEmployee.id;

      await api.put(`/employees/${dbIdVal}`, {
        faceEmbeddingV2: avgEmbedding,
        faceSamples: allEmbeddings.length,
        faceStatus: 'ENROLLED',
      });

      setEnrollmentStatus('success');
      setSelectedEmployee(prev => ({ ...prev, faceEmbeddingV2: avgEmbedding, faceStatus: 'ENROLLED' }));
      queryClient.invalidateQueries({ queryKey: ['employees-enrollment'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err) {
      setEnrollmentStatus('error');
      setErrorMsg('Gagal menyimpan: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <ScanFace className="w-7 h-7 text-blue-600" />
          CCTV Face Enrollment
        </h1>
        <p className="text-sm text-slate-500 mt-1">Registrasi wajah karyawan untuk pengenalan via CCTV (InsightFace 512-dim)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Selection */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4" /> Pilih Karyawan
          </h3>

          <div className="space-y-3 pb-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Cari nama / NIK..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 outline-none">
                <option value="">Semua Dept</option>
                {masterOptions.departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 outline-none">
                <option value="">Semua Rank</option>
                {masterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
            {loadingEmployees ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : filteredEmployees.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Tidak ada karyawan ditemukan</p>
            ) : (
              filteredEmployees.map(emp => (
                <button key={emp.id}
                  onClick={() => { setSelectedEmployee(emp); setEnrollmentStatus(null); setCapturedImages([]); setCollectedEmbeddings([]); setPhaseIndex(-1); setPhaseState('idle'); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group ${
                    selectedEmployee?.id === emp.id ? 'bg-blue-50 border border-blue-200 text-blue-800 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                  }`}>
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
            <strong className="text-slate-800">Cara Kerja:</strong> Sistem memandu 5 sisi wajah. Setiap foto <strong>langsung diverifikasi</strong> oleh AI. Jika gagal, klik "Ulangi Fase" tanpa mulai dari awal.
          </div>

          {/* Camera feed */}
          <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video border border-slate-200 shadow-sm">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            
            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 space-y-3 z-20">
                <Camera className="w-12 h-12" />
                <p className="text-sm">Kamera belum aktif</p>
              </div>
            )}

            {/* Employee overlay */}
            {selectedEmployee && cameraActive && (
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm z-30">
                {selectedEmployee.name} ({selectedEmployee.employeeCode})
              </div>
            )}

            {/* HUD Overlay */}
            {phaseIndex >= 0 && phaseIndex < phases.length && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-between p-5">
                <div className="bg-blue-600/90 backdrop-blur text-white px-6 py-2 rounded-full shadow-xl">
                  <p className="font-bold text-base uppercase tracking-wider">
                    {phases[phaseIndex].icon} {phases[phaseIndex].title} ({phaseIndex + 1}/{phases.length})
                  </p>
                </div>

                <div className="flex items-center justify-center">
                  {phaseState === 'countdown' && (
                    <span className="text-8xl font-black text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]">{countdown}</span>
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

                <div className="bg-black/50 backdrop-blur text-white px-6 py-3 rounded-2xl shadow-lg border border-white/20 text-center">
                  <p className="text-sm font-medium">{phases[phaseIndex].desc}</p>
                </div>
              </div>
            )}
          </div>

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

          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            {!cameraActive ? (
              <button onClick={startCamera}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm">
                <Camera className="w-4 h-4" /> Aktifkan Kamera
              </button>
            ) : (
              <>
                {phaseState === 'idle' && enrollmentStatus !== 'processing' && enrollmentStatus !== 'success' && (
                  <button onClick={startSequence}
                    disabled={!selectedEmployee}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm">
                    <Upload className="w-4 h-4" /> Mulai Panduan Wajah (5 Sisi)
                  </button>
                )}
                {phaseState === 'failed' && (
                  <button onClick={retryPhase}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-all flex items-center gap-2 shadow-sm animate-bounce">
                    <RotateCcw className="w-4 h-4" /> Ulangi Fase Ini
                  </button>
                )}
                <button onClick={stopCamera}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-all">
                  Matikan Kamera
                </button>
              </>
            )}
          </div>

          {/* Status */}
          {enrollmentStatus === 'processing' && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" /> Menyimpan rata-rata 5 embedding ke database...
            </div>
          )}
          {enrollmentStatus === 'success' && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <CheckCircle className="w-5 h-5 shrink-0" /> Registrasi 5-Sisi berhasil! Wajah {selectedEmployee?.name} telah tersimpan.
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <XCircle className="w-5 h-5 shrink-0" /> {errorMsg}
            </div>
          )}

          {/* Captured thumbnails */}
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
    </div>
  );
};

export default FaceEnrollment;
