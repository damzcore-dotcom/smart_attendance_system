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
  FileText
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

const StatCard = ({ title, value, change, icon: Icon, color }) => (
  <div className="bg-white relative overflow-hidden group p-8 border border-slate-200 hover:border-blue-200 transition-all duration-500 hover:-translate-y-1 rounded-2xl shadow-sm">
    <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-50 rounded-full blur-[60px] group-hover:bg-blue-100 transition-all duration-700"></div>
    <div className="flex justify-between items-start mb-8 relative z-10">
      <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
        <Icon className="w-6 h-6" />
      </div>
      <div className={`flex items-center px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase ${change.startsWith('+') ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
        {change.startsWith('+') ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
        {change}
      </div>
    </div>
    <div className="relative z-10 space-y-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      <h3 className="text-4xl font-bold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors duration-300">{value}</h3>
    </div>
  </div>
);

const AdminDashboard = () => {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardAPI.getStats,
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
    try {
      const [employeesRes, attendanceRes] = await Promise.all([
        employeeAPI.getAll({ limit: 10000 }),
        attendanceAPI.getAll({ period: 'Today' })
      ]);
      
      const employees = employeesRes?.data || [];
      const attendance = attendanceRes?.data || [];
      
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235); // Blue-600
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
      doc.setTextColor(37, 99, 235);
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
      doc.setTextColor(37, 99, 235);
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
      
      doc.save(`Crystal_HR_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Report generation failed:', error);
      alert(`Report failed: ${error.message}`);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* 1. Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Real-time Intelligence</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Operational Overview</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Command Center
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              Live Data
            </div>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleDownloadReport}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
          >
            <FileText className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
            Generate Report
          </button>
          <button 
            onClick={() => navigate('/admin/settings', { state: { tab: 'Shifts' } })}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <Clock className="w-4 h-4" /> Manage Shifts
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-1">
        <StatCard title="Global Employees" value={stats.totalEmployees} change="+12" icon={Users} color="blue" />
        <StatCard title="Current Presence" value={stats.presentToday} change="+4%" icon={TrendingUp} color="blue" />
        <StatCard title="Morning Lates" value={stats.lateArrivals} change="-2%" icon={Clock} color="blue" />
        <StatCard title="System Efficiency" value={stats.avgLateTime} change="-5m" icon={AlertCircle} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-1">
        {/* Main Chart */}
        <div className="bg-white p-6 lg:col-span-2 border border-slate-200 shadow-sm relative overflow-hidden rounded-2xl">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h3 className="font-bold text-lg text-slate-800 tracking-tight">Attendance Vectors</h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Historical data tracking • last 7 days</p>
            </div>
            <div className="flex gap-3">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]"></div> Present
              </span>
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-slate-400"></div> Late
              </span>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center relative z-10">
            {trendsLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} dx={-10} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', color: '#1e293b', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px 16px'}}
                  itemStyle={{color: '#2563eb', fontSize: '13px', fontWeight: '700'}}
                />
                <Area type="monotone" dataKey="present" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorPresent)" activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb', shadow: '0 0 10px rgba(37,99,235,0.4)' }} />
                <Area type="monotone" dataKey="late" stroke="#94a3b8" strokeWidth={3} fillOpacity={0} activeDot={{ r: 5, strokeWidth: 0, fill: '#94a3b8' }} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Late Arrivals */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm flex flex-col rounded-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg text-slate-800 tracking-tight">Recent Alerts</h3>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          
          <div className="space-y-4 flex-1 overflow-y-auto hide-scrollbar">
            {recentLateLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : recentLate.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-10">
                <CalendarCheck className="w-12 h-12 text-slate-300" />
                <p className="text-slate-400 font-semibold text-sm">Clear sky today.</p>
              </div>
            ) : (
              recentLate.map((row, i) => (
                <div key={i} className="flex items-center gap-4 group p-3 -mx-2 rounded-xl hover:bg-slate-50 transition-all cursor-pointer border border-transparent hover:border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-sm group-hover:border-blue-300 transition-all">
                    <img src={row.avatar} alt="user" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{row.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{row.dept}</p>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center px-2 py-1 rounded-md bg-rose-50 text-rose-600 text-[10px] font-bold uppercase tracking-wider mb-1 border border-rose-100">
                      {row.lateMinutes}m
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500">{row.checkIn}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="w-full mt-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border border-slate-100 hover:border-blue-100 rounded-xl transition-all shadow-sm">
            Audit Full Logs
          </button>
        </div>
      </div>

      {/* Lateness by Department */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-1">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-bold text-lg text-slate-800 tracking-tight">Departmental Latency</h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Cumulative minutes per unit</p>
            </div>
            <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {deptLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lateByDept} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="dept" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} width={80} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}
                  />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]} barSize={24}>
                    {lateByDept.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#2563eb' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-800 mb-6 tracking-tight">Insight Analytics</h3>
          <div className="space-y-4">
            <div className="p-5 bg-rose-50 rounded-xl border border-rose-100 flex gap-5 group hover:bg-rose-100/50 transition-all">
              <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Operations Critical</p>
                <p className="text-sm text-rose-600/80 mt-1.5 leading-relaxed font-medium">
                  Lateness vector increased by <span className="text-rose-700 font-bold">15%</span> in Operations division this week. Strategic adjustment recommended.
                </p>
              </div>
            </div>
            <div className="p-5 bg-blue-50 rounded-xl border border-blue-100 flex gap-5 group hover:bg-blue-100/50 transition-all">
              <TrendingUp className="w-6 h-6 text-blue-600 shrink-0 group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Engineering Excellence</p>
                <p className="text-sm text-blue-600/80 mt-1.5 leading-relaxed font-medium">
                  Engineering division maintains a <span className="text-blue-700 font-bold">98.4%</span> punctuality rating. Consistent performance for 90 days.
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
