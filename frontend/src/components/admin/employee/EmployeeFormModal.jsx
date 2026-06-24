import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CreatableSelect from 'react-select/creatable';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import { 
  UserPlus, X, RefreshCw, Camera, Loader2, ScanFace, ShieldCheck, Fingerprint, Upload, Download, AlertCircle, Save
} from 'lucide-react';
import { employeeAPI, getFileUrl } from '../../../services/api';
import CCTVEnrollmentTab from '../CCTVEnrollmentTab';
import EmployeeDocumentsTab from './EmployeeDocumentsTab';

const toSelectOptions = (arr) => arr.map(i => {
  if (typeof i === 'object') return { label: i.name, value: i.name };
  return { label: i, value: i };
});

const customSelectStyles = {
  control: (base, state) => ({
    ...base,
    borderRadius: '0.75rem',
    backgroundColor: '#fff',
    border: state.isFocused ? '1px solid #60a5fa' : '1px solid #e2e8f0',
    padding: '4px',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
    '&:hover': {
      border: state.isFocused ? '1px solid #60a5fa' : '1px solid #cbd5e1'
    }
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#fff',
    borderRadius: '0.75rem',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
    padding: '4px',
    zIndex: 50
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#eff6ff' : 'transparent',
    color: state.isFocused ? '#2563eb' : '#334155',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    padding: '10px 12px',
    '&:active': {
      backgroundColor: '#dbeafe'
    }
  }),
  singleValue: (base) => ({
    ...base,
    color: '#1e293b',
    fontSize: '14px',
    fontWeight: '500'
  }),
  input: (base) => ({
    ...base,
    color: '#1e293b'
  }),
  placeholder: (base) => ({
    ...base,
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: '500'
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 })
};

