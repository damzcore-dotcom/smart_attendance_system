import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fingerprintAPI } from '../../services/api';
import api from '../../services/api';
import { 
  Fingerprint, Monitor, Users, Upload, Download, Trash2, Loader2, 
  CheckCircle2, AlertCircle, XCircle, RefreshCw, ChevronLeft, Search, Info
} from 'lucide-react';

const DeviceStats = ({ deviceId, status }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['device-stats', deviceId],
    queryFn: () => api.get(`/devices/${deviceId}/stats`).then(res => res.data),
    enabled: status === 'ONLINE',
    refetchInterval: 30000, // Refresh every 30s
  });

  if (status !== 'ONLINE') {
    return (
      <div className="flex gap-3 text-[10px]">
        <div className="flex-1 bg-red-50 rounded-lg p-2.5 text-center border border-red-100 opacity-50">
          <span className="block font-bold text-red-800 text-sm">—</span>
          <span className="text-red-500 font-bold uppercase">Users</span>
        </div>
        <div className="flex-1 bg-red-50 rounded-lg p-2.5 text-center border border-red-100 opacity-50">
          <span className="block font-bold text-red-800 text-sm">—</span>
          <span className="text-red-500 font-bold uppercase">Logs</span>
        </div>
      </div>
    );
  }

  const usersCount = isLoading ? '...' : (data?.data?.userCounts || 0);
  const logsCount = isLoading ? '...' : (data?.data?.logCounts || 0);

  return (
    <div className="flex gap-3 text-[10px]">
      <div className="flex-1 bg-blue-50/50 rounded-lg p-2.5 text-center border border-blue-100">
        <span className="block font-bold text-blue-800 text-sm">{usersCount}</span>
        <span className="text-blue-600 font-bold uppercase tracking-wider">Users</span>
      </div>
      <div className="flex-1 bg-emerald-50/50 rounded-lg p-2.5 text-center border border-emerald-100">
        <span className="block font-bold text-emerald-800 text-sm">{logsCount}</span>
        <span className="text-emerald-600 font-bold uppercase tracking-wider">Logs</span>
      </div>
    </div>
  );
};

