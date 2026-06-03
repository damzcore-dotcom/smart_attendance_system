import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Clock, Camera, Eye, XCircle, Loader2, Shield } from 'lucide-react';
import api from '../../services/api';

const UnknownAlerts = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('unresolved'); // all | unresolved | resolved
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [resolveNote, setResolveNote] = useState('');

  // Fetch alerts
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['unknown-alerts', filter],
    queryFn: () => api.get('/bridge/alerts/unknown', {
      params: {
        resolved: filter === 'all' ? undefined : filter === 'resolved',
        limit: 100
      }
    }).then(r => r.data),
    refetchInterval: 10000,
  });
  const alerts = alertsData?.data || [];

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }) => api.put(`/bridge/alerts/unknown/${id}/resolve`, {
      resolvedBy: 'Admin',
      notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['unknown-alerts']);
      setSelectedAlert(null);
      setResolveNote('');
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Shield className="w-7 h-7 text-amber-600" />
            {t('unknownAlerts.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('unknownAlerts.subtitle')}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'unresolved', label: t('unknownAlerts.tabs.unresolved'), icon: AlertTriangle, color: 'amber' },
          { key: 'resolved', label: t('unknownAlerts.tabs.resolved'), icon: CheckCircle, color: 'green' },
          { key: 'all', label: t('unknownAlerts.tabs.all'), icon: Eye, color: 'slate' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              filter === tab.key
                ? `bg-${tab.color}-100 text-${tab.color}-800 border border-${tab.color}-200`
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700">{t('unknownAlerts.noAlerts')}</h3>
          <p className="text-sm text-slate-400">{t('unknownAlerts.noAlertsDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                alert.resolved ? 'border-green-200' : 'border-amber-200'
              }`}
            >
              {/* Photo */}
              <div className="aspect-square bg-slate-100 relative">
                {alert.photoUrl ? (
                  <img
                    src={alert.photoUrl}
                    alt="Unknown face"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src = ''; e.target.classList.add('hidden'); }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <AlertTriangle className="w-16 h-16" />
                  </div>
                )}

                {/* Status badge */}
                <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-bold ${
                  alert.resolved ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {alert.resolved ? 'RESOLVED' : 'UNRESOLVED'}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Camera className="w-3 h-3" />
                  {alert.camera?.name || alert.cameraId}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {new Date(alert.eventTime).toLocaleString('id-ID')}
                </div>

                {alert.resolved ? (
                  <div className="text-xs text-green-600 bg-green-50 rounded p-2">
                    <span className="font-semibold">{t('unknownAlerts.resolvedBy', { name: alert.resolvedBy })}</span>
                    {alert.notes && <p className="mt-1 text-green-700">{alert.notes}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedAlert(alert)}
                    className="w-full px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-all"
                  >
                    {t('unknownAlerts.handleAlert')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolve Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-slate-800">{t('unknownAlerts.handleAlertTitle', { id: selectedAlert.id })}</h3>
            <p className="text-sm text-slate-500">
              {t('unknownAlerts.camera')}: {selectedAlert.camera?.name || selectedAlert.cameraId}<br />
              {t('unknownAlerts.time')}: {new Date(selectedAlert.eventTime).toLocaleString('id-ID')}
            </p>

            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder={t('unknownAlerts.notesPlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none h-24 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none"
            />

            <div className="flex gap-3">
              <button
                onClick={() => resolveMutation.mutate({ id: selectedAlert.id, notes: resolveNote })}
                disabled={resolveMutation.isPending}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resolveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {t('unknownAlerts.markResolved')}
              </button>
              <button
                onClick={() => { setSelectedAlert(null); setResolveNote(''); }}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnknownAlerts;
