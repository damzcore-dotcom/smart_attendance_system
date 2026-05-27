import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Trash2, Edit, Wifi, WifiOff, Loader2, XCircle } from 'lucide-react';
import api from '../../services/api';

const SettingsCameras = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ id: '', name: '', ipAddress: '', rtspUrl: '', location: '', direction: 'BOTH', captureInStart: '06:00', captureInEnd: '10:00', captureOutStart: '15:00', captureOutEnd: '21:00' });

  const { data: camerasData, isLoading } = useQuery({
    queryKey: ['cameras'],
    queryFn: () => api.get('/bridge/cameras').then(r => r.data),
  });
  const cameras = camerasData?.data || [];

  const saveMutation = useMutation({
    mutationFn: (data) => isEditing ? api.put(`/bridge/cameras/${data.id}`, data) : api.post('/bridge/cameras', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['cameras']);
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/bridge/cameras/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['cameras']);
    }
  });

  const openModal = (cam = null) => {
    if (cam) {
      setFormData({
        ...cam,
        captureInStart: cam.captureInStart || '06:00',
        captureInEnd: cam.captureInEnd || '10:00',
        captureOutStart: cam.captureOutStart || '15:00',
        captureOutEnd: cam.captureOutEnd || '21:00'
      });
      setIsEditing(true);
    } else {
      setFormData({ id: '', name: '', ipAddress: '', rtspUrl: '', location: '', direction: 'BOTH', captureInStart: '06:00', captureInEnd: '10:00', captureOutStart: '15:00', captureOutEnd: '21:00' });
      setIsEditing(false);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ id: '', name: '', ipAddress: '', rtspUrl: '', location: '', direction: 'BOTH', captureInStart: '06:00', captureInEnd: '10:00', captureOutStart: '15:00', captureOutEnd: '21:00' });
    setIsEditing(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleDelete = (id) => {
    if (window.confirm('Yakin ingin menghapus kamera ini? Awas: Riwayat absen dari kamera ini akan kehilangan referensi kameranya.')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">AI Camera Integration</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">CCTV Face Recognition Config</p>
            </div>
          </div>
          <button 
            onClick={() => openModal()}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" /> NEW CAMERA
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : cameras.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <Camera className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">No cameras registered yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {cameras.map(cam => (
              <div key={cam.id} className="group relative bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-md transition-all duration-300">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-5">
                    <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 border border-slate-100 group-hover:border-blue-100 transition-all duration-300">
                      {cam.active ? <Wifi className="w-6 h-6 text-green-500" /> : <WifiOff className="w-6 h-6 text-red-400" />}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-lg font-bold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors uppercase">{cam.name}</h4>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-xl">{cam.ipAddress}</p>
                      <div className="flex flex-wrap gap-3 mt-3">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-600 tracking-wider w-32 truncate">{cam.rtspUrl}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                          <span className="text-[10px] font-bold text-blue-700 tracking-wider uppercase">DIR: {cam.direction}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => openModal(cam)}
                      className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition-all border border-slate-200 hover:border-blue-200"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(cam.id)}
                      className="w-10 h-10 flex items-center justify-center bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all border border-slate-200 hover:border-rose-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Pendaftaran Kamera */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                {isEditing ? 'Edit AI Camera' : 'Register AI Camera'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Camera ID (Unique Identifier)</label>
                <input
                  type="text"
                  required
                  disabled={isEditing}
                  placeholder="e.g: CAM_LOBBY_01"
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50"
                  value={formData.id}
                  onChange={e => setFormData({ ...formData, id: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g: Main Lobby Entrance"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">IP Address</label>
                  <input
                    type="text"
                    placeholder="192.168.1.xxx"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={formData.ipAddress}
                    onChange={e => setFormData({ ...formData, ipAddress: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Check-in Rule</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    value={formData.direction}
                    onChange={e => setFormData({ ...formData, direction: e.target.value })}
                  >
                    <option value="IN">In Only (IN)</option>
                    <option value="OUT">Out Only (OUT)</option>
                    <option value="BOTH">In & Out (BOTH)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">URL RTSP Stream</label>
                <input
                  type="text"
                  placeholder="rtsp://user:pass@ip:port/stream"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={formData.rtspUrl}
                  onChange={e => setFormData({ ...formData, rtspUrl: e.target.value })}
                />
              </div>

              {/* Schedule Form */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Jadwal Capture Wajah</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Masuk (Start)</label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      value={formData.captureInStart}
                      onChange={e => setFormData({ ...formData, captureInStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Masuk (End)</label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      value={formData.captureInEnd}
                      onChange={e => setFormData({ ...formData, captureInEnd: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-1">Keluar (Start)</label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      value={formData.captureOutStart}
                      onChange={e => setFormData({ ...formData, captureOutStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-1">Keluar (End)</label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      value={formData.captureOutEnd}
                      onChange={e => setFormData({ ...formData, captureOutEnd: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                <input 
                  type="checkbox" 
                  checked={formData.active !== false}
                  onChange={(e) => setFormData({...formData, active: e.target.checked})}
                  className="rounded text-blue-600"
                />
                <span className="text-xs font-bold text-blue-700 uppercase">Camera Active</span>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 text-slate-600 font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="flex-1 py-2 text-white font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsCameras;
