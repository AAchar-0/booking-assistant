// The shell: header, the current page (chosen from the #hash in the address bar), footer, and the assistant.
// A hash router (#/book) is used on purpose: GitHub Pages serves static files only, so a path like /book would give a 404 on refresh.
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { parseHash } from './format.js';
import { ConfigContext, go } from './context.js';
import ServicesPage from './pages/ServicesPage.jsx';
import BookPage from './pages/BookPage.jsx';
import MyBookingsPage from './pages/MyBookingsPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AssistantPanel from './components/AssistantPanel.jsx';

const PORTFOLIO_URL = import.meta.env.VITE_PORTFOLIO_URL || 'https://aachar-0.github.io/';
const SOURCE_URL = import.meta.env.VITE_SOURCE_URL || 'https://github.com/AAchar-0/booking-assistant';

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => { setRoute(parseHash(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const { user, ready, logout } = useAuth();
  const [config, setConfig] = useState(null);
  const [serverState, setServerState] = useState('waking');   // 'waking' | 'up' | 'down'
  const [bookingsVersion, setBookingsVersion] = useState(0);   // bumped when the assistant books, so lists refresh

  // Wake the free-tier server as soon as the page opens, and learn the business settings.
  useEffect(() => {
    let cancelled = false;
    api('/config').then((c) => { if (!cancelled) { setConfig(c); setServerState('up'); } })
      .catch(() => { if (!cancelled) setServerState('down'); });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => config, [config]);

  let page;
  if (!config) {
    page = serverState === 'down'
      ? <p className="notice notice-error" role="alert">The booking server is not answering. Please refresh in a minute.</p>
      : <p className="notice notice-info" role="status">Waking up the demo server. Free hosting can take up to a minute the first time...</p>;
  } else {
    switch (route.path) {
      case '/book': page = <BookPage params={route.params} onBooked={() => setBookingsVersion((n) => n + 1)} />; break;
      case '/mine': page = <MyBookingsPage version={bookingsVersion} />; break;
      case '/login': page = <AuthPage next={route.params.next} />; break;
      case '/admin': page = <AdminPage />; break;
      default: page = <ServicesPage />;
    }
  }

  return (
    <ConfigContext.Provider value={value}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <a className="brand" href="#/">{config?.businessName ?? 'Booking'}</a>
        <nav aria-label="Main">
          <a href="#/">Services</a>
          <a href="#/mine">My bookings</a>
          {user?.role === 'ADMIN' && <a href="#/admin">Admin</a>}
          {ready && (user
            ? <button type="button" className="link-button" onClick={() => { logout(); go('/'); }}>Log out ({user.fullName.split(' ')[0]})</button>
            : <a href="#/login">Log in</a>)}
        </nav>
      </header>

      {config?.demoMode && (
        <p className="banner">Demo project: this is a made-up business. Bookings are not real, and nothing is charged.
          {' '}Running without a database: data is erased when the server restarts.</p>
      )}
      {config && !config.demoMode && (
        <p className="banner">Demo project: this is a made-up business. Bookings are not real, and nothing is charged.</p>
      )}

      <main id="main">{page}</main>

      {config?.assistantEnabled && user && <AssistantPanel onBooked={() => setBookingsVersion((n) => n + 1)} />}

      <footer className="site-footer">
        <p>&copy; {new Date().getFullYear()} &middot; Created by Anade Acharo.{' '}
          <a href={PORTFOLIO_URL} rel="noopener">Portfolio</a>.{' '}
          <a href={SOURCE_URL} rel="noopener">Source code</a></p>
      </footer>
    </ConfigContext.Provider>
  );
}
