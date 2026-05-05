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
  <div className="card p-6 flex flex-col justify-between">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-${color.split('-')[0]}-50 text-${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <button className="text-slate-400 hover:text-slate-600">
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <div className="flex items-end gap-3 mt-1">
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <span className={`text-xs font-bold flex items-center mb-1 ${change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
          {change.startsWith('+') ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
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
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
          <p className="text-slate-500 mt-1">Welcome back, Admin. Real-time lateness calculation is active.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleDownloadReport}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Download Report
          </button>
          <button 
            onClick={() => navigate('/admin/settings', { state: { tab: 'Shifts' } })}
            className="btn-primary text-sm font-medium"
          >
            Manage Shifts
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Employees" value={stats.totalEmployees} change="+0" icon={Users} color="blue-500" />
        <StatCard title="Present Today" value={stats.presentToday} change="+0%" icon={TrendingUp} color="emerald-500" />
        <StatCard title="Late Arrivals" value={stats.lateArrivals} change="+0%" icon={Clock} color="amber-500" />
        <StatCard title="Avg. Late Time" value={stats.avgLateTime} change="0m" icon={AlertCircle} color="red-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-slate-800">Weekly Attendance Trends</h3>
            <div className="flex gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-primary"></div> Present
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div> Late
              </span>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center">
            {trendsLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrends}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#006C49" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#006C49" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="present" stroke="#006C49" strokeWidth={3} fillOpacity={1} fill="url(#colorPresent)" />
                <Area type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Late Arrivals */}
        <div className="card p-6">
          <h3 className="font-bold text-slate-800 mb-6">Recent Late Arrivals</h3>
          <div className="space-y-6">
            {recentLateLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : recentLate.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">No late arrivals recorded.</p>
            ) : (
              recentLate.map((row, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0">
                    <img src={row.avatar} alt="user" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{row.name}</p>
                    <p className="text-xs text-slate-500 truncate">{row.dept}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-500">{row.lateMinutes}m Late</p>
                    <p className="text-xs text-slate-400">{row.checkIn}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="w-full mt-6 py-2 text-sm font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors">
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
