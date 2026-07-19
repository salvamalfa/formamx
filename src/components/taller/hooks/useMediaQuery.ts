import { useEffect, useState } from 'preact/hooks';

// Rama de layout por ancho de viewport. El taller es una isla `client:only`,
// así que `matchMedia` siempre existe; el guard es por si corre en un entorno
// sin window (tests unitarios). Se usa para elegir entre la tabla de pedidos
// de escritorio y las cards apiladas de móvil sin duplicar el DOM (dos copias
// del mismo texto romperían los locators de Playwright).
export function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