const EmployeeFormModal = ({
  isOpen,
  closeModal,
  newEmployee,
  setNewEmployee,
  onSubmit,
  isSaving,
  shifts = [],
  devices = [],
  locations = [],
  masterOptions = { grades: [], positions: [], sections: [], employmentStatuses: [], contractDurations: [], departments: [] },
  modelsLoaded = false,
  pushFingerMutation,
  pullFingerMutation,
  activeTab,
  setActiveTab
}) => {
  const { t } = useTranslation();
  const [nikError, setNikError] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [scanStatus, setScanStatus] = useState('ready');
  const [faceGuideStatus, setFaceGuideStatus] = useState('none');
  const [selectedDeviceForFinger, setSelectedDeviceForFinger] = useState('');

  const webcamRef = useRef(null);
  const faceGuideRef = useRef(null);
  const stableCountRef = useRef(0);
  const autoCaptureTriggeredRef = useRef(false);
  const blinkCount = 0; // Prevent reference errors, dummy blink count

  const handleNikBlur = async () => {
    if (!newEmployee.employeeCode || newEmployee.dbId) {
      setNikError('');
      return;
    }
    
    try {
      const res = await employeeAPI.checkNikDuplicate(newEmployee.employeeCode);
      if (res.isDuplicate) {
        setNikError('NIK ini sudah terdaftar di sistem. Gunakan NIK lain.');
      } else {
        setNikError('');
      }
    } catch (err) {
      console.error('Check NIK failed', err);
    }
  };

  const captureFace = async () => {
    if (!webcamRef.current) return;

    setIsCapturing(true);
    setScanStatus('detecting');
    const imageSrc = webcamRef.current.getScreenshot();
    
    if (modelsLoaded) {
      try {
        const img = new Image();
        img.src = imageSrc;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Image failed to load'));
        });

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.15 })).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
          setNewEmployee({...newEmployee, facePhoto: imageSrc, faceDescriptor: JSON.stringify(Array.from(detection.descriptor)), faceId: 'Enrolled' });
          alert('Wajah terdeteksi dan berhasil terdaftar!');
        } else {
          alert('Wajah tidak terdeteksi. Pastikan pencahayaan cukup dan wajah terlihat jelas.');
        }
      } catch (err) {
        console.error('Error processing face:', err);
        alert('Gagal memproses wajah.');
      } finally {
        setScanStatus('ready');
        setIsCapturing(false);
      }
    } else {
      setScanStatus('ready');
      alert('Model AI sedang dimuat. Silakan tunggu sebentar.');
      setIsCapturing(false);
    }
  };

  // Phase 5: Real-time face guide loop
  useEffect(() => {
    if (!modelsLoaded || scanStatus !== 'ready' || !isCameraActive || newEmployee.facePhoto) {
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
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load image'));
        });

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.2 }));
        
        if (detection) {
          setFaceGuideStatus('detected');
          stableCountRef.current++;
          if (stableCountRef.current >= 5 && !autoCaptureTriggeredRef.current) {
            autoCaptureTriggeredRef.current = true;
            clearInterval(faceGuideRef.current);
            faceGuideRef.current = null;
            captureFace();
          }
        } else {
          setFaceGuideStatus('not-detected');
          stableCountRef.current = 0;
        }
      } catch {
        // ignore err
      } finally {
        isProcessing = false;
      }
    }, 500);

    return () => {
      if (faceGuideRef.current) clearInterval(faceGuideRef.current);
      faceGuideRef.current = null;
    };
  }, [modelsLoaded, scanStatus, isCameraActive, newEmployee.facePhoto]);

  const closeFormModal = () => {
    if (faceGuideRef.current) clearInterval(faceGuideRef.current);
    setScanStatus('ready');
    setIsCapturing(false);
    setIsCameraActive(false);
    setFaceGuideStatus('none');
    stableCountRef.current = 0;
    autoCaptureTriggeredRef.current = false;
    setNikError('');
    setActiveTab('basic');
    closeModal();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeFormModal}></div>
      <div className="bg-white w-full max-w-7xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
              <UserPlus className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-xl tracking-tight">
                {newEmployee.dbId ? 'Ubah Data Karyawan' : 'Tambah Karyawan Baru'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Lengkapi semua kolom informasi yang diperlukan</p>
            </div>
          </div>
          <button 
            onClick={closeFormModal} 
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 text-slate-500 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="flex border-b border-slate-100 bg-white px-2 overflow-x-auto hide-scrollbar">
          {(newEmployee.dbId 
            ? ['basic', 'biometric', 'cctv', 'finger', 'hr', 'personal', 'family', 'documents'] 
            : ['basic', 'biometric', 'cctv', 'finger', 'hr', 'personal', 'family']
          ).map(tab => (
            <button 
              key={tab} 
              type="button"
              onClick={() => setActiveTab(tab)} 
              className={`px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all relative whitespace-nowrap ${activeTab === tab ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab === 'basic' ? 'Info Utama' : tab === 'biometric' ? 'Registrasi Wajah' : tab === 'cctv' ? 'Wajah CCTV' : tab === 'finger' ? 'Sidik Jari' : tab === 'hr' ? 'Informasi Kerja' : tab === 'personal' ? 'Data Pribadi' : tab === 'family' ? 'Data Keluarga' : 'Dokumen'}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-600 rounded-t-full"></div>
              )}
            </button>
          ))}
        </div>

        <div className="p-8 overflow-y-auto flex-1 min-h-0 hide-scrollbar bg-slate-50/50">
          <form id="add-emp-form" onSubmit={onSubmit} className="space-y-6">
            {activeTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">NIK (ID Karyawan)</label>
                  <div className="flex gap-2">
                    <input
                      value={newEmployee.employeeCode}
                      onChange={e => { setNewEmployee({...newEmployee, employeeCode: e.target.value}); setNikError(''); }}
                      onBlur={handleNikBlur}
                      readOnly={!!newEmployee.dbId}
                      placeholder={newEmployee.dbId ? '' : 'Dibuat otomatis jika kosong'}
                      className={`flex-1 border rounded-xl px-4 py-3 text-sm transition-all focus:outline-none ${
                        nikError ? 'border-rose-300 bg-rose-50 text-rose-700 focus:ring-2 focus:ring-rose-500/20' : 
                        newEmployee.dbId ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 
                        'bg-white border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400'
                      }`}
                    />
                    {!newEmployee.dbId && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const isBhl = newEmployee.employmentStatus === 'HARIAN' || newEmployee.salaryCategory === 'HARIAN';
                            const res = await employeeAPI.getNextNik(isBhl);
                            if (res.success) {
                              setNewEmployee({...newEmployee, employeeCode: res.nextNik});
                              setNikError('');
                            }
                          } catch (err) {
                            alert(`Gagal membuat NIK: ${err.message}`);
                          }
                        }}
                        className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                      >
                        Oto
                      </button>
                    )}
                  </div>
                  {nikError && (
                    <p className="text-[10px] text-rose-600 mt-1.5 flex items-center gap-1 font-semibold uppercase tracking-wider">
                      <AlertCircle className="w-3.5 h-3.5" /> {nikError}
                    </p>
                  )}
                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">ID Sidik Jari (No. AC)</label>
                    <div className="flex gap-2">
                      <input
                        value={newEmployee.fingerPrintId || ''}
                        onChange={e => setNewEmployee({...newEmployee, fingerPrintId: e.target.value})}
                        placeholder="ID Perangkat"
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-800 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await employeeAPI.getNextFingerId();
                            if (res.success) {
                              setNewEmployee({...newEmployee, fingerPrintId: res.nextFingerId});
                            }
                          } catch (err) {
                            alert(`Gagal membuat ID Sidik Jari: ${err.message}`);
                          }
                        }}
                        className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                      >
                        Oto
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Nama Lengkap</label>
                  <input required value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Alamat Email</label>
                  <input required type="email" value={newEmployee.email} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Departemen</label>
                  <input 
                    list="dept-options"
                    value={newEmployee.dept || ''} 
                    onChange={(e) => setNewEmployee({...newEmployee, dept: e.target.value})}
                    placeholder="Pilih atau ketik..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                  <datalist id="dept-options">
                    {(masterOptions.departments || []).map(opt => <option key={opt.id} value={opt.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Jabatan</label>
                  <input 
                    list="position-options"
                    value={newEmployee.position || ''} 
                    onChange={(e) => setNewEmployee({...newEmployee, position: e.target.value})}
                    placeholder="Pilih atau ketik..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                  <datalist id="position-options">
                    {(masterOptions.positions || []).map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Bagian (Section)</label>
                  <input 
                    list="section-options"
                    value={newEmployee.section || ''} 
                    onChange={(e) => setNewEmployee({...newEmployee, section: e.target.value})}
                    placeholder="Pilih atau ketik..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                  <datalist id="section-options">
                    {(masterOptions.sections || []).map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Pas Foto (Foto Profil)</label>
                  <div className="flex items-center gap-3">
                    {newEmployee.profilePhoto ? (
                      <div className="relative group/pic">
                        <img src={getFileUrl(newEmployee.profilePhoto)} alt="Profile" className="w-24 h-32 rounded-xl object-cover border-2 border-blue-200 shadow-sm" />
                        <button 
                          type="button"
                          onClick={() => setNewEmployee({...newEmployee, profilePhoto: ''})}
                          className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/pic:opacity-100 transition-opacity shadow-md"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-full flex items-center justify-center p-3 border-2 border-dashed border-blue-300 rounded-xl text-blue-500 hover:bg-blue-50 cursor-pointer transition-all">
                        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                          <Camera className="w-4 h-4" /> Unggah Foto (Maks 600px)
                        </span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const img = new Image();
                              img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const MAX_WIDTH = 600;
                                const scaleSize = MAX_WIDTH / img.width;
                                canvas.width = MAX_WIDTH;
                                canvas.height = img.height * scaleSize;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                                setNewEmployee({...newEmployee, profilePhoto: dataUrl});
                              };
                              img.src = event.target.result;
                            };
                            reader.readAsDataURL(file);
                          }} 
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'biometric' && (
              <div className="flex justify-center pb-8">
                <div className="w-full max-w-md space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                      <ScanFace className="w-4 h-4" /> Biometric Capture
                      {newEmployee.faceIdDisplay === 'Enrolled' && (
                        <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-wider rounded-md border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" /> Enrolled
                        </span>
                      )}
                    </label>
                    
                    <div>
                      {newEmployee.facePhoto ? (
                        <button type="button" onClick={() => setNewEmployee({...newEmployee, facePhoto: '', faceDescriptor: null, faceId: 'Pending'})} 
                          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold uppercase tracking-wider rounded-lg text-[10px] flex items-center justify-center gap-2 transition-all border border-rose-200">
                          <RefreshCw className="w-3 h-3" /> Retake
                        </button>
                      ) : !isCameraActive ? (
                        <button type="button" onClick={() => setIsCameraActive(true)} 
                          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold uppercase tracking-wider rounded-lg text-[10px] flex items-center justify-center gap-2 transition-all border border-blue-200 shadow-sm">
                          <Camera className="w-3 h-3" /> Start Camera
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => {
                            if (faceGuideRef.current) clearInterval(faceGuideRef.current);
                            setScanStatus('ready');
                            setIsCapturing(false);
                            setIsCameraActive(false);
                            setFaceGuideStatus('none');
                            stableCountRef.current = 0;
                            autoCaptureTriggeredRef.current = false;
                          }} 
                            className="px-4 py-2 bg-white text-slate-500 font-bold uppercase tracking-wider rounded-lg text-[10px] border border-slate-200 hover:bg-slate-50 transition-all">
                            Cancel
                          </button>
                          <button type="button" disabled={!modelsLoaded || isCapturing} onClick={captureFace} 
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm">
                            {isCapturing ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Processing</>
                            ) : (
                              <><ScanFace className="w-3 h-3" /> Capture</>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="relative">
                    <div className="aspect-[4/3] rounded-2xl overflow-hidden relative bg-slate-100 border border-slate-200 shadow-inner group/cam">
                      {newEmployee.facePhoto ? (
                        <img src={getFileUrl(newEmployee.facePhoto)} alt="Face" className="w-full h-full object-cover" />
                      ) : isCameraActive ? (
                        <>
                          <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user", width: 640, height: 480 }} />
                          {scanStatus === 'liveness' && (
                            <div className="absolute inset-0 bg-indigo-500/10 flex flex-col items-center justify-center backdrop-blur-[1px] z-20">
                               <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg mb-4">
                                 Blink: {blinkCount} / 2
                               </div>
                               <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 transition-all duration-300">
                          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-4 border border-slate-200 shadow-sm group-hover/cam:scale-110 transition-transform">
                            <Camera className="w-6 h-6 text-slate-400 group-hover/cam:text-blue-500" />
                          </div>
                          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Camera Inactive</p>
                        </div>
                      )}
                      
                      {/* HUD Overlay */}
                      {!newEmployee.facePhoto && isCameraActive && (
                        <div className="absolute inset-0 pointer-events-none z-10 p-4">
                          <div className={`absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 rounded-tl-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-blue-500/60'}`} />
                          <div className={`absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 rounded-tr-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-blue-500/60'}`} />
                          <div className={`absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 rounded-bl-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-blue-500/60'}`} />
                          <div className={`absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 rounded-br-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-blue-500/60'}`} />
                          
                          {/* Guide Indicator */}
                          {scanStatus === 'ready' && (
                            <>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className={`w-48 h-48 border rounded-full transition-all duration-300 ${
                                  faceGuideStatus === 'detected' ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse' : 
                                  faceGuideStatus === 'not-detected' ? 'border-orange-500/60' : 
                                  'border-blue-400/30'
                                }`} />
                              </div>

                              {faceGuideStatus === 'detected' && (
                                <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 flex justify-center z-30">
                                  <div className="bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-emerald-100 font-bold uppercase tracking-widest text-[9px] px-3 py-1 rounded-full shadow-lg text-center animate-in zoom-in">
                                    Auto-capture: {stableCountRef.current}/5
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {!isCapturing && modelsLoaded && scanStatus === 'ready' && (
                            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[1px] bg-blue-400/50 animate-[scan_3s_ease-in-out_infinite]" />
                          )}
                        </div>
                      )}
                      
                      {/* AI Processing HUD */}
                      {isCapturing && (
                        <div className="absolute inset-0 bg-blue-900/20 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-20">
                          <Loader2 className="w-10 h-10 text-white animate-spin mb-3" />
                          <p className="text-white text-xs font-bold uppercase tracking-wider animate-pulse">Analyzing...</p>
                        </div>
                      )}
                      
                      {newEmployee.facePhoto && (
                        <div className="absolute inset-0 border-4 border-emerald-500/30 rounded-2xl z-20 pointer-events-none" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'cctv' && (
              <CCTVEnrollmentTab employee={newEmployee} />
            )}
            {activeTab === 'finger' && (
              <div className="flex flex-col items-center justify-center pb-8 space-y-6">
                <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <Fingerprint className="w-5 h-5"/>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">Pendaftaran Sidik Jari</h4>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Sinkronisasi dengan Mesin Absensi</p>
                    </div>
                  </div>

                  {!newEmployee.dbId ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm font-medium flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <p>Silakan <strong className="font-bold">Simpan Karyawan</strong> terlebih dahulu sebelum mendaftarkan sidik jari ke mesin.</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">No. AC / ID Sidik Jari</label>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-slate-700 font-mono font-bold">
                            {newEmployee.fingerPrintId || '-'}
                          </div>
                          {!newEmployee.fingerPrintId && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await employeeAPI.getNextFingerId();
                                  if (res.success) {
                                    const updatedEmployee = { ...newEmployee, fingerPrintId: res.nextFingerId };
                                    setNewEmployee(updatedEmployee);
                                    if (onSubmit) {
                                      // Call parent form onSubmit logic to update the dbId
                                    }
                                  }
                                } catch (err) {
                                  alert(`Gagal membuat ID Sidik Jari: ${err.message}`);
                                }
                              }}
                              className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                            >
                              Buat ID Otomatis
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 ml-1">Jika kosong, ID baru akan dibuat oleh mesin atau Anda dapat mengaturnya di Info Utama.</p>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">Pilih Mesin Absensi</label>
                        <select
                          value={selectedDeviceForFinger}
                          onChange={async (e) => {
                            const deviceId = e.target.value;
                            setSelectedDeviceForFinger(deviceId);
                            if (deviceId && !newEmployee.fingerPrintId) {
                              try {
                                const res = await employeeAPI.getNextFingerId();
                                if (res.success) {
                                  const updatedEmployee = { ...newEmployee, fingerPrintId: res.nextFingerId };
                                  setNewEmployee(updatedEmployee);
                                }
                              } catch (err) {
                                console.error('Failed to auto-generate Finger ID:', err);
                              }
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 appearance-none cursor-pointer"
                        >
                          <option value="">-- Pilih Mesin --</option>
                          {devices.map(d => (
                            <option key={d.id} value={d.id}>{d.name} ({d.ipAddress}) {d.location?.name ? `- Lokasi: ${d.location.name}` : ''}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if(!selectedDeviceForFinger) return alert('Pilih mesin terlebih dahulu!');
                            if (pushFingerMutation) {
                              pushFingerMutation.mutate({ deviceId: selectedDeviceForFinger, employeeIds: [newEmployee.dbId] });
                            }
                          }}
                          disabled={!selectedDeviceForFinger || (pushFingerMutation && pushFingerMutation.isPending)}
                          className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 border border-emerald-200 transition-all disabled:opacity-50"
                        >
                          {pushFingerMutation && pushFingerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                          Kirim ke Mesin
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if(!selectedDeviceForFinger) return alert('Pilih mesin terlebih dahulu!');
                            if(!newEmployee.fingerPrintId) return alert('Tidak ada ID Sidik Jari. Coba Sinkronkan Pengguna dari Mesin terlebih dahulu.');
                            if (pullFingerMutation) {
                              pullFingerMutation.mutate({ deviceId: selectedDeviceForFinger, uids: [newEmployee.fingerPrintId] });
                            }
                          }}
                          disabled={!selectedDeviceForFinger || !newEmployee.fingerPrintId || (pullFingerMutation && pullFingerMutation.isPending)}
                          className="flex-1 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition-all disabled:opacity-50"
                        >
                          {pullFingerMutation && pullFingerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                          Tarik Templat
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'hr' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 block">Status Keaktifan</label>
                  <select 
                    value={newEmployee.status || 'Active'} 
                    onChange={e => setNewEmployee({...newEmployee, status: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="Active">Aktif</option>
                    <option value="On Leave">Cuti</option>
                    <option value="Terminated">Diberhentikan</option>
                  </select>
                </div>
                {newEmployee.status === 'Terminated' && (
                  <>
                    <div className="space-y-1.5 animate-in fade-in duration-300">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 block">Tanggal Keluar</label>
                      <input 
                        type="date" 
                        value={newEmployee.terminationDate || ''} 
                        onChange={e => setNewEmployee({...newEmployee, terminationDate: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5 animate-in fade-in duration-300">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 block">Alasan Keluar</label>
                      <input 
                        list="termination-reasons"
                        value={newEmployee.terminationReason || ''} 
                        onChange={e => setNewEmployee({...newEmployee, terminationReason: e.target.value})}
                        placeholder="Pilih atau ketik..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                      />
                      <datalist id="termination-reasons">
                        <option value="Resign (Mengundurkan Diri)" />
                        <option value="PHK (Pemutusan Hubungan Kerja)" />
                        <option value="Habis Kontrak (PKWT Selesai)" />
                        <option value="Selesai Masa Training" />
                        <option value="Pensiun" />
                        <option value="Mangkir / Kualifikasi Mundur" />
                      </datalist>
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 block">Shift Kerja</label>
                  <select 
                    value={newEmployee.shiftId || ''} 
                    onChange={e => setNewEmployee({...newEmployee, shiftId: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Shift...</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} [{s.startTime}-{s.endTime}]</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Golongan / Grade</label>
                  <input 
                    list="grade-options"
                    value={newEmployee.grade || ''} 
                    onChange={(e) => setNewEmployee({...newEmployee, grade: e.target.value})}
                    placeholder="Pilih atau ketik..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                  <datalist id="grade-options">
                    {(masterOptions.grades || []).map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Status Hubungan Kerja</label>
                  <input 
                    list="empstatus-options"
                    value={newEmployee.employmentStatus || ''} 
                    onChange={(e) => setNewEmployee({...newEmployee, employmentStatus: e.target.value})}
                    placeholder="Pilih atau ketik..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                  <datalist id="empstatus-options">
                    {(masterOptions.employmentStatuses || []).map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Tipe Gaji</label>
                  <select 
                    value={newEmployee.salaryCategory || 'UMK/UMR'} 
                    onChange={e => setNewEmployee({...newEmployee, salaryCategory: e.target.value})} 
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="UMK/UMR">UMK / UMR</option>
                    <option value="ALL IN">ALL IN</option>
                    <option value="HARIAN">HARIAN</option>
                  </select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 block">Cabang / Lokasi Absensi (Multi-select)</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto">
                    {locations.map(loc => {
                      const assignedIds = (newEmployee.locationId || '').split(',').filter(Boolean);
                      const isChecked = assignedIds.includes(String(loc.id));
                      return (
                        <label key={loc.id} className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-slate-100 hover:border-blue-300 transition-all cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              let newIds = [...assignedIds];
                              if (e.target.checked) {
                                if (!newIds.includes(String(loc.id))) {
                                  newIds.push(String(loc.id));
                                }
                              } else {
                                newIds = newIds.filter(id => id !== String(loc.id));
                              }
                              setNewEmployee({ ...newEmployee, locationId: newIds.join(',') });
                            }}
                            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                          />
                          <span className="text-xs font-semibold text-slate-700">{loc.name}</span>
                        </label>
                      );
                    })}
                    {locations.length === 0 && (
                      <span className="text-xs text-slate-400 italic">Belum ada lokasi kantor yang dikonfigurasi.</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Tanggal Mulai Kerja</label>
                  <input type="date" value={newEmployee.joinDate} onChange={e => {
                    const newJoinDate = e.target.value;
                    let newEnd = newEmployee.contractEnd;
                    const statusUpper = (newEmployee.employmentStatus || '').toUpperCase();
                    const isPkwtStatus = statusUpper.includes('PKWT') || statusUpper.includes('KONTRAK') || statusUpper.includes('TRAINING');
                    if (newJoinDate && newEmployee.contractDuration && isPkwtStatus) {
                      const start = new Date(newJoinDate);
                      if (!isNaN(start.getTime())) {
                        const match = newEmployee.contractDuration.match(/(\d+)\s*(Bulan|Month|Tahun|Year)/i);
                        if (match) {
                          const num = parseInt(match[1]);
                          const unit = match[2].toLowerCase();
                          let end = new Date(start);
                          if (unit === 'bulan' || unit === 'month') end.setMonth(end.getMonth() + num);
                          else if (unit === 'tahun' || unit === 'year') end.setFullYear(end.getFullYear() + num);
                          newEnd = end.toISOString().split('T')[0];
                        }
                      }
                    }
                    setNewEmployee({...newEmployee, joinDate: newJoinDate, contractEnd: newEnd});
                  }} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                {((newEmployee.employmentStatus || '').toUpperCase().includes('PKWT') || (newEmployee.employmentStatus || '').toUpperCase().includes('KONTRAK') || (newEmployee.employmentStatus || '').toUpperCase().includes('TRAINING')) && (
                  <>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">
                        {(newEmployee.employmentStatus || '').toUpperCase().includes('TRAINING') ? 'Durasi Training' : 'Durasi Kontrak'}
                      </label>
                      <CreatableSelect menuPortalTarget={document.body} styles={customSelectStyles} isClearable options={toSelectOptions(masterOptions.contractDurations)} value={newEmployee.contractDuration ? {label: newEmployee.contractDuration, value: newEmployee.contractDuration} : null} onChange={(val) => {
                        const duration = val ? val.value : '';
                        let newEnd = newEmployee.contractEnd;
                        if (duration && newEmployee.joinDate) {
                          const start = new Date(newEmployee.joinDate);
                          if (!isNaN(start.getTime())) {
                            const match = duration.match(/(\d+)\s*(Bulan|Month|Tahun|Year)/i);
                            if (match) {
                              const num = parseInt(match[1]);
                              const unit = match[2].toLowerCase();
                              let end = new Date(start);
                              if (unit === 'bulan' || unit === 'month') end.setMonth(end.getMonth() + num);
                              else if (unit === 'tahun' || unit === 'year') end.setFullYear(end.getFullYear() + num);
                              newEnd = end.toISOString().split('T')[0];
                            }
                          }
                        }
                        setNewEmployee({...newEmployee, contractDuration: duration, contractEnd: newEnd});
                      }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">
                        {(newEmployee.employmentStatus || '').toUpperCase().includes('TRAINING') ? 'Tanggal Akhir Training' : 'Tanggal Akhir Kontrak'}
                      </label>
                      <input type="date" value={newEmployee.contractEnd} onChange={e => setNewEmployee({...newEmployee, contractEnd: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                  </>
                )}
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">BPJS Ketenagakerjaan</label><input value={newEmployee.bpjsTk} onChange={e => setNewEmployee({...newEmployee, bpjsTk: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">BPJS Kesehatan</label><input value={newEmployee.bpjsKesehatan} onChange={e => setNewEmployee({...newEmployee, bpjsKesehatan: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">NPWP</label><input value={newEmployee.npwp} onChange={e => setNewEmployee({...newEmployee, npwp: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Kuota Cuti</label><input type="number" value={newEmployee.leaveQuota} onChange={e => setNewEmployee({...newEmployee, leaveQuota: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-800" /></div>
                  {!!newEmployee.dbId && (
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Sisa Cuti</label><input type="number" value={newEmployee.remainingLeave} onChange={e => setNewEmployee({...newEmployee, remainingLeave: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-800" /></div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'personal' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nomor KTP (ID Card)</label><input value={newEmployee.idNumber} onChange={e => setNewEmployee({...newEmployee, idNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nomor KK (Kartu Keluarga)</label><input value={newEmployee.kkNumber} onChange={e => setNewEmployee({...newEmployee, kkNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Tanggal Lahir</label><input type="date" value={newEmployee.birthDate} onChange={e => setNewEmployee({...newEmployee, birthDate: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Tempat Lahir</label><input value={newEmployee.birthPlace} onChange={e => setNewEmployee({...newEmployee, birthPlace: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Agama</label>
                  <select 
                    value={newEmployee.religion || ''} 
                    onChange={e => setNewEmployee({...newEmployee, religion: e.target.value})} 
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Agama...</option>
                    {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'].map(rel => (
                      <option key={rel} value={rel}>{rel}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Pendidikan</label>
                  <select 
                    value={newEmployee.education || ''} 
                    onChange={e => setNewEmployee({...newEmployee, education: e.target.value})} 
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Pendidikan...</option>
                    {['SD', 'SMP', 'SMA', 'D1', 'D2', 'D3', 'S1', 'S2', 'S3'].map(edu => (
                      <option key={edu} value={edu}>{edu}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2"><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Alamat Tinggal</label><input value={newEmployee.address} onChange={e => setNewEmployee({...newEmployee, address: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Jurusan</label><input value={newEmployee.major} onChange={e => setNewEmployee({...newEmployee, major: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Jenis Kelamin</label>
                  <select
                    value={newEmployee.gender || ''}
                    onChange={e => setNewEmployee({...newEmployee, gender: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih...</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>
            )}
            {activeTab === 'family' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Status Pernikahan</label>
                  <select 
                    value={newEmployee.maritalStatus || ''} 
                    onChange={e => setNewEmployee({...newEmployee, maritalStatus: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Status...</option>
                    <option value="Menikah">Menikah</option>
                    <option value="Belum Menikah">Belum Menikah</option>
                  </select>
                </div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Jumlah Anak</label><input type="number" value={newEmployee.numberOfChildren} onChange={e => setNewEmployee({...newEmployee, numberOfChildren: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nama Ayah</label><input value={newEmployee.fatherName} onChange={e => setNewEmployee({...newEmployee, fatherName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nama Ibu</label><input value={newEmployee.motherName} onChange={e => setNewEmployee({...newEmployee, motherName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nama Pasangan (Suami/Istri)</label><input value={newEmployee.spouseName} onChange={e => setNewEmployee({...newEmployee, spouseName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">No. Telepon / HP</label><input value={newEmployee.phone} onChange={e => setNewEmployee({...newEmployee, phone: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Kontak Darurat</label><input value={newEmployee.emergencyContact} onChange={e => setNewEmployee({...newEmployee, emergencyContact: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                <div className="lg:col-span-3"><div className="border-t border-slate-200 pt-4 mb-2"><p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">💳 Informasi Bank</p></div></div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nama Bank</label>
                  <select
                    value={newEmployee.bankName || ''}
                    onChange={e => setNewEmployee({...newEmployee, bankName: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Bank...</option>
                    {['BCA', 'BRI', 'BNI', 'Mandiri', 'BTN', 'CIMB Niaga', 'Danamon', 'Permata', 'BSI', 'Lainnya'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Nomor Rekening</label><input value={newEmployee.bankAccountNumber || ''} onChange={e => setNewEmployee({...newEmployee, bankAccountNumber: e.target.value})} placeholder="Contoh: 1234567890" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
              </div>
            )}
            {activeTab === 'documents' && (
              <EmployeeDocumentsTab employeeId={newEmployee.dbId} />
            )}
          </form>
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={closeFormModal} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all">Batal</button>
          <button 
            type="submit" 
            form="add-emp-form" 
            disabled={!!nikError || isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>} 
            Simpan Karyawan
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeFormModal;
