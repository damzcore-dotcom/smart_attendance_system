import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { employeeAPI, settingsAPI, payrollAPI, deviceAPI, fingerprintAPI, getFileUrl } from '../../services/api';
import * as faceapi from '@vladmandic/face-api';
import * as XLSX from 'xlsx';
import { 
  Search, Filter, CheckCircle2, Clock, UserPlus, FileSpreadsheet, Upload, X, Download, Save, Camera,
  ScanFace, Loader2, AlertCircle, RefreshCw, ShieldCheck, ChevronRight, ChevronUp, ChevronDown, FileText, Banknote, Printer, Fingerprint, Trash2, Users, UserMinus
} from 'lucide-react';
import PrintableIDCard from '../../components/admin/PrintableIDCard';
import EmployeeTable from '../../components/admin/employee/EmployeeTable';
import EmployeeFormModal from '../../components/admin/employee/EmployeeFormModal';

const emptyEmployee = { 
  employeeCode: '',
  name: '', dept: '', division: '', locationId: '', idNumber: '', cardNo: '', verifyCode: 'Face ID', 
  email: '', phone: '', position: '', grade: '', section: '', employmentStatus: '', contractDuration: '', 
  faceId: '', facePhoto: '', faceDescriptor: null, bpjsTk: '', bpjsKesehatan: '', npwp: '', ptkpStatus: '', kkNumber: '', 
  birthPlace: '', address: '', education: '', major: '', religion: '', maritalStatus: '', numberOfChildren: 0, 
  fatherName: '', motherName: '', spouseName: '', emergencyContact: '', notes: '',
  joinDate: '', contractEnd: '', birthDate: '', terminationDate: '', terminationReason: '',
  leaveQuota: 12, remainingLeave: 12, profilePhoto: '',
  status: 'Active'
};


