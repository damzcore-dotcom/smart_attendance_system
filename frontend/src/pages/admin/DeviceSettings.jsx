import React, { useState, useEffect } from 'react';
import { Trash2, Plus, RefreshCw, Wifi, Download, Users, MonitorSmartphone, Clock, CheckCircle, AlertTriangle, Info, Pencil, Eraser, FileText } from 'lucide-react';
import api from '../../services/api';
import { getStatusLabel, getStatusColor } from '../../utils/statusUtils';

const DeviceSettings = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDevice, setNewDevice] = useState({ name: '', ipAddress: '', port: 4370 });
  const [editingDevice, setEditingDevice] = useState(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [syncToken, setSyncToken] = useState(null);
  const [syncPersonnelResult, setSyncPersonnelResult] = useState(null);
  const [syncPersonnelFilter, setSyncPersonnelFilter] = useState('ALL');
  const [syncDiagnostics, setSyncDiagnostics] = useState(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState({}); // Toggles for the personnel checkbox
  const [viewMode, setViewMode] = useState('card');
  
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [syncDates, setSyncDates] = useState({
    startDate: firstOfMonth,
    endDate: today,
  });

  const fetchDevices = async () => {
    try {
      const { data } = await api.get('/devices');
      if (data.success) {
        setDevices(data.data);
        // Initialize/update selected device IDs
        setSelectedDeviceIds(prev => {
          const validIds = data.data.map(d => d.id);
          return prev.filter(id => validIds.includes(id));
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDeviceSelection = (id) => {
    setSelectedDeviceIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAllDevices = () => {
    if (selectedDeviceIds.length === devices.length) {
      setSelectedDeviceIds([]);
    } else {
      setSelectedDeviceIds(devices.map(d => d.id));
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/devices', newDevice);
      setNewDevice({ name: '', ipAddress: '', port: 4370 });
      fetchDevices();
      alert('Device added successfully!');
    } catch (err) {
      alert(err.message || 'Failed to add device');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this device?')) return;
    try {
      await api.delete(`/devices/${id}`);
      fetchDevices();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const testConnection = async (device) => {
    try {
      setSyncing('test-' + device.id);
      const { data } = await api.post('/devices/test-connection', { 
        id: device.id, ipAddress: device.ipAddress, port: device.port 
      });
      alert(data.message || 'Connection Successful!');
      fetchDevices(); 
    } catch (err) {
      alert(err.response?.data?.message || 'Connection Failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      await api.put(`/devices/${id}`, data);
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to update device');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingDevice) return;
    try {
      await api.put(`/devices/${editingDevice.id}`, {
        name: editingDevice.name,
        ipAddress: editingDevice.ipAddress,
        port: editingDevice.port
      });
      setEditingDevice(null);
      fetchDevices();
      alert('Device updated successfully!');
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to update device');
    }
  };

  const runBulkAction = async (actionType) => {
    if (selectedDeviceIds.length === 0) {
      alert('Silakan pilih minimal satu mesin terlebih dahulu.');
      return;
    }

    const selectedDevices = devices.filter(d => selectedDeviceIds.includes(d.id));
    
    // Initialize bulkProgress state
    const initialStatuses = {};
    selectedDevices.forEach(d => {
      initialStatuses[d.id] = {
        name: d.name,
        ipAddress: d.ipAddress,
        port: d.port,
        status: 'pending',
        message: 'Menunggu antrean...'
      };
    });

    let actionTitle = 'Aksi Massal';
    if (actionType === 'test') actionTitle = 'Test Koneksi Massal';
    if (actionType === 'sync-users') actionTitle = 'Sync Karyawan Massal';
    if (actionType === 'sync-attendance') actionTitle = 'Tarik Absensi Massal';

    setBulkProgress({
      isOpen: true,
      title: actionTitle,
      deviceStatuses: initialStatuses,
      isRunning: true
    });

    // Execute sequentially
    for (let i = 0; i < selectedDevices.length; i++) {
      const device = selectedDevices[i];
      
      // Update status to running
      setBulkProgress(prev => {
        if (!prev) return null;
        const newStatuses = { ...prev.deviceStatuses };
        newStatuses[device.id] = {
          ...newStatuses[device.id],
          status: 'running',
          message: actionType === 'test' ? 'Menghubungkan ke mesin...' 
                 : actionType === 'sync-users' ? 'Memindai data karyawan di mesin...' 
                 : 'Menarik log absensi dari mesin...'
        };
        return { ...prev, deviceStatuses: newStatuses };
      });

      try {
        if (actionType === 'test') {
          const { data } = await api.post('/devices/test-connection', { 
            id: device.id, ipAddress: device.ipAddress, port: device.port 
          });
          setBulkProgress(prev => {
            if (!prev) return null;
            const newStatuses = { ...prev.deviceStatuses };
            newStatuses[device.id] = {
              ...newStatuses[device.id],
              status: 'success',
              message: data.message || 'Koneksi Berhasil!'
            };
            return { ...prev, deviceStatuses: newStatuses };
          });
        } 
        else if (actionType === 'sync-users') {
          // Step 1: Preview to see if there are any new/linked users
          const { data: previewData } = await api.post(`/devices/${device.id}/sync-users?preview=true`);
          const detailsToCommit = (previewData.data?.details || []).filter(item => item.status === 'new' || item.status === 'linked');
          
          if (detailsToCommit.length > 0) {
            // Update message that we are saving X users
            setBulkProgress(prev => {
              if (!prev) return null;
              const newStatuses = { ...prev.deviceStatuses };
              newStatuses[device.id] = {
                ...newStatuses[device.id],
                message: `Menyimpan ${detailsToCommit.length} karyawan baru...`
              };
              return { ...prev, deviceStatuses: newStatuses };
            });

            // Step 2: Commit
            const { data: commitData } = await api.post(`/devices/${device.id}/sync-users?preview=false`, {
              selectedUsers: detailsToCommit
            });

            setBulkProgress(prev => {
              if (!prev) return null;
              const newStatuses = { ...prev.deviceStatuses };
              newStatuses[device.id] = {
                ...newStatuses[device.id],
                status: 'success',
                message: commitData.message || 'Sinkronisasi Karyawan Berhasil!'
              };
              return { ...prev, deviceStatuses: newStatuses };
            });
          } else {
            setBulkProgress(prev => {
              if (!prev) return null;
              const newStatuses = { ...prev.deviceStatuses };
              newStatuses[device.id] = {
                ...newStatuses[device.id],
                status: 'success',
                message: 'Sukses (Tidak ada data karyawan baru untuk disinkronkan)'
              };
              return { ...prev, deviceStatuses: newStatuses };
            });
          }
        } 
        else if (actionType === 'sync-attendance') {
          // Direct commit
          const { data } = await api.post(`/devices/${device.id}/sync-attendance?preview=false&start=${syncDates.startDate}&end=${syncDates.endDate}`);
          setBulkProgress(prev => {
            if (!prev) return null;
            const newStatuses = { ...prev.deviceStatuses };
            newStatuses[device.id] = {
              ...newStatuses[device.id],
              status: 'success',
              message: data.message || 'Tarik Absensi Berhasil!',
              savedCount: data.savedCount || 0,
              employeeCount: data.employeeCount || 0
            };
            return { ...prev, deviceStatuses: newStatuses };
          });
        }
      } catch (err) {
        console.error(err);
        const errMsg = err.response?.data?.message || err.message || 'Gagal memproses aksi.';
        setBulkProgress(prev => {
          if (!prev) return null;
          const newStatuses = { ...prev.deviceStatuses };
          newStatuses[device.id] = {
            ...newStatuses[device.id],
            status: 'error',
            message: errMsg
          };
          return { ...prev, deviceStatuses: newStatuses };
        });
      }
    }

    // Mark as not running
    setBulkProgress(prev => {
      if (!prev) return null;
      return { ...prev, isRunning: false };
    });

    // Refresh devices list
    fetchDevices();
  };

  const syncUsers = async (id) => {
    try {
      setSyncing('users-' + id);
      const { data } = await api.post(`/devices/${id}/sync-users?preview=true`);
      setSyncPersonnelResult(data);
      
      // Select all 'new' and 'linked' by default
      const initialSelected = {};
      data.data?.details?.forEach(item => {
        if (item.status === 'new' || item.status === 'linked') {
          initialSelected[item.acNo] = true;
        }
      });
      setSelectedPersonnel(initialSelected);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal mengambil data karyawan');
    } finally {
      setSyncing(null);
    }
  };

  const commitPersonnel = async () => {
    if (!syncPersonnelResult) return;
    try {
      setSyncing('commit-users');
      // Filter the allowed details
      const detailsToCommit = syncPersonnelResult.data.details.filter(d => selectedPersonnel[d.acNo]);
      
      const { data } = await api.post(`/devices/${activeDeviceId || syncPersonnelResult.deviceId}/sync-users?preview=false`, {
        selectedUsers: detailsToCommit
      });
      alert(data.message);
      setSyncPersonnelResult(null);
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan data karyawan');
    } finally {
      setSyncing(null);
    }
  };

  const syncAttendance = async (id) => {
    try {
      setSyncing('attend-' + id);
      // Fetch preview first with date filters
      const { data } = await api.post(`/devices/${id}/sync-attendance?preview=true&start=${syncDates.startDate}&end=${syncDates.endDate}`);
      
      if (data.rawRecords === 0) {
        const diag = data.diagnostics;
        if (diag) {
          // Always show diagnostics modal when we have diagnostic info
          setSyncDiagnostics({
            message: data.message,
            ...diag
          });
        } else {
          alert(data.message || 'Tidak ada data log baru di mesin.');
        }
        return;
      }

      setPreviewData(data.data);
      setSyncToken(data.syncToken); // <-- Store sync token
      setActiveDeviceId(id);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal mengambil preview absensi');
    } finally {
      setSyncing(null);
    }
  };

  const commitSyncAttendance = async () => {
    if (!activeDeviceId || !syncToken) return;
    try {
      setSyncing('commit-' + activeDeviceId);
      // Send the syncToken to the commit endpoint
      const { data } = await api.post(`/devices/${activeDeviceId}/commit-attendance`, {
        syncToken: syncToken
      });
      alert(data.message);
      setPreviewData(null);
      setSyncToken(null);
      setActiveDeviceId(null);
      fetchDevices(); 
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan data absensi');
    } finally {
      setSyncing(null);
    }
  };

  const clearLogs = async (device) => {
    if (!window.confirm(`⚠️ PERINGATAN KELAS BERBAHAYA:\nTindakan ini akan menghapus SELURUH data log absensi di dalam mesin "${device.name}" (${device.ipAddress}).\n\nPastikan semua data absensi penting sudah ditarik/disinkronkan terlebih dahulu ke database. Data yang telah terhapus dari mesin TIDAK dapat dikembalikan.\n\nApakah Anda yakin ingin melanjutkan?`)) {
      return;
    }
    if (!window.confirm(`Konfirmasi Akhir: Apakah Anda benar-benar yakin ingin menghapus seluruh data log absensi pada mesin "${device.name}"?`)) {
      return;
    }

    try {
      setSyncing('clear-' + device.id);
      const { data } = await api.post(`/devices/${device.id}/clear-logs`);
      alert(data.message || 'Log absensi di mesin berhasil dihapus.');
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Gagal menghapus log mesin');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <MonitorSmartphone className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Integrasi Perangkat Keras</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Pengaturan Mesin</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Manajemen Mesin Absensi
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              SINKRONISASI MESIN
            </div>
          </h1>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Form Tambah / Edit */}
        <div className="w-full lg:w-1/3 shrink-0">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            {editingDevice ? (
              <>
                <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tight flex items-center justify-between">
                  <span>Ubah Mesin</span>
                  <button 
                    onClick={() => setEditingDevice(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                  >
                    Batal
                  </button>
                </h3>
                <form onSubmit={handleEditSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nama Mesin</label>
                    <input 
                      required 
                      value={editingDevice.name} 
                      onChange={e => setEditingDevice({...editingDevice, name: e.target.value})} 
                      placeholder="Lobi Utama" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Alamat IP</label>
                    <input 
                      required 
                      value={editingDevice.ipAddress} 
                      onChange={e => setEditingDevice({...editingDevice, ipAddress: e.target.value})} 
                      placeholder="192.168.1.201" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Port (Bawaan 4370)</label>
                    <input 
                      type="number" 
                      required 
                      value={editingDevice.port} 
                      onChange={e => setEditingDevice({...editingDevice, port: parseInt(e.target.value) || 0})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setEditingDevice(null)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-4 rounded-xl flex items-center justify-center text-xs uppercase tracking-wider transition-all"
                    >
                      Batal
                    </button>
                    <button 
                      type="submit" 
                      className="flex-[2] bg-blue-600 text-white font-bold py-4 rounded-xl shadow-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-wider"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Simpan
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tight">Daftarkan Mesin Baru</h3>
                <form onSubmit={handleAdd} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nama Mesin</label>
                    <input 
                      required 
                      value={newDevice.name} 
                      onChange={e => setNewDevice({...newDevice, name: e.target.value})} 
                      placeholder="Lobi Utama" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Alamat IP</label>
                    <input 
                      required 
                      value={newDevice.ipAddress} 
                      onChange={e => setNewDevice({...newDevice, ipAddress: e.target.value})} 
                      placeholder="192.168.1.201" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Port (Bawaan 4370)</label>
                    <input 
                      type="number" 
                      required 
                      value={newDevice.port} 
                      onChange={e => setNewDevice({...newDevice, port: parseInt(e.target.value) || 0})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                    />
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-wider mt-2">
                    <Plus className="w-4 h-4" />
                    Daftarkan Mesin
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Daftar Mesin */}
        <div className="flex-1">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 uppercase tracking-tight">Daftar Mesin Absensi</h3>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'card'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Tampilan Kartu
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'list'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Tampilan Tabel
                </button>
              </div>
            </div>

            {viewMode === 'list' && devices.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6 text-xs font-bold">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Range Tarik Data (Global):</span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input 
                    type="date"
                    value={syncDates.startDate}
                    onChange={(e) => setSyncDates({...syncDates, startDate: e.target.value})}
                    className="w-full sm:w-auto bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-700 outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] font-bold text-slate-400">S/D</span>
                  <input 
                    type="date"
                    value={syncDates.endDate}
                    onChange={(e) => setSyncDates({...syncDates, endDate: e.target.value})}
                    className="w-full sm:w-auto bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {devices.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Aksi Massal ({selectedDeviceIds.length} dari {devices.length} mesin terpilih)
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => runBulkAction('test')}
                    disabled={selectedDeviceIds.length === 0}
                    className="bg-white border border-slate-200 text-blue-600 hover:border-blue-300 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    Test Koneksi
                  </button>
                  
                  <button 
                    onClick={() => runBulkAction('sync-users')}
                    disabled={selectedDeviceIds.length === 0}
                    className="bg-white border border-slate-200 text-slate-700 hover:border-slate-300 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Sync Karyawan
                  </button>
                  
                  <button 
                    onClick={() => runBulkAction('sync-attendance')}
                    disabled={selectedDeviceIds.length === 0}
                    className="bg-blue-600 text-white hover:bg-blue-700 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tarik Absensi
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center">
                  <MonitorSmartphone className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Belum ada mesin absensi yang terdaftar.</p>
              </div>
            ) : viewMode === 'card' ? (
              <div className="space-y-5">
                {devices.map(device => (
                  <div key={device.id} className="p-6 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all bg-white group">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                      <div className="flex items-start gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <input 
                            type="checkbox" 
                            checked={selectedDeviceIds.includes(device.id)}
                            onChange={() => toggleDeviceSelection(device.id)}
                            className="w-4.5 h-4.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shadow-sm shrink-0"
                          />
                          <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                            <MonitorSmartphone className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition-colors" />
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 flex items-center gap-3 text-lg">
                            {device.name}
                            <span className={`text-[9px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${device.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                              {device.status}
                            </span>
                          </h4>
                          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mt-2 uppercase tracking-wider">
                            <Wifi className="w-3.5 h-3.5" />
                            {device.ipAddress}:{device.port}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                            Terakhir Sync: {device.lastSync ? new Date(device.lastSync).toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : 'Belum pernah sync'}
                          </p>
                          <div className="flex items-center gap-3 mt-3 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={device.autoSyncEnabled} 
                                onChange={(e) => handleUpdate(device.id, { ...device, autoSyncEnabled: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sync Otomatis</span>
                            </label>
                            {device.autoSyncEnabled && (
                              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <input 
                                  type="time" 
                                  value={device.autoSyncTime || ''}
                                  onChange={(e) => handleUpdate(device.id, { ...device, autoSyncTime: e.target.value })}
                                  className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => testConnection(device)}
                          disabled={syncing === 'test-' + device.id}
                          className="p-3 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl flex items-center justify-center transition-colors border border-blue-200 animate-pulse-slow"
                          title="Test Koneksi"
                        >
                          <Wifi className={`w-4 h-4 ${syncing === 'test-' + device.id ? 'animate-pulse' : ''}`} />
                        </button>
                        <button 
                          onClick={() => setEditingDevice({ ...device })}
                          className="p-3 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-center transition-colors border border-slate-200"
                          title="Ubah Mesin"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(device.id)}
                          className="p-3 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center justify-center transition-colors border border-rose-200"
                          title="Hapus Mesin"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Aksi Sinkronisasi */}
                    <div className="pt-5 border-t border-slate-100 space-y-4">
                      {/* Date Filter */}
                      <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Tarik Data:</span>
                        <input 
                          type="date"
                          value={syncDates.startDate}
                          onChange={(e) => setSyncDates({...syncDates, startDate: e.target.value})}
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-700 outline-none focus:border-blue-500"
                        />
                        <span className="text-[10px] font-bold text-slate-400">S/D</span>
                        <input 
                          type="date"
                          value={syncDates.endDate}
                          onChange={(e) => setSyncDates({...syncDates, endDate: e.target.value})}
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-700 outline-none focus:border-blue-500"
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                      <button 
                        onClick={() => syncUsers(device.id)}
                        disabled={syncing !== null}
                        className="flex-1 bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {syncing === 'users-' + device.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Users className="w-4 h-4" />
                        )}
                        Sync Karyawan
                      </button>
                      
                      <button 
                        onClick={() => syncAttendance(device.id)}
                        disabled={syncing !== null}
                        className="flex-1 bg-blue-600 text-white hover:bg-blue-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                      >
                        {syncing === 'attend-' + device.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Tarik Absensi
                      </button>

                      <button 
                        onClick={() => clearLogs(device)}
                        disabled={syncing !== null}
                        className="flex-1 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                      >
                        {syncing === 'clear-' + device.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eraser className="w-4 h-4" />
                        )}
                        Hapus Log Mesin
                      </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden overflow-x-auto shadow-sm bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-4 w-12 text-center">
                        <input 
                          type="checkbox"
                          checked={devices.length > 0 && selectedDeviceIds.length === devices.length}
                          onChange={toggleAllDevices}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-5 py-4">Nama Mesin</th>
                      <th className="px-5 py-4">IP & Port</th>
                      <th className="px-5 py-4">Auto Sync</th>
                      <th className="px-5 py-4">Terakhir Sync</th>
                      <th className="px-5 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {devices.map(device => (
                      <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 w-12 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedDeviceIds.includes(device.id)}
                            onChange={() => toggleDeviceSelection(device.id)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            {device.name}
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${device.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                              {device.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600 font-semibold font-mono">
                          {device.ipAddress}:{device.port}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={device.autoSyncEnabled} 
                              onChange={(e) => handleUpdate(device.id, { ...device, autoSyncEnabled: e.target.checked })}
                              className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                            />
                            {device.autoSyncEnabled ? (
                              <input 
                                type="time" 
                                value={device.autoSyncTime || ''}
                                onChange={(e) => handleUpdate(device.id, { ...device, autoSyncTime: e.target.value })}
                                className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 outline-none focus:border-blue-500"
                              />
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">OFF</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {device.lastSync ? new Date(device.lastSync).toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : 'Belum pernah sync'}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => testConnection(device)}
                              disabled={syncing === 'test-' + device.id}
                              className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center justify-center transition-colors border border-blue-100 cursor-pointer"
                              title="Test Koneksi"
                            >
                              <Wifi className={`w-3.5 h-3.5 ${syncing === 'test-' + device.id ? 'animate-pulse' : ''}`} />
                            </button>
                            <button
                              onClick={() => syncUsers(device.id)}
                              disabled={syncing !== null}
                              className="p-2 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center transition-colors border border-slate-200 cursor-pointer"
                              title="Sync Karyawan"
                            >
                              {syncing === 'users-' + device.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Users className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => syncAttendance(device.id)}
                              disabled={syncing !== null}
                              className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors shadow-sm cursor-pointer"
                              title="Tarik Absensi"
                            >
                              {syncing === 'attend-' + device.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => clearLogs(device)}
                              disabled={syncing !== null}
                              className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center justify-center transition-colors border border-rose-100 cursor-pointer"
                              title="Hapus Log Mesin"
                            >
                              {syncing === 'clear-' + device.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Eraser className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => setEditingDevice({ ...device })}
                              className="p-2 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center transition-colors border border-slate-200 cursor-pointer"
                              title="Ubah Mesin"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(device.id)}
                              className="p-2 text-rose-700 hover:bg-slate-100 rounded-lg flex items-center justify-center transition-colors ml-1.5 cursor-pointer"
                              title="Hapus Mesin"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {previewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Preview Data Absensi Baru</h3>
                <p className="text-sm text-slate-500 mt-1">Ditemukan {previewData.length} record absensi dari mesin fingerprint.</p>
              </div>
              <button 
                onClick={() => { setPreviewData(null); setSyncToken(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4">Karyawan</th>
                      <th className="px-6 py-4">Tanggal</th>
                      <th className="px-6 py-4">Check In</th>
                      <th className="px-6 py-4">Check Out</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {previewData.map((record, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{record.employeeName}</div>
                          <div className="text-xs text-slate-500">NIK: {record.employeeCode}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(record.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-700">
                          {record.checkIn ? new Date(record.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-700">
                          {record.checkOut ? new Date(record.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(record.status)}`}>
                            {getStatusLabel(record.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => { setPreviewData(null); setSyncToken(null); }}
                className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={commitSyncAttendance}
                disabled={syncing === 'commit-' + activeDeviceId}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {syncing === 'commit-' + activeDeviceId ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Simpan {previewData.length} Data Absen
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sync Personnel Result Modal */}
      {syncPersonnelResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-800">📋 Detail Sinkronisasi Karyawan — Data Mesin Fingerprint</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Preview Data: Silakan centang karyawan yang ingin disinkronkan ke database.
                </p>
              </div>
              <button 
                onClick={() => { setSyncPersonnelResult(null); fetchDevices(); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Summary Cards */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-5 gap-3">
              <div 
                onClick={() => setSyncPersonnelFilter('ALL')}
                className={`bg-white rounded-xl p-3 border text-center cursor-pointer transition-all ${syncPersonnelFilter === 'ALL' ? 'border-slate-800 shadow-md ring-2 ring-slate-800/20' : 'border-slate-200 hover:border-slate-400 opacity-60 hover:opacity-100'}`}>
                <div className="text-2xl font-black text-slate-800">{syncPersonnelResult.data?.totalMachine || 0}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Total di Mesin</div>
              </div>
              <div 
                onClick={() => setSyncPersonnelFilter('linked')}
                className={`bg-emerald-50 rounded-xl p-3 border text-center cursor-pointer transition-all ${syncPersonnelFilter === 'linked' ? 'border-emerald-500 shadow-md ring-2 ring-emerald-500/20' : 'border-emerald-200 hover:border-emerald-400 opacity-60 hover:opacity-100'}`}>
                <div className="text-2xl font-black text-emerald-600">{syncPersonnelResult.data?.linked || 0}</div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1">Auto-Link</div>
              </div>
              <div 
                onClick={() => setSyncPersonnelFilter('new')}
                className={`bg-blue-50 rounded-xl p-3 border text-center cursor-pointer transition-all ${syncPersonnelFilter === 'new' ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-blue-200 hover:border-blue-400 opacity-60 hover:opacity-100'}`}>
                <div className="text-2xl font-black text-blue-600">{syncPersonnelResult.data?.new || 0}</div>
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1">Baru</div>
              </div>
              <div 
                onClick={() => setSyncPersonnelFilter('already_linked')}
                className={`bg-slate-100 rounded-xl p-3 border text-center cursor-pointer transition-all ${syncPersonnelFilter === 'already_linked' ? 'border-slate-500 shadow-md ring-2 ring-slate-500/20' : 'border-slate-200 hover:border-slate-400 opacity-60 hover:opacity-100'}`}>
                <div className="text-2xl font-black text-slate-600">{syncPersonnelResult.data?.alreadyLinked || 0}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Sudah Terlink</div>
              </div>
              <div 
                onClick={() => setSyncPersonnelFilter('inactive_ignored')}
                className={`bg-amber-50 rounded-xl p-3 border text-center cursor-pointer transition-all ${syncPersonnelFilter === 'inactive_ignored' ? 'border-amber-500 shadow-md ring-2 ring-amber-500/20' : 'border-amber-200 hover:border-amber-400 opacity-60 hover:opacity-100'}`}>
                <div className="text-2xl font-black text-amber-600">{syncPersonnelResult.data?.inactive || 0}</div>
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-1">Diabaikan</div>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                          onChange={(e) => {
                            const val = e.target.checked;
                            const newObj = { ...selectedPersonnel };
                            syncPersonnelResult.data.details.forEach(item => {
                              if (syncPersonnelFilter === 'ALL' || item.status === syncPersonnelFilter) {
                                if (item.status === 'new' || item.status === 'linked') newObj[item.acNo] = val;
                              }
                            });
                            setSelectedPersonnel(newObj);
                          }}
                        />
                      </th>
                      <th className="px-4 py-3">AC No. (Mesin)</th>
                      <th className="px-4 py-3">Nama di Mesin</th>
                      <th className="px-4 py-3">Nama di Database</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {(syncPersonnelResult.data?.details || [])
                      .filter(item => syncPersonnelFilter === 'ALL' || item.status === syncPersonnelFilter)
                      .map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-center">
                           {(item.status === 'new' || item.status === 'linked') ? (
                             <input 
                               type="checkbox" 
                               checked={!!selectedPersonnel[item.acNo]} 
                               onChange={(e) => setSelectedPersonnel({...selectedPersonnel, [item.acNo]: e.target.checked})}
                               className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                             />
                           ) : (
                             <span className="text-slate-300">-</span>
                           )}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800 font-mono">{item.acNo}</td>
                        <td className="px-4 py-3 text-slate-700 font-medium">{item.machineName || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{item.dbName}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            item.status === 'linked' ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'new' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {item.statusText}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
               <button 
                 onClick={() => { setSyncPersonnelResult(null); fetchDevices(); }}
                 className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
               >
                 Batal
               </button>
              <button 
                onClick={commitPersonnel}
                disabled={syncing === 'commit-users'}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {syncing === 'commit-users' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Simpan & Sync Karyawan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sync Diagnostics Modal */}
      {syncDiagnostics && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Sync Gagal — Data Tidak Cocok</h3>
                  <p className="text-xs text-amber-700 font-semibold mt-0.5">Karyawan di mesin belum terhubung dengan database</p>
                </div>
              </div>
              <button 
                onClick={() => setSyncDiagnostics(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-slate-100 text-slate-500 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Summary Cards */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-3 border border-slate-200 text-center">
                <div className="text-2xl font-black text-slate-800">{syncDiagnostics.totalLogsFromDevice || 0}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Log di Mesin</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 text-center">
                <div className="text-2xl font-black text-blue-600">{syncDiagnostics.logsInRange || 0}</div>
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1">Dalam Range</div>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 border border-rose-200 text-center">
                <div className="text-2xl font-black text-rose-600">{syncDiagnostics.unmatchedPinCount || 0}</div>
                <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-1">PIN Tidak Cocok</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-center">
                <div className="text-2xl font-black text-emerald-600">{syncDiagnostics.linkedEmployeeCount || 0}</div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1">Karyawan Terlink</div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {/* Explanation - Dynamic based on scenario */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <p className="font-bold mb-1">Mengapa tidak ada data yang di-sync?</p>
                    
                    {/* Scenario 1: Device has logs but none in date range (old data) */}
                    {syncDiagnostics.totalLogsFromDevice > 0 && syncDiagnostics.logsInRange === 0 && (
                      <>
                        <p className="text-amber-800">Mesin memiliki <strong>{syncDiagnostics.totalLogsFromDevice.toLocaleString()}</strong> log absensi, tapi <strong>tidak ada satupun</strong> yang masuk dalam range tanggal yang dipilih.</p>
                        {syncDiagnostics.deviceDateRange && (
                          <div className="mt-2 p-3 bg-white border border-amber-300 rounded-lg">
                            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Data di Mesin:</p>
                            <p className="text-amber-900 font-semibold">
                              {new Date(syncDiagnostics.deviceDateRange.earliest).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                              {' '}s/d{' '}
                              {new Date(syncDiagnostics.deviceDateRange.latest).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        )}
                        <p className="mt-2 font-bold text-amber-900">{"→"} Data log di mesin ini sudah lama / tidak sesuai dengan range tanggal yang dipilih. Pastikan mesin menyimpan data absensi terbaru.</p>
                      </>
                    )}
                    
                    {/* Scenario 2: Logs in range but no employee match */}
                    {syncDiagnostics.logsInRange > 0 && syncDiagnostics.unmatchedPinCount > 0 && (
                      <>
                        <p className="text-amber-800">Mesin memiliki <strong>{syncDiagnostics.logsInRange.toLocaleString()}</strong> log dalam range tanggal, tapi <strong>{syncDiagnostics.unmatchedPinCount}</strong> PIN tidak cocok dengan karyawan manapun.</p>
                        <p className="mt-2 text-amber-800">Saat ini <strong>{syncDiagnostics.linkedEmployeeCount || 0} dari {syncDiagnostics.totalEmployees || 0}</strong> karyawan yang sudah terhubung.</p>
                        <p className="mt-2 font-bold text-amber-900">{"→"} Klik tombol <strong>"SYNC PERSONNEL"</strong> terlebih dahulu untuk menghubungkan data karyawan di mesin dengan database!</p>
                      </>
                    )}

                    {/* Scenario 3: No logs at all */}
                    {syncDiagnostics.totalLogsFromDevice === 0 && (
                      <p className="text-amber-800">Mesin tidak memiliki data log absensi sama sekali. Pastikan mesin berfungsi dan karyawan sudah melakukan scan fingerprint.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Unmatched PINs Table */}
              {syncDiagnostics.unmatchedPins && syncDiagnostics.unmatchedPins.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">PIN Mesin yang Tidak Cocok (maks. 20)</h4>
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-3">No</th>
                          <th className="px-4 py-3">PIN (AC No.)</th>
                          <th className="px-4 py-3">Nama di Mesin</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-100">
                        {syncDiagnostics.unmatchedPins.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-800 font-mono">{item.pin}</td>
                            <td className="px-4 py-2.5 text-slate-700">{item.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setSyncDiagnostics(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
              >
                Tutup
              </button>
              <button 
                onClick={() => { setSyncDiagnostics(null); /* Trigger sync personnel for the first device */ if(devices.length > 0) syncUsers(devices[0].id); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all"
              >
                <Users className="w-4 h-4" />
                Jalankan Sinkronisasi Karyawan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Progress Modal */}
      {bulkProgress && bulkProgress.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{bulkProgress.title}</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {bulkProgress.isRunning ? 'Sedang memproses mesin absensi secara berurutan...' : 'Proses selesai! Silakan periksa hasil di bawah.'}
                </p>
              </div>
              {!bulkProgress.isRunning && (
                <button 
                  onClick={() => setBulkProgress(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Summary Cards */}
            <div className={`px-6 py-4 bg-slate-50/50 grid gap-4 border-b border-slate-100 ${
              bulkProgress.title === 'Tarik Absensi Massal' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'
            }`}>
              <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-base border border-emerald-200">
                  ✓
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Berhasil</p>
                  <p className="text-xl font-bold text-emerald-800 mt-0.5 flex items-baseline gap-1">
                    {Object.values(bulkProgress.deviceStatuses).filter(s => s.status === 'success').length}
                    <span className="text-xs font-normal text-emerald-600">/ {Object.keys(bulkProgress.deviceStatuses).length} Mesin</span>
                  </p>
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold text-base border border-rose-200">
                  ✕
                </div>
                <div>
                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Gagal</p>
                  <p className="text-xl font-bold text-rose-800 mt-0.5 flex items-baseline gap-1">
                    {Object.values(bulkProgress.deviceStatuses).filter(s => s.status === 'error').length}
                    <span className="text-xs font-normal text-rose-600">/ {Object.keys(bulkProgress.deviceStatuses).length} Mesin</span>
                  </p>
                </div>
              </div>
              {bulkProgress.title === 'Tarik Absensi Massal' && (
                <>
                  <div className="bg-blue-50 border border-blue-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-200">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total Record</p>
                      <p className="text-xl font-bold text-blue-800 mt-0.5 flex items-baseline gap-1">
                        {Object.values(bulkProgress.deviceStatuses).reduce((sum, s) => sum + (s.savedCount || 0), 0)}
                        <span className="text-xs font-normal text-blue-600">Log</span>
                      </p>
                    </div>
                  </div>
                  <div className="bg-violet-50 border border-violet-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center border border-violet-200">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Karyawan</p>
                      <p className="text-xl font-bold text-violet-800 mt-0.5 flex items-baseline gap-1">
                        {Object.values(bulkProgress.deviceStatuses).reduce((sum, s) => sum + (s.employeeCount || 0), 0)}
                        <span className="text-xs font-normal text-violet-600">Orang</span>
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-slate-50 space-y-4">
              {Object.entries(bulkProgress.deviceStatuses).map(([id, item]) => (
                <div key={id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-4 shadow-sm">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-800 truncate">{item.name}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{item.ipAddress}:{item.port}</p>
                    <p className={`text-xs mt-1.5 font-medium ${
                      item.status === 'success' ? 'text-emerald-600' :
                      item.status === 'error' ? 'text-rose-600 font-semibold' :
                      item.status === 'running' ? 'text-blue-600 animate-pulse' :
                      'text-slate-400'
                    }`}>
                      {item.message}
                    </p>
                  </div>
                  
                  <div className="shrink-0">
                    {item.status === 'success' && (
                      <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-sm">✓</span>
                    )}
                    {item.status === 'error' && (
                      <span className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-sm">✕</span>
                    )}
                    {item.status === 'running' && (
                      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                    )}
                    {item.status === 'pending' && (
                      <span className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 border border-slate-200 flex items-center justify-center font-medium text-xs">...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex justify-end shrink-0">
              <button 
                onClick={() => setBulkProgress(null)}
                disabled={bulkProgress.isRunning}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed px-8 py-3 rounded-xl font-bold text-sm shadow-sm transition-all text-center cursor-pointer"
              >
                {bulkProgress.isRunning ? 'Memproses...' : 'Tutup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceSettings;
