import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

// Hook XLSX.writeFile to inject DEMO sheet
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  try {
    const originalWriteFile = XLSX.writeFile;
    XLSX.writeFile = function (wb, filename, opts) {
      if (wb && wb.SheetNames && wb.Sheets) {
        const ws = XLSX.utils.aoa_to_sheet([
          ['🔶 SMART ATTENDANCE PRO — DEMO VERSION'],
          [],
          ['Status:', 'VERSI DEMO / TRIAL'],
          ['Hubungi:', '082124130065 (WhatsApp)'],
          ['Pemberitahuan:', 'Dilarang menggunakan data ini untuk keperluan produksi.'],
          [],
          ['⚠️ Silakan klik tab/sheet berikutnya di bagian bawah untuk melihat data.']
        ]);
        ws['!cols'] = [{ wch: 20 }, { wch: 50 }];
        if (!wb.SheetNames.includes('DEMO_NOTICE')) {
          wb.SheetNames.unshift('DEMO_NOTICE');
          wb.Sheets['DEMO_NOTICE'] = ws;
        }
      }
      return originalWriteFile.call(this, wb, filename, opts);
    };
  } catch (err) {
    console.error('Failed to hook XLSX.writeFile:', err);
  }
}
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
import EmployeeContracts from './pages/admin/EmployeeContracts';
import EmployeeTraining from './pages/admin/EmployeeTraining';
import EmployeeTerminated from './pages/admin/EmployeeTerminated';
import Announcements from './pages/admin/Announcements';
import AdminFaceCheck from './pages/admin/FaceCheck';
import AdminLeaveRequests from './pages/admin/LeaveRequests';
import Backup from './pages/admin/Backup';
import Attendance from './pages/admin/Attendance';
import OvertimeSPL from './pages/admin/OvertimeSPL';
import DailyWorkerAttendance from './pages/admin/DailyWorkerAttendance';
import ManualCorrectionHRD from './pages/admin/ManualCorrectionHRD';
import Settings from './pages/admin/Settings';
import ShiftRoster from './pages/admin/ShiftRoster';
import AdminCorrections from './pages/admin/Corrections';
import DeviceSettings from './pages/admin/DeviceSettings';
import FingerprintManagement from './pages/admin/FingerprintManagement';
import AuditLog from './pages/admin/AuditLog';
import Payroll from './pages/admin/Payroll';
import PayrollSettings from './pages/admin/PayrollSettings';
import FaceEnrollment from './pages/admin/FaceEnrollment';
import LiveCameraMonitor from './pages/admin/LiveCameraMonitor';
import UnknownAlerts from './pages/admin/UnknownAlerts';
import EmployeeHome from './pages/employee/EmployeeHome';
import History from './pages/employee/History';
import Profile from './pages/employee/Profile';
import Notifications from './pages/employee/Notifications';
import Correction from './pages/employee/Correction';
import Schedule from './pages/employee/Schedule';
import Scan from './pages/employee/Scan';
import Leave from './pages/employee/Leave';
import MySlips from './pages/employee/MySlips';
import Calendar from './pages/employee/Calendar';
import Users from './pages/admin/Users';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/ErrorBoundary';
import DemoBanner from './components/DemoBanner';
import DemoWatermark from './components/DemoWatermark';

// New HRIS modules imports
const Claims = React.lazy(() => import('./pages/employee/Claims'));
const AdminClaims = React.lazy(() => import('./pages/admin/Claims'));
const AdminProfileRequests = React.lazy(() => import('./pages/admin/AdminProfileRequests'));
const KPIEvaluation = React.lazy(() => import('./pages/manager/KPIEvaluation'));

import { usePermission } from './hooks/usePermission';
import { authAPI } from './services/api';

const queryClient = new QueryClient();

const AdminRoute = ({ children }) => {
  const isLoggedIn = authAPI.isLoggedIn();
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (!isLoggedIn || (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'ACCOUNTING')) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const PermissionRoute = ({ menuKey, children }) => {
  const isLoggedIn = authAPI.isLoggedIn();
  const { canRead, isLoading } = usePermission(menuKey);
  
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  
  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!canRead) return <Navigate to="/admin" replace />;
  
  return children;
};

