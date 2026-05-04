import { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Calendar as CalendarIcon,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, attendanceAPI } from '../../services/api';

const History = () => {
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;
  const [currentDate, setCurrentDate] = useState(new Date());

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['attendance-history', { empId, month, year }],
    queryFn: () => attendanceAPI.getHistory(empId, { month, year }),
    enabled: !!empId,
  });

  const historyList = historyData?.data || [];
  
  const stats = historyList.reduce((acc, curr) => {
    if (curr.status === 'Present') acc.present++;
    else if (curr.status === 'Late') acc.late++;
    else if (curr.status === 'Absent') acc.absent++;
    return acc;
  }, { present: 0, late: 0, absent: 0 });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center px-2">
        <h1 className="text-xl font-bold text-slate-800">Attendance History</h1>
        <button className="p-2 bg-white border border-slate-100 rounded-xl text-slate-500">
          <CalendarIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Month Selector */}
      <div className="card p-3 flex items-center justify-between">
        <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-bold text-slate-700">{monthName}</span>
        <button onClick={handleNextMonth} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Monthly Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 bg-emerald-50 border-emerald-100 flex flex-col items-center">
          <span className="text-lg font-black text-emerald-600">{stats.present}</span>
          <span className="text-[8px] font-bold text-emerald-500 uppercase">Present</span>
        </div>
        <div className="card p-3 bg-amber-50 border-amber-100 flex flex-col items-center">
          <span className="text-lg font-black text-amber-600">{stats.late}</span>
          <span className="text-[8px] font-bold text-amber-500 uppercase">Late</span>
        </div>
        <div className="card p-3 bg-red-50 border-red-100 flex flex-col items-center">
          <span className="text-lg font-black text-red-600">{stats.absent}</span>
          <span className="text-[8px] font-bold text-red-500 uppercase">Absent</span>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : historyList.length === 0 ? (
          <p className="text-center text-slate-400 py-10">No records found for this month.</p>
        ) : historyList.map((item, idx) => (
          <div key={idx} className="card p-4 flex items-center gap-4 group active:scale-[0.98] transition-transform">
            <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${
              item.status === 'Holiday' ? 'bg-slate-50 text-slate-400' : 
              item.status === 'Absent' ? 'bg-red-50 text-red-500' :
              'bg-primary/10 text-primary'
            }`}>
              <span className="text-[10px] font-bold uppercase">{item.weekday}</span>
              <span className="text-lg font-black">{item.day}</span>
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                  item.status === 'Present' ? 'text-emerald-500' :
                  item.status === 'Late' ? 'text-amber-500' :
                  item.status === 'Absent' ? 'text-red-500' :
                  'text-slate-400'
                }`}>
                  {item.status}
                </span>
                {item.status === 'Present' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                {item.status === 'Late' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                {item.status === 'Absent' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
              </div>
              <div className="flex justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 uppercase font-medium">Check In</span>
                  <span className={`text-sm font-bold ${item.in === '-- : --' ? 'text-slate-300' : 'text-slate-700'}`}>
                    {item.in}
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-medium">Check Out</span>
                  <span className={`text-sm font-bold ${item.out === '-- : --' ? 'text-slate-300' : 'text-slate-700'}`}>
                    {item.out}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-bold text-sm">
        Load More History
      </button>
    </div>
  );
};

export default History;
