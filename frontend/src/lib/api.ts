import axios from 'axios'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const shouldUseRelativeBase =
  !rawBaseUrl ||
  rawBaseUrl === '/' ||
  rawBaseUrl === '/api' ||
  rawBaseUrl.startsWith('http://backend') ||
  rawBaseUrl.startsWith('https://backend')

const resolvedBaseUrl = shouldUseRelativeBase ? '/api' : rawBaseUrl
const baseURL = resolvedBaseUrl?.endsWith('/') ? resolvedBaseUrl.slice(0, -1) : resolvedBaseUrl

const apiClient = axios.create({
  baseURL
})

export const fetchHealth = async () => {
  const response = await apiClient.get('/health')
  return response.data as { status: string; timestamp: string }
}

/*
解説:

1) import axios
  - HTTP クライアントとして axios を使用し、共通のベース URL 設定を一箇所に集約する。

2) rawBaseUrl / shouldUseRelativeBase / resolvedBaseUrl
  - 環境変数 `VITE_API_BASE_URL` を解釈し、Docker 経由の `http://backend` や未設定の場合は相対パス `/api` にフォールバックしてフロント/バック間のプロキシ互換を確保する。

3) const apiClient = axios.create
  - 計算した `baseURL` で axios インスタンスを生成し、以降の API 呼び出しで URL の重複指定を避ける。

4) export const fetchHealth
  - `/health` エンドポイントを叩き、型情報 `{ status: string; timestamp: string }` とともにデータを返すユーティリティ。フロントの各画面から使い回せるようエクスポートする。
*/
