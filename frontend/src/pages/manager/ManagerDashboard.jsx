import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  CalendarOff,
  Loader2,
  TrendingUp,
  TrendingDown,
  MapPin,
  CheckCircle2,
  AlertCircle,
  CalendarCheck
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { managerAPI } from '../../services/api';

const StatCard = ({ title, value, sub, icon: Icon, color, trend }) => (
  <div className="bg-white p-6 border border-slate-200 rounded-2xl group hover:shadow-md hover:border-blue-200 transition-all duration-300 relative overflow-hidden shadow-sm">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm transition-all duration-300 ${color} group-hover:scale-105`}>
        <Icon className="w-6 h-6" />
      </div>
      {trend && (
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border ${
          trend === 'up' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
          trend === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
          'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {trend === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {trend === 'up' ? 'Good' : 'Watch'}
        </span>
      )}
    </div>
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
    <div className="flex items-baseline gap-2">
      <p className="text-3xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  </div>
);

const ManagerDashboard = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: () => managerAPI.getDashboard()
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['manager-weekly-trends'],
    queryFn: () => managerAPI.getWeeklyTrends()
  });

  const { data: recentLateData, isLoading: recentLateLoading } = useQuery({
    queryKey: ['manager-recent-late'],
    queryFn: () => managerAPI.getRecentLate()
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-sm text-slate-400 font-medium">{t('attendancePage.msgLoading')}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-medium flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        {error?.message || t('settingsPage.license.invalid')}
      </div>
    );
  }

  const stats = data?.data?.stats || { totalEmployees: 0, present: 0, late: 0, onLeave: 0, absent: 0 };
  const weeklyTrends = trendsData?.data || [];
  const recentLate = recentLateData?.data || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white p-10 border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-50 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-lg mb-4 border border-emerald-100">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            {t('managerDashboard.badgeActive') || 'Operational Live'}
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">
            {t('managerDashboard.title').split(',')[0] || 'Dashboard Unit'}, <span className="text-emerald-600">{t('managerDashboard.title').split(',')[1]?.trim() || 'Manager'}</span>
          </h1>
          <p className="text-slate-500 text-sm max-w-2xl leading-relaxed">
            {t('managerDashboard.desc') || 'Analisis operasional waktu-nyata'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard 
          title={t('managerDashboard.totalPersonnel')} 
          value={stats.totalEmployees ?? 0} 
          sub={t('managerDashboard.activeStaff')} 
          icon={Users} 
          color="bg-blue-50 border-blue-100 text-blue-600"
          trend="up"
        />
        <StatCard 
          title={t('managerDashboard.presentToday')} 
          value={stats.present ?? 0} 
          sub={`${Math.round((stats.present / (stats.totalEmployees || 1)) * 100)}% ${t('managerDashboard.rate')}`}
          icon={CheckCircle2} 
          color="bg-emerald-50 border-emerald-100 text-emerald-650"
          trend="up"
        />
        <StatCard 
          title={t('managerDashboard.lateToday')} 
          value={stats.late ?? 0} 
          sub={t('managerDashboard.lateArrivals')}
          icon={Clock} 
          color="bg-amber-50 border-amber-100 text-amber-600"
          trend="warn"
        />
        <StatCard 
          title={t('managerDashboard.onLeave')} 
          value={stats.onLeave ?? 0} 
          sub={`${stats.absent ?? 0} ${t('managerDashboard.absent')}`}
          icon={AlertTriangle} 
          color="bg-rose-50 border-rose-100 text-rose-600"
        />
      </div>

      {/* Analytics Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="bg-white p-6 xl:p-8 lg:col-span-2 border border-slate-200 shadow-sm relative overflow-hidden rounded-2xl group">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h3 className="font-extrabold text-xl text-slate-800 tracking-tight">{t('dashboard.charts.analytics') || 'Attendance Analytics'}</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('dashboard.charts.punctualityTrend') || '7-DAY BIOMETRIC PUNCTUALITY TREND'}</p>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white shadow-sm px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)] animate-pulse"></div> {t('dashboard.charts.present') || 'PRESENT'}
              </span>
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white shadow-sm px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div> {t('dashboard.charts.late') || 'LATE'}
              </span>
            </div>
          </div>
          
          <div className="h-[320px] w-full relative z-10">
            {trendsLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f8fafc" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} dy={15} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} dx={-10} />
                  <Tooltip 
                    contentStyle={{backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', color: '#1e293b', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '12px 20px'}}
                    itemStyle={{color: '#2563eb', fontSize: '13px', fontWeight: '800'}}
                  />
                  <Area type="monotone" dataKey="present" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorPresent)" activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb' }} animationDuration={1500} />
                  <Area type="monotone" dataKey="late" stroke="#94a3b8" strokeWidth={3} fillOpacity={1} fill="url(#colorLate)" activeDot={{ r: 5, strokeWidth: 0, fill: '#94a3b8' }} animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Alerts & Live Capture Card */}
        <div className="bg-white p-6 xl:p-8 border border-slate-200 shadow-sm flex flex-col rounded-2xl">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              {t('dashboard.alerts.lateness') || 'LATENESS'}
            </h3>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-50 text-rose-500 border border-rose-100">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {recentLateLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : recentLate.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-10">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                  <CalendarCheck className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold text-xs tracking-wide">{t('dashboard.alerts.clearSkies') || 'Clear skies!'}<br/>{t('dashboard.alerts.noLates') || 'No late check-ins today'}</p>
              </div>
            ) : (
              recentLate.map((row, i) => (
                <div key={i} className="flex items-center gap-3 group p-2.5 rounded-xl hover:bg-slate-50 transition-all duration-300 border border-transparent hover:border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-white overflow-hidden shrink-0 border border-slate-200">
                    <img src={row.avatar} alt="user" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{row.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{row.dept}</p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold border border-rose-100 mb-0.5">
                      +{row.lateMinutes}m
                    </div>
                    <p className="text-[9px] font-bold text-slate-400">{row.checkIn}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <button
            onClick={() => navigate('/manager/attendance')}
            className="w-full mt-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all text-center"
          >
            Audit Full Logs
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
