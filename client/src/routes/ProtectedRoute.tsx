import { Navigate, Outlet } from 'react-router-dom'
import { homePathFor, useAuth } from '../context/AuthContext'
import type { Role } from '../context/AuthContext'

// Blocks the route unless: logged in -> email verified -> (optionally) has the given role
export default function ProtectedRoute({ role }: { role?: Role }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />
  if (role && user.role !== role) return <Navigate to={homePathFor(user.role)} replace />
  return <Outlet />
}
