import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import GameLobbyPage from './GameLobby'
import Button from '../components/ui/Button'

const HomePage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      {user ? (
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Welcome, {user.displayName}</h1>
        </div>
      ) : (
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-slate-100">ft_transcendence</h1>
          <p className="mb-6 text-lg text-slate-600 dark:text-slate-400">Welcome to the Pong-based game. Please login to start playing.</p>
        </div>
      )}

      <GameLobbyPage />
    </div>
  )
}

export default HomePage

/*
解説:

1) import { useNavigate } ... Button
  - React Router の `useNavigate` でページ遷移を行い、共通 UI コンポーネント `Button` を再利用するために読み込む。

2) const HomePage = () => { ... }
  - トップ画面としてシンプルなヒーローレイアウトを返す関数コンポーネント。`navigate` フックでヘルスチェック画面へ遷移するボタンハンドラを保持する。

3) JSX 構造
  - タイトル、説明文、2 つのボタンをセンタリングし、Tailwind クラスで余白と配色を定義している。`/health` への導線に加えて `/tournament` へ遷移するボタンでゲーム機能への入口を示す。

4) export default HomePage
  - `App.tsx` のルーティングから利用されるようデフォルトエクスポートする。
*/