const DirectorRoute = ({ children }) => {
  const isLoggedIn = authAPI.isLoggedIn();
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (!isLoggedIn || (role !== 'DIREKTUR' && role !== 'ADMIN' && role !== 'SUPER_ADMIN')) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const EmployeeRoute = ({ children }) => {
  const isLoggedIn = authAPI.isLoggedIn();
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTING') {
    return <Navigate to="/admin" replace />;
  } else if (role === 'MANAGER') {
    return <Navigate to="/manager" replace />;
  } else if (role === 'DIREKTUR') {
    return <Navigate to="/director" replace />;
  }
  
  if (role !== 'EMPLOYEE') {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

const ManagerRoute = ({ children }) => {
  const isLoggedIn = authAPI.isLoggedIn();
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const role = user?.role;
  
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTING') {
    return <Navigate to="/admin" replace />;
  } else if (role === 'EMPLOYEE') {
    return <Navigate to="/employee" replace />;
  } else if (role === 'DIREKTUR') {
    return <Navigate to="/director" replace />;
  }
  
  if (role !== 'MANAGER') {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const [demoExpiry, setDemoExpiry] = React.useState(null);

  React.useEffect(() => {
    if (isDemoMode) {
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/settings/public`)
        .then(r => r.json())
        .then(data => {
          if (data?.data?.demoExpiry) setDemoExpiry(data.data.demoExpiry);
        })
        .catch(() => {});
    }
  }, [isDemoMode]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          {isDemoMode && <DemoBanner expiry={demoExpiry} />}
          {isDemoMode && <DemoWatermark />}
          <div style={{ paddingTop: isDemoMode ? '36px' : '0', minHeight: '100vh' }}>
            <Suspense fallback={<div className="h-screen flex items-center justify-center bg-[#f7f8fc]"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<PermissionRoute menuKey="dashboard"><AdminDashboard /></PermissionRoute>} />
              <Route path="employees" element={<PermissionRoute menuKey="employees"><Employees /></PermissionRoute>} />
              <Route path="contracts" element={<PermissionRoute menuKey="contracts"><EmployeeContracts /></PermissionRoute>} />
              <Route path="training" element={<PermissionRoute menuKey="training"><EmployeeTraining /></PermissionRoute>} />
              <Route path="terminated" element={<PermissionRoute menuKey="employees"><EmployeeTerminated /></PermissionRoute>} />
              <Route path="users" element={<PermissionRoute menuKey="users"><Users /></PermissionRoute>} />
              <Route path="attendance" element={<PermissionRoute menuKey="attendance"><Attendance /></PermissionRoute>} />
              <Route path="overtime-spl" element={<PermissionRoute menuKey="overtime-spl"><OvertimeSPL /></PermissionRoute>} />
              <Route path="daily-workers" element={<PermissionRoute menuKey="daily-workers"><DailyWorkerAttendance /></PermissionRoute>} />
              <Route path="manual-correction" element={<PermissionRoute menuKey="manual-correction"><ManualCorrectionHRD /></PermissionRoute>} />
              <Route path="payroll" element={<PermissionRoute menuKey="payroll"><Payroll /></PermissionRoute>} />
              <Route path="payroll-settings" element={<PermissionRoute menuKey="payroll-settings"><PayrollSettings /></PermissionRoute>} />
              <Route path="leave-requests" element={<PermissionRoute menuKey="leave-requests"><AdminLeaveRequests /></PermissionRoute>} />
              <Route path="backup" element={<PermissionRoute menuKey="backup"><Backup /></PermissionRoute>} />
              <Route path="announcements" element={<PermissionRoute menuKey="announcements"><Announcements /></PermissionRoute>} />
              <Route path="face-check" element={<PermissionRoute menuKey="face-check"><AdminFaceCheck /></PermissionRoute>} />
              <Route path="settings" element={<PermissionRoute menuKey="settings"><Settings /></PermissionRoute>} />
              <Route path="shift-roster" element={<PermissionRoute menuKey="shift-roster"><ShiftRoster /></PermissionRoute>} />
              <Route path="devices" element={<PermissionRoute menuKey="devices"><DeviceSettings /></PermissionRoute>} />
              <Route path="fingerprint" element={<PermissionRoute menuKey="fingerprint"><FingerprintManagement /></PermissionRoute>} />
              <Route path="corrections" element={<PermissionRoute menuKey="corrections"><AdminCorrections /></PermissionRoute>} />
              <Route path="audit-log" element={<PermissionRoute menuKey="audit-log"><AuditLog /></PermissionRoute>} />
              <Route path="face-enrollment" element={<PermissionRoute menuKey="face-check"><FaceEnrollment /></PermissionRoute>} />
              <Route path="cameras" element={<PermissionRoute menuKey="face-check"><LiveCameraMonitor /></PermissionRoute>} />
              <Route path="unknown-alerts" element={<PermissionRoute menuKey="face-check"><UnknownAlerts /></PermissionRoute>} />
              
              {/* New HRIS Routes */}
              <Route path="claims" element={<PermissionRoute menuKey="payroll"><AdminClaims /></PermissionRoute>} />
              <Route path="profile-requests" element={<PermissionRoute menuKey="employees"><AdminProfileRequests /></PermissionRoute>} />
              <Route path="kpi" element={<PermissionRoute menuKey="employees"><KPIEvaluation /></PermissionRoute>} />
            </Route>

            {/* Director Routes */}
            <Route path="/director" element={<DirectorRoute><DirectorLayout /></DirectorRoute>}>
              <Route index element={<DirectorDashboard />} />
              <Route path="attendance" element={<DirectorAttendance />} />
              <Route path="employees" element={<Employees isReadOnly={true} />} />
              <Route path="contracts" element={<EmployeeContracts isReadOnly={true} />} />
              <Route path="training" element={<EmployeeTraining isReadOnly={true} />} />
              <Route path="terminated" element={<EmployeeTerminated isReadOnly={true} />} />
              <Route path="audit-log" element={<AuditLog />} />
              <Route path="kpi" element={<KPIEvaluation />} />
            </Route>

            {/* Manager Routes */}
            <Route path="/manager" element={<ManagerRoute><ManagerLayout /></ManagerRoute>}>
              <Route index element={<ManagerDashboard />} />
              <Route path="attendance" element={<ManagerAttendance />} />
              <Route path="employees" element={<Employees isReadOnly={true} />} />
              <Route path="contracts" element={<EmployeeContracts isReadOnly={true} />} />
              <Route path="training" element={<EmployeeTraining isReadOnly={true} />} />
              <Route path="terminated" element={<EmployeeTerminated isReadOnly={true} />} />
              <Route path="audit-log" element={<AuditLog />} />
              <Route path="kpi" element={<KPIEvaluation />} />
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
              <Route path="leave" element={<Leave />} />
              <Route path="slips" element={<MySlips />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="claims" element={<Claims />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            {/* 404 Catch-all */}
            <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
