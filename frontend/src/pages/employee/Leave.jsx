import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { getStatusLabel, getStatusColor } from '../../utils/statusUtils';

const Leave = () => {
  const { t, i18n } = useTranslation();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'Cuti',
    reason: '',
    medicalAttachment: null
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

  const getLeaveTypeTranslation = (type) => {
    switch (type) {
      case 'Cuti': return t('employee.leavePage.typeLeave');
      case 'Sakit': return t('employee.leavePage.typeSick');
      case 'Izin': return t('employee.leavePage.typePermit');
      case 'Dispensasi': return t('employee.leavePage.typeDispensation');
      default: return type;
    }
  };

  const leaveMutation = useMutation({
    mutationFn: (data) => leaveAPI.create(data),
    onSuccess: () => {
      showToast(t('employee.leavePage.toastSubmitSuccess'), 'success');
      setIsModalOpen(false);
      setFormData({ startDate: '', endDate: '', type: 'Cuti', reason: '', medicalAttachment: null });
      queryClient.invalidateQueries({ queryKey: ['leave-requests', empId] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => showToast(err.message || t('employee.leavePage.toastSubmitError'), 'error')
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => leaveAPI.cancel(id),
    onSuccess: () => {
      showToast(t('employee.leavePage.toastCancelSuccess'), 'success');
      queryClient.invalidateQueries({ queryKey: ['leave-requests', empId] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => showToast(err.message || t('employee.leavePage.toastCancelError'), 'error')
  });

  const handleCancel = (id) => {
    if (window.confirm(t('employee.leavePage.cancelConfirm'))) {
      cancelMutation.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    leaveMutation.mutate({ ...formData, employeeId: empId });
  };

  const list = requests?.data || [];
  const emp = userData?.user?.employee || user?.employee || {};
  const remainingLeave = emp.remainingLeave ?? 0;
  const leaveQuota = emp.leaveQuota ?? 12;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('employee.leavePage.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t('employee.leavePage.subtitle')}</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-12 h-12 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center active:scale-95 transition-all hover:bg-blue-700"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Leave Quota Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[2rem] text-white shadow-xl shadow-blue-600/10 relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1.5">{t('employee.leavePage.quota')}</p>
            <h2 className="text-3xl font-black tracking-tight">
              {remainingLeave} <span className="text-sm font-medium text-blue-200">{t('employee.leavePage.quotaOf', { total: leaveQuota })}</span>
            </h2>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="absolute bottom-[-30px] right-[-30px] w-36 h-36 bg-white/5 rounded-full blur-2xl" />
      </div>

      {/* History List */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">{t('employee.leavePage.history')}</h2>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : list.length === 0 ? (
          <div className="bg-white p-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-2xl">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 border border-slate-200">
              <Calendar className="w-8 h-8" />
            </div>
            <p className="text-sm text-slate-400">{t('employee.leavePage.noHistory')}</p>
          </div>
        ) : list.map((item) => (
          <div key={item.id} className="bg-white p-6 group animate-in slide-in-from-bottom-4 duration-500 border border-slate-200 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-300 ${getStatusColor(item.type)}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{getLeaveTypeTranslation(item.type)}</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{t('employee.leavePage.filed')}: {new Date(item.createdAt).toLocaleDateString(i18n.language)}</p>
                </div>
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${
                item.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                item.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {item.status}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4">
              <div className="space-y-0.5">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{t('employee.leavePage.startDate')}</p>
                <p className="text-sm font-bold text-slate-800">{new Date(item.startDate).toLocaleDateString(i18n.language)}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{t('employee.leavePage.endDate')}</p>
                <p className="text-sm font-bold text-slate-800">{new Date(item.endDate).toLocaleDateString(i18n.language)}</p>
              </div>
            </div>

            {item.reason && (
              <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-500 italic leading-relaxed">"{item.reason}"</p>
              </div>
            )}

            {item.status === 'PENDING' && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => handleCancel(item.id)}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-500 hover:text-red-700 disabled:opacity-50 transition-all rounded-xl text-xs font-semibold active:scale-[0.98]"
                >
                  {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin text-red-600" /> : t('employee.leavePage.cancelRequest')}
                </button>
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
                  <h3 className="text-base font-bold text-slate-800">{t('employee.leavePage.newTitle')}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t('employee.leavePage.fillDetails')}</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">{t('employee.leavePage.type')}</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Cuti', 'Sakit', 'Izin'].map(tVal => (
                    <button
                      key={tVal}
                      type="button"
                      onClick={() => setFormData({...formData, type: tVal})}
                      className={`py-3 rounded-xl text-sm font-semibold border transition-all duration-300 ${
                        formData.type === tVal ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {getLeaveTypeTranslation(tVal)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">{t('employee.leavePage.startDate')}</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">{t('employee.leavePage.endDate')}</label>
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
                <label className="text-xs font-semibold text-slate-500">{t('employee.leavePage.reason')}</label>
                <textarea 
                  required
                  placeholder={t('employee.leavePage.reasonPlaceholder')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all min-h-[100px] resize-none placeholder:text-slate-400"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                />
              </div>

              {formData.type === 'Sakit' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
                  <label className="text-xs font-semibold text-slate-500">{t('employee.leavePage.attachment')}</label>
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
                            <p className="text-white text-xs font-semibold">{t('employee.leavePage.viewAttachment')}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 p-6 text-slate-400 group-hover:text-blue-500 transition-colors">
                          <Plus className="w-6 h-6" />
                          <p className="text-xs font-semibold">{t('employee.leavePage.attachment')}</p>
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
                  {t('employee.leavePage.cancel')}
                </button>
                <button 
                  type="submit"
                  disabled={leaveMutation.isPending}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 transition-all shadow-sm active:scale-[0.98]"
                >
                  {leaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('employee.leavePage.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default Leave;
