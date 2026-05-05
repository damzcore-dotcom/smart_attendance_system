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

// Static fallback or helper components removed from global scope to avoid confusion with dynamic data

const StatCard = ({ title, value, change, icon: Icon, color }) => (
  <div className="card relative overflow-hidden group p-8 border border-slate-100/50 hover:border-slate-200 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1 bg-white">
    <div className={`absolute -right-8 -top-8 w-32 h-32 bg-${color.split('-')[0]}-500/10 rounded-full blur-3xl group-hover:bg-${color.split('-')[0]}-500/20 transition-all duration-700`}></div>
    <div className="flex justify-between items-start mb-8 relative z-10">
      <div className={`w-14 h-14 rounded-[1.25rem] bg-${color.split('-')[0]}-50/80 border border-${color.split('-')[0]}-100/50 flex items-center justify-center text-${color} shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
        <Icon className="w-7 h-7" />
      </div>
      <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">
        <MoreHorizontal className="w-5 h-5" />
      </button>
    </div>
    <div className="relative z-10">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{title}</p>
      <div className="flex items-end gap-3">
        <h3 className="text-4xl font-black text-slate-800 tracking-tighter">{value}</h3>
        <span className={`text-xs font-black flex items-center pb-1.5 px-2 py-0.5 rounded-full ${change.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {change.startsWith('+') ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
          {change}
        </span>
      </div>
    </div>
  </div>
);

const AdminDashboard = () => {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardAPI.getStats(),
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['dashboard-weekly-trends'],
    queryFn: () => dashboardAPI.getWeeklyTrends(),
  });

  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ['dashboard-dept-lateness'],
    queryFn: () => dashboardAPI.getDeptLateness(),
  });

  const { data: recentLateData, isLoading: recentLateLoading } = useQuery({
    queryKey: ['dashboard-recent-late'],
    queryFn: () => dashboardAPI.getRecentLate(),
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
      
      // Page 1: Summary
      doc.setFontSize(22);
      doc.setTextColor(0, 108, 73); 
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
        headStyles: { fillColor: [0, 108, 73] }
      });
      
      // Page 2: Employee List
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0, 108, 73);
      doc.text('2. Employee Master List', 14, 20);
      
      const empRows = employees.map(e => [e.id || '-', e.name || '-', e.dept || '-', e.division || '-', e.position || '-', e.employmentStatus || '-']);
      autoTable(doc, {
        startY: 25,
        head: [['Code', 'Name', 'Dept', 'Division', 'Position', 'Status']],
        body: empRows,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 108, 73] }
      });
      
      // Page 3: Attendance Logs
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0, 108, 73);
      doc.text("3. Today's Attendance Log", 14, 20);
      
      const attRows = attendance.map(a => [a.name || '-', a.dept || '-', a.checkIn || '-', a.checkOut || '-', a.status || '-', a.lateMinutes + 'm']);
      autoTable(doc, {
        startY: 25,
        head: [['Name', 'Dept', 'In', 'Out', 'Status', 'Late']],
        body: attRows,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 108, 73] }
      });
      
      doc.save(`Comprehensive_HR_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Report generation failed:', error);
      alert(`Report failed: ${error.message}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full mb-4 border border-emerald-100/50 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-time Sync Active
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-slate-500 mt-2 font-medium">Welcome back. Here's what's happening with your workforce today.</p>
        </div>
        <div className="flex gap-3 relative z-10 w-full md:w-auto">
          <button 
            onClick={handleDownloadReport}
            className="flex-1 md:flex-none bg-white border-2 border-slate-100 text-slate-600 px-6 py-3.5 rounded-[1.25rem] text-sm font-bold hover:bg-slate-50 hover:border-slate-200 hover:text-slate-900 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
          >
            <FileText className="w-4 h-4" />
            Export Report
          </button>
          <button 
            onClick={() => navigate('/admin/settings', { state: { tab: 'Shifts' } })}
            className="flex-1 md:flex-none btn-primary px-6 py-3.5 rounded-[1.25rem] text-sm font-black shadow-xl shadow-primary/20 flex items-center justify-center hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            Manage Shifts
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Employees" value={stats.totalEmployees} change="+12" icon={Users} color="blue-500" />
        <StatCard title="Present Today" value={stats.presentToday} change="+4%" icon={TrendingUp} color="emerald-500" />
        <StatCard title="Late Arrivals" value={stats.lateArrivals} change="-2%" icon={Clock} color="amber-500" />
        <StatCard title="Avg. Late Time" value={stats.avgLateTime} change="-5m" icon={AlertCircle} color="rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="card p-8 lg:col-span-2 border-slate-100/50 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-center mb-10 relative z-10">
            <div>
              <h3 className="font-black text-xl text-slate-800 tracking-tight">Weekly Attendance Trends</h3>
              <p className="text-xs font-medium text-slate-400 mt-1">Comparisons based on the last 7 days</p>
            </div>
            <div className="flex gap-3">
              <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-50 border border-slate-100 px-4 py-2 rounded-full">
                <div className="w-2 h-2 rounded-full bg-primary shadow-sm shadow-primary/50"></div> Present
              </span>
              <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-50 border border-slate-100 px-4 py-2 rounded-full">
                <div className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></div> Late
              </span>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center relative z-10">
            {trendsLoading ? (
              <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#006C49" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#006C49" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} dx={-10} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#1e293b', color: '#fff', borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px 20px', fontWeight: 'bold'}}
                  itemStyle={{color: '#fff', fontSize: '14px'}}
                />
                <Area type="monotone" dataKey="present" stroke="#006C49" strokeWidth={4} fillOpacity={1} fill="url(#colorPresent)" activeDot={{ r: 6, strokeWidth: 0, fill: '#006C49' }} />
                <Area type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={3} fillOpacity={0} activeDot={{ r: 5, strokeWidth: 0, fill: '#f59e0b' }} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Late Arrivals */}
        <div className="card p-8 border-slate-100/50 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-xl text-slate-800 tracking-tight">Recent Lates</h3>
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          
          <div className="space-y-5 flex-1">
            {recentLateLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary/50" /></div>
            ) : recentLate.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50 py-10">
                <CalendarCheck className="w-12 h-12 text-slate-300" />
                <p className="text-slate-500 font-bold text-sm">Perfect attendance so far!</p>
              </div>
            ) : (
              recentLate.map((row, i) => (
                <div key={i} className="flex items-center gap-4 group p-3 -mx-3 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden shrink-0 border-2 border-white shadow-sm group-hover:shadow-md transition-shadow">
                    <img src={row.avatar} alt="user" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate group-hover:text-primary transition-colors">{row.name}</p>
                    <p className="text-xs font-medium text-slate-500 truncate">{row.dept}</p>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center px-2 py-1 rounded-md bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest mb-1">
                      {row.lateMinutes}m Late
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{row.checkIn}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="w-full mt-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-primary hover:text-white rounded-[1.25rem] transition-all">
            View All Activity
          </button>
        </div>
      </div>

      {/* Lateness by Department */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-bold text-slate-800">Total Late Minutes by Dept</h3>
              <p className="text-xs text-slate-400 mt-1">Automated departmental calculation for May 2026</p>
            </div>
            <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {deptLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lateByDept} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="dept" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 'bold'}} width={40} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Bar dataKey="minutes" radius={[0, 4, 4, 0]} barSize={24}>
                    {lateByDept.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-bold text-slate-800 mb-6">Department Lateness Insights</h3>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-4">
              <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-800">Operations Dept Warning</p>
                <p className="text-xs text-red-600 mt-1 leading-relaxed">
                  Lateness has increased by 15% in Operations division this week. Most delays occur on Monday mornings.
                </p>
              </div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex gap-4">
              <TrendingUp className="w-6 h-6 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Engineering Dept Success</p>
                <p className="text-xs text-emerald-600 mt-1 leading-relaxed">
                  Engineering division maintains the highest punctuality score (98.4%) for three consecutive months.
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
