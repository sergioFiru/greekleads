'use client'
import { useState, useRef, useEffect } from 'react'
import Icon from './Icon'

export interface ScoutFilters {
  prefectures: string[]
  legal_types: string[]
  has_email: boolean
  has_phone: boolean
  has_website: boolean
  has_no_website: boolean
  statuses: string[]
  activities: string[]
}

export interface ScoutRecipe {
  filters: ScoutFilters
  explanation: string
  summary: string
  result_count: number | null
  activity_keywords: string[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  recipe?: ScoutRecipe
}

// Sparkle SVG path used in ScoutMark
function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5L9.3 5.7L13.5 7L9.3 8.3L8 12.5L6.7 8.3L2.5 7L6.7 5.7L8 1.5Z"
        fill="var(--accent)"
      />
      <path
        d="M13 1L13.7 3.3L16 4L13.7 4.7L13 7L12.3 4.7L10 4L12.3 3.3L13 1Z"
        fill="var(--accent)"
        opacity="0.5"
      />
    </svg>
  )
}

function ScoutMark({ size = 28 }: { size?: number }) {
  return (
    <span className="scout-mark" style={{ width: size, height: size }}>
      <Sparkle size={Math.round(size * 0.55)} />
    </span>
  )
}

function RecipeCard({ recipe }: { recipe: ScoutRecipe }) {
  const chips = [
    ...recipe.activity_keywords.slice(0, 2).map(k => `Κλάδος: ${k}`),
    ...recipe.filters.prefectures.slice(0, 3),
    ...recipe.filters.legal_types.slice(0, 2),
    recipe.filters.has_email      ? '✉ Email' : '',
    recipe.filters.has_phone      ? '✆ Τηλέφωνο' : '',
    recipe.filters.has_website    ? '⌁ Website' : '',
    recipe.filters.has_no_website ? '⌁ Χωρίς website' : '',
  ].filter(Boolean)

  return (
    <div className="scout-recipe-card">
      <div className="scout-recipe-header">
        <span className="scout-recipe-title">Φίλτρα αναζήτησης</span>
        {recipe.result_count != null && (
          <span className="scout-recipe-count">
            ≈ {recipe.result_count.toLocaleString('el-GR')} εταιρείες
          </span>
        )}
      </div>
      {chips.length > 0 && (
        <div className="scout-recipe-chips">
          {chips.map((c, i) => <span key={i} className="scout-recipe-chip">{c}</span>)}
        </div>
      )}
      <p className="scout-recipe-rationale">{recipe.explanation}</p>
    </div>
  )
}

