import React, { useState, useEffect } from 'react'
import { updateUserProfile, uploadAvatar } from '../../lib/api'
import useAuthStore from '../../stores/authStore'
import { DEFAULT_AVATARS } from '../../lib/avatars'

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [avatarMode, setAvatarMode] = useState<'default' | 'custom'>('default')
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string>(initialData.avatarUrl)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cleanup preview URL when modal closes or reopens
  useEffect(() => {
    if (!isOpen) {
      // Clean up preview URL and reset custom image state when modal closes
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl(null)
      setSelectedFile(null)
    }
  }, [isOpen, previewUrl])

  // Cleanup preview URL when switching away from custom mode
  useEffect(() => {
    if (avatarMode !== 'custom' && previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setSelectedFile(null)
    }
  }, [avatarMode, previewUrl])

  if (!isOpen) return null

  const handleClose = () => {
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      let currentAvatarUrl = initialData.avatarUrl

      if (editMode === 'all' || editMode === 'avatar') {
        if (avatarMode === 'custom' && selectedFile) {
          const updatedUser = await uploadAvatar(userId, selectedFile)
          currentAvatarUrl = updatedUser.avatarUrl || ''
        } else if (avatarMode === 'default') {
          currentAvatarUrl = selectedDefaultAvatar
        }
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Avatar Image</label>
                
                {/* Avatar mode selection tabs */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setAvatarMode('default')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md ${
                      avatarMode === 'default'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Default Avatars
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarMode('custom')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md ${
                      avatarMode === 'custom'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Custom Image
                  </button>
                </div>

                {/* Default avatar selection */}
                {avatarMode === 'default' && (
                  <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 rounded-md max-h-60 overflow-y-auto">
                    {DEFAULT_AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => setSelectedDefaultAvatar(avatar)}
                        className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all hover:scale-105 ${
                          selectedDefaultAvatar === avatar
                            ? 'border-indigo-600 ring-2 ring-indigo-600'
                            : 'border-slate-300'
                        }`}
                      >
                        <img
                          src={avatar}
                          alt="Avatar option"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom image upload */}
                {avatarMode === 'custom' && (
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      ref={(input) => {
                        if (input) {
                          (input as any)._fileInputRef = input
                        }
                      }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0]
                          setSelectedFile(file)
                          // Create preview URL
                          const url = URL.createObjectURL(file)
                          setPreviewUrl(url)
                        }
                      }}
                      className="hidden"
                      id="custom-avatar-input"
                    />
                    {previewUrl ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-slate-300">
                          <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null)
                            if (previewUrl) {
                              URL.revokeObjectURL(previewUrl)
                            }
                            setPreviewUrl(null)
                            // Open file dialog immediately
                            document.getElementById('custom-avatar-input')?.click()
                          }}
                          className="text-sm text-slate-600 hover:text-slate-900 underline"
                        >
                          Choose different image
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="custom-avatar-input" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <svg className="w-8 h-8 mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-sm text-slate-500">Click to upload image</p>
                        </div>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
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
