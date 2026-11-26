// The AI assistant chat. The assistant can only PROPOSE: bookings and cancellations appear as cards, and nothing
// happens until the customer presses Confirm, which calls the same checked endpoints as the normal pages.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useConfig } from '../context.js';
import { formatDateTime, formatDate } from '../format.js';
import { errorText } from '../ui.jsx';

const GREETING = 'Hi! I can find a time, book it, or cancel a booking. For example: "a 60-minute session on Friday afternoon". Your messages are sent to an AI service, so please do not type personal details.';

function ProposalCard({ proposal, state, onConfirm, onDismiss, timezone }) {
  const isBook = proposal.type === 'BOOK';
  return (
    <div className="proposal" role="group" aria-label={isBook ? 'Booking proposal' : 'Cancellation proposal'}>
      <strong>{isBook ? 'Proposed booking' : 'Proposed cancellation'}</strong>
      <p>{proposal.serviceName}<br />{formatDate(proposal.local.date)} at {proposal.local.time} ({timezone}){proposal.price ? <><br />{proposal.price}</> : null}</p>
      {state?.result ? <p className={state.ok ? 'ok' : 'bad'} role="status">{state.result}</p> : (
        <p>
          <button type="button" className="button" disabled={state?.busy} onClick={onConfirm}>{state?.busy ? 'Working...' : isBook ? 'Confirm booking' : 'Confirm cancellation'}</button>{' '}
          <button type="button" className="button secondary" disabled={state?.busy} onClick={onDismiss}>Not now</button>
        </p>
      )}
    </div>
  );
}

export default function AssistantPanel({ onBooked }) {
  const config = useConfig();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING, local: true }]);
  const [proposalState, setProposalState] = useState({});     // "messageIndex:proposalIndex" -> { busy, result, ok }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [messages, open]);

  async function send(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next); setText(''); setBusy(true);
    try {
      // Only plain role/content pairs are sent; the server re-checks everything.
      const history = next.filter((m) => !m.local).map(({ role, content: c }) => ({ role, content: c }));
      const r = await api('/assistant/chat', { method: 'POST', body: { messages: history } });
      setMessages([...next, { role: 'assistant', content: r.reply, proposals: r.proposals }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: errorText(err), local: true, error: true }]);
    } finally { setBusy(false); }
  }

  async function confirm(key, proposal) {
    setProposalState((s) => ({ ...s, [key]: { busy: true } }));
    try {
      if (proposal.type === 'BOOK') {
        await api('/bookings', { method: 'POST', body: { serviceId: proposal.serviceId, startsAt: proposal.startsAt, via: 'ASSISTANT' } });
        setProposalState((s) => ({ ...s, [key]: { ok: true, result: `Booked: ${proposal.serviceName}, ${formatDateTime(proposal.startsAt, config.timezone)}.` } }));
      } else {
        await api(`/bookings/${proposal.bookingId}/cancel`, { method: 'POST' });
        setProposalState((s) => ({ ...s, [key]: { ok: true, result: 'Cancelled.' } }));
      }
      onBooked?.();
    } catch (err) {
      setProposalState((s) => ({ ...s, [key]: { ok: false, result: errorText(err) } }));
    }
  }

  if (!open) {
    return <button type="button" className="assistant-toggle" onClick={() => setOpen(true)} aria-label="Open the booking assistant">Ask the assistant</button>;
  }
  return (
    <aside className="assistant" aria-label="Booking assistant">
      <div className="assistant-head">
        <strong>Booking assistant</strong>
        <button type="button" className="link-button" onClick={() => setOpen(false)} aria-label="Close the assistant">Close</button>
      </div>
      <div className="assistant-log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}${m.error ? ' msg-error' : ''}`}>
            <p>{m.content}</p>
            {m.proposals?.map((p, j) => (
              <ProposalCard key={j} proposal={p} state={proposalState[`${i}:${j}`]} timezone={config.timezone}
                onConfirm={() => confirm(`${i}:${j}`, p)}
                onDismiss={() => setProposalState((s) => ({ ...s, [`${i}:${j}`]: { result: 'Dismissed.', ok: true } }))} />
            ))}
          </div>
        ))}
        {busy && <p className="muted">Thinking...</p>}
        <div ref={endRef} />
      </div>
      <form className="assistant-form" onSubmit={send}>
        <label className="sr-only" htmlFor="assistant-input">Message</label>
        <input id="assistant-input" value={text} maxLength="1000" placeholder="Type your request" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="button" disabled={busy || !text.trim()}>Send</button>
      </form>
      <p className="muted small">AI can make mistakes. Check the details on a card before you confirm. Please do not share passwords or sensitive personal information.</p>
    </aside>
  );
}
