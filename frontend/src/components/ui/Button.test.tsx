/**
 * なぜテストが必要か:
 * - variant 切り替えで Tailwind クラスが期待どおり切り替わるかを確認し、UI の一貫性を守る。
 * - disabled 属性やボタンのロールが壊れていないか検証し、フォーム操作時の不具合を早期に検出する。
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Button from './Button'

describe('Button', () => {
  it('renders primary variant by default', () => {
    render(<Button>プライマリ</Button>)

    const button = screen.getByRole('button', { name: 'プライマリ' })
    expect(button.className).toContain('bg-brand')
    expect(button.className).toContain('text-slate-900')
  })

  it('renders secondary variant and disabled state', () => {
    render(
      <Button variant="secondary" disabled>
        セカンダリ
      </Button>
    )

    const button = screen.getByRole('button', { name: 'セカンダリ' })
    expect(button.className).toContain('border-slate-300')
    expect(button.className).toContain('text-slate-700')
    expect(button).toBeDisabled()
  })
})

/*
解説:

1) import { describe, ... } / Button
  - Vitest と Testing Library を利用して Button コンポーネントを実際にレンダリングし、クラス適用とアクセシビリティを検証する。

2) it('renders primary variant by default')
  - variant 指定なしの場合に primary の Tailwind クラスが付与されるか確認し、デフォルト見た目を保証する。

3) it('renders secondary variant and disabled state')
  - secondary variant でボーダークラスへ切り替わるか、disabled 属性が維持されるかを検証し、フォーム UX を守る。
*/
