import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  ChevronRight, 
  LogOut,
  Camera,
  Settings as SettingsIcon,
  Bell,
  Loader2,
  X,
  Briefcase,
  Hash,
  Clock as ClockIcon,
  Banknote,
  Calendar,
  CalendarDays,
  ScanFace,
  Lock,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Upload
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { authAPI, profileUpdateAPI, getFileUrl } from '../../services/api';

const Profile = () => {
  const navigate = useNavigate();
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [toast, setToast] = useState(null);
  
  // ESS Edit Profile Request States
  const [editingField, setEditingField] = useState(null); // { fieldName, label }
  const [editNewValue, setEditNewValue] = useState('');
  const [editFile, setEditFile] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const { data: userData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const user = userData?.user || authAPI.getStoredUser();
  const employee = user?.employee || {};

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
  };

  const triggerEdit = (fieldName, label) => {
    setEditingField({ fieldName, label });
    setEditNewValue(employee[fieldName] || '');
    setEditFile(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editNewValue.toString().trim()) return alert('Nilai baru harus diisi!');
    setEditSubmitting(true);
    try {
      const res = await profileUpdateAPI.submit(editingField.fieldName, editNewValue, editFile);
      if (res.success) {
        showToast('Pengajuan pembaruan profil berhasil dikirim ke HRD!');
        setEditingField(null);
      }
    } catch (err) {
      alert(err.message || 'Gagal mengirim pengajuan.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const menuItems = [
    { name: 'Personal Information', icon: User, color: 'blue', action: () => setShowPersonalInfo(true) },
    { name: 'Klaim & Reimbursement', icon: Banknote, color: 'blue', path: '/employee/claims' },
    { name: 'Slip Gaji Saya', icon: Banknote, color: 'blue', path: '/employee/slips' },
    { name: 'Jadwal Shift', icon: Calendar, color: 'blue', path: '/employee/schedule' },
    { name: 'Kalender Perusahaan', icon: CalendarDays, color: 'blue', path: '/employee/calendar' },
    { name: 'Pendaftaran Wajah', icon: ScanFace, color: 'blue', path: '/employee/face-check' },
  ];

  const hasFaceData = user?.faceDescriptor || user?.biometricKey || employee?.faceDescriptor;

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center pt-6">
        <div className="relative mb-5">
          <div className="w-28 h-28 rounded-full border-2 border-slate-200 p-1 bg-white shadow-lg relative">
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-50 border border-slate-100">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${employee.name || 'user'}`} alt="profile" className="w-full h-full object-cover" />
            </div>
          </div>
          {hasFaceData ? (
            <div className="absolute bottom-1 right-1 w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 border-2 border-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
          ) : (
            <div className="absolute bottom-1 right-1 w-9 h-9 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/20 border-2 border-white">
              <X className="w-5 h-5" />
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold text-slate-800">{employee.name || 'Staff Member'}</h2>
        <p className="text-blue-600 font-semibold text-xs uppercase tracking-wider mt-1">{employee.position || 'Operational Personnel'}</p>
        
        {hasFaceData ? (
          <div className="flex items-center gap-2 mt-4 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-semibold uppercase tracking-wider border border-emerald-200">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Biometric Verified
          </div>
        ) : (
          <button 
            onClick={() => navigate('/employee/face-check')}
            className="flex items-center gap-2 mt-4 px-4 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-rose-200 active:scale-95 transition-transform"
          >
            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            Biometric Unverified • Enroll Now
          </button>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-3 px-1">
        <div className="bg-white p-5 flex items-center gap-5 border border-slate-200 rounded-2xl hover:border-blue-200 transition-all shadow-sm">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0 border border-blue-100">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Email</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{employee.email || 'Not set'}</p>
          </div>
        </div>
        <div className="bg-white p-5 flex items-center gap-5 border border-slate-200 rounded-2xl hover:border-blue-200 transition-all shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Phone</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{employee.phone || 'Not set'}</p>
          </div>
          <button onClick={() => triggerEdit('phone', 'Nomor Telepon/WA')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-3 px-1">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Settings</h3>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button 
                key={item.name} 
                onClick={item.action || (() => navigate(item.path))}
                className={`w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-all duration-200 group ${idx !== menuItems.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                    item.color === 'blue' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-slate-700 text-sm">{item.name}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-all duration-300 group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Logout */}
      <div className="px-1">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all hover:bg-red-600 hover:text-white hover:border-red-600"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      {/* Personal Info Modal */}
      {showPersonalInfo && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowPersonalInfo(false)} />
          <div className="relative bg-white border-t border-slate-200 rounded-t-3xl p-8 space-y-5 animate-in slide-in-from-bottom-20 duration-500 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2" onClick={() => setShowPersonalInfo(false)} />
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Personal Info</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your employment details</p>
              </div>
              <button onClick={() => setShowPersonalInfo(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {/* NIK */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 border border-blue-100"><Hash className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Employee ID (NIK)</p>
                  <p className="text-sm font-bold text-slate-800">{employee.employeeCode || 'Not set'}</p>
                </div>
              </div>
              
              {/* Department */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100"><Briefcase className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Department</p>
                  <p className="text-sm font-bold text-slate-800">{employee.department || 'General'}</p>
                </div>
              </div>
              
              {/* Position */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100"><User className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Position</p>
                  <p className="text-sm font-bold text-slate-800">{employee.position || 'Staff'}</p>
                </div>
              </div>
              
              {/* Shift */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 border border-violet-100"><ClockIcon className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Shift</p>
                  <p className="text-sm font-bold text-slate-800">{employee.shift?.name || 'Default'} ({employee.shift?.startTime} - {employee.shift?.endTime})</p>
                </div>
              </div>
              
              {/* Join Date */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100"><Calendar className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Join Date</p>
                  <p className="text-sm font-bold text-slate-800">{employee.joinDate ? new Date(employee.joinDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}</p>
                </div>
              </div>
              
              {/* Employment Status */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center text-sky-600 border border-sky-100"><ShieldCheck className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Status Pekerjaan</p>
                  <p className="text-sm font-bold text-slate-800">{employee.employmentStatus || 'Kontrak'}</p>
                </div>
              </div>
              
              {/* Birth Date */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-10 h-10 bg-fuchsia-50 rounded-xl flex items-center justify-center text-fuchsia-600 border border-fuchsia-100"><User className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Tanggal Lahir</p>
                  <p className="text-sm font-bold text-slate-800">{employee.birthDate ? new Date(employee.birthDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}</p>
                </div>
              </div>
              
              {/* Address */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl relative group">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 border border-rose-100"><MapPin className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Alamat</p>
                  <p className="text-sm font-bold text-slate-800">{employee.address || 'Not set'}</p>
                </div>
                <button onClick={() => triggerEdit('address', 'Alamat')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
              
              {/* Religion */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl relative group">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100"><User className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Agama</p>
                  <p className="text-sm font-bold text-slate-800">{employee.religion || 'Not set'}</p>
                </div>
                <button onClick={() => triggerEdit('religion', 'Agama')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Marital Status */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl relative group">
                <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center text-pink-600 border border-pink-100"><User className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Status Pernikahan</p>
                  <p className="text-sm font-bold text-slate-800">{employee.maritalStatus || 'Not set'}</p>
                </div>
                <button onClick={() => triggerEdit('maritalStatus', 'Status Pernikahan')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Number of Children */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl relative group">
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600 border border-teal-100"><Hash className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Jumlah Anak</p>
                  <p className="text-sm font-bold text-slate-800">{employee.numberOfChildren !== null ? employee.numberOfChildren : '0'}</p>
                </div>
                <button onClick={() => triggerEdit('numberOfChildren', 'Jumlah Anak')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Spouse Name */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl relative group">
                <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center text-cyan-600 border border-cyan-100"><User className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Nama Pasangan (Suami/Istri)</p>
                  <p className="text-sm font-bold text-slate-800">{employee.spouseName || 'Tidak ada/belum set'}</p>
                </div>
                <button onClick={() => triggerEdit('spouseName', 'Nama Pasangan')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Emergency Contact */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl relative group">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 border border-orange-100"><Phone className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Kontak Darurat</p>
                  <p className="text-sm font-bold text-slate-800">{employee.emergencyContact || 'Not set'}</p>
                </div>
                <button onClick={() => triggerEdit('emergencyContact', 'Kontak Darurat')} className="p-2 text-slate-400 hover:text-blue-600 transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <button onClick={() => setShowPersonalInfo(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-semibold transition-all shadow-sm mt-2 active:scale-[0.98]">Close</button>
          </div>
        </div>
      )}

      {/* ESS Edit request Modal */}
      {editingField && (
        <div className="fixed inset-0 z-[150] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingField(null)} />
          <div className="relative bg-white border-t border-slate-200 rounded-t-3xl p-6 space-y-4 animate-in slide-in-from-bottom-20 duration-500 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2" onClick={() => setEditingField(null)} />
            <div className="flex justify-between items-center mb-2">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Ajukan Koreksi: {editingField.label}</h3>
                <p className="text-xs text-slate-400">Pengajuan ini memerlukan persetujuan HRD</p>
              </div>
              <button onClick={() => setEditingField(null)} className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nilai Baru</label>
                <input
                  type={editingField.fieldName === 'numberOfChildren' ? 'number' : 'text'}
                  value={editNewValue}
                  onChange={e => setEditNewValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-800 font-semibold"
                  placeholder={`Masukkan ${editingField.label} baru...`}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Dokumen Bukti Pendukung (Opsional)</label>
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={e => setEditFile(e.target.files[0])}
                    className="text-xs text-slate-600 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {editFile && <span className="text-[10px] text-emerald-600 font-bold">Terpilih</span>}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Sertakan scan KTP, KK, atau Akta (jika mengubah status keluarga/NIK)</p>
              </div>

              <button
                type="submit"
                disabled={editSubmitting || !editNewValue.toString().trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-50 text-white py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {editSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Kirim Pengajuan
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-2xl shadow-xl z-50 transition-all duration-300 flex items-center gap-2 border text-sm font-semibold animate-in fade-in slide-in-from-bottom-4 ${
          toast.type === 'error' 
            ? 'bg-rose-50 text-rose-700 border-rose-200' 
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {toast.message}
        </div>
      )}

      <p className="text-center text-[10px] text-slate-300 font-medium pb-8">
        Smart HRIS Platform v1.0.9
      </p>
    </div>
  );
};

export default Profile;
