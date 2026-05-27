import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Wifi, WifiOff, RefreshCw, Clock, Users, Loader2, Activity } from 'lucide-react';
import api from '../../services/api';

const LiveCameraMonitor = () => {
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const wsRef = useRef(null);

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
        const aiUrl = import.meta.env.VITE_AI_ENGINE_URL || 'http://localhost:8001';
        const r = await fetch(`${aiUrl}/health`);
        return await r.json();
      } catch {
        return { status: 'offline' };
      }
    },
    refetchInterval: 15000,
  });

  // WebSocket for live events
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5000`;
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
            Live Camera Monitor
          </h1>
          <p className="text-sm text-slate-500 mt-1">Pemantauan real-time kamera CCTV dan event pengenalan wajah</p>
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
            onClick={() => refetchCameras()}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Camera className="w-4 h-4" /> Daftar Kamera ({cameras.length})
          </h3>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : cameras.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <Camera className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              Belum ada kamera terdaftar
            </div>
          ) : (
            <div className="space-y-2">
              {cameras.map(cam => (
                <button
                  key={cam.id}
                  onClick={() => setSelectedCamera(cam.id === selectedCamera ? null : cam.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all border text-sm ${
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
                  <div className="text-xs text-slate-400 mt-1">
                    {cam.location || cam.ipAddress || cam.id}
                  </div>
                  {cam._count && (
                    <div className="flex gap-3 mt-2 text-[10px] text-slate-500">
                      <span>{cam._count.faceEvents} events</span>
                      <span>{cam._count.unknownAlerts} alerts</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Event Feed */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" /> Face Events Feed
              {selectedCamera && <span className="text-xs text-blue-600">({selectedCamera})</span>}
            </h3>
            <span className="text-xs text-slate-400">{events.length} events</span>
          </div>

          <div className="max-h-[600px] overflow-y-auto space-y-1.5">
            {events.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Belum ada event tercatat</p>
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
  );
};

export default LiveCameraMonitor;
