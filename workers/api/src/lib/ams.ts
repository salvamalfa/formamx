// Re-mapeo del vínculo ranura↔bobina cuando el AMS cambia de contenido.
//
// El vínculo con el almacén vive en spool_slots.bobina_id, con el número de
// ranura (0-3) como única identidad. Eso funciona hasta que Salva mueve una
// bobina de ranura: el vínculo se queda apuntando a la ranura vieja, nadie lo
// detecta, y a partir de ahí el descuento de gramos cae en la bobina
// equivocada. Aquí se decide, en cada lectura del AMS, a dónde se va cada
// vínculo — o si hay que soltarlo.
//
// La regla de fondo: perder un vínculo cuesta un clic; un vínculo silencioso y
// falso corrompe el inventario. Ante la duda, se suelta.

export interface RanuraPrevia {
  slot: number;
  material: string | null;
  color_hex: string | null;
  tray_uuid: string | null;
  bobina_id: string | null;
}

export interface RanuraLeida {
  slot: number;
  material: string | null;
  color_hex: string | null;
  tray_uuid: string | null;
}

// El AMS reporta el uuid del RFID solo cuando la bobina lo trae (filamento
// Bambu). El filamento genérico manda ceros o nada, y eso no identifica a
// nadie: se trata como ausente para que el re-mapeo caiga a la firma.
export function normalizeUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toLowerCase();
  if (!u || /^[0-]+$/.test(u)) return null;
  return u;
}

// Dos ranuras cargan "lo mismo" si coinciden material y tono. Una ranura sin
// ninguno de los dos está vacía y no identifica nada.
const firma = (r: {
  material: string | null;
  color_hex: string | null;
}): string | null =>
  r.material === null && r.color_hex === null
    ? null
    : `${r.material ?? ""}|${r.color_hex ?? ""}`;

const igual = (a: RanuraPrevia, b: RanuraLeida): boolean =>
  a.material === b.material &&
  a.color_hex === b.color_hex &&
  a.tray_uuid === b.tray_uuid;

/**
 * Devuelve el bobina_id que le toca a cada ranura leída (null = sin vincular).
 * El mapa cubre TODAS las ranuras de `leidas`, así que el llamador puede
 * escribirlo tal cual sin preocuparse por cuáles cambiaron.
 */
export function remapBobinas(
  previas: RanuraPrevia[],
  leidas: RanuraLeida[],
): Map<number, string | null> {
  const destino = new Map<number, string | null>(
    leidas.map((r) => [r.slot, null]),
  );
  const ocupadas = new Set<number>();
  // Solo las ranuras que tenían algo vinculado están en juego.
  const pendientes = previas.filter((p) => p.bobina_id !== null);
  const porSlot = new Map(leidas.map((r) => [r.slot, r]));

  // Paso 0 — la ranura no cambió. Es el caso normal (el agente sincroniza cada
  // ~5 min y casi siempre no pasó nada), y hay que resolverlo ANTES que nada:
  // si dos ranuras cargan bobinas idénticas y quietas, el paso por firma las
  // vería como ambiguas y soltaría dos vínculos buenos sin razón.
  let restantes = pendientes.filter((p) => {
    const leida = porSlot.get(p.slot);
    if (!leida || !igual(p, leida)) return true;
    destino.set(p.slot, p.bobina_id);
    ocupadas.add(p.slot);
    return false;
  });

  // Paso 1 — el RFID. Es la identidad fuerte: si el uuid que tenía la ranura
  // aparece ahora en otra, la bobina se movió y el vínculo se va con ella.
  restantes = restantes.filter((p) => {
    if (!p.tray_uuid) return true;
    const candidatas = leidas.filter(
      (r) => r.tray_uuid === p.tray_uuid && !ocupadas.has(r.slot),
    );
    if (candidatas.length !== 1) return true;
    destino.set(candidatas[0].slot, p.bobina_id);
    ocupadas.add(candidatas[0].slot);
    return false;
  });

  // Paso 2 — la firma (material + tono), para el filamento sin RFID. Solo se
  // sigue cuando NO hay ambigüedad por ningún lado: una sola ranura vieja con
  // esa firma y una sola ranura nueva libre con esa firma. Con dos bobinas
  // idénticas en el AMS no hay forma de saber cuál es cuál, y adivinar sería
  // justo el error que este módulo existe para evitar.
  const cuentaVieja = new Map<string, number>();
  for (const p of restantes) {
    const f = firma(p);
    if (f) cuentaVieja.set(f, (cuentaVieja.get(f) ?? 0) + 1);
  }
  for (const p of restantes) {
    const f = firma(p);
    if (!f || cuentaVieja.get(f) !== 1) continue;
    const candidatas = leidas.filter(
      (r) => !ocupadas.has(r.slot) && firma(r) === f,
    );
    if (candidatas.length !== 1) continue;
    destino.set(candidatas[0].slot, p.bobina_id);
    ocupadas.add(candidatas[0].slot);
  }

  // Lo que no se resolvió queda en null: esa bobina ya no está en el AMS, o
  // está pero no se puede distinguir de otra igual.
  return destino;
}
