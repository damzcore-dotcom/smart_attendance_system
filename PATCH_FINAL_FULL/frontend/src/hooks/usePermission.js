import { useQuery } from '@tanstack/react-query';
import { authAPI } from '../services/api';

export const usePermission = (menuKey) => {
  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const user = userData?.data || authAPI.getStoredUser();

  if (!user) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false, isLoading: true };
  
  if (user.role === 'SUPER_ADMIN' || user.permissions === 'ALL') {
    return { canRead: true, canCreate: true, canUpdate: true, canDelete: true, isLoading: false };
  }

  if (!user.permissions || !Array.isArray(user.permissions)) {
    return { canRead: false, canCreate: false, canUpdate: false, canDelete: false, isLoading: false };
  }

  const perm = user.permissions.find(p => p.menuKey === menuKey);
  
  return {
    canRead: perm?.canRead || false,
    canCreate: perm?.canCreate || false,
    canUpdate: perm?.canUpdate || false,
    canDelete: perm?.canDelete || false,
    isLoading: false
  };
};
