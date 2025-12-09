import { useEffect, useState } from 'react'
import logger from '../lib/logger'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { fetchHealth } from '../lib/api'

type HealthResponse = {
  status: string
  timestamp: string
}

const HealthCheckPage = () => {
  const navigate = useNavigate()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadHealth = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchHealth()
        setHealth(data)
      } catch (err) {
        setError('API へのアクセスに失敗しました')
        logger.error(err)
      } finally {
        setLoading(false)
      }
    }

    void loadHealth()
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">ヘルスチェック</h1>
        <p className="text-slate-600">バックエンドの `/api/health` を呼び出して状態を確認します。</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading && <p className="text-slate-500">ロード中...</p>}
        {!loading && health && (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-emerald-600">{health.status}</p>
            <p className="text-sm text-slate-500">{new Date(health.timestamp).toLocaleString()}</p>
          </div>
        )}
        {!loading && error && <p className="text-rose-500">{error}</p>}
      </div>

      <Button variant="secondary" onClick={() => navigate('/')}>
        トップに戻る
      </Button>
    </div>
  )
}

export default HealthCheckPage

/*
解説:

1) import 群 / type HealthResponse
  - React のステート・副作用フック、ルーティングの `useNavigate`、共通 Button、`fetchHealth` API クライアントを読み込み、ヘルスチェック結果の型を定義する。

2) const HealthCheckPage = () => { ... }
  - `health`, `error`, `loading` の 3 種の状態を管理し、ユーザー操作なしでもバックエンドの状態を取得できるようにする。

3) useEffect -> loadHealth
  - 初回マウント時に `fetchHealth` を呼び出し、ローディング/エラーを制御する。API 失敗時は日本語メッセージを表示する。

4) JSX レイアウト
  - API 応答をカード表示し、ステータス/タイムスタンプ/エラー/ローディングを条件分岐で描画。最後にトップへ戻るボタンを配置してナビゲーションを完結させる。

5) export default HealthCheckPage
  - ルーターから参照されるようデフォルトエクスポートする。
*/
