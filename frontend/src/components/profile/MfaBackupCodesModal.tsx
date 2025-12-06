import { useMemo } from 'react'

export type MfaBackupCodesModalProps = {
  codes: string[]
  onClose: () => void
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

const MfaBackupCodesModal = ({ codes, onClose }: MfaBackupCodesModalProps) => {
  const codesText = useMemo(() => codes.join('\n'), [codes])

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codesText)
    } catch (error) {
      console.error('Failed to copy backup codes', error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Backup codes</h2>
            <p className="mt-1 text-sm text-slate-600">
              These codes are shown only once. Store them securely.
            </p>
          </div>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close backup codes"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900">
          <div className="grid grid-cols-2 gap-2">
            {codes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-amber-700">
            Do not share these codes. Old codes are invalidated after regeneration.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={copyAll}
          >
            Copy all
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => downloadTxt('backup-codes.txt', codesText)}
          >
            Download .txt
          </button>
          <div className="flex-1" />
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default MfaBackupCodesModal
