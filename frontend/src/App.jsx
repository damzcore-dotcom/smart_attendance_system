import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from './components/layout/AdminLayout';
import EmployeeLayout from './components/layout/EmployeeLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import Employees from './pages/admin/Employees';
import Announcements from './pages/admin/Announcements';
import AdminFaceCheck from './pages/admin/FaceCheck';
import AdminLeaveRequests from './pages/admin/LeaveRequests';
import Backup from './pages/admin/Backup';
import Attendance from './pages/admin/Attendance';
import Settings from './pages/admin/Settings';
import AdminCorrections from './pages/admin/Corrections';
import EmployeeHome from './pages/employee/EmployeeHome';
import History from './pages/employee/History';
import Profile from './pages/employee/Profile';
import Notifications from './pages/employee/Notifications';
import Correction from './pages/employee/Correction';
import Schedule from './pages/employee/Schedule';
import Scan from './pages/employee/Scan';
import FaceCheck from './pages/employee/FaceCheck';
import Leave from './pages/employee/Leave';
import Users from './pages/admin/Users';
import Login from './pages/Login';

import { usePermission } from './hooks/usePermission';

const queryClient = new QueryClient();

const PermissionRoute = ({ menuKey, children }) => {
  const { canRead, isLoading } = usePermission(menuKey);
  
  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!canRead) return <Navigate to="/admin" replace />;
  
  return children;
};

const EmployeeRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<PermissionRoute menuKey="dashboard"><AdminDashboard /></PermissionRoute>} />
            <Route path="employees" element={<PermissionRoute menuKey="employees"><Employees /></PermissionRoute>} />
            <Route path="users" element={<PermissionRoute menuKey="users"><Users /></PermissionRoute>} />
            <Route path="attendance" element={<PermissionRoute menuKey="attendance"><Attendance /></PermissionRoute>} />
            <Route path="leave-requests" element={<PermissionRoute menuKey="leave-requests"><AdminLeaveRequests /></PermissionRoute>} />
            <Route path="backup" element={<PermissionRoute menuKey="backup"><Backup /></PermissionRoute>} />
            <Route path="announcements" element={<PermissionRoute menuKey="announcements"><Announcements /></PermissionRoute>} />
            <Route path="face-check" element={<PermissionRoute menuKey="announcements"><AdminFaceCheck /></PermissionRoute>} />
            <Route path="settings" element={<PermissionRoute menuKey="settings"><Settings /></PermissionRoute>} />
            <Route path="corrections" element={<PermissionRoute menuKey="corrections"><AdminCorrections /></PermissionRoute>} />
          </Route>

          {/* Employee Routes */}
          <Route path="/employee" element={<EmployeeRoute><EmployeeLayout /></EmployeeRoute>}>
            <Route index element={<EmployeeHome />} />
            <Route path="history" element={<History />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
            <Route path="correction" element={<Correction />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="scan" element={<Scan />} />
            <Route path="face-check" element={<FaceCheck />} />
            <Route path="leave" element={<Leave />} />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
