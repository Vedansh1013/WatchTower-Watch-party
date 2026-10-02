import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowLeft, Check, Clock3, Copy, History, LogIn, Plus, UsersRound } from 'lucide-react'
import { getRoomHistory } from '../lib/auth'
import type { AuthenticatedUser, RoomHistoryEntry } from '../types'

interface HistoryPageProps {
  user: AuthenticatedUser | null
  token: string | null
  onBack: () => void
  onOpenAuth: () => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function HistoryPage({ user, token, onBack, onOpenAuth }: HistoryPageProps) {
  const [history, setHistory] = useState<RoomHistoryEntry[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'My room history — Watchtower'
  }, [])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError('')
    getRoomHistory(token)
      .then((entries) => {
        if (!active) return
        setHistory(entries)
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Could not load your room history.')
        setLoading(false)
      })

    return () => { active = false }
  }, [token])

  async function copyCode(entry: RoomHistoryEntry) {
    await navigator.clipboard?.writeText(entry.roomCode)
    setCopiedId(entry.id)
    window.setTimeout(() => setCopiedId((current) => current === entry.id ? null : current), 1600)
  }

  return (
    <main className="account-page history-page">
      <nav className="account-nav container">
        <button className="room-brand account-brand-button" type="button" onClick={onBack}>
          <div className="brand-mark" aria-hidden="true"><img src="/watchtower-mark.png" alt="" /></div>
          <div><div className="brand-name">watchtower</div><div className="brand-caption">back to home</div></div>
        </button>
        <button className="nav-link account-back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> Home</button>
      </nav>

      <section className="account-hero container">
        <div>
          <div className="section-kicker"><span className="eyebrow-dot" /> PRIVATE ROOM HISTORY</div>
          <h1>Rooms you’ve <em>shared.</em></h1>
          <p>Every room you create or join while signed in is saved here for your own reference.</p>
        </div>
        {user && <div className="history-profile"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><small>Viewing history for</small><strong>{user.name}</strong></div></div>}
      </section>

      <section className="history-content container">
        {!token ? (
          <div className="history-empty-card">
            <div className="history-empty-icon"><LogIn size={23} /></div>
            <h2>Sign in to see your rooms.</h2>
            <p>Room history is private to each Watchtower account.</p>
            <button className="primary-button" type="button" onClick={onOpenAuth}>Log in <LogIn size={15} /></button>
          </div>
        ) : loading ? (
          <div className="history-loading"><span className="history-loading-orb" /><span>Loading your room history…</span></div>
        ) : error ? (
          <div className="history-empty-card error-card">
            <div className="history-empty-icon error"><History size={23} /></div>
            <h2>History is taking a moment.</h2>
            <p>{error}</p>
            <button className="ghost-button" type="button" onClick={onBack}>Back to home <ArrowLeft size={15} /></button>
          </div>
        ) : history.length === 0 ? (
          <div className="history-empty-card">
            <div className="history-empty-icon"><UsersRound size={23} /></div>
            <h2>Your first room is waiting.</h2>
            <p>Create a room or join one while signed in, and it will appear here.</p>
            <button className="primary-button" type="button" onClick={onBack}>Create or join <Plus size={15} /></button>
          </div>
        ) : (
          <div className="history-list">
            {history.map((entry, index) => {
              const hosted = entry.activity === 'created'
              return (
                <article className="history-row" key={entry.id} style={{ '--history-index': index } as CSSProperties}>
                  <div className={`history-row-icon ${hosted ? 'hosted' : 'joined'}`}><History size={17} /></div>
                  <div className="history-row-main">
                    <div className="history-row-title"><strong>{hosted ? 'You hosted a room' : 'You joined a room'}</strong><span className={hosted ? 'history-badge hosted' : 'history-badge joined'}>{hosted ? 'HOSTED' : 'JOINED'}</span></div>
                    <span className="history-row-date"><Clock3 size={13} /> Last activity {dateFormatter.format(new Date(entry.lastJoinedAt))}</span>
                  </div>
                  <div className="history-room-code"><span>ROOM CODE</span><strong>{entry.roomCode}</strong></div>
                  <button className="history-copy-button" type="button" onClick={() => copyCode(entry)} title="Copy room code" aria-label={`Copy room code ${entry.roomCode}`}>
                    {copiedId === entry.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
