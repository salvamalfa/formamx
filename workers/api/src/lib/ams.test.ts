import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeUuid, remapBobinas, type RanuraLeida, type RanuraPrevia } from './ams.ts';

const previa = (
  slot: number,
  material: string | null,
  color_hex: string | null,
  bobina_id: string | null,
  tray_uuid: string | null = null,
): RanuraPrevia => ({ slot, material, color_hex, tray_uuid, bobina_id });

const leida = (
  slot: number,
  material: string | null,
  color_hex: string | null,
  tray_uuid: string | null = null,
): RanuraLeida => ({ slot, material, color_hex, tray_uuid });

const vacia = (slot: number): RanuraLeida => leida(slot, null, null);

test('sin cambios: cada vínculo se queda donde estaba', () => {
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_a'),
    previa(1, 'PLA', '#2F5FD6', 'bob_b'),
    previa(2, null, null, null),
    previa(3, null, null, null),
  ];
  const leidas = [leida(0, 'PLA', '#FFFFFF'), leida(1, 'PLA', '#2F5FD6'), vacia(2), vacia(3)];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), 'bob_a');
  assert.equal(r.get(1), 'bob_b');
  assert.equal(r.get(2), null);
});

test('dos bobinas idénticas quietas conservan su vínculo (no se caen por ambigüedad)', () => {
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_a'),
    previa(1, 'PLA', '#FFFFFF', 'bob_b'),
    previa(2, null, null, null),
    previa(3, null, null, null),
  ];
  const leidas = [leida(0, 'PLA', '#FFFFFF'), leida(1, 'PLA', '#FFFFFF'), vacia(2), vacia(3)];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), 'bob_a');
  assert.equal(r.get(1), 'bob_b');
});

test('firma única: el vínculo sigue a la bobina al cambiarla de ranura', () => {
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_blanca'),
    previa(1, 'PLA', '#2F5FD6', 'bob_azul'),
    previa(2, null, null, null),
    previa(3, null, null, null),
  ];
  // Salva intercambia físicamente las dos bobinas de ranura.
  const leidas = [leida(0, 'PLA', '#2F5FD6'), leida(1, 'PLA', '#FFFFFF'), vacia(2), vacia(3)];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), 'bob_azul');
  assert.equal(r.get(1), 'bob_blanca');
});

test('firma única: se mueve a una ranura que estaba vacía', () => {
  const previas = [previa(0, 'PETG', '#C5202B', 'bob_roja'), previa(3, null, null, null)];
  const leidas = [vacia(0), leida(3, 'PETG', '#C5202B')];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), null);
  assert.equal(r.get(3), 'bob_roja');
});

test('el RFID manda sobre la firma cuando dos bobinas comparten material y tono', () => {
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_a', 'aaaa1111'),
    previa(1, 'PLA', '#FFFFFF', 'bob_b', 'bbbb2222'),
    previa(2, null, null, null),
    previa(3, null, null, null),
  ];
  const leidas = [
    leida(0, 'PLA', '#FFFFFF', 'bbbb2222'),
    leida(1, 'PLA', '#FFFFFF', 'aaaa1111'),
    vacia(2),
    vacia(3),
  ];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), 'bob_b');
  assert.equal(r.get(1), 'bob_a');
});

test('ambiguo sin RFID: se suelta el vínculo en vez de adivinar', () => {
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_a'),
    previa(1, 'PLA', '#FFFFFF', 'bob_b'),
    previa(2, null, null, null),
    previa(3, null, null, null),
  ];
  // Ambas se movieron; sin RFID no hay forma de saber cuál quedó dónde.
  const leidas = [vacia(0), vacia(1), leida(2, 'PLA', '#FFFFFF'), leida(3, 'PLA', '#FFFFFF')];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(2), null);
  assert.equal(r.get(3), null);
});

test('la bobina ya no está en el AMS: se suelta', () => {
  const previas = [previa(0, 'PLA', '#FFFFFF', 'bob_a'), previa(1, null, null, null)];
  const leidas = [leida(0, 'PETG', '#1A1A18'), vacia(1)];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), null);
});

test('cambiar el material de la misma ranura suelta el vínculo', () => {
  const previas = [previa(0, 'PLA', '#FFFFFF', 'bob_a')];
  const leidas = [leida(0, 'PETG', '#FFFFFF')];
  assert.equal(remapBobinas(previas, leidas).get(0), null);
});

test('normalizeUuid descarta lo que no identifica a nadie', () => {
  assert.equal(normalizeUuid('00000000000000000000000000000000'), null);
  assert.equal(normalizeUuid(''), null);
  assert.equal(normalizeUuid('   '), null);
  assert.equal(normalizeUuid(null), null);
  assert.equal(normalizeUuid(42), null);
  assert.equal(normalizeUuid('  AAAA1111  '), 'aaaa1111');
});

test('la primera lectura con RFID no suelta vínculos que no se movieron', () => {
  // Hallazgo de Codex: al actualizar el agente, las ranuras guardadas traen
  // tray_uuid NULL y el reporte ya trae uuid. Con dos bobinas idénticas eso
  // hacía que ninguna pasara por "no cambió" y ambas se soltaran por
  // ambigüedad, sin que nadie las hubiera tocado.
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_a'),
    previa(1, 'PLA', '#FFFFFF', 'bob_b'),
    previa(2, null, null, null),
    previa(3, null, null, null),
  ];
  const leidas = [
    leida(0, 'PLA', '#FFFFFF', 'aaaa1111'),
    leida(1, 'PLA', '#FFFFFF', 'bbbb2222'),
    vacia(2),
    vacia(3),
  ];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(0), 'bob_a');
  assert.equal(r.get(1), 'bob_b');
});

test('perder el RFID (ilegible o agente viejo) tampoco suelta el vínculo', () => {
  const previas = [previa(0, 'PLA', '#FFFFFF', 'bob_a', 'aaaa1111')];
  const leidas = [leida(0, 'PLA', '#FFFFFF', null)];
  assert.equal(remapBobinas(previas, leidas).get(0), 'bob_a');
});

test('dos uuid distintos en la misma ranura SÍ sueltan el vínculo', () => {
  // Misma ranura, mismo material y tono, pero otra bobina física: cambiaron
  // una bobina Bambu por otra igualita. El RFID es lo único que lo delata.
  const previas = [previa(0, 'PLA', '#FFFFFF', 'bob_a', 'aaaa1111')];
  const leidas = [leida(0, 'PLA', '#FFFFFF', 'cccc3333')];
  assert.equal(remapBobinas(previas, leidas).get(0), null);
});

test('un uuid de ceros no empareja nada: cae a la firma', () => {
  const ceros = '00000000000000000000000000000000';
  const previas = [
    previa(0, 'PLA', '#FFFFFF', 'bob_a', normalizeUuid(ceros)),
    previa(1, null, null, null),
  ];
  const leidas = [vacia(0), leida(1, 'PLA', '#FFFFFF', normalizeUuid(ceros))];
  const r = remapBobinas(previas, leidas);
  assert.equal(r.get(1), 'bob_a');
});
