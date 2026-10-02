import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import type { ChatMessage } from '../types'

interface ChatPanelProps {
  messages: ChatMessage[]
  selfId: string
  onSend: (text: string) => void
}

function messageTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function ChatPanel({ messages, selfId, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = messagesRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages.length])

  function submitMessage(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="side-section chat-section">
      <div className="side-section-heading"><div><span className="section-kicker">ROOM CHAT</span><h3>Say something <MessageCircle size={16} /></h3></div><span className="message-count">{messages.length}</span></div>
      <div className="message-list" ref={messagesRef}>
        {messages.length === 0 ? <div className="empty-chat"><span className="empty-chat-mark">✦</span><strong>The room is quiet.</strong><span>Be the first to say hello.</span></div> : messages.map((message) => {
          const own = message.userId === selfId
          return <div className={`message-row ${own ? 'own' : ''}`} key={message.id}><div className="message-avatar">{initials(message.username)}</div><div className="message-content"><div className="message-byline"><strong>{own ? 'You' : message.username}</strong><time>{messageTime(message.createdAt)}</time></div><p>{message.text}</p></div></div>
        })}
      </div>
      <form className="chat-form" onSubmit={submitMessage}><input aria-label="Chat message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a thought…" maxLength={500} /><button className="send-button" aria-label="Send message" type="submit"><Send size={15} /></button></form>
    </section>
  )
}
