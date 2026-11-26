import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfig, go } from '../context.js';
import { useAuth } from '../auth.jsx';
import { formatMoney } from '../format.js';
import { Notice, Spinner, errorText } from '../ui.jsx';

export default function ServicesPage() {
  const config = useConfig();
  const { user } = useAuth();
  const [services, setServices] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/services').then((r) => setServices(r.services)).catch((e) => setError(errorText(e)));
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Book your appointment</h1>
        <p>Pick a service, choose a time that suits you, and you are done.
          {config.assistantEnabled ? ' Prefer to just say what you need? Log in and ask the assistant (the chat button at the bottom right).' : ''}
        </p>
        {!user && <p><a className="button" href="#/login">Log in or create an account</a></p>}
      </section>
      <Notice kind="error">{error}</Notice>
      {!services && !error && <Spinner />}
      <ul className="cards">
        {services?.map((s) => (
          <li key={s.id} className="card">
            <h2>{s.name}</h2>
            <p>{s.description}</p>
            <p className="muted">{s.durationMinutes} minutes &middot; {formatMoney(s.priceCents, s.currency)}</p>
            <button type="button" className="button" onClick={() => go('/book', { service: s.id })}>Book this</button>
          </li>
        ))}
      </ul>
    </>
  );
}
