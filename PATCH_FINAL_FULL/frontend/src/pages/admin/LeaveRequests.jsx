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
  const [activeMassTab, setActiveMassTab] = useState('Apply');

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
      queryClient.invalidateQueries(['attendance']); 
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
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <FileText className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Administrative Oversight</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Leave Protocols</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            Leave Requests
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              GLOBAL QUEUE
            </div>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => setMassLeaveModalOpen(true)}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 px-6 py-3 rounded-xl text-xs font-bold text-slate-700 uppercase tracking-wider transition-all shadow-sm active:scale-95"
          >
            <Calendar className="w-4 h-4 text-blue-600" />
            MASS LEAVE PROTOCOL
          </button>
        </div>
      </div>

      {/* Filter Matrix */}
      <div className="bg-white p-8 border border-slate-200 shadow-sm rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-8">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Protocol Status Filter</label>
            <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              {['PENDING', 'APPROVED', 'REJECTED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
                    statusFilter === status 
                      ? 'bg-white text-blue-600 shadow-sm border border-slate-200 scale-105 relative z-10' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-5 w-full lg:w-auto">
            <div className="space-y-3 min-w-[200px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Unit Scope</label>
              <div className="relative">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none transition-all shadow-sm"
                >
                  <option value="All">All Departments</option>
                  {departments.map(d => (
                    <option key={d.id || d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="space-y-3 flex-1 lg:flex-none lg:min-w-[280px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Personnel Search</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search name or ID..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Request Queue */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Request Stream <span className="text-slate-300 mx-3">|</span> 
              Active Entries: <span className="text-slate-800 ml-1 font-black">{list.length}</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-white text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="px-8 py-5 font-bold">Personnel Identity</th>
                <th className="px-6 py-5 font-bold">Protocol Type</th>
                <th className="px-6 py-5 font-bold">Temporal Range</th>
                <th className="px-6 py-5 font-bold">Justification</th>
                <th className="px-6 py-5 font-bold">Transmission Stamp</th>
                <th className="px-8 py-5 font-bold text-right">Operational Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-24">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider animate-pulse">Syncing Request Relays...</p>
                    </div>
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-24">
                    <div className="flex flex-col items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                        <FileText className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Zero Protocol Requests</p>
                    </div>
                  </td>
                </tr>
              ) : list.map((item) => (
                <tr key={item.id} className="group transition-all duration-200 hover:bg-slate-50/50">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all">
                        {item.employeeName[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors uppercase">{item.employeeName}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{item.dept}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                      item.type === 'Sakit' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                      item.type === 'Izin' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      'bg-blue-50 text-blue-600 border-blue-200'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <span>{new Date(item.startDate).toLocaleDateString()}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      <span>{new Date(item.endDate).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-slate-600 max-w-xs truncate italic font-medium">"{item.reason}"</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    {item.status === 'PENDING' ? (
                      <button 
                        onClick={() => setSelectedRequest(item)}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95"
                      >
                        REVIEW
                      </button>
                    ) : (
                      <span className={`inline-flex items-center px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                        item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
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

      {/* Protocol Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedRequest(null)} />
          <div className="bg-white w-full max-w-xl relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Protocol Review</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Personnel Time-Off Audit</p>
                </div>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-slate-200 text-blue-600 shadow-sm">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Authenticated Personnel</span>
                    <span className="text-base font-bold text-slate-800 uppercase tracking-tight">{selectedRequest.employeeName}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 border-t border-slate-200 pt-6">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Temporal Window</span>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{new Date(selectedRequest.startDate).toLocaleDateString()} — {new Date(selectedRequest.endDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Protocol Type</span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      selectedRequest.type === 'Sakit' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                      selectedRequest.type === 'Izin' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      'bg-blue-50 text-blue-600 border-blue-200'
                    }`}>
                      {selectedRequest.type}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Submission Justification</span>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 italic">
                    <p className="text-sm text-slate-600 leading-relaxed">"{selectedRequest.reason}"</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Administrative Annotation (Optional)</label>
                <textarea 
                  placeholder="Decision rationale..."
                  className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all min-h-[100px] resize-none placeholder:text-slate-400 shadow-sm"
                  value={reviewData.note}
                  onChange={(e) => setReviewData({...reviewData, note: e.target.value})}
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={() => handleReview('REJECTED')}
                  disabled={reviewMutation.isPending}
                  className="flex-1 py-4 border border-rose-200 text-rose-600 bg-rose-50 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-rose-100 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <XCircle className="w-4 h-4" /> DENY
                </button>
                <button 
                  onClick={() => handleReview('APPROVED')}
                  disabled={reviewMutation.isPending}
                  className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> AUTHORIZE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mass Protocol Modal */}
      {isMassLeaveModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !massLeaveMutation.isPending && setMassLeaveModalOpen(false)} />
          <div className="bg-white w-full max-w-2xl relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Mass Protocol Deploy</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Global Attendance Override</p>
                </div>
              </div>
              <button onClick={() => !massLeaveMutation.isPending && setMassLeaveModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="px-8 pt-5">
              <div className="flex gap-8 border-b border-slate-200">
                {['Apply', 'History'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveMassTab(tab)}
                    className={`pb-4 text-[11px] font-bold uppercase tracking-wider transition-all relative ${
                      activeMassTab === tab ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab} DEPLOYMENT
                    {activeMassTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full shadow-sm" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8">
              {activeMassTab === 'Apply' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Start Date</label>
                      <input 
                        type="date" 
                        value={massLeaveData.startDate}
                        onChange={(e) => setMassLeaveData({...massLeaveData, startDate: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">End Date</label>
                      <input 
                        type="date" 
                        value={massLeaveData.endDate}
                        onChange={(e) => setMassLeaveData({...massLeaveData, endDate: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-5 items-center">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Type</label>
                      <div className="relative">
                        <select 
                          value={massLeaveData.type}
                          onChange={(e) => setMassLeaveData({...massLeaveData, type: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none transition-all shadow-sm"
                        >
                          <option value="Holiday">National Holiday</option>
                          <option value="Cuti">Mass Leave (Quota)</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Filter className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-6">
                      <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer transition-all hover:bg-slate-100">
                        <input 
                          type="checkbox"
                          checked={massLeaveData.deductQuota}
                          onChange={(e) => setMassLeaveData({...massLeaveData, deductQuota: e.target.checked})}
                          className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Deduct Quota</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Reason / Event Identifier</label>
                    <input 
                      type="text"
                      placeholder="e.g. Eid al-Fitr 2026"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
                      value={massLeaveData.reason}
                      onChange={(e) => setMassLeaveData({...massLeaveData, reason: e.target.value})}
                    />
                  </div>

                  <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 flex gap-4">
                    <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                      This deployment will overwrite attendance records for all active personnel within the specified dates.
                    </p>
                  </div>

                  <div className="flex gap-4 pt-4 border-t border-slate-100">
                    <button 
                      onClick={() => setMassLeaveModalOpen(false)}
                      disabled={massLeaveMutation.isPending}
                      className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl uppercase tracking-wider transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => massLeaveMutation.mutate(massLeaveData)}
                      disabled={massLeaveMutation.isPending || !massLeaveData.startDate || !massLeaveData.endDate || !massLeaveData.reason}
                      className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      {massLeaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                      Execute Global Override
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {massLeaves.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 mx-auto mb-4">
                        <Calendar className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Zero Deployment History</p>
                    </div>
                  ) : massLeaves.map((leave) => (
                    <div key={leave.id} className="bg-white rounded-xl p-5 border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                          leave.type === 'Holiday' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-orange-50 text-orange-600 border border-orange-100'
                        }`}>
                          {leave.type}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{new Date(leave.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight mb-2 group-hover:text-blue-600 transition-colors">{leave.reason}</h4>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
