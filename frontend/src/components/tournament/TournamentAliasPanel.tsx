import { FormEvent } from 'react'
import Button from '../ui/Button'

type TournamentAliasPanelProps = {
  aliasInput: string
  onAliasChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  errorMessage?: string | null
  infoMessage?: string | null
  isSubmitDisabled?: boolean
}

const TournamentAliasPanel = ({
  aliasInput,
  onAliasChange,
  onSubmit,
  errorMessage,
  infoMessage,
  isSubmitDisabled
}: TournamentAliasPanelProps) => {
  return (
    <div className="mt-6">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit} aria-label="tournament entry form">
        <input
          type="text"
          value={aliasInput}
          onChange={(event) => onAliasChange(event.target.value)}
          placeholder="e.g. Meteor"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <Button type="submit" disabled={isSubmitDisabled}>
          Register
        </Button>
      </form>
      {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}
      {infoMessage && <p className="mt-2 text-sm text-brand-dark">{infoMessage}</p>}
    </div>
  )
}

export default TournamentAliasPanel

/*
Explanation:

1) TournamentAliasPanelProps
  - Receives state and handlers from parent component; delegates input value and submit processing without side effects.

2) Form Layout
  - `aria-label` for screen reader identification; uses Tailwind classes for responsive layout (horizontal on SM+, vertical on mobile).

3) Message Display
  - Errors displayed with priority, success/info messages in brand color to make TournamentPage-provided state visible.
*/
