import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Trash2, Edit, Wifi, WifiOff, Loader2, XCircle, Server, History, Sliders, Crop } from 'lucide-react';
import api from '../../services/api';
import { getAiEngineUrl } from '../../utils/aiEngine';

// Helper for parsing RTSP URLs back into structured parameters
const parseRtspUrl = (url) => {
  if (!url) {
    return { sourceType: 'STANDALONE', ip: '', port: '554', username: '', password: '', channel: '1', streamType: 'MAIN', manualRtspUrl: '' };
  }
  
  const regex = /^rtsp:\/\/(?:([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?(\/.*)?$/;
  const match = url.match(regex);
  if (!match) {
    return { sourceType: 'MANUAL', ip: '', port: '554', username: '', password: '', channel: '1', streamType: 'MAIN', manualRtspUrl: url };
  }
  
  const [, username = '', password = '', ip = '', port = '554', path = ''] = match;
  
  let decodedUser = username;
  let decodedPass = password;
  try {
    decodedUser = decodeURIComponent(username);
    decodedPass = decodeURIComponent(password);
  } catch {}
  
  // Detect Hikvision Modern / NVR
  const modernMatch = path.match(/\/Streaming\/Channels\/(\d+)/i);
  if (modernMatch) {
    const channelCode = parseInt(modernMatch[1], 10);
    const channel = Math.floor(channelCode / 100);
    const streamType = (channelCode % 100 === 1) ? 'MAIN' : 'SUB';
    
    return {
      sourceType: channel > 1 ? 'NVR' : 'STANDALONE',
      ip,
      port,
      username: decodedUser,
      password: decodedPass,
      channel: String(channel),
      streamType,
      manualRtspUrl: ''
    };
  }
  
  // Detect Hikvision Legacy
  const legacyMatch = path.match(/\/(h264|mpeg4|mpeg-4)\/ch(\d+)/i);
  if (legacyMatch) {
    const channel = legacyMatch[2];
    return {
      sourceType: 'LEGACY',
      ip,
      port,
      username: decodedUser,
      password: decodedPass,
      channel,
      streamType: 'MAIN',
      manualRtspUrl: ''
    };
  }
  
  return {
    sourceType: 'MANUAL',
    ip,
    port,
    username: decodedUser,
    password: decodedPass,
    channel: '1',
    streamType: 'MAIN',
    manualRtspUrl: url
  };
};

// Helper for generating RTSP URL from parameters
const generateRtspUrl = ({ sourceType, ip, port, username, password, channel, streamType, manualRtspUrl }) => {
  if (sourceType === 'MANUAL') return manualRtspUrl;
  
  const encodedUser = username ? encodeURIComponent(username) : '';
  const encodedPass = password ? encodeURIComponent(password) : '';
  const auth = encodedUser && encodedPass ? `${encodedUser}:${encodedPass}@` : '';
  const portStr = port ? `:${port}` : '';
  
  if (sourceType === 'STANDALONE') {
    const channelCode = streamType === 'MAIN' ? '101' : '102';
    return `rtsp://${auth}${ip}${portStr}/Streaming/Channels/${channelCode}`;
  }
  
  if (sourceType === 'NVR') {
    const ch = parseInt(channel, 10) || 1;
    const channelCode = streamType === 'MAIN' ? `${ch}01` : `${ch}02`;
    return `rtsp://${auth}${ip}${portStr}/Streaming/Channels/${channelCode}`;
  }
  
  if (sourceType === 'LEGACY') {
    const ch = parseInt(channel, 10) || 1;
    return `rtsp://${auth}${ip}${portStr}/h264/ch${ch}/main/av_stream`;
  }
  
  return '';
};

const SettingsCameras = ({ permissions = { canCreate: true, canUpdate: true, canDelete: true } }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({ id: '', name: '', ipAddress: '', rtspUrl: '', location: '', direction: 'BOTH', detectUnknown: true, captureInStart: '06:00', captureInEnd: '10:00', captureOutStart: '15:00', captureOutEnd: '21:00' });

  // ROI Visual Editor States
  const [isRoiModalOpen, setIsRoiModalOpen] = useState(false);
  const [selectedRoiCamera, setSelectedRoiCamera] = useState(null);
  const [roiValues, setRoiValues] = useState({ ymin: 0, xmin: 0, ymax: 100, xmax: 100 });
  const [isSavingRoi, setIsSavingRoi] = useState(false);

  const openRoiModal = async (camera) => {
    setSelectedRoiCamera(camera);
    setIsRoiModalOpen(true);
    // Set default values first
    setRoiValues({ ymin: 0, xmin: 0, ymax: 100, xmax: 100 });
    
    try {
      const res = await api.get('/bridge/cameras/rois');
      if (res.data && res.data.success && res.data.rois) {
        const camConfig = res.data.rois[camera.id];
        if (camConfig && camConfig.roi) {
          setRoiValues({
            ymin: Math.round(camConfig.roi[0] * 100),
            xmin: Math.round(camConfig.roi[1] * 100),
            ymax: Math.round(camConfig.roi[2] * 100),
            xmax: Math.round(camConfig.roi[3] * 100)
          });
        }
      }
    } catch (err) {
      console.error("Gagal mengambil konfigurasi ROI:", err);
    }
  };

  const handleSaveRoi = async () => {
    if (!selectedRoiCamera) return;
    setIsSavingRoi(true);
    try {
      const payload = {
        [selectedRoiCamera.id]: [
          roiValues.ymin / 100,
          roiValues.xmin / 100,
          roiValues.ymax / 100,
          roiValues.xmax / 100
        ]
      };
      const res = await api.post('/bridge/cameras/rois', payload);
      if (res.data && res.data.success) {
        alert(t('settingsPage.cameras.roi.saveSuccess') || "Konfigurasi area deteksi berhasil disimpan!");
        setIsRoiModalOpen(false);
      } else {
        alert(res.data.message || "Gagal menyimpan konfigurasi ROI.");
      }
    } catch (err) {
      console.error("Error saving ROI:", err);
      alert("Terjadi kesalahan saat menghubungi AI Engine.");
    } finally {
      setIsSavingRoi(false);
    }
  };

  // Visual connection form states
  const [sourceType, setSourceType] = useState('STANDALONE');
  const [connectionIp, setConnectionIp] = useState('');
  const [connectionPort, setConnectionPort] = useState('554');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nvrChannel, setNvrChannel] = useState('1');
  const [streamType, setStreamType] = useState('MAIN');
  const [manualRtspUrl, setManualRtspUrl] = useState('');

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

  // Sync visual connection inputs with formData.rtspUrl and formData.ipAddress
  useEffect(() => {
    if (!isModalOpen) return;
    
    // Sanitize connectionIp: strip protocol, trailing slashes, paths, and ports
    let cleanIp = connectionIp ? connectionIp.trim() : '';
    if (cleanIp) {
      cleanIp = cleanIp.replace(/^(https?:\/\/)/i, '');
      cleanIp = cleanIp.split('/')[0];
      cleanIp = cleanIp.split(':')[0];
    }
    
    const rtsp = generateRtspUrl({
      sourceType,
      ip: cleanIp,
      port: connectionPort,
      username,
      password,
      channel: nvrChannel,
      streamType,
      manualRtspUrl
    });
    
    setFormData(prev => ({
      ...prev,
      rtspUrl: rtsp,
      ipAddress: cleanIp
    }));
  }, [sourceType, connectionIp, connectionPort, username, password, nvrChannel, streamType, manualRtspUrl, isModalOpen]);

  const openModal = (cam = null) => {
    if (cam) {
      setFormData({
        ...cam,
        detectUnknown: cam.detectUnknown !== false,
        captureInStart: cam.captureInStart || '06:00',
        captureInEnd: cam.captureInEnd || '10:00',
        captureOutStart: cam.captureOutStart || '15:00',
        captureOutEnd: cam.captureOutEnd || '21:00'
      });
      setIsEditing(true);
      
      const parsed = parseRtspUrl(cam.rtspUrl);
      setSourceType(parsed.sourceType);
      setConnectionIp(parsed.ip || cam.ipAddress || '');
      setConnectionPort(parsed.port || '554');
      setUsername(parsed.username);
      setPassword(parsed.password);
      setNvrChannel(parsed.channel);
      setStreamType(parsed.streamType);
      setManualRtspUrl(parsed.manualRtspUrl || cam.rtspUrl || '');
    } else {
      setFormData({ id: '', name: '', ipAddress: '', rtspUrl: '', location: '', direction: 'BOTH', detectUnknown: true, captureInStart: '06:00', captureInEnd: '10:00', captureOutStart: '15:00', captureOutEnd: '21:00' });
      setIsEditing(false);
      
      setSourceType('STANDALONE');
      setConnectionIp('');
      setConnectionPort('554');
      setUsername('');
      setPassword('');
      setNvrChannel('1');
      setStreamType('MAIN');
      setManualRtspUrl('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ id: '', name: '', ipAddress: '', rtspUrl: '', location: '', direction: 'BOTH', detectUnknown: true, captureInStart: '06:00', captureInEnd: '10:00', captureOutStart: '15:00', captureOutEnd: '21:00' });
    setIsEditing(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleDelete = (id) => {
    if (window.confirm(t('settingsPage.cameras.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.rtspUrl) return;
    setIsTesting(true);
    try {
      const res = await api.post('/bridge/cameras/test', { rtspUrl: formData.rtspUrl });
      if (res.data && res.data.success) {
        alert(t('settingsPage.cameras.testSuccess'));
      } else {
        alert(`${t('settingsPage.cameras.testFailed')} ${res.data?.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`${t('settingsPage.cameras.testFailed')} ${err.response?.data?.message || err.message}`);
    } finally {
      setIsTesting(false);
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
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.cameras.title')}</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.cameras.subtitle')}</p>
            </div>
          </div>
          {permissions.canCreate && (
            <button 
              onClick={() => openModal()}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {t('settingsPage.cameras.newCameraBtn')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : cameras.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <Camera className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.cameras.empty')}</p>
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
                          <span className="text-[10px] font-bold text-blue-700 tracking-wider uppercase">{t('settingsPage.cameras.form.dir_label')}: {t(`settingsPage.cameras.form.dir_${cam.direction.toLowerCase()}`)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {permissions.canUpdate && (
                      <button 
                        onClick={() => openRoiModal(cam)}
                        className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-amber-600 rounded-lg transition-all border border-slate-200 hover:border-amber-200 cursor-pointer"
                        title={t('settingsPage.cameras.roi.buttonTooltip') || "Atur Area Deteksi"}
                      >
                        <Crop className="w-4 h-4" />
                      </button>
                    )}
                    {permissions.canUpdate && (
                      <button 
                        onClick={() => openModal(cam)}
                        className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition-all border border-slate-200 hover:border-blue-200 cursor-pointer"
                        title={t('settingsPage.cameras.form.editTooltip')}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {permissions.canDelete && (
                      <button 
                        onClick={() => handleDelete(cam.id)}
                        className="w-10 h-10 flex items-center justify-center bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all border border-slate-200 hover:border-rose-200 cursor-pointer"
                        title={t('settingsPage.cameras.form.deleteTooltip')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                {isEditing ? t('settingsPage.cameras.form.editTitle') : t('settingsPage.cameras.form.registerTitle')}
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('settingsPage.cameras.form.cameraId')}</label>
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    placeholder="e.g: CAM_LOBBY_01"
                    className="w-full px-3 py-1.5 border rounded-lg text-sm bg-slate-50 border-slate-200 outline-none"
                    value={formData.id}
                    onChange={e => setFormData({ ...formData, id: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('settingsPage.cameras.form.displayName')}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g: Main Lobby Entrance"
                    className="w-full px-3 py-1.5 border rounded-lg text-sm border-slate-200 outline-none focus:border-blue-500"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('settingsPage.cameras.form.location')}</label>
                  <input
                    type="text"
                    placeholder="e.g: Lantai 1 Lobby"
                    className="w-full px-3 py-1.5 border rounded-lg text-sm border-slate-200 outline-none focus:border-blue-500"
                    value={formData.location || ''}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('settingsPage.cameras.form.direction')}</label>
                  <select
                    className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                    value={formData.direction}
                    onChange={e => setFormData({ ...formData, direction: e.target.value })}
                  >
                    <option value="IN">{t('settingsPage.cameras.form.dir_in')}</option>
                    <option value="OUT">{t('settingsPage.cameras.form.dir_out')}</option>
                    <option value="BOTH">{t('settingsPage.cameras.form.dir_both')}</option>
                  </select>
                </div>
              </div>

              {/* Source Type Selector Grid */}
              <div className="space-y-1 border-t border-slate-100 pt-2.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('settingsPage.cameras.form.sourceType')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'STANDALONE', label: t('settingsPage.cameras.form.sourceStandalone'), icon: Camera, desc: t('settingsPage.cameras.form.sourceStandaloneDesc') },
                    { id: 'NVR', label: t('settingsPage.cameras.form.sourceNvr'), icon: Server, desc: t('settingsPage.cameras.form.sourceNvrDesc') },
                    { id: 'LEGACY', label: t('settingsPage.cameras.form.sourceLegacy'), icon: History, desc: t('settingsPage.cameras.form.sourceLegacyDesc') },
                    { id: 'MANUAL', label: t('settingsPage.cameras.form.sourceManual'), icon: Sliders, desc: t('settingsPage.cameras.form.sourceManualDesc') }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = sourceType === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSourceType(item.id)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/50 text-blue-700 shadow-sm font-semibold'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 mb-0.5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="text-[8px] font-bold tracking-tight uppercase leading-tight">{item.label}</span>
                        <span className="text-[7px] text-slate-400 leading-tight truncate w-full">{item.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Connection Inputs */}
              <div className="bg-slate-50/50 border border-slate-100 p-3 rounded-xl space-y-3">
                {sourceType !== 'MANUAL' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.ipAddress')}</label>
                        <input
                          type="text"
                          required
                          placeholder={t('settingsPage.cameras.form.ipPlaceholder')}
                          className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                          value={connectionIp}
                          onChange={e => setConnectionIp(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.rtspPort')}</label>
                        <input
                          type="text"
                          required
                          placeholder="554"
                          className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                          value={connectionPort}
                          onChange={e => setConnectionPort(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.username')}</label>
                        <input
                          type="text"
                          placeholder={t('settingsPage.cameras.form.usernamePlaceholder')}
                          className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.password')}</label>
                        <input
                          type="password"
                          placeholder={t('settingsPage.cameras.form.passwordPlaceholder')}
                          className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {(sourceType === 'NVR' || sourceType === 'LEGACY') && (
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.nvrChannel')}</label>
                          <input
                            type="number"
                            min="1"
                            required
                            className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                            value={nvrChannel}
                            onChange={e => setNvrChannel(e.target.value)}
                          />
                        </div>
                      )}
                      {(sourceType === 'STANDALONE' || sourceType === 'NVR') && (
                        <div className={sourceType === 'STANDALONE' ? 'col-span-2' : ''}>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.streamType')}</label>
                          <div className="flex gap-2">
                            {[
                              { id: 'MAIN', label: t('settingsPage.cameras.form.streamMain') },
                              { id: 'SUB', label: t('settingsPage.cameras.form.streamSub') }
                            ].map(stream => (
                              <button
                                key={stream.id}
                                type="button"
                                onClick={() => setStreamType(stream.id)}
                                className={`flex-1 py-1.5 text-[11px] font-semibold border rounded-lg transition-all cursor-pointer ${
                                  streamType === stream.id
                                    ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {stream.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.customRtsp')}</label>
                    <input
                      type="text"
                      required
                      placeholder="rtsp://user:pass@ip:port/stream/path"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white border-slate-200 outline-none focus:border-blue-500"
                      value={manualRtspUrl}
                      onChange={e => setManualRtspUrl(e.target.value)}
                    />
                  </div>
                )}

                {/* RTSP URL Preview & Test Connection */}
                <div className="border-t border-slate-200/50 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">{t('settingsPage.cameras.form.previewLink')}</span>
                    <button
                      type="button"
                      disabled={isTesting || !formData.rtspUrl}
                      onClick={handleTestConnection}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      {isTesting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wifi className="w-2.5 h-2.5" />}
                      {isTesting ? t('settingsPage.cameras.form.testingBtn') : t('settingsPage.cameras.form.testBtn')}
                    </button>
                  </div>
                  {formData.rtspUrl && (
                    <div className="font-mono text-[9px] bg-slate-900 text-slate-300 px-3 py-2 rounded-lg border border-slate-800 break-all select-all">
                      {formData.rtspUrl.replace(/:([^:@]+)@/, ':******@')}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule Form */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">{t('settingsPage.cameras.form.scheduleTitle')}</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.inStart')}</label>
                    <input
                      type="time"
                      className="w-full px-2 py-1 border rounded-lg text-xs bg-white border-slate-200 outline-none"
                      value={formData.captureInStart}
                      onChange={e => setFormData({ ...formData, captureInStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.inEnd')}</label>
                    <input
                      type="time"
                      className="w-full px-2 py-1 border rounded-lg text-xs bg-white border-slate-200 outline-none"
                      value={formData.captureInEnd}
                      onChange={e => setFormData({ ...formData, captureInEnd: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.outStart')}</label>
                    <input
                      type="time"
                      className="w-full px-2 py-1 border rounded-lg text-xs bg-white border-slate-200 outline-none"
                      value={formData.captureOutStart}
                      onChange={e => setFormData({ ...formData, captureOutStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">{t('settingsPage.cameras.form.outEnd')}</label>
                    <input
                      type="time"
                      className="w-full px-2 py-1 border rounded-lg text-xs bg-white border-slate-200 outline-none"
                      value={formData.captureOutEnd}
                      onChange={e => setFormData({ ...formData, captureOutEnd: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              
              {/* Checkboxes: Active Status & Stranger Faces Detection */}
              <div className="flex flex-col sm:flex-row gap-3.5 mt-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="flex items-center gap-2 cursor-pointer flex-1 select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.active !== false}
                    onChange={(e) => setFormData({...formData, active: e.target.checked})}
                    className="rounded text-blue-600 focus:ring-blue-500/20"
                  />
                  <span className="text-xs font-bold text-blue-700 uppercase">{t('settingsPage.cameras.form.active')}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer flex-1 select-none border-t sm:border-t-0 sm:border-l border-blue-200/60 pt-2 sm:pt-0 sm:pl-3">
                  <input 
                    type="checkbox" 
                    checked={formData.detectUnknown !== false}
                    onChange={(e) => setFormData({...formData, detectUnknown: e.target.checked})}
                    className="rounded text-blue-600 focus:ring-blue-500/20"
                  />
                  <span className="text-xs font-bold text-blue-700 uppercase">{t('settingsPage.cameras.form.detectUnknown')}</span>
                </label>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 text-slate-600 font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-all shadow-sm cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="flex-1 py-2 text-white font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settingsPage.cameras.form.saveBtn')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Visual ROI / Detection Zone Modal */}
      {isRoiModalOpen && selectedRoiCamera && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[95vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Crop className="w-5 h-5 text-blue-600 animate-pulse-slow" />
                {t('settingsPage.cameras.roi.modalTitle') || "Atur Area Deteksi Wajah"}
              </h2>
              <button 
                onClick={() => setIsRoiModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              {t('settingsPage.cameras.roi.modalDesc') || "Batasi area pemindaian wajah untuk mengurangi beban CPU Docker dan mencegah false alarm. Wajah di luar zona ini akan diabaikan."}
            </p>

            {/* Live Preview Screen Container */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative group aspect-[16/9] mb-5 shadow-inner">
              {(() => {
                const aiUrl = getAiEngineUrl();
                const streamUrl = `${aiUrl}/cameras/${selectedRoiCamera.id}/stream`;
                return (
                  <>
                    <img 
                      src={streamUrl} 
                      alt="CCTV Stream Preview" 
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />
                    
                    {/* Visual Detection Zone Overlay */}
                    <div 
                      className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 flex items-start p-2 transition-all duration-100 ease-out"
                      style={{
                        top: `${roiValues.ymin}%`,
                        left: `${roiValues.xmin}%`,
                        width: `${roiValues.xmax - roiValues.xmin}%`,
                        height: `${roiValues.ymax - roiValues.ymin}%`
                      }}
                    >
                      <div className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></span>
                        ACTIVE ZONE
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Range Sliders Controls */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-5">
              <div className="grid grid-cols-2 gap-4">
                {/* ymin - Batas Atas */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase flex justify-between">
                    <span>{t('settingsPage.cameras.roi.top') || "Batas Atas"}</span>
                    <span className="font-mono text-blue-600 font-bold">{roiValues.ymin}%</span>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max={Math.max(0, roiValues.ymax - 5)}
                    value={roiValues.ymin}
                    onChange={(e) => setRoiValues({ ...roiValues, ymin: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                
                {/* ymax - Batas Bawah */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase flex justify-between">
                    <span>{t('settingsPage.cameras.roi.bottom') || "Batas Bawah"}</span>
                    <span className="font-mono text-blue-600 font-bold">{roiValues.ymax}%</span>
                  </label>
                  <input 
                    type="range" 
                    min={Math.min(100, roiValues.ymin + 5)}
                    max="100" 
                    value={roiValues.ymax}
                    onChange={(e) => setRoiValues({ ...roiValues, ymax: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* xmin - Batas Kiri */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase flex justify-between">
                    <span>{t('settingsPage.cameras.roi.left') || "Batas Kiri"}</span>
                    <span className="font-mono text-blue-600 font-bold">{roiValues.xmin}%</span>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max={Math.max(0, roiValues.xmax - 5)}
                    value={roiValues.xmin}
                    onChange={(e) => setRoiValues({ ...roiValues, xmin: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* xmax - Batas Kanan */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase flex justify-between">
                    <span>{t('settingsPage.cameras.roi.right') || "Batas Kanan"}</span>
                    <span className="font-mono text-blue-600 font-bold">{roiValues.xmax}%</span>
                  </label>
                  <input 
                    type="range" 
                    min={Math.min(100, roiValues.xmin + 5)} 
                    max="100" 
                    value={roiValues.xmax}
                    onChange={(e) => setRoiValues({ ...roiValues, xmax: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 italic">
                  💡 {t('settingsPage.cameras.roi.tip') || "Geser slider untuk menyesuaikan area pemindaian secara visual."}
                </span>
                <button
                  type="button"
                  onClick={() => setRoiValues({ ymin: 0, xmin: 0, ymax: 100, xmax: 100 })}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md shadow-sm cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  {t('settingsPage.cameras.roi.resetBtn') || "Reset"}
                </button>
              </div>
            </div>

            {/* Actions Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsRoiModalOpen(false)}
                className="flex-1 py-2 text-slate-600 font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-all shadow-sm cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveRoi}
                disabled={isSavingRoi}
                className="flex-1 py-2 text-white font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isSavingRoi ? <Loader2 className="w-4 h-4 animate-spin" /> : (t('settingsPage.cameras.roi.saveBtn') || "Simpan Area")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsCameras;
