import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, userAPI } from '../../services/api';
import Webcam from 'react-webcam';
import * as faceapi from '@vladmandic/face-api';
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
  Plus
} from 'lucide-react';

const Users = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
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
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceData, setFaceData] = useState({ photo: '', descriptor: null });

  // Load face-api models
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
    queryKey: ['users'],
    queryFn: userAPI.getAll,
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeAPI.getAll({ limit: 1000 }),
  });

  const employees = employeesData?.data || [];

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
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFaceModalOpen(false);
      setFaceData({ photo: '', descriptor: null });
      alert('Biometrik wajah berhasil disimpan!');
    },
    onError: (err) => alert(`Error: ${err.message}`),
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

  const filteredUsers = data?.data?.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  }) || [];

  const handlePermissionClick = async (user) => {
    setSelectedUser(user);
    try {
      const res = await userAPI.getPermissions(user.id);
      const existing = res.data || [];
      
      // Default menus
      const menus = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'attendance', label: 'Attendance' },
        { key: 'employees', label: 'Employee Master' },
        { key: 'shifts', label: 'Shift Schedules' },
        { key: 'locations', label: 'Locations' },
        { key: 'leave-requests', label: 'Leave Requests' },
        { key: 'corrections', label: 'Corrections' },
        { key: 'announcements', label: 'Announcements' },
        { key: 'backup', label: 'Database Backup' },
        { key: 'users', label: 'User Management' },
        { key: 'settings', label: 'System Settings' }
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

  const handleFaceClick = (user) => {
    setSelectedUser(user);
    setFaceData({ photo: '', descriptor: null });
    setFaceModalOpen(true);
  };

  const captureFace = async () => {
    if (!webcamRef.current || !modelsLoaded) return;
    setIsCapturing(true);
    const imageSrc = webcamRef.current.getScreenshot();
    
    try {
      const img = new Image();
      img.src = imageSrc;
      img.onload = async () => {
        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
          setFaceData({ photo: imageSrc, descriptor: Array.from(detection.descriptor) });
          alert('Wajah berhasil dideteksi!');
        } else {
          alert('Wajah tidak terdeteksi. Pastikan pencahayaan cukup.');
        }
        setIsCapturing(false);
      };
    } catch (err) {
      alert('Gagal memproses wajah.');
      setIsCapturing(false);
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

  const handleUpdateSubmit = (e) => {
    e.preventDefault();
    const updateData = { role: editRole };
    if (newPassword) updateData.password = newPassword;
    
    updateMutation.mutate({ id: selectedUser.id, data: updateData });
  };
  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(newUser);
  };

  const handlePermissionSubmit = (e) => {
    e.preventDefault();
    updatePermissionsMutation.mutate({ 
      id: selectedUser.id, 
      permissions: userPermissions 
    });
  };

  const togglePermission = (menuKey, field) => {
    setUserPermissions(prev => prev.map(p => 
      p.menuKey === menuKey ? { ...p, [field]: !p[field] } : p
    ));
  };
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500 text-sm">Monitor and manage application access accounts</p>
        </div>
        <button 
          onClick={() => setAddModalOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by username or employee name..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <select 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="px-4 py-4">User</th>
                <th className="px-4 py-4">Role</th>
                <th className="px-4 py-4">Department</th>
                <th className="px-4 py-4">Last Active</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr><td colSpan="5" className="text-center py-8 text-slate-500">Loading accounts...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-8 text-slate-500">No user accounts found.</td></tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                        <UserCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700 text-sm">{user.username}</p>
                        <p className="text-xs text-slate-400">{user.employeeName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      user.role === 'ADMIN' 
                        ? 'bg-amber-50 text-amber-600 border border-amber-100' 
                        : 'bg-blue-50 text-blue-600 border border-blue-100'
                    }`}>
                      {user.role === 'ADMIN' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500">{user.dept}</td>
                  <td className="px-4 py-4 text-sm text-slate-500">
                    {new Date(user.lastLogin).toLocaleDateString()}
                  </td>
                   <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                        <button 
                          onClick={() => handlePermissionClick(user)}
                          className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all"
                          title="Permissions"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleFaceClick(user)}
                        className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Face Registration"
                      >
                        <ScanFace className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleEditClick(user)}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                        title="Edit Account"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(user.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Account Settings</h3>
              <button onClick={() => setEditModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
                <div className="text-xs text-blue-700 leading-relaxed">
                  You are editing the account for <strong>{selectedUser?.username}</strong> ({selectedUser?.employeeName}).
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">New Password</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="password" 
                    placeholder="Enter new password..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 px-1">Leave blank to keep current password.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Role</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="btn-primary px-8 py-2.5 disabled:opacity-70"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setAddModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Create New Account</h3>
              <button onClick={() => setAddModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Username</label>
                  <input 
                    type="text" 
                    placeholder="Enter username..."
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Password</label>
                  <input 
                    type="password" 
                    placeholder="Enter password..."
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Role</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Link to Employee (Optional)</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newUser.employeeId}
                    onChange={(e) => setNewUser({...newUser, employeeId: e.target.value})}
                  >
                    <option value="">None (Admin Account)</option>
                    {employees.map(emp => (
                      <option key={emp.dbId} value={emp.dbId}>{emp.name} ({emp.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn-primary px-8 py-2.5 disabled:opacity-70"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Face Registration Modal */}
      {isFaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setFaceModalOpen(false)}></div>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <ScanFace className="w-5 h-5 text-emerald-500" /> Face ID Registration
                </h3>
                <p className="text-xs text-slate-400 mt-1">User: {selectedUser?.username}</p>
              </div>
              <button onClick={() => setFaceModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-8 space-y-6 text-center">
              <div className="relative aspect-square max-w-[280px] mx-auto rounded-[3rem] overflow-hidden border-4 border-slate-100 shadow-inner bg-slate-900 flex items-center justify-center">
                {faceData.photo ? (
                  <img src={faceData.photo} alt="Face" className="w-full h-full object-cover" />
                ) : (
                  <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user" }} />
                )}
                {!modelsLoaded && !faceData.photo && (
                  <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white p-6">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-400" />
                    <p className="text-xs font-bold uppercase tracking-widest text-center">Initializing AI Models...</p>
                  </div>
                )}
              </div>

              {faceData.photo ? (
                <button 
                  onClick={() => setFaceData({ photo: '', descriptor: null })}
                  className="w-full py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
                >
                  Ulangi Foto
                </button>
              ) : (
                <button 
                  disabled={!modelsLoaded || isCapturing}
                  onClick={captureFace}
                  className="w-full py-4 rounded-2xl btn-primary font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isCapturing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Detecting Face...</>
                  ) : (
                    <><Camera className="w-5 h-5" /> Ambil Foto Wajah</>
                  )}
                </button>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setFaceModalOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleFaceSubmit}
                  disabled={!faceData.photo || biometricMutation.isPending}
                  className="flex-1 py-3 bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all disabled:opacity-50"
                >
                  {biometricMutation.isPending ? 'Saving...' : 'Simpan Face ID'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Permission Modal */}
      {isPermissionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setPermissionModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-500" /> Granular Permissions
                </h3>
                <p className="text-xs text-slate-400 mt-1">Configure access for: <strong>{selectedUser?.username}</strong></p>
              </div>
              <button onClick={() => setPermissionModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="max-h-[60vh] overflow-auto pr-2 custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                      <th className="pb-2 pl-4">Menu Module</th>
                      <th className="pb-2 text-center">View</th>
                      <th className="pb-2 text-center">Create</th>
                      <th className="pb-2 text-center">Update</th>
                      <th className="pb-2 text-center">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPermissions.map((perm) => (
                      <tr key={perm.menuKey} className="bg-slate-50/50 rounded-xl">
                        <td className="py-3 pl-4 rounded-l-xl">
                          <span className="text-sm font-bold text-slate-700">{perm.label}</span>
                        </td>
                        <td className="py-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={perm.canRead} 
                            onChange={() => togglePermission(perm.menuKey, 'canRead')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={perm.canCreate} 
                            onChange={() => togglePermission(perm.menuKey, 'canCreate')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={perm.canUpdate} 
                            onChange={() => togglePermission(perm.menuKey, 'canUpdate')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                          />
                        </td>
                        <td className="py-3 text-center rounded-r-xl">
                          <input 
                            type="checkbox" 
                            checked={perm.canDelete} 
                            onChange={() => togglePermission(perm.menuKey, 'canDelete')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  onClick={() => setPermissionModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePermissionSubmit}
                  disabled={updatePermissionsMutation.isPending}
                  className="btn-primary px-8 py-2.5 shadow-lg shadow-primary/20"
                >
                  {updatePermissionsMutation.isPending ? 'Saving...' : 'Apply Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
