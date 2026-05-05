import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI } from '../../services/api';
import CreatableSelect from 'react-select/creatable';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import * as XLSX from 'xlsx';
import { 
  Search, Filter, CheckCircle2, Clock, UserPlus, FileSpreadsheet, Upload, X, Download, Save, Camera,
  ScanFace, Loader2, AlertCircle, RefreshCw, ShieldCheck
} from 'lucide-react';
import { settingsAPI } from '../../services/api';

const emptyEmployee = { 
  name: '', dept: '', division: '', locationId: '', idNumber: '', cardNo: '', verifyCode: 'Face ID', 
  email: '', phone: '', position: '', grade: '', section: '', employmentStatus: '', contractDuration: '', 
  faceId: '', facePhoto: '', faceDescriptor: null, bpjsTk: '', bpjsKesehatan: '', npwp: '', ptkpStatus: '', kkNumber: '', 
  birthPlace: '', address: '', education: '', major: '', religion: '', numberOfChildren: 0, 
  fatherName: '', motherName: '', spouseName: '', emergencyContact: '', notes: '',
  joinDate: '', contractEnd: '', birthDate: ''
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
  
  const webcamRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

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
    queryKey: ['employees', { search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter }],
    queryFn: () => employeeAPI.getAll({ search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter }),
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
      alert('Data karyawan berhasil diperbarui!');
    },
    onError: (err) => alert(`Update failed: ${err.message}`)
  });

  const filteredEmployees = data?.data || [];

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
      joinDate: emp.joinDate ? new Date(emp.joinDate).toISOString().split('T')[0] : '',
      contractEnd: emp.contractEnd ? new Date(emp.contractEnd).toISOString().split('T')[0] : '',
      birthDate: emp.birthDate ? new Date(emp.birthDate).toISOString().split('T')[0] : '',
    });
    setAddModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'NIK', 'Nama', 'Departemen', 'Jabatan', 'Bagian', 'Grade', 'Status Kerja', 
      'Lama Kontrak', 'Tanggal Masuk', 'Sisa Tanggal Kontrak', 'Email', 'No HP',
      'NIK KTP', 'No Kartu Keluarga', 'Tanggal Lahir', 'Tempat Lahir', 'Alamat',
      'Agama', 'Pendidikan Terakhir', 'Jurusan', 'Jumlah Anak', 'Nama Ayah Kandung',
      'Nama Ibu Kandung', 'Nama Suami/Istri', 'KONTAK DARURAT', 'Keterangan'
    ];
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master_Template");
    
    // Trigger download
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
            alert('Wajah berhasil dideteksi dan didaftarkan!');
          } else {
            alert('Wajah tidak terdeteksi. Pastikan pencahayaan cukup dan wajah terlihat jelas.');
          }
          setIsCapturing(false);
        };
      } catch (err) {
        alert('Gagal memproses wajah.');
        setIsCapturing(false);
      }
    } else {
      alert('Model AI sedang dimuat. Harap tunggu sebentar.');
      setIsCapturing(false);
    }
  };

  // Custom styles for CreatableSelect
  const selectStyles = {
    control: (base) => ({ ...base, borderRadius: '0.75rem', borderColor: '#e2e8f0', padding: '1px', backgroundColor: '#f8fafc', boxShadow: 'none', '&:hover': { borderColor: '#cbd5e1' } }),
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">HR Master Data</h1>
          <p className="text-slate-500 mt-1">Kelola data karyawan, grade, jabatan, dan Face ID.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setImportModalOpen(true)} className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Import Excel
          </button>
          <button onClick={() => setQuickShiftModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10">
            <RefreshCw className="w-4 h-4" /> Quick Shift
          </button>
          <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-6 mb-6 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
          <div className="flex-1 min-w-[240px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Search Employee</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search NIK, Name..." 
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="min-w-[160px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Departemen</label>
              <select 
                value={deptFilter} 
                onChange={e => { setDeptFilter(e.target.value); setSectionFilter(''); setPositionFilter(''); }} 
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold transition-all"
              >
                <option value="">Semua Departemen</option>
                {masterOptions.departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>

            <div className="min-w-[160px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Bagian (Section)</label>
              <select 
                value={sectionFilter} 
                onChange={e => setSectionFilter(e.target.value)} 
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold transition-all"
              >
                <option value="">Semua Bagian</option>
                {masterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="min-w-[160px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Jabatan (Position)</label>
              <select 
                value={positionFilter} 
                onChange={e => setPositionFilter(e.target.value)} 
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold transition-all"
              >
                <option value="">Semua Jabatan</option>
                {masterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-260px)] pb-4 custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap min-w-[3000px]">
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider border-y border-slate-200">
                <th className="px-3 py-3 w-16 text-center sticky left-0 bg-slate-100 z-30 border-r border-slate-200">Aksi</th>
                <th className="px-3 py-3 w-20 text-center sticky left-16 bg-slate-100 z-30 border-r border-slate-200">NIK</th>
                <th className="px-3 py-3 w-48 sticky left-36 bg-slate-100 z-30 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Nama</th>
                <th className="px-3 py-3 bg-slate-100">Face ID</th>
                <th className="px-3 py-3 bg-slate-100">Shift</th>
                <th className="px-3 py-3 bg-slate-100">Grade</th>
                <th className="px-3 py-3 bg-slate-100">Jabatan</th>
                <th className="px-3 py-3 bg-slate-100">Bagian</th>
                <th className="px-3 py-3 bg-slate-100">Departemen</th>
                <th className="px-3 py-3 bg-slate-100">Status Kerja</th>
                <th className="px-3 py-3 bg-slate-100">Lama Kontrak</th>
                <th className="px-3 py-3 bg-slate-100">Tgl Masuk</th>
                <th className="px-3 py-3 bg-slate-100">Sisa Kontrak</th>
                <th className="px-3 py-3 bg-slate-100">BPJS TK</th>
                <th className="px-3 py-3 bg-slate-100">BPJS Kes</th>
                <th className="px-3 py-3 bg-slate-100">NPWP</th>
                <th className="px-3 py-3 bg-slate-100">Status PTKP</th>
                <th className="px-3 py-3 bg-slate-100">No KK</th>
                <th className="px-3 py-3 bg-slate-100">NIK KTP</th>
                <th className="px-3 py-3 bg-slate-100">Tgl Lahir</th>
                <th className="px-3 py-3 bg-slate-100">Tempat Lahir</th>
                <th className="px-3 py-3 bg-slate-100">Alamat</th>
                <th className="px-3 py-3 bg-slate-100">Pendidikan</th>
                <th className="px-3 py-3 bg-slate-100">Jurusan</th>
                <th className="px-3 py-3 bg-slate-100">Agama</th>
                <th className="px-3 py-3 bg-slate-100">No HP</th>
                <th className="px-3 py-3 bg-slate-100">Jml Anak</th>
                <th className="px-3 py-3 bg-slate-100">Nama Ayah</th>
                <th className="px-3 py-3 bg-slate-100">Nama Ibu</th>
                <th className="px-3 py-3 bg-slate-100">Nama Suami/Istri</th>
                <th className="px-3 py-3 bg-slate-100">Kontak Darurat</th>
                <th className="px-3 py-3 bg-slate-100">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan="31" className="text-center py-8 text-slate-500">Loading...</td></tr>
              ) : filteredEmployees.map((emp) => (
                <tr key={emp.dbId} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-3 py-2 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 text-center">
                    <button onClick={() => handleEditEmployee(emp)} className="text-primary hover:text-emerald-700 bg-primary/10 hover:bg-primary/20 px-3 py-1 rounded text-xs font-bold transition-colors">
                      Edit
                    </button>
                  </td>
                  <td className="px-3 py-2 sticky left-16 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 text-center text-sm font-bold text-slate-700">
                    {emp.id}
                  </td>
                  <td className="px-3 py-2 sticky left-36 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <span className="text-sm truncate block min-w-[80px]">{emp.name || <span className="text-slate-300 italic text-xs">Empty</span>}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded">
                      {emp.faceId === 'Enrolled' ? <CheckCircle2 className="w-3 h-3 text-emerald-500"/> : <Clock className="w-3 h-3 text-amber-500"/>}
                      <span className="text-sm font-medium">{emp.faceId}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded">
                      <Clock className="w-3 h-3 text-primary" />
                      <span className="text-sm font-medium">{emp.shift?.name || 'Standard'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.grade || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.position || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.section || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.dept || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.employmentStatus || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.contractDuration || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString() : <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.contractEnd ? new Date(emp.contractEnd).toLocaleDateString() : <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.bpjsTk || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.bpjsKesehatan || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.npwp || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.ptkpStatus || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.kkNumber || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.idNumber || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.birthDate ? new Date(emp.birthDate).toLocaleDateString() : <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.birthPlace || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.address || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.education || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.major || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.religion || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.phone || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.numberOfChildren?.toString() || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.fatherName || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.motherName || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.spouseName || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.emergencyContact || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                  <td className="px-3 py-2"><span className="text-sm truncate block min-w-[80px]">{emp.notes || <span className="text-slate-300 italic text-xs">Empty</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabbed Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setAddModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> {newEmployee.dbId ? 'Edit Karyawan' : 'Tambah Karyawan'} & Registrasi Wajah
              </h3>
              <button onClick={() => setAddModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            
            <div className="flex border-b border-slate-100">
              {['basic', 'hr', 'personal', 'family'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-3 text-sm font-bold capitalize ${activeTab === tab ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {tab === 'basic' ? 'Basic Info & Face ID' : tab === 'hr' ? 'HR & Pekerjaan' : tab === 'personal' ? 'Data Pribadi' : 'Keluarga & Kontak'}
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <form id="add-emp-form" onSubmit={handleAddEmployee} className="space-y-6">
                {activeTab === 'basic' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div><label className="text-xs font-bold text-slate-500">Nama Lengkap</label><input required value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                      <div><label className="text-xs font-bold text-slate-500">Email Login</label><input required type="email" value={newEmployee.email} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Departemen</label>
                        <CreatableSelect styles={selectStyles} isClearable options={toSelectOptions(masterOptions.departments)} value={newEmployee.dept ? {label: newEmployee.dept, value: newEmployee.dept} : null} onChange={(val) => setNewEmployee({...newEmployee, dept: val ? val.value : ''})} className="mt-1 text-sm"/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Jabatan</label>
                        <CreatableSelect styles={selectStyles} isClearable options={toSelectOptions(masterOptions.positions)} value={newEmployee.position ? {label: newEmployee.position, value: newEmployee.position} : null} onChange={(val) => setNewEmployee({...newEmployee, position: val ? val.value : ''})} className="mt-1 text-sm"/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Bagian</label>
                        <CreatableSelect styles={selectStyles} isClearable options={toSelectOptions(masterOptions.sections)} value={newEmployee.section ? {label: newEmployee.section, value: newEmployee.section} : null} onChange={(val) => setNewEmployee({...newEmployee, section: val ? val.value : ''})} className="mt-1 text-sm"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-2">
                        <ScanFace className="w-4 h-4 text-primary" /> Registrasi Face ID
                        {newEmployee.faceId === 'Enrolled' && (
                          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                            <ShieldCheck className="w-3 h-3" /> Terdaftar
                          </span>
                        )}
                      </label>
                      
                      {/* Scanner Container */}
                      <div className="face-reg-container rounded-2xl overflow-hidden relative">
                        <div className="relative mx-auto" style={{ maxWidth: '100%' }}>
                          {/* Camera/Photo Area */}
                          <div className="aspect-[4/3] rounded-xl overflow-hidden relative bg-slate-900">
                            {newEmployee.facePhoto ? (
                              <img src={newEmployee.facePhoto} alt="Face" className="w-full h-full object-cover" />
                            ) : (
                              <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user", width: 480, height: 360 }} />
                            )}
                            
                            {/* Corner Brackets */}
                            {!newEmployee.facePhoto && (
                              <div className="absolute inset-3 pointer-events-none z-10">
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white/70 rounded-tl-lg" />
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white/70 rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white/70 rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white/70 rounded-br-lg" />
                              </div>
                            )}
                            
                            {/* Scan Line */}
                            {!newEmployee.facePhoto && !isCapturing && modelsLoaded && (
                              <div className="absolute inset-0 pointer-events-none">
                                <div className="face-reg-scanline" />
                              </div>
                            )}
                            
                            {/* Loading AI Overlay */}
                            {!modelsLoaded && !newEmployee.facePhoto && (
                              <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-sm flex flex-col items-center justify-center">
                                <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                                <p className="text-white/80 text-xs font-bold">Memuat Model AI...</p>
                              </div>
                            )}
                            
                            {/* Capturing Overlay */}
                            {isCapturing && (
                              <div className="absolute inset-0 bg-primary/10 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none">
                                <div className="face-reg-detect-ring" />
                                <p className="text-white text-xs font-bold mt-3 drop-shadow-lg">Mendeteksi Wajah...</p>
                              </div>
                            )}
                            
                            {/* Enrolled Success Overlay */}
                            {newEmployee.facePhoto && newEmployee.faceId === 'Enrolled' && (
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-900/90 to-transparent p-4 flex items-end">
                                <div className="flex items-center gap-2 text-white">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                                  <span className="text-sm font-bold">Wajah Berhasil Didaftarkan</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="mt-3 flex gap-2">
                          {newEmployee.facePhoto ? (
                            <button type="button" onClick={() => setNewEmployee({...newEmployee, facePhoto: '', faceDescriptor: null, faceId: 'Pending'})} 
                              className="w-full px-4 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all duration-200 border border-slate-200 hover:border-red-200">
                              <RefreshCw className="w-3.5 h-3.5" /> Ulangi Foto
                            </button>
                          ) : (
                            <button type="button" disabled={!modelsLoaded || isCapturing} onClick={captureFace} 
                              className="w-full px-4 py-2.5 bg-gradient-to-r from-primary to-emerald-500 hover:from-primary-light hover:to-emerald-400 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed">
                              {isCapturing ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Mendeteksi...</>
                              ) : !modelsLoaded ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Loading Model...</>
                              ) : (
                                <><ScanFace className="w-4 h-4" /> Ambil Wajah & Daftarkan</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Face Registration Styles */}
                      <style>{`
                        .face-reg-container {
                          background: linear-gradient(145deg, #f8fafc, #f1f5f9);
                          padding: 12px;
                          border: 1px solid #e2e8f0;
                        }
                        .face-reg-scanline {
                          position: absolute;
                          left: 12%; right: 12%;
                          height: 2px;
                          background: linear-gradient(90deg, transparent, rgba(0,108,73,0.7), transparent);
                          box-shadow: 0 0 12px rgba(0,108,73,0.4);
                          animation: faceRegScan 2.5s ease-in-out infinite;
                        }
                        @keyframes faceRegScan { 0%,100% { top: 15%; } 50% { top: 85%; } }
                        .face-reg-detect-ring {
                          width: 60px; height: 60px;
                          border: 3px solid transparent;
                          border-top-color: rgba(255,255,255,0.8);
                          border-right-color: rgba(255,255,255,0.3);
                          border-radius: 50%;
                          animation: faceRegSpin 0.8s linear infinite;
                        }
                        @keyframes faceRegSpin { to { transform: rotate(360deg); } }
                      `}</style>
                    </div>
                  </div>
                )}
                {activeTab === 'hr' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Shift Kerja</label>
                      <select 
                        value={newEmployee.shiftId || ''} 
                        onChange={e => setNewEmployee({...newEmployee, shiftId: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Pilih Shift...</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Grade Penggajian</label>
                      <CreatableSelect styles={selectStyles} isClearable options={toSelectOptions(masterOptions.grades)} value={newEmployee.grade ? {label: newEmployee.grade, value: newEmployee.grade} : null} onChange={(val) => setNewEmployee({...newEmployee, grade: val ? val.value : ''})} className="mt-1 text-sm"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Status Kerja (PKWTT, Training, dll)</label>
                      <CreatableSelect styles={selectStyles} isClearable options={toSelectOptions(masterOptions.employmentStatuses)} value={newEmployee.employmentStatus ? {label: newEmployee.employmentStatus, value: newEmployee.employmentStatus} : null} onChange={(val) => setNewEmployee({...newEmployee, employmentStatus: val ? val.value : ''})} className="mt-1 text-sm"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Lama Kontrak</label>
                      <CreatableSelect styles={selectStyles} isClearable options={toSelectOptions(masterOptions.contractDurations)} value={newEmployee.contractDuration ? {label: newEmployee.contractDuration, value: newEmployee.contractDuration} : null} onChange={(val) => setNewEmployee({...newEmployee, contractDuration: val ? val.value : ''})} className="mt-1 text-sm"/>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500">Tanggal Masuk</label><input type="date" value={newEmployee.joinDate} onChange={e => setNewEmployee({...newEmployee, joinDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Sisa Kontrak (End Date)</label><input type="date" value={newEmployee.contractEnd} onChange={e => setNewEmployee({...newEmployee, contractEnd: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">BPJS TK</label><input value={newEmployee.bpjsTk} onChange={e => setNewEmployee({...newEmployee, bpjsTk: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">BPJS Kesehatan</label><input value={newEmployee.bpjsKesehatan} onChange={e => setNewEmployee({...newEmployee, bpjsKesehatan: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">NPWP</label><input value={newEmployee.npwp} onChange={e => setNewEmployee({...newEmployee, npwp: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Status PTKP</label><input value={newEmployee.ptkpStatus} onChange={e => setNewEmployee({...newEmployee, ptkpStatus: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                  </div>
                )}
                {activeTab === 'personal' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-slate-500">NIK KTP</label><input value={newEmployee.idNumber} onChange={e => setNewEmployee({...newEmployee, idNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">No KK</label><input value={newEmployee.kkNumber} onChange={e => setNewEmployee({...newEmployee, kkNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Tanggal Lahir</label><input type="date" value={newEmployee.birthDate} onChange={e => setNewEmployee({...newEmployee, birthDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Tempat Lahir</label><input value={newEmployee.birthPlace} onChange={e => setNewEmployee({...newEmployee, birthPlace: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Agama</label><input value={newEmployee.religion} onChange={e => setNewEmployee({...newEmployee, religion: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div className="col-span-2"><label className="text-xs font-bold text-slate-500">Alamat</label><input value={newEmployee.address} onChange={e => setNewEmployee({...newEmployee, address: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Pendidikan Terakhir</label><input value={newEmployee.education} onChange={e => setNewEmployee({...newEmployee, education: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Jurusan</label><input value={newEmployee.major} onChange={e => setNewEmployee({...newEmployee, major: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                  </div>
                )}
                {activeTab === 'family' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-slate-500">Jumlah Anak</label><input type="number" value={newEmployee.numberOfChildren} onChange={e => setNewEmployee({...newEmployee, numberOfChildren: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Nama Ayah</label><input value={newEmployee.fatherName} onChange={e => setNewEmployee({...newEmployee, fatherName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Nama Ibu</label><input value={newEmployee.motherName} onChange={e => setNewEmployee({...newEmployee, motherName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Nama Suami/Istri</label><input value={newEmployee.spouseName} onChange={e => setNewEmployee({...newEmployee, spouseName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">No HP</label><input value={newEmployee.phone} onChange={e => setNewEmployee({...newEmployee, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Kontak Darurat</label><input value={newEmployee.emergencyContact} onChange={e => setNewEmployee({...newEmployee, emergencyContact: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm mt-1" /></div>
                  </div>
                )}
              </form>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setAddModalOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200">Batal</button>
              <button type="submit" form="add-emp-form" className="btn-primary flex items-center gap-2"><Save className="w-4 h-4"/> Simpan Karyawan</button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => !isUploading && setImportModalOpen(false)}></div>
          
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl relative z-10 overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="px-8 py-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Import Master Data</h3>
                  <p className="text-xs text-slate-400 font-medium">Upload database karyawan secara massal</p>
                </div>
              </div>
              <button onClick={() => !isUploading && setImportModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600 transition-colors" />
              </button>
            </div>

            <div className="p-8">
              {!importResult && !isUploading ? (
                <div className="space-y-6">
                  {/* Info Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Keamanan</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Sistem otomatis melewati NIK yang sudah terdaftar (Anti-Duplikat).</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Download className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Template</span>
                      </div>
                      <button onClick={handleDownloadTemplate} className="text-[11px] text-blue-600 font-bold hover:underline">Download Format Excel</button>
                    </div>
                  </div>

                  {/* Dropzone */}
                  <label className="group block relative cursor-pointer">
                    <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImport} />
                    <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 flex flex-col items-center transition-all group-hover:border-primary group-hover:bg-primary/5 group-hover:shadow-inner">
                      <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                        <Upload className="w-8 h-8 text-primary" />
                      </div>
                      <h4 className="font-bold text-slate-700">Pilih Database Karyawan</h4>
                      <p className="text-sm text-slate-400 mt-1">Format: .xlsx, .xls, .csv</p>
                      
                      <div className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold shadow-lg shadow-slate-900/20 group-hover:bg-primary transition-colors">
                        Browse Files
                      </div>
                    </div>
                  </label>
                </div>
              ) : isUploading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="w-full max-w-xs space-y-6 text-center">
                    <div className="relative inline-block">
                      <div className="w-24 h-24 border-4 border-slate-100 rounded-full" />
                      <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-black text-primary">{uploadProgress}%</span>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg">Mengunggah Data...</h4>
                      <p className="text-sm text-slate-400 mt-1">Harap tunggu, jangan segarkan halaman.</p>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                      <div className="bg-primary h-full transition-all duration-300 shadow-[0_0_10px_rgba(0,108,73,0.3)]" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Result Header */}
                  <div className={`p-5 rounded-3xl flex items-center gap-4 ${importResult.success ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}>
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                      {importResult.success ? <CheckCircle2 className="w-7 h-7 text-emerald-600" /> : <AlertCircle className="w-7 h-7 text-rose-600" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">Proses Selesai</h4>
                      <p className="text-sm text-slate-500 leading-tight">{importResult.message}</p>
                    </div>
                  </div>

                  {/* Summary Dashboard */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Data Baru</span>
                      <span className="text-3xl font-black text-emerald-600">{importResult.data?.imported || 0}</span>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Duplikat</span>
                      <span className="text-3xl font-black text-amber-500">{importResult.data?.skipped || 0}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => { setImportResult(null); setImportModalOpen(false); }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98]"
                  >
                    Selesai & Tutup
                  </button>
                </div>
              )}
            </div>

            <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-medium">
                Sistem validasi NIK aktif untuk memastikan tidak ada data karyawan ganda di database.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Quick Shift Modal */}
      {isQuickShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setQuickShiftModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                Quick Shift Change
              </h3>
              <button onClick={() => setQuickShiftModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); batchShiftMutation.mutate(quickShiftForm); }}>
              <div className="p-6 space-y-4">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Tindakan ini akan mengganti shift untuk <b>semua karyawan</b> di departemen yang dipilih secara massal.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pilih Departemen</label>
                  <select 
                    required
                    value={quickShiftForm.departmentId}
                    onChange={(e) => setQuickShiftForm({...quickShiftForm, departmentId: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Pilih Departemen...</option>
                    <option value="0" className="font-bold text-primary">-- Semua Departemen --</option>
                    {masterOptions.departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pilih Shift Baru</label>
                  <select 
                    required
                    value={quickShiftForm.shiftId}
                    onChange={(e) => setQuickShiftForm({...quickShiftForm, shiftId: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Pilih Shift...</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setQuickShiftModalOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={batchShiftMutation.isPending}
                  className="flex-1 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all disabled:opacity-70"
                >
                  {batchShiftMutation.isPending ? 'Memproses...' : 'Terapkan Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
