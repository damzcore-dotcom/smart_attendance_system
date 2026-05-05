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
      case 'Urgent': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'Holiday': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-blue-50 text-blue-600 border-blue-100';
    }
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Megaphone className="w-8 h-8 text-primary" />
            News & Announcements
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Broadcast important updates and corporate news to all employees.</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="btn-primary px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-xl shadow-primary/20"
        >
          <Plus className="w-5 h-5" />
          Post Announcement
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search announcements..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-medium"
          />
        </div>
      </div>

      {/* Announcement List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="col-span-2 flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="col-span-2 card p-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <Megaphone className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold">No announcements found.</p>
          </div>
        ) : filteredAnnouncements.map((item) => (
          <div key={item.id} className="card p-0 overflow-hidden flex flex-col group border-slate-100 hover:border-primary/30 transition-all duration-300">
            <div className="p-6 space-y-4 flex-1">
              <div className="flex justify-between items-start">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getTypeBadge(item.type)}`}>
                  {item.type}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openModal(item)} className="p-2 text-slate-400 hover:text-primary transition-colors hover:bg-primary/5 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { if(window.confirm('Delete this announcement?')) deleteMutation.mutate(item.id) }}
                    className="p-2 text-slate-400 hover:text-rose-500 transition-colors hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors mb-2 leading-tight">
                  {item.title}
                </h3>
                <p className="text-slate-500 text-sm line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-100 mt-auto">
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  {item.author}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${item.isActive ? 'text-emerald-500' : 'text-slate-400'}`}>
                {item.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {item.isActive ? 'Active' : 'Draft'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Post/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Megaphone className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-black uppercase tracking-widest">
                  {editingItem ? 'Edit Announcement' : 'Post New Announcement'}
                </h2>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Announcement Title</label>
                  <input 
                    type="text" 
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g., Annual Company Gathering 2026"
                    className="w-full bg-white border-2 border-slate-100 rounded-[1.25rem] px-6 py-4 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all font-bold text-slate-800 placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-3 ml-1">Category</label>
                  <div className="relative">
                    <Tag className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <select 
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      className="w-full bg-white border-2 border-slate-100 rounded-[1.25rem] pl-14 pr-6 py-4 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary appearance-none transition-all font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="General">General News</option>
                      <option value="Urgent">Urgent Notice</option>
                      <option value="Holiday">Holiday Announcement</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Posted By</label>
                  <div className="relative">
                    <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="text" 
                      value={formData.author}
                      onChange={(e) => setFormData({...formData, author: e.target.value})}
                      className="w-full bg-white border-2 border-slate-100 rounded-[1.25rem] pl-14 pr-6 py-4 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all font-bold text-slate-700"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Detailed Content</label>
                  <textarea 
                    required
                    rows={5}
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    placeholder="Enter the full details of your announcement..."
                    className="w-full bg-white border-2 border-slate-100 rounded-[1.25rem] px-6 py-5 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all font-medium text-slate-700 resize-none leading-relaxed placeholder:text-slate-300"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-4 bg-slate-50/50 p-5 rounded-[1.25rem] border border-slate-100/50">
                  <div className="relative flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                      className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 bg-white checked:bg-primary checked:border-primary transition-all"
                    />
                    <CheckCircle2 className="absolute h-4 w-4 text-white opacity-0 peer-checked:opacity-100 left-1 transition-opacity pointer-events-none" />
                  </div>
                  <label htmlFor="isActive" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                    Publish this announcement immediately to all employees
                  </label>
                </div>
              </div>

              <div className="flex gap-5 pt-4">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 py-4 rounded-[1.25rem] font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all active:scale-95"
                >
                  Discard
                </button>
                <button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-[2] py-4 rounded-[1.25rem] font-black bg-primary text-white shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 hover:bg-primary-dark hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Megaphone className="w-5 h-5" />
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
