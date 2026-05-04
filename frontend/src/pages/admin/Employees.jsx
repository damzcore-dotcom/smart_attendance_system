import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI } from '../../services/api';
import CreatableSelect from 'react-select/creatable';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
import { 
  Search, Filter, CheckCircle2, Clock, UserPlus, FileSpreadsheet, Upload, X, Download, Save, Camera
} from 'lucide-react';

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
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState(emptyEmployee);
  const [activeTab, setActiveTab] = useState('basic');
  
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
    queryKey: ['employees', { search: searchTerm, dept: deptFilter, section: sectionFilter }],
    queryFn: () => employeeAPI.getAll({ search: searchTerm, dept: deptFilter, section: sectionFilter }),
  });

  const { data: optionsData } = useQuery({
    queryKey: ['master-options'],
    queryFn: () => employeeAPI.getMasterOptions(),
  });

  const masterOptions = optionsData?.data || { grades: [], positions: [], sections: [], employmentStatuses: [], contractDurations: [], departments: [] };
  const toSelectOptions = (arr) => arr.map(i => ({ label: i, value: i }));

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
      
      setTimeout(() => {
        alert(res.message);
        queryClient.invalidateQueries({ queryKey: ['employees'] });
        queryClient.invalidateQueries({ queryKey: ['master-options'] });
        setImportModalOpen(false);
      }, 500);
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
      'NIK', 'Nama', 'Face ID', 'Grade', 'Jabatan', 'Bagian', 'Departemen', 'Status Kerja', 
      'Lama Kontrak', 'Tanggal Masuk', 'Sisa Tanggal Kontrak', 'BPJS TK', 'BPJS Kesehatan', 
      'NPWP', 'Status PTKP (Pajak)', 'No Kartu Keluarga', 'NIK KTP', 'Tanggal Lahir', 'Tempat Lahir', 
      'Alamat', 'Pendidikan Terakhir', 'Jurusan', 'Agama', 'No HP', 'Jumlah Anak', 'Nama Ayah Kandung', 
      'Nama Ibu Kandung', 'Nama Suami/Istri', 'KONTAK DARURAT', 'Email', 'Keterangan'
    ];
    
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "HR_Master_Data_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search NIK, Name..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none text-slate-600">
              <option value="">Semua Departemen</option>
              {masterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none text-slate-600">
              <option value="">Semua Bagian</option>
              {masterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
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
                      <label className="text-xs font-bold text-slate-500 mb-2 block">Registrasi Face ID</label>
                      <div className="bg-slate-900 rounded-2xl overflow-hidden relative aspect-video flex items-center justify-center border-4 border-slate-100 shadow-inner">
                        {newEmployee.facePhoto ? (
                          <img src={newEmployee.facePhoto} alt="Face" className="w-full h-full object-cover" />
                        ) : (
                          <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user" }} />
                        )}
                        {!modelsLoaded && !newEmployee.facePhoto && <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center text-white text-xs font-bold">Loading AI Models...</div>}
                      </div>
                      <div className="mt-4 flex gap-2 justify-center">
                        {newEmployee.facePhoto ? (
                          <button type="button" onClick={() => setNewEmployee({...newEmployee, facePhoto: '', faceDescriptor: null, faceId: 'Pending'})} className="px-4 py-2 bg-red-100 text-red-600 font-bold rounded-xl text-sm w-full">Ulangi Foto</button>
                        ) : (
                          <button type="button" disabled={!modelsLoaded || isCapturing} onClick={captureFace} className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl text-sm w-full flex items-center justify-center gap-2">
                            {isCapturing ? 'Mendeteksi Wajah...' : <><Camera className="w-4 h-4"/> Ambil Wajah & Daftarkan</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'hr' && (
                  <div className="grid grid-cols-2 gap-4">
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

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isUploading && setImportModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Import Master Data
              </h3>
              <button onClick={() => setImportModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-8">
              <div className="border-2 border-dashed rounded-[2rem] p-8 flex flex-col items-center text-center hover:border-primary/40">
                {isUploading ? (
                  <div className="space-y-4 w-full px-8">
                    <p className="font-bold text-slate-700">Processing Data...</p>
                    <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
                      <div 
                        className="bg-emerald-500 h-4 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-emerald-600 font-bold text-xl">{uploadProgress}%</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-emerald-500 mb-4" />
                    <h4 className="font-bold mb-2">Drop HR Excel file here</h4>
                    <div className="flex gap-3 mt-4">
                      <label className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 cursor-pointer">
                        Browse Files
                        <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImport} />
                      </label>
                      <button onClick={handleDownloadTemplate} className="bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-50 flex items-center gap-2">
                        <Download className="w-4 h-4" /> Template CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
