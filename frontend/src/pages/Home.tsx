import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'

const HomePage = () => {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-slate-900">ft_transcendence</h1>
      <p className="text-lg text-slate-600">
        Pong をベースにした SPA を構築する最終課題です。まずはバックエンドのヘルスチェックから動作確認しましょう。
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => navigate('/health')}>ヘルスチェックへ</Button>
        <Button variant="secondary" onClick={() => navigate('/tournament')}>
          トーナメント管理を開く
        </Button>
      </div>
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
