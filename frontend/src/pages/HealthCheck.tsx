import { useEffect, useState } from 'react'
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
        console.error(err)
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
