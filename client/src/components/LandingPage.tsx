import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, History, Info, Link2, LockKeyhole, LogIn, LogOut, Play, ShieldCheck, Users, Zap } from 'lucide-react'
import type { AuthenticatedUser } from '../types'

interface LandingPageProps {
  onEnter: (mode: 'create' | 'join', roomId: string | null) => void
  user: AuthenticatedUser | null
  onSignOut: () => void
  onOpenAuth: (mode: 'login' | 'signup') => void
  onOpenHistory: () => void
  onOpenAbout: () => void
}

const featureSlides = [
  {
    eyebrow: 'Real-time playback',
    title: 'One shared timeline',
    copy: 'Play, pause, and seek stay aligned, so nobody has to ask where the scene is.',
    image: '/feature-sync-mark.png',
    accent: 'lime',
  },
  {
    eyebrow: 'Room energy',
    title: 'Reactions that land together',
    copy: 'Send a quick emoji and let it float across every screen at the exact moment.',
    image: '/feature-reactions-mark.png',
    accent: 'peach',
  },
  {
    eyebrow: 'Clear control',
    title: 'Roles that make sense',
    copy: 'Hosts and moderators can guide playback while participants can request a change.',
    image: '/feature-roles-mark.png',
    accent: 'blue',
  },
  {
    eyebrow: 'Invite only',
    title: 'A room for your people',
    copy: 'Create a short code, share one link, and bring your group into the same moment.',
    image: '/feature-invite-mark.png',
    accent: 'lime',
  },
] as const

