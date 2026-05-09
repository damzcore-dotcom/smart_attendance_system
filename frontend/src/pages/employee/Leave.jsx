import { useState } from 'react';
import { 
  Calendar, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Plus,
  ArrowRight,
  Loader2,
  AlertCircle,
  Tag
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, leaveAPI } from '../../services/api';

const Leave = () => {
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'Cuti',
    reason: '',
    medicalAttachment: null
  });

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Compress to 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
      };
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const compressed = await compressImage(file);
      setFormData({ ...formData, medicalAttachment: compressed });
    }
  };

  const { data: requests, isLoading } = useQuery({
    queryKey: ['leave-requests', empId],
    queryFn: () => leaveAPI.getByEmployee(empId),
    enabled: !!empId
  });
  
  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const leaveMutation = useMutation({
    mutationFn: (data) => leaveAPI.create(data),
    onSuccess: () => {
      alert('Leave request submitted successfully!');
      setIsModalOpen(false);
      setFormData({ startDate: '', endDate: '', type: 'Cuti', reason: '', medicalAttachment: null });
      queryClient.invalidateQueries(['leave-requests']);
    },
    onError: (err) => alert(`Error: ${err.message}`)
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    leaveMutation.mutate({ ...formData, employeeId: empId });
  };

  const list = requests?.data || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Leave Request</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage your absences</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-12 h-12 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center active:scale-95 transition-all hover:bg-blue-700"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* History List */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Request History</h2>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : list.length === 0 ? (
          <div className="bg-white p-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-2xl">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 border border-slate-200">
              <Calendar className="w-8 h-8" />
            </div>
            <p className="text-sm text-slate-400">No leave records yet</p>
          </div>
        ) : list.map((item) => (
          <div key={item.id} className="bg-white p-6 group animate-in slide-in-from-bottom-4 duration-500 border border-slate-200 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                  item.type === 'Sakit' ? 'bg-rose-50 border-rose-200 text-rose-500' :
                  item.type === 'Izin' ? 'bg-amber-50 border-amber-200 text-amber-500' :
                  'bg-blue-50 border-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                }`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{item.type}</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Filed: {new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${
                item.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {item.status}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4">
              <div className="space-y-0.5">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Start</p>
                <p className="text-sm font-bold text-slate-800">{new Date(item.startDate).toLocaleDateString()}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">End</p>
                <p className="text-sm font-bold text-slate-800">{new Date(item.endDate).toLocaleDateString()}</p>
              </div>
            </div>

            {item.reason && (
              <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-500 italic leading-relaxed">"{item.reason}"</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submission Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white border border-slate-200 shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 rounded-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">New Leave Request</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Fill in the details below</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Leave Type</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Cuti', 'Sakit', 'Izin'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData({...formData, type: t})}
                      className={`py-3 rounded-xl text-sm font-semibold border transition-all duration-300 ${
                        formData.type === t ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">Start Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">End Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Reason</label>
                <textarea 
                  required
                  placeholder="Explain the reason for your leave..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all min-h-[100px] resize-none placeholder:text-slate-400"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                />
              </div>

              {formData.type === 'Sakit' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
                  <label className="text-xs font-semibold text-slate-500">Medical Certificate</label>
                  <div className="relative group">
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="medical-upload"
                      required={formData.type === 'Sakit'}
                    />
                    <label 
                      htmlFor="medical-upload"
                      className="flex flex-col items-center justify-center w-full min-h-[120px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all overflow-hidden relative group"
                    >
                      {formData.medicalAttachment ? (
                        <div className="relative w-full h-full p-2">
                          <img 
                            src={formData.medicalAttachment} 
                            alt="Preview" 
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <p className="text-white text-xs font-semibold">Change File</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 p-6 text-slate-400 group-hover:text-blue-500 transition-colors">
                          <Plus className="w-6 h-6" />
                          <p className="text-xs font-semibold">Upload Certificate</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

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
                  disabled={leaveMutation.isPending}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 transition-all shadow-sm active:scale-[0.98]"
                >
                  {leaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leave;
