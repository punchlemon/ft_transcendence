import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import HomePage from './pages/Home'
import HealthCheckPage from './pages/HealthCheck'

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
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/health" element={<HealthCheckPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
