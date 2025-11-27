import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import HomePage from './pages/Home'
import HealthCheckPage from './pages/HealthCheck'
import TournamentPage from './pages/Tournament'
import LoginPage from './pages/Login'
import MfaChallengePage from './pages/MfaChallenge'
import OAuthCallbackPage from './pages/OAuthCallback'
import ProfilePage from './pages/Profile'
import GameLobbyPage from './pages/GameLobby'
import GameRoomPage from './pages/GameRoom'
import useAuthStore from './stores/authStore'

const App = () => {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)

  useEffect(() => {
    useAuthStore.getState().hydrateFromStorage()
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link to="/" className="text-xl font-semibold text-slate-900">
              ft_transcendence
            </Link>
            <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <Link to="/">Home</Link>
              <Link to="/game/new">Game</Link>
              <Link to="/health">Health</Link>
              <Link to="/tournament">Tournament</Link>
              {user ? (
                <div className="flex items-center gap-3" data-testid="navbar-auth-state">
                  <span className="text-xs font-semibold text-slate-900 sm:text-sm">
                    {user.displayName} でログイン中
                  </span>
                  <button
                    type="button"
                    onClick={clearSession}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ログアウト
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  ログイン
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/health" element={<HealthCheckPage />} />
            <Route path="/tournament" element={<TournamentPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/2fa" element={<MfaChallengePage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/game/new" element={<GameLobbyPage />} />
            <Route path="/game/:id" element={<GameRoomPage />} />
          </Routes>
        </main>
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
