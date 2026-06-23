import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Camera, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Clock, 
  Loader2, 
  Activity, 
  XCircle, 
  Video, 
  VideoOff,
  Gauge,
  TrendingUp,
  Filter,
  Eye,
  ShieldAlert,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCcw,
  UserX
} from 'lucide-react';
import api, { getFileUrl } from '../../services/api';
import { getAiEngineUrl } from '../../utils/aiEngine';

const LiveCameraMonitor = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isIndo = i18n.language === 'id';
  
  // Tab State: 'monitor' | 'dashboard' | 'timeline'
  const [activeTab, setActiveTab] = useState('monitor');
  const [selectedCamera, setSelectedCamera] = useState(null);
  
  // Timeline Filter State
  const [timelineCamera, setTimelineCamera] = useState('');
  const [timelineStatus, setTimelineStatus] = useState('ALL'); // ALL | RECOGNIZED | UNKNOWN | SPOOF
  const [searchName, setSearchName] = useState('');

  // Simulation Modal State
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [simData, setSimData] = useState({ employeeId: '', cameraId: '', timestamp: '', status: 'PRESENT' });

  // Real-time calculated FPS per camera state
  const [cameraFps, setCameraFps] = useState({});
  const lastFrameCounts = useRef({});
  const lastFpsTime = useRef(Date.now());

  // Fetch employees for simulation
  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then(r => r.data),
  });
  const employees = employeesData?.data || [];

  // Fetch cameras
  const { data: camerasData, isLoading: isLoadingCameras, refetch: refetchCameras } = useQuery({
    queryKey: ['cameras'],
    queryFn: () => api.get('/bridge/cameras').then(r => r.data),
    refetchInterval: 10000,
  });
  const cameras = camerasData?.data || [];

  // AI Engine base URL
  const aiUrl = getAiEngineUrl();

  // Fetch AI Engine health status
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-engine-status'],
    queryFn: async () => {
      try {
        const r = await fetch(`${aiUrl}/health`);
        return await r.json();
      } catch {
        return { status: 'offline' };
      }
    },
    refetchInterval: 10000,
  });

  // Fetch AI Engine metrics
  const { data: aiMetricsData } = useQuery({
    queryKey: ['ai-engine-metrics'],
    queryFn: async () => {
      try {
        const r = await fetch(`${aiUrl}/metrics`);
        return await r.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 3000, // refresh metrics every 3s
    enabled: activeTab === 'dashboard' || activeTab === 'monitor',
  });
  const metrics = aiMetricsData?.success ? aiMetricsData.metrics : null;

  // Fetch Re-enrollment Suggestions
  const { data: reEnrollData } = useQuery({
    queryKey: ['re-enrollment-suggestions'],
    queryFn: () => api.get('/bridge/re-enrollment-suggestions').then(r => r.data),
    refetchInterval: 15000, // refresh every 15s
    enabled: activeTab === 'dashboard',
  });
  const reEnrollSuggestions = reEnrollData?.suggestions || [];

  // Calculate real-time FPS
  useEffect(() => {
    if (metrics && metrics.camera_frames) {
      const now = Date.now();
      const elapsed = (now - lastFpsTime.current) / 1000.0;
      
      if (elapsed >= 2.0) { // update FPS every 2 seconds
        const newFps = {};
        Object.entries(metrics.camera_frames).forEach(([camId, count]) => {
          const lastCount = lastFrameCounts.current[camId] || 0;
          const diff = count - lastCount;
          newFps[camId] = Math.max(0.0, Math.min(30.0, parseFloat((diff / elapsed).toFixed(1))));
          lastFrameCounts.current[camId] = count;
        });
        setCameraFps(newFps);
        lastFpsTime.current = now;
      }
    }
  }, [metrics]);

  // Fetch recent face events
  const { data: eventsData, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['face-events', selectedCamera, timelineCamera, timelineStatus, activeTab],
    queryFn: () => {
      const activeCam = activeTab === 'timeline' ? timelineCamera : selectedCamera;
      return api.get('/bridge/face-events', {
        params: { 
          cameraId: activeCam || undefined, 
          limit: 100 
        }
      }).then(r => r.data);
    },
    refetchInterval: activeTab === 'timeline' ? 8000 : 5000,
  });
  const events = eventsData?.data || [];

  // Filter events locally for search query and status tab
  const filteredEvents = events.filter(e => {
    if (timelineStatus === 'RECOGNIZED' && (e.isUnknown || e.isSpoof)) return false;
    if (timelineStatus === 'UNKNOWN' && !e.isUnknown) return false;
    if (timelineStatus === 'SPOOF' && !e.isSpoof) return false;
    
    if (searchName) {
      const name = (e.employeeName || 'Unknown').toLowerCase();
      const code = (e.employeeCode || '').toLowerCase();
      const query = searchName.toLowerCase();
      return name.includes(query) || code.includes(query);
    }
    return true;
  });

  const simulateMutation = useMutation({
    mutationFn: async (data) => {
      const now = new Date();
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
        similarity: 0.88,
        status: data.status,
        source: 'FACE_SIMULATION',
        notes: `Simulasi Presensi CCTV (${data.status === 'LATE' ? 'Terlambat' : 'Hadir'})`
      };
      
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-3">
            <Camera className="w-8 h-8 text-blue-600" />
            {t('liveCamera.systemTitle')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('liveCamera.systemSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* AI Engine status indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            aiStatus?.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${aiStatus?.status === 'ok' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            AI Engine: {aiStatus?.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
            {metrics?.avg_processing_latency_seconds > 0 && ` (${Math.round(metrics.avg_processing_latency_seconds * 1000)}ms)`}
          </div>

          <button
            onClick={() => setIsSimulationOpen(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 uppercase tracking-wider"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{t('liveCamera.simulationBtn')}</span>
          </button>

          <button
            onClick={() => {
              refetchCameras();
              queryClient.invalidateQueries(['face-events']);
              queryClient.invalidateQueries(['ai-engine-status']);
            }}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-all bg-white shadow-sm"
            title={t('liveCamera.refreshCameras')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modern Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white p-1.5 rounded-xl shadow-sm">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'monitor'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>{t('liveCamera.tabLiveFeed')}</span>
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>{t('liveCamera.tabDashboard')}</span>
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'timeline'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{t('liveCamera.tabTimeline')}</span>
        </button>
      </div>

      {/* Tab Content: Monitor */}
      {activeTab === 'monitor' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-500" /> 
                {t('liveCamera.cameraListCount', { count: cameras.length })}
              </h3>
              <span className="text-xs text-slate-400 font-medium">{t('liveCamera.selectToFilter')}</span>
            </div>

            {isLoadingCameras ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : cameras.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                <Camera className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                {t('liveCamera.noCameras')}
              </div>
            ) : (
              <div className="space-y-2">
                {cameras.map(cam => {
                  const fps = cameraFps[cam.id] || 0.0;
                  return (
                    <div
                      key={cam.id}
                      onClick={() => setSelectedCamera(cam.id === selectedCamera ? null : cam.id)}
                      className={`w-full text-left p-3.5 rounded-xl transition-all border text-sm group cursor-pointer ${
                        selectedCamera === cam.id
                          ? 'bg-blue-50/70 border-blue-200 text-blue-800 shadow-sm'
                          : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {cam.active ? (
                            <Wifi className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <WifiOff className="w-4 h-4 text-rose-400" />
                          )}
                          <span className="font-bold">{cam.name}</span>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold ${
                          cam.direction === 'IN' ? 'bg-blue-100 text-blue-700' :
                          cam.direction === 'OUT' ? 'bg-orange-100 text-orange-700' :
                          'bg-violet-100 text-violet-700'
                        }`}>{cam.direction}</span>
                      </div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-slate-400 font-medium font-mono">
                          {cam.id}
                        </div>
                        {cam.active && (
                          <div className={`text-[10px] font-bold ${fps > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                            {fps > 0 ? `Processing: ${fps} FPS` : 'Idle / No Motion'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CCTV Live Preview Monitor & Feed */}
          <div className="lg:col-span-2 space-y-6">
            {selectedCamera ? (() => {
              const cam = cameras.find(c => c.id === selectedCamera);
              const isOnline = cam?.active && aiStatus?.status === 'ok';
              const streamUrl = `${aiUrl}/cameras/${selectedCamera}/stream`;

              return (
                <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden relative group">
                  {/* Header Overlay */}
                  <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 relative">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-rose-400' : 'bg-slate-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-rose-500' : 'bg-slate-500'}`}></span>
                      </span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        {isOnline ? t('liveCamera.liveCctvFeed') : t('liveCamera.noSignal')}
                      </span>
                      <span className="text-xs text-slate-300 font-mono">
                        | {cam?.name || selectedCamera}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded font-extrabold font-mono">
                        {cam?.direction || 'BOTH'}
                      </span>
                      <button 
                        onClick={() => setSelectedCamera(null)}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        <XCircle className="w-5 h-5" />
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

                    {/* Fallback Screen */}
                    <div 
                      id="cctv-fallback" 
                      className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 ${isOnline ? 'hidden' : 'flex'}`}
                    >
                      <VideoOff className="w-12 h-12 text-slate-700 animate-pulse mb-3" />
                      <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                        {!cam?.active ? t('liveCamera.cameraDisabled') : t('liveCamera.aiDisconnected')}
                      </p>
                      <p className="text-xs text-slate-600 mt-1 font-mono">
                        {cam?.ipAddress ? `IP: ${cam.ipAddress}` : t('liveCamera.checkAiService')}
                      </p>
                    </div>
                  </div>

                  {/* Footer Status Overlay */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3.5 flex justify-between items-center text-[10px] text-slate-400 font-mono z-10">
                    <div className="truncate max-w-[70%]">RTSP: {cam?.rtspUrl ? cam.rtspUrl.replace(/:[^:@]+@/, ':***@') : '-'}</div>
                    <div>LOC: {cam?.location || 'LOBBY'}</div>
                  </div>
                </div>
              );
            })() : (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 flex flex-col items-center justify-center aspect-[16/9] shadow-sm">
                <Video className="w-12 h-12 text-slate-300 mb-3 animate-pulse" />
                <h4 className="font-bold text-slate-700 text-sm">{t('liveCamera.selectCameraToView')}</h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1.5 leading-relaxed">
                  {t('liveCamera.selectCameraDesc')}
                </p>
              </div>
            )}

            {/* Simple Event Feed below live monitor */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  {t('liveCamera.recentDetectionFeed')}
                  {selectedCamera && <span className="text-xs text-blue-600">({selectedCamera})</span>}
                </h3>
                <span className="text-xs text-slate-400 font-semibold">{t('liveCamera.detectionsToday', { count: events.length })}</span>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                {events.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p>{t('liveCamera.noDetectionsToday')}</p>
                  </div>
                ) : (
                  events.slice(0, 10).map((event, i) => (
                    <div
                      key={event.id || i}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-xs transition-all ${
                        event.isSpoof ? 'bg-red-50/70 border-red-100' :
                        event.isUnknown ? 'bg-amber-50/70 border-amber-100' :
                        'bg-white border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      {/* Avatar crop snapshot */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                        {event.photoUrl ? (
                          <img src={getFileUrl(event.photoUrl)} alt="Face" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-slate-400">
                            {event.isSpoof ? '🚫' : event.isUnknown ? '👤' : '✅'}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">
                          {event.isSpoof ? t('liveCamera.photoSpoofingDetected') :
                           event.isUnknown ? t('liveCamera.unknownFace') :
                           event.employeeName ? `${event.employeeName} (${event.employeeCode || ''})` :
                           `Karyawan #${event.employeeId}`}
                        </div>
                        <div className="text-[10px] text-slate-400 flex gap-3 mt-0.5">
                          <span className="font-semibold">{event.camera?.name || event.cameraId}</span>
                          {event.similarity && <span className="font-medium">Sim: {(event.similarity * 100).toFixed(0)}%</span>}
                          {event.livenessScore && <span className="font-medium">Liveness: {(event.livenessScore * 100).toFixed(0)}%</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-600">
                          {new Date(event.eventTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5 font-semibold">
                          {event.isSpoof ? 'BLOCKED' : event.isUnknown ? 'ALERT' : 'RECORDED'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Dashboard AI Metrics */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Top Row Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Total Detected */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('liveCamera.totalFacesDetected')}</p>
              <h2 className="text-3xl font-black text-slate-800">{metrics?.total_faces_detected || 0}</h2>
              <div className="text-[10px] text-slate-400 font-semibold">{t('liveCamera.cumulativeToday')}</div>
            </div>
            
            {/* Recognized */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{t('liveCamera.recognizedMatch')}</p>
              <h2 className="text-3xl font-black text-emerald-600">{metrics?.total_faces_recognized || 0}</h2>
              <div className="text-[10px] text-emerald-600/70 font-semibold">{t('liveCamera.attendanceLogged')}</div>
            </div>

            {/* Unknown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{t('liveCamera.unknownFaces')}</p>
              <h2 className="text-3xl font-black text-amber-500">{metrics?.total_faces_unknown || 0}</h2>
              <div className="text-[10px] text-amber-500/70 font-semibold font-mono">{t('liveCamera.alertsTriggered')}</div>
            </div>

            {/* Spoof attempts */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">{t('liveCamera.spoofBlocked')}</p>
              <h2 className="text-3xl font-black text-rose-600">{metrics?.total_spoofs_detected || 0}</h2>
              <div className="text-[10px] text-rose-600/70 font-semibold">{t('liveCamera.cheatingPrevented')}</div>
            </div>

            {/* Quality Filtered */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2 col-span-2 md:col-span-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('liveCamera.qualityFiltered')}</p>
              <h2 className="text-3xl font-black text-slate-500">{metrics?.total_quality_filtered || 0}</h2>
              <div className="text-[10px] text-slate-400 font-semibold">{t('liveCamera.skippedByQualityGate')}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Latency and System performance */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 mb-2">
                  <Gauge className="w-5 h-5 text-blue-500" />
                  {t('liveCamera.aiEnginePerformance')}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('liveCamera.latencyDesc')}
                </p>
              </div>

              {/* Latency Dial */}
              <div className="flex flex-col items-center py-6 space-y-2">
                <div className="relative w-36 h-36 flex items-center justify-center rounded-full border-8 border-slate-100 bg-slate-50">
                  <div className="absolute inset-0 rounded-full border-8 border-t-blue-500 border-r-blue-400 border-b-transparent border-l-transparent animate-spin-slow pointer-events-none" />
                  <div className="text-center">
                    <span className="text-3xl font-black text-slate-800">
                      {metrics?.avg_processing_latency_seconds ? Math.round(metrics.avg_processing_latency_seconds * 1000) : 0}
                    </span>
                    <span className="text-xs font-bold text-slate-400 block mt-0.5">ms</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-700">{t('liveCamera.averageFrameLatency')}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold mt-1">✓ {t('liveCamera.optimalPerformance')}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-500 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span>Device Target:</span>
                  <span className="font-bold text-slate-700">CPU (Optimized NumPy)</span>
                </div>
                <div className="flex justify-between">
                  <span>Model Backbone:</span>
                  <span className="font-bold text-slate-700">InsightFace ArcFace</span>
                </div>
              </div>
            </div>

            {/* Active Workers & Queue Health */}
            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                {t('liveCamera.cameraThreadQueueHealth')}
              </h3>
              
              <p className="text-xs text-slate-400">
                {t('liveCamera.threadQueueDesc')}
              </p>

              <div className="space-y-4">
                {cameras.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">{t('liveCamera.noActiveCameras')}</p>
                ) : (
                  cameras.map(cam => {
                    const queueSize = metrics?.camera_status?.[cam.id]?.queue_size || 0;
                    const isWorkerActive = metrics?.active_workers?.includes(cam.id);
                    const fps = cameraFps[cam.id] || 0.0;
                    
                    return (
                      <div key={cam.id} className="border border-slate-100 p-4 rounded-xl space-y-3 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">{cam.name} <span className="text-[10px] text-slate-400 font-mono font-medium">({cam.id})</span></span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            isWorkerActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isWorkerActive ? 'WORKER ACTIVE' : 'WORKER IDLE'}
                          </span>
                        </div>

                        {/* Progress Bar Queue Size */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                            <span>Antrian Frame (Queue Size)</span>
                            <span className={queueSize >= 4 ? 'text-amber-500' : 'text-slate-500'}>
                              {queueSize} / 5 frames
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                queueSize >= 4 ? 'bg-amber-500' : 'bg-blue-600'
                              }`} 
                              style={{ width: `${(queueSize / 5) * 100}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                          <span>FPS Pemrosesan: <strong className="text-slate-600 font-bold">{fps}</strong></span>
                          <span>Motion Detection: <strong className="text-slate-600 font-bold">{fps > 0 ? 'SIGNIFICANT' : 'NO MOTION'}</strong></span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Re-enrollment Suggestions Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <RefreshCcw className="w-5 h-5 text-amber-500" />
                {t('liveCamera.faceReenrollmentSuggestions')}
              </h3>
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold ${
                reEnrollSuggestions.length > 0 
                  ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}>
                {reEnrollSuggestions.length > 0 
                  ? `${reEnrollSuggestions.length} ${t('liveCamera.needAttention')}`
                  : t('liveCamera.allClear')}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {t('liveCamera.reenrollDesc')}
            </p>

            {reEnrollSuggestions.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                <p className="text-sm font-bold text-slate-600">
                  {t('liveCamera.allEmployeesRecognizedWell')}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  {isIndo 
                    ? "Tidak ada karyawan yang perlu re-enrollment saat ini. Sistem akan otomatis memperingatkan jika akurasi menurun."
                    : "No employees need re-enrollment right now. The system will automatically alert if accuracy degrades."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reEnrollSuggestions.map((s, i) => {
                  const avgPct = (s.avg_similarity * 100).toFixed(1);
                  const severity = s.avg_similarity < 0.55 ? 'critical' : s.avg_similarity < 0.60 ? 'warning' : 'caution';
                  
                  return (
                    <div 
                      key={s.employee_id || i} 
                      className={`border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all hover:shadow-md ${
                        severity === 'critical' ? 'border-rose-200 bg-rose-50/50' :
                        severity === 'warning' ? 'border-amber-200 bg-amber-50/50' :
                        'border-yellow-200 bg-yellow-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                          severity === 'warning' ? 'bg-amber-100 text-amber-600' :
                          'bg-yellow-100 text-yellow-600'
                        }`}>
                          <UserX className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-800">
                            {s.employee_name}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                            ID: {s.employee_id} · {t('liveCamera.lastSamples', { count: s.sample_count })}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 md:gap-6">
                        {/* Avg Score */}
                        <div className="text-center min-w-[60px]">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{t('liveCamera.average')}</p>
                          <p className={`text-lg font-black ${
                            severity === 'critical' ? 'text-rose-600' :
                            severity === 'warning' ? 'text-amber-600' :
                            'text-yellow-600'
                          }`}>
                            {avgPct}%
                          </p>
                        </div>

                        {/* Min-Max Range */}
                        <div className="text-center min-w-[80px]">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{t('liveCamera.range')}</p>
                          <p className="text-xs font-bold text-slate-600">
                            {(s.min_similarity * 100).toFixed(0)}% – {(s.max_similarity * 100).toFixed(0)}%
                          </p>
                        </div>

                        {/* Severity Badge */}
                        <div className="text-center min-w-[60px]">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{t('liveCamera.level')}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                            severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                            severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {severity === 'critical' ? t('liveCamera.critical') :
                             severity === 'warning' ? t('liveCamera.warning') :
                             t('liveCamera.caution')}
                          </span>
                        </div>

                        {/* Re-enroll Button */}
                        <a
                          href="/admin/face-enrollment"
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 uppercase tracking-wider shrink-0"
                        >
                          <RefreshCcw className="w-3 h-3" />
                          {t('liveCamera.reEnroll')}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Timeline */}
      {activeTab === 'timeline' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            {/* Search Name */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={t('liveCamera.searchPlaceholder')}
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Filter Camera */}
            <select
              value={timelineCamera}
              onChange={e => setTimelineCamera(e.target.value)}
              className="w-full px-3 py-2 text-xs border rounded-lg outline-none bg-white font-medium text-slate-700"
            >
              <option value="">{t('liveCamera.allCameras')}</option>
              {cameras.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Filter Status */}
            <select
              value={timelineStatus}
              onChange={e => setTimelineStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs border rounded-lg outline-none bg-white font-medium text-slate-700"
            >
              <option value="ALL">{t('liveCamera.allStatus')}</option>
              <option value="RECOGNIZED">{isIndo ? "Hanya Dikenali" : "Only Recognized"}</option>
              <option value="UNKNOWN">{isIndo ? "Hanya Tidak Dikenal" : "Only Unknown"}</option>
              <option value="SPOOF">{isIndo ? "Hanya Spoof / Foto" : "Only Spoof"}</option>
            </select>

            {/* Reset Filter Button */}
            <button
              onClick={() => {
                setSearchName('');
                setTimelineCamera('');
                setTimelineStatus('ALL');
              }}
              className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{t('liveCamera.resetFilter')}</span>
            </button>
          </div>

          {/* Timeline View */}
          <div className="relative border-l-2 border-slate-100 ml-4 md:ml-10 pl-6 md:pl-10 space-y-6">
            {isLoadingEvents ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-slate-400 -ml-10">
                <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold">{t('liveCamera.noRecordsFound')}</p>
                <p className="text-xs mt-1">{t('liveCamera.tryChangingFilter')}</p>
              </div>
            ) : (
              filteredEvents.map((event, index) => {
                const isSpoof = event.isSpoof;
                const isUnknown = event.isUnknown;
                
                // Color badges
                const cardBorder = isSpoof ? 'border-l-4 border-l-rose-500' : isUnknown ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-emerald-500';
                
                return (
                  <div key={event.id || index} className="relative group">
                    {/* Time bullet */}
                    <div className={`absolute -left-[35px] md:-left-[51px] top-4 w-6 h-6 rounded-full flex items-center justify-center shadow border-2 border-white ${
                      isSpoof ? 'bg-rose-500 text-white' : isUnknown ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                    }`}>
                      <span className="text-[10px] font-bold">
                        {isSpoof ? '🚫' : isUnknown ? '⚠️' : '✓'}
                      </span>
                    </div>

                    {/* Timeline Event Card */}
                    <div className={`bg-white border border-slate-150 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${cardBorder}`}>
                      <div className="flex items-center gap-4">
                        {/* Snapshot from storage */}
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-sm relative group/zoom">
                          {event.photoUrl ? (
                            <img src={getFileUrl(event.photoUrl)} alt="Face Snapshot" className="w-full h-full object-cover group-hover/zoom:scale-125 transition-all duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">
                              {isSpoof ? '🚫' : isUnknown ? '👤' : '✅'}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-extrabold text-slate-800 text-sm md:text-base">
                            {isSpoof ? t('liveCamera.photoSpoofingDetected') :
                             isUnknown ? t('liveCamera.unknownFace') :
                             event.employeeName}
                          </h4>
                          {!isSpoof && !isUnknown && (
                            <p className="text-xs font-semibold text-slate-400">NIK: {event.employeeCode || '-'}</p>
                          )}
                          <p className="text-xs text-slate-400 font-medium">
                            Camera: <strong className="text-slate-600 font-bold">{event.camera?.name || event.cameraId}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Detail Metrics */}
                      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 md:gap-8 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                        {/* Accuracy metric */}
                        {event.similarity && (
                          <div className="text-center min-w-[60px]">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{isIndo ? "Akurasi" : "Match score"}</p>
                            <p className={`text-sm font-black ${
                              event.similarity >= 0.75 ? 'text-emerald-600' : 'text-blue-600'
                            }`}>
                              {(event.similarity * 100).toFixed(0)}%
                            </p>
                          </div>
                        )}

                        {/* Cooldown/Liveness Status */}
                        <div className="text-center min-w-[70px]">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{isSpoof ? "Hasil Liveness" : (isIndo ? "Tipe Presensi" : "Log Type")}</p>
                          <p className="text-xs font-extrabold text-slate-700">
                            {isSpoof ? 'SPOOFED' : isUnknown ? 'STRANGER' : 'FACE CCTV'}
                          </p>
                        </div>

                        {/* Time stamp */}
                        <div className="text-center min-w-[80px]">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{isIndo ? "Jam Deteksi" : "Detection Time"}</p>
                          <p className="text-sm font-mono font-bold text-slate-600">
                            {new Date(event.eventTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

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
