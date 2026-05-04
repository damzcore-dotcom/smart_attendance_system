import { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  FileText, 
  Send, 
  ChevronLeft,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authAPI, correctionAPI } from '../../services/api';

const Correction = () => {
  const navigate = useNavigate();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const [formData, setFormData] = useState({
    date: '',
    type: 'In',
    time: '',
    reason: ''
  });

  const mutation = useMutation({
    mutationFn: (data) => correctionAPI.create({ ...data, employeeId: empId }),
    onSuccess: () => {
      alert('Correction request submitted successfully!');
      navigate('/employee');
    },
    onError: (err) => alert(err.message || 'Failed to submit request'),
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
    </div>
  );
};

export default Correction;
