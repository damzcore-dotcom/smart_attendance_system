import { useState } from 'react';
import { 
  Megaphone, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Calendar,
  User as UserIcon,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
  X
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementAPI } from '../../services/api';

const Announcements = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'General',
    author: 'HR Administration',
    isActive: true
  });

  const { data: annData, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => announcementAPI.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => announcementAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => announcementAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => announcementAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    }
  });

  const announcements = annData?.data || [];
  const filteredAnnouncements = announcements.filter(a => 
    a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        title: item.title,
        content: item.content,
        type: item.type,
        author: item.author,
        isActive: item.isActive
      });
    } else {
      setEditingItem(null);
      setFormData({
        title: '',
        content: '',
        type: 'General',
        author: 'HR Administration',
        isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'Urgent': return 'bg-rose-50 text-rose-600 border-rose-200';
      case 'Holiday': return 'bg-amber-50 text-amber-600 border-amber-200';
      default: return 'bg-blue-50 text-blue-600 border-blue-200';
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <Megaphone className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Company Communications</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Announcements</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            News & Broadcasts
            <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              LIVE FEED
            </div>
          </h1>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Post Announcement
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-6 border border-slate-200 shadow-sm rounded-3xl">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-[400px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search announcements..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-semibold text-sm text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Announcement List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="col-span-2 flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="col-span-2 bg-white border border-slate-200 rounded-3xl p-20 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto">
              <Megaphone className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">No announcements found.</p>
          </div>
        ) : filteredAnnouncements.map((item) => (
          <div key={item.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:border-blue-300 hover:shadow-md transition-all duration-300">
            <div className="p-8 space-y-5 flex-1">
              <div className="flex justify-between items-start">
                <div className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${getTypeBadge(item.type)}`}>
                  {item.type}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openModal(item)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors hover:bg-blue-50 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { if(window.confirm('Delete this announcement?')) deleteMutation.mutate(item.id) }}
                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors mb-3 leading-tight">
                  {item.title}
                </h3>
                <p className="text-slate-500 text-sm line-clamp-3 leading-relaxed whitespace-pre-wrap font-medium">
                  {item.content}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-8 py-5 flex items-center justify-between border-t border-slate-100 mt-auto">
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  {item.author}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${item.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                {item.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {item.isActive ? 'Active' : 'Draft'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Post/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeModal}></div>
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 animate-in zoom-in-95 duration-300">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
                  <Megaphone className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
                    {editingItem ? 'Edit Announcement' : 'Post New Announcement'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Broadcast Message</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Announcement Title</label>
                  <input 
                    type="text" 
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g., Annual Company Gathering 2026"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-semibold text-sm text-slate-800 placeholder:text-slate-400 shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Category</label>
                    <div className="relative">
                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select 
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-all font-semibold text-slate-800 cursor-pointer text-sm shadow-sm"
                      >
                        <option value="General">General News</option>
                        <option value="Urgent">Urgent Notice</option>
                        <option value="Holiday">Holiday Announcement</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Posted By</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        value={formData.author}
                        onChange={(e) => setFormData({...formData, author: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-semibold text-slate-800 text-sm shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Detailed Content</label>
                  <textarea 
                    required
                    rows={4}
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    placeholder="Enter the full details of your announcement..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-5 py-4 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-slate-800 resize-none leading-relaxed placeholder:text-slate-400 text-sm shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="relative flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white checked:bg-blue-600 checked:border-blue-600 transition-all"
                    />
                    <CheckCircle2 className="absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 left-[2px] transition-opacity pointer-events-none" />
                  </div>
                  <label htmlFor="isActive" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                    Publish this announcement immediately to all employees
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 py-3 rounded-xl font-bold bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-[2] py-3 rounded-xl font-bold bg-blue-600 text-white shadow-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50 text-xs uppercase tracking-wider"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Megaphone className="w-4 h-4" />
                      {editingItem ? 'Save Changes' : 'Post Announcement'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Announcements;
