import { useEffect } from 'react'
import { ArrowLeft, Code2, ExternalLink, Github, Linkedin, Mail, Radio, Sparkles } from 'lucide-react'

interface AboutPageProps {
  onBack: () => void
}

export function AboutPage({ onBack }: AboutPageProps) {
  useEffect(() => {
    document.title = 'About Watchtower'
  }, [])

  return (
    <main className="about-page">
      <nav className="account-nav container">
        <button className="room-brand account-brand-button" type="button" onClick={onBack}>
          <div className="brand-mark" aria-hidden="true"><img src="/watchtower-mark.png" alt="" /></div>
          <div><div className="brand-name">watchtower</div><div className="brand-caption">shared screen / shared moment</div></div>
        </button>
        <button className="nav-link account-back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> Home</button>
      </nav>

      <section className="about-hero container">
        <div className="section-kicker"><span className="eyebrow-dot" /> ABOUT THE PROJECT</div>
        <h1>Built for the moments worth <em>sharing.</em></h1>
        <p>Watchtower is a real-time watch-party experience that keeps people, reactions, and one shared timeline together—even when they are not in the same room.</p>
      </section>

      <section className="about-grid container">
        <article className="about-story-card about-profile-card">
          <div className="about-icon lime"><Sparkles size={21} /></div>
          <span className="section-kicker">THE BUILDER</span>
          <h2>Vedansh Raj Tyagi</h2>
          <p className="about-profile-role">Full Stack Developer <span aria-hidden="true">/</span> IMS Engineering College</p>
          <p>Vedansh is a curious fourth-year engineering student who brings a product-minded eye to full-stack development. He enjoys turning real-time ideas into clear, polished web experiences that feel technically dependable and genuinely human.</p>
        </article>
        <article className="about-story-card">
          <div className="about-icon blue"><Radio size={21} /></div>
          <h2>One shared beat.</h2>
          <p>Socket.IO keeps playback, chat, requests, and emoji reactions moving through the room together.</p>
        </article>
        <article className="about-story-card">
          <div className="about-icon peach"><Code2 size={21} /></div>
          <h2>Built end to end.</h2>
          <p>React drives the interface, Node and Express handle the room, and PostgreSQL keeps account data and personal room history durable.</p>
        </article>
        <article className="about-story-card about-contact-card">
          <div className="about-icon rose"><Mail size={20} /></div>
          <span className="section-kicker">CONTACT US</span>
          <h2>Let&apos;s build something thoughtful.</h2>
          <p>For collaboration, feedback, or a closer look at the work, connect with Vedansh through either profile.</p>
          <a className="about-email-link" href="mailto:vedanshrajtyagi@gmail.com" aria-label="Email Vedansh Raj Tyagi"><Mail size={15} /> vedanshrajtyagi@gmail.com</a>
          <div className="about-link-row" aria-label="Vedansh's professional profiles">
            <a className="about-social-link" href="https://github.com/Vedansh1013" target="_blank" rel="noreferrer"><Github size={16} /> GitHub <ExternalLink size={12} aria-hidden="true" /></a>
            <a className="about-social-link" href="https://www.linkedin.com/in/vedansh-raj-tyagi" target="_blank" rel="noreferrer"><Linkedin size={16} /> LinkedIn <ExternalLink size={12} aria-hidden="true" /></a>
          </div>
        </article>
      </section>

      <footer className="about-footer container"><span>WATCHTOWER / 2026</span><button type="button" onClick={onBack}>Back to Watchtower <ArrowLeft size={14} /></button></footer>
    </main>
  )
}
