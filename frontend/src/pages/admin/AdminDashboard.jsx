import React, { useState, useEffect } from 'react';
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
  Video
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
import { dashboardAPI, employeeAPI, attendanceAPI } from '../../services/api';

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

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
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

  const stats = statsData?.data || { totalEmployees: 0, presentToday: 0, lateArrivals: 0, avgLateTime: '0m' };
  const weeklyTrends = trendsData?.data || [];
  const lateByDept = deptData?.data || [];
  const recentLate = recentLateData?.data || [];

  const navigate = useNavigate();

  const handleDownloadReport = async () => {
    // ... [keep same PDF logic] ...
    try {
      const [employeesRes, attendanceRes] = await Promise.all([
        employeeAPI.getAll({ limit: 10000 }),
        attendanceAPI.getAll({ period: 'Today' })
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
      
      doc.save(`ADAM_Intelligence_Report_${new Date().toISOString().split('T')[0]}.pdf`);
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
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-[10px] font-bold text-blue-200 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                Live Feed Active
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

        {/* Recent Late Arrivals */}
        <div className="bg-white/80 backdrop-blur-xl p-6 xl:p-8 border border-slate-200/60 shadow-lg shadow-slate-200/40 flex flex-col rounded-3xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">Recent Alerts</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Live Lateness Logs</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100 shadow-inner">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto hide-scrollbar">
            {recentLateLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : recentLate.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-10">
                <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center">
                  <CalendarCheck className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold text-sm tracking-wide">Clear skies today.<br/>No late arrivals detected.</p>
              </div>
            ) : (
              recentLate.map((row, i) => (
                <div key={i} className="flex items-center gap-4 group p-3 -mx-3 rounded-2xl hover:bg-slate-50 transition-all duration-300 cursor-pointer border border-transparent hover:border-slate-200 hover:shadow-md">
                  <div className="w-12 h-12 rounded-2xl bg-white overflow-hidden shrink-0 border border-slate-200 shadow-sm group-hover:shadow-rose-200 group-hover:border-rose-300 transition-all duration-300">
                    <img src={row.avatar} alt="user" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-slate-800 truncate group-hover:text-rose-600 transition-colors">{row.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{row.dept}</p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="inline-flex items-center px-2 py-1 rounded-lg bg-gradient-to-r from-rose-50 to-rose-100/50 text-rose-600 text-[10px] font-bold uppercase tracking-wider border border-rose-200/50 mb-1">
                      {row.lateMinutes} mins late
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{row.checkIn}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button onClick={() => navigate('/admin/attendance')} className="w-full mt-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-white hover:bg-slate-800 hover:text-white border border-slate-200 rounded-2xl transition-all duration-300 shadow-sm active:scale-95">
            Audit Full Logs
          </button>
        </div>
      </div>

      {/* Lateness by Department & AI Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                <BarChart data={lateByDept} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="dept" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 700}} width={90} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
                  />
                  <Bar dataKey="minutes" radius={[0, 8, 8, 0]} barSize={28} animationDuration={1500}>
                    {lateByDept.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#cbd5e1'} className="transition-all duration-300 hover:opacity-80" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 xl:p-8 rounded-3xl border border-slate-700 shadow-2xl shadow-slate-900/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[60px] pointer-events-none"></div>
          
          <h3 className="font-extrabold text-xl text-white mb-8 tracking-tight flex items-center gap-3 relative z-10">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.8)]"></div>
            ADAM Intelligence
          </h3>
          
          <div className="space-y-4 relative z-10">
            <div className="p-6 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex gap-5 group hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-inner border border-orange-500/20">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-orange-300 uppercase tracking-widest">Operations Warning</p>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed font-medium">
                  Lateness vector increased by <span className="text-white font-bold bg-orange-500/20 px-1 rounded">15%</span> in Operations division this week. Recommend strategic shift adjustment.
                </p>
              </div>
            </div>
            
            <div className="p-6 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex gap-5 group hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-inner border border-emerald-500/20">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest">Engineering Excellence</p>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed font-medium">
                  Engineering division maintains a <span className="text-white font-bold bg-emerald-500/20 px-1 rounded">98.4%</span> punctuality rating. Consistent performance for 90 days.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
