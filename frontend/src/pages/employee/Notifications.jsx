import { useState } from 'react';
import { 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  ChevronRight, 
  Trash2,
  MailOpen,
  Loader2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, notificationAPI } from '../../services/api';

const colorMap = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-500' },
  green: { bg: 'bg-green-50', text: 'text-green-500' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-500' },
  red: { bg: 'bg-red-50', text: 'text-red-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-500' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-500' },
};

const Notifications = () => {
  const [activeTab, setActiveTab] = useState('All');
  const queryClient = useQueryClient();
  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications', empId],
    queryFn: () => notificationAPI.getByEmployee(empId),
    enabled: !!empId,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationAPI.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', empId] });
    },
  });

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.filter(n => n.unread).length;

  const filteredNotifications = activeTab === 'All' 
    ? notifications 
    : notifications.filter(n => n.unread);

  const getIcon = (type) => {
    switch (type) {
      case 'approval': return CheckCircle2;
      case 'system': return AlertCircle;
      default: return Info;
    }
  };

  const getColor = (type) => {
    switch (type) {
      case 'approval': return 'emerald';
      case 'system': return 'amber';
      default: return 'blue';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center px-2">
        <h1 className="text-xl font-bold text-slate-800">Inbox</h1>
        <button 
          onClick={() => notifications.forEach(n => n.unread && markReadMutation.mutate(n.id))}
          className="text-primary text-xs font-bold flex items-center gap-1.5 hover:bg-primary/5 px-3 py-1.5 rounded-full transition-colors"
        >
          <MailOpen className="w-4 h-4" />
          Mark all as read
        </button>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-100 rounded-xl">
        {['All', 'Unread'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab ? 'bg-white text-primary shadow-sm' : 'text-slate-500'
            }`}
          >
            {tab}
            {tab === 'Unread' && unreadCount > 0 && (
              <span className="ml-2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : filteredNotifications.map((n) => {
          const Icon = getIcon(n.type);
          const color = getColor(n.type);
          const mappedColor = colorMap[color] || colorMap.blue;
          return (
            <div 
              key={n.id} 
              onClick={() => n.unread && markReadMutation.mutate(n.id)}
              className={`card p-4 relative group active:scale-[0.98] transition-transform cursor-pointer ${
                n.unread ? 'border-l-4 border-l-primary bg-white' : 'bg-slate-50/50 grayscale-[0.5]'
              }`}
            >
              <div className="flex gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${mappedColor.bg} ${mappedColor.text}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className={`text-sm font-bold truncate pr-4 ${n.unread ? 'text-slate-900' : 'text-slate-500'}`}>
                      {n.title}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">{formatTime(n.createdAt)}</span>
                  </div>
                  <p className={`text-xs line-clamp-2 leading-relaxed ${n.unread ? 'text-slate-600' : 'text-slate-400'}`}>
                    {n.message}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredNotifications.length === 0 && (
        <div className="py-20 text-center space-y-4">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
            <Bell className="w-10 h-10" />
          </div>
          <p className="text-slate-400 font-medium">No new notifications</p>
        </div>
      )}
    </div>
  );
};

export default Notifications;
