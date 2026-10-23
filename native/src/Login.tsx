import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Dashboard from './Dashboard'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  useEffect(() => {
  async function checkSavedSession() {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()

    if (sessionError || !sessionData.session) {
      setMessage('No saved session found.')
      return
    }

    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (error) {
      setMessage(`Session check failed: ${error.message}`)
      return
    }

    if (data.currentLevel === 'aal2') {
  setAuthenticated(true)
  return
}

setMessage(
  'Your saved session requires additional authentication.'
)
  }

  void checkSavedSession()
}, [])
const [mfaCode, setMfaCode] = useState('')
const [mfaFactorId, setMfaFactorId] = useState('')
const [mfaRequired, setMfaRequired] = useState(false)

async function handleMfa(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault()
  setLoading(true)
  setMessage('')

  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: mfaCode.trim(),
    })

    if (error) throw error

    const { data, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (assuranceError) throw assuranceError

    if (data.currentLevel !== 'aal2') {
      throw new Error('MFA verification did not complete.')
    }

    setMfaRequired(false)
setMfaCode('')
setAuthenticated(true)
  } catch (error) {
    setMessage(
      error instanceof Error ? error.message : 'MFA verification failed.'
    )
  } finally {
    setLoading(false)
  }
}
  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      const { data: assurance, error: assuranceError } =
  await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

if (assuranceError) throw assuranceError

const { data: factors, error: factorsError } =
  await supabase.auth.mfa.listFactors()

if (factorsError) throw factorsError

const verifiedFactor = factors.totp.find(
  (factor) => factor.status === 'verified'
)

if (!verifiedFactor) {
  throw new Error('No verified authenticator app found.')
}

setMfaFactorId(verifiedFactor.id)
setMfaRequired(true)
setMessage('Enter the six-digit code from your authenticator app.')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to sign in.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (authenticated) {
  return <Dashboard />
}
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#09090b',
        color: '#f4f4f5',
        padding: 'calc(env(safe-area-inset-top, 0px) + 48px) 24px 32px',
        fontFamily: 'Arial, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ color: '#fb923c', textAlign: 'center' }}>
        SWORD AND SHIELD
      </h1>

      <h2 style={{ textAlign: 'center' }}>Sign In</h2>
{mfaRequired && (
  <form onSubmit={handleMfa}>
    <label htmlFor="mfaCode">Authenticator Code</label>

    <input
      id="mfaCode"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      placeholder="Enter 6-digit code"
      value={mfaCode}
      onChange={(event) => setMfaCode(event.target.value)}
      style={{
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        padding: 14,
        margin: '8px 0 20px',
        fontSize: 20,
        textAlign: 'center',
        letterSpacing: 4,
      }}
    />

    <button
      type="submit"
      disabled={loading || mfaCode.length !== 6}
      style={{
        width: '100%',
        padding: 16,
        backgroundColor: '#fb923c',
        color: '#09090b',
        border: 0,
        fontWeight: 'bold',
        fontSize: 16,
      }}
    >
      {loading ? 'Verifying...' : 'Verify Code'}
    </button>
  </form>
)}
      <form onSubmit={handleLogin}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: 14,
            margin: '8px 0 20px',
            fontSize: 16,
          }}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: 14,
            margin: '8px 0 24px',
            fontSize: 16,
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: 16,
            backgroundColor: '#fb923c',
            color: '#09090b',
            border: 0,
            fontWeight: 'bold',
            fontSize: 16,
          }}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      {message && (
        <p role="status" style={{ marginTop: 24, textAlign: 'center' }}>
          {message}
        </p>
      )}
    </main>
  )
}