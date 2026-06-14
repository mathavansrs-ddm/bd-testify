import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import Home from './pages/Home'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import QuestionManager from './pages/QuestionManager'
import TestSets from './pages/TestSets'
import CandidateList from './pages/CandidateList'
import MonitoringDashboard from './pages/MonitoringDashboard'
import InviteManager from './pages/InviteManager'
import CandidateRegister from './pages/CandidateRegister'
import EmployeeLogin from './pages/EmployeeLogin'
import OpenTests from './pages/OpenTests'
import TestRoom from './pages/TestRoom'
import QRScan from './pages/QRScan'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('admin_token')
  return token ? children : <Navigate to="/admin/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
        <Route path="/admin/questions" element={<PrivateRoute><QuestionManager /></PrivateRoute>} />
        <Route path="/admin/test-sets" element={<PrivateRoute><TestSets /></PrivateRoute>} />
        <Route path="/admin/candidates" element={<PrivateRoute><CandidateList /></PrivateRoute>} />
        <Route path="/admin/monitoring" element={<PrivateRoute><MonitoringDashboard /></PrivateRoute>} />
        <Route path="/admin/invite" element={<PrivateRoute><InviteManager /></PrivateRoute>} />

        {/* Candidate — external (invite link) */}
        <Route path="/register" element={<CandidateRegister />} />

        {/* Candidate — internal employee */}
        <Route path="/employee/login" element={<EmployeeLogin />} />

        {/* Open tests (self-enroll) */}
        <Route path="/tests" element={<OpenTests />} />

        {/* Test room */}
        <Route path="/test/:token" element={<TestRoom />} />

        {/* QR scan */}
        <Route path="/qr-landing" element={<QRScan />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
