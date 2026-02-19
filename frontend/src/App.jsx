import { useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const ROLES = ['cliente', 'albañil', 'electricista', 'plomero']

function getStoredToken() {
  try {
    return localStorage.getItem('token') || ''
  } catch {
    return ''
  }
}

function setStoredToken(token) {
  try {
    if (!token) localStorage.removeItem('token')
    else localStorage.setItem('token', token)
  } catch {
    // ignore
  }
}

export default function App() {
  const [mode, setMode] = useState('register') // register | login
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRoles, setSelectedRoles] = useState(['cliente'])
  const [token, setToken] = useState(getStoredToken())
  const [me, setMe] = useState(null)
  const [result, setResult] = useState(null)

  const headers = useMemo(() => {
    const h = { 'Content-Type': 'application/json' }
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }, [token])

  async function register() {
    setResult(null)
    const res = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, roles: selectedRoles })
    })
    const data = await res.json().catch(() => ({}))
    if (data?.token) {
      setToken(data.token)
      setStoredToken(data.token)
    }
    setResult({ status: res.status, data })
  }

  async function login() {
    setResult(null)
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json().catch(() => ({}))
    if (data?.token) {
      setToken(data.token)
      setStoredToken(data.token)
    }
    setResult({ status: res.status, data })
  }

  async function fetchMe() {
    if (!token) {
      setMe(null)
      return
    }
    const res = await fetch(`${API_URL}/api/v1/me`, { headers })
    const data = await res.json().catch(() => ({}))
    setMe({ status: res.status, data })
  }

  function logout() {
    setToken('')
    setStoredToken('')
    setMe(null)
    setResult(null)
  }

  useEffect(() => {
    fetchMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function toggleRole(role) {
    setSelectedRoles((prev) => {
      const set = new Set(prev)
      if (set.has(role)) set.delete(role)
      else set.add(role)
      const arr = Array.from(set)
      return arr.length ? arr : ['cliente']
    })
  }

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, maxWidth: 640 }}>
      <h1>FerreBot</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode('register')} disabled={mode === 'register'}>
          Registro
        </button>
        <button onClick={() => setMode('login')} disabled={mode === 'login'}>
          Login
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={fetchMe} disabled={!token}>
          /me
        </button>
        <button onClick={logout} disabled={!token}>
          Salir
        </button>
      </div>

      <label>
        Usuario
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
      </label>
      <div style={{ height: 8 }} />
      <label>
        Clave
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
      </label>

      {mode === 'register' && (
        <>
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 14, marginBottom: 6 }}>Roles (podés elegir varios)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ROLES.map((r) => (
              <label key={r} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={selectedRoles.includes(r)} onChange={() => toggleRole(r)} />
                {r}
              </label>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 12 }} />
      {mode === 'register' ? (
        <button onClick={register}>Registrar</button>
      ) : (
        <button onClick={login}>Entrar</button>
      )}

      {token && (
        <div style={{ marginTop: 16, fontSize: 12, color: '#333' }}>
          <div>
            <b>Token guardado</b> (localStorage)
          </div>
        </div>
      )}

      {me && (
        <pre style={{ marginTop: 12, background: '#111', color: '#0f0', padding: 12, overflow: 'auto' }}>
{JSON.stringify(me, null, 2)}
        </pre>
      )}

      {result && (
        <pre style={{ marginTop: 12, background: '#111', color: '#0f0', padding: 12, overflow: 'auto' }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}
