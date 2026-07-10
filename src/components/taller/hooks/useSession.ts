import { useEffect, useState } from 'preact/hooks';

const TOKEN_KEY = 'taller_token';

// Sesión del taller: token en localStorage. `invalidate` limpia el token
// (p. ej. tras un 401) y deja un mensaje para el gate.
export function useSession() {
  const [token, setToken] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  return {
    token,
    gateError,
    save(t: string) {
      const clean = t.trim();
      if (!clean) return;
      localStorage.setItem(TOKEN_KEY, clean);
      setGateError(null);
      setToken(clean);
    },
    logout() {
      localStorage.removeItem(TOKEN_KEY);
      setGateError(null);
      setToken(null);
    },
    invalidate(message: string) {
      localStorage.removeItem(TOKEN_KEY);
      setGateError(message);
      setToken(null);
    },
  };
}
