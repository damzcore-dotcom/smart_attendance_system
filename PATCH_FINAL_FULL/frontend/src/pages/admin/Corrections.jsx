import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { correctionAPI } from '../../services/api';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Filter,
  Search,
  MessageSquare,
  Loader2,
  Edit3
} from 'lucide-react';

const AdminCorrections = () => {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('PENDING');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-corrections', filterStatus],
    queryFn: () => correctionAPI.getAll(filterStatus),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, note }) => correctionAPI.review(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-corrections'] });
      alert('Correction request updated successfully');
    },
    onError: (err) => alert(err.message || 'Failed to update request'),
  });

  const corrections = data?.data || [];

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <Edit3 className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Administrative Oversight</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Data Corrections</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Correction Requests
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              GLOBAL QUEUE
            </div>
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 border border-slate-200 shadow-sm rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Status Filter</label>
            <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              {['PENDING', 'APPROVED', 'REJECTED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
                    filterStatus === status 
                      ? 'bg-white text-blue-600 shadow-sm border border-slate-200 scale-105 relative z-10' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          </div>
        ) : corrections.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-20 text-center flex flex-col items-center gap-4 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              <Edit3 className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">No correction requests found.</p>
          </div>
        ) : corrections.map((item) => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:border-blue-300 hover:shadow-sm transition-all shadow-sm group">
            <div className="flex gap-5">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <span className="font-bold text-blue-600">{item.employeeName[0]}</span>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <h4 className="font-bold text-slate-800 text-base">{item.employeeName}</h4>
                  <span className="text-[9px] bg-slate-50 border border-slate-100 text-slate-500 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider w-fit">{item.dept}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {item.date}</span>
                  <span className="flex items-center gap-1.5 font-bold text-blue-600"><Clock className="w-3.5 h-3.5" /> {item.type}: {item.time}</span>
                </div>
                <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 italic leading-relaxed">
                  "{item.reason}"
                </p>
              </div>
            </div>

            {filterStatus === 'PENDING' && (
              <div className="flex gap-3 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 mt-4 lg:mt-0">
                <button 
                  onClick={() => {
                    const note = prompt('Add a review note (optional):');
                    reviewMutation.mutate({ id: item.id, status: 'REJECTED', note });
                  }}
                  disabled={reviewMutation.isPending}
                  className="flex items-center justify-center gap-2 px-5 py-3 text-rose-600 font-bold text-xs uppercase tracking-wider bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button 
                  onClick={() => {
                    const note = prompt('Add a review note (optional):');
                    reviewMutation.mutate({ id: item.id, status: 'APPROVED', note });
                  }}
                  disabled={reviewMutation.isPending}
                  className="flex items-center justify-center gap-2 px-5 py-3 text-white font-bold text-xs uppercase tracking-wider bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              </div>
            )}

            {filterStatus !== 'PENDING' && (
              <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border ${
                item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
              }`}>
                {item.status}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCorrections;
