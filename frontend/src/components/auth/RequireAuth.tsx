import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const location = useLocation()

  if (!isHydrated) {
    return null
  }

  if (!user) {
    const redirectTo = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectTo)}`} replace />
  }

  return <>{children}</>
}

export default RequireAuth
