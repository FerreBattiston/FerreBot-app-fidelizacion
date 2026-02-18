import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState(null)

  async function register() {
    setResult(null)
    const res = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, roles: ['cliente'] })
    })
    const data = await res.json().catch(() => ({}))
    setResult({ status: res.status, data })
  }

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, maxWidth: 520 }}>
      <h1>FerreBot</h1>
      <p>Registro rápido (rol: cliente)</p>

      <label>
        Usuario
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
      </label>
      <div style={{ height: 8 }} />
      <label>
        Clave
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
      </label>

      <div style={{ height: 12 }} />
      <button onClick={register}>Registrar</button>

      {result && (
        <pre style={{ marginTop: 16, background: '#111', color: '#0f0', padding: 12, overflow: 'auto' }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}
