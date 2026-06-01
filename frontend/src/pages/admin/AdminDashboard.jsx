import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Clock, 
  CalendarCheck, 
  TrendingUp, 
  MoreHorizontal,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Loader2,
  FileText,
  Activity,
  UserPlus,
  Video,
  Wifi,
  WifiOff,
  CheckSquare,
  Bell
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api, { dashboardAPI, employeeAPI, attendanceAPI, deviceAPI } from '../../services/api';


const StatCard = ({ title, value, change, icon: Icon, color, delay }) => (
  <div 
    className={`relative overflow-hidden group p-7 bg-white/70 backdrop-blur-xl border border-slate-200/60 hover:border-${color}-300 transition-all duration-700 hover:-translate-y-2 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-2xl hover:shadow-${color}-500/10 animate-in slide-in-from-bottom-4 fade-in`}
    style={{ animationFillMode: 'both', animationDelay: `${delay}ms` }}
  >
    <div className={`absolute -right-16 -top-16 w-56 h-56 bg-gradient-to-br from-${color}-100/80 to-${color}-50/10 rounded-full blur-[40px] group-hover:scale-150 transition-all duration-1000 ease-out`}></div>
    <div className={`absolute -left-16 -bottom-16 w-48 h-48 bg-gradient-to-tr from-${color}-50/80 to-transparent rounded-full blur-[40px] group-hover:scale-125 transition-all duration-700 ease-out`}></div>
    
    <div className="flex justify-between items-start mb-8 relative z-10">
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-white to-${color}-50 border border-${color}-100 flex items-center justify-center text-${color}-600 shadow-md shadow-${color}-500/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 ease-out`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className={`flex items-center px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-widest uppercase shadow-sm transition-all duration-500 group-hover:-translate-y-1 ${change.startsWith('+') ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 text-emerald-600 border border-emerald-200/50' : 'bg-gradient-to-r from-rose-50 to-rose-100/50 text-rose-600 border border-rose-200/50'}`}>
        {change.startsWith('+') ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
        {change}
      </div>
    </div>
    <div className="relative z-10 space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight group-hover:bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-slate-800 group-hover:to-slate-500 transition-all duration-300">{value}</h3>
    </div>
  </div>
);

const AdminDashboard = () => {
  const [time, setTime] = useState(new Date());
  const [activeAlertTab, setActiveAlertTab] = useState('late'); // 'late' | 'live'
  const [liveEvents, setLiveEvents] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket for real-time capture
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5000`;
    try {
      const ws = new WebSocket(`${wsUrl}/ws/live`);
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          if (event.type === 'ATTENDANCE_CHECKIN' || event.type === 'UNKNOWN_FACE_ALERT') {
            const payload = event.payload;
            setLiveEvents(prev => [
              {
                name: payload.name || (payload.isUnknown ? 'Wajah Tidak Dikenal' : `Karyawan #${payload.employeeId}`),
                dept: payload.dept || 'Lobby / Security',
                time: new Date(payload.eventTime || payload.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                status: payload.isSpoof ? 'SPOOF' : payload.isUnknown ? 'UNKNOWN' : payload.status || 'PRESENT',
                avatar: payload.name ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${payload.name}` : null
              },
              ...prev.slice(0, 19)
            ]);
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(() => {}, 3000);
      wsRef.current = ws;
    } catch {}
    return () => wsRef.current?.close();
  }, []);

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardAPI.getStats,
    refetchInterval: 60000 
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['dashboard-weekly-trends'],
    queryFn: dashboardAPI.getWeeklyTrends,
  });

  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ['dashboard-dept-lateness'],
    queryFn: dashboardAPI.getDeptLateness,
  });

  const { data: recentLateData, isLoading: recentLateLoading } = useQuery({
    queryKey: ['dashboard-recent-late'],
    queryFn: dashboardAPI.getRecentLate,
  });

  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ['dashboard-notifications'],
    queryFn: dashboardAPI.getAdminNotifications,
    refetchInterval: 30000
  });

  const { data: camerasData } = useQuery({
    queryKey: ['cameras-summary'],
    queryFn: () => api.get('/bridge/cameras').then(r => r.data),
    refetchInterval: 20000
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices-summary'],
    queryFn: () => deviceAPI.getAll().then(r => r.data),
    refetchInterval: 20000
  });

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-engine-status-dashboard'],
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
    refetchInterval: 20000
  });

  const stats = statsData?.data || { totalEmployees: 0, presentToday: 0, lateArrivals: 0, avgLateTime: '0m' };
  const weeklyTrends = trendsData?.data || [];
  const lateByDept = deptData?.data || [];
  const recentLate = recentLateData?.data || [];
  const notifications = notificationsData?.data || [];
  const cameras = camerasData?.data || [];
  const devices = devicesData?.data || [];

  // Filter out departments with 0 lateness and sort descending to avoid overlap and duplicates
  const sortedDeptData = [...lateByDept].sort((a, b) => b.minutes - a.minutes);
  const activeDeptData = sortedDeptData.filter(d => d.minutes > 0);
  const chartData = activeDeptData.length > 0 ? activeDeptData.slice(0, 6) : sortedDeptData.slice(0, 5);

  const navigate = useNavigate();


  const generateInsights = () => {
    const insights = [];
    if (lateByDept.length > 0) {
      const worst = [...lateByDept].sort((a,b) => b.minutes - a.minutes)[0];
      if (worst && worst.minutes > 0) {
        insights.push({
          type: 'warning',
          icon: AlertCircle,
          color: 'orange',
          title: 'Perhatian Operasional',
          desc: `Tim `,
          bold1: worst.dept,
          desc2: ` mencatat angka hilangnya waktu produksi terbesar yaitu `,
          bold2: `${worst.minutes} menit`,
          desc3: `. Direkomendasikan evaluasi shift segera.`
        });
      }
      
      const best = [...lateByDept].sort((a,b) => a.minutes - b.minutes)[0];
      if (best && lateByDept.length > 1 && best.minutes < worst.minutes / 2) {
        insights.push({
          type: 'success',
          icon: TrendingUp,
          color: 'emerald',
          title: 'Efisiensi Sempurna',
          desc: `Tim `,
          bold1: best.dept,
          desc2: ` membuktikan tingkat kedisiplinan tertinggi dengan deviasi hanya `,
          bold2: `${best.minutes} menit`,
          desc3: `.`
        });
      }
    }
    
    if (insights.length === 0) {
      insights.push({
        type: 'info',
        icon: Activity,
        color: 'blue',
        title: 'Sistem Optimal',
        desc: `Alur operasional hari ini terdeteksi `,
        bold1: `stabil`,
        desc2: ` tanpa adanya anomali keterlambatan struktural. Semua divisi `,
        bold2: `berfungsi normal`,
        desc3: `.`
      });
    }

    return insights.slice(0, 2);
  };

  const dynamicInsights = generateInsights();

  const handleDownloadReport = async () => {
    // ... [keep same PDF logic] ...
    try {
      const [employeesRes, attendanceRes] = await Promise.all([
        employeeAPI.getAll({ limit: 10000, excludeBhl: true }),
        attendanceAPI.getAll({ period: 'Today', excludeBhl: true })
      ]);
      
      const employees = employeesRes?.data || [];
      const attendance = attendanceRes?.data || [];
      
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235);
      doc.text('Smart HR - Dashboard Report', 14, 25);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 32);
      
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('1. System Summary', 14, 45);
      
      const statsTableData = [
        ['Total Employees', stats.totalEmployees],
        ['Present Today', stats.presentToday],
        ['Late Arrivals Today', stats.lateArrivals],
        ['Average Late Time', stats.avgLateTime]
      ];
      
      autoTable(doc, {
        startY: 50,
        head: [['Metric', 'Value']],
        body: statsTableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }
      });
      
      doc.addPage();
      doc.setFontSize(16);
      doc.text('2. Employee Master List', 14, 20);
      
      const empRows = employees.map(e => [e.id || '-', e.name || '-', e.dept || '-', e.division || '-', e.position || '-', e.employmentStatus || '-']);
      autoTable(doc, {
        startY: 25,
        head: [['Code', 'Name', 'Dept', 'Division', 'Position', 'Status']],
        body: empRows,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      
      doc.addPage();
      doc.setFontSize(16);
      doc.text("3. Today's Attendance Log", 14, 20);
      
      const attRows = attendance.map(a => [a.name || '-', a.dept || '-', a.checkIn || '-', a.checkOut || '-', a.status || '-', a.lateMinutes + 'm']);
      autoTable(doc, {
        startY: 25,
        head: [['Name', 'Dept', 'In', 'Out', 'Status', 'Late']],
        body: attRows,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      
      doc.save(`SMART_Intelligence_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Report failed:', error);
      alert(`Report failed: ${error.message}`);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-700 min-h-screen">
      {/* 1. Page Header with Glassmorphism */}
      <div className="relative rounded-3xl bg-gradient-to-r from-blue-900 to-slate-900 p-8 xl:p-10 overflow-hidden shadow-2xl shadow-blue-900/20">
        {/* Animated Background Mesh */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-[80px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-[10px] font-bold text-blue-200 uppercase tracking-widest flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${aiStatus?.status === 'ok' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`} />
                AI Engine: {aiStatus?.status === 'ok' ? 'Online' : 'Offline'}
              </div>
              <div className="px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-[10px] font-bold text-blue-200 uppercase tracking-widest flex items-center gap-2">
                <Video className="w-3.5 h-3.5 text-blue-300" />
                CCTV: {cameras.filter(c => c.active).length}/{cameras.length} Online
              </div>
              <div className="px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-[10px] font-bold text-blue-200 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-300" />
                Fingerprint: {devices.length} Devices
              </div>
              <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
            
            <div className="flex items-baseline gap-4">
              <h1 className="text-4xl xl:text-5xl font-extrabold text-white tracking-tight">
                Command Center
              </h1>
              <span className="text-2xl font-light text-blue-200/80">
                {time.toLocaleTimeString('en-US', { hour12: false })}
              </span>
            </div>
            <p className="text-blue-100/60 font-medium max-w-xl">
              Artificial Intelligence augmented dashboard. Monitoring biometric attendance and operational punctuality in real-time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => navigate('/admin/cameras')}
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white px-5 py-3 rounded-2xl text-sm font-semibold transition-all shadow-lg active:scale-95 group"
            >
              <Video className="w-5 h-5 group-hover:text-blue-300 transition-colors" /> Live CCTV
            </button>
            <button 
              onClick={handleDownloadReport}
              className="flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-blue-50 px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-xl shadow-white/10 active:scale-95 group"
            >
              <FileText className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard delay={100} title="Global Workforce" value={stats.totalEmployees} change="+12" icon={Users} color="blue" />
        <StatCard delay={200} title="Current Presence" value={stats.presentToday} change="+4.2%" icon={Activity} color="emerald" />
        <StatCard delay={300} title="Morning Lates" value={stats.lateArrivals} change="-2.1%" icon={Clock} color="rose" />
        <StatCard delay={400} title="System Lateness" value={stats.avgLateTime} change="-5m" icon={TrendingUp} color="indigo" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 xl:col-span-2 border border-slate-200/60 shadow-lg shadow-slate-200/40 relative overflow-hidden rounded-3xl group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">Vectors & Analytics</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">7-Day Biometric Punctuality Trend</p>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white shadow-sm px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)] animate-pulse"></div> Present
              </span>
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white shadow-sm px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div> Late
              </span>
            </div>
          </div>
          
          <div className="h-[320px] w-full relative z-10">
            {trendsLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f8fafc" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} dx={-10} />
                <Tooltip 
                  contentStyle={{backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', color: '#1e293b', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '12px 20px'}}
                  itemStyle={{color: '#2563eb', fontSize: '13px', fontWeight: '800'}}
                />
                <Area type="monotone" dataKey="present" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorPresent)" activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb', shadow: '0 0 10px rgba(37,99,235,0.5)' }} animationDuration={1500} />
                <Area type="monotone" dataKey="late" stroke="#94a3b8" strokeWidth={3} fillOpacity={1} fill="url(#colorLate)" activeDot={{ r: 5, strokeWidth: 0, fill: '#94a3b8' }} animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Alerts & Live Capture Card */}
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 border border-slate-200/60 shadow-lg shadow-slate-200/40 flex flex-col rounded-3xl">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveAlertTab('late')}
                className={`pb-1 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${
                  activeAlertTab === 'late'
                    ? 'text-slate-800 border-blue-600 font-bold'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
              >
                Keterlambatan
              </button>
              <button
                type="button"
                onClick={() => setActiveAlertTab('live')}
                className={`pb-1 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
                  activeAlertTab === 'live'
                    ? 'text-slate-800 border-blue-600 font-bold'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live CCTV Capture
              </button>
            </div>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeAlertTab === 'late' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-emerald-50 text-emerald-500 border border-emerald-100'}`}>
              {activeAlertTab === 'late' ? <AlertCircle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
            </div>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto hide-scrollbar max-h-[300px]">
            {activeAlertTab === 'late' ? (
              recentLateLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
              ) : recentLate.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-10">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                    <CalendarCheck className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-slate-405 font-bold text-xs tracking-wide">Clear skies today.<br/>No late arrivals detected.</p>
                </div>
              ) : (
                recentLate.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 group p-2.5 -mx-2.5 rounded-2xl hover:bg-slate-50 transition-all duration-300 cursor-pointer border border-transparent hover:border-slate-200">
                    <div className="w-10 h-10 rounded-xl bg-white overflow-hidden shrink-0 border border-slate-200">
                      <img src={row.avatar} alt="user" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{row.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{row.dept}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold border border-rose-100 mb-0.5">
                        +{row.lateMinutes}m
                      </div>
                      <p className="text-[9px] font-bold text-slate-400">{row.checkIn}</p>
                    </div>
                  </div>
                ))
              )
            ) : (
              liveEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-10">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                    <Video className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-bold text-xs tracking-wide">Menunggu tangkapan kamera...<br/>Berdiri di depan CCTV untuk tes.</p>
                </div>
              ) : (
                liveEvents.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all animate-in slide-in-from-top-2 duration-300">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 text-slate-500 text-base font-bold">
                      {row.avatar ? (
                        <img src={row.avatar} alt="user" className="w-full h-full object-cover" />
                      ) : (
                        row.status === 'UNKNOWN' ? '👤' : '📸'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{row.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{row.dept}</p>
                    </div>
                    <div className="text-right flex flex-col items-end shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${
                        row.status === 'SPOOF' ? 'bg-red-50 text-red-600 border-red-150' :
                        row.status === 'UNKNOWN' ? 'bg-amber-50 text-amber-600 border-amber-155' :
                        row.status === 'LATE' ? 'bg-rose-50 text-rose-600 border-rose-150' :
                        'bg-emerald-50 text-emerald-600 border-emerald-150'
                      }`}>
                        {row.status}
                      </span>
                      <p className="text-[9px] font-bold text-slate-400 mt-1">{row.time}</p>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
          <button onClick={() => navigate('/admin/attendance')} className="w-full mt-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white hover:bg-slate-800 hover:text-white border border-slate-200 rounded-2xl transition-all duration-300 shadow-sm active:scale-95 cursor-pointer">
            Audit Full Logs
          </button>
        </div>
      </div>

      {/* Lateness by Department, Pending Actions & AI Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Dept Heatmap */}
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-200/40 group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          
          <div className="flex justify-between items-center mb-10 relative z-10">
            <div>
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">Departmental Heatmap</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cumulative loss in minutes</p>
            </div>
            <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="h-72 w-full flex items-center justify-center relative z-10">
            {deptLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 700}} />
                  <YAxis 
                    dataKey="fullName" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 10, fontWeight: 700}} 
                    width={95}
                    tickFormatter={(val) => val.length > 12 ? `${val.substring(0, 10)}...` : val}
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
                  />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]} barSize={18} name="Mulai Terlambat (Menit)" animationDuration={1500}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || (index === 0 ? '#4f46e5' : '#cbd5e1')} className="transition-all duration-300 hover:opacity-80" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Pending Actions Feed */}
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-200/40 flex flex-col group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          
          <div className="flex justify-between items-center mb-6 relative z-10">
            <div>
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">Tindakan Tertunda</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Persetujuan & Aksi</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100 shadow-inner shrink-0">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto hide-scrollbar max-h-[280px] relative z-10">
            {notificationsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : notifications.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-8">
                <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center">
                  <CheckSquare className="w-6 h-6 text-slate-350" />
                </div>
                <p className="text-slate-400 font-bold text-xs tracking-wide">Semua beres!<br/>Tidak ada tindakan tertunda.</p>
              </div>
            ) : (
              notifications.map((n) => {
                let badgeClass = "bg-blue-55 text-blue-600 border-blue-150";
                let path = "/admin/settings/users";
                if (n.title.toLowerCase().includes("face") || n.title.toLowerCase().includes("wajah")) {
                  badgeClass = "bg-amber-50 text-amber-600 border-amber-150";
                  path = "/admin/face-enrollment";
                } else if (n.title.toLowerCase().includes("leave") || n.title.toLowerCase().includes("izin") || n.title.toLowerCase().includes("cuti")) {
                  badgeClass = "bg-purple-50 text-purple-600 border-purple-150";
                  path = "/admin/leave-requests";
                } else if (n.title.toLowerCase().includes("correction") || n.title.toLowerCase().includes("koreksi")) {
                  badgeClass = "bg-pink-50 text-pink-600 border-pink-150";
                  path = "/admin/corrections";
                }

                return (
                  <div
                    key={n.id}
                    onClick={() => navigate(path)}
                    className="p-3 rounded-2xl border border-slate-100 hover:border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-start justify-between gap-3 cursor-pointer hover:shadow-sm group/item"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${badgeClass}`}>
                          {n.title.toLowerCase().includes("face") ? "Wajah" : n.title.toLowerCase().includes("leave") ? "Izin" : "Koreksi"}
                        </span>
                        <p className="text-xs font-bold text-slate-700 truncate group-hover/item:text-blue-650 transition-colors">
                          {n.desc}
                        </p>
                      </div>
                      <span className="text-[9px] text-slate-400 font-semibold block mt-1.5">
                        Status: {n.time}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover/item:translate-x-1 transition-transform shrink-0 self-center" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AI Insights */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 xl:p-8 rounded-3xl border border-slate-700 shadow-2xl shadow-slate-900/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[60px] pointer-events-none"></div>
          
          <h3 className="font-extrabold text-xl text-white mb-8 tracking-tight flex items-center gap-3 relative z-10">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.8)]"></div>
            SMART Intelligence
          </h3>
          
          <div className="space-y-4 relative z-10">
            {dynamicInsights.map((insight, idx) => {
              const IconComp = insight.icon;
              return (
                <div key={idx} className="p-6 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex gap-5 group hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
                  <div className={`w-12 h-12 rounded-xl bg-${insight.color}-500/20 text-${insight.color}-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-inner border border-${insight.color}-500/20`}>
                    <IconComp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className={`text-[11px] font-bold text-${insight.color}-300 uppercase tracking-widest`}>{insight.title}</p>
                    <p className="text-sm text-slate-300 mt-2 leading-relaxed font-medium">
                      {insight.desc}
                      <span className={`text-white font-bold bg-${insight.color}-500/20 px-1 rounded`}>{insight.bold1}</span>
                      {insight.desc2}
                      <span className={`text-white font-bold bg-${insight.color}-500/20 px-1 rounded`}>{insight.bold2}</span>
                      {insight.desc3}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
