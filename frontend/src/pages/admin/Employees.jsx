import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { employeeAPI, settingsAPI, payrollAPI, deviceAPI, fingerprintAPI, getFileUrl } from '../../services/api';
import CreatableSelect from 'react-select/creatable';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import * as XLSX from 'xlsx';
import { 
  Search, Filter, CheckCircle2, Clock, UserPlus, FileSpreadsheet, Upload, X, Download, Save, Camera,
  ScanFace, Loader2, AlertCircle, RefreshCw, ShieldCheck, ChevronRight, ChevronUp, ChevronDown, FileText, Banknote, Printer, Fingerprint, Trash2, Users
} from 'lucide-react';
import PrintableIDCard from '../../components/admin/PrintableIDCard';
import CCTVEnrollmentTab from '../../components/admin/CCTVEnrollmentTab';
const emptyEmployee = { 
  employeeCode: '',
  name: '', dept: '', division: '', locationId: '', idNumber: '', cardNo: '', verifyCode: 'Face ID', 
  email: '', phone: '', position: '', grade: '', section: '', employmentStatus: '', contractDuration: '', 
  faceId: '', facePhoto: '', faceDescriptor: null, bpjsTk: '', bpjsKesehatan: '', npwp: '', ptkpStatus: '', kkNumber: '', 
  birthPlace: '', address: '', education: '', major: '', religion: '', maritalStatus: '', numberOfChildren: 0, 
  fatherName: '', motherName: '', spouseName: '', emergencyContact: '', notes: '',
  joinDate: '', contractEnd: '', birthDate: '',
  leaveQuota: 12, remainingLeave: 12, profilePhoto: '',
  status: 'Active'
};

