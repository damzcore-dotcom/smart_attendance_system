import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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


// Static color maps — Tailwind purges interpolated class names (`from-${color}-100`),
// so every variant must appear as a complete literal string here.
const STAT_STYLES = {
  blue: {
    card: 'hover:border-blue-300 hover:shadow-blue-500/10',
    glow1: 'from-blue-100/80 to-blue-50/10',
    glow2: 'from-blue-50/80',
    icon: 'from-white to-blue-50 border-blue-100 text-blue-600 shadow-blue-500/10',
  },
  emerald: {
    card: 'hover:border-emerald-300 hover:shadow-emerald-500/10',
    glow1: 'from-emerald-100/80 to-emerald-50/10',
    glow2: 'from-emerald-50/80',
    icon: 'from-white to-emerald-50 border-emerald-100 text-emerald-600 shadow-emerald-500/10',
  },
  rose: {
    card: 'hover:border-rose-300 hover:shadow-rose-500/10',
    glow1: 'from-rose-100/80 to-rose-50/10',
    glow2: 'from-rose-50/80',
    icon: 'from-white to-rose-50 border-rose-100 text-rose-600 shadow-rose-500/10',
  },
  indigo: {
    card: 'hover:border-indigo-300 hover:shadow-indigo-500/10',
    glow1: 'from-indigo-100/80 to-indigo-50/10',
    glow2: 'from-indigo-50/80',
    icon: 'from-white to-indigo-50 border-indigo-100 text-indigo-600 shadow-indigo-500/10',
  },
};

const INSIGHT_STYLES = {
  orange:  { iconWrap: 'bg-orange-100 text-orange-600 border-orange-200', title: 'text-orange-600', mark: 'bg-orange-100 text-orange-700' },
  emerald: { iconWrap: 'bg-emerald-100 text-emerald-600 border-emerald-200', title: 'text-emerald-600', mark: 'bg-emerald-100 text-emerald-700' },
  blue:    { iconWrap: 'bg-blue-100 text-blue-600 border-blue-200', title: 'text-blue-600', mark: 'bg-blue-100 text-blue-700' },
};

