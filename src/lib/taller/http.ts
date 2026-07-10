import { API_BASE } from '../../config/api';

// Transporte único de todos los módulos de /taller: bearer del taller y
// manejo uniforme de errores. Un 401 lanza 'no_autorizado' para que la UI
// vuelva a pedir el token.
export async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/admin${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('no_autorizado');
  if (!res.ok) throw new Error(`error_${res.status}`);
  return (await res.json()) as T;
}
