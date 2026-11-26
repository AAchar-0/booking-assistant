// Staff area: bookings, services and a 30-day summary. Every call here is also protected on the server (admin role).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfig } from '../context.js';
import { useAuth } from '../auth.jsx';
import { addDays, formatDateTime, formatMoney } from '../format.js';
import { Notice, Spinner, errorText } from '../ui.jsx';

function Bookings() {
  const config = useConfig();
  const [from, setFrom] = useState(config.today);
  const [to, setTo] = useState(addDays(config.today, 14));
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = new URLSearchParams({ from, to, ...(status ? { status } : {}) });
    api(`/admin/bookings?${q}`).then((r) => { setRows(r.bookings); setError(''); }).catch((e) => setError(errorText(e)));
  }, [from, to, status]);
  useEffect(load, [load]);

  async function setBookingStatus(id, next) {
    try { await api(`/admin/bookings/${id}`, { method: 'PATCH', body: { status: next } }); load(); }
    catch (e) { setError(errorText(e)); }
  }

  return (
    <>
      <div className="form-row">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
      </div>
      <Notice kind="error">{error}</Notice>
      {!rows && !error && <Spinner />}
      {rows && rows.length === 0 && <p>No bookings in this range.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Service</th><th>Staff</th><th>Customer</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{formatDateTime(b.startsAt, config.timezone)}</td>
                  <td>{b.serviceName}</td>
                  <td>{b.staffName}</td>
                  <td>{b.customerName}<br /><span className="muted small">{b.customerEmail}</span></td>
                  <td><span className={`badge badge-${b.status.toLowerCase()}`}>{b.status.replace('_', ' ')}</span></td>
                  <td className="actions">
                    {b.status === 'CONFIRMED' && <>
                      <button type="button" className="button small" onClick={() => setBookingStatus(b.id, 'COMPLETED')}>Complete</button>
                      <button type="button" className="button small secondary" onClick={() => setBookingStatus(b.id, 'NO_SHOW')}>No-show</button>
                      <button type="button" className="button small danger" onClick={() => setBookingStatus(b.id, 'CANCELLED')}>Cancel</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Services() {
  const [services, setServices] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', durationMinutes: 30, price: 1000 });
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/admin/services').then((r) => setServices(r.services)).catch((e) => setError(errorText(e))); }, []);
  useEffect(load, [load]);

  async function add(e) {
    e.preventDefault(); setError('');
    try {
      await api('/admin/services', { method: 'POST', body: {
        name: form.name, description: form.description, durationMinutes: Number(form.durationMinutes), priceCents: Math.round(Number(form.price) * 100),
      } });
      setForm({ name: '', description: '', durationMinutes: 30, price: 1000 }); load();
    } catch (err) { setError(errorText(err)); }
  }
  async function toggle(s) {
    try { await api(`/admin/services/${s.id}`, { method: 'PATCH', body: { active: !s.active } }); load(); }
    catch (err) { setError(errorText(err)); }
  }

  return (
    <>
      <Notice kind="error">{error}</Notice>
      {!services && !error && <Spinner />}
      {services && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Minutes</th><th>Price</th><th>Shown to customers</th><th /></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td><td>{s.durationMinutes}</td><td>{formatMoney(s.priceCents, s.currency)}</td>
                  <td>{s.active ? 'Yes' : 'Hidden'}</td>
                  <td><button type="button" className="button small secondary" onClick={() => toggle(s)}>{s.active ? 'Hide' : 'Show'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Add a service</h2>
      <form onSubmit={add} className="form-row">
        <label>Name <input required maxLength="100" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Description <input maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Minutes (multiple of 5) <input type="number" min="5" max="480" step="5" required value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></label>
        <label>Price (KES) <input type="number" min="0" step="1" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
        <button type="submit" className="button">Add</button>
      </form>
      <p className="muted small">New services need staff and opening hours assigned in the database (see docs) before they show free times.</p>
    </>
  );
}

function Stats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/admin/stats').then(setStats).catch((e) => setError(errorText(e))); }, []);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!stats) return <Spinner />;
  const total = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);
  return (
    <>
      <p className="muted">{stats.from} to {stats.to}</p>
      <ul className="cards">
        <li className="card"><h3>All bookings</h3><p className="big">{total}</p></li>
        {Object.entries(stats.byStatus).map(([k, n]) => <li key={k} className="card"><h3>{k.replace('_', ' ')}</h3><p className="big">{n}</p></li>)}
      </ul>
      <h2>Most booked services</h2>
      {stats.topServices.length === 0 ? <p>No bookings yet.</p> : (
        <ol>{stats.topServices.map((s) => <li key={s.name}>{s.name}: {s.count}</li>)}</ol>
      )}
    </>
  );
}

export default function AdminPage() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState('bookings');
  if (!ready) return <Spinner />;
  if (user?.role !== 'ADMIN') return <section><h1>Admin</h1><p>This area is for studio staff only.</p></section>;
  return (
    <section>
      <h1>Admin</h1>
      <div className="tabs" role="tablist">
        {[['bookings', 'Bookings'], ['services', 'Services'], ['stats', 'Last 30 days']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'bookings' && <Bookings />}
      {tab === 'services' && <Services />}
      {tab === 'stats' && <Stats />}
    </section>
  );
}
