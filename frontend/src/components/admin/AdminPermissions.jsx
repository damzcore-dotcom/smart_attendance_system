import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Shield, Check, X as XIcon } from 'lucide-react';
import { userAPI } from '../../services/api';

const AdminPermissions = () => {
  const queryClient = useQueryClient();
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [isLoadingPerms, setIsLoadingPerms] = useState(false);
  const [permissions, setPermissions] = useState({});

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userAPI.getAll(),
  });

  const admins = usersData?.data?.filter(u => u.role === 'ADMIN' || u.role === 'ACCOUNTING') || [];

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
      const menus = ['dashboard', 'employees', 'attendance', 'users', 'leave-requests', 'face-check', 'backup', 'announcements', 'settings', 'corrections', 'payroll', 'payroll-settings'];
      
      // Initialize with false
      menus.forEach(m => {
        permMap[m] = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
      });

      // Override with DB values
      if (res?.data && Array.isArray(res.data)) {
        res.data.forEach(p => {
          permMap[p.menuKey] = {
            canRead: p.canRead,
            canCreate: p.canCreate,
            canUpdate: p.canUpdate,
            canDelete: p.canDelete
          };
        });
      }
      setPermissions(permMap);
    } catch (error) {
      console.error('Failed to fetch permissions', error);
      alert('Failed to fetch permissions');
    } finally {
      setIsLoadingPerms(false);
    }
  };

  const updatePermMutation = useMutation({
    mutationFn: ({ userId, permissions }) => userAPI.updatePermissions(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('Permissions saved successfully!');
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
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">Authority Matrix</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Granular Access Level Control</p>
            </div>
          </div>
          
          <div className="w-full xl:w-96">
            <select
              value={selectedAdminId}
              onChange={(e) => handleSelectAdmin(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:border-blue-500 focus:ring-blue-500 transition-all appearance-none cursor-pointer shadow-sm"
            >
              <option value="">Select Administrator...</option>
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
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Loading Permissions...</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operational Module</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">Read</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">Create</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">Update</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-32">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.keys(permissions).map((menuKey) => (
                      <tr key={menuKey} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 font-bold text-slate-700 capitalize tracking-tight group-hover:text-blue-600 transition-colors text-sm">
                          {menuKey.replace('-', ' ')}
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
                    ))}
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
                Save Permissions
              </button>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select an administrative identity to load authorization matrix.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPermissions;