const Employees = ({ isReadOnly = false }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [empStatusFilter, setEmpStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedStatsFilter, setSelectedStatsFilter] = useState('');
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
  const [printIDCardEmp, setPrintIDCardEmp] = useState(null);
  const [printBulkIDCards, setPrintBulkIDCards] = useState(null);
  const [companySettings, setCompanySettings] = useState({});
  const [idCardConfig, setIdCardConfig] = useState(null);
  const [cameFromPage, setCameFromPage] = useState(null);
  const PAGE_SIZE = 25;
  
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(1);
  };

  const handleStatsFilterChange = (filterType) => {
    setSelectedStatsFilter(prev => prev === filterType ? '' : filterType);
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
      setCameFromPage(location.state.cameFrom || '/admin/contracts');
      // Clear navigation state to prevent re-opening modal on refresh
      navigate(location.pathname, { replace: true, state: null });
      
      const fetchAndEdit = async () => {
        try {
          const res = await employeeAPI.getAll({ search: code });
          if (res.success && res.data && res.data.length > 0) {
            handleEditEmployee(res.data[0]);
            setActiveTab('hr'); // Directly open "Informasi Kerja" tab for PKWT updates
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchAndEdit();
    }
  }, [location.state]);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', { search: searchTerm, dept: deptFilter, section: sectionFilter, position: positionFilter, empStatus: empStatusFilter, locationId: locationFilter, page, sortBy: sortConfig.key, order: sortConfig.direction, selectedStatsFilter }],
    queryFn: () => employeeAPI.getAll({ 
      search: searchTerm, 
      dept: deptFilter, 
      section: sectionFilter, 
      position: positionFilter, 
      empStatus: empStatusFilter, 
      locationId: locationFilter,
      page, 
      limit: PAGE_SIZE, 
      sortBy: sortConfig.key, 
      order: sortConfig.direction, 
      excludeBhl: true,
      noFingerprint: selectedStatsFilter === 'noFingerprint' ? 'true' : undefined,
      noFace: selectedStatsFilter === 'noFace' ? 'true' : undefined
    }),
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

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => settingsAPI.getLocations(),
  });

  const shifts = shiftsData?.data || [];
  const devices = devicesData?.data || [];
  const locations = locationsData?.data || [];
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
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['master-options'] });
      setAddModalOpen(false);
      setNewEmployee(emptyEmployee);
      alert('Karyawan berhasil ditambahkan!');
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
      if (cameFromPage) {
        const dest = cameFromPage;
        setCameFromPage(null);
        navigate(dest);
      }
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
      terminationDate: emp.terminationDate ? new Date(emp.terminationDate).toISOString().split('T')[0] : '',
      terminationReason: emp.terminationReason || '',
      leaveQuota: emp.leaveQuota ?? 12,
      remainingLeave: emp.remainingLeave ?? 12,
    });
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setNewEmployee(emptyEmployee);
    setActiveTab('basic');
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
  };

  const handleExportToExcel = async () => {
    setIsExporting(true);
    try {
      const res = await employeeAPI.getAll({
        search: searchTerm, 
        dept: deptFilter, 
        section: sectionFilter, 
        position: positionFilter, 
        empStatus: empStatusFilter, 
        locationId: locationFilter,
        sortBy: sortConfig.key, 
        order: sortConfig.direction, 
        excludeBhl: true,
        noFingerprint: selectedStatsFilter === 'noFingerprint' ? 'true' : undefined,
        noFace: selectedStatsFilter === 'noFace' ? 'true' : undefined,
        limit: 100000 // Get all matching employees
      });

      if (!res.success || !res.data || res.data.length === 0) {
        alert('Tidak ada data karyawan yang cocok dengan filter untuk diekspor.');
        return;
      }

      const getRemainingDays = (contractEnd) => {
        if (!contractEnd) return '-';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(contractEnd);
        end.setHours(0, 0, 0, 0);
        const diffTime = end - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 ? `${diffDays} Hari` : 'Expired';
      };

      // Map employees to excel format
      const headers = [
        'NIK', 'Nama', 'Departemen', 'Jabatan', 'Bagian', 'Grade', 'Status Kerja', 
        'Lama Kontrak', 'Tanggal Masuk', 'Sisa Tanggal Kontrak', 'Sisa Kontrak (Hari)', 'Email', 'No HP',
        'NIK KTP', 'No Kartu Keluarga', 'Tanggal Lahir', 'Tempat Lahir', 'Alamat',
        'Agama', 'Pendidikan Terakhir', 'Jurusan', 'Jumlah Anak', 'Nama Ayah Kandung',
        'Nama Ibu Kandung', 'Nama Suami/Istri', 'KONTAK DARURAT',
        'Jenis Kelamin', 'Nama Bank', 'Nomor Rekening',
        'BPJS TK', 'BPJS Kesehatan', 'NPWP', 'Status PTKP (Pajak)', 'Keterangan'
      ];

      const rows = res.data.map(emp => [
        emp.employeeCode || emp.id || '',
        emp.name || '',
        emp.dept || '',
        emp.position || '',
        emp.section || '',
        emp.grade || '',
        emp.employmentStatus || '',
        emp.contractDuration || '',
        emp.joinDate ? new Date(emp.joinDate).toISOString().split('T')[0] : '',
        emp.contractEnd ? new Date(emp.contractEnd).toISOString().split('T')[0] : '',
        getRemainingDays(emp.contractEnd),
        emp.email || '',
        emp.phone || '',
        emp.idNumber || '',
        emp.kkNumber || '',
        emp.birthDate ? new Date(emp.birthDate).toISOString().split('T')[0] : '',
        emp.birthPlace || '',
        emp.address || '',
        emp.religion || '',
        emp.education || '',
        emp.major || '',
        emp.numberOfChildren?.toString() || '0',
        emp.fatherName || '',
        emp.motherName || '',
        emp.spouseName || '',
        emp.emergencyContact || '',
        emp.gender || '',
        emp.bankName || '',
        emp.bankAccountNumber || '',
        emp.bpjsTk || '',
        emp.bpjsKesehatan || '',
        emp.npwp || '',
        emp.ptkpStatus || '',
        emp.notes || ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Karyawan");
      XLSX.writeFile(wb, "Data_Karyawan.xlsx");
    } catch (err) {
      alert(`Gagal mengekspor data: ${err.message}`);
    } finally {
      setIsExporting(false);
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
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('employees.adminOversight')}</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t('employees.subtitle')}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            {t('employees.title')}
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              {t('employees.activeDb')}
            </div>
          </h1>
              <div className="flex flex-wrap items-center gap-3">
          {!isReadOnly && (
            <button 
              onClick={() => {
                setNewEmployee(emptyEmployee);
                setActiveTab('basic');
                setAddModalOpen(true);
              }} 
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
            >
              <UserPlus className="w-4 h-4" /> {t('employees.addEmp')}
            </button>
          )}
          
          {!isReadOnly && (
            <button 
              onClick={() => setImportModalOpen(true)} 
              className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              {t('employees.importExcel')}
            </button>
          )}

          {!isReadOnly && (
            <button 
              onClick={handleDownloadTemplate} 
              className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
            >
              <Download className="w-4 h-4 text-slate-500 group-hover:scale-110 transition-transform" />
              {t('employees.excelTemplate')}
            </button>
          )}

          <button 
            onClick={handleExportToExcel}
            disabled={isExporting}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 disabled:opacity-50 group"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
            )}
            {t('employees.exportExcel')}
          </button>
        </div>
      </div>    </div>

      {/* 2. Dashboard Information Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isReadOnly ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-5 px-1`}>
        {/* Card 1: Total Karyawan */}
        <div 
          onClick={() => {
            setSelectedStatsFilter('');
            setPage(1);
          }}
          className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
            selectedStatsFilter === '' 
              ? 'border-blue-500 bg-blue-50/20 ring-2 ring-blue-500/20' 
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('employees.stats.totalEmp')}</span>
            <div className="text-2xl font-bold text-slate-800 tracking-tight">
              {allEmployees.length} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              {totalActiveEmployees} {t('employees.stats.activeOnLeave')}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
            selectedStatsFilter === ''
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-600 group-hover:text-white'
          }`}>
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Belum Terhubung Finger */}
        {!isReadOnly && (
          <div 
            onClick={() => handleStatsFilterChange('noFingerprint')}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              selectedStatsFilter === 'noFingerprint' 
                ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20' 
                : 'bg-white border-slate-200 hover:border-rose-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('employees.stats.noFingerprint')}</span>
              <div className="text-2xl font-bold text-rose-600 tracking-tight">
                {withoutFingerCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
                {t('employees.stats.fingerprintReg')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              selectedStatsFilter === 'noFingerprint'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white'
            }`}>
              <Fingerprint className="w-5 h-5" />
            </div>
          </div>
        )}

        {/* Card 3: Pendaftaran Wajah Tertunda */}
        {!isReadOnly && (
          <div 
            onClick={() => handleStatsFilterChange('noFace')}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              selectedStatsFilter === 'noFace' 
                ? 'border-amber-500 bg-amber-50/20 ring-2 ring-amber-500/20' 
                : 'bg-white border-slate-200 hover:border-amber-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('employees.stats.noFace')}</span>
              <div className="text-2xl font-bold text-amber-600 tracking-tight">
                {pendingBiometricsCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider">
                {t('employees.stats.cctvReg')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              selectedStatsFilter === 'noFace'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-600 group-hover:text-white'
            }`}>
              <ScanFace className="w-5 h-5" />
            </div>
          </div>
        )}

        {/* Card 4: Jatuh Tempo PKWT */}
        <div 
          onClick={() => {
            const prefix = window.location.pathname.startsWith('/director') ? '/director' : (window.location.pathname.startsWith('/manager') ? '/manager' : '/admin');
            navigate(`${prefix}/contracts`, { state: { filter: 'critical' } });
          }}
          className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-orange-300 transition-all group cursor-pointer active:scale-[0.98]"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('employees.stats.expiringContract')}</span>
            <div className="text-2xl font-bold text-orange-600 tracking-tight">
              {criticalAlertsCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
            </div>
            <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wider">
              {t('employees.stats.expires30Days')}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 group-hover:bg-orange-600 group-hover:text-white transition-all shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Aksi Massal & Integrasi Toolbar */}
      {!isReadOnly && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('employees.bulk.title')}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setQuickShiftModalOpen(true)} 
              className="bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer group"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
              {t('employees.bulk.changeShift')}
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
              className="bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer group"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" /> 
              {t('employees.bulk.printId')}
            </button>
  
            <button 
              onClick={() => navigate('/admin/contracts')} 
              className="bg-white border border-slate-200 text-slate-700 hover:border-orange-300 hover:text-orange-600 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer relative group"
            >
              <FileText className="w-3.5 h-3.5 text-orange-500 group-hover:scale-110 transition-transform" />
              {t('employees.bulk.contracts')}
              {criticalAlertsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                  {criticalAlertsCount}
                </span>
              )}
            </button>
  
            <button 
              onClick={() => navigate('/admin/terminated')} 
              className="bg-white border border-slate-200 text-slate-700 hover:border-rose-300 hover:text-rose-600 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer group"
            >
              <UserMinus className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
              {t('navigation.terminated')}
            </button>
          </div>
        </div>
      )}

      {/* 2. Global Filter Matrix */}
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.search')}</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder={t('employees.filters.placeholder')} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.department')}</label>
            <div className="relative">
              <select 
                value={deptFilter} 
                onChange={e => { setDeptFilter(e.target.value); setSectionFilter(''); setPositionFilter(''); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">{t('employees.filters.allDepts')}</option>
                {masterOptions.departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.section')}</label>
            <div className="relative">
              <select 
                value={sectionFilter} 
                onChange={e => { setSectionFilter(e.target.value); setPositionFilter(''); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">{t('employees.filters.allSections')}</option>
                {masterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.position')}</label>
            <div className="relative">
              <select 
                value={positionFilter} 
                onChange={e => setPositionFilter(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">{t('employees.filters.allPositions')}</option>
                {masterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.status')}</label>
            <div className="relative">
              <select 
                value={empStatusFilter} 
                onChange={e => setEmpStatusFilter(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">{t('employees.filters.allStatus')}</option>
                {masterOptions.employmentStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Cabang / Lokasi</label>
            <div className="relative">
              <select 
                value={locationFilter} 
                onChange={e => setLocationFilter(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
              >
                <option value="">Semua Cabang</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Filter className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <EmployeeTable
        isReadOnly={isReadOnly}
        isLoading={isLoading}
        filteredEmployees={filteredEmployees}
        sortConfig={sortConfig}
        handleSort={handleSort}
        handleEditEmployee={handleEditEmployee}
        setPrintIDCardEmp={setPrintIDCardEmp}
        handleDeleteEmployee={handleDeleteEmployee}
        deleteMutationPending={deleteMutation.isPending}
        page={page}
        totalPages={totalPages}
        totalEmployees={totalEmployees}
        setPage={setPage}
      />

            <EmployeeFormModal
        isOpen={isAddModalOpen}
        closeModal={closeAddModal}
        newEmployee={newEmployee}
        setNewEmployee={setNewEmployee}
        onSubmit={handleAddEmployee}
        isSaving={createMutation.isPending || updateMutation.isPending}
        shifts={shifts}
        devices={devices}
        locations={locations}
        masterOptions={masterOptions}
        modelsLoaded={modelsLoaded}
        pushFingerMutation={pushFingerMutation}
        pullFingerMutation={pullFingerMutation}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

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

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Baru Ditambahkan</span>
                      <span className="text-3xl font-bold text-blue-600">{importResult.data?.imported || 0}</span>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-emerald-200 text-center">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 block">Diperbarui</span>
                      <span className="text-3xl font-bold text-emerald-600">{importResult.data?.updated || 0}</span>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1 block">Gagal</span>
                      <span className="text-3xl font-bold text-rose-500">{importResult.data?.errors?.length || 0}</span>
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
                <h3 className="font-bold text-slate-800 text-lg">Ubah Shift Massal</h3>
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
                    Peringatan: Tindakan ini akan mengubah shift default secara permanen untuk <b className="font-bold">semua karyawan</b> di grup yang dipilih.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Target Departemen</label>
                  <div className="relative">
                    <select 
                      required
                      value={quickShiftForm.departmentId}
                      onChange={(e) => setQuickShiftForm({...quickShiftForm, departmentId: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none cursor-pointer pr-10"
                    >
                      <option value="">Pilih Target...</option>
                      <option value="0" className="font-bold text-blue-600">-- SEMUA DEPARTEMEN --</option>
                      {masterOptions.departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Shift Baru</label>
                  <div className="relative">
                    <select 
                      required
                      value={quickShiftForm.shiftId}
                      onChange={(e) => setQuickShiftForm({...quickShiftForm, shiftId: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none cursor-pointer pr-10"
                    >
                      <option value="">Pilih Shift...</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} [{s.startTime} - {s.endTime}]</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setQuickShiftModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={batchShiftMutation.isPending}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-sm flex items-center gap-2"
                >
                  {batchShiftMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {batchShiftMutation.isPending ? 'Memperbarui...' : 'Konfirmasi Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
