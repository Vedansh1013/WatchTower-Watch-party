import type { AuthSession, AuthenticatedUser, RoomHistoryEntry } from '../types'

const AUTH_TOKEN_KEY = 'watchtower_auth_token'

type AuthResponse = AuthSession

async function request<T>(path: string, options: { method?: string; body?: Record<string, string>; token?: string } = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const payload = await response.json().catch(() => ({})) as { message?: string; error?: string }
  if (!response.ok) throw new Error(payload.message || payload.error || 'Something went wrong. Please try again.')
  return payload as T
}

export function getStoredAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

export function storeAuthToken(token: string) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

export async function signUp(payload: { name: string; email: string; password: string }) {
  return request<AuthResponse>('/api/auth/signup', { method: 'POST', body: payload })
}

export async function logIn(payload: { email: string; password: string }) {
  return request<AuthResponse>('/api/auth/login', { method: 'POST', body: payload })
}

export async function restoreSession(token: string) {
  const payload = await request<{ user: AuthenticatedUser }>('/api/auth/session', { token })
  return payload.user
}

export async function getRoomHistory(token: string) {
  const payload = await request<{ history: RoomHistoryEntry[] }>('/api/account/room-history', { token })
  return payload.history
}

export async function logOut(token: string) {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
