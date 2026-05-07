import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Shield, Check, X as XIcon } from 'lucide-react';
import { userAPI } from '../../services/api';

const AdminPermissions = () => {
  const queryClient = useQueryClient();
  const [selectedAdminId, setSelectedAdminId] = useState('');
  
  // Local state for permissions matrix
  const [permissions, setPermissions] = useState({});

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userAPI.getAll(),
  });

  const admins = usersData?.data?.filter(u => u.role === 'ADMIN') || [];

  // When an admin is selected, load their permissions into local state
  const handleSelectAdmin = (adminId) => {
    setSelectedAdminId(adminId);
    const admin = admins.find(a => a.id === parseInt(adminId));
    if (admin) {
      const permMap = {};
      const menus = ['dashboard', 'employees', 'attendance', 'users', 'leave-requests', 'face-check', 'backup', 'announcements', 'settings', 'corrections'];
      
      // Initialize with false
      menus.forEach(m => {
        permMap[m] = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
      });

      // Override with DB values
      if (admin.permissions && Array.isArray(admin.permissions)) {
        admin.permissions.forEach(p => {
          permMap[p.menuKey] = {
            canRead: p.canRead,
            canCreate: p.canCreate,
            canUpdate: p.canUpdate,
            canDelete: p.canDelete
          };
        });
      }
      setPermissions(permMap);
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
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="card p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-800">Admin Access Control</h3>
          <p className="text-sm text-slate-500">Configure read, create, update, and delete access for each admin.</p>
        </div>
        <div className="w-64">
          <select
            value={selectedAdminId}
            onChange={(e) => handleSelectAdmin(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Select an Admin...</option>
            {admins.map(admin => (
              <option key={admin.id} value={admin.id}>{admin.name} ({admin.username})</option>
            ))}
          </select>
        </div>
      </div>

      {selectedAdminId ? (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse bg-white">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Module / Menu</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-24">Read</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-24">Create</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-24">Update</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-24">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.keys(permissions).map((menuKey) => (
                  <tr key={menuKey} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-700 capitalize">
                      {menuKey.replace('-', ' ')}
                    </td>
                    {['canRead', 'canCreate', 'canUpdate', 'canDelete'].map(action => (
                      <td key={action} className="p-4 text-center">
                        <button
                          onClick={() => handleToggle(menuKey, action)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all ${
                            permissions[menuKey][action] 
                              ? 'bg-emerald-100 text-emerald-600 shadow-sm shadow-emerald-500/20' 
                              : 'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500'
                          }`}
                        >
                          {permissions[menuKey][action] ? <Check className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={updatePermMutation.isPending}
              className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 disabled:opacity-70"
            >
              {updatePermMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Permissions
            </button>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Select an admin from the dropdown above to manage their permissions.</p>
        </div>
      )}
    </div>
  );
};

export default AdminPermissions;
