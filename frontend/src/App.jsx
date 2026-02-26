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

  // Jobs UI state
  const [jobTrade, setJobTrade] = useState('electricista')
  const [jobZone, setJobZone] = useState('')
  const [jobWhen, setJobWhen] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobPhoto, setJobPhoto] = useState(null)
  const [jobs, setJobs] = useState([])
  const [myJobs, setMyJobs] = useState([])
  const [assignedJobs, setAssignedJobs] = useState([])
  const [busy, setBusy] = useState(false)

  const [profRatings, setProfRatings] = useState({}) // { [userId]: {avg,count} }

  const [rateStars, setRateStars] = useState(5)
  const [rateComment, setRateComment] = useState('')

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

  async function fetchRating(userId) {
    if (!token || !userId) return
    try {
      const res = await fetch(`${API_URL}/api/v1/professionals/${userId}/rating`, { headers })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setProfRatings((prev) => ({ ...prev, [userId]: { avg: data.avg, count: data.count } }))
      }
    } catch {
      // ignore
    }
  }

  async function fetchJobs() {
    if (!token) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs?status=PUBLICADO`, { headers })
      const data = await res.json().catch(() => ({}))
      setJobs(data.items || [])
    } finally {
      setBusy(false)
    }
  }

  async function fetchMyJobs() {
    if (!token) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs?mine=1`, { headers })
      const data = await res.json().catch(() => ({}))
      setMyJobs(data.items || [])
    } finally {
      setBusy(false)
    }
  }

  async function fetchAssignedJobs() {
    if (!token) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs?assigned=1`, { headers })
      const data = await res.json().catch(() => ({}))
      setAssignedJobs(data.items || [])
    } finally {
      setBusy(false)
    }
  }

  async function createJob() {
    setBusy(true)
    try {
      const description = `${jobDescription}${jobWhen ? `\nCuando: ${jobWhen}` : ''}`

      // If photo provided, send multipart/form-data
      let res
      if (jobPhoto) {
        const fd = new FormData()
        fd.append('trade', jobTrade)
        fd.append('zone', jobZone)
        fd.append('description', description)
        fd.append('photo', jobPhoto)
        res = await fetch(`${API_URL}/api/v1/jobs`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd
        })
      } else {
        const payload = { trade: jobTrade, zone: jobZone, description }
        res = await fetch(`${API_URL}/api/v1/jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        })
      }

      const data = await res.json().catch(() => ({}))
      setResult({ status: res.status, data })
      setJobPhoto(null)
      await fetchMyJobs()
    } finally {
      setBusy(false)
    }
  }

  async function takeJob(id) {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs/${id}/take`, { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      setResult({ status: res.status, data })
      await fetchJobs()
      await fetchAssignedJobs()
    } finally {
      setBusy(false)
    }
  }

  async function finishJob(id, photoFile) {
    setBusy(true)
    try {
      let res
      if (photoFile) {
        const fd = new FormData()
        fd.append('photo', photoFile)
        res = await fetch(`${API_URL}/api/v1/jobs/${id}/finish`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd
        })
      } else {
        res = await fetch(`${API_URL}/api/v1/jobs/${id}/finish`, { method: 'POST', headers })
      }

      const data = await res.json().catch(() => ({}))
      setResult({ status: res.status, data })
      await fetchAssignedJobs()
    } finally {
      setBusy(false)
    }
  }

  async function rateJob(id) {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs/${id}/rate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ stars: Number(rateStars), comment: rateComment })
      })
      const data = await res.json().catch(() => ({}))
      setResult({ status: res.status, data })
      setRateComment('')
      setRateStars(5)
      await fetchMyJobs()
      // refresh any visible ratings
      await fetchAssignedJobs()
    } finally {
      setBusy(false)
    }
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

  useEffect(() => {
    if (!token) return
    // prefetch some lists
    fetchJobs()
    fetchMyJobs()
    fetchAssignedJobs()
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
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Dashboard</div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>
                Bienvenido. Elegí una acción.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>Puntos</div>
                  <div style={{ color: COLORS.muted, fontSize: 13 }}>Saldo: (pendiente)</div>
                </div>

                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Oficios a domicilio</div>
                  <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10 }}>
                    Clientes crean una solicitud. Profesionales toman trabajos.
                  </div>

                  <details style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: '#FAFAFA' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Crear solicitud (cliente)</summary>
                    <div style={{ height: 10 }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                        Rubro
                        <select value={jobTrade} onChange={(e) => setJobTrade(e.target.value)} style={inputStyle}>
                          <option value="albañil">albañil</option>
                          <option value="electricista">electricista</option>
                          <option value="plomero">plomero</option>
                        </select>
                      </label>

                      <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                        Zona / Barrio
                        <input value={jobZone} onChange={(e) => setJobZone(e.target.value)} style={inputStyle} placeholder="Ej: Centro" />
                      </label>

                      <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                        ¿Para cuándo?
                        <input value={jobWhen} onChange={(e) => setJobWhen(e.target.value)} style={inputStyle} placeholder="Ej: mañana por la tarde" />
                      </label>

                      <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                        Descripción
                        <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} style={{ ...inputStyle, minHeight: 90 }} placeholder="Contanos qué necesitás" />
                      </label>

                      <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                        Foto (opcional)
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setJobPhoto(e.target.files?.[0] || null)}
                          style={{ ...inputStyle, padding: '8px 10px' }}
                        />
                      </label>

                      <button style={primaryBtn} onClick={createJob} disabled={busy}>
                        {busy ? 'Enviando...' : 'Crear solicitud'}
                      </button>
                    </div>
                  </details>

                  <div style={{ height: 10 }} />

                  <details style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: '#FAFAFA' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Trabajos disponibles (profesional)</summary>
                    <div style={{ height: 10 }} />
                    <button style={baseBtn} onClick={fetchJobs} disabled={busy}>Actualizar</button>
                    <div style={{ height: 10 }} />
                    {(jobs || []).length === 0 ? (
                      <div style={{ color: COLORS.muted, fontSize: 13 }}>No hay trabajos publicados.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {jobs.map((j) => (
                          <div key={j.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: COLORS.card }}>
                            <div style={{ fontWeight: 900 }}>#{j.id} · {j.trade} · {j.zone}</div>
                            {j.photo_url && (
                              <div style={{ marginTop: 8 }}>
                                <img
                                  src={j.photo_url}
                                  alt="foto trabajo"
                                  style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: `1px solid ${COLORS.border}` }}
                                  onLoad={() => j.assigned_to && fetchRating(j.assigned_to)}
                                />
                              </div>
                            )}

                            {j.assigned_to && profRatings[j.assigned_to] && (
                              <div style={{ marginTop: 8, fontSize: 13, color: COLORS.muted }}>
                                Profesional: ⭐ {Number(profRatings[j.assigned_to].avg || 0).toFixed(1)} ({profRatings[j.assigned_to].count})
                              </div>
                            )}

                            <div style={{ color: COLORS.muted, fontSize: 13, whiteSpace: 'pre-wrap' }}>{j.description}</div>
                            <div style={{ height: 8 }} />
                            <button style={primaryBtn} onClick={() => takeJob(j.id)} disabled={busy}>
                              Tomar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>

                  <div style={{ height: 10 }} />

                  <details style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: '#FAFAFA' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Mis solicitudes (cliente)</summary>
                    <div style={{ height: 10 }} />
                    <button style={baseBtn} onClick={fetchMyJobs} disabled={busy}>Actualizar</button>
                    <div style={{ height: 10 }} />
                    {(myJobs || []).length === 0 ? (
                      <div style={{ color: COLORS.muted, fontSize: 13 }}>Todavía no creaste solicitudes.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {myJobs.map((j) => (
                          <div key={j.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: COLORS.card }}>
                            <div style={{ fontWeight: 900 }}>#{j.id} · {j.trade} · {j.zone}</div>
                            <div style={{ color: COLORS.muted, fontSize: 13 }}>Estado: {j.status}</div>

                            {j.assigned_to && !profRatings[j.assigned_to] && (
                              <div style={{ marginTop: 8 }}>
                                <button style={baseBtn} onClick={() => fetchRating(j.assigned_to)} disabled={busy}>
                                  Ver reputación del profesional
                                </button>
                              </div>
                            )}

                            {j.assigned_to && profRatings[j.assigned_to] && (
                              <div style={{ marginTop: 8, fontSize: 13, color: COLORS.muted }}>
                                Profesional: ⭐ {Number(profRatings[j.assigned_to].avg || 0).toFixed(1)} ({profRatings[j.assigned_to].count})
                              </div>
                            )}

                            {j.status === 'FINALIZADO' && (
                              <div style={{ marginTop: 10, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
                                <div style={{ fontWeight: 900, marginBottom: 6 }}>Calificar (1 a 5)</div>
                                <div style={{ display: 'grid', gap: 10 }}>
                                  <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                                    Estrellas
                                    <select value={rateStars} onChange={(e) => setRateStars(e.target.value)} style={inputStyle}>
                                      <option value={1}>1</option>
                                      <option value={2}>2</option>
                                      <option value={3}>3</option>
                                      <option value={4}>4</option>
                                      <option value={5}>5</option>
                                    </select>
                                  </label>
                                  <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                                    Comentario (opcional)
                                    <textarea value={rateComment} onChange={(e) => setRateComment(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} />
                                  </label>
                                  <button style={primaryBtn} onClick={() => rateJob(j.id)} disabled={busy}>
                                    {busy ? 'Enviando...' : 'Enviar calificación'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </details>

                  <div style={{ height: 10 }} />

                  <details style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: '#FAFAFA' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Trabajos asignados a mí (profesional)</summary>
                    <div style={{ height: 10 }} />
                    <button style={baseBtn} onClick={fetchAssignedJobs} disabled={busy}>Actualizar</button>
                    <div style={{ height: 10 }} />
                    {(assignedJobs || []).length === 0 ? (
                      <div style={{ color: COLORS.muted, fontSize: 13 }}>No tenés trabajos asignados.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {assignedJobs.map((j) => (
                          <div key={j.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 10, background: COLORS.card }}>
                            <div style={{ fontWeight: 900 }}>#{j.id} · {j.trade} · {j.zone}</div>
                            {j.photo_url && (
                              <div style={{ marginTop: 8 }}>
                                <img
                                  src={j.photo_url}
                                  alt="foto trabajo"
                                  style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: `1px solid ${COLORS.border}` }}
                                />
                              </div>
                            )}
                            {j.finished_photo_url && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 800, marginBottom: 4 }}>
                                  Foto terminado
                                </div>
                                <img
                                  src={j.finished_photo_url}
                                  alt="foto terminado"
                                  style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: `1px solid ${COLORS.border}` }}
                                />
                              </div>
                            )}
                            <div style={{ color: COLORS.muted, fontSize: 13, whiteSpace: 'pre-wrap' }}>{j.description}</div>
                            <div style={{ height: 8 }} />

                            <label style={{ display: 'block', fontSize: 13, color: COLORS.muted }}>
                              Foto terminado (opcional)
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => finishJob(j.id, e.target.files?.[0] || null)}
                                style={{ ...inputStyle, padding: '8px 10px', marginTop: 6 }}
                                disabled={busy || j.status !== 'ASIGNADO'}
                              />
                            </label>

                            <div style={{ height: 8 }} />
                            <button style={primaryBtn} onClick={() => finishJob(j.id, null)} disabled={busy || j.status !== 'ASIGNADO'}>
                              Finalizar (sin foto)
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                </div>

                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>Presupuesto</div>
                  <div style={{ color: COLORS.muted, fontSize: 13 }}>Enviar lista por WhatsApp / cargar productos</div>
                  <div style={{ height: 10 }} />
                  <button style={baseBtn} onClick={() => setResult({ info: 'Pendiente: flujo presupuesto' })}>
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

        <div style={{ marginTop: 14, fontSize: 12, color: COLORS.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>UI demo (gris + naranja)</span>
          <span>·</span>
          <a href="/privacidad.html" target="_blank" rel="noreferrer" style={{ color: COLORS.orange, fontWeight: 800 }}>
            Política de privacidad
          </a>
        </div>
      </div>
    </div>
  )
}
