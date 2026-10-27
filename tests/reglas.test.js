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

// El papel a la medida (28/10/2026).
test('el papel: 80 mm y a la medida si no se dice nada', () => {
  const a = r.ajustesValidos(null);
  assert.equal(a.papel, 80);
  assert.equal(a.papelJusto, true);
  assert.equal(r.ajustesValidos({ papel: 58, papelJusto: false }).papel, 58);
  assert.equal(r.ajustesValidos({ papel: 58, papelJusto: false }).papelJusto, false);
  assert.equal(r.ajustesValidos({ papel: 100 }).papel, 80);
});

test('el tamaño del papel de un ticket, en micras', () => {
  // 378 px = 100 mm; + 8 mm de margen y holgura = 108 mm.
  assert.deepEqual(r.tamanoDelPapel(80, 377.95), { width: 80000, height: 108000 });
  assert.deepEqual(r.tamanoDelPapel(58, 10), { width: 58000, height: 30000 }, 'nunca menos de 3 cm');
  assert.equal(r.tamanoDelPapel(80, 1e9).height, 3000000, 'nunca más de 3 m');
  assert.equal(r.tamanoDelPapel(80, 0), null);
  assert.equal(r.tamanoDelPapel(80, 'x'), null);
  assert.equal(r.anchoParaMedir(80), 74);
  assert.equal(r.anchoParaMedir(58), 52);
});
