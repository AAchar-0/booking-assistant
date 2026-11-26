// Who is logged in, available to every component through React context.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());     // if there is no token there is nothing to check

  useEffect(() => {
    if (!getToken()) return;
    api('/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const authenticate = useCallback(async (path, body) => {
    const result = await api(path, { method: 'POST', body });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo(() => ({
    user, ready,
    login: (email, password) => authenticate('/auth/login', { email, password }),
    register: (email, fullName, password) => authenticate('/auth/register', { email, fullName, password }),
    logout: () => { setToken(null); setUser(null); },
  }), [user, ready, authenticate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
