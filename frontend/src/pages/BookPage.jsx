// Booking flow: service -> date -> time -> confirm. The server decides what is free; this page only shows it.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfig, go } from '../context.js';
import { useAuth } from '../auth.jsx';
import { addDays, formatDate, formatDateTime, formatMoney } from '../format.js';
import { Notice, Spinner, errorText } from '../ui.jsx';

export default function BookPage({ params, onBooked }) {
  const config = useConfig();
  const { user, ready } = useAuth();
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState(params.service ? Number(params.service) : '');
  const [date, setDate] = useState(params.date || config.today);
  const [slots, setSlots] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/services').then((r) => setServices(r.services)).catch((e) => setError(errorText(e))); }, []);

  // Whenever the service or date changes, ask the server for the free times.
  useEffect(() => {
    setChosen(null); setSlots(null); setDone(null);
    if (!serviceId || !date) return undefined;
    let cancelled = false;
    api(`/availability?serviceId=${serviceId}&date=${date}`)
      .then((r) => { if (!cancelled) { setSlots(r.slots); setError(''); } })
      .catch((e) => { if (!cancelled) { setSlots([]); setError(errorText(e)); } });
    return () => { cancelled = true; };
  }, [serviceId, date]);

  const service = services.find((s) => s.id === serviceId);

  async function confirm() {
    setBusy(true); setError('');
    try {
      const r = await api('/bookings', { method: 'POST', body: { serviceId, startsAt: chosen.startsAt, notes: notes || undefined } });
      setDone(r.booking); onBooked?.();
    } catch (e) {
      setError(errorText(e));
      if (e.status === 409) { setChosen(null); setSlots(null); api(`/availability?serviceId=${serviceId}&date=${date}`).then((r) => setSlots(r.slots)); }   // refresh the times
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <section>
        <h1>You are booked</h1>
        <Notice kind="success">{done.serviceName} with {done.staffName}, {formatDateTime(done.startsAt, config.timezone)} ({config.timezone}).</Notice>
        <p>You can cancel up to {config.cancelMinHours} hours before the start from <a href="#/mine">My bookings</a>.</p>
        <p><a className="button" href="#/">Book another</a></p>
      </section>
    );
  }

  return (
    <section>
      <h1>Choose a time</h1>
      <div className="form-row">
        <label>Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select a service</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</option>)}
          </select>
        </label>
        <label>Date
          <input type="date" value={date} min={config.today} max={addDays(config.today, config.maxDaysAhead)}
            onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="muted">All times are {config.timezone} time.{service && ` ${service.name}: ${formatMoney(service.priceCents, service.currency)}.`}</p>

      <Notice kind="error">{error}</Notice>
      {serviceId && slots === null && <Spinner label="Looking for free times..." />}
      {slots && slots.length === 0 && !error && <p>No free times on {formatDate(date)}. Try another day.</p>}
      {slots && slots.length > 0 && (
        <ul className="slots" aria-label={`Free times on ${formatDate(date)}`}>
          {slots.map((s) => (
            <li key={s.startsAt}>
              <button type="button" className={`slot${chosen?.startsAt === s.startsAt ? ' selected' : ''}`}
                aria-pressed={chosen?.startsAt === s.startsAt} onClick={() => setChosen(s)}>{s.localTime}</button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className="panel">
          <h2>Confirm</h2>
          <p>{service?.name} on {formatDate(date)} at {chosen.localTime}.</p>
          {ready && !user ? (
            <p><a className="button" href={`#/login?next=${encodeURIComponent(`/book?service=${serviceId}&date=${date}`)}`}>Log in to book this time</a></p>
          ) : (
            <>
              <label>Note for the studio (optional, please no sensitive personal details)
                <textarea rows="2" maxLength="500" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button type="button" className="button" disabled={busy} onClick={confirm}>{busy ? 'Booking...' : 'Confirm booking'}</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
