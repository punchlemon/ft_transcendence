import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMe, getBackupCodes } from '../../lib/api'
import useAuthStore from '../../stores/authStore'
import MfaBackupCodesModal from './MfaBackupCodesModal'
import MfaDisableModal from './MfaDisableModal'
import MfaSetupWizardModal from './MfaSetupWizardModal'

const Profile2FASection = () => {
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [showDisable, setShowDisable] = useState(false)
  const [codesForModal, setCodesForModal] = useState<string[] | null>(null)
  const [accordionOpen, setAccordionOpen] = useState(false)

  const twoFAEnabled = !!user?.twoFAEnabled

  const fetchRemaining = useCallback(async () => {
    if (!twoFAEnabled) {
      setRemaining(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await getBackupCodes(false)
      if (!res.regenerated) {
        setRemaining(res.remaining)
      }
    } catch (err) {
      setError('Failed to load backup codes. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [twoFAEnabled])

  useEffect(() => {
    // Ensure latest twoFAEnabled is reflected by fetching /users/me once
    const syncMe = async () => {
      try {
        const me = await fetchMe()
        updateUser(me)
      } catch (error) {
        // ignore
      }
    }
    if (user) void syncMe()
  }, [user, updateUser])

  useEffect(() => {
    if (twoFAEnabled) {
      void fetchRemaining()
    }
  }, [twoFAEnabled, fetchRemaining])

  const statusBadge = useMemo(() => {
    if (twoFAEnabled) {
      return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Enabled</span>
    }
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">Disabled</span>
  }, [twoFAEnabled])

  if (!user) return null

  const handleRegenerate = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await getBackupCodes(true)
      if (res.regenerated) {
        setRemaining(res.remaining)
        setCodesForModal(res.codes)
      }
    } catch (err) {
      setError('Failed to regenerate backup codes. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        className="flex w-full items-center justify-between md:cursor-default"
        onClick={() => setAccordionOpen((v) => !v)}
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Two-factor authentication</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Add a 6-digit code step to sign-in.</p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <span className="md:hidden text-slate-500 text-sm">{accordionOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      <div className={`mt-3 space-y-3 ${accordionOpen ? 'block' : 'hidden md:block'}`}>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span>Backup codes remaining:</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {loading ? 'Loading...' : remaining ?? '—'}
          </span>
          {error && <span className="text-red-600" aria-live="polite">{error}</span>}
        </div>

        <div className="text-xs text-amber-700 dark:text-amber-400">
          QR/secret and backup codes must be kept private. Regenerating codes invalidates older ones.
        </div>

        <div className="flex flex-wrap gap-3">
          {!twoFAEnabled ? (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              onClick={() => setShowSetup(true)}
            >
              Set up two-factor authentication
            </button>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
                onClick={handleRegenerate}
                disabled={loading}
              >
                {loading ? 'Generating…' : 'Regenerate backup codes'}
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/40"
                onClick={() => setShowDisable(true)}
              >
                Disable two-factor authentication
              </button>
            </>
          )}
        </div>
      </div>

      {showSetup && (
        <MfaSetupWizardModal
          onClose={() => setShowSetup(false)}
          onEnabled={() => {
            updateUser({ twoFAEnabled: true })
            setRemaining(10)
          }}
          onBackupCodes={(codes, remainingCount) => {
            setCodesForModal(codes)
            setRemaining(remainingCount)
          }}
        />
      )}

      {showDisable && (
        <MfaDisableModal
          onClose={() => setShowDisable(false)}
          onDisabled={() => {
            updateUser({ twoFAEnabled: false })
            setRemaining(null)
            setCodesForModal(null)
          }}
        />
      )}

      {codesForModal && (
        <MfaBackupCodesModal
          codes={codesForModal}
          onClose={() => setCodesForModal(null)}
        />
      )}
    </section>
  )
}

export default Profile2FASection
