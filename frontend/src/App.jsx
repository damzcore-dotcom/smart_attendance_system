import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from './components/layout/AdminLayout';
import EmployeeLayout from './components/layout/EmployeeLayout';
import ManagerLayout from './components/layout/ManagerLayout';
import DirectorLayout from './components/layout/DirectorLayout';
import DirectorDashboard from './pages/director/DirectorDashboard';
import DirectorAttendance from './pages/director/DirectorAttendance';
import DirectorLeave from './pages/director/DirectorLeave';
import ManagerDashboard from './pages/manager/ManagerDashboard';
import ManagerAttendance from './pages/manager/ManagerAttendance';
import ManagerLeave from './pages/manager/ManagerLeave';
import AdminDashboard from './pages/admin/AdminDashboard';
import Employees from './pages/admin/Employees';
import Announcements from './pages/admin/Announcements';
import AdminFaceCheck from './pages/admin/FaceCheck';
import AdminLeaveRequests from './pages/admin/LeaveRequests';
import Backup from './pages/admin/Backup';
import Attendance from './pages/admin/Attendance';
import Settings from './pages/admin/Settings';
import AdminCorrections from './pages/admin/Corrections';
import DeviceSettings from './pages/admin/DeviceSettings';
import AuditLog from './pages/admin/AuditLog';
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

const DirectorRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user?.role !== 'DIREKTUR' && user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const EmployeeRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />;
  } else if (role === 'MANAGER') {
    return <Navigate to="/manager" replace />;
  } else if (role === 'DIREKTUR') {
    return <Navigate to="/director" replace />;
  }
  
  return children;
};

const ManagerRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />;
  } else if (role === 'EMPLOYEE') {
    return <Navigate to="/employee" replace />;
  } else if (role === 'DIREKTUR') {
    return <Navigate to="/director" replace />;
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
            <Route path="devices" element={<PermissionRoute menuKey="settings"><DeviceSettings /></PermissionRoute>} />
            <Route path="corrections" element={<PermissionRoute menuKey="corrections"><AdminCorrections /></PermissionRoute>} />
            <Route path="audit-log" element={<AuditLog />} />
          </Route>

          {/* Director Routes */}
          <Route path="/director" element={<DirectorRoute><DirectorLayout /></DirectorRoute>}>
            <Route index element={<DirectorDashboard />} />
            <Route path="attendance" element={<DirectorAttendance />} />
            <Route path="leave" element={<DirectorLeave />} />
          </Route>

          {/* Manager Routes */}
          <Route path="/manager" element={<ManagerRoute><ManagerLayout /></ManagerRoute>}>
            <Route index element={<ManagerDashboard />} />
            <Route path="attendance" element={<ManagerAttendance />} />
            <Route path="leave" element={<ManagerLeave />} />
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
