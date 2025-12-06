import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import HomePage from './pages/Home'
// HealthCheckPage removed from routes — health endpoint not needed on Home
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import MfaChallengePage from './pages/MfaChallenge'
import OAuthCallbackPage from './pages/OAuthCallback'
import ProfilePage from './pages/Profile'
import UsersPage from './pages/Users'
import GameRoomPage from './pages/GameRoom'
import ChatDrawer from './components/chat/ChatDrawer'
import UserMenu from './components/ui/UserMenu'
import useAuthStore from './stores/authStore'
import { useChatStore } from './stores/chatStore'
import { useNotificationStore } from './stores/notificationStore'
import RequireAuth from './components/auth/RequireAuth'
import { disconnectChatWs } from './lib/chatWs'
import { api } from './lib/api'
import { useDarkMode } from './hooks/useDarkMode'

const App = () => {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const resetChat = useChatStore((state) => state.reset)
  const resetNotifications = useNotificationStore((state) => state.reset)

  // デバイスのダークモード設定を自動検出して適用
  useDarkMode()

  const handleLogout = async () => {
    const refreshToken = useAuthStore.getState().refreshToken
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken })
      } catch (error) {
        console.error('Logout API call failed', error)
      }
    }
    disconnectChatWs()
    clearSession()
    resetChat()
    resetNotifications()
  }

  useEffect(() => {
    useAuthStore.getState().hydrateFromStorage()
  }, [])

  function AuthRedirectOnLogout() {
    const user = useAuthStore((s) => s.user)
    const isHydrated = useAuthStore((s) => s.isHydrated)
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
      if (!isHydrated) return // Wait for hydration

      if (!user) {
        // Allow auth-related routes to remain accessible (login/register/2fa/oauth callback)
        const allowedPrefixes = ['/login', '/register', '/auth', '/oauth']
        const current = location.pathname || '/'
        const isAllowed = allowedPrefixes.some((p) => current.startsWith(p))
        if (!isAllowed) {
          navigate('/login', { replace: true })
        }
      }
    }, [user, isHydrated, navigate, location])

    if (!isHydrated) return null // Or a loading spinner

    return null
  }

  return (
    <BrowserRouter>
      <AuthRedirectOnLogout />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link to="/" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              ft_transcendence
            </Link>
            <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              {user && <Link to="/">Home</Link>}
              {user ? (
                <>
                  <Link to="/users">Users</Link>
                </>
              ) : null}
              {user ? (
                <div className="flex items-center gap-3" data-testid="navbar-auth-state">
                  <UserMenu />
                  <button
                    onClick={handleLogout}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/2fa" element={<MfaChallengePage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route
              path="/users"
              element={
                <RequireAuth>
                  <UsersPage />
                </RequireAuth>
              }
            />
            <Route
              path="/game/:id"
              element={
                <RequireAuth>
                  <GameRoomPage />
                </RequireAuth>
              }
            />
            <Route
              path="/:username"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
          </Routes>
        </main>

        {user && <ChatDrawer />}
      </div>
    </BrowserRouter>
  )
}

export default App

/*
解説:

1) useAuthStore の導入
  - Zustand ストアからユーザー情報とログアウトアクションを取得し、`useEffect` でアプリ起動時に `hydrateFromStorage()` を呼び出してセッションを復元している。

2) ルーティング構成
  - React Router v6 の `<BrowserRouter>` / `<Routes>` / `<Route>` を利用して Home / Health / Tournament / Login / 2FA / OAuth Callback を描画し、SPA の基本導線と認証フローを構築する。

3) ナビゲーションバー
  - 共通リンクに加えて、認証状態に応じて「ログイン」リンクまたは「ログイン中 + ログアウトボタン」を表示し、ストア状態が UI に反映されることを確認している。

4) レイアウト
  - 背景グラデーションとヘッダーボーダーでシンプルな見た目を維持しつつ、認証導線を目立たせている。

5) export default App
  - Vite エントリポイントから読み込まれるトップレベルコンポーネントとして公開している。
*/
