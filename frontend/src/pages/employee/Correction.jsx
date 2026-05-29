import { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  FileText, 
  Send, 
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authAPI, correctionAPI } from '../../services/api';

const Correction = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    date: '',
    type: 'In',
    time: '',
    reason: ''
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['correction-history', empId],
    queryFn: () => correctionAPI.getByEmployee(empId),
    enabled: !!empId,
  });

  const historyList = historyData?.data || [];

  const mutation = useMutation({
    mutationFn: (data) => correctionAPI.create({ ...data, employeeId: empId }),
    onSuccess: () => {
      showToast('Correction request submitted successfully!', 'success');
      setFormData({
        date: '',
        type: 'In',
        time: '',
        reason: ''
      });
      queryClient.invalidateQueries({ queryKey: ['correction-history', empId] });
    },
    onError: (err) => showToast(err.message || 'Failed to submit request', 'error'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...formData,
      requestedTime: formData.time // Map 'time' to 'requestedTime' if needed by backend
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/employee')}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-slate-800">Request Correction</h1>
      </div>

      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          Requests are subject to HR approval. Please provide a valid reason for the correction.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Correction Date</label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="date" 
                  required
                  value={formData.date}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Correction Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, type: 'In'})}
                  className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                    formData.type === 'In' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-50 bg-slate-50 text-slate-500'
                  }`}
                >
                  Check In
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, type: 'Out'})}
                  className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                    formData.type === 'Out' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-50 bg-slate-50 text-slate-500'
                  }`}
                >
                  Check Out
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Actual Time</label>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="time" 
                  required
                  value={formData.time}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={(e) => setFormData({...formData, time: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Reason for Correction</label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <textarea 
                required
                value={formData.reason}
                placeholder="Ex: Forgot to check in due to urgent meeting..."
                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[120px]"
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
              ></textarea>
            </div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={mutation.isPending}
          className="w-full btn-primary py-4 rounded-2xl font-bold text-lg shadow-xl shadow-primary/25 active:scale-95 transition-transform flex items-center justify-center gap-3 disabled:opacity-70"
        >
          {mutation.isPending ? <Loader2 className="animate-spin" /> : (
            <>
              <Send className="w-5 h-5" />
              Submit Request
            </>
          )}
        </button>
      </form>

      {/* Riwayat Koreksi Section */}
      <div className="space-y-4 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider px-1">Riwayat Koreksi</h3>
        
        {historyLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : historyList.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50">
            <p className="text-xs text-slate-400">Belum ada riwayat pengajuan koreksi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyList.map((item) => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 hover:border-blue-200 transition-all duration-300 animate-in fade-in duration-300">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                      item.type === 'In' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}>
                      Check {item.type}
                    </span>
                    <p className="text-[10px] font-medium text-slate-400 mt-2">Diajukan: {new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wider ${
                    item.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {item.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Tanggal Koreksi</span>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{item.date}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Jam</span>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{item.time}</p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block mb-1">Alasan</span>
                  <p className="text-xs text-slate-600 leading-relaxed italic">"{item.reason}"</p>
                </div>

                {item.reviewNote && (
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-[9px] text-blue-600 uppercase font-bold tracking-wider block mb-1">Catatan Reviewer</span>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="text-xs text-slate-700 leading-relaxed">{item.reviewNote}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-2xl shadow-xl z-50 transition-all duration-300 flex items-center gap-2 border text-sm font-semibold animate-in fade-in slide-in-from-bottom-4 ${
          toast.type === 'error' 
            ? 'bg-rose-50 text-rose-700 border-rose-200' 
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Correction;