const FingerprintManagement = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('devices'); // devices | push | detail
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [selectedEmployees, setSelectedEmployees] = useState(new Set());
  const [pushDeviceId, setPushDeviceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // New States for Link and Remote Enrollment
  const [linkingUser, setLinkingUser] = useState(null);
  const [selectedEmpForLink, setSelectedEmpForLink] = useState('');
  const [enrollState, setEnrollState] = useState({
    open: false,
    step: 1, // 1: Form, 2: Scanning, 3: Success
    employeeId: '',
    fingerId: '0',
    status: 'idle',
    message: '',
    uid: null,
    acNo: null
  });

  const FINGER_MAP = [
    { id: '0', name: 'Jempol Kanan' },
    { id: '1', name: 'Telunjuk Kanan' },
    { id: '2', name: 'Tengah Kanan' },
    { id: '3', name: 'Manis Kanan' },
    { id: '4', name: 'Kelingking Kanan' },
    { id: '5', name: 'Jempol Kiri' },
    { id: '6', name: 'Telunjuk Kiri' },
    { id: '7', name: 'Tengah Kiri' },
    { id: '8', name: 'Manis Kiri' },
    { id: '9', name: 'Kelingking Kiri' },
  ];

  // Fetch all devices
  const { data: devicesData, isLoading: devicesLoading } = useQuery({
    queryKey: ['fp-devices'],
    queryFn: () => api.get('/devices').then(res => res.data),
  });

  // Fetch device detail when selected
  const { data: detailData, isLoading: detailLoading, refetch: refetchDetail } = useQuery({
    queryKey: ['fp-device-detail', selectedDeviceId],
    queryFn: () => fingerprintAPI.getDeviceDetail(selectedDeviceId),
    enabled: !!selectedDeviceId && activeTab === 'detail',
  });

  // Fetch employees with FP status for push tab, enroll modal, and link dialog
  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['fp-employees'],
    queryFn: () => fingerprintAPI.getEmployees(),
    enabled: activeTab === 'push' || enrollState.open || !!linkingUser,
  });

  // Fetch devices list for dropdown
  const { data: deviceListData } = useQuery({
    queryKey: ['devices-list'],
    queryFn: () => api.get('/devices').then(res => res.data),
    enabled: activeTab === 'push',
  });

  // Mutations
  const pushMutation = useMutation({
    mutationFn: ({ deviceId, employeeIds }) => fingerprintAPI.pushUsers(deviceId, employeeIds),
    onSuccess: (data) => {
      alert(data.message);
      setSelectedEmployees(new Set());
      queryClient.invalidateQueries({ queryKey: ['fp-device-detail'] });
    },
    onError: (err) => alert(err.message)
  });

  const pullMutation = useMutation({
    mutationFn: (deviceId) => fingerprintAPI.pullTemplates(deviceId),
    onSuccess: (data) => {
      alert(data.message);
      queryClient.invalidateQueries({ queryKey: ['fp-employees'] });
    },
    onError: (err) => alert(err.message)
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ deviceId, uid }) => fingerprintAPI.deleteDeviceUser(deviceId, uid),
    onSuccess: (data) => {
      alert(data.message);
      refetchDetail();
    },
    onError: (err) => alert(err.message)
  });

  const linkMutation = useMutation({
    mutationFn: ({ deviceId, uid, employeeId }) => fingerprintAPI.linkUser(deviceId, uid, employeeId),
    onSuccess: (data) => {
      alert(data.message);
      setLinkingUser(null);
      setSelectedEmpForLink('');
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['fp-employees'] });
    },
    onError: (err) => alert(err.response?.data?.message || err.message)
  });

  const enrollMutation = useMutation({
    mutationFn: ({ deviceId, employeeId, fingerId }) => fingerprintAPI.enrollUser(deviceId, employeeId, fingerId),
    onSuccess: (data) => {
      setEnrollState(prev => ({
        ...prev,
        step: 2,
        status: 'enrolling',
        message: data.message,
        uid: data.data.uid,
        acNo: data.data.acNo
      }));
    },
    onError: (err) => {
      setEnrollState(prev => ({
        ...prev,
        status: 'error',
        message: err.response?.data?.message || err.message
      }));
    }
  });

  const verifyMutation = useMutation({
    mutationFn: ({ deviceId, employeeId, fingerId }) => fingerprintAPI.verifyEnroll(deviceId, employeeId, fingerId),
    onSuccess: (data) => {
      setEnrollState(prev => ({
        ...prev,
        step: 3,
        status: 'success',
        message: data.message
      }));
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['fp-employees'] });
    },
    onError: (err) => {
      setEnrollState(prev => ({
        ...prev,
        status: 'error',
        message: err.response?.data?.message || err.message
      }));
    }
  });

  const clearLogsMutation = useMutation({
    mutationFn: (deviceId) => fingerprintAPI.clearLogs(deviceId),
    onSuccess: (data) => {
      alert(data.message);
      refetchDetail();
    },
    onError: (err) => alert(err.response?.data?.message || err.message)
  });

  const devices = devicesData?.data || [];
  const detail = detailData?.data || null;
  const employees = employeesData?.data || [];
  const deviceList = deviceListData?.data || [];

  const filteredEmployees = employees.filter(e => 
    !searchQuery || 
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenDetail = (deviceId) => {
    setSelectedDeviceId(deviceId);
    setActiveTab('detail');
  };

  const handlePushToDevice = () => {
    if (!pushDeviceId || selectedEmployees.size === 0) return alert('Pilih mesin dan karyawan');
    pushMutation.mutate({ deviceId: pushDeviceId, employeeIds: Array.from(selectedEmployees) });
  };

  const handleSelectAllEmp = (e) => {
    if (e.target.checked) setSelectedEmployees(new Set(filteredEmployees.map(e => e.id.toString())));
    else setSelectedEmployees(new Set());
  };

  const toggleEmp = (id) => {
    const next = new Set(selectedEmployees);
    if (next.has(id.toString())) next.delete(id.toString());
    else next.add(id.toString());
    setSelectedEmployees(next);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 text-slate-500 mb-1">
            <Fingerprint className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Biometric Device Management</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Fingerprint Management</h1>
        </div>
        <div className="flex gap-2">
          {['devices', 'push'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setSelectedDeviceId(null); }}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === tab || (tab === 'devices' && activeTab === 'detail')
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              {tab === 'devices' ? '📡 Dashboard Mesin' : '📤 Push ke Mesin'}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════ TAB: DEVICE DASHBOARD ════════════════ */}
      {activeTab === 'devices' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {devicesLoading ? (
            <div className="col-span-full flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : devices.length === 0 ? (
            <div className="col-span-full text-center py-20 border-2 border-dashed rounded-2xl">
              <Monitor className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Belum ada mesin terdaftar. Tambahkan di menu Settings → Mesin Finger.</p>
            </div>
          ) : devices.map(dev => (
            <div key={dev.id} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-blue-300 transition-all duration-300 cursor-pointer"
              onClick={() => handleOpenDetail(dev.id)}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl flex items-center justify-center border border-blue-100 group-hover:from-blue-100 group-hover:to-indigo-100 transition-all">
                  <Monitor className="w-7 h-7 text-blue-600" />
                </div>
                <div className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  dev.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {dev.status === 'ONLINE' ? '🟢' : '🔴'} {dev.status}
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">{dev.name}</h3>
              <p className="text-xs text-slate-500 font-mono mb-4">{dev.ipAddress}:{dev.port}</p>
              <DeviceStats deviceId={dev.id} status={dev.status} />
              
              <div className="mt-4 text-center">
                <span className="text-xs text-blue-600 font-bold group-hover:underline">Klik untuk Detail →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════ TAB: DEVICE DETAIL ════════════════ */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          <button onClick={() => setActiveTab('devices')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors font-semibold">
            <ChevronLeft className="w-4 h-4" /> Kembali ke Dashboard Mesin
          </button>

          {detailLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : !detail ? (
            <div className="text-center py-20 text-red-500">Gagal memuat detail mesin</div>
          ) : (
            <>
              {/* Device Info Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-col lg:flex-row justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl flex items-center justify-center border border-blue-100">
                      <Monitor className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">{detail.device.name}</h2>
                      <p className="text-sm text-slate-500 font-mono">{detail.device.ipAddress}:{detail.device.port}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {detail.deviceInfo && (
                      <>
                        <div className="px-4 py-2 bg-blue-50 rounded-xl border border-blue-100 text-center">
                          <span className="block text-lg font-bold text-blue-700">{detail.deviceInfo.userCounts}</span>
                          <span className="text-[10px] font-bold text-blue-500 uppercase">Users</span>
                        </div>
                        <div className="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                          <span className="block text-lg font-bold text-emerald-700">{detail.deviceInfo.logCounts}</span>
                          <span className="text-[10px] font-bold text-emerald-500 uppercase">Logs</span>
                        </div>
                      </>
                    )}
                    {!detail.deviceInfo && (
                      <div className="px-4 py-2 bg-red-50 rounded-xl border border-red-100 text-center">
                        <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                        <span className="text-[10px] font-bold text-red-500 uppercase">Offline</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                  <button onClick={() => refetchDetail()} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
                    <RefreshCw className="w-4 h-4" /> Refresh
                  </button>
                  <button onClick={() => pullMutation.mutate(selectedDeviceId)} disabled={pullMutation.isPending}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50">
                    {pullMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Tarik FP ke Database
                  </button>
                  <button onClick={() => setEnrollState({ open: true, step: 1, employeeId: '', fingerId: '0', status: 'idle', message: '', uid: null, acNo: null })}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm">
                    <Fingerprint className="w-4 h-4" /> Registrasi Jari Baru
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm(`⚠️ PERINGATAN: Hapus seluruh data log absensi di mesin "${detail.device.name}"?\n\nTindakan ini tidak dapat dibatalkan dan semua log yang belum disinkronkan ke sistem akan hilang permanen!`)) {
                        clearLogsMutation.mutate(selectedDeviceId);
                      }
                    }}
                    disabled={clearLogsMutation.isPending}
                    className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 animate-in fade-in"
                  >
                    {clearLogsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Hapus Log Mesin
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> Daftar User di Mesin ({detail.machineUsers?.length || 0})</h3>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">UID</th>
                        <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">AC No / PIN</th>
                        <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">Nama (Mesin)</th>
                        <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">Status Link</th>
                        <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">Karyawan</th>
                        <th className="p-3 text-center font-bold text-slate-500 text-xs uppercase">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.machineUsers || []).map((mu, idx) => (
                        <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-mono text-xs text-slate-600">{mu.uid}</td>
                          <td className="p-3 font-bold text-slate-800">{mu.userId}</td>
                          <td className="p-3 text-slate-700">{mu.name || '—'}</td>
                          <td className="p-3">
                            {mu.linked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Linked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100">
                                <XCircle className="w-3.5 h-3.5" /> Unlinked
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {mu.employee ? (
                              <div>
                                <span className="font-semibold text-slate-800">{mu.employee.name}</span>
                                <span className="text-xs text-slate-400 ml-2">{mu.employee.employeeCode}</span>
                              </div>
                            ) : (
                              <button 
                                onClick={() => { setLinkingUser(mu); setSelectedEmpForLink(''); }}
                                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg text-xs font-bold transition-all"
                              >
                                Hubungkan Karyawan
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button 
                              onClick={(e) => { e.stopPropagation(); if (confirm(`Hapus user uid ${mu.uid} (${mu.name}) dari mesin?`)) deleteUserMutation.mutate({ deviceId: selectedDeviceId, uid: mu.uid }); }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Hapus dari mesin">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!detail.machineUsers || detail.machineUsers.length === 0) && (
                        <tr><td colSpan="6" className="p-8 text-center text-slate-400">
                          {detail.deviceInfo ? 'Tidak ada user di mesin' : 'Mesin tidak dapat dihubungi — tidak bisa membaca user'}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════ TAB: PUSH TO DEVICE ════════════════ */}
      {activeTab === 'push' && (
        <div className="space-y-6">
          {/* Target device selector */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-blue-600" /> Push Karyawan ke Mesin</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Pilih Mesin Tujuan</label>
                <select value={pushDeviceId} onChange={e => setPushDeviceId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="">— Pilih Mesin —</option>
                  {deviceList.map(d => <option key={d.id} value={d.id}>{d.name} ({d.ipAddress})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Cari Karyawan</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Nama atau NIK..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Employee list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              {empLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-12 text-center">
                        <input type="checkbox" onChange={handleSelectAllEmp} checked={selectedEmployees.size > 0 && selectedEmployees.size === filteredEmployees.length} />
                      </th>
                      <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">NIK</th>
                      <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">Nama</th>
                      <th className="p-3 text-left font-bold text-slate-500 text-xs uppercase">Departemen</th>
                      <th className="p-3 text-center font-bold text-slate-500 text-xs uppercase">FP di DB</th>
                      <th className="p-3 text-center font-bold text-slate-500 text-xs uppercase">Mesin Terdaftar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() => toggleEmp(emp.id)}>
                        <td className="p-3 text-center">
                          <input type="checkbox" checked={selectedEmployees.has(emp.id.toString())} onChange={() => toggleEmp(emp.id)} />
                        </td>
                        <td className="p-3 font-mono text-xs font-bold text-slate-700">{emp.employeeCode}</td>
                        <td className="p-3 font-semibold text-slate-800">{emp.name}</td>
                        <td className="p-3 text-slate-600">{emp.department?.name || '—'}</td>
                        <td className="p-3 text-center">
                          {emp._count?.fingerTemplates > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
                              ✅ {emp._count.fingerTemplates} jari
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold border border-amber-100">
                              ⚠️ Belum
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-xs font-bold text-slate-500">{emp._count?.deviceUsers || 0} mesin</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 bg-blue-50 border-t border-blue-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-blue-700 font-bold text-sm">{selectedEmployees.size} karyawan dipilih</span>
                <div className="flex items-center gap-1.5 text-xs text-blue-500">
                  <Info className="w-3.5 h-3.5" />
                  <span>Karyawan tanpa FP di DB akan didaftarkan tanpa sidik jari (hanya profil)</span>
                </div>
              </div>
              <button onClick={handlePushToDevice} disabled={pushMutation.isPending || !pushDeviceId || selectedEmployees.size === 0}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-sm">
                {pushMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Push ke Mesin
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ════════════════ MODAL: LINK MACHINE USER TO EMPLOYEE ════════════════ */}
      {linkingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">🔗 Hubungkan User Mesin ke Karyawan</h3>
              <button onClick={() => { setLinkingUser(null); setSelectedEmpForLink(''); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Hubungkan PIN mesin <strong>{linkingUser.userId}</strong> ({linkingUser.name || 'No Name'}) ke profil karyawan di database. Sistem juga akan otomatis memindahkan sidik jari yang ada di mesin ke database.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pilih Karyawan Tujuan</label>
                <select 
                  value={selectedEmpForLink} 
                  onChange={e => setSelectedEmpForLink(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Pilih Karyawan --</option>
                  {employees
                    .filter(emp => !emp.fingerPrintId) // Only show unlinked employees
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeCode})</option>
                    ))
                  }
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => { setLinkingUser(null); setSelectedEmpForLink(''); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={() => linkMutation.mutate({ deviceId: selectedDeviceId, uid: linkingUser.uid, employeeId: selectedEmpForLink })}
                disabled={!selectedEmpForLink || linkMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5"
              >
                {linkMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Simpan Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL: REMOTE FINGERPRINT ENROLLMENT WIZARD ════════════════ */}
      {enrollState.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Fingerprint className="w-5 h-5 text-blue-600" /> Registrasi Sidik Jari Baru</h3>
              <button onClick={() => setEnrollState({ open: false })} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* STEP 1: Select Employee & Finger */}
            {enrollState.step === 1 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">Pilih karyawan dan jari yang ingin didaftarkan secara remote pada sensor fisik mesin.</p>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Karyawan</label>
                  <select 
                    value={enrollState.employeeId}
                    onChange={e => setEnrollState(prev => ({ ...prev, employeeId: e.target.value }))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none"
                  >
                    <option value="">-- Pilih Karyawan --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeCode})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pilih Jari</label>
                  <select 
                    value={enrollState.fingerId}
                    onChange={e => setEnrollState(prev => ({ ...prev, fingerId: e.target.value }))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none"
                  >
                    {FINGER_MAP.map(finger => (
                      <option key={finger.id} value={finger.id}>{finger.name}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button 
                    onClick={() => setEnrollState({ open: false })}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => enrollMutation.mutate({ deviceId: selectedDeviceId, employeeId: enrollState.employeeId, fingerId: enrollState.fingerId })}
                    disabled={!enrollState.employeeId || enrollMutation.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    {enrollMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Mulai Registrasi
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Enrolling mode active on device */}
            {enrollState.step === 2 && (
              <div className="space-y-5 text-center py-4">
                {enrollState.status === 'enrolling' && (
                  <>
                    <div className="w-16 h-16 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
                      <Fingerprint className="w-8 h-8 text-blue-600" />
                    </div>
                    <h4 className="font-bold text-slate-800">Mesin Siap Menerima Scan</h4>
                    <p className="text-xs text-slate-500 px-4 leading-relaxed">
                      Sensor pada mesin sidik jari sekarang menyala. Silakan pandu karyawan untuk menempelkan jari <strong>{FINGER_MAP.find(f => f.id === enrollState.fingerId)?.name}</strong> ke sensor mesin sebanyak <strong>3 kali</strong> hingga mesin berbunyi bip sukses.
                    </p>
                    {enrollState.message && <p className="text-xs text-blue-600 font-semibold">{enrollState.message}</p>}
                  </>
                )}

                {enrollState.status === 'verifying' && (
                  <>
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto my-4" />
                    <h4 className="font-bold text-slate-800">Memverifikasi Data Sidik Jari...</h4>
                    <p className="text-xs text-slate-500">Sedang menarik data sidik jari baru dari mesin dan menyimpannya ke database.</p>
                  </>
                )}

                {enrollState.status === 'error' && (
                  <>
                    <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-2">
                      <XCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h4 className="font-bold text-red-600">Registrasi Gagal / Tertunda</h4>
                    <p className="text-xs text-slate-500 px-4 leading-relaxed">{enrollState.message || 'Sensor mesin tidak membaca jari dengan benar.'}</p>
                    <button 
                      onClick={() => setEnrollState(prev => ({ ...prev, status: 'enrolling', message: '' }))}
                      className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                    >
                      Coba Tempel Jari Lagi
                    </button>
                  </>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-between gap-3">
                  <button 
                    onClick={() => setEnrollState(prev => ({ ...prev, step: 1, status: 'idle', message: '' }))}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-all"
                  >
                    Kembali
                  </button>
                  <button 
                    onClick={() => {
                      setEnrollState(prev => ({ ...prev, status: 'verifying' }));
                      verifyMutation.mutate({ deviceId: selectedDeviceId, employeeId: enrollState.employeeId, fingerId: enrollState.fingerId });
                    }}
                    disabled={enrollState.status === 'verifying'}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    {verifyMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Verifikasi & Simpan
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Enrollment Success */}
            {enrollState.step === 3 && (
              <div className="space-y-4 text-center py-4">
                <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                </div>
                <h4 className="font-bold text-emerald-700">Registrasi Berhasil!</h4>
                <p className="text-xs text-slate-500 px-4 leading-relaxed">
                  Sidik jari karyawan berhasil disimpan dan dihubungkan ke profil database. Karyawan sekarang sudah bisa menggunakan sidik jari ini untuk melakukan scan kehadiran di mesin.
                </p>

                <div className="pt-4 flex justify-center">
                  <button 
                    onClick={() => setEnrollState({ open: false })}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FingerprintManagement;
