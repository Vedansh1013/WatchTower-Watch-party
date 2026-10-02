import { Check, Clock3, X } from 'lucide-react'
import type { ApprovalRequest } from '../types'

interface RequestQueueProps {
  requests: ApprovalRequest[]
  canReview: boolean
  onResolve: (requestId: string, approved: boolean) => void
}

function requestLabel(request: ApprovalRequest) {
  if (request.type === 'change_video') return 'change the video'
  if (request.type === 'seek') return `seek to ${Math.round(Number(request.payload.time || 0))}s`
  return request.type === 'play' ? 'play the video' : 'pause the video'
}

export function RequestQueue({ requests, canReview, onResolve }: RequestQueueProps) {
  if (requests.length === 0) return null
  return (
    <section className={`request-queue ${canReview ? 'can-review' : ''}`}>
      <div className="request-heading"><span className="request-icon"><Clock3 size={15} /></span><div><strong>{canReview ? 'Requests to review' : 'Waiting on the room'}</strong><span>{canReview ? 'Approve a change before it reaches everyone.' : 'A host or moderator will review your request.'}</span></div><span className="request-count">{requests.length}</span></div>
      {canReview && <div className="request-list">{requests.map((request) => <div className="request-row" key={request.id}><div className="request-copy"><strong>{request.username}</strong><span>wants to {requestLabel(request)}</span></div><div className="request-actions"><button className="approve-button" onClick={() => onResolve(request.id, true)}><Check size={14} /> Approve</button><button className="reject-button" onClick={() => onResolve(request.id, false)}><X size={14} /> Decline</button></div></div>)}</div>}
    </section>
  )
}
