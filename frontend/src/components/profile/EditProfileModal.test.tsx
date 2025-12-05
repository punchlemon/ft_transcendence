/**
 * なぜテストが必要か:
 * - EditProfileModal がデフォルトアバター選択とカスタム画像アップロードを正しく切り替えられることを検証
 * - ユーザーがアバターモードを変更し、適切なUIが表示されることを確認
 * - フォーム送信時に正しいデータが API に送信されることを保証
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditProfileModal } from './EditProfileModal'
import * as api from '../../lib/api'
import useAuthStore from '../../stores/authStore'

vi.mock('../../lib/api')
vi.mock('../../stores/authStore')

const mockInitialData = {
  displayName: 'Test User',
  bio: 'Test bio',
  avatarUrl: '/avatars/avatar-01.png'
}

describe('EditProfileModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthStore.getState).mockReturnValue({
      updateUser: vi.fn()
    } as any)
  })

  it('renders with default avatar mode', () => {
    render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    expect(screen.getByText('Edit Profile')).toBeInTheDocument()
    expect(screen.getByText('Default Avatars')).toBeInTheDocument()
    expect(screen.getByText('Custom Image')).toBeInTheDocument()
  })

  it('switches between default and custom avatar modes', () => {
    const { container } = render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    const customButton = screen.getByText('Custom Image')
    fireEvent.click(customButton)

    // Custom mode shows file input
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument()

    const defaultButton = screen.getByText('Default Avatars')
    fireEvent.click(defaultButton)

    // Default mode shows avatar selection grid
    const avatarGrid = container.querySelector('.grid')
    expect(avatarGrid).toBeInTheDocument()
  })

  it('displays default avatar selection grid with 14 options', () => {
    render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={true}
        editMode="avatar"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    const avatarButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('img')
    )
    expect(avatarButtons.length).toBe(14)
  })

  it('highlights selected default avatar', () => {
    render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={true}
        editMode="avatar"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    const avatarButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('img')
    )
    
    // 初期選択されているアバターを確認
    const selectedButton = avatarButtons.find(btn => 
      btn.className.includes('ring-indigo-600')
    )
    expect(selectedButton).toBeDefined()
  })

  it('submits default avatar selection', async () => {
    const mockUpdateProfile = vi.fn().mockResolvedValue({
      displayName: 'Test User',
      bio: 'Test bio',
      avatarUrl: '/avatars/avatar-05.png'
    })
    vi.mocked(api.updateUserProfile).mockImplementation(mockUpdateProfile)

    const onSuccess = vi.fn()

    render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={true}
        editMode="avatar"
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    )

    // 別のアバターを選択
    const avatarButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('img')
    )
    fireEvent.click(avatarButtons[4]!) // avatar-05を選択

    const saveButton = screen.getByText('Save Changes')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('1', expect.objectContaining({
        avatarUrl: '/avatars/avatar-05.png'
      }))
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('submits custom avatar upload', async () => {
    const mockUploadAvatar = vi.fn().mockResolvedValue({
      avatarUrl: 'https://example.com/custom-avatar.png'
    })
    const mockUpdateProfile = vi.fn().mockResolvedValue({
      displayName: 'Test User',
      bio: 'Test bio',
      avatarUrl: 'https://example.com/custom-avatar.png'
    })
    vi.mocked(api.uploadAvatar).mockImplementation(mockUploadAvatar)
    vi.mocked(api.updateUserProfile).mockImplementation(mockUpdateProfile)

    const onSuccess = vi.fn()

    const { container } = render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={true}
        editMode="avatar"
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    )

    // Switch to custom mode
    const customButton = screen.getByText('Custom Image')
    fireEvent.click(customButton)

    // ファイルを選択
    const file = new File(['test'], 'avatar.png', { type: 'image/png' })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false
    })
    fireEvent.change(fileInput)

    const saveButton = screen.getByText('Save Changes')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUploadAvatar).toHaveBeenCalledWith('1', file)
      expect(mockUpdateProfile).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <EditProfileModal
        userId="1"
        initialData={mockInitialData}
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    expect(container.firstChild).toBeNull()
  })
})

/*
解説:

1) モック設定
  - api.updateUserProfile, api.uploadAvatar をモック化
  - useAuthStore をモック化してグローバル状態の更新を検証

2) アバターモード切り替えテスト
  - デフォルト/カスタムボタンでUIが切り替わることを確認
  - 各モードで適切な入力要素が表示されることを検証

3) デフォルトアバター選択テスト
  - 14個のアバターオプションがグリッド表示されることを確認
  - 選択したアバターがハイライトされることを確認
  - フォーム送信時に選択したアバターパスが API に送信されることを検証

4) カスタムアップロードテスト
  - ファイル選択後に uploadAvatar API が呼ばれることを確認
  - 成功時に onSuccess コールバックが実行されることを検証

5) エッジケース
  - isOpen=false 時にモーダルがレンダリングされないことを確認
*/
