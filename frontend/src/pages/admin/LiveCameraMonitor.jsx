import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Wifi, WifiOff, RefreshCw, Clock, Loader2, Activity, XCircle, Video, VideoOff } from 'lucide-react';
import api from '../../services/api';

const LiveCameraMonitor = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const wsRef = useRef(null);

  // Simulation Modal State
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [simData, setSimData] = useState({ employeeId: '', cameraId: '', timestamp: '', status: 'PRESENT' });

  // Fetch employees for simulation
  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then(r => r.data),
  });
  const employees = employeesData?.data || [];

  // Fetch cameras
  const { data: camerasData, isLoading, refetch: refetchCameras } = useQuery({
    queryKey: ['cameras'],
    queryFn: () => api.get('/bridge/cameras').then(r => r.data),
    refetchInterval: 10000,
  });
  const cameras = camerasData?.data || [];

  // Fetch recent face events
  const { data: eventsData } = useQuery({
    queryKey: ['face-events', selectedCamera],
    queryFn: () => api.get('/bridge/face-events', {
      params: { cameraId: selectedCamera || undefined, limit: 50 }
    }).then(r => r.data),
    refetchInterval: 5000,
  });
  const events = eventsData?.data || [];

  // AI Engine status
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-engine-status'],
    queryFn: async () => {
      try {
        const envUrl = import.meta.env.VITE_AI_ENGINE_URL;
        const aiUrl = (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1'))
          ? envUrl
          : `${window.location.protocol}//${window.location.hostname}:8002`;
        const r = await fetch(`${aiUrl}/health`);
        return await r.json();
      } catch {
        return { status: 'offline' };
      }
    },
    refetchInterval: 15000,
  });

  const simulateMutation = useMutation({
    mutationFn: async (data) => {
      // Create artificial event similar to what Python Engine sends to Bridge
      const now = new Date();
      // If user provides a custom time in HH:mm format, combine with today's date
      let eventTime = now;
      if (data.time) {
        const [h, m] = data.time.split(':');
        eventTime = new Date();
        eventTime.setHours(parseInt(h, 10));
        eventTime.setMinutes(parseInt(m, 10));
        eventTime.setSeconds(0);
      }
      
      const payload = {
        employeeId: parseInt(data.employeeId, 10),
        date: eventTime.toISOString().split('T')[0],
        timestamp: eventTime.toISOString(),
        cameraId: data.cameraId,
        similarity: 0.99,
        status: data.status,
        source: 'FACE_SIMULATION'
      };
      
      // We directly hit our backend bridge endpoint for simulation
      const res = await api.post('/bridge/checkin', payload, {
        headers: { 'X-Bridge-Key': import.meta.env.VITE_INTERNAL_BRIDGE_KEY || 'AI_INTERNAL_KEY' }
      });
      return res.data;
    },
    onSuccess: (res) => {
      if (res.ignored) {
        alert(t('liveCamera.simulationIgnored', { message: res.message }));
      } else {
        alert(t('liveCamera.simulationSuccess', { type: res.type }));
        queryClient.invalidateQueries(['face-events']);
      }
      setIsSimulationOpen(false);
    },
    onError: (err) => {
      alert(t('liveCamera.simulationError', { message: err.message }));
    }
  });

  const handleSimulate = (e) => {
    e.preventDefault();
    if (!simData.employeeId || !simData.cameraId) {
      alert(t('liveCamera.selectEmployeeCameraAlert'));
      return;
    }
    simulateMutation.mutate(simData);
  };

  // WebSocket for live events
  useEffect(() => {
    const envWsUrl = import.meta.env.VITE_WS_URL;
    const wsUrl = (envWsUrl && !envWsUrl.includes('localhost') && !envWsUrl.includes('127.0.0.1'))
      ? envWsUrl
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:${
          ['localhost', '127.0.0.1', '192.168.11.11', '192.168.13.190'].includes(window.location.hostname) ? '5000' : '5050'
        }`;
    try {
      const ws = new WebSocket(`${wsUrl}/ws/live`);
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          if (event.type === 'ATTENDANCE_CHECKIN' || event.type === 'UNKNOWN_FACE_ALERT') {
            setLiveEvents(prev => [event.payload, ...prev.slice(0, 49)]);
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(() => {}, 3000);
      wsRef.current = ws;
    } catch {}
    return () => wsRef.current?.close();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Camera className="w-7 h-7 text-blue-600" />
            {t('liveCamera.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('liveCamera.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* AI Engine status indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            aiStatus?.status === 'ok' ? 'bg-green-50 text-green-700 border-green-200' :
            'bg-red-50 text-red-700 border-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${aiStatus?.status === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            AI Engine: {aiStatus?.status === 'ok' ? 'Online' : 'Offline'}
            {aiStatus?.cameras > 0 && ` (${aiStatus.cameras} cam)`}
          </div>

           <button
            onClick={() => setIsSimulationOpen(true)}
            className="flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 uppercase tracking-wider"
          >
            <Activity className="w-3.5 h-3.5 text-purple-500" />
            <span>{t('liveCamera.simulationBtn')}</span>
          </button>

          <button
            onClick={() => refetchCameras()}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
            title={t('liveCamera.refreshCameras')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
              <Camera className="w-4 h-4" /> {t('liveCamera.cameraList', { count: cameras.length })}
            </h3>
            <span className="text-xs text-slate-400">{t('liveCamera.selectToFilter')}</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : cameras.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <Camera className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              {t('liveCamera.noCameras')}
            </div>
          ) : (
            <div className="space-y-2">
              {cameras.map(cam => (
                <div
                  key={cam.id}
                  onClick={() => setSelectedCamera(cam.id === selectedCamera ? null : cam.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all border text-sm group cursor-pointer ${
                    selectedCamera === cam.id
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {cam.active ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-red-400" />
                      )}
                      <span className="font-medium">{cam.name}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      cam.direction === 'IN' ? 'bg-blue-100 text-blue-700' :
                      cam.direction === 'OUT' ? 'bg-orange-100 text-orange-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>{cam.direction}</span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-xs text-slate-400">
                      {cam.location || cam.ipAddress || cam.id}
                    </div>
                  </div>
                  
                  {cam._count && (
                    <div className="flex gap-3 mt-3 text-[10px] text-slate-500 border-t border-slate-100 pt-2">
                      <span>{cam._count.faceEvents} events</span>
                      <span>{cam._count.unknownAlerts} alerts</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CCTV Live Preview & Event Feed Container */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CCTV Live Preview Monitor */}
          {selectedCamera ? (() => {
            const cam = cameras.find(c => c.id === selectedCamera);
            const envUrl = import.meta.env.VITE_AI_ENGINE_URL;
            const aiUrl = (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1'))
              ? envUrl
              : `${window.location.protocol}//${window.location.hostname}:8002`;
            const streamUrl = `${aiUrl}/cameras/${selectedCamera}/stream`;
            const isOnline = cam?.active && aiStatus?.status === 'ok';

            return (
              <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-xl overflow-hidden relative group">
                {/* Header Overlay */}
                <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-red-400' : 'bg-slate-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-red-500' : 'bg-slate-500'}`}></span>
                    </span>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      {isOnline ? t('liveCamera.liveCctvFeed') : t('liveCamera.noSignal')}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      | {cam?.name || selectedCamera}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] bg-white/10 text-white/80 px-2 py-0.5 rounded font-mono">
                      {cam?.direction || 'BOTH'}
                    </span>
                    <button 
                      onClick={() => setSelectedCamera(null)}
                      className="text-slate-400 hover:text-white transition-colors"
                      title={t('liveCamera.closeStream')}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Video Area */}
                <div className="aspect-video w-full flex items-center justify-center bg-slate-950 relative overflow-hidden">
                  {isOnline ? (
                    <img 
                      src={streamUrl} 
                      alt={`Live Stream ${cam?.name}`} 
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        const fallback = document.getElementById('cctv-fallback');
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}

                  {/* Fallback / Offline / Connecting Screen */}
                  <div 
                    id="cctv-fallback" 
                    className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 ${isOnline ? 'hidden' : 'flex'}`}
                  >
                    {/* Simulated Analog TV Scanlines/Noise Effect */}
                    <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]"></div>
                    <VideoOff className="w-12 h-12 text-slate-700 animate-pulse mb-3" />
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                      {!cam?.active ? t('liveCamera.cameraDisabled') : t('liveCamera.aiDisconnected')}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {cam?.ipAddress ? `IP: ${cam.ipAddress}` : t('liveCamera.checkAiService')}
                    </p>
                  </div>
                </div>

                {/* Footer Status Overlay */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex justify-between items-center text-[10px] text-slate-400 font-mono z-10">
                  <div className="truncate max-w-[70%]">RTSP: {cam?.rtspUrl ? cam.rtspUrl.replace(/:[^:@]+@/, ':***@') : '-'}</div>
                  <div>LOC: {cam?.location || 'LOBBY'}</div>
                </div>
              </div>
            );
          })() : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 flex flex-col items-center justify-center aspect-[21/9]">
              <Video className="w-10 h-10 text-slate-300 mb-2 animate-pulse" />
              <h4 className="font-semibold text-slate-700 text-sm">{t('liveCamera.selectCameraFromList')}</h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                {t('liveCamera.selectCameraDesc')}
              </p>
            </div>
          )}

          {/* Event Feed */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" /> {t('liveCamera.eventFeed')}
                {selectedCamera && <span className="text-xs text-blue-600">({selectedCamera})</span>}
              </h3>
              <span className="text-xs text-slate-400">{t('liveCamera.eventsCount', { count: events.length })}</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-1.5">
              {events.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">{t('liveCamera.noEvents')}</p>
                </div>
              ) : (
                events.map((event, i) => (
                  <div
                    key={event.id || i}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${
                      event.isSpoof ? 'bg-red-50 border-red-100' :
                      event.isUnknown ? 'bg-amber-50 border-amber-100' :
                      'bg-white border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    {/* Status icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      event.isSpoof ? 'bg-red-100 text-red-600' :
                      event.isUnknown ? 'bg-amber-100 text-amber-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {event.isSpoof ? '🚫' : event.isUnknown ? '⚠️' : '✅'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">
                        {event.isSpoof ? 'Spoof Detected' :
                         event.isUnknown ? 'Unknown Face' :
                         event.employeeName ? `${event.employeeName} (${event.employeeCode || ''})` :
                         `Employee #${event.employeeId}`}
                      </div>
                      <div className="text-xs text-slate-400 flex gap-3">
                        <span>{event.camera?.name || event.cameraId}</span>
                        {event.similarity && <span>Sim: {(event.similarity * 100).toFixed(1)}%</span>}
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 shrink-0">
                      {new Date(event.eventTime).toLocaleTimeString('id-ID')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Simulasi CCTV */}
      {isSimulationOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                {t('liveCamera.simulationTitle')}
              </h2>
              <button onClick={() => setIsSimulationOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
              {t('liveCamera.simulationHelp')}
            </div>

            <form onSubmit={handleSimulate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('liveCamera.employee')}</label>
                <select
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  value={simData.employeeId}
                  onChange={e => setSimData({...simData, employeeId: e.target.value})}
                >
                  <option value="">{t('liveCamera.selectEmployeePlaceholder')}</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('liveCamera.cameraTrigger')}</label>
                <select
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  value={simData.cameraId}
                  onChange={e => setSimData({...simData, cameraId: e.target.value})}
                >
                  <option value="">{t('liveCamera.selectCameraPlaceholder')}</option>
                  {cameras.map(cam => (
                    <option key={cam.id} value={cam.id}>{cam.name} ({cam.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('liveCamera.attendanceStatus')}</label>
                <select
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  value={simData.status}
                  onChange={e => setSimData({...simData, status: e.target.value})}
                >
                  <option value="PRESENT">{t('liveCamera.statusPresentOption')}</option>
                  <option value="LATE">{t('liveCamera.statusLateOption')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('liveCamera.mockingTime')}</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={simData.time || ''}
                  onChange={e => setSimData({...simData, time: e.target.value})}
                />
                <p className="text-[10px] text-slate-400 mt-1">{t('liveCamera.mockingTimeHelp')}</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsSimulationOpen(false)}
                  className="flex-1 py-2 text-slate-600 font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={simulateMutation.isPending}
                  className="flex-1 py-2 text-white font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg text-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {simulateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('liveCamera.sendEvent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveCameraMonitor;
