import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfig } from '../context.js';
import { useAuth } from '../auth.jsx';
import { formatDateTime } from '../format.js';
import { Notice, Spinner, errorText } from '../ui.jsx';

export default function MyBookingsPage({ version }) {
  const config = useConfig();
  const { user, ready } = useAuth();
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);     // id of the booking awaiting "yes, cancel"

  const load = useCallback(() => {
    api('/bookings/mine').then((r) => setBookings(r.bookings)).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => { if (user) load(); }, [user, load, version]);

  async function cancel(id) {
    setError('');
    try { await api(`/bookings/${id}/cancel`, { method: 'POST' }); setConfirming(null); load(); }
    catch (e) { setError(errorText(e)); setConfirming(null); }
  }

  if (!ready) return <Spinner />;
  if (!user) return <section><h1>My bookings</h1><p><a className="button" href="#/login?next=%2Fmine">Log in</a> to see your bookings.</p></section>;

  const upcoming = (bookings ?? []).filter((b) => b.status === 'CONFIRMED' && Date.parse(b.endsAt) > Date.now());
  const rest = (bookings ?? []).filter((b) => !upcoming.includes(b)).reverse();

  const row = (b, canCancel) => (
    <li key={b.id} className="card">
      <h3>{b.serviceName}</h3>
      <p>{formatDateTime(b.startsAt, config.timezone)} with {b.staffName}{b.createdVia === 'ASSISTANT' ? ' (booked with the assistant)' : ''}</p>
      <p><span className={`badge badge-${b.status.toLowerCase()}`}>{b.status.replace('_', ' ')}</span></p>
      {canCancel && (confirming === b.id
        ? <p>Cancel this booking? <button type="button" className="button danger" onClick={() => cancel(b.id)}>Yes, cancel</button>{' '}
            <button type="button" className="button secondary" onClick={() => setConfirming(null)}>Keep it</button></p>
        : <button type="button" className="button secondary" onClick={() => setConfirming(b.id)}>Cancel booking</button>)}
    </li>
  );

  return (
    <section>
      <h1>My bookings</h1>
      <Notice kind="error">{error}</Notice>
      {!bookings && !error && <Spinner />}
      {bookings && upcoming.length === 0 && <p>No upcoming bookings. <a href="#/">Book one</a>.</p>}
      <ul className="cards">{upcoming.map((b) => row(b, true))}</ul>
      {rest.length > 0 && <><h2>Past and cancelled</h2><ul className="cards">{rest.map((b) => row(b, false))}</ul></>}
    </section>
  );
}
