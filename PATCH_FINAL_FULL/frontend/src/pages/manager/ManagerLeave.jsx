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
  MessageSquare,
  FileText,
  FileCheck
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
      alert('Success: Leave request processed.');
    },
    onError: (err) => {
      alert('Error: ' + err.message);
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
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-sm text-slate-400 font-medium">Loading leave requests...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Leave Approval</h1>
          <p className="text-sm text-slate-500 mt-1">Review and process leave requests</p>
        </div>
        {pendingRequests.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-semibold">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingRequests.length} Pending
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending Request List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Pending Requests
          </h2>

          {pendingRequests.length === 0 ? (
            <div className="bg-white p-16 text-center border border-slate-200 rounded-2xl shadow-sm">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-sm text-slate-500 font-medium">All requests have been processed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingRequests.map((request) => (
                <button
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className={`group text-left p-6 rounded-2xl border transition-all duration-300 ${
                    selectedRequest?.id === request.id
                      ? 'bg-blue-50 border-blue-300 shadow-md'
                      : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 group-hover:scale-105 transition-transform shadow-sm">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${request.username}`} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-base font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">{request.name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                              {request.nik}
                            </span>
                            <span className="text-[10px] font-semibold text-blue-600">
                              {request.section}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-semibold text-slate-400 mb-1">Duration</p>
                          <p className="text-xs font-semibold text-slate-700">
                            {new Date(request.startDate).toLocaleDateString('id-ID')} — {new Date(request.endDate).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                         <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-semibold flex items-center gap-1.5">
                           <FileText className="w-3 h-3" />
                           {request.type}
                         </div>
                      </div>
                      <p className="text-sm text-slate-500 italic leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 group-hover:text-slate-600 transition-colors">
                        "{request.reason}"
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Review Panel */}
        <div className="space-y-6">
          <div className="bg-white p-8 border border-slate-200 rounded-2xl shadow-sm sticky top-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-8">
              Review Panel
            </h3>

            {selectedRequest ? (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                {selectedRequest.type === 'Sakit' && selectedRequest.medicalAttachment && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500">Medical Documentation</label>
                    <div className="relative group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                      <img 
                        src={selectedRequest.medicalAttachment} 
                        alt="Medical Attachment" 
                        className="w-full h-auto max-h-64 object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-105"
                        onClick={() => window.open(selectedRequest.medicalAttachment, '_blank')}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 pointer-events-none">
                        <Search className="w-6 h-6 text-white" />
                        <p className="text-white text-xs font-semibold">Click to enlarge</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">Review Note</label>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Add review notes..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 h-32 resize-none placeholder:text-slate-400 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleReview('REJECTED')}
                    disabled={mutation.isPending}
                    className="flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white py-3.5 rounded-xl font-semibold text-sm transition-all border border-red-200 hover:border-red-600 disabled:opacity-20 active:scale-95"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button
                    onClick={() => handleReview('APPROVED')}
                    disabled={mutation.isPending}
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 py-3.5 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-20 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                   <Clock className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400 font-medium">Select a request to review</p>
              </div>
            )}
          </div>

          {/* History */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              Recent History
            </h3>
            <div className="space-y-2">
              {recentHistory.map((history) => (
                <div key={history.id} className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 hover:shadow-sm transition-all group">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${history.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate group-hover:text-blue-600 transition-colors">{history.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {history.type} • {new Date(history.startDate).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${history.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
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
