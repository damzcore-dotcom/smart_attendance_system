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
  FileText,
  Save
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, attendanceAPI, correctionAPI, leaveAPI } from '../../services/api';

const History = () => {
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('attendance');

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
    if (item.status === 'Libur') return;
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
    if (curr.status === 'Hadir') acc.present++;
    else if (curr.status === 'Terlambat') acc.late++;
    else if (curr.status === 'Mangkir') acc.mangkir++;
    else if (curr.status === 'Tanpa Keterangan (Alpa)') acc.absent++;
    return acc;
  }, { present: 0, late: 0, mangkir: 0, absent: 0 });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-xl font-bold text-slate-800">History</h1>
          <p className="text-xs text-slate-400 mt-0.5">Activity logs</p>
        </div>
        {activeTab === 'attendance' && (
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <CalendarIcon className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex p-1 bg-slate-100 rounded-xl">
        <button 
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 py-3 text-xs font-semibold rounded-lg transition-all duration-300 ${
            activeTab === 'attendance' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Attendance
        </button>
        <button 
          onClick={() => setActiveTab('leave')}
          className={`flex-1 py-3 text-xs font-semibold rounded-lg transition-all duration-300 ${
            activeTab === 'leave' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Leave History
        </button>
      </div>

      {activeTab === 'attendance' ? (
        <>
          {/* Month Selector */}
          <div className="bg-white p-4 flex items-center justify-between border border-slate-200 rounded-2xl shadow-sm">
            <button onClick={handlePrevMonth} className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-700 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-slate-800">{monthName}</span>
            <button onClick={handleNextMonth} className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-700 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Monthly Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white p-4 border border-slate-200 flex flex-col items-center rounded-xl shadow-sm">
              <span className="text-xl font-bold text-emerald-600">{stats.present}</span>
              <span className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wider mt-0.5">Hadir</span>
            </div>
            <div className="bg-white p-4 border border-slate-200 flex flex-col items-center rounded-xl shadow-sm">
              <span className="text-xl font-bold text-amber-600">{stats.late}</span>
              <span className="text-[9px] font-semibold text-amber-500 uppercase tracking-wider mt-0.5">Terlambat</span>
            </div>
            <div className="bg-white p-4 border border-slate-200 flex flex-col items-center rounded-xl shadow-sm">
              <span className="text-xl font-bold text-orange-600">{stats.mangkir}</span>
              <span className="text-[9px] font-semibold text-orange-500 uppercase tracking-wider mt-0.5">Mangkir</span>
            </div>
            <div className="bg-white p-4 border border-slate-200 flex flex-col items-center rounded-xl shadow-sm">
              <span className="text-xl font-bold text-rose-600">{stats.absent}</span>
              <span className="text-[9px] font-semibold text-rose-500 uppercase tracking-wider mt-0.5">Alpa</span>
            </div>
          </div>

          {/* History List */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : historyList.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                <p className="text-sm text-slate-400">No records for this month</p>
              </div>
            ) : historyList.map((item, idx) => (
              <div 
                key={idx} 
                onClick={() => handleDayClick(item)}
                className={`bg-white p-5 flex items-center gap-5 group active:scale-[0.98] transition-all duration-300 cursor-pointer border border-slate-200 hover:border-blue-200 hover:shadow-sm rounded-2xl ${
                  item.status === 'Tanpa Keterangan (Alpa)' ? 'bg-rose-50/50' : ''
                }`}
              >
                <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-all duration-300 ${
                  item.status === 'Libur' ? 'bg-slate-50 border-slate-200 text-slate-400' : 
                  item.status === 'Tanpa Keterangan (Alpa)' ? 'bg-rose-50 border-rose-200 text-rose-500' :
                  'bg-blue-50 border-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                }`}>
                  <span className="text-[9px] font-bold uppercase">{item.weekday}</span>
                  <span className="text-lg font-bold">{item.day}</span>
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${
                      item.status === 'Hadir' ? 'text-emerald-600' :
                      item.status === 'Terlambat' ? 'text-amber-600' :
                      item.status === 'Mangkir' ? 'text-orange-600' :
                      item.status === 'Tanpa Keterangan (Alpa)' ? 'text-rose-600' :
                      'text-slate-400'
                    }`}>
                      {item.status}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {item.status === 'Hadir' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {item.status === 'Terlambat' && <Clock className="w-4 h-4 text-amber-500" />}
                      {item.status === 'Mangkir' && <AlertCircle className="w-4 h-4 text-orange-500" />}
                      {item.status === 'Tanpa Keterangan (Alpa)' && <XCircle className="w-4 h-4 text-rose-500" />}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Check In</span>
                      <p className={`text-sm font-bold ${item.in === '-- : --' ? 'text-slate-300' : 'text-slate-800'}`}>
                        {item.in}
                      </p>
                    </div>
                    <div className="space-y-0.5 text-right">
                      <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Check Out</span>
                      <p className={`text-sm font-bold ${item.out === '-- : --' ? 'text-slate-300' : 'text-slate-800'}`}>
                        {item.out}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {leaveLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : leaveList.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                <AlertCircle className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">No leave records found</p>
            </div>
          ) : (
            leaveList.map((leave, idx) => (
              <div key={idx} className="bg-white p-6 border border-slate-200 hover:border-blue-200 transition-all duration-300 group rounded-2xl shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                      leave.type === 'Sakit' ? 'bg-rose-50 border-rose-200 text-rose-500' :
                      leave.type === 'Cuti' ? 'bg-blue-50 border-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' :
                      'bg-amber-50 border-amber-200 text-amber-500'
                    }`}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800">{leave.type}</h3>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">Filed: {new Date(leave.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${
                    leave.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    leave.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {leave.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Start</p>
                    <p className="text-sm font-bold text-slate-800">{new Date(leave.startDate).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">End</p>
                    <p className="text-sm font-bold text-slate-800">{new Date(leave.endDate).toLocaleDateString()}</p>
                  </div>
                </div>

                {leave.reason && (
                  <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <p className="text-xs text-slate-500 italic leading-relaxed">"{leave.reason}"</p>
                  </div>
                )}
                
                {leave.reviewNote && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-2">Review Note</p>
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-slate-700 leading-relaxed">{leave.reviewNote}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Correction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white border border-slate-200 shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 rounded-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <HistoryIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Correction Request</h3>
                  <p className="text-xs text-slate-400 mt-0.5">For {selectedDay?.day} {monthName}</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, type: 'IN'})}
                  className={`py-3.5 rounded-xl text-sm font-semibold border transition-all duration-300 ${
                    formData.type === 'IN' ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  Check In
                </button>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, type: 'OUT'})}
                  className={`py-3.5 rounded-xl text-sm font-semibold border transition-all duration-300 ${
                    formData.type === 'OUT' ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  Check Out
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Requested Time</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="time"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
                    value={formData.requestedTime}
                    onChange={(e) => setFormData({...formData, requestedTime: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Reason</label>
                <div className="relative">
                  <MessageSquare className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
                  <textarea 
                    required
                    placeholder="Explain why this correction is needed..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all min-h-[100px] resize-none placeholder:text-slate-400"
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors bg-slate-50 rounded-xl border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={correctionMutation.isPending}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 transition-all shadow-sm active:scale-[0.98]"
                >
                  {correctionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Submit
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
