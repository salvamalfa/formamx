// Una edición es un archivo de texto: frontmatter plano y luego secciones
// `## tipo`. Escribir una edición tiene que sentirse como escribir, no como
// llenar un JSON, así que el formato admite prosa en párrafos normales y solo
// pide `clave: valor` para lo que de verdad es un dato (una imagen, una URL).
//
// A propósito NO es YAML: el repo no tiene dependencias para scripts y un
// parser de YAML completo es demasiado para lo que aquí se necesita.

export type ItemGaleria = { imagen: string; alt: string; pie: string };
export type Enlace = { texto: string; url: string };

export type Bloque =
  | { tipo: 'entrada'; titulo: string; parrafos: string[] }
  | { tipo: 'pieza'; imagen: string; alt: string; meta: string }
  | { tipo: 'accion'; parrafos: string[]; boton: string; url: string }
  | { tipo: 'galeria'; titulo: string; items: ItemGaleria[]; enlace: Enlace | null }
  | { tipo: 'nota'; titulo: string; parrafos: string[] }
  | { tipo: 'afuera'; etiqueta: string; titulo: string; parrafos: string[] };

export type Edicion = {
  numero: number;
  fecha: string;
  asunto: string;
  preheader: string;
  bloques: Bloque[];
};

type Seccion = { tipo: string; atributos: Map<string, string[]>; parrafos: string[] };

/** Convierte el texto de una edición en datos, o explica por qué no puede. */
export function parsearEdicion(texto: string, origen = 'la edición'): Edicion {
  const { frontmatter, cuerpo } = separarFrontmatter(texto, origen);
  const numero = Number(exigir(frontmatter, 'edicion', origen));
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error(`${origen}: "edicion" tiene que ser un entero positivo`);
  }
  return {
    numero,
    fecha: exigir(frontmatter, 'fecha', origen),
    asunto: exigir(frontmatter, 'asunto', origen),
    preheader: exigir(frontmatter, 'preheader', origen),
    bloques: partirSecciones(cuerpo, origen).map((s) => construirBloque(s, origen)),
  };
}

function separarFrontmatter(texto: string, origen: string): { frontmatter: Map<string, string>; cuerpo: string } {
  const normalizado = texto.replace(/\r\n/g, '\n');
  const corte = /^---\n([\s\S]*?)\n---\n?/.exec(normalizado);
  if (!corte || corte[1] === undefined) {
    throw new Error(`${origen}: falta el frontmatter delimitado por --- al principio`);
  }
  const frontmatter = new Map<string, string>();
  for (const linea of corte[1].split('\n')) {
    if (!linea.trim()) continue;
    const par = /^([a-z_]+)\s*:\s*(.*)$/i.exec(linea);
    if (!par || par[1] === undefined || par[2] === undefined) {
      throw new Error(`${origen}: no entiendo la línea de frontmatter "${linea.trim()}"`);
    }
    frontmatter.set(par[1].toLowerCase(), par[2].trim());
  }
  return { frontmatter, cuerpo: normalizado.slice(corte[0].length) };
}

function exigir(frontmatter: Map<string, string>, clave: string, origen: string): string {
  const valor = frontmatter.get(clave);
  if (!valor) throw new Error(`${origen}: falta "${clave}" en el frontmatter`);
  return valor;
}

/** Parte el cuerpo en secciones `## tipo`, separando atributos de prosa. */
function partirSecciones(cuerpo: string, origen: string): Seccion[] {
  const secciones: Seccion[] = [];
  for (const trozo of cuerpo.split(/^##[ \t]+/m).slice(1)) {
    const lineas = trozo.split('\n');
    const tipo = (lineas.shift() ?? '').trim().toLowerCase();
    const atributos = new Map<string, string[]>();
    const prosa: string[] = [];
    let yaHuboProsa = false;
    for (const linea of lineas) {
      const par = /^([a-z]+)\s*:\s+(.*)$/i.exec(linea);
      // Un `clave: valor` después de empezar la prosa es parte del texto (por
      // ejemplo "Nota: lo probé dos veces"), no un atributo.
      if (par && !yaHuboProsa && par[1] !== undefined && par[2] !== undefined) {
        const clave = par[1].toLowerCase();
        atributos.set(clave, [...(atributos.get(clave) ?? []), par[2].trim()]);
      } else {
        if (linea.trim()) yaHuboProsa = true;
        prosa.push(linea);
      }
    }
    const parrafos = prosa
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim().replace(/\s*\n\s*/g, ' '))
      .filter(Boolean);
    if (!tipo) throw new Error(`${origen}: hay un "##" sin tipo de bloque`);
    secciones.push({ tipo, atributos, parrafos });
  }
  if (!secciones.length) throw new Error(`${origen}: no tiene ningún bloque "## tipo"`);
  return secciones;
}

function construirBloque(s: Seccion, origen: string): Bloque {
  const uno = (clave: string): string => {
    const valores = s.atributos.get(clave);
    if (!valores?.length || valores[0] === undefined) {
      throw new Error(`${origen}: al bloque "${s.tipo}" le falta "${clave}:"`);
    }
    return valores[0];
  };
  const conParrafos = (): string[] => {
    if (!s.parrafos.length) throw new Error(`${origen}: el bloque "${s.tipo}" no tiene texto`);
    return s.parrafos;
  };

  switch (s.tipo) {
    case 'entrada':
      return { tipo: 'entrada', titulo: uno('titulo'), parrafos: conParrafos() };
    case 'pieza':
      return { tipo: 'pieza', imagen: uno('imagen'), alt: uno('alt'), meta: uno('meta') };
    case 'accion':
      return { tipo: 'accion', parrafos: conParrafos(), boton: uno('boton'), url: uno('url') };
    case 'galeria':
      return {
        tipo: 'galeria',
        titulo: uno('titulo'),
        items: (s.atributos.get('item') ?? []).map((linea) => partirItem(linea, origen)),
        enlace: s.atributos.has('enlace') ? partirEnlace(uno('enlace'), origen) : null,
      };
    case 'nota':
      return { tipo: 'nota', titulo: uno('titulo'), parrafos: conParrafos() };
    case 'afuera':
      return { tipo: 'afuera', etiqueta: uno('etiqueta'), titulo: uno('titulo'), parrafos: conParrafos() };
    default:
      throw new Error(
        `${origen}: no existe el bloque "${s.tipo}". Los que hay: entrada, pieza, accion, galeria, nota, afuera`,
      );
  }
}

function partirItem(linea: string, origen: string): ItemGaleria {
  const partes = linea.split('|').map((p) => p.trim());
  const [imagen, alt, pie] = partes;
  if (partes.length !== 3 || !imagen || !alt || !pie) {
    throw new Error(`${origen}: cada "item:" de la galería va como "imagen | alt | pie", y llegó "${linea}"`);
  }
  return { imagen, alt, pie };
}

function partirEnlace(linea: string, origen: string): Enlace {
  const partes = linea.split('|').map((p) => p.trim());
  const [texto, url] = partes;
  if (partes.length !== 2 || !texto || !url) {
    throw new Error(`${origen}: "enlace:" va como "texto | url", y llegó "${linea}"`);
  }
  return { texto, url };
}
