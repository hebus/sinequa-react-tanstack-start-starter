import { clearSessionTokens, getCsrfToken } from '@sinequa/atomic'

function isUnauthorized(err: unknown): boolean {
  return (
    (err as { name?: string })?.name === 'UnauthorizedError' ||
    (err instanceof Error && /unauthor/i.test(err.message))
  )
}

/**
 * Wraps an API call to handle session expiration (401).
 *
 * The session is normally kept alive automatically by the library (it stores the
 * `sinequa-jwt-refresh` token returned on each response). When a call still fails
 * with 401, we try to silently re-establish a session from an existing cookie/SSO
 * via `getCsrfToken()` and retry once. If that yields no fresh token, we clear the
 * local session — which emits the `'authenticated'` event with `false`, so the
 * protected layout redirects the user to `/login`.
 *
 * The retry is bounded to a single attempt to avoid loops.
 */
export async function withReauth<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (!isUnauthorized(err)) throw err

    let fresh: string | null = null
    try {
      fresh = await getCsrfToken()
    } catch {
      // no ambient session to recover
    }
    if (fresh) return await call()

    clearSessionTokens() // emits 'authenticated' = false -> guard redirects to /login
    throw err
  }
}
