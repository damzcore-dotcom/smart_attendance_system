import { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
  MessageSquare,
  History as HistoryIcon,
  FileText
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, attendanceAPI, correctionAPI, leaveAPI } from '../../services/api';

const History = () => {
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' or 'leave'

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['attendance-history', { empId, month, year }],
    queryFn: () => attendanceAPI.getHistory(empId, { month, year }),
    enabled: !!empId && activeTab === 'attendance',
  });
  
  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ['leave-history', empId],
    queryFn: () => leaveAPI.getByEmployee(empId),
    enabled: !!empId && activeTab === 'leave',
  });

  const historyList = historyData?.data || [];
  const leaveList = leaveData?.data || [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [formData, setFormData] = useState({
    type: 'IN',
    requestedTime: '',
    reason: ''
  });

  const queryClient = useQueryClient();

  const correctionMutation = useMutation({
    mutationFn: (data) => correctionAPI.create(data),
    onSuccess: () => {
      alert('Correction request submitted successfully!');
      setIsModalOpen(false);
      setFormData({ type: 'IN', requestedTime: '', reason: '' });
      queryClient.invalidateQueries(['attendance-history']);
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const handleDayClick = (item) => {
    if (item.status === 'Holiday') return;
    setSelectedDay(item);
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      employeeId: empId,
      date: `${year}-${String(month).padStart(2, '0')}-${String(selectedDay.day).padStart(2, '0')}`,
      type: formData.type,
      requestedTime: formData.requestedTime,
      reason: formData.reason
    };
    correctionMutation.mutate(payload);
  };
  
  const stats = historyList.reduce((acc, curr) => {
    if (curr.status === 'Present') acc.present++;
    else if (curr.status === 'Late') acc.late++;
    else if (curr.status === 'Mangkir') acc.mangkir++;
    else if (curr.status === 'Absent') acc.absent++;
    return acc;
  }, { present: 0, late: 0, mangkir: 0, absent: 0 });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center px-2">
        <h1 className="text-xl font-bold text-slate-800">History Log</h1>
        <div className="flex gap-2">
          {activeTab === 'attendance' && (
            <button className="p-2 bg-white border border-slate-100 rounded-xl text-slate-500">
              <CalendarIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex p-1.5 bg-slate-100/50 rounded-2xl border border-slate-100">
        <button 
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
            activeTab === 'attendance' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Attendance
        </button>
        <button 
          onClick={() => setActiveTab('leave')}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
            activeTab === 'leave' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Leave Requests
        </button>
      </div>

      {activeTab === 'attendance' ? (
        <>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-3 bg-emerald-50 border-emerald-100 flex flex-col items-center">
          <span className="text-lg font-black text-emerald-600">{stats.present}</span>
          <span className="text-[8px] font-bold text-emerald-500 uppercase">Hadir</span>
        </div>
        <div className="card p-3 bg-amber-50 border-amber-100 flex flex-col items-center">
          <span className="text-lg font-black text-amber-600">{stats.late}</span>
          <span className="text-[8px] font-bold text-amber-500 uppercase">Terlambat</span>
        </div>
        <div className="card p-3 bg-orange-50 border-orange-100 flex flex-col items-center">
          <span className="text-lg font-black text-orange-600">{stats.mangkir}</span>
          <span className="text-[8px] font-bold text-orange-500 uppercase">Mangkir</span>
        </div>
        <div className="card p-3 bg-red-50 border-red-100 flex flex-col items-center">
          <span className="text-lg font-black text-red-600">{stats.absent}</span>
          <span className="text-[8px] font-bold text-red-500 uppercase">Absen</span>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : historyList.length === 0 ? (
          <p className="text-center text-slate-400 py-10">No records found for this month.</p>
        ) : historyList.map((item, idx) => (
          <div 
            key={idx} 
            onClick={() => handleDayClick(item)}
            className={`card p-4 flex items-center gap-4 group active:scale-[0.98] transition-all cursor-pointer hover:border-primary/30 ${
              item.status === 'Absent' ? 'border-red-100 bg-red-50/10' : ''
            }`}
          >
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
                  item.status === 'Mangkir' ? 'text-orange-500' :
                  item.status === 'Absent' ? 'text-red-500' :
                  'text-slate-400'
                }`}>
                  {item.status}
                </span>
                {item.status === 'Present' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                {item.status === 'Late' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                {item.status === 'Mangkir' && <AlertCircle className="w-3.5 h-3.5 text-orange-500" />}
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
        </>
      ) : (
        <div className="space-y-4">
          {leaveLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
          ) : leaveList.length === 0 ? (
            <div className="text-center py-16 opacity-50 space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">No leave records found</p>
            </div>
          ) : (
            leaveList.map((leave, idx) => (
              <div key={idx} className="card p-6 border-slate-100 hover:border-primary/20 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      leave.type === 'Sakit' ? 'bg-rose-50 text-rose-500' :
                      leave.type === 'Cuti' ? 'bg-primary/10 text-primary' :
                      'bg-amber-50 text-amber-500'
                    }`}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{leave.type}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Submitted on {new Date(leave.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                    leave.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    leave.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    'bg-rose-50 text-rose-600 border border-rose-100'
                  }`}>
                    {leave.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl mb-4">
                  <div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">From</p>
                    <p className="text-xs font-bold text-slate-700">{new Date(leave.startDate).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Until</p>
                    <p className="text-xs font-bold text-slate-700">{new Date(leave.endDate).toLocaleDateString()}</p>
                  </div>
                </div>

                {leave.reason && (
                  <p className="text-xs text-slate-500 italic px-1">"{leave.reason}"</p>
                )}
                
                {leave.reviewNote && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reviewer Note</p>
                    <p className="text-xs text-slate-600">{leave.reviewNote}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Correction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                  <HistoryIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Request Correction</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Date: {selectedDay?.day} {monthName}</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <XCircle className="w-5 h-5 text-slate-300" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, type: 'IN'})}
                  className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    formData.type === 'IN' ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  Check In
                </button>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, type: 'OUT'})}
                  className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    formData.type === 'OUT' ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  Check Out
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Requested Time</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="time"
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                    value={formData.requestedTime}
                    onChange={(e) => setFormData({...formData, requestedTime: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Reason / Note</label>
                <div className="relative">
                  <MessageSquare className="absolute left-4 top-4 w-4 h-4 text-slate-300" />
                  <textarea 
                    required
                    placeholder="e.g., GPS issue, forgot to scan..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all min-h-[100px] resize-none"
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 text-sm font-black text-slate-400 hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={correctionMutation.isPending}
                  className="flex-[2] py-4 bg-primary text-white text-sm font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all disabled:opacity-50"
                >
                  {correctionMutation.isPending ? 'Sending...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
