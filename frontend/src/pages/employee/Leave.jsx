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
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center px-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Leave Management</h1>
          <p className="text-xs text-slate-400 mt-1">Submit and track your time-off requests.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 flex items-center gap-2 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* History List */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Request History</h2>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : list.length === 0 ? (
          <div className="card p-10 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/50 border-dashed">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-200">
              <Calendar className="w-8 h-8" />
            </div>
            <p className="text-slate-400 text-sm font-medium">No leave requests found.</p>
          </div>
        ) : list.map((item) => (
          <div key={item.id} className="card p-5 group animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  item.type === 'Sakit' ? 'bg-rose-50 text-rose-500' :
                  item.type === 'Izin' ? 'bg-amber-50 text-amber-500' :
                  'bg-blue-50 text-blue-500'
                }`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{item.type}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                item.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                'bg-rose-50 text-rose-600 border-rose-100'
              }`}>
                {item.status}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl mb-4">
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">From</p>
                <p className="text-xs font-bold text-slate-700">{new Date(item.startDate).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Until</p>
                <p className="text-xs font-bold text-slate-700">{new Date(item.endDate).toLocaleDateString()}</p>
              </div>
            </div>

            {item.reason && (
              <p className="text-xs text-slate-500 italic px-1 line-clamp-2">"{item.reason}"</p>
            )}
          </div>
        ))}
      </div>

      {/* Submission Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="font-black text-slate-800 text-sm">Ajukan Cuti / Izin</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <XCircle className="w-5 h-5 text-slate-300" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Tipe Pengajuan</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cuti', 'Sakit', 'Izin'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData({...formData, type: t})}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        formData.type === t ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Mulai</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Berakhir</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Alasan / Keperluan</label>
                <textarea 
                  required
                  placeholder="Jelaskan alasan Anda..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all min-h-[80px] resize-none"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                />
              </div>

              {formData.type === 'Sakit' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Surat Dokter / Resep</label>
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
                      className="flex flex-col items-center justify-center w-full min-h-[120px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 hover:border-primary/30 transition-all overflow-hidden"
                    >
                      {formData.medicalAttachment ? (
                        <div className="relative w-full h-full p-2">
                          <img 
                            src={formData.medicalAttachment} 
                            alt="Preview" 
                            className="w-full h-32 object-cover rounded-xl"
                          />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                            <p className="text-white text-[10px] font-bold">Ganti Foto</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 p-4 text-slate-400">
                          <Plus className="w-6 h-6" />
                          <p className="text-[10px] font-bold uppercase tracking-widest">Klik untuk Upload</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 text-sm font-black text-slate-400 hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={leaveMutation.isPending}
                  className="flex-[2] py-4 bg-primary text-white text-sm font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all disabled:opacity-50"
                >
                  {leaveMutation.isPending ? 'Mengirim...' : 'Kirim Pengajuan'}
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
