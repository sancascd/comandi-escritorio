const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/reglas');

test('sin ajustes: una impresora (la predeterminada) y arrancar con Windows', () => {
  const a = r.ajustesValidos(null);
  assert.equal(a.modo, 'una');
  assert.deepEqual(a.impresoras, { todo: '', cocina: '', cliente: '' });
  assert.equal(a.arrancarConWindows, true);
  assert.deepEqual(r.tandas(a), ['todo']);
  assert.equal(r.impresoraPara(a, 'todo'), '');
  assert.deepEqual(r.faltaPorElegir(a), []);
});

test('una para cocina y otra para el cliente (Sabroso)', () => {
  const a = { modo: 'por_ticket', impresoras: { cocina: 'EPSON Cocina', cliente: 'EPSON Barra' } };
  assert.deepEqual(r.tandas(a), ['cocina', 'cliente']);
  assert.equal(r.impresoraPara(a, 'cocina'), 'EPSON Cocina');
  assert.equal(r.impresoraPara(a, 'cliente'), 'EPSON Barra');
  assert.equal(r.impresoraPara(a, 'todo'), null);
  assert.deepEqual(r.faltaPorElegir({ modo: 'por_ticket', impresoras: { cocina: 'X' } }), ['cliente']);
});

test('se abre sola al encender, siempre', () => {
  assert.equal(r.ajustesValidos({ arrancarConWindows: false }).arrancarConWindows, true);
});

test('nada raro: modos y destinos desconocidos', () => {
  assert.equal(r.ajustesValidos({ modo: 'tres' }).modo, 'una');
  assert.equal(r.impresoraPara({}, 'cajon'), null);
});

test('solo comandi.es se abre dentro', () => {
  assert.ok(r.esDeComandi('https://comandi.es/pedidos'));
  assert.ok(r.esDeComandi('https://www.comandi.es/login'));
  assert.ok(!r.esDeComandi('http://comandi.es/pedidos'));
  assert.ok(!r.esDeComandi('https://comandi.es.malo.com/'));
  assert.ok(!r.esDeComandi('https://wa.me/34600000000'));
  assert.ok(!r.esDeComandi('no es una dirección'));
});

test('el título lleva los pedidos sin atender', () => {
  assert.equal(r.tituloCon(0), 'Comandi');
  assert.equal(r.tituloCon(3), '(3) Comandi');
});

test('se actualiza de madrugada, a las 4', () => {
  assert.equal(r.esHoraDeActualizar(new Date(2026, 9, 27, 4, 30)), true);
  assert.equal(r.esHoraDeActualizar(new Date(2026, 9, 27, 14, 0)), false);
});
