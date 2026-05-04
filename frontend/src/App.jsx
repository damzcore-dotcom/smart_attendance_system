import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from './components/layout/AdminLayout';
import EmployeeLayout from './components/layout/EmployeeLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import Employees from './pages/admin/Employees';
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
import Users from './pages/admin/Users';
import Login from './pages/Login';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="employees" element={<Employees />} />
            <Route path="users" element={<Users />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="settings" element={<Settings />} />
            <Route path="corrections" element={<AdminCorrections />} />
          </Route>

          {/* Employee Routes */}
          <Route path="/employee" element={<EmployeeLayout />}>
            <Route index element={<EmployeeHome />} />
            <Route path="history" element={<History />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
            <Route path="correction" element={<Correction />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="scan" element={<Scan />} />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
