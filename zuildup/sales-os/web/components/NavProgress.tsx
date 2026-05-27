'use client'

/**
 * NavProgress — top-of-page loading indicator for App Router navigations.
 * Item 4 (feedback 2026-05-26): users complained "back button / tab clicks
 * slow with no feedback". Next 15 App Router server-component navigations
 * have no built-in spinner. We trigger a thin top bar on link clicks /
 * pathname changes and fade it out after a short hold so even fast
 * transitions feel responsive.
 */

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavProgress() {
  const pathname = usePathname()
  const search = useSearchParams()
  const [active, setActive] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target === '_blank') return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const href = anchor.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (href.startsWith('/') || href.includes(window.location.host)) {
        setActive(true)
        setProgress(15)
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!active) return
    setProgress(100)
    const t = setTimeout(() => {
      setActive(false)
      setProgress(0)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search])

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      setProgress((p) => (p >= 85 ? p : p + 5))
    }, 120)
    return () => clearInterval(t)
  }, [active])

  if (!active && progress === 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-blue-600 transition-all duration-200 ease-out shadow-[0_0_8px_rgba(37,99,235,0.6)]"
        style={{ width: `${progress}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  )
}
