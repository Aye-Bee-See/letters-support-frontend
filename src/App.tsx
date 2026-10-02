import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { SiteLayout, SignedInLayout } from './components/layout/Layouts'
import AdminLayout, { AdminStyles } from './components/layout/AdminLayout'
import { RequireAdmin, RequireAuth } from './components/layout/RouteGuards'
import ScrollToTop from './components/layout/ScrollToTop'

import Index from './pages/public/Index'
import Prisoners from './pages/public/Prisoners'
import PrisonerProfile from './pages/public/PrisonerProfile'
import Facilities from './pages/public/Facilities'
import FacilityProfile from './pages/public/FacilityProfile'
import Groups from './pages/public/Groups'
import GroupProfile from './pages/public/GroupProfile'
import About from './pages/public/About'

import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import Claim from './pages/auth/Claim'
import Join from './pages/auth/Join'

import InboxWriter from './pages/inbox/InboxWriter'
import InboxOrg from './pages/inbox/InboxOrg'
import Thread from './pages/correspondence/Thread'
import NewLetter from './pages/correspondence/NewLetter'

import CreateWriter from './pages/org/CreateWriter'
import Handoff from './pages/org/Handoff'
import InviteCodes from './pages/org/InviteCodes'
import OrgSettings from './pages/org/OrgSettings'

import AdminLogin from './pages/admin/AdminLogin'
import Dashboard from './pages/admin/Dashboard'
import PrisonersList from './pages/admin/PrisonersList'
import EditFacility from './pages/admin/EditFacility'
import EditGroup from './pages/admin/EditGroup'
import EditPrisoner from './pages/admin/EditPrisoner'
import FacilitiesList from './pages/admin/FacilitiesList'
import GroupsList from './pages/admin/GroupsList'
import Queue from './pages/admin/Queue'

/** /inbox shows the writer or the group view by role; superadmins have no inbox. */
function InboxRoute() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  return user?.role === 'chapter' ? <InboxOrg /> : <InboxWriter />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* Public directory: header and footer */}
          <Route element={<SiteLayout />}>
            <Route index element={<Index />} />
            <Route path="prisoners" element={<Prisoners />} />
            <Route path="prisoners/:id" element={<PrisonerProfile />} />
            <Route path="facilities" element={<Facilities />} />
            <Route path="facilities/:id" element={<FacilityProfile />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/:id" element={<GroupProfile />} />
            <Route path="about" element={<About />} />
          </Route>

          {/* Sign-in and signed-in pages: header only */}
          <Route element={<SignedInLayout />}>
            <Route path="login" element={<Login />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="claim" element={<Claim />} />
            <Route path="join" element={<Join />} />

            <Route element={<RequireAuth roles={['user', 'chapter']} />}>
              <Route path="inbox" element={<InboxRoute />} />
              <Route path="threads/:id" element={<Thread />} />
              <Route path="letters/new" element={<NewLetter />} />
            </Route>

            <Route element={<RequireAuth roles={['chapter']} />}>
              <Route path="writers/new" element={<CreateWriter />} />
              <Route path="writers/:id/handoff" element={<Handoff />} />
              <Route path="invite-codes" element={<InviteCodes />} />
              <Route path="settings" element={<OrgSettings />} />
            </Route>
          </Route>

          {/* Superadmin: admin.css only while here */}
          <Route path="admin" element={<AdminStyles />}>
            <Route path="login" element={<AdminLogin />} />
            <Route element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="prisoners" element={<PrisonersList />} />
                <Route path="prisoners/:id/edit" element={<EditPrisoner />} />
                <Route path="facilities" element={<FacilitiesList />} />
                <Route path="facilities/:id/edit" element={<EditFacility />} />
                <Route path="groups" element={<GroupsList />} />
                <Route path="groups/:id/edit" element={<EditGroup />} />
                <Route path="queue" element={<Queue />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