export function LandingPage({ onEnter, user, onSignOut, onOpenAuth, onOpenHistory, onOpenAbout }: LandingPageProps) {
  const [roomCode, setRoomCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [entryMode, setEntryMode] = useState<'create' | 'join' | null>(null)
  const [activeFeature, setActiveFeature] = useState(0)

  useEffect(() => {
    document.title = 'Watchtower — Watch together'
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveFeature((current) => (current + 1) % featureSlides.length)
    }, 4600)

    return () => window.clearInterval(timer)
  }, [])

  const activeSlide = featureSlides[activeFeature]
  function submitCreate(event: React.FormEvent) {
    event.preventDefault()
    onEnter('create', null)
  }

  function selectEntry(mode: 'create' | 'join') {
    setEntryMode(mode)
  }

  function submitJoin(event: React.FormEvent) {
    event.preventDefault()
    if (!roomCode.trim()) return
    onEnter('join', roomCode.trim())
  }

  async function copyDemoLink() {
    await navigator.clipboard?.writeText('https://watchtower.example/room/ABC123')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const profileInitial = user?.name.trim().slice(0, 1).toUpperCase() || 'W'

  return (
    <main className="landing-page">
      <nav className="landing-nav container">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><img src="/watchtower-mark.png" alt="" /></div>
          <div>
            <div className="brand-name">watchtower</div>
            <div className="brand-caption">shared screen / shared moment</div>
          </div>
        </div>
        <div className="landing-nav-actions">
          <button className="nav-link" onClick={copyDemoLink}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied demo link' : 'How it works'}</button>
          {user ? <div className="account-nav-actions"><button className="history-nav-button" type="button" onClick={onOpenHistory}><History size={15} /><span>My history</span></button><button className="signed-in-chip" onClick={onSignOut} title="Sign out"><span className="signed-in-avatar">{profileInitial}</span><span className="signed-in-copy"><small>Signed in as</small><strong>{user.name}</strong></span><LogOut size={15} /></button></div> : <div className="landing-auth-actions"><button className="landing-login-button" type="button" onClick={() => onOpenAuth('login')}><LogIn size={15} /> Log in</button><button className="landing-signup-button" type="button" onClick={() => onOpenAuth('signup')}>Sign up <ArrowRight size={15} /></button></div>}
        </div>
      </nav>

      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> REAL-TIME WATCH PARTY</div>
          <h1>Together, in the <em>same frame.</em></h1>
          <p className="hero-subtitle">A calm, role-aware room for sharing videos, reactions, and the moment a great scene lands.</p>
          <div className="hero-trust">
            <div className="avatar-stack"><span>AR</span><span>MK</span><span>SP</span><span>+8</span></div>
            <span>Made for small groups that care about being in sync.</span>
          </div>
        </div>
        <div className="hero-visual" aria-label="Watchtower room preview">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="visual-window">
            <div className="visual-window-top"><span className="window-dot red" /><span className="window-dot yellow" /><span className="window-dot green" /><span className="visual-url">watchtower / lounge-7k2m</span><span className="live-chip"><span /> LIVE</span></div>
            <div className="visual-screen"><div className="screen-play"><Play size={24} fill="currentColor" /></div><div className="screen-caption">a little room for a big moment</div><div className="screen-progress"><span /></div></div>
            <div className="visual-footer"><div className="mini-avatars"><span>AR</span><span>MK</span><span>SP</span></div><span>7 people are watching together</span><span className="visual-time">12:48</span></div>
          </div>
          <div className="floating-note note-top"><span className="note-icon">✦</span><span><strong>everyone is here</strong><small>7 viewers in sync</small></span></div>
          <div className="floating-note note-bottom"><span className="note-icon peach">⌁</span><span><strong>host control</strong><small>roles stay clear</small></span></div>
        </div>
      </section>

      <section className={`entry-section container ${entryMode ? 'entry-section-active' : ''}`}>
        {!entryMode ? (
          <div className="entry-choice-grid">
            <button className="entry-choice-card create-card" onClick={() => selectEntry('create')}>
              <div className="card-kicker"><span className="entry-mark" aria-hidden="true"><img src="/create-room-mark.png" alt="" /></span> Start a new room</div>
              <h2>Create room</h2>
              <p>You’ll be the host. Set up a room and invite your people with one link.</p>
              <span className="choice-action primary-choice">Continue <ArrowRight size={17} /></span>
            </button>
            <button className="entry-choice-card join-card" onClick={() => selectEntry('join')}>
              <div className="card-kicker"><span className="entry-mark" aria-hidden="true"><img src="/join-room-mark.png" alt="" /></span> Have an invite?</div>
              <h2>Join room</h2>
              <p>Enter a room code or paste a Watchtower invite link to jump right in.</p>
              <span className="choice-action secondary-choice">Continue <ArrowRight size={17} /></span>
            </button>
          </div>
        ) : (
          <div className={`entry-card active-entry-card ${entryMode === 'join' ? 'join-card' : 'create-card'}`}>
            <button className="back-to-choices" onClick={() => setEntryMode(null)}><ArrowLeft size={14} /> Back to options</button>
            {entryMode === 'create' ? (
              <>
                <div className="card-kicker"><span className="entry-mark" aria-hidden="true"><img src="/create-room-mark.png" alt="" /></span> Start a new room</div>
                <h2>Set the scene.</h2>
                <p>You’ll be the host. Invite your people with one link.</p>
                <form onSubmit={submitCreate}>
                  {user ? <div className="account-context"><span><Users size={16} /></span><div><small>Creating as</small><strong>{user.name}</strong></div></div> : <div className="guest-entry-note"><LockKeyhole size={17} /><div><strong>Creating as Guest</strong><span>Log in from the top-right to enter a username.</span></div></div>}
                  <button className="primary-button full" type="submit">Create watch room <ArrowRight size={17} /></button>
                </form>
                <div className="card-footnote"><ShieldCheck size={14} /> You control the room. Others join as participants.</div>
              </>
            ) : (
              <>
                <div className="card-kicker"><span className="entry-mark" aria-hidden="true"><img src="/join-room-mark.png" alt="" /></span> Have an invite?</div>
                <h2>Jump right in.</h2>
                <p>Enter a room code or paste the end of a Watchtower link.</p>
                <form onSubmit={submitJoin}>
                  {user ? <div className="account-context"><span><Users size={16} /></span><div><small>Joining as</small><strong>{user.name}</strong></div></div> : <div className="guest-entry-note"><LockKeyhole size={17} /><div><strong>Joining as Guest</strong><span>Log in from the top-right to enter a username.</span></div></div>}
                  <label className="field-label" htmlFor="room-code">Room code</label>
                  <div className="input-with-icon"><Link2 size={17} /><input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="e.g. 7K2M9Q" maxLength={64} /></div>
                  <button className="secondary-button full" type="submit">Join room <ArrowRight size={17} /></button>
                </form>
                <div className="card-footnote"><Zap size={14} /> Playback changes arrive in real time.</div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="feature-showcase container" aria-labelledby="feature-showcase-heading">
        <div className="feature-showcase-copy">
          <div className="section-kicker"><span className="eyebrow-dot" /> WHY WATCHTOWER</div>
          <h2 id="feature-showcase-heading">Small details, shared beautifully.</h2>
          <p>A quiet, focused room that keeps the video—and the people watching it—at the center.</p>
        </div>

        <div className="feature-carousel" aria-label="Watchtower feature slideshow">
          <div className={`feature-carousel-glow ${activeSlide.accent}`} aria-hidden="true" />
          <div className="feature-slide" key={activeSlide.title}>
          <div className="feature-slide-icon"><img src={activeSlide.image} alt="" /></div>
            <div className="feature-slide-content">
              <div className="feature-slide-meta"><span>{activeSlide.eyebrow}</span><span>{String(activeFeature + 1).padStart(2, '0')} / {String(featureSlides.length).padStart(2, '0')}</span></div>
              <strong>{activeSlide.title}</strong>
              <p>{activeSlide.copy}</p>
            </div>
          </div>

          <div className="feature-dots" aria-label="Select a Watchtower feature">
            {featureSlides.map((feature, index) => (
              <button
                className={`feature-dot ${index === activeFeature ? 'is-active' : ''}`}
                key={feature.title}
                type="button"
                onClick={() => setActiveFeature(index)}
                aria-label={`Show feature ${index + 1}: ${feature.title}`}
                aria-current={index === activeFeature ? 'true' : undefined}
              />
            ))}
          </div>
          <div className="feature-progress" aria-hidden="true"><span key={activeSlide.title} /></div>
        </div>
      </section>

      <footer className="landing-footer container"><span>WATCHTOWER / 2026</span><span>For the people you would pause a movie for.</span><button className="footer-about-button" type="button" onClick={onOpenAbout}><Info size={13} /> About us</button></footer>
    </main>
  )
}