function TypingRow() {
  return (
    <div className="scout-msg scout-msg-scout">
      <ScoutMark size={24} />
      <div className="scout-typing">
        <span className="scout-dot" style={{ animationDelay: '0ms' }} />
        <span className="scout-dot" style={{ animationDelay: '150ms' }} />
        <span className="scout-dot" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

const SUGGESTIONS = ['Μόνο Αττική', 'Προσθές email', 'Μεγαλύτερες εταιρείες (ΑΕ/ΕΠΕ)', 'Βόρεια Ελλάδα']

export function ScoutPanel({
  open,
  onClose,
  onApply,
}: {
  open: boolean
  onClose: () => void
  onApply: (recipe: ScoutRecipe) => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Γεια! Περίγραψέ μου τι πουλάς και σε ποιους στοχεύεις — θα επιλέξω τα καλύτερα φίλτρα για σένα.',
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [hasRecipe, setHasRecipe] = useState(false)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 220)
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, typing])

  const send = async (text: string) => {
    if (!text.trim() || typing) return
    const userMsg: Message = { role: 'user', content: text.trim() }

    // Capture current state synchronously before async call
    const currentMessages = messages
    const allMsgs = [...currentMessages, userMsg]

    // Build alternating user/assistant history for the API
    const conversationMessages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of allMsgs) {
      if (m.role === 'user') {
        conversationMessages.push({ role: 'user', content: m.content })
      } else if (m.recipe) {
        conversationMessages.push({
          role: 'assistant',
          content: JSON.stringify({
            filters: m.recipe.filters,
            summary: m.recipe.summary,
            activity_keywords: m.recipe.activity_keywords,
          }),
        })
      }
      // Skip greeting-only assistant messages (no recipe)
    }

    setMessages(allMsgs)
    setInput('')
    setTyping(true)

    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationMessages }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const recipe: ScoutRecipe = {
        filters:           data.filters,
        explanation:       data.explanation,
        summary:           data.summary,
        result_count:      data.result_count,
        activity_keywords: data.activity_keywords ?? [],
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.explanation, recipe }])
      setHasRecipe(true)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Συγγνώμη, κάτι πήγε στραβά. Δοκίμασε ξανά.',
      }])
    } finally {
      setTyping(false)
    }
  }

  const lastRecipe = [...messages].reverse().find(m => m.recipe)?.recipe ?? null

  return (
    <>
      {open && <div className="scout-backdrop" onClick={onClose} />}

      <div className="scout-panel" data-open={open ? 'true' : 'false'}>
        {/* Header */}
        <div className="scout-header">
          <ScoutMark size={28} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="scout-title">Scout</span>
              <span className="badge badge-amber" style={{ fontSize: 10, padding: '1px 6px' }}>AI</span>
            </div>
            <div className="scout-subtitle">Prospecting agent · sets your filters</div>
          </div>
          <button className="scout-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Messages */}
        <div className="scout-messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`scout-msg ${m.role === 'user' ? 'scout-msg-user' : 'scout-msg-scout'}`}>
              {m.role === 'assistant' && <ScoutMark size={24} />}
              <div className={m.role === 'user' ? 'scout-bubble-user' : 'scout-bubble-scout'}>
                <span>{m.content}</span>
                {m.recipe && <RecipeCard recipe={m.recipe} />}
              </div>
            </div>
          ))}
          {typing && <TypingRow />}

          {hasRecipe && !typing && (
            <div className="scout-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="scout-suggestion" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {/* Apply button */}
        {lastRecipe && (
          <div className="scout-apply-bar">
            <button
              className="sp-btn sp-btn-primary"
              style={{ flex: 1 }}
              onClick={() => { onApply(lastRecipe); onClose() }}
            >
              Εφαρμογή φίλτρων
              {lastRecipe.result_count != null && (
                <span style={{ opacity: 0.8, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  {' '}· {lastRecipe.result_count.toLocaleString('el-GR')}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Input */}
        <div className="scout-input-area">
          <textarea
            ref={textareaRef}
            className="scout-textarea"
            placeholder="Περίγραψε τι πουλάς και σε ποιους..."
            value={input}
            rows={2}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
          />
          <button
            className="sp-btn sp-btn-primary scout-send-btn"
            onClick={() => send(input)}
            disabled={!input.trim() || typing}
          >
            Αποστολή
          </button>
        </div>
      </div>
    </>
  )
}

export function ScoutPromptBar({ onClick }: { onClick: () => void }) {
  return (
    <div className="scout-prompt-bar" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}>
      <ScoutMark size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            Περίγραψε ποιους θες να βρεις
          </span>
          <span className="badge badge-amber" style={{ fontSize: 10, padding: '1px 6px', flexShrink: 0 }}>AI</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
          π.χ. «Πουλάω λογισμικό σε εταιρείες μεταφορών στην Αττική» — ο Scout επιλέγει τα φίλτρα
        </div>
      </div>
      <button
        className="sp-btn sp-btn-secondary sp-btn-sm"
        style={{ flexShrink: 0 }}
        onClick={e => { e.stopPropagation(); onClick() }}
      >
        <Sparkle size={11} />
        Ρώτα τον Scout
      </button>
    </div>
  )
}

export function ScoutSummaryBar({
  summary,
  onRefine,
  onClear,
}: {
  summary: string
  onRefine: () => void
  onClear: () => void
}) {
  return (
    <div className="scout-summary-bar">
      <ScoutMark size={22} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', minWidth: 0 }}>
        <span style={{ color: 'var(--text-muted)' }}>Scout · </span>
        {summary}
      </span>
      <button className="sp-btn sp-btn-secondary sp-btn-sm" onClick={onRefine} style={{ flexShrink: 0 }}>
        <Sparkle size={10} />
        Βελτίωση
      </button>
      <button className="sp-btn sp-btn-ghost sp-btn-sm" onClick={onClear} style={{ flexShrink: 0 }}>
        Καθαρισμός
      </button>
    </div>
  )
}
