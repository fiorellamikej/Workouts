'use client'
import { useEffect, useRef, type ReactNode } from 'react'
export function NavDropdown({ label, children, ariaLabel }: { label: ReactNode; children: ReactNode; ariaLabel?: string }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && ref.current?.open) { ref.current.open = false; ref.current.querySelector('summary')?.focus() } }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [])
  return <details ref={ref} className="relative" onClick={e => { if ((e.target as HTMLElement).closest('a') && ref.current) ref.current.open = false }}><summary className="ss-secondary cursor-pointer list-none" aria-label={ariaLabel}>{label}</summary><div className="absolute right-0 top-full mt-2 max-h-[75dvh] w-64 overflow-y-auto border border-zinc-600 bg-zinc-950 p-3 shadow-xl">{children}</div></details>
}