const Employees = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState('');
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [isPkwtModalOpen, setPkwtModalOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState(emptyEmployee);
  const [activeTab, setActiveTab] = useState('basic');
  const [isQuickShiftModalOpen, setQuickShiftModalOpen] = useState(false);
  const [isSyncGajiModalOpen, setSyncGajiModalOpen] = useState(false);
  const [quickShiftForm, setQuickShiftForm] = useState({ departmentId: '', shiftId: '' });
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [printIDCardEmp, setPrintIDCardEmp] = useState(null);
  const [printBulkIDCards, setPrintBulkIDCards] = useState(null);
  const [companySettings, setCompanySettings] = useState({});
  const [idCardConfig, setIdCardConfig] = useState(null);
  const PAGE_SIZE = 25;
  
  const nikErrorRef = useRef(null);
  const webcamRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [nikError, setNikError] = useState('');
  const [scanStatus, setScanStatus] = useState('ready');

  // Phase 5: Real-time face guide
  const [faceGuideStatus, setFaceGuideStatus] = useState('none');
  const faceGuideRef = useRef(null);
  const stableCountRef = useRef(0);
  const autoCaptureTriggeredRef = useRef(false);

  // Fingerprint push/pull states
  const [selectedDeviceForFinger, setSelectedDeviceForFinger] = useState('');
  const [isPushingFinger, setIsPushingFinger] = useState(false);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(1);
  };

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
    
    const fetchSettings = async () => {
      try {
        const res = await settingsAPI.getAll();
        setCompanySettings(res.data);
        if (res.data.idCardConfig) {
           setIdCardConfig(JSON.parse(res.data.idCardConfig));
        }
      } catch(e) {}
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (location.state && location.state.editEmployeeCode) {
      const code = location.state.editEmployeeCode;
      // Clear navigation state to prevent re-opening modal on refresh
      navigate(location.pathname, { replace: true, state: null });
      
      const fetchAndEdit = async () => {
        try {
          const res = await employeeAPI.getAll({ search: code });
          if (res.success && res.data && res.data.length > 0) {
            handleEditEmployee(res.data[0]);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchAndEdit();
    }
  }, [location.state]);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', { search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter, empStatus: empStatusFilter, page, sortBy: sortConfig.key, order: sortConfig.direction }],
    queryFn: () => employeeAPI.getAll({ search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter, empStatus: empStatusFilter, page, limit: PAGE_SIZE, sortBy: sortConfig.key, order: sortConfig.direction, excludeBhl: true }),
    keepPreviousData: true,
  });

  const { data: optionsData } = useQuery({
    queryKey: ['master-options', { dept: deptFilter }],
    queryFn: () => employeeAPI.getMasterOptions({ dept: deptFilter }),
  });

  const { data: shiftsData } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => settingsAPI.getShifts(),
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => deviceAPI.getAll(),
  });

  const shifts = shiftsData?.data || [];
  const devices = devicesData?.data || [];
  const masterOptions = optionsData?.data || { grades: [], positions: [], sections: [], employmentStatuses: [], contractDurations: [], departments: [] };
  const toSelectOptions = (arr) => arr.map(i => {
    if (typeof i === 'object') return { label: i.name, value: i.name };
    return { label: i, value: i };
  });

  const batchShiftMutation = useMutation({
    mutationFn: employeeAPI.batchUpdateShift,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setQuickShiftModalOpen(false);
      alert(res.message || 'Shift berhasil diperbarui!');
    },
    onError: (err) => alert(`Error: ${err.message}`)
  });

  const createMutation = useMutation({
    mutationFn: employeeAPI.create,
    onSuccess: () => {
      setScanStatus('ready');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
      setAddModalOpen(false);
      setNewEmployee(emptyEmployee);
      setIsCameraActive(false);
      setFaceGuideStatus('none');
      stableCountRef.current = 0;
      autoCaptureTriggeredRef.current = false;
      alert('Karyawan berhasil ditambahkan!');
    },
    onError: (err) => alert(`Error: ${err.message}`)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => employeeAPI.update(id, data),
    onSuccess: () => {
      setScanStatus('ready');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
      setAddModalOpen(false);
      setNewEmployee(emptyEmployee);
      setActiveTab('basic');
      alert('Data karyawan berhasil diperbarui!');
    },
    onError: (err) => alert(`Pembaruan gagal: ${err.message}`)
  });

  const pushFingerMutation = useMutation({
    mutationFn: ({ deviceId, employeeIds }) => fingerprintAPI.pushUsers(deviceId, employeeIds),
    onSuccess: (res) => {
      alert(res.message || 'Pengguna berhasil dikirim ke mesin');
    },
    onError: (err) => alert(`Gagal mengirim ke mesin: ${err.message}`)
  });

  const pullFingerMutation = useMutation({
    mutationFn: ({ deviceId, uids }) => fingerprintAPI.pullTemplates(deviceId, uids),
    onSuccess: (res) => {
      alert(res.message || 'Templat sidik jari berhasil ditarik dan disinkronkan');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => alert(`Gagal menarik dari mesin: ${err.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => employeeAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
      alert('Karyawan berhasil dihapus dari sistem.');
    },
    onError: (err) => alert(`Gagal menghapus: ${err.message}`)
  });

  const handleDeleteEmployee = (emp) => {
    const msg = `⚠️ PERINGATAN!\n\nAnda akan menghapus permanen karyawan:\n• Nama: ${emp.name}\n• NIK: ${emp.id}\n• Dept: ${emp.dept}\n\nSemua data absensi, cuti, dan koreksi karyawan ini juga akan terhapus.\n\nLanjutkan?`;
    if (window.confirm(msg)) {
      deleteMutation.mutate(emp.dbId);
    }
  };

  const filteredEmployees = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const totalEmployees = data?.total || 0;

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    const jobId = Date.now().toString();

    const progressInterval = setInterval(async () => {
      try {
        const res = await employeeAPI.getImportProgress(jobId);
        if (res && res.progress !== undefined) {
          setUploadProgress(res.progress);
        }
      } catch (err) {
        console.error('Progress fetch failed', err);
      }
    }, 500);

    try {
      const res = await employeeAPI.importExcel(file, jobId);
      setUploadProgress(100);
      clearInterval(progressInterval);
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
    } catch (err) {
      clearInterval(progressInterval);
      alert(`Import Failed: ${err.message}`);
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 1000);
    }
  };

  const handleAddEmployee = (e) => {
    e.preventDefault();
    if (newEmployee.dbId) {
      updateMutation.mutate({ id: newEmployee.dbId, data: newEmployee });
    } else {
      createMutation.mutate(newEmployee);
    }
  };

  const handleEditEmployee = (emp) => {
    setNewEmployee({
      ...emp,
      dbId: emp.dbId,
      employeeCode: emp.id, 
      shiftId: emp.shiftId || '',
      joinDate: emp.joinDate ? new Date(emp.joinDate).toISOString().split('T')[0] : '',
      contractEnd: emp.contractEnd ? new Date(emp.contractEnd).toISOString().split('T')[0] : '',
      birthDate: emp.birthDate ? new Date(emp.birthDate).toISOString().split('T')[0] : '',
      leaveQuota: emp.leaveQuota ?? 12,
      remainingLeave: emp.remainingLeave ?? 12,
    });
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    if (faceGuideRef.current) clearInterval(faceGuideRef.current);
    setScanStatus('ready');
    setIsCapturing(false);
    setAddModalOpen(false);
    setNewEmployee(emptyEmployee);
    setActiveTab('basic');
    setNikError('');
  };
  
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

  const handleDownloadTemplate = () => {
    const headers = [
      'NIK', 'Nama', 'Departemen', 'Jabatan', 'Bagian', 'Grade', 'Status Kerja', 
      'Lama Kontrak', 'Tanggal Masuk', 'Sisa Tanggal Kontrak', 'Email', 'No HP',
      'NIK KTP', 'No Kartu Keluarga', 'Tanggal Lahir', 'Tempat Lahir', 'Alamat',
      'Agama', 'Pendidikan Terakhir', 'Jurusan', 'Jumlah Anak', 'Nama Ayah Kandung',
      'Nama Ibu Kandung', 'Nama Suami/Istri', 'KONTAK DARURAT',
      'Jenis Kelamin', 'Nama Bank', 'Nomor Rekening',
      'BPJS TK', 'BPJS Kesehatan', 'NPWP', 'Status PTKP (Pajak)', 'Keterangan'
    ];

    const sampleRow = [
      '001', 'Contoh Karyawan', 'Produksi', 'Operator', 'Line A', 'Grade 1', 'PKWT',
      '1 Tahun', '2024-01-01', '2025-01-01', 'contoh@email.com', '08123456789',
      '3275001234560001', 'KK123456789', '1990-05-15', 'Jakarta', 'Jl. Contoh No. 1',
      'Islam', 'SMA', '-', '2', 'Bapak Contoh',
      'Ibu Contoh', 'Pasangan Contoh', '08129999999',
      'L', 'BCA', '1234567890',
      'TK-12345678', 'BPJS-12345678', 'NPWP-123456789', 'TK/0', 'Catatan karyawan'
    ];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    // Style the header row
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master_Template");
    XLSX.writeFile(wb, "Template_Master_Karyawan.xlsx");
    XLSX.writeFile(wb, "Template_Master_Karyawan.xlsx");
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
        await new Promise(resolve => img.onload = resolve);

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

  const captureFace = async () => {
    if (!webcamRef.current) return;

    setIsCapturing(true);
    setScanStatus('detecting');
    const imageSrc = webcamRef.current.getScreenshot();
    
    if (modelsLoaded) {
      try {
        const img = new Image();
        img.src = imageSrc;
        img.onload = async () => {
          const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.15 })).withFaceLandmarks().withFaceDescriptor();
          setScanStatus('ready');
          if (detection) {
            setNewEmployee({...newEmployee, facePhoto: imageSrc, faceDescriptor: JSON.stringify(Array.from(detection.descriptor)), faceId: 'Enrolled' });
            alert('Wajah terdeteksi dan berhasil terdaftar!');
          } else {
            alert('Wajah tidak terdeteksi. Pastikan pencahayaan cukup dan wajah terlihat jelas.');
          }
          setIsCapturing(false);
        };
      } catch (err) {
        setScanStatus('ready');
        alert('Gagal memproses wajah.');
        setIsCapturing(false);
      }
    } else {
      setScanStatus('ready');
      alert('Model AI sedang dimuat. Silakan tunggu sebentar.');
      setIsCapturing(false);
    }
  };


  const { data: pkwtAlertsData } = useQuery({
    queryKey: ['pkwt-alerts'],
    queryFn: () => payrollAPI.getPkwtAlerts(),
  });
  const pkwtAlerts = pkwtAlertsData?.data || [];
  const criticalAlertsCount = pkwtAlerts.filter(a => a.daysLeft <= 30).length;

  const { data: allEmployeesData } = useQuery({
    queryKey: ['all-employees-biometrics'],
    queryFn: () => employeeAPI.getAll({ limit: 10000, excludeBhl: true })
  });
  const allEmployees = allEmployeesData?.data || [];
  const pendingBiometricsCount = allEmployees.filter(e => e.faceIdDisplay !== 'Enrolled').length;
  const totalActiveEmployees = allEmployees.filter(e => e.status === 'Active' || e.status === 'On Leave').length;
  const withoutFingerCount = allEmployees.filter(e => !e.fingerPrintId).length;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="print:hidden space-y-8">
      {/* 1. Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Pengawasan Administratif</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Arsip Karyawan</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Data Karyawan
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              Database Aktif
            </div>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => {
              setNewEmployee(emptyEmployee);
              setActiveTab('basic');
              setNikError('');
              setAddModalOpen(true);
            }} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" /> Tambah Karyawan
          </button>
          
          <button 
            onClick={() => setImportModalOpen(true)} 
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            Impor Excel
          </button>

          <button 
            onClick={handleDownloadTemplate} 
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
          >
            <Download className="w-4 h-4 text-slate-500 group-hover:scale-110 transition-transform" />
            Template Excel
          </button>
        </div>
      </div>

      {/* 2. Dashboard Information Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-1">
        {/* Card 1: Total Karyawan */}
        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-blue-300 transition-all group">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Karyawan</span>
            <div className="text-2xl font-bold text-slate-800 tracking-tight">
              {totalEmployees} <span className="text-xs text-slate-500 font-medium">orang</span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              {totalActiveEmployees} Aktif / Cuti
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Belum Terhubung Finger */}
        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-rose-300 transition-all group">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Belum Link Sidik Jari</span>
            <div className="text-2xl font-bold text-rose-600 tracking-tight">
              {withoutFingerCount} <span className="text-xs text-slate-500 font-medium">orang</span>
            </div>
            <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
              Registrasi Fingerprint
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 group-hover:bg-rose-600 group-hover:text-white transition-all shadow-sm">
            <Fingerprint className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Pendaftaran Wajah Tertunda */}
        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-amber-300 transition-all group">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Wajah Belum Terdaftar</span>
            <div className="text-2xl font-bold text-amber-600 tracking-tight">
              {pendingBiometricsCount} <span className="text-xs text-slate-500 font-medium">orang</span>
            </div>
            <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider">
              Belum Registrasi CCTV
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
            <ScanFace className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Jatuh Tempo PKWT */}
        <div 
          onClick={() => navigate('/admin/contracts', { state: { filter: 'critical' } })}
          className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-orange-300 transition-all group cursor-pointer active:scale-[0.98]"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kontrak Segera Berakhir</span>
            <div className="text-2xl font-bold text-orange-600 tracking-tight">
              {criticalAlertsCount} <span className="text-xs text-slate-500 font-medium">orang</span>
            </div>
            <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wider">
              Habis &lt; 30 Hari (PKWT)
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 group-hover:bg-orange-600 group-hover:text-white transition-all shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Aksi Massal & Integrasi Toolbar */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Alat & Aksi Massal Karyawan
          </span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setQuickShiftModalOpen(true)} 
            className="bg-white border border-slate-200 text-slate-700 hover:border-slate-300 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            Ubah Shift Massal
          </button>
          
          <button 
            onClick={() => {
              if (filteredEmployees.length === 0) return alert('Tidak ada karyawan untuk dicetak.');
              if (filteredEmployees.length > 50) {
                if(!window.confirm(`Anda akan mencetak ${filteredEmployees.length} ID Card sekaligus. Lanjutkan?`)) return;
              }
              setPrintBulkIDCards(filteredEmployees);
              setTimeout(() => {
                window.print();
                setTimeout(() => { setPrintBulkIDCards(null); }, 1000);
              }, 1000);
            }} 
            className="bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all border border-slate-200 active:scale-95 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-500" /> 
            Cetak ID Card (Massal)
          </button>

          <button 
            onClick={() => setSyncGajiModalOpen(true)} 
            className="bg-white border border-slate-200 text-slate-700 hover:border-emerald-300 hover:text-emerald-600 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
            Sinkronisasi Gaji Normal
          </button>

          <button 
            onClick={() => navigate('/admin/contracts')} 
            className="bg-white border border-slate-200 text-slate-700 hover:border-orange-300 hover:text-orange-600 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer relative"
          >
            <FileText className="w-3.5 h-3.5 text-orange-500" />
            Kontrak Kerja (PKWT)
            {criticalAlertsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                {criticalAlertsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. Global Filter Matrix */}
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Cari Karyawan</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Nama, NIK, ID..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Departemen</label>
            <div className="relative">
              <select 
                value={deptFilter} 
                onChange={e => { setDeptFilter(e.target.value); setSectionFilter(''); setPositionFilter(''); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">Semua Departemen</option>
                {masterOptions.departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Bagian (Section)</label>
            <div className="relative">
              <select 
                value={sectionFilter} 
                onChange={e => { setSectionFilter(e.target.value); setPositionFilter(''); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">Semua Bagian</option>
                {masterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Jabatan</label>
            <div className="relative">
              <select 
                value={positionFilter} 
                onChange={e => setPositionFilter(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">Semua Jabatan</option>
                {masterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Status Karyawan</label>
            <div className="relative">
              <select 
                value={empStatusFilter} 
                onChange={e => setEmpStatusFilter(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">Semua Status</option>
                {masterOptions.employmentStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-auto min-h-[400px] max-h-[65vh]">
          <table className="w-full text-left whitespace-nowrap min-w-[2800px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr>
                <th className="px-6 py-4 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aksi</span>
                </th>
                <th 
                  className="px-6 py-4 sticky left-[120px] z-30 bg-slate-50 border-b border-r border-slate-200 text-center cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort('employeeCode')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">NIK</span>
                    {sortConfig.key === 'employeeCode' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center block">Sidik Jari</span>
                </th>
                <th 
                  className="px-6 py-4 sticky left-[250px] z-30 bg-slate-50 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Karyawan</span>
                    {sortConfig.key === 'name' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center block">Foto</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kuota Cuti</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Deteksi Wajah</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shift</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Grade</span>
                </th>
                <th 
                  className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort('position')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Jabatan</span>
                    {sortConfig.key === 'position' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort('section')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bagian</span>
                    {sortConfig.key === 'section' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort('dept')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departemen</span>
                    {sortConfig.key === 'dept' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status Karyawan</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kontrak</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tgl Gabung</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Akhir Kontrak</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">BPJS TK</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">BPJS Kes</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">NPWP</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">PTKP</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pernikahan</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">No. KK</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">No. KTP</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tgl Lahir</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tempat Lahir</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Alamat</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pendidikan</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Jurusan</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agama</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Telepon</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Anak</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nama Ayah</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nama Ibu</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nama Pasangan</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kontak Darurat</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Catatan</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="34" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Memuat Data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.map((emp) => (
                <tr key={emp.dbId} className="group hover:bg-blue-50/50 transition-colors duration-200">
                  <td className="px-6 py-3 sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => handleEditEmployee(emp)} 
                        className="px-4 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-blue-100 hover:border-blue-600 shadow-sm"
                      >
                        Ubah
                      </button>
                      <button 
                        onClick={() => {
                          setPrintIDCardEmp(emp);
                          setTimeout(() => {
                            window.print();
                            setTimeout(() => { setPrintIDCardEmp(null); }, 1000);
                          }, 500);
                        }} 
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-emerald-100 hover:border-emerald-600 shadow-sm flex items-center gap-1"
                        title="Cetak Kartu ID"
                      >
                        <Printer className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => handleDeleteEmployee(emp)} 
                        disabled={deleteMutation.isPending}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-rose-100 hover:border-rose-600 shadow-sm flex items-center gap-1 disabled:opacity-50"
                        title="Hapus Karyawan"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-3 sticky left-[120px] z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 text-center text-xs font-semibold text-slate-700">
                    {emp.id}
                  </td>
                  <td className="px-6 py-3 border-r border-slate-100 text-center">
                    {emp.fingerPrintId ? (
                       <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                         <Fingerprint className="w-3 h-3" /> {emp.fingerPrintId}
                       </span>
                    ) : (
                       <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">-</span>
                    )}
                  </td>
                  <td className="px-6 py-3 sticky left-[250px] z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                    <div className="flex flex-col min-w-[200px]">
                      <span className="text-sm font-bold text-slate-800 truncate">{emp.name || "Tidak Diketahui"}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{emp.email || "Tidak Ada Email"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-slate-200 flex items-center justify-center mx-auto">
                      {(emp.profilePhoto || emp.facePhoto) ? (
                        <img src={getFileUrl(emp.profilePhoto || emp.facePhoto)} alt={emp.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          {emp.name ? emp.name.charAt(0).toUpperCase() : '?'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      emp.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      emp.status === 'On Leave' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>{emp.status === 'Active' ? 'Aktif' : emp.status === 'On Leave' ? 'Cuti' : emp.status === 'Terminated' ? 'Diberhentikan' : emp.status || '-'}</span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div 
                          className={`h-full rounded-full transition-all ${ (emp.remainingLeave ?? 0) <= 3 ? 'bg-rose-500' : 'bg-blue-500' }`} 
                          style={{ width: `${Math.min(100, ((emp.remainingLeave ?? 0) / (emp.leaveQuota ?? 12)) * 100)}%` }}
                        ></div>
                      </div>
                      <span className={`text-[10px] font-bold ${ (emp.remainingLeave ?? 0) <= 3 ? 'text-rose-600' : 'text-slate-600' }`}>
                        {emp.remainingLeave ?? 0}/{emp.leaveQuota ?? 12}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all ${emp.faceIdDisplay === 'Enrolled' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {emp.faceIdDisplay === 'Enrolled' ? <ScanFace className="w-3 h-3"/> : <ScanFace className="w-3 h-3 opacity-50"/>}
                      {emp.faceIdDisplay === 'Enrolled' ? 'Terdaftar' : emp.faceIdDisplay === 'Pending' ? 'Tertunda' : emp.faceIdDisplay || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">{emp.shift?.name || 'Default'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.grade || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.position || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.section || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.dept || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.employmentStatus || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.contractDuration || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.contractEnd ? new Date(emp.contractEnd).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.bpjsTk || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.bpjsKesehatan || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.npwp || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.ptkpStatus || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.maritalStatus || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.kkNumber || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.idNumber || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.birthDate ? new Date(emp.birthDate).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.birthPlace || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600 max-w-xs truncate">{emp.address || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.education || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.major || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.religion || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.phone || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600 text-center">{emp.numberOfChildren?.toString() || '0'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.fatherName || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.motherName || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.spouseName || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-600">{emp.emergencyContact || '-'}</td>
                  <td className="px-6 py-3 text-xs text-slate-500 italic">{emp.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 3. Pagination */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            Menampilkan <span className="font-bold text-slate-800">{totalEmployees}</span> data | Halaman <span className="font-bold text-slate-800">{page}</span> dari <span className="font-bold text-slate-800">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabbed Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeAddModal}></div>
          <div className="bg-white w-full max-w-5xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
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
                onClick={closeAddModal} 
                className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 text-slate-500 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="flex border-b border-slate-100 bg-white px-2 overflow-x-auto hide-scrollbar">
              {['basic', 'biometric', 'cctv', 'finger', 'hr', 'personal', 'family'].map(tab => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)} 
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all relative whitespace-nowrap ${activeTab === tab ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {tab === 'basic' ? 'Info Utama' : tab === 'biometric' ? 'Registrasi Wajah' : tab === 'cctv' ? 'Wajah CCTV' : tab === 'finger' ? 'Sidik Jari' : tab === 'hr' ? 'Informasi Kerja' : tab === 'personal' ? 'Data Pribadi' : 'Data Keluarga'}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-600 rounded-t-full"></div>
                  )}
                </button>
              ))}
            </div>

            <div className="p-8 overflow-y-auto flex-1 min-h-0 hide-scrollbar bg-slate-50/50">
              <form id="add-emp-form" onSubmit={handleAddEmployee} className="space-y-6">
                {activeTab === 'basic' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">NIK (ID Karyawan)</label>
                      <input
                        value={newEmployee.employeeCode}
                        onChange={e => { setNewEmployee({...newEmployee, employeeCode: e.target.value}); setNikError(''); }}
                        onBlur={handleNikBlur}
                        readOnly={!!newEmployee.dbId}
                        placeholder={newEmployee.dbId ? '' : 'Dibuat otomatis jika kosong'}
                        className={`w-full border rounded-xl px-4 py-3 text-sm transition-all focus:outline-none ${
                          nikError ? 'border-rose-300 bg-rose-50 text-rose-700 focus:ring-2 focus:ring-rose-500/20' : 
                          newEmployee.dbId ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 
                          'bg-white border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400'
                        }`}
                      />
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
                        {(masterOptions.departments || []).map(opt => <option key={opt} value={opt} />)}
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
                                        updateMutation.mutate({ id: newEmployee.dbId, data: updatedEmployee });
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
                                      updateMutation.mutate({ id: newEmployee.dbId, data: updatedEmployee });
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
                                pushFingerMutation.mutate({ deviceId: selectedDeviceForFinger, employeeIds: [newEmployee.dbId] });
                              }}
                              disabled={!selectedDeviceForFinger || pushFingerMutation.isPending}
                              className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 border border-emerald-200 transition-all disabled:opacity-50"
                            >
                              {pushFingerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                              Kirim ke Mesin
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if(!selectedDeviceForFinger) return alert('Pilih mesin terlebih dahulu!');
                                if(!newEmployee.fingerPrintId) return alert('Tidak ada ID Sidik Jari. Coba Sinkronkan Pengguna dari Mesin terlebih dahulu.');
                                pullFingerMutation.mutate({ deviceId: selectedDeviceForFinger, uids: [newEmployee.fingerPrintId] });
                              }}
                              disabled={!selectedDeviceForFinger || !newEmployee.fingerPrintId || pullFingerMutation.isPending}
                              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition-all disabled:opacity-50"
                            >
                              {pullFingerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
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
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Tanggal Mulai Kerja</label><input type="date" value={newEmployee.joinDate} onChange={e => {
                      const newJoinDate = e.target.value;
                      let newEnd = newEmployee.contractEnd;
                      if (newJoinDate && newEmployee.contractDuration && (newEmployee.employmentStatus?.toUpperCase() === 'PKWT' || newEmployee.employmentStatus?.toUpperCase() === 'KONTRAK')) {
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
                    }} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    {(newEmployee.employmentStatus?.toUpperCase() === 'PKWT' || newEmployee.employmentStatus?.toUpperCase() === 'KONTRAK') && (
                      <>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Durasi Kontrak</label>
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
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Tanggal Akhir Kontrak</label><input type="date" value={newEmployee.contractEnd} onChange={e => setNewEmployee({...newEmployee, contractEnd: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                      </>
                    )}
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">BPJS Ketenagakerjaan</label><input value={newEmployee.bpjsTk} onChange={e => setNewEmployee({...newEmployee, bpjsTk: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">BPJS Kesehatan</label><input value={newEmployee.bpjsKesehatan} onChange={e => setNewEmployee({...newEmployee, bpjsKesehatan: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">NPWP</label><input value={newEmployee.npwp} onChange={e => setNewEmployee({...newEmployee, npwp: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Kuota Cuti</label><input type="number" readOnly={!!newEmployee.dbId} value={newEmployee.leaveQuota} onChange={e => setNewEmployee({...newEmployee, leaveQuota: e.target.value})} className={`w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${newEmployee.dbId ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'text-slate-800'}`} /></div>
                      {!!newEmployee.dbId && (
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Sisa Cuti</label><input type="number" readOnly value={newEmployee.remainingLeave} className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 cursor-not-allowed" /></div>
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
              </form>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={closeAddModal} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all">Batal</button>
              <button 
                type="submit" 
                form="add-emp-form" 
                disabled={!!nikError || createMutation.isPending || updateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>} 
                Simpan Karyawan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isUploading && setImportModalOpen(false)}></div>
          <div className="bg-white w-full max-w-xl relative z-10 overflow-hidden border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-xl tracking-tight">Import Data</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Bulk Database Insertion</p>
                </div>
              </div>
              <button onClick={() => !isUploading && setImportModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600 transition-colors" />
              </button>
            </div>

            <div className="p-8">
              {!importResult && !isUploading ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 group hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Protocol</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">Auto collision detection active. Duplicate NIKs will be skipped.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 group hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <Download className="w-4 h-4 text-blue-600" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Template</span>
                      </div>
                      <button onClick={handleDownloadTemplate} className="text-xs text-blue-600 font-bold hover:text-blue-700 transition-colors">Download Excel Template</button>
                    </div>
                  </div>

                  <label className="group block relative cursor-pointer">
                    <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImport} />
                    <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center transition-all group-hover:border-blue-300 group-hover:bg-blue-50/50">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 transition-all group-hover:scale-110">
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
                      </div>
                      <h4 className="font-bold text-slate-700 text-sm">Select Database File</h4>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">Supported: XLSX, XLS, CSV</p>
                      
                      <div className="mt-6 px-6 py-2.5 bg-blue-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white rounded-xl text-xs font-bold transition-all">
                        Browse Files
                      </div>
                    </div>
                  </label>
                </div>
              ) : isUploading ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <div className="w-full max-w-xs space-y-6 text-center">
                    <div className="relative inline-block">
                      <div className="w-24 h-24 border-4 border-slate-100 rounded-full" />
                      <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold text-slate-800">{uploadProgress}%</span>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg">Processing Data...</h4>
                      <p className="text-[10px] text-slate-500 mt-1 font-semibold uppercase tracking-wider">Syncing with server</p>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className={`p-6 rounded-2xl flex items-center gap-4 border ${importResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${importResult.success ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                      {importResult.success ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <AlertCircle className="w-6 h-6 text-rose-600" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">Import Complete</h4>
                      <p className="text-xs text-slate-600 mt-0.5">{importResult.message}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Successfully Added</span>
                      <span className="text-3xl font-bold text-blue-600">{importResult.data?.imported || 0}</span>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Skipped / Duplicates</span>
                      <span className="text-3xl font-bold text-slate-600">{importResult.data?.skipped || 0}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => { setImportResult(null); setImportModalOpen(false); }}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                  >
                    Close Window
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Shift Modal */}
      {isQuickShiftModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setQuickShiftModalOpen(false)}></div>
          <div className="bg-white w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200 rounded-3xl shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">Batch Shift Update</h3>
              </div>
              <button onClick={() => setQuickShiftModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-all">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); batchShiftMutation.mutate(quickShiftForm); }}>
              <div className="p-6 space-y-5">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 font-medium leading-relaxed">
                    Warning: This action will permanently update the default shift for <b className="font-bold">all employees</b> in the selected group.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Target Department</label>
                  <select 
                    required
                    value={quickShiftForm.departmentId}
                    onChange={(e) => setQuickShiftForm({...quickShiftForm, departmentId: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none cursor-pointer"
                  >
                    <option value="">Select Target...</option>
                    <option value="0" className="font-bold text-blue-600">-- ALL DEPARTMENTS --</option>
                    {masterOptions.departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">New Shift Protocol</label>
                  <select 
                    required
                    value={quickShiftForm.shiftId}
                    onChange={(e) => setQuickShiftForm({...quickShiftForm, shiftId: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none cursor-pointer"
                  >
                    <option value="">Select Shift...</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.name} [{s.startTime} - {s.endTime}]</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setQuickShiftModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={batchShiftMutation.isPending}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-sm flex items-center gap-2"
                >
                  {batchShiftMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {batchShiftMutation.isPending ? 'Updating...' : 'Confirm Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PKWT Alerts Modal */}
      {isPkwtModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPkwtModalOpen(false)}></div>
          <div className="bg-white w-full max-w-2xl relative z-10 overflow-hidden border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center border border-orange-100">
                  <FileText className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-xl tracking-tight">PKWT Contract Alerts</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Expiring employment contracts</p>
                </div>
              </div>
              <button onClick={() => setPkwtModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600 transition-colors" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto bg-slate-50">
              <div className="space-y-4">
                {pkwtAlerts.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="font-bold text-slate-700">No Pending Contracts</p>
                    <p className="text-xs mt-1">All employee contracts are up to date.</p>
                  </div>
                ) : pkwtAlerts.map(alert => (
                  <div key={alert.id} className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm transition-all hover:scale-[1.01] ${
                    alert.alertLevel === 'expired' ? 'bg-rose-50 border-rose-200' : 
                    alert.alertLevel === 'critical' ? 'bg-orange-50 border-orange-200' :
                    'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-center">
                      <AlertCircle className={`mr-4 ${
                        alert.alertLevel === 'expired' ? 'text-rose-500' : 
                        alert.alertLevel === 'critical' ? 'text-orange-500' : 'text-amber-500'
                      }`} size={24} />
                      <div>
                        <h4 className="font-bold text-slate-800">{alert.employeeName} <span className="text-xs font-semibold text-slate-500 bg-white/50 px-2 py-0.5 rounded-md ml-2 border border-slate-200/50">{alert.employeeCode}</span></h4>
                        <p className="text-xs text-slate-600 mt-1 font-medium">Ends: {new Date(alert.contractEnd).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric'})}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm border ${
                        alert.alertLevel === 'expired' ? 'bg-white border-rose-200 text-rose-700' : 
                        alert.alertLevel === 'critical' ? 'bg-white border-orange-200 text-orange-700' : 'bg-white border-amber-200 text-amber-700'
                      }`}>
                        {alert.daysLeft <= 0 ? 'Expired' : `${alert.daysLeft} Days Left`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setPkwtModalOpen(false)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Gaji Normal Modal */}
      {isSyncGajiModalOpen && (
        <SyncGajiNormalModal 
          departments={masterOptions.departments}
          onClose={() => setSyncGajiModalOpen(false)}
          onDone={() => { setSyncGajiModalOpen(false); queryClient.invalidateQueries(['employees']); }}
        />
      )}
      </div>

      {/* Hidden Print Container for ID Card */}
      {printIDCardEmp && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
          <PrintableIDCard 
            employee={printIDCardEmp} 
            company={companySettings} 
            config={idCardConfig} 
          />
        </div>
      )}

      {printBulkIDCards && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999] bg-white">
          {Array.from({ length: Math.ceil(printBulkIDCards.length / (idCardConfig?.orientation === 'horizontal' ? 10 : 9)) }).map((_, pageIdx) => {
            const isHorizontal = idCardConfig?.orientation === 'horizontal';
            const cardsPerPage = isHorizontal ? 10 : 9;
            const pageCards = printBulkIDCards.slice(pageIdx * cardsPerPage, (pageIdx + 1) * cardsPerPage);
            
            return (
              <div key={pageIdx} style={{ pageBreakAfter: 'always', width: '210mm', height: '290mm', padding: '10mm', margin: '0 auto', boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isHorizontal ? 2 : 3}, 1fr)`, gap: isHorizontal ? '8mm' : '5mm' }}>
                  {pageCards.map((emp) => (
                    <div key={emp.id} style={{ display: 'flex', justifyContent: 'center' }}>
                      <PrintableIDCard 
                        employee={emp} 
                        company={companySettings} 
                        config={idCardConfig} 
                        isBulk={true}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes scan {
          0%, 100% { top: 15%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          50% { top: 85%; }
        }
      `}</style>
    </div>
  );
};

const SyncGajiNormalModal = ({ departments, onClose, onDone }) => {
  const [selectedDept, setSelectedDept] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (selectedDept) {
      fetchDeptEmployees(selectedDept);
    } else {
      setEmployees([]);
      setSelectedIds([]);
    }
  }, [selectedDept]);

  const fetchDeptEmployees = async (dept) => {
    setLoading(true);
    try {
      const res = await employeeAPI.getAll({ dept, limit: 1000, excludeBhl: true });
      setEmployees(res.data || []);
      // Auto-select all by default
      setSelectedIds((res.data || []).map(e => e.id));
    } catch (err) {
      alert('Gagal mengambil data karyawan');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(employees.map(emp => emp.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleEmployee = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleSync = async () => {
    if (selectedIds.length === 0) return alert('Pilih minimal 1 karyawan');
    if (!window.confirm(`Yakin ingin menyamakan tipe gaji ${selectedIds.length} karyawan menjadi UMK/UMR? Gaji Pokok & Tunjangan mereka akan otomatis terisi sesuai setting Matriks/Global.`)) return;
    
    setSyncing(true);
    try {
      await employeeAPI.batchUpdateSalaryCategory({ 
        employeeIds: selectedIds, 
        salaryCategory: 'UMK/UMR' 
      });
      alert('Sinkronisasi gaji normal berhasil!');
      onDone();
    } catch (err) {
      alert('Terjadi kesalahan saat sinkronisasi');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl w-full max-w-2xl relative z-10 flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-emerald-50/30 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center border border-emerald-200">
              <Banknote className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-xl">Sync Gaji Normal (UMK/UMR)</h3>
              <p className="text-xs text-slate-500 mt-1">Ubah kategori gaji secara massal berdasarkan departemen</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">1. Pilih Departemen</label>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              <option value="">-- Pilih Departemen --</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          {selectedDept && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-semibold text-slate-700">2. Pilih Karyawan ({selectedIds.length} / {employees.length} terpilih)</label>
              </div>
              
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {loading ? (
                  <div className="p-8 flex flex-col items-center text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
                    <span className="text-sm">Memuat data karyawan...</span>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    Tidak ada karyawan di departemen ini.
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        id="selectAll"
                        checked={selectedIds.length === employees.length && employees.length > 0}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="selectAll" className="text-sm font-bold text-slate-700 cursor-pointer">Pilih Semua Karyawan</label>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {employees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(emp.id)}
                            onChange={() => handleToggleEmployee(emp.id)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{emp.name}</p>
                            <p className="text-xs text-slate-500">{emp.employeeCode} • {emp.position || 'No Position'}</p>
                          </div>
                          <div className="ml-auto">
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md uppercase">
                              {emp.salaryCategory || 'BLM DISET'}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-all text-sm">
            Batal
          </button>
          <button 
            onClick={handleSync} 
            disabled={syncing || selectedIds.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyinkronkan...</> : <><Save className="w-4 h-4" /> Terapkan Gaji Normal</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom styles for CreatableSelect
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

export default Employees;
