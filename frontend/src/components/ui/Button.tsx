import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  className?: string
  children?: ReactNode
}

const baseClasses =
  'rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-slate-900 hover:bg-brand-dark focus-visible:outline-brand-dark',
  secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-500'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, children, type = 'button', ...props }: ButtonProps,
  ref
) {
  return (
    <button ref={ref} className={clsx(baseClasses, variants[variant], className)} type={type} {...props}>
      {children}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
