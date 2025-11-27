import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import HomePage from './pages/Home'
import HealthCheckPage from './pages/HealthCheck'
import TournamentPage from './pages/Tournament'
import LoginPage from './pages/Login'

const App = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link to="/" className="text-xl font-semibold text-slate-900">
              ft_transcendence
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link to="/">Home</Link>
              <Link to="/health">Health</Link>
              <Link to="/tournament">Tournament</Link>
              <Link to="/login">ログイン</Link>
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/health" element={<HealthCheckPage />} />
            <Route path="/tournament" element={<TournamentPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App

/*
解説:

1) import { BrowserRouter, Routes, Route, Link } ...
  - React Router v6 の主要コンポーネントを読み込み、Home/Health/Tournament/Login など各ページを紐付ける。

2) <BrowserRouter> ...
  - アプリ全体をルーターで包み、URL 変化を監視できるようにする。
  - 最上位の div には背景グラデーションと最小高さの Tailwind クラスを付与して、シンプルなヒーロー風レイアウトを作る。

3) <header> ...
  - 透明度付きホワイト背景とボーダーを使ったトップバー。`ft_transcendence` のロゴリンクと、`Home` / `Health` へのナビを表示する。

4) <main> / <Routes>
  - ルーティング定義。`/` / `/health` / `/tournament` に加え `/login` で `LoginPage` を描画し、将来の認証導線にも対応できる構成にした。

5) export default App
  - Vite のエントリ (`main.tsx`) から読み込まれるルートコンポーネントとして公開する。
*/
