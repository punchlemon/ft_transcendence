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

/*
解説:

1) import { forwardRef ... } / clsx
  - ボタン属性の型安全性を保ちながら props を受け取るため TypeScript の型と React の `forwardRef` を利用し、Tailwind クラス結合のために `clsx` を読み込む。

2) baseClasses / variants
  - 共通スタイルと variant ごとの配色を分離し、Primary/Secondary のクラスを `Record` 型で管理することで IDE 補完と型チェックを効かせる。

3) export const Button = forwardRef(...)
  - `variant`, `className`, `children` などを受け取り、`clsx` でクラスを組み合わせて `<button>` に適用する。`ref` を透過させることでフォーム制御やフォーカス操作にも対応する。

4) Button.displayName
  - DevTools でコンポーネント名が分かるよう displayName を設定する。

5) export default Button
  - 他ファイルから共通 UI コンポーネントとして再利用可能にする。
*/