const StatCard = ({ title, value, change, icon: Icon, color, delay, onClick }) => {
  const s = STAT_STYLES[color] || STAT_STYLES.blue;
  return (
  <div
    onClick={onClick}
    className={`relative overflow-hidden group p-7 bg-white/70 backdrop-blur-xl border border-slate-200/60 ${s.card} transition-all duration-500 hover:-translate-y-1.5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-2xl animate-in slide-in-from-bottom-4 fade-in ${
      onClick ? 'cursor-pointer' : ''
    }`}
    style={{ animationFillMode: 'both', animationDelay: `${delay}ms` }}
  >
    <div className={`absolute -right-16 -top-16 w-56 h-56 bg-gradient-to-br ${s.glow1} rounded-full blur-[40px] group-hover:scale-150 transition-all duration-1000 ease-out`}></div>
    <div className={`absolute -left-16 -bottom-16 w-48 h-48 bg-gradient-to-tr ${s.glow2} to-transparent rounded-full blur-[40px] group-hover:scale-125 transition-all duration-700 ease-out`}></div>

    <div className="flex justify-between items-start mb-8 relative z-10">
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.icon} border flex items-center justify-center shadow-md group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 ease-out`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className={`flex items-center px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-widest uppercase shadow-sm transition-all duration-500 group-hover:-translate-y-1 ${change.startsWith('+') ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 text-emerald-600 border border-emerald-200/50' : 'bg-gradient-to-r from-rose-50 to-rose-100/50 text-rose-600 border border-rose-200/50'}`}>
        {change.startsWith('+') ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
        {change}
      </div>
    </div>
    <div className="relative z-10 space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight">{value}</h3>
    </div>
  </div>
  );
};

const AdminDashboard = () => {
  const { t, i18n } = useTranslation();
  const [time, setTime] = useState(new Date());
  const [activeAlertTab, setActiveAlertTab] = useState('late'); // 'late' | 'live'
  const [liveEvents, setLiveEvents] = useState([]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket for real-time capture
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

  const { data: contractAlertsData } = useQuery({
    queryKey: ['contract-alerts'],
    queryFn: employeeAPI.getContractAlerts,
    refetchInterval: 60000
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
      <div className="relative rounded-3xl bg-[#FBF7F0] border border-[#EADFce]/70 p-8 xl:p-10 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        {/* Soft warm glow accents */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[600px] h-[600px] bg-[#C0532B]/10 rounded-full blur-[80px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[400px] h-[400px] bg-[#E8A87C]/15 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3 py-1 rounded-full bg-white border border-stone-200/80 text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-2 shadow-sm">
                <div className={`w-2 h-2 rounded-full ${aiStatus?.status === 'ok' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500'}`} />
                {t('dashboard.header.aiEngine')}: {aiStatus?.status === 'ok' ? t('common.online') : t('common.offline')}
              </div>
              <div className="px-3 py-1 rounded-full bg-white border border-stone-200/80 text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-2 shadow-sm">
                <Video className="w-3.5 h-3.5 text-[#C0532B]" />
                {t('dashboard.header.cctv')}: {cameras.filter(c => c.active).length}/{cameras.length} {t('common.online')}
              </div>
              <div className="px-3 py-1 rounded-full bg-white border border-stone-200/80 text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-2 shadow-sm">
                <Clock className="w-3.5 h-3.5 text-[#C0532B]" />
                {t('dashboard.header.fingerprint')}: {devices.length} {t('dashboard.header.devices')}
              </div>
              <div className="px-3 py-1 rounded-full bg-stone-100/70 border border-stone-200/60 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                {time.toLocaleDateString(i18n.language || 'en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>

            <div className="flex items-baseline gap-4">
              <h1 className="text-4xl xl:text-5xl font-extrabold text-[#A8421F] tracking-tight">
                {t('dashboard.title')}
              </h1>
              <span className="text-2xl font-light text-stone-400">
                {time.toLocaleTimeString(i18n.language || 'en-US', { hour12: false })}
              </span>
            </div>
            <p className="text-stone-500 font-medium max-w-xl">
              {t('common.dashboardDesc')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/admin/cameras')}
              className="flex items-center justify-center gap-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 px-5 py-3 rounded-2xl text-sm font-semibold transition-all shadow-sm active:scale-95 group cursor-pointer"
            >
              <Video className="w-5 h-5 text-[#C0532B] transition-colors" /> {t('common.liveCctv')}
            </button>
            <button
              onClick={handleDownloadReport}
              className="flex items-center justify-center gap-2 bg-[#C0532B] hover:bg-[#A8421F] text-white px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-[#C0532B]/20 active:scale-95 group cursor-pointer"
            >
              <FileText className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              {t('common.generateReport')}
            </button>
          </div>
        </div>

      </div>

      {/* Contract Expiration Alert Banner */}
      {contractAlertsData?.data?.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/70 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in slide-in-from-top-4 duration-500">
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-700 shrink-0 border border-amber-200">
            <AlertCircle className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <h4 className="font-extrabold text-amber-900 text-sm uppercase tracking-wider">Perhatian: Kontrak Kerja (PKWT) Segera Berakhir</h4>
            <p className="text-xs text-amber-800 font-semibold leading-relaxed">
              Ada <span className="font-bold text-amber-900">{contractAlertsData.data.length} karyawan</span> yang kontrak kerjanya akan berakhir dalam waktu kurang dari 30 hari. Harap segera lakukan evaluasi perpanjangan kontrak.
            </p>
            <div className="pt-1">
              <div className={`flex flex-wrap gap-2 transition-all duration-300 ${showAllAlerts ? 'max-h-48 overflow-y-auto pr-2' : ''}`}>
                {(showAllAlerts ? contractAlertsData.data : contractAlertsData.data.slice(0, 10)).map(alert => (
                  <div key={alert.id} className="bg-white/80 border border-amber-200/60 pl-3 pr-1.5 py-1 rounded-lg text-[10px] font-bold text-amber-900 flex items-center gap-1.5 shadow-sm hover:bg-white hover:border-amber-300 transition-all">
                    <span className="uppercase truncate max-w-[130px]">{alert.name}</span>
                    <span className="text-amber-400 font-normal normal-case truncate max-w-[80px]">{alert.department}</span>
                    <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[9px] font-extrabold shrink-0">H-{alert.daysRemaining}</span>
                  </div>
                ))}

                {contractAlertsData.data.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAlerts(!showAllAlerts)}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300/50 px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all active:scale-95 shadow-sm cursor-pointer"
                  >
                    {showAllAlerts ? 'Sembunyikan' : `+ ${contractAlertsData.data.length - 10} Lainnya`}
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/employees')}
            className="bg-[#C0532B] hover:bg-[#A8421F] text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 shrink-0 shadow-lg shadow-[#C0532B]/20 cursor-pointer"
          >
            Kelola Karyawan
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard delay={100} title={t('dashboard.stats.workforce')} value={stats.totalEmployees} change="+12" icon={Users} color="blue" onClick={() => navigate('/admin/employees')} />
        <StatCard delay={200} title={t('dashboard.stats.presence')} value={stats.presentToday} change="+4.2%" icon={Activity} color="emerald" onClick={() => navigate('/admin/attendance', { state: { status: 'PRESENT', viewTab: 'DETAIL' } })} />
        <StatCard delay={300} title={t('dashboard.stats.lates')} value={stats.lateArrivals} change="-2.1%" icon={Clock} color="rose" onClick={() => navigate('/admin/attendance', { state: { status: 'LATE', viewTab: 'DETAIL' } })} />
        <StatCard delay={400} title={t('dashboard.stats.systemLateness')} value={stats.avgLateTime} change="-5m" icon={TrendingUp} color="indigo" onClick={() => navigate('/admin/attendance', { state: { status: 'LATE', viewTab: 'DETAIL' } })} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 xl:col-span-2 border border-slate-200/60 shadow-lg shadow-slate-200/40 relative overflow-hidden rounded-3xl group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">{t('dashboard.charts.analytics')}</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('dashboard.charts.punctualityTrend')}</p>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white shadow-sm px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(192,83,43,0.6)] animate-pulse"></div> {t('dashboard.charts.present')}
              </span>
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white shadow-sm px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div> {t('dashboard.charts.late')}
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
                    <stop offset="5%" stopColor="#C0532B" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#C0532B" stopOpacity={0}/>
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
                  itemStyle={{color: '#C0532B', fontSize: '13px', fontWeight: '800'}}
                />
                <Area type="monotone" dataKey="present" stroke="#C0532B" strokeWidth={4} fillOpacity={1} fill="url(#colorPresent)" activeDot={{ r: 6, strokeWidth: 0, fill: '#C0532B', shadow: '0 0 10px rgba(192,83,43,0.5)' }} animationDuration={1500} />
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
                {t('dashboard.alerts.lateness')}
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
                {t('dashboard.alerts.cctvCapture')}
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
                  <p className="text-slate-400 font-bold text-xs tracking-wide">{t('dashboard.alerts.clearSkies')}<br/>{t('dashboard.alerts.noLates')}</p>
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
                  <p className="text-slate-400 font-bold text-xs tracking-wide">{t('dashboard.alerts.waitingCamera')}<br/>{t('dashboard.alerts.cameraTestDesc')}</p>
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
                        row.status === 'SPOOF' ? 'bg-red-50 text-red-600 border-red-200' :
                        row.status === 'UNKNOWN' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        row.status === 'LATE' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                        'bg-emerald-50 text-emerald-600 border-emerald-200'
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
            {t('dashboard.alerts.auditLogs')}
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
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">{t('dashboard.charts.heatmap')}</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('dashboard.charts.cumulativeLoss')}</p>
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
                      <Cell key={`cell-${index}`} fill={entry.color || (index === 0 ? '#C0532B' : '#E8C4B0')} className="transition-all duration-300 hover:opacity-80" />
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
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">{t('dashboard.actions.title')}</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('dashboard.actions.subtitle')}</p>
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
                  <CheckSquare className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold text-xs tracking-wide">{t('dashboard.actions.allDone')}<br/>{t('dashboard.actions.noPending')}</p>
              </div>
            ) : (
              notifications.map((n) => {
                let badgeClass = "bg-blue-50 text-blue-600 border-blue-200";
                let path = "/admin/settings/users";
                if (n.title.toLowerCase().includes("face") || n.title.toLowerCase().includes("wajah")) {
                  badgeClass = "bg-amber-50 text-amber-600 border-amber-200";
                  path = "/admin/face-enrollment";
                } else if (n.title.toLowerCase().includes("leave") || n.title.toLowerCase().includes("izin") || n.title.toLowerCase().includes("cuti")) {
                  badgeClass = "bg-purple-50 text-purple-600 border-purple-200";
                  path = "/admin/leave-requests";
                } else if (n.title.toLowerCase().includes("correction") || n.title.toLowerCase().includes("koreksi")) {
                  badgeClass = "bg-pink-50 text-pink-600 border-pink-200";
                  path = "/admin/corrections";
                } else if (n.title.toLowerCase().includes("kontrak") || n.title.toLowerCase().includes("pkwt")) {
                  badgeClass = "bg-rose-50 text-rose-600 border-rose-200 font-bold";
                  path = "/admin/employees";
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
                          {n.title.toLowerCase().includes("face") ? "Wajah" : n.title.toLowerCase().includes("leave") ? "Izin" : n.title.toLowerCase().includes("kontrak") || n.title.toLowerCase().includes("pkwt") ? "PKWT" : "Koreksi"}
                        </span>
                        <p className="text-xs font-bold text-slate-700 truncate group-hover/item:text-blue-600 transition-colors">
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
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-200/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>

          <h3 className="font-extrabold text-xl text-slate-800 mb-8 tracking-tight flex items-center gap-3 relative z-10">
            <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse shadow-[0_0_12px_rgba(192,83,43,0.7)]"></div>
            SMART Intelligence
          </h3>

          <div className="space-y-4 relative z-10">
            {dynamicInsights.map((insight, idx) => {
              const IconComp = insight.icon;
              const ins = INSIGHT_STYLES[insight.color] || INSIGHT_STYLES.blue;
              return (
                <div key={idx} className="p-6 bg-slate-50/80 rounded-2xl border border-slate-100 flex gap-5 group/insight hover:bg-slate-100/70 hover:border-slate-200 transition-all duration-500 hover:-translate-y-1">
                  <div className={`w-12 h-12 rounded-xl ${ins.iconWrap} flex items-center justify-center shrink-0 group-hover/insight:scale-110 transition-transform border`}>
                    <IconComp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className={`text-[11px] font-bold ${ins.title} uppercase tracking-widest`}>{insight.title}</p>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed font-medium">
                      {insight.desc}
                      <span className={`font-bold ${ins.mark} px-1 rounded`}>{insight.bold1}</span>
                      {insight.desc2}
                      <span className={`font-bold ${ins.mark} px-1 rounded`}>{insight.bold2}</span>
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
