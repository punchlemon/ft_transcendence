/**
 * なぜテストが必要か:
 * - `/api/health` 呼び出しのローディング・成功・失敗表示が崩れると運用監視に影響するため、UI を通して状態遷移を検証する。
 * - 「トップに戻る」ボタンが確実にルートへ戻すことを保証し、ユーザーがヘルス結果からエントリポイントへ戻れなくなる事故を防ぐ。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HealthCheckPage from './HealthCheck'

type FetchHealthMock = ReturnType<typeof vi.fn>

const mockFetchHealth: FetchHealthMock = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../lib/api', () => ({
  fetchHealth: () => mockFetchHealth()
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

describe('HealthCheckPage', () => {
  beforeEach(() => {
    mockFetchHealth.mockReset()
    mockNavigate.mockReset()
  })

  it('shows loading state and renders health response after success', async () => {
    mockFetchHealth.mockResolvedValue({ status: 'ok', timestamp: new Date('2025-01-01T00:00:00Z').toISOString() })

    render(<HealthCheckPage />)

    expect(screen.getByText('ロード中...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('ok')).toBeInTheDocument()
    })
    expect(screen.queryByText('ロード中...')).not.toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    mockFetchHealth.mockRejectedValue(new Error('network'))

    render(<HealthCheckPage />)

    await waitFor(() => {
      expect(screen.getByText('API へのアクセスに失敗しました')).toBeInTheDocument()
    })
  })

  it('navigates back to home when button is clicked', async () => {
    mockFetchHealth.mockResolvedValue({ status: 'ok', timestamp: new Date().toISOString() })
    const user = userEvent.setup()

    render(<HealthCheckPage />)

    await user.click(screen.getByRole('button', { name: 'トップに戻る' }))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

/*
解説:

1) mockFetchHealth / mockNavigate
  - API クライアントと React Router を差し替え、コンポーネントの副作用をテスト中に完全制御できるようにする。

2) shows loading state ...
  - 成功応答の場合にローディング→結果表示へ遷移することを `waitFor` で検証し、UI が最新ステータスを描画することを担保する。

3) shows error message ...
  - API 失敗時に日本語エラーメッセージが表示されるかを確認し、監視担当者が異常に気づけるよう保証する。

4) navigates back ...
  - 「トップに戻る」操作が `/` へ遷移させることを確認し、ヘルス画面からの導線を守る。
*/
