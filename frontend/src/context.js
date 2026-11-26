// Things many components need: the business settings from the server, and a helper to change page.
import { createContext, useContext } from 'react';
import { buildHash } from './format.js';

export const ConfigContext = createContext(null);
export const useConfig = () => useContext(ConfigContext);

/** go('/book', { service: 2 }) changes the address to #/book?service=2 */
export const go = (path, params) => { window.location.hash = buildHash(path, params); };
