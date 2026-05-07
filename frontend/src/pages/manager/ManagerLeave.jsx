import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Search,
  Filter,
  Loader2,
  Check,
  X,
  MessageSquare
} from 'lucide-react';
import { managerAPI } from '../../services/api';

const ManagerLeave = () => {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  const { data: leaveRequests, isLoading } = useQuery({
    queryKey: ['manager-leave-requests'],
    queryFn: () => managerAPI.getLeaveRequests(),
  });

  const mutation = useMutation({
    mutationFn: ({ id, status, reviewNote }) => managerAPI.updateLeaveRequest(id, status, reviewNote),
    onSuccess: () => {
      queryClient.invalidateQueries(['manager-leave-requests']);
      setSelectedRequest(null);
      setReviewNote('');
      alert('Berhasil memperbarui pengajuan cuti');
    },
    onError: (err) => {
      alert('Gagal: ' + err.message);
    }
  });

  const pendingRequests = leaveRequests?.data?.filter(r => r.status === 'PENDING') || [];
  const recentHistory = leaveRequests?.data?.filter(r => r.status !== 'PENDING').slice(0, 5) || [];

  const handleReview = (status) => {
    if (!selectedRequest) return;
    mutation.mutate({
      id: selectedRequest.id,
      status,
      reviewNote
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-slate-500 font-medium">Memuat pengajuan cuti...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leave Approvals</h1>
        <p className="text-slate-500 mt-1">Review and manage team leave requests</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending Approvals */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Pending Approvals
              <span className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full text-[10px]">
                {pendingRequests.length}
              </span>
            </h2>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-100">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-500 font-medium">Semua pengajuan telah diproses</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingRequests.map((request) => (
                <button
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className={`text-left p-6 rounded-3xl border-2 transition-all duration-300 ${
                    selectedRequest?.id === request.id
                      ? 'bg-white border-primary shadow-xl shadow-primary/10'
                      : 'bg-white border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${request.username}`} alt="avatar" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="font-bold text-slate-900 truncate">{request.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                              {request.nik}
                            </span>
                            <span className="text-[10px] font-bold text-blue-500 uppercase">
                              {request.section}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400">
                          {new Date(request.startDate).toLocaleDateString('id-ID')} - {new Date(request.endDate).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">{request.type}</p>
                      <p className="text-sm text-slate-500 line-clamp-2 bg-slate-50 p-3 rounded-xl italic">
                        "{request.reason}"
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Panel */}
        <div className="space-y-8">
          <div className="card p-6 space-y-6 sticky top-8">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              Review Action
            </h3>

            {selectedRequest ? (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                {selectedRequest.type === 'Sakit' && selectedRequest.medicalAttachment && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Bukti Medis / Surat Dokter</label>
                    <div className="relative group overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                      <img 
                        src={selectedRequest.medicalAttachment} 
                        alt="Medical Attachment" 
                        className="w-full h-auto max-h-48 object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-105"
                        onClick={() => window.open(selectedRequest.medicalAttachment, '_blank')}
                      />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <p className="text-white text-[10px] font-bold">Klik untuk Lihat Detail</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-500 block ml-1">Review Note (Optional)</label>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Tulis alasan persetujuan atau penolakan..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all h-32"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleReview('REJECTED')}
                    disabled={mutation.isPending}
                    className="flex items-center justify-center gap-2 bg-rose-50 text-rose-600 hover:bg-rose-100 py-3 rounded-xl font-bold text-sm transition-all border border-rose-100"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                  <button
                    onClick={() => handleReview('APPROVED')}
                    disabled={mutation.isPending}
                    className="flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                   <CheckCircle2 className="w-8 h-8 text-slate-200" />
                </div>
                <p className="text-sm text-slate-400 font-medium">Select a pending request to review</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Recent History
            </h3>
            <div className="space-y-3">
              {recentHistory.map((history) => (
                <div key={history.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${history.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{history.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {history.nik} • {history.section}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">{history.type} • {new Date(history.startDate).toLocaleDateString('id-ID')}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${history.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {history.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerLeave;
