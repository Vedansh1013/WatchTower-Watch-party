import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, LogIn, Mail, UserRound } from 'lucide-react'
import { logIn, signUp } from '../lib/auth'
import type { AuthSession } from '../types'

type AuthMode = 'login' | 'signup'

interface AuthPageProps {
  onAuthenticated: (session: AuthSession) => void
  initialMode?: AuthMode
  onBack?: () => void
}

function passwordRules(password: string) {
  return [
    { label: '5+ characters', met: password.length >= 5 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
  ]
}

function strengthLabel(score: number, hasPassword: boolean) {
  if (!hasPassword) return 'Password strength'
  if (score <= 1) return 'Getting started'
  if (score === 2) return 'Almost there'
  if (score === 3) return 'Good'
  return 'Strong'
}

export function AuthPage({ onAuthenticated, initialMode = 'login', onBack }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rules = useMemo(() => passwordRules(password), [password])
  const completedRules = rules.filter((rule) => rule.met).length
  const allRulesMet = completedRules === rules.length
  const label = strengthLabel(completedRules, Boolean(password))

  useEffect(() => {
    setMode(initialMode)
    setError('')
  }, [initialMode])

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email ID and password to continue.')
      return
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Enter a name for your profile.')
      return
    }
    if (mode === 'signup' && !allRulesMet) {
      setError('Use at least 5 characters with an uppercase letter, lowercase letter, and number.')
      return
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Your passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const session = mode === 'login'
        ? await logIn({ email, password })
        : await signUp({ name, email, password })
      onAuthenticated(session)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <nav className="auth-nav container">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><img src="/watchtower-mark.png" alt="" /></div>
          <div>
            <div className="brand-name">watchtower</div>
            <div className="brand-caption">shared screen / shared moment</div>
          </div>
        </div>
        <div className="auth-nav-actions"><div className="auth-nav-note"><span className="eyebrow-dot" /> PRIVATE ROOMS · REAL-TIME</div>{onBack && <button className="auth-home-link" type="button" onClick={onBack}><ArrowLeft size={15} /> Back to home</button>}</div>
      </nav>

      <section className="auth-layout container">
        <div className="auth-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A BETTER WAY TO WATCH TOGETHER</div>
          <h1>Find your people. <em>Keep the moment.</em></h1>
          <p>Sign in once, then create a room or join your group without losing the shared timeline.</p>
          <div className="auth-benefits" aria-label="Watchtower highlights">
            <div><span className="auth-benefit-icon"><img src="/shared-reactions-mark.png" alt="" /></span><span><strong>Shared reactions</strong><small>Feel the scene together.</small></span></div>
            <div><span className="auth-benefit-icon"><img src="/room-roles-mark.png" alt="" /></span><span><strong>Clear room roles</strong><small>Everyone knows who is in control.</small></span></div>
          </div>
        </div>

        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button className={mode === 'login' ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === 'login'} onClick={() => selectMode('login')}>Log in</button>
            <button className={mode === 'signup' ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => selectMode('signup')}>Sign up</button>
          </div>

          <div className="auth-card-heading">
            <span className="auth-heading-icon">{mode === 'login' ? <LogIn size={19} /> : <UserRound size={19} />}</span>
            <div>
              <h2 id="auth-title">{mode === 'login' ? 'Welcome back.' : 'Make it yours.'}</h2>
              <p>{mode === 'login' ? 'Log in to return to your next shared moment.' : 'Create your Watchtower profile in a few seconds.'}</p>
            </div>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === 'signup' && (
              <label className="auth-field" htmlFor="auth-name">
                <span>Your name</span>
                <span className="auth-input-wrap"><UserRound size={17} /><input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Pavitra" maxLength={24} autoComplete="name" /></span>
              </label>
            )}

            <label className="auth-field" htmlFor="auth-email">
              <span>Email ID</span>
              <span className="auth-input-wrap"><Mail size={17} /><input id="auth-email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" maxLength={120} autoComplete="email" /></span>
            </label>

            <label className="auth-field" htmlFor="auth-password">
              <span>Password</span>
              <span className="auth-input-wrap"><KeyRound size={17} /><input id="auth-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" type={showPassword ? 'text' : 'password'} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button className="password-visibility" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
            </label>

            {mode === 'signup' && (
              <>
                <div className="password-strength" aria-live="polite">
                  <div><span>Password strength</span><strong className={`strength-${completedRules}`}>{label}</strong></div>
                  <span className="password-meter"><span className={`strength-fill strength-${completedRules}`} style={{ transform: `scaleX(${completedRules / rules.length})` }} /></span>
                  <ul>
                    {rules.map((rule) => <li className={rule.met ? 'is-met' : ''} key={rule.label}><Check size={12} /> {rule.label}</li>)}
                  </ul>
                </div>

                <label className="auth-field" htmlFor="auth-confirm-password">
                  <span>Confirm password</span>
                  <span className="auth-input-wrap"><KeyRound size={17} /><input id="auth-confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it once more" type={showPassword ? 'text' : 'password'} maxLength={128} autoComplete="new-password" /></span>
                </label>
              </>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : mode === 'login' ? <LogIn size={17} /> : <ArrowRight size={17} />}{busy ? 'Please wait…' : mode === 'login' ? 'Log in to Watchtower' : 'Create my account'}</button>
          </form>

          <p className="auth-switch-copy">{mode === 'login' ? 'New to Watchtower?' : 'Already have an account?'} <button type="button" onClick={() => selectMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Sign up' : 'Log in'}</button></p>
        </section>
      </section>
    </main>
  )
}
