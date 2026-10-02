import { Crown, MoreHorizontal, Shield, UserRound, UserRoundX } from 'lucide-react'
import type { Participant, Role } from '../types'

interface ParticipantsPanelProps {
  participants: Participant[]
  selfId: string
  isHost: boolean
  onAssignRole: (userId: string, role: Role) => void
  onRemove: (userId: string) => void
  onTransferHost: (userId: string) => void
}

const roleLabels: Record<Role, string> = {
  host: 'Host',
  moderator: 'Moderator',
  participant: 'Participant',
  viewer: 'Viewer',
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function ParticipantsPanel({ participants, selfId, isHost, onAssignRole, onRemove, onTransferHost }: ParticipantsPanelProps) {
  return (
    <section className="side-section participants-section">
      <div className="side-section-heading"><div><span className="section-kicker">IN THIS ROOM</span><h3>People <span>{participants.length}</span></h3></div><span className="live-dot-label"><span /> LIVE</span></div>
      <div className="participant-list">
        {participants.map((participant) => {
          const isSelf = participant.id === selfId
          return (
            <div className={`participant-row ${isSelf ? 'is-self' : ''}`} key={participant.id}>
              <div className={`participant-avatar role-${participant.role}`}><span>{initials(participant.username)}</span>{participant.role === 'host' && <Crown size={11} className="avatar-crown" />}</div>
              <div className="participant-meta"><strong>{participant.username}{isSelf ? <small> (you)</small> : ''}</strong><span>{roleLabels[participant.role]}</span></div>
              {isHost && !isSelf ? (
                <div className="participant-actions">
                  <select aria-label={`Role for ${participant.username}`} value={participant.role} onChange={(event) => onAssignRole(participant.id, event.target.value as Role)}>
                    <option value="participant">Participant</option>
                    <option value="moderator">Moderator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="mini-icon-button" title={`More actions for ${participant.username}`} onClick={() => {
                    const shouldTransfer = window.confirm(`Transfer host to ${participant.username}?`)
                    if (shouldTransfer) onTransferHost(participant.id)
                  }}><MoreHorizontal size={16} /></button>
                  <button className="mini-icon-button danger" title={`Remove ${participant.username}`} onClick={() => onRemove(participant.id)}><UserRoundX size={15} /></button>
                </div>
              ) : (
                <div className="participant-role-icon">{participant.role === 'host' ? <Crown size={15} /> : participant.role === 'moderator' ? <Shield size={15} /> : <UserRound size={15} />}</div>
              )}
            </div>
          )
        })}
      </div>
      {isHost && <p className="panel-hint">Assign moderators with the role menu. The overflow action can transfer the room.</p>}
    </section>
  )
}
