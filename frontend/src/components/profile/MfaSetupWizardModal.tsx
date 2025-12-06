import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { fetchMfaSetup, fetchMe, getBackupCodes, verifyMfa } from '../../lib/api'
import useAuthStore from '../../stores/authStore'

export type MfaSetupWizardModalProps = {
  onClose: () => void
  onEnabled: () => void
  onBackupCodes: (codes: string[], remaining: number) => void
}

type Step = 1 | 2 | 3

const MfaSetupWizardModal = ({ onClose, onEnabled, onBackupCodes }: MfaSetupWizardModalProps) => {
  const updateUser = useAuthStore((state) => state.updateUser)
  const [step, setStep] = useState<Step>(1)
  const [secret, setSecret] = useState('')
  const [otpauthUrl, setOtpauthUrl] = useState('')
  const [QRCodeComponent, setQRCodeComponent] = useState<ComponentType<{ value: string; size?: number } | any> | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setupStartedRef = useRef(false)

  const startSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchMfaSetup()
      setSecret(res.secret)
      setOtpauthUrl(res.otpauthUrl)
      setStep(1)
    } catch (err) {
      setError('Failed to start setup. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Avoid making duplicate network requests during React StrictMode double-mount in dev.
    if (!setupStartedRef.current) {
      setupStartedRef.current = true
      void startSetup()
    }

    // Dynamically import the QR code renderer (non-blocking)
    void (async () => {
      try {
        const mod = await import('qrcode.react')
        const comp = mod?.QRCodeSVG ?? mod?.default ?? null
        setQRCodeComponent(comp)
      } catch (err) {
        setQRCodeComponent(null)
      }
    })()
  }, [])

  const handleVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      await verifyMfa(code)
      const me = await fetchMe()
      updateUser(me)
      onEnabled()
      setStep(3)
      const codes = await getBackupCodes(true)
      if (codes.regenerated) {
        setBackupCodes(codes.codes)
        onBackupCodes(codes.codes, codes.remaining)
      }
    } catch (err) {
      setError('Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Set up two-factor authentication</h2>
            <p className="mt-1 text-sm text-slate-600">Follow the steps to enable 2FA.</p>
          </div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose} aria-label="Close 2FA setup">
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700" aria-live="polite">
              {error}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setError(null)
                  void startSetup()
                }}
              >
                Retry
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Step 1: Scan this QR with your authenticator app or enter the secret manually.
            </p>
            <div className="mx-auto flex w-full flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {loading ? (
                <div className="w-full text-center py-10 text-sm text-slate-500">Loading setup…</div>
              ) : otpauthUrl && QRCodeComponent ? (
                <QRCodeComponent value={otpauthUrl} size={160} />
              ) : otpauthUrl ? (
                <div className="w-full text-center text-sm text-slate-700">QR preview unavailable — copy the secret into your authenticator app.</div>
              ) : null}
              <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Secret (Base32)</span>
                  <div className="flex items-center gap-2 text-xs">
                    <button className="text-indigo-600" onClick={() => setShowSecret((v) => !v)}>
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                    <button className="text-indigo-600" onClick={() => navigator.clipboard.writeText(secret)}>
                      Copy
                    </button>
                  </div>
                </div>
                <div className="mt-2 font-mono text-xs text-slate-900">{showSecret ? secret : '••••••••••••••••••••••••'}</div>
              </div>
              <p className="text-xs text-amber-700">Do not share this secret. Screenshots may expose it.</p>
            </div>
            <div className="flex justify-end">
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                onClick={() => setStep(2)}
                disabled={loading}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">Step 2: Enter the 6-digit code from your authenticator app.</p>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
              value={code}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
            />
            <div className="flex justify-between">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={code.length !== 6 || loading}
                onClick={handleVerify}
              >
                {loading ? 'Verifying...' : 'Verify code'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && backupCodes && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Step 3: Save these backup codes. They will not be shown again.
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
              <p className="mt-3 text-xs text-amber-700">
                Keep these codes in a safe place. Old codes become invalid after regeneration.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))}
              >
                Copy all
              </button>
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => downloadTxt('backup-codes.txt', backupCodes.join('\n'))}
              >
                Download .txt
              </button>
              <div className="flex-1" />
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const downloadTxt = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default MfaSetupWizardModal
