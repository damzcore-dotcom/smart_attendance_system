import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, settingsAPI } from '../../services/api';
import CreatableSelect from 'react-select/creatable';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import * as XLSX from 'xlsx';
import { 
  Search, Filter, CheckCircle2, Clock, UserPlus, FileSpreadsheet, Upload, X, Download, Save, Camera,
  ScanFace, Loader2, AlertCircle, RefreshCw, ShieldCheck, ChevronRight, ChevronUp, ChevronDown
} from 'lucide-react';

const emptyEmployee = { 
  employeeCode: '',
  name: '', dept: '', division: '', locationId: '', idNumber: '', cardNo: '', verifyCode: 'Face ID', 
  email: '', phone: '', position: '', grade: '', section: '', employmentStatus: '', contractDuration: '', 
  faceId: '', facePhoto: '', faceDescriptor: null, bpjsTk: '', bpjsKesehatan: '', npwp: '', ptkpStatus: '', kkNumber: '', 
  birthPlace: '', address: '', education: '', major: '', religion: '', numberOfChildren: 0, 
  fatherName: '', motherName: '', spouseName: '', emergencyContact: '', notes: '',
  joinDate: '', contractEnd: '', birthDate: '',
  leaveQuota: 12, remainingLeave: 12,
};

const Employees = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState(emptyEmployee);
  const [activeTab, setActiveTab] = useState('basic');
  const [isQuickShiftModalOpen, setQuickShiftModalOpen] = useState(false);
  const [quickShiftForm, setQuickShiftForm] = useState({ departmentId: '', shiftId: '' });
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const PAGE_SIZE = 25;
  
  const webcamRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [nikError, setNikError] = useState('');

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
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', { search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter, page, sortBy: sortConfig.key, order: sortConfig.direction }],
    queryFn: () => employeeAPI.getAll({ search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter, page, limit: PAGE_SIZE, sortBy: sortConfig.key, order: sortConfig.direction }),
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

  const shifts = shiftsData?.data || [];
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
      alert(res.message || 'Shift updated successfully!');
    },
    onError: (err) => alert(`Error: ${err.message}`)
  });

  const createMutation = useMutation({
    mutationFn: employeeAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
      setAddModalOpen(false);
      setNewEmployee(emptyEmployee);
      setIsCameraActive(false);
      alert('Employee added successfully!');
    },
    onError: (err) => alert(`Error: ${err.message}`)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => employeeAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
      setAddModalOpen(false);
      setNewEmployee(emptyEmployee);
      setActiveTab('basic');
      alert('Employee data updated successfully!');
    },
    onError: (err) => alert(`Update failed: ${err.message}`)
  });

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
      'Nama Ibu Kandung', 'Nama Suami/Istri', 'KONTAK DARURAT', 'Keterangan'
    ];
    
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master_Template");
    XLSX.writeFile(wb, "Template_Master_Karyawan.xlsx");
  };

  const captureFace = async () => {
    if (!webcamRef.current) return;
    setIsCapturing(true);
    const imageSrc = webcamRef.current.getScreenshot();
    
    if (modelsLoaded) {
      try {
        const img = new Image();
        img.src = imageSrc;
        img.onload = async () => {
          const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
          if (detection) {
            setNewEmployee({...newEmployee, facePhoto: imageSrc, faceDescriptor: JSON.stringify(Array.from(detection.descriptor)), faceId: 'Enrolled' });
            alert('Face detected and enrolled successfully!');
          } else {
            alert('Face not detected. Ensure adequate lighting and clear visibility.');
          }
          setIsCapturing(false);
        };
      } catch (err) {
        alert('Failed to process face.');
        setIsCapturing(false);
      }
    } else {
      alert('AI models are loading. Please wait a moment.');
      setIsCapturing(false);
    }
  };


  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* 1. Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Administrative Oversight</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Personnel Archives</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Human Resources
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              Live Database
            </div>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setImportModalOpen(true)} 
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            Import Archive
          </button>
          <button 
            onClick={() => setQuickShiftModalOpen(true)} 
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
          >
            <RefreshCw className="w-4 h-4 text-blue-600 group-hover:rotate-180 transition-all duration-500" />
            Batch Sync
          </button>
          <button 
            onClick={() => setAddModalOpen(true)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" /> Enlist Personnel
          </button>
        </div>
      </div>

      {/* 2. Global Filter Matrix */}
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Search Personnel</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Name, NIK, ID..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Department</label>
            <div className="relative">
              <select 
                value={deptFilter} 
                onChange={e => { setDeptFilter(e.target.value); setSectionFilter(''); setPositionFilter(''); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">Global Records</option>
                {masterOptions.departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Section</label>
            <div className="relative">
              <select 
                value={sectionFilter} 
                onChange={e => { setSectionFilter(e.target.value); setPositionFilter(''); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">All Sections</option>
                {masterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Rank</label>
            <div className="relative">
              <select 
                value={positionFilter} 
                onChange={e => setPositionFilter(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">All Ranks</option>
                {masterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
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
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</span>
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
                <th 
                  className="px-6 py-4 sticky left-[250px] z-30 bg-slate-50 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Employee Name</span>
                    {sortConfig.key === 'name' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Leave Quota</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Biometrics</span>
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
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Position</span>
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
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Section</span>
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
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Department</span>
                    {sortConfig.key === 'dept' ? (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Emp. Status</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Contract</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Join Date</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Contract End</span>
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
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">No. KK</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">No. KTP</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Birth Date</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Birth Place</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Address</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Education</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Major</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Religion</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Phone</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Children</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Father's Name</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Mother's Name</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Spouse's Name</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Emergency Contact</span>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Notes</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="34" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Loading Data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.map((emp) => (
                <tr key={emp.dbId} className="group hover:bg-blue-50/50 transition-colors duration-200">
                  <td className="px-6 py-3 sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                    <button 
                      onClick={() => handleEditEmployee(emp)} 
                      className="px-4 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-blue-100 hover:border-blue-600 shadow-sm"
                    >
                      Edit
                    </button>
                  </td>
                  <td className="px-6 py-3 sticky left-[120px] z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 text-center text-xs font-semibold text-slate-700">
                    {emp.id}
                  </td>
                  <td className="px-6 py-3 sticky left-[250px] z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                    <div className="flex flex-col min-w-[200px]">
                      <span className="text-sm font-bold text-slate-800 truncate">{emp.name || "Unknown"}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{emp.email || "No Email"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      emp.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      emp.status === 'On Leave' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>{emp.status}</span>
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
                    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all ${emp.faceId === 'Enrolled' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {emp.faceId === 'Enrolled' ? <ShieldCheck className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                      {emp.faceId}
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
            Showing <span className="font-bold text-slate-800">{totalEmployees}</span> records | Page <span className="font-bold text-slate-800">{page}</span> of <span className="font-bold text-slate-800">{totalPages}</span>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setAddModalOpen(false)}></div>
          <div className="bg-white w-full max-w-5xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                  <UserPlus className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-xl tracking-tight">
                    {newEmployee.dbId ? 'Edit Employee Data' : 'Add New Employee'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Complete all required information fields</p>
                </div>
              </div>
              <button onClick={() => setAddModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="flex border-b border-slate-100 bg-white px-2 overflow-x-auto hide-scrollbar">
              {['basic', 'biometric', 'hr', 'personal', 'family'].map(tab => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)} 
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all relative whitespace-nowrap ${activeTab === tab ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {tab === 'basic' ? 'Core Info' : tab === 'biometric' ? 'Biometrics' : tab === 'hr' ? 'Employment Info' : tab === 'personal' ? 'Personal Data' : 'Family Data'}
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
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">NIK (Employee ID)</label>
                      <input
                        value={newEmployee.employeeCode}
                        onChange={e => { setNewEmployee({...newEmployee, employeeCode: e.target.value}); setNikError(''); }}
                        onBlur={handleNikBlur}
                        readOnly={!!newEmployee.dbId}
                        placeholder={newEmployee.dbId ? '' : 'Auto-generated if empty'}
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
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Full Name</label>
                      <input required value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Email Address</label>
                      <input required type="email" value={newEmployee.email} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Department</label>
                      <CreatableSelect 
                        styles={customSelectStyles} 
                        isClearable 
                        placeholder="Select..."
                        options={toSelectOptions(masterOptions.departments)} 
                        value={newEmployee.dept ? {label: newEmployee.dept, value: newEmployee.dept} : null} 
                        onChange={(val) => setNewEmployee({...newEmployee, dept: val ? val.value : ''})} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Position</label>
                      <CreatableSelect 
                        styles={customSelectStyles} 
                        isClearable 
                        placeholder="Select..."
                        options={toSelectOptions(masterOptions.positions)} 
                        value={newEmployee.position ? {label: newEmployee.position, value: newEmployee.position} : null} 
                        onChange={(val) => setNewEmployee({...newEmployee, position: val ? val.value : ''})} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block ml-1">Section</label>
                      <CreatableSelect 
                        styles={customSelectStyles} 
                        isClearable 
                        placeholder="Select..."
                        options={toSelectOptions(masterOptions.sections)} 
                        value={newEmployee.section ? {label: newEmployee.section, value: newEmployee.section} : null} 
                        onChange={(val) => setNewEmployee({...newEmployee, section: val ? val.value : ''})} 
                      />
                    </div>
                  </div>
                )}
                {activeTab === 'biometric' && (
                  <div className="flex justify-center pb-8">
                    <div className="w-full max-w-md space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                          <ScanFace className="w-4 h-4" /> Biometric Capture
                          {newEmployee.faceId === 'Enrolled' && (
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
                              <button type="button" onClick={() => setIsCameraActive(false)} 
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
                            <img src={newEmployee.facePhoto} alt="Face" className="w-full h-full object-cover" />
                          ) : isCameraActive ? (
                            <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user", width: 640, height: 480 }} />
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
                              <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-blue-500/60 rounded-tl-xl" />
                              <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-blue-500/60 rounded-tr-xl" />
                              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-blue-500/60 rounded-bl-xl" />
                              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-blue-500/60 rounded-br-xl" />
                              
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-48 h-48 border border-blue-400/30 rounded-full" />
                              </div>

                              {!isCapturing && modelsLoaded && (
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
                {activeTab === 'hr' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 block">Work Shift</label>
                      <select 
                        value={newEmployee.shiftId || ''} 
                        onChange={e => setNewEmployee({...newEmployee, shiftId: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Select Shift...</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name} [{s.startTime}-{s.endTime}]</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Grade</label>
                      <CreatableSelect styles={customSelectStyles} isClearable options={toSelectOptions(masterOptions.grades)} value={newEmployee.grade ? {label: newEmployee.grade, value: newEmployee.grade} : null} onChange={(val) => setNewEmployee({...newEmployee, grade: val ? val.value : ''})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Employment Status</label>
                      <CreatableSelect styles={customSelectStyles} isClearable options={toSelectOptions(masterOptions.employmentStatuses)} value={newEmployee.employmentStatus ? {label: newEmployee.employmentStatus, value: newEmployee.employmentStatus} : null} onChange={(val) => setNewEmployee({...newEmployee, employmentStatus: val ? val.value : ''})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Contract Duration</label>
                      <CreatableSelect styles={customSelectStyles} isClearable options={toSelectOptions(masterOptions.contractDurations)} value={newEmployee.contractDuration ? {label: newEmployee.contractDuration, value: newEmployee.contractDuration} : null} onChange={(val) => setNewEmployee({...newEmployee, contractDuration: val ? val.value : ''})} />
                    </div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Join Date</label><input type="date" value={newEmployee.joinDate} onChange={e => setNewEmployee({...newEmployee, joinDate: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Contract End</label><input type="date" value={newEmployee.contractEnd} onChange={e => setNewEmployee({...newEmployee, contractEnd: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">BPJS Ketenagakerjaan</label><input value={newEmployee.bpjsTk} onChange={e => setNewEmployee({...newEmployee, bpjsTk: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">BPJS Kesehatan</label><input value={newEmployee.bpjsKesehatan} onChange={e => setNewEmployee({...newEmployee, bpjsKesehatan: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">NPWP</label><input value={newEmployee.npwp} onChange={e => setNewEmployee({...newEmployee, npwp: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Leave Quota</label><input type="number" value={newEmployee.leaveQuota} onChange={e => setNewEmployee({...newEmployee, leaveQuota: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                      <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Remaining</label><input type="number" value={newEmployee.remainingLeave} onChange={e => setNewEmployee({...newEmployee, remainingLeave: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    </div>
                  </div>
                )}
                {activeTab === 'personal' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">ID Card (KTP)</label><input value={newEmployee.idNumber} onChange={e => setNewEmployee({...newEmployee, idNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Family Card (KK)</label><input value={newEmployee.kkNumber} onChange={e => setNewEmployee({...newEmployee, kkNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Date of Birth</label><input type="date" value={newEmployee.birthDate} onChange={e => setNewEmployee({...newEmployee, birthDate: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Place of Birth</label><input value={newEmployee.birthPlace} onChange={e => setNewEmployee({...newEmployee, birthPlace: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Religion</label><input value={newEmployee.religion} onChange={e => setNewEmployee({...newEmployee, religion: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Education</label><input value={newEmployee.education} onChange={e => setNewEmployee({...newEmployee, education: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div className="lg:col-span-2"><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Address</label><input value={newEmployee.address} onChange={e => setNewEmployee({...newEmployee, address: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Major</label><input value={newEmployee.major} onChange={e => setNewEmployee({...newEmployee, major: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                  </div>
                )}
                {activeTab === 'family' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Number of Children</label><input type="number" value={newEmployee.numberOfChildren} onChange={e => setNewEmployee({...newEmployee, numberOfChildren: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Father's Name</label><input value={newEmployee.fatherName} onChange={e => setNewEmployee({...newEmployee, fatherName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Mother's Name</label><input value={newEmployee.motherName} onChange={e => setNewEmployee({...newEmployee, motherName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Spouse's Name</label><input value={newEmployee.spouseName} onChange={e => setNewEmployee({...newEmployee, spouseName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Phone Number</label><input value={newEmployee.phone} onChange={e => setNewEmployee({...newEmployee, phone: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                    <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">Emergency Contact</label><input value={newEmployee.emergencyContact} onChange={e => setNewEmployee({...newEmployee, emergencyContact: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
                  </div>
                )}
              </form>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setAddModalOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all">Cancel</button>
              <button 
                type="submit" 
                form="add-emp-form" 
                disabled={!!nikError || createMutation.isPending || updateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>} 
                Save Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
  })
};

export default Employees;
