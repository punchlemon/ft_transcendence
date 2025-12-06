import { useState } from 'react'
import { disableMfa } from '../../lib/api'

export type MfaDisableModalProps = {
  onClose: () => void
  onDisabled: () => void
}

const BACKUP_REGEX = /^[A-Z0-9]{5}-[A-Z0-9]{5}$/

const MfaDisableModal = ({ onClose, onDisabled }: MfaDisableModalProps) => {
  const [useBackup, setUseBackup] = useState(false)
  const [code, setCode] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isDisabled = () => {
    if (loading) return true
    if (useBackup) return !BACKUP_REGEX.test(backupCode)
    return code.length !== 6
  }

  const submit = async () => {
    setError(null)
    setLoading(true)
    try {
      await disableMfa({ code: useBackup ? undefined : code, backupCode: useBackup ? backupCode : undefined })
      onDisabled()
      onClose()
    } catch (err) {
      setError('Failed to disable 2FA. Please check the code and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Disable two-factor authentication</h2>
            <p className="mt-1 text-sm text-slate-600">Confirm with a TOTP code or a backup code.</p>
          </div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose} aria-label="Close disable 2FA modal">
            ✕
          </button>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            checked={useBackup}
            onChange={(e) => {
              setUseBackup(e.target.checked)
              setError(null)
            }}
          />
          Use backup code
        </label>

        {useBackup ? (
          <input
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11))}
            placeholder="AAAAA-BBBBB"
          />
        ) : (
          <input
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="123456"
          />
        )}

        {error && (
          <p className="mt-2 text-sm text-red-700" aria-live="polite">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isDisabled()}
            onClick={submit}
          >
            {loading ? 'Disabling...' : 'Disable 2FA'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MfaDisableModal
