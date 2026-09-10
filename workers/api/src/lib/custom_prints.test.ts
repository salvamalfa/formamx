import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatoDeNombre, stlKey } from './custom_prints.ts';

test('formatoDeNombre: STL en mayúsculas cuenta', () => {
  assert.equal(formatoDeNombre('A.STL'), 'stl');
});

test('formatoDeNombre: proyecto 3mf', () => {
  assert.equal(formatoDeNombre('x.3mf'), '3mf');
});

test('formatoDeNombre: plato ya rebanado (.gcode.3mf) se rechaza', () => {
  assert.equal(formatoDeNombre('x.gcode.3mf'), null);
});

test('formatoDeNombre: extensión que no es ninguna de las dos', () => {
  assert.equal(formatoDeNombre('x.obj'), null);
});

test('stlKey: conserva el prefijo stl/ para cualquier formato', () => {
  assert.equal(stlKey('cp_x', '3mf'), 'stl/cp_x.3mf');
});

test('stlKey: sin formato explícito sigue siendo .stl (compatibilidad)', () => {
  assert.equal(stlKey('cp_x'), 'stl/cp_x.stl');
});
