const API_BASE = '/api'

export async function api(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const authToken = token ?? localStorage.getItem('placement-token')
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    throw new Error('The placement API is unavailable. Start the app with `npm run dev:all` and try again.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status}).`)
    error.status = response.status
    throw error
  }
  return result
}

export async function download(path, { token } = {}) {
  const headers = new Headers()
  const authToken = token ?? localStorage.getItem('placement-token')
  if (authToken) headers.set('Authorization', `******`)
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { headers })
  } catch {
    throw new Error('The placement API is unavailable. Start the app with `npm run dev:all` and try again.')
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error || `Download failed (${response.status}).`)
  }
  return response.blob()
}

export const jsonRequest = (method, body) => ({
  method,
  body: JSON.stringify(body),
})
