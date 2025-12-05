import { useState } from 'react'
import { updateUserProfile, uploadAvatar, deleteAvatar } from '../../lib/api'
import useAuthStore from '../../stores/authStore'

interface EditProfileModalProps {
  userId: string
  initialData: {
    displayName: string
    bio: string
    avatarUrl: string
  }
  isOpen: boolean
  editMode?: 'all' | 'avatar' | 'displayName' | 'bio'
  onClose: () => void
  onSuccess: (updatedData: any) => void
}

export const EditProfileModal = ({ userId, initialData, isOpen, editMode = 'all', onClose, onSuccess }: EditProfileModalProps) => {
  const [displayName, setDisplayName] = useState(initialData.displayName)
  const [bio, setBio] = useState(initialData.bio)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleDeleteAvatar = async () => {
    if (!confirm('Are you sure you want to remove your avatar?')) return
    setIsSubmitting(true)
    setError(null)
    try {
      const updated = await deleteAvatar(userId)
      useAuthStore.getState().updateUser({
        avatarUrl: undefined
      })
      onSuccess(updated)
      onClose()
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.error?.message || 'Failed to delete avatar')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      let currentAvatarUrl = initialData.avatarUrl

      if ((editMode === 'all' || editMode === 'avatar') && selectedFile) {
        const updatedUser = await uploadAvatar(userId, selectedFile)
        currentAvatarUrl = updatedUser.avatarUrl || ''
      }

      const payload: any = {}
      if (editMode === 'all' || editMode === 'displayName') payload.displayName = displayName
      if (editMode === 'all' || editMode === 'bio') payload.bio = bio
      if (editMode === 'all' || editMode === 'avatar') payload.avatarUrl = currentAvatarUrl

      const updated = await updateUserProfile(userId, payload)

      useAuthStore.getState().updateUser({
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl ?? undefined
      })

      onSuccess(updated)
      onClose()
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.error?.message || 'Failed to update profile')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getTitle = () => {
    switch (editMode) {
      case 'avatar': return 'Edit Avatar'
      case 'displayName': return 'Edit Display Name'
      case 'bio': return 'Edit Bio'
      default: return 'Edit Profile'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-slate-900">{getTitle()}</h2>
        
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(editMode === 'all' || editMode === 'displayName') && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
                minLength={1}
                maxLength={32}
              />
            </div>
          )}

          {(editMode === 'all' || editMode === 'bio') && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={3}
                maxLength={255}
              />
            </div>
          )}

          {(editMode === 'all' || editMode === 'avatar') && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">Avatar Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0])
                    }
                  }}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
                />
                {initialData.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleDeleteAvatar}
                    className="mt-2 text-sm text-red-600 hover:text-red-800 hover:underline"
                    disabled={isSubmitting}
                  >
                    Remove current avatar
                  </button>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
