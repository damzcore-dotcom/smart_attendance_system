import { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../../services/api';
import Webcam from 'react-webcam';
import { 
  Search, 
  MoreHorizontal, 
  Shield, 
  User, 
  Key, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  X,
  UserCircle,
  UserPlus,
  Loader2,
  ScanFace,
  Camera,
  Settings,
  Eye,
  Edit,
  Trash,
  Plus,
  RefreshCw
} from 'lucide-react';


const Users = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isFaceModalOpen, setFaceModalOpen] = useState(false);
  const [isPermissionModalOpen, setPermissionModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editRole, setEditRole] = useState('EMPLOYEE');
  const [newPassword, setNewPassword] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'EMPLOYEE', employeeId: '' });
  const [userPermissions, setUserPermissions] = useState([]);

  const webcamRef = useRef(null);
  const faceApiRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceData, setFaceData] = useState({ photo: '', descriptor: null });
  const [scanStatus, setScanStatus] = useState('ready');

  // Phase 5: Real-time face guide
  const [faceGuideStatus, setFaceGuideStatus] = useState('none');
  const faceGuideRef = useRef(null);
  const stableCountRef = useRef(0);
  const autoCaptureTriggeredRef = useRef(false);



  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['users'],
    queryFn: userAPI.getAll,
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employee-options-for-user'],
    queryFn: userAPI.getEmployeeOptions,
    enabled: isAddModalOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: deptsData } = useQuery({
    queryKey: ['dept-options-for-user'],
    queryFn: userAPI.getDepartmentOptions,
    enabled: isAddModalOpen || isEditModalOpen,
    staleTime: 5 * 60 * 1000,
  });

  const employees = employeesData?.data || [];
  const departments = deptsData?.data || [];

  const createMutation = useMutation({
    mutationFn: userAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setAddModalOpen(false);
      setNewUser({ username: '', password: '', role: 'EMPLOYEE', employeeId: '' });
      alert('User created successfully!');
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => userAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditModalOpen(false);
      setNewPassword('');
      alert('User updated successfully!');
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const biometricMutation = useMutation({
    mutationFn: ({ id, data }) => userAPI.updateBiometrics(id, data),
    onSuccess: () => {
      setFaceModalOpen(false);
      setFaceData({ photo: '', descriptor: null });
      setScanStatus('ready');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setTimeout(() => alert('Biometrik wajah berhasil disimpan!'), 150);
    },
    onError: (err) => {
      setFaceModalOpen(false);
      setScanStatus('ready');
      setTimeout(() => alert(`Error: ${err.message}`), 150);
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: ({ id, permissions }) => userAPI.updatePermissions(id, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setPermissionModalOpen(false);
      alert('Permissions updated successfully!');
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: userAPI.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('User deleted successfully!');
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const filteredUsers = useMemo(() => {
    return data?.data?.filter(user => {
      const searchLower = (searchTerm || '').toLowerCase();
      const unameLower = (user?.username || '').toLowerCase();
      const empNameLower = (user?.employeeName || '').toLowerCase();
      
      const matchesSearch = unameLower.includes(searchLower) || empNameLower.includes(searchLower);
      const matchesRole = roleFilter === 'ALL' || user?.role === roleFilter;
      return matchesSearch && matchesRole;
    }) || [];
  }, [data?.data, searchTerm, roleFilter]);

  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE) || 1;
  const paginatedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, roleFilter]);

  const handlePermissionClick = async (user) => {
    setSelectedUser(user);
    try {
      const res = await userAPI.getPermissions(user.id);
      const existing = res.data || [];
      
      const menus = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'announcements', label: 'Announcements' },
        { key: 'employees', label: 'Employee Master' },
        { key: 'shift-roster', label: 'Shift Roster' },
        { key: 'leave-requests', label: 'Leave Requests' },
        { key: 'attendance', label: 'Attendance Management' },
        { key: 'overtime-spl', label: 'Overtime (SPL)' },
        { key: 'daily-workers', label: 'Daily Workers (BHL)' },
        { key: 'manual-correction', label: 'Manual Correction' },
        { key: 'corrections', label: 'Corrections' },
        { key: 'payroll', label: 'Payroll Processing' },
        { key: 'payroll-settings', label: 'Payroll Settings' },
        { key: 'face-check', label: 'Face Recognition CCTV' },
        { key: 'devices', label: 'Fingerprint Devices' },
        { key: 'fingerprint', label: 'Fingerprint Data' },
        { key: 'users', label: 'User Management' },
        { key: 'backup', label: 'Database Backup' },
        { key: 'settings', label: 'System Settings' },
        { key: 'settings-company-profile', label: '↳ Company Profile' },
        { key: 'settings-geofencing', label: '↳ Geofencing' },
        { key: 'settings-shift-rules', label: '↳ Shift Rules' },
        { key: 'settings-calendar', label: '↳ Calendar & Holidays' },
        { key: 'settings-biometrics', label: '↳ Biometrics' },
        { key: 'settings-cctv', label: '↳ CCTV AI Cameras' },
        { key: 'settings-slip', label: '↳ Slip Configuration' },
        { key: 'settings-report', label: '↳ Attendance Report' },
        { key: 'settings-id-card', label: '↳ ID Card Template' }
      ];

      const merged = menus.map(m => {
        const found = existing.find(e => e.menuKey === m.key);
        return found || { 
          menuKey: m.key, 
          label: m.label, 
          canRead: true, 
          canCreate: false, 
          canUpdate: false, 
          canDelete: false 
        };
      });

      setUserPermissions(merged.map(p => ({ ...p, label: menus.find(m => m.key === p.menuKey)?.label })));
      setPermissionModalOpen(true);
    } catch (err) {
      alert('Failed to load permissions');
    }
  };

  const handleEditClick = (user) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setNewPassword('');
    setEditModalOpen(true);
  };

  const handleFaceClick = async (user) => {
    setSelectedUser(user);
    setScanStatus('ready');
    setFaceData({ photo: '', descriptor: null });
    setFaceModalOpen(true);
    if (!modelsLoaded && !isLoadingModels) {
      setIsLoadingModels(true);
      try {
        const faceapi = await import('@vladmandic/face-api');
        const MODEL_URL = 'https://vladmandic.github.io/face-api/model/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        faceApiRef.current = faceapi;
        setModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load face models', err);
      } finally {
        setIsLoadingModels(false);
      }
    }
  };

  // Phase 5: Real-time face guide loop
  useEffect(() => {
    if (!modelsLoaded || scanStatus !== 'ready' || faceData.photo || !isFaceModalOpen) {
      if (faceGuideRef.current) clearInterval(faceGuideRef.current);
      faceGuideRef.current = null;
      return;
    }

    autoCaptureTriggeredRef.current = false;
    stableCountRef.current = 0;
    let isProcessing = false;

    faceGuideRef.current = setInterval(async () => {
      const faceapi = faceApiRef.current;
      if (isProcessing || !webcamRef.current || autoCaptureTriggeredRef.current || !faceapi) return;
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
  }, [modelsLoaded, scanStatus, isFaceModalOpen, faceData.photo]);

  const captureFace = async () => {
    const faceapi = faceApiRef.current;
    if (!webcamRef.current || !modelsLoaded || !faceapi) return;

    setIsCapturing(true);
    setScanStatus('detecting');
    const imageSrc = webcamRef.current.getScreenshot();
    try {
      const img = new Image();
      img.src = imageSrc;
      img.onload = async () => {
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.15 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        setIsCapturing(false);
        setScanStatus('ready');
        if (detection) {
          setFaceData({ photo: imageSrc, descriptor: Array.from(detection.descriptor) });
          setTimeout(() => alert('Wajah berhasil dideteksi!'), 150);
        } else {
          setTimeout(() => alert('Wajah tidak terdeteksi. Pastikan pencahayaan cukup.'), 150);
        }
      };
    } catch (err) {
      setIsCapturing(false);
      setScanStatus('ready');
      setTimeout(() => alert('Gagal memproses wajah.'), 150);
    }
  };

  const handleFaceSubmit = (e) => {
    e.preventDefault();
    if (!faceData.photo || !faceData.descriptor) return;
    biometricMutation.mutate({ 
      id: selectedUser.id, 
      data: { facePhoto: faceData.photo, faceDescriptor: JSON.stringify(faceData.descriptor) } 
    });
  };

  const handleDeleteClick = (id) => {
    if (window.confirm('Are you sure you want to delete this user account?')) {
      deleteMutation.mutate(id);
    }
  };

  const handlePermissionSubmit = (permissions) => {
    updatePermissionsMutation.mutate({ 
      id: selectedUser.id, 
      permissions 
    });
  };

  const handleCreateSubmit = (userData) => {
    createMutation.mutate(userData);
  };

  const handleUpdateSubmit = (updateData) => {
    updateMutation.mutate({ id: selectedUser.id, data: updateData });
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <Shield className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Access Control</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">User Directory</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            User Management
          </h1>
          <p className="text-xs font-semibold text-slate-500">Monitor and manage application access accounts</p>
        </div>

        <button 
          onClick={() => setAddModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm">
        <div className="flex flex-col xl:flex-row items-center justify-between gap-6 mb-8">
          <div className="w-full xl:w-96 space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Search User</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Name or Username..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="w-full xl:w-auto space-y-2 min-w-[200px]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Account Role</label>
            <select 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all appearance-none cursor-pointer"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="ACCOUNTING">Admin Accounting</option>
              <option value="DIREKTUR">Direktur</option>
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto hide-scrollbar border border-slate-100 rounded-xl">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Department</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Active</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="text-center py-16">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading Accounts...</p>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan="5" className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-rose-500">
                      <AlertCircle className="w-8 h-8" />
                      <p className="font-bold">Failed to load accounts</p>
                      <p className="text-xs">{error?.message || 'Please check backend server connection'}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-16 text-slate-500">
                    <UserCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm font-semibold">No user accounts found.</p>
                  </td>
                </tr>
              ) : paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-blue-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                        <UserCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{user.username}</p>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{user.employeeName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      user.role === 'SUPER_ADMIN' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                      user.role === 'ADMIN' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                      user.role === 'ACCOUNTING' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      user.role === 'DIREKTUR' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      user.role === 'MANAGER' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'ACCOUNTING' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {(user.role || '').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-600">{user.dept || '-'}</td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : '-'}
                  </td>
                   <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'ACCOUNTING') && (
                        <button 
                          onClick={() => handlePermissionClick(user)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 text-amber-500 hover:bg-amber-50 hover:border-amber-200 hover:shadow-sm transition-all"
                          title="Permissions"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleFaceClick(user)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 text-emerald-500 hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all"
                        title="Face Registration"
                      >
                        <ScanFace className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleEditClick(user)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 text-blue-500 hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all"
                        title="Edit Account"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(user.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 hover:shadow-sm transition-all"
                        title="Delete Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && filteredUsers.length > 0 && (
          <div className="px-6 py-4 border border-slate-100 bg-slate-50 flex items-center justify-between rounded-xl mt-4">
            <p className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredUsers.length}</span> records | Page <span className="font-bold text-slate-800">{page}</span> of <span className="font-bold text-slate-800">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-200 font-bold text-[10px] uppercase tracking-wider disabled:opacity-30 transition-all shadow-sm"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-200 font-bold text-[10px] uppercase tracking-wider disabled:opacity-30 transition-all shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <EditUserModal 
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        user={selectedUser}
        departments={departments}
        onSave={handleUpdateSubmit}
        isPending={updateMutation.isPending}
      />

      <AddUserModal 
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        employees={employees}
        departments={departments}
        onSave={handleCreateSubmit}
        isPending={createMutation.isPending}
      />

      {isFaceModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setFaceModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
                  <ScanFace className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 tracking-tight">Face ID Link</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">User: {selectedUser?.username}</p>
                </div>
              </div>
              <button onClick={() => {
                if (livenessIntervalRef.current) clearInterval(livenessIntervalRef.current);
                if (faceGuideRef.current) clearInterval(faceGuideRef.current);
                setScanStatus('ready');
                setIsCapturing(false);
                setFaceGuideStatus('none');
                stableCountRef.current = 0;
                autoCaptureTriggeredRef.current = false;
                setFaceModalOpen(false);
              }} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-8 space-y-6 text-center">
              <div className="relative aspect-square max-w-[280px] mx-auto rounded-3xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100 flex items-center justify-center">
                {faceData.photo ? (
                  <img src={faceData.photo} alt="Face" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" screenshotQuality={0.92} className="w-full h-full object-cover" videoConstraints={{ facingMode: "user", width: 640, height: 480, frameRate: { ideal: 30 } }} />
                    {scanStatus === 'liveness' && (
                      <div className="absolute inset-0 bg-indigo-500/10 flex flex-col items-center justify-center backdrop-blur-[1px] z-20">
                         <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg mb-4">
                           Blink: {blinkCount} / 2
                         </div>
                         <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </>
                )}
                {(isLoadingModels || (!modelsLoaded && !faceData.photo)) && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-slate-800 p-6 z-10">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-600" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-center text-slate-600">
                      {isLoadingModels ? 'Loading Neural Networks (~13MB)...' : 'Initializing AI...'}
                    </p>
                  </div>
                )}
                
                {/* Visual HUD */}
                {!faceData.photo && !isLoadingModels && modelsLoaded && (
                  <div className="absolute inset-0 pointer-events-none z-10 p-4 border-4 border-transparent">
                    <div className={`absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 rounded-tl-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-emerald-500/60'}`} />
                    <div className={`absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 rounded-tr-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-emerald-500/60'}`} />
                    <div className={`absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 rounded-bl-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-emerald-500/60'}`} />
                    <div className={`absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 rounded-br-xl transition-colors duration-300 ${faceGuideStatus === 'detected' ? 'border-emerald-500' : 'border-emerald-500/60'}`} />
                    
                    {scanStatus === 'ready' && (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className={`w-40 h-40 border rounded-full transition-all duration-300 ${
                            faceGuideStatus === 'detected' ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse' : 
                            faceGuideStatus === 'not-detected' ? 'border-orange-500/60' : 
                            'border-emerald-400/30'
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

                    {isCapturing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/10 backdrop-blur-sm">
                         <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {faceData.photo ? (
                <button 
                  onClick={() => setFaceData({ photo: '', descriptor: null })}
                  className="w-full py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 hover:text-slate-800 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Retake Photo
                </button>
              ) : (
                <button 
                  disabled={!modelsLoaded || isCapturing || isLoadingModels}
                  onClick={captureFace}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {isLoadingModels ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Loading AI...</>
                  ) : isCapturing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                  ) : (
                    <><Camera className="w-4 h-4" /> Capture Biometrics</>
                  )}
                </button>
              )}

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => {
                    if (livenessIntervalRef.current) clearInterval(livenessIntervalRef.current);
                    if (faceGuideRef.current) clearInterval(faceGuideRef.current);
                    setScanStatus('ready');
                    setIsCapturing(false);
                    setFaceGuideStatus('none');
                    stableCountRef.current = 0;
                    autoCaptureTriggeredRef.current = false;
                    setFaceModalOpen(false);
                  }}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleFaceSubmit}
                  disabled={!faceData.photo || biometricMutation.isPending}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {biometricMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {biometricMutation.isPending ? 'Saving...' : 'Save Face ID'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PermissionModal 
        isOpen={isPermissionModalOpen}
        onClose={() => setPermissionModalOpen(false)}
        user={selectedUser}
        initialPermissions={userPermissions}
        onSave={handlePermissionSubmit}
        isPending={updatePermissionsMutation.isPending}
      />
    </div>
  );
};

// --- Sub-components ---

const AddUserModal = ({ isOpen, onClose, employees, departments, onSave, isPending }) => {
  const [formData, setFormData] = useState({ username: '', password: '', role: 'EMPLOYEE', employeeId: '', managedDeptId: null });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-800 tracking-tight text-lg">Create Account</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-all">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Username</label>
              <input 
                type="text" 
                placeholder="Enter username..."
                required
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Password</label>
              <input 
                type="password" 
                placeholder="Enter password..."
                required
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Role</label>
              <select 
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="DIREKTUR">Direktur</option>
                <option value="ACCOUNTING">Admin Accounting</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            {formData.role === 'MANAGER' || formData.role === 'ADMIN' || formData.role === 'SUPER_ADMIN' || formData.role === 'ACCOUNTING' ? (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Managed Department</label>
                <select 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  value={formData.managedDeptId || ''}
                  onChange={(e) => setFormData({...formData, managedDeptId: e.target.value})}
                  required
                >
                  <option value="">Select Department...</option>
                  <option value="0" className="font-bold text-blue-600">-- ALL DEPARTMENTS --</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-2 ml-1 font-medium">Determine which department this user can monitor.</p>
              </div>
            ) : null}
            {formData.role !== 'MANAGER' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Link to Employee (Optional)</label>
                <select 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                >
                  <option value="">None (Admin Account)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeCode})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPending ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditUserModal = ({ isOpen, onClose, user, departments, onSave, isPending }) => {
  const [role, setRole] = useState('EMPLOYEE');
  const [password, setPassword] = useState('');
  const [managedDeptId, setManagedDeptId] = useState(null);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setManagedDeptId(user.managedDeptId);
    }
    setPassword('');
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const updateData = { role };
    if (password) updateData.password = password;
    if (role === 'MANAGER') updateData.managedDeptId = managedDeptId;
    onSave(updateData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100">
              <Key className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-800 tracking-tight text-lg">Account Access</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-all">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="text-xs text-blue-800 leading-relaxed font-medium">
              You are modifying access for <strong>{user?.username}</strong> ({user?.employeeName}).
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">New Password</label>
              <div className="relative group">
                <Key className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="password" 
                  placeholder="Leave blank to keep current..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Role</label>
              <select 
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="DIREKTUR">Direktur</option>
                <option value="ACCOUNTING">Admin Accounting</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            {(role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTING') && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Managed Department</label>
                <select 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none cursor-pointer"
                  value={managedDeptId || ''}
                  onChange={(e) => setManagedDeptId(e.target.value)}
                  required
                >
                  <option value="">Select Department...</option>
                  <option value="0" className="font-bold text-blue-600">-- ALL DEPARTMENTS --</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PermissionModal = ({ isOpen, onClose, user, initialPermissions, onSave, isPending }) => {
  const [permissions, setPermissions] = useState([]);

  useEffect(() => {
    setPermissions(initialPermissions);
  }, [initialPermissions, isOpen]);

  if (!isOpen) return null;

  const togglePermission = (menuKey, field) => {
    setPermissions(prev => prev.map(p => 
      p.menuKey === menuKey ? { ...p, [field]: !p[field] } : p
    ));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(permissions);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100">
              <Shield className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg tracking-tight">Granular Permissions</h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">Target: {user?.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="p-6">
          <div className="max-h-[50vh] overflow-auto pr-2 hide-scrollbar">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pl-4 border-b border-slate-100">Module Access</th>
                  <th className="pb-3 text-center border-b border-slate-100">View</th>
                  <th className="pb-3 text-center border-b border-slate-100">Create</th>
                  <th className="pb-3 text-center border-b border-slate-100">Update</th>
                  <th className="pb-3 text-center border-b border-slate-100">Delete</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => {
                  const isSubSettings = perm.menuKey.startsWith('settings-');
                  return (
                    <tr key={perm.menuKey} className="bg-slate-50 hover:bg-slate-100/50 transition-colors">
                      <td className={`py-3.5 rounded-l-xl border-y border-l border-slate-100 ${
                        isSubSettings ? 'pl-10 text-slate-400 font-medium italic text-xs' : 'pl-4'
                      }`}>
                        <span className={`text-sm font-semibold ${isSubSettings ? 'text-slate-500' : 'text-slate-700'}`}>{perm.label}</span>
                      </td>
                      <td className="py-3.5 text-center border-y border-slate-100">
                        <input type="checkbox" checked={perm.canRead} onChange={() => togglePermission(perm.menuKey, 'canRead')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer" />
                      </td>
                      <td className="py-3.5 text-center border-y border-slate-100">
                        <input type="checkbox" checked={perm.canCreate} onChange={() => togglePermission(perm.menuKey, 'canCreate')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer" />
                      </td>
                      <td className="py-3.5 text-center border-y border-slate-100">
                        <input type="checkbox" checked={perm.canUpdate} onChange={() => togglePermission(perm.menuKey, 'canUpdate')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer" />
                      </td>
                      <td className="py-3.5 text-center rounded-r-xl border-y border-r border-slate-100">
                        <input type="checkbox" checked={perm.canDelete} onChange={() => togglePermission(perm.menuKey, 'canDelete')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-all">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPending ? 'Saving...' : 'Apply Permissions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Users;
