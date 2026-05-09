import React, { useState, useEffect } from 'react';
import { Trash2, Plus, RefreshCw, Wifi, Download, Users, MonitorSmartphone } from 'lucide-react';
import api from '../../services/api';

const DeviceSettings = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDevice, setNewDevice] = useState({ name: '', ipAddress: '', port: 4370 });
  const [syncing, setSyncing] = useState(null);

  const fetchDevices = async () => {
    try {
      const { data } = await api.get('/api/devices');
      if (data.success) {
        setDevices(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/devices', newDevice);
      setNewDevice({ name: '', ipAddress: '', port: 4370 });
      fetchDevices();
      alert('Device added successfully!');
    } catch (err) {
      alert('Failed to add device');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this device?')) return;
    try {
      await api.delete(`/api/devices/${id}`);
      fetchDevices();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const testConnection = async (device) => {
    try {
      setSyncing('test-' + device.id);
      const { data } = await api.post('/api/devices/test-connection', { 
        ipAddress: device.ipAddress, port: device.port 
      });
      alert(data.message || 'Connection Successful!');
      fetchDevices(); 
    } catch (err) {
      alert(err.response?.data?.message || 'Connection Failed');
    } finally {
      setSyncing(null);
    }
  };

  const syncUsers = async (id) => {
    try {
      setSyncing('users-' + id);
      const { data } = await api.post(`/api/devices/${id}/sync-users`);
      alert(data.message);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to sync users');
    } finally {
      setSyncing(null);
    }
  };

  const syncAttendance = async (id) => {
    try {
      setSyncing('attend-' + id);
      const { data } = await api.post(`/api/devices/${id}/sync-attendance`);
      alert(data.message);
      fetchDevices(); 
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to sync attendance');
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
            <span className="text-[10px] font-bold uppercase tracking-wider">Hardware Integration</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Device Settings</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Device Management
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              HARDWARE SYNC
            </div>
          </h1>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Form Tambah */}
        <div className="w-full lg:w-1/3 shrink-0">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tight">Register New Device</h3>
            <form onSubmit={handleAdd} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Device Name</label>
                <input 
                  required 
                  value={newDevice.name} 
                  onChange={e => setNewDevice({...newDevice, name: e.target.value})} 
                  placeholder="Main Lobby" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">IP Address</label>
                <input 
                  required 
                  value={newDevice.ipAddress} 
                  onChange={e => setNewDevice({...newDevice, ipAddress: e.target.value})} 
                  placeholder="192.168.1.201" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Port (Default 4370)</label>
                <input 
                  type="number" 
                  required 
                  value={newDevice.port} 
                  onChange={e => setNewDevice({...newDevice, port: parseInt(e.target.value)})} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-400"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-wider mt-2">
                <Plus className="w-4 h-4" />
                Register Device
              </button>
            </form>
          </div>
        </div>

        {/* Daftar Mesin */}
        <div className="flex-1">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tight">Connected Devices</h3>
            {loading ? (
              <div className="flex justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center">
                  <MonitorSmartphone className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">No devices registered yet.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {devices.map(device => (
                  <div key={device.id} className="p-6 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all bg-white group">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                          <MonitorSmartphone className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition-colors" />
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
                            Last Sync: {device.lastSync ? new Date(device.lastSync).toLocaleString('en-US') : 'Never synced'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => testConnection(device)}
                          disabled={syncing === 'test-' + device.id}
                          className="p-3 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl flex items-center justify-center transition-colors border border-blue-200"
                          title="Test Connection"
                        >
                          <Wifi className={`w-4 h-4 ${syncing === 'test-' + device.id ? 'animate-pulse' : ''}`} />
                        </button>
                        <button 
                          onClick={() => handleDelete(device.id)}
                          className="p-3 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center justify-center transition-colors border border-rose-200"
                          title="Delete Device"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Aksi Sinkronisasi */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-slate-100">
                      <button 
                        onClick={() => syncUsers(device.id)}
                        disabled={syncing !== null}
                        className="flex-1 bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50"
                      >
                        {syncing === 'users-' + device.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Users className="w-4 h-4" />
                        )}
                        Sync Personnel
                      </button>
                      
                      <button 
                        onClick={() => syncAttendance(device.id)}
                        disabled={syncing !== null}
                        className="flex-1 bg-blue-600 text-white hover:bg-blue-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 active:scale-95"
                      >
                        {syncing === 'attend-' + device.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Sync Attendance Logs
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceSettings;
