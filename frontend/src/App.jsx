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

  const COLORS = {
    bg: '#F3F4F6',
    card: '#FFFFFF',
    text: '#111827',
    muted: '#6B7280',
    border: '#E5E7EB',
    orange: '#F1732E',
    dark: '#1F2937'
  }

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

  const baseBtn = {
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    color: COLORS.text,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer'
  }

  const primaryBtn = {
    ...baseBtn,
    background: COLORS.orange,
    border: `1px solid ${COLORS.orange}`,
    color: 'white',
    fontWeight: 800
  }

  const ghostBtn = {
    ...baseBtn,
    background: 'transparent',
    border: `1px solid rgba(255,255,255,0.25)`,
    color: 'white'
  }

  const inputStyle = {
    width: '100%',
    marginTop: 6,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui',
        padding: 16
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div
          style={{
            background: COLORS.dark,
            borderRadius: 16,
            padding: 16
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="Ferretería Battiston"
              style={{ height: 76, width: 'auto', display: 'block' }}
            />
          </div>

          <div style={{ height: 12 }} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {!token ? (
              <>
                <button style={ghostBtn} onClick={() => setMode('register')} disabled={mode === 'register'}>
                  Registro
                </button>
                <button style={ghostBtn} onClick={() => setMode('login')} disabled={mode === 'login'}>
                  Login
                </button>
              </>
            ) : (
              <>
                <button style={ghostBtn} onClick={fetchMe}>
                  Mi cuenta
                </button>
                <button style={ghostBtn} onClick={logout}>
                  Salir
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div
          style={{
            background: COLORS.orange,
            color: 'white',
            borderRadius: 14,
            padding: '10px 14px',
            textAlign: 'center',
            fontWeight: 900,
            letterSpacing: 0.2
          }}
        >
          Suma puntos / Oficios a domicilio
        </div>

        <div style={{ height: 14 }} />

        {!token ? (
          <div
            style={{
              background: COLORS.card,
              borderRadius: 16,
              border: `1px solid ${COLORS.border}`,
              padding: 16
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 16 }}>
              {mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>
              {mode === 'register'
                ? 'Elegí roles, registrate y empezá a usar la app.'
                : 'Ingresá con tu usuario y contraseña.'}
            </div>

            <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
              Usuario
              <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
            </label>

            <div style={{ height: 10 }} />

            <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
              Clave
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            </label>

            {mode === 'register' && (
              <>
                <div style={{ height: 14 }} />

                <details
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 14,
                    padding: 12,
                    background: '#FAFAFA'
                  }}
                  open
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 900, color: COLORS.text }}>
                    Roles (tocá para desplegar)
                  </summary>

                  <div style={{ height: 10 }} />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10
                    }}
                  >
                    {ROLES.map((r) => (
                      <label
                        key={r}
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          padding: '10px 10px',
                          borderRadius: 12,
                          border: `1px solid ${COLORS.border}`,
                          background: COLORS.card
                        }}
                      >
                        <input type="checkbox" checked={selectedRoles.includes(r)} onChange={() => toggleRole(r)} />
                        <span style={{ fontWeight: 800 }}>{r}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </>
            )}

            <div style={{ height: 16 }} />
            {mode === 'register' ? (
              <button style={primaryBtn} onClick={register}>
                Registrar
              </button>
            ) : (
              <button style={primaryBtn} onClick={login}>
                Entrar
              </button>
            )}

            {result && (
              <pre style={{ marginTop: 12, background: '#111', color: '#0f0', padding: 12, overflow: 'auto', borderRadius: 12 }}>
{JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                background: COLORS.card,
                borderRadius: 16,
                border: `1px solid ${COLORS.border}`,
                padding: 16
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Dashboard (demo)</div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>
                Acá van a aparecer tus puntos, pedidos y trabajos.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>Puntos</div>
                  <div style={{ color: COLORS.muted, fontSize: 13 }}>Saldo: (pendiente)</div>
                </div>

                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>Pedir oficio</div>
                  <div style={{ color: COLORS.muted, fontSize: 13 }}>Albañil / Electricista / Plomero</div>
                  <div style={{ height: 10 }} />
                  <button style={primaryBtn} onClick={() => setResult({ info: 'Próximo: publicar job' })}>
                    Crear solicitud
                  </button>
                </div>

                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>Presupuesto</div>
                  <div style={{ color: COLORS.muted, fontSize: 13 }}>Enviar lista por WhatsApp / cargar productos</div>
                  <div style={{ height: 10 }} />
                  <button style={baseBtn} onClick={() => setResult({ info: 'Próximo: flujo presupuesto' })}>
                    Pedir presupuesto
                  </button>
                </div>
              </div>
            </div>

            {me && (
              <pre style={{ marginTop: 12, background: '#111', color: '#0f0', padding: 12, overflow: 'auto', borderRadius: 12 }}>
{JSON.stringify(me, null, 2)}
              </pre>
            )}

            {result && (
              <pre style={{ marginTop: 12, background: '#111', color: '#0f0', padding: 12, overflow: 'auto', borderRadius: 12 }}>
{JSON.stringify(result, null, 2)}
              </pre>
            )}
          </>
        )}

        <div style={{ marginTop: 14, fontSize: 12, color: COLORS.muted }}>
          UI demo (gris + naranja)
        </div>
      </div>
    </div>
  )
}
