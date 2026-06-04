import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Shield, Check, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { userAPI } from '../../services/api';

const AdminPermissions = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [isLoadingPerms, setIsLoadingPerms] = useState(false);
  const [permissions, setPermissions] = useState({});

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userAPI.getAll(),
  });

  const admins = usersData?.data?.filter(u => u.role === 'ADMIN' || u.role === 'ACCOUNTING' || u.role === 'DIREKTUR' || u.role === 'MANAGER') || [];

  const handleSelectAdmin = async (adminId) => {
    setSelectedAdminId(adminId);
    if (!adminId) {
      setPermissions({});
      return;
    }

    setIsLoadingPerms(true);
    try {
      const res = await userAPI.getPermissions(adminId);
      const permMap = {};
      const menus = [
        'dashboard', 'announcements', 'employees', 'contracts', 'shift-roster', 'leave-requests', 
        'attendance', 'overtime-spl', 'daily-workers', 'manual-correction', 'corrections', 
        'payroll', 'payroll-settings', 'face-check', 'devices', 'fingerprint', 
        'users', 'backup', 'settings',
        'settings-company-profile',
        'settings-geofencing',
        'settings-shift-rules',
        'settings-calendar',
        'settings-biometrics',
        'settings-cctv',
        'settings-slip',
        'settings-report',
        'settings-id-card'
      ];
      
      // Initialize with false
      menus.forEach(m => {
        permMap[m] = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
      });

      // Override with DB values
      if (res?.data && Array.isArray(res.data)) {
        res.data.forEach(p => {
          // Only map permissions that exist in our new modular menus array
          if (permMap[p.menuKey]) {
            permMap[p.menuKey] = {
              canRead: p.canRead,
              canCreate: p.canCreate,
              canUpdate: p.canUpdate,
              canDelete: p.canDelete
            };
          }
        });
      }
      setPermissions(permMap);
    } catch (error) {
      console.error('Failed to fetch permissions', error);
      alert(t('settingsPage.permissions.alertFailed'));
    } finally {
      setIsLoadingPerms(false);
    }
  };

  const updatePermMutation = useMutation({
    mutationFn: ({ userId, permissions }) => userAPI.updatePermissions(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert(t('settingsPage.permissions.alertSuccess'));
    }
  });

  const handleToggle = (menuKey, action) => {
    setPermissions(prev => ({
      ...prev,
      [menuKey]: {
        ...prev[menuKey],
        [action]: !prev[menuKey][action]
      }
    }));
  };

  const handleSave = () => {
    if (!selectedAdminId) return;
    
    // Convert permissions map to array format expected by API
    const permArray = Object.keys(permissions).map(menuKey => ({
      menuKey,
      ...permissions[menuKey]
    }));

    updatePermMutation.mutate({
      userId: parseInt(selectedAdminId),
      permissions: permArray
    });
  };

  const getMenuLabel = (menuKey) => {
    // Check settings sub-permissions first
    if (menuKey.startsWith('settings-')) {
      const mapping = {
        'settings-company-profile': 'General',
        'settings-geofencing': 'Location',
        'settings-shift-rules': 'Shifts',
        'settings-calendar': 'Calendar',
        'settings-biometrics': 'Security',
        'settings-cctv': 'Cameras',
        'settings-slip': 'SlipBuilder',
        'settings-report': 'AttendanceBuilder',
        'settings-id-card': 'IDCardBuilder'
      };
      const tabId = mapping[menuKey];
      return tabId ? `↳ ${t('settingsPage.tabs.' + tabId)}` : menuKey;
    }

    // Map other menu keys to navigation translation keys
    const mapping = {
      'dashboard': 'navigation.dashboard',
      'announcements': 'navigation.announcements',
      'employees': 'navigation.employees',
      'contracts': 'navigation.contracts',
      'shift-roster': 'navigation.shiftRoster',
      'leave-requests': 'navigation.leaveRequests',
      'attendance': 'navigation.attendanceData',
      'overtime-spl': 'navigation.overtimeSpl',
      'daily-workers': 'navigation.dailyWorkers',
      'manual-correction': 'navigation.manualCorrection',
      'corrections': 'navigation.corrections',
      'payroll': 'navigation.payrollProcess',
      'payroll-settings': 'navigation.payrollSettings',
      'face-check': 'navigation.faceCheck',
      'devices': 'navigation.devices',
      'fingerprint': 'navigation.fingerprintData',
      'users': 'navigation.users',
      'backup': 'navigation.backup',
      'settings': 'navigation.settings'
    };
    const transKey = mapping[menuKey];
    return transKey ? t(transKey) : menuKey;
  };

  if (usersLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 border border-slate-200 rounded-3xl shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.permissions.title')}</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('settingsPage.permissions.subtitle')}</p>
            </div>
          </div>
          
          <div className="w-full xl:w-96">
            <select
              value={selectedAdminId}
              onChange={(e) => handleSelectAdmin(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:border-blue-500 focus:ring-blue-500 transition-all appearance-none cursor-pointer shadow-sm"
            >
              <option value="">{t('settingsPage.permissions.selectPlaceholder')}</option>
              {admins.map(admin => (
                <option key={admin.id} value={admin.id}>
                  {admin.name} [{admin.username}]
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedAdminId ? (
          <div className="space-y-8">
            {isLoadingPerms ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.permissions.loadingPermissions')}</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.permissions.thModule')}</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">{t('settingsPage.permissions.thRead')}</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">{t('settingsPage.permissions.thCreate')}</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">{t('settingsPage.permissions.thUpdate')}</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">{t('settingsPage.permissions.thDelete')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.keys(permissions).map((menuKey) => {
                      const isSubSettings = menuKey.startsWith('settings-');
                      const displayLabel = getMenuLabel(menuKey);

                      return (
                        <tr key={menuKey} className="hover:bg-slate-50/50 transition-colors group">
                          <td className={`px-6 py-4 tracking-tight group-hover:text-blue-600 transition-colors ${
                            isSubSettings 
                              ? 'pl-12 text-slate-400 font-semibold italic text-xs' 
                              : 'font-bold text-slate-700 capitalize text-sm'
                          }`}>
                            {displayLabel}
                          </td>
                          {['canRead', 'canCreate', 'canUpdate', 'canDelete'].map(action => (
                          <td key={action} className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleToggle(menuKey, action)}
                              className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all duration-300 ${
                                permissions[menuKey][action] 
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' 
                                  : 'bg-white text-slate-300 hover:text-slate-500 hover:bg-slate-50 border border-slate-200'
                              }`}
                            >
                              {permissions[menuKey][action] ? <Check className="w-5 h-5" /> : <XIcon className="w-4 h-4" />}
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
            
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={handleSave}
                disabled={updatePermMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-3 shadow-sm disabled:opacity-50 transition-all active:scale-95"
              >
                {updatePermMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('settingsPage.permissions.btnSave')}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.permissions.emptyState')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPermissions;
