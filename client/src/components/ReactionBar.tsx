import { Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'

interface ReactionBarProps {
  onReact: (emoji: string) => void
}

const reactions = [
  { emoji: '👏', label: 'Applause' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '❤️', label: 'Love it' },
  { emoji: '🔥', label: 'Fire' },
]

export function ReactionBar({ onReact }: ReactionBarProps) {
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null)
  const resetTimer = useRef<number | null>(null)

  function react(emoji: string) {
    onReact(emoji)
    setActiveEmoji(emoji)
    if (resetTimer.current) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setActiveEmoji(null), 360)
  }

  return (
    <section className="reaction-bar" aria-label="Room reactions">
      <div className="reaction-bar-copy"><span className="reaction-bar-icon"><Sparkles size={14} /></span><div><strong>React in the moment</strong><span>Everyone in the room sees it</span></div></div>
      <div className="reaction-options">
        {reactions.map((reaction) => <button className={`reaction-button ${activeEmoji === reaction.emoji ? 'is-active' : ''}`} key={reaction.emoji} type="button" aria-label={reaction.label} title={reaction.label} onClick={() => react(reaction.emoji)}>{reaction.emoji}</button>)}
      </div>
    </section>
  )
}
