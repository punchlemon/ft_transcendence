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
      <div className="flex gap-4">
        <Button onClick={() => navigate('/health')}>ヘルスチェックへ</Button>
        <Button variant="secondary" disabled>
          Coming soon...
        </Button>
      </div>
    </div>
  )
}

export default HomePage
