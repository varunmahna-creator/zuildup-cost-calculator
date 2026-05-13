'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface InboxJwtUser {
  id: string
  email: string
  role: string
  name: string | null
}

interface JwtCache {
  token: string
  exp: number
  user: InboxJwtUser
}

let memoryCache: JwtCache | null = null
let inflight: Promise<JwtCache> | null = null

async function fetchJwt(force = false): Promise<JwtCache> {
  const nowSec = Math.floor(Date.now() / 1000)
  if (!force && memoryCache && memoryCache.exp - nowSec > 60) {
    return memoryCache
  }
  if (inflight) return inflight
  inflight = (async () => {
    const r = await fetch('/api/inbox-jwt', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!r.ok) {
      inflight = null
      throw new Error(`inbox-jwt fetch failed: ${r.status}`)
    }
    const data = await r.json()
    if (!data.ok || !data.token) {
      inflight = null
      throw new Error(data.error || 'inbox-jwt: bad response')
    }
    memoryCache = { token: data.token, exp: data.exp, user: data.user }
    inflight = null
    return memoryCache
  })()
  return inflight
}

export function useInboxJwt() {
  const [token, setToken] = useState<string | null>(memoryCache?.token ?? null)
  const [user, setUser] = useState<InboxJwtUser | null>(memoryCache?.user ?? null)
  const [loading, setLoading] = useState(!memoryCache)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    fetchJwt()
      .then((c) => {
        if (!mountedRef.current) return
        setToken(c.token)
        setUser(c.user)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!mountedRef.current) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const c = await fetchJwt(true)
      setToken(c.token)
      setUser(c.user)
      setError(null)
      return c.token
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      return null
    }
  }, [])

  return { token, user, loading, error, refresh }
}

export async function inboxFetch(
  url: string,
  init: RequestInit & { _retried?: boolean } = {}
): Promise<Response> {
  let cache = memoryCache
  if (!cache) {
    cache = await fetchJwt()
  }
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Bearer ${cache.token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const r = await fetch(url, { ...init, headers })
  if (r.status === 401 && !init._retried) {
    cache = await fetchJwt(true)
    return inboxFetch(url, { ...init, _retried: true })
  }
  return r
}
