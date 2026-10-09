import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { GroupProvider } from './context/GroupContext'
import { useAuth } from './hooks/useAuth'
import { SiteLayout, SignedInLayout } from './components/layout/Layouts'
import GroupGate from './components/layout/GroupGate'
import { PenNameLock, RequireAdmin, RequireAuth, TwoFactorSetupLock } from './components/layout/RouteGuards'
import ScrollToTop from './components/layout/ScrollToTop'

// The public directory stays in the main chunk, so the front page never waits.
import Index from './pages/public/Index'
import Prisoners from './pages/public/Prisoners'
import PrisonerProfile from './pages/public/PrisonerProfile'
import Facilities from './pages/public/Facilities'
import FacilityProfile from './pages/public/FacilityProfile'
import Groups from './pages/public/Groups'
import GroupProfile from './pages/public/GroupProfile'
import About from './pages/public/About'

// Everything behind sign-in is fetched on first visit, a chunk per page.
// AdminLayout is lazy as well, which takes the inlined admin.css string with it.
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'))
const AdminStyles = lazy(() =>
  import('./components/layout/AdminLayout').then((m) => ({ default: m.AdminStyles })),
)

const Login = lazy(() => import('./pages/auth/Login'))
const ChangePassword = lazy(() => import('./pages/account/ChangePassword'))
const PenName = lazy(() => import('./pages/account/PenName'))
const RecoveryCode = lazy(() => import('./pages/account/RecoveryCode'))
const Security = lazy(() => import('./pages/account/Security'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const Claim = lazy(() => import('./pages/auth/Claim'))
const AcceptInvitation = lazy(() => import('./pages/auth/AcceptInvitation'))
const Join = lazy(() => import('./pages/auth/Join'))

const InboxWriter = lazy(() => import('./pages/inbox/InboxWriter'))
const InboxOrg = lazy(() => import('./pages/inbox/InboxOrg'))
const PrintLetter = lazy(() => import('./pages/inbox/PrintLetter'))
const Thread = lazy(() => import('./pages/correspondence/Thread'))
const NewLetter = lazy(() => import('./pages/correspondence/NewLetter'))
const RecordReply = lazy(() => import('./pages/correspondence/RecordReply'))

const BlockedWriters = lazy(() => import('./pages/org/BlockedWriters'))
const CreateWriter = lazy(() => import('./pages/org/CreateWriter'))
const EditWriter = lazy(() => import('./pages/org/EditWriter'))
const GroupInvitations = lazy(() => import('./pages/org/GroupInvitations'))
const GroupKeys = lazy(() => import('./pages/org/GroupKeys'))
const Handoff = lazy(() => import('./pages/org/Handoff'))
const InviteCodes = lazy(() => import('./pages/org/InviteCodes'))
const OrgSettings = lazy(() => import('./pages/org/OrgSettings'))

const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog'))
const BanRecommendations = lazy(() => import('./pages/admin/BanRecommendations'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const PrisonersList = lazy(() => import('./pages/admin/PrisonersList'))
const EditFacility = lazy(() => import('./pages/admin/EditFacility'))
const EditGroup = lazy(() => import('./pages/admin/EditGroup'))
const EditPrisoner = lazy(() => import('./pages/admin/EditPrisoner'))
const FacilitiesList = lazy(() => import('./pages/admin/FacilitiesList'))
const GroupsList = lazy(() => import('./pages/admin/GroupsList'))
const Invitations = lazy(() => import('./pages/admin/Invitations'))
const Queue = lazy(() => import('./pages/admin/Queue'))
const SiteSettings = lazy(() => import('./pages/admin/SiteSettings'))
const Users = lazy(() => import('./pages/admin/Users'))
const EditUser = lazy(() => import('./pages/admin/EditUser'))

/** /inbox shows the writer or the group view by role; superadmins have no inbox. */
function InboxRoute() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  return user?.role === 'chapter' ? <InboxOrg /> : <InboxWriter />
}

export default function App() {
  return (
    <AuthProvider>
      {/* The signed-in group admin's group record, fetched once for every page (useGroup). */}
      <GroupProvider>
      <BrowserRouter>
        <ScrollToTop />
        <TwoFactorSetupLock />
        <PenNameLock />
        {/* A lazy page's first load (LoadState's wording); a link click keeps the old page up until the chunk is in. */}
        <Suspense fallback={<p className="wrap">Loading…</p>}>
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
              <Route path="account/recovery-code" element={<RecoveryCode />} />
              <Route path="account/password" element={<ChangePassword />} />
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
                <Route path="users" element={<Users />} />
                <Route path="users/:id" element={<EditUser />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </GroupProvider>
    </AuthProvider>
  )
}
