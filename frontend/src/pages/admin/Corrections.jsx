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
  Loader2
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Correction Requests</h1>
          <p className="text-slate-500 mt-1">Review and approve attendance adjustments.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex gap-2">
          {['PENDING', 'APPROVED', 'REJECTED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                filterStatus === status ? 'bg-primary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
        ) : corrections.length === 0 ? (
          <div className="card p-20 text-center text-slate-400 font-medium">
            No correction requests found for this status.
          </div>
        ) : corrections.map((item) => (
          <div key={item.id} className="card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-primary/20 transition-colors">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <span className="font-bold text-slate-400">{item.employeeName[0]}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-800">{item.employeeName}</h4>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{item.dept}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {item.date}</span>
                  <span className="flex items-center gap-1 font-bold text-primary"><Clock className="w-3.5 h-3.5" /> {item.type}: {item.time}</span>
                </div>
                <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                  "{item.reason}"
                </p>
              </div>
            </div>

            {filterStatus === 'PENDING' && (
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={() => {
                    const note = prompt('Add a review note (optional):');
                    reviewMutation.mutate({ id: item.id, status: 'REJECTED', note });
                  }}
                  disabled={reviewMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-rose-600 font-bold text-sm bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors disabled:opacity-50"
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
                  className="flex items-center gap-2 px-4 py-2 text-emerald-600 font-bold text-sm bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              </div>
            )}

            {filterStatus !== 'PENDING' && (
              <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${
                item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
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
