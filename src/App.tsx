import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { SiteLayout, SignedInLayout } from './components/layout/Layouts'
import AdminLayout, { AdminStyles } from './components/layout/AdminLayout'
import GroupGate from './components/layout/GroupGate'
import { PenNameLock, RequireAdmin, RequireAuth, TwoFactorSetupLock } from './components/layout/RouteGuards'
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
import PenName from './pages/account/PenName'
import Security from './pages/account/Security'
import ForgotPassword from './pages/auth/ForgotPassword'
import Claim from './pages/auth/Claim'
import AcceptInvitation from './pages/auth/AcceptInvitation'
import Join from './pages/auth/Join'

import InboxWriter from './pages/inbox/InboxWriter'
import InboxOrg from './pages/inbox/InboxOrg'
import PrintLetter from './pages/inbox/PrintLetter'
import Thread from './pages/correspondence/Thread'
import NewLetter from './pages/correspondence/NewLetter'
import RecordReply from './pages/correspondence/RecordReply'

import BlockedWriters from './pages/org/BlockedWriters'
import CreateWriter from './pages/org/CreateWriter'
import EditWriter from './pages/org/EditWriter'
import GroupInvitations from './pages/org/GroupInvitations'
import GroupKeys from './pages/org/GroupKeys'
import Handoff from './pages/org/Handoff'
import InviteCodes from './pages/org/InviteCodes'
import OrgSettings from './pages/org/OrgSettings'

import AdminLogin from './pages/admin/AdminLogin'
import AuditLog from './pages/admin/AuditLog'
import BanRecommendations from './pages/admin/BanRecommendations'
import Dashboard from './pages/admin/Dashboard'
import PrisonersList from './pages/admin/PrisonersList'
import EditFacility from './pages/admin/EditFacility'
import EditGroup from './pages/admin/EditGroup'
import EditPrisoner from './pages/admin/EditPrisoner'
import FacilitiesList from './pages/admin/FacilitiesList'
import GroupsList from './pages/admin/GroupsList'
import Invitations from './pages/admin/Invitations'
import Queue from './pages/admin/Queue'
import SiteSettings from './pages/admin/SiteSettings'

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
        <TwoFactorSetupLock />
        <PenNameLock />
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
            <Route path="invitation" element={<AcceptInvitation />} />

            <Route element={<RequireAuth roles={['user', 'chapter']} />}>
              {/* The group notices for group admins; writers pass straight through. */}
              <Route element={<GroupGate />}>
                <Route path="inbox" element={<InboxRoute />} />
                <Route path="threads/:id" element={<Thread />} />
                <Route path="letters/new" element={<NewLetter />} />
              </Route>
            </Route>

            {/* Every signed-in account, superadmins included: two-factor sign-in. */}
            <Route element={<RequireAuth />}>
              <Route path="account/security" element={<Security />} />
            </Route>
            <Route element={<RequireAuth roles={['user']} />}>
              <Route path="account/pen-name" element={<PenName />} />
            </Route>

            {/* Group admins (group-admin-plan.md): GroupGate says when the group isn't active or the key isn't held. */}
            <Route element={<RequireAuth roles={['chapter']} />}>
              <Route element={<GroupGate />}>
                <Route path="writers/new" element={<CreateWriter />} />
                <Route path="writers/:id/edit" element={<EditWriter />} />
                <Route path="writers/:id/handoff" element={<Handoff />} />
                <Route path="invite-codes" element={<InviteCodes />} />
                <Route path="settings" element={<OrgSettings />} />
                <Route path="settings/keys" element={<GroupKeys />} />
                <Route path="settings/invitations" element={<GroupInvitations />} />
                <Route path="blocked-writers" element={<BlockedWriters />} />
                <Route path="replies/new" element={<RecordReply />} />
                <Route path="letters/:id/print" element={<PrintLetter />} />
              </Route>
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
                <Route path="bans" element={<BanRecommendations />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="invite" element={<Invitations />} />
                <Route path="settings" element={<SiteSettings />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
