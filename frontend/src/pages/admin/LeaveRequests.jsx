import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveAPI, employeeAPI } from '../../services/api';
import { 
  Calendar, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  FileText,
  User,
  Filter,
  X,
  Loader2,
  ChevronRight
} from 'lucide-react';

const AdminLeaveRequests = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewData, setReviewData] = useState({ status: '', note: '' });
  const [isMassLeaveModalOpen, setMassLeaveModalOpen] = useState(false);
  const [massLeaveData, setMassLeaveData] = useState({ 
    startDate: '', 
    endDate: '', 
    type: 'Holiday', 
    reason: '', 
    deductQuota: false 
  });
  const [activeMassTab, setActiveMassTab] = useState('Apply'); // 'Apply' or 'History'

  const { data: optionsData } = useQuery({
    queryKey: ['employee-master-options'],
    queryFn: () => employeeAPI.getMasterOptions(),
  });
  const departments = optionsData?.data?.departments || [];

  const { data: requests, isLoading } = useQuery({
    queryKey: ['admin-leave-requests', statusFilter, searchQuery, deptFilter],
    queryFn: () => leaveAPI.getAll({ status: statusFilter, search: searchQuery, dept: deptFilter }),
  });

  const { data: massLeavesData } = useQuery({
    queryKey: ['mass-leaves'],
    queryFn: () => leaveAPI.getMassLeaves(),
    enabled: isMassLeaveModalOpen
  });
  const massLeaves = massLeavesData?.data || [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, data }) => leaveAPI.review(id, data),
    onSuccess: () => {
      alert('Request processed successfully!');
      setSelectedRequest(null);
      setReviewData({ status: '', note: '' });
      queryClient.invalidateQueries(['admin-leave-requests']);
      queryClient.invalidateQueries(['attendance']); // Invalidate attendance as it might have been updated
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const massLeaveMutation = useMutation({
    mutationFn: (data) => leaveAPI.massApply(data),
    onSuccess: (res) => {
      alert(res.message);
      setMassLeaveModalOpen(false);
      setMassLeaveData({ startDate: '', endDate: '', type: 'Holiday', reason: '', deductQuota: false });
      queryClient.invalidateQueries(['admin-leave-requests']);
      queryClient.invalidateQueries(['attendance']);
    },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const handleReview = (status) => {
    reviewMutation.mutate({ 
      id: selectedRequest.id, 
      data: { status, reviewNote: reviewData.note } 
    });
  };

  const list = requests?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Requests</h1>
          <p className="text-slate-500 mt-1">Review and manage employee time-off applications.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setMassLeaveModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Calendar className="w-4 h-4 text-primary" />
            Manage Mass Leave
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            {['PENDING', 'APPROVED', 'REJECTED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === status 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id || d.name} value={d.name}>{d.name}</option>
              ))}
            </select>

            <div className="relative w-full max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="card shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/95 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-6 py-4 border-b border-slate-100">Employee</th>
                <th className="px-6 py-4 border-b border-slate-100">Type</th>
                <th className="px-6 py-4 border-b border-slate-100">Period</th>
                <th className="px-6 py-4 border-b border-slate-100">Reason</th>
                <th className="px-6 py-4 border-b border-slate-100">Submitted</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr><td colSpan="6" className="text-center py-10"><Loader2 className="animate-spin inline-block mr-2" /> Loading...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-10 text-slate-400">No requests found.</td></tr>
              ) : list.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-primary font-bold border border-slate-200">
                        {item.employeeName[0].toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 text-sm block">{item.employeeName}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.dept}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                      item.type === 'Sakit' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                      item.type === 'Izin' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <span>{new Date(item.startDate).toLocaleDateString()}</span>
                      <ChevronRight className="w-3 h-3 text-slate-300" />
                      <span>{new Date(item.endDate).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-slate-500 max-w-xs truncate italic">"{item.reason}"</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.status === 'PENDING' ? (
                      <button 
                        onClick={() => setSelectedRequest(item)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                      >
                        Review
                      </button>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                        item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                      }`}>
                        {item.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => setSelectedRequest(null)} />
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 shadow-sm">
                  <FileText className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Review Leave Request</h3>
                  <p className="text-xs text-slate-400 font-medium">Evaluate the employee's time-off application</p>
                </div>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 text-primary">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Employee</span>
                    <span className="text-sm font-bold text-slate-700">{selectedRequest.employeeName}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Period</span>
                    <span className="text-xs font-bold text-slate-600">{new Date(selectedRequest.startDate).toLocaleDateString()} - {new Date(selectedRequest.endDate).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Type</span>
                    <span className="text-xs font-bold text-slate-600">{selectedRequest.type}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Reason</span>
                  <p className="text-xs text-slate-600 italic leading-relaxed">"{selectedRequest.reason}"</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Admin Note (Optional)</label>
                <textarea 
                  placeholder="Explain why approved or rejected..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all min-h-[100px] resize-none"
                  value={reviewData.note}
                  onChange={(e) => setReviewData({...reviewData, note: e.target.value})}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => handleReview('REJECTED')}
                  disabled={reviewMutation.isPending}
                  className="flex-1 py-4 border border-rose-200 text-rose-600 text-sm font-black rounded-2xl hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button 
                  onClick={() => handleReview('APPROVED')}
                  disabled={reviewMutation.isPending}
                  className="flex-1 py-4 bg-emerald-600 text-white text-sm font-black rounded-2xl shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mass Leave Modal */}
      {isMassLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => !massLeaveMutation.isPending && setMassLeaveModalOpen(false)} />
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg relative z-10 overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center border border-primary/10 shadow-sm">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Mass Leave Management</h3>
                  <p className="text-xs text-slate-400 font-medium">Apply or view mass leave history</p>
                </div>
              </div>
              <button onClick={() => !massLeaveMutation.isPending && setMassLeaveModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="px-8 pt-4">
              <div className="flex gap-4 border-b border-slate-100">
                {['Apply', 'History'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveMassTab(tab)}
                    className={`pb-3 text-xs font-bold transition-all relative ${
                      activeMassTab === tab ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab}
                    {activeMassTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8">
              {activeMassTab === 'Apply' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
                      <input 
                        type="date" 
                        value={massLeaveData.startDate}
                        onChange={(e) => setMassLeaveData({...massLeaveData, startDate: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
                      <input 
                        type="date" 
                        value={massLeaveData.endDate}
                        onChange={(e) => setMassLeaveData({...massLeaveData, endDate: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                      <select 
                        value={massLeaveData.type}
                        onChange={(e) => setMassLeaveData({...massLeaveData, type: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                      >
                        <option value="Holiday">Holiday (Libur Nasional)</option>
                        <option value="Cuti">Cuti Bersama (Potong Jatah)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3 pt-6 px-2">
                      <input 
                        type="checkbox"
                        id="deductQuota"
                        checked={massLeaveData.deductQuota}
                        onChange={(e) => setMassLeaveData({...massLeaveData, deductQuota: e.target.checked})}
                        className="w-5 h-5 rounded-lg text-primary border-slate-200 focus:ring-primary/20 transition-all cursor-pointer"
                      />
                      <label htmlFor="deductQuota" className="text-xs font-bold text-slate-600 cursor-pointer">Potong Jatah Cuti?</label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Reason / Event Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Libur Hari Raya Lebaran 2026"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                      value={massLeaveData.reason}
                      onChange={(e) => setMassLeaveData({...massLeaveData, reason: e.target.value})}
                    />
                  </div>

                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                      <b>PENTING:</b> Tindakan ini akan membuat data kehadiran <b>seluruh karyawan aktif</b>.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setMassLeaveModalOpen(false)}
                      disabled={massLeaveMutation.isPending}
                      className="flex-1 py-4 border border-slate-200 text-slate-500 text-sm font-black rounded-2xl hover:bg-slate-50 transition-all"
                    >
                      Batal
                    </button>
                    <button 
                      onClick={() => massLeaveMutation.mutate(massLeaveData)}
                      disabled={massLeaveMutation.isPending || !massLeaveData.startDate || !massLeaveData.endDate || !massLeaveData.reason}
                      className="flex-1 py-4 bg-slate-900 text-white text-sm font-black rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {massLeaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                      Terapkan Masal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                  {massLeaves.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">Belum ada riwayat cuti massal.</div>
                  ) : massLeaves.map((leave) => (
                    <div key={leave.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-primary/20 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                          leave.type === 'Holiday' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
                        }`}>
                          {leave.type}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">{new Date(leave.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">{leave.reason}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(leave.startDate).toLocaleDateString()}</span>
                        <ChevronRight className="w-3 h-3 text-slate-300" />
                        <span>{new Date(leave.endDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLeaveRequests;
