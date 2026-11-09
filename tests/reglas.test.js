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

// 06/11/2026: en cuanto la cocina está tranquila, no hace falta esperar a las 4.
test('un momento tranquilo para actualizarse', () => {
  const ahora = 1_000_000_000;
  assert.equal(r.esMomentoTranquilo({ ahora, ultimaImpresion: null, quietoSeg: 400 }), true);
  assert.equal(r.esMomentoTranquilo({ ahora, ultimaImpresion: ahora - 11 * 60000, quietoSeg: 400 }), true);
  assert.equal(r.esMomentoTranquilo({ ahora, ultimaImpresion: ahora - 3 * 60000, quietoSeg: 400 }), false, 'acaba de imprimir');
  assert.equal(r.esMomentoTranquilo({ ahora, ultimaImpresion: null, quietoSeg: 30 }), false, 'alguien está usando el ordenador');
  assert.equal(r.esMomentoTranquilo({ ahora, ultimaImpresion: null }), false, 'sin saberlo, no');
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
  // 378 px = 100 mm; + 8 mm de holgura = 108 mm. El ancho, el que imprime la impresora (06/11/2026).
  assert.deepEqual(r.tamanoDelPapel(80, 377.95), { width: 72000, height: 108000 });
  assert.deepEqual(r.tamanoDelPapel(58, 10), { width: 48000, height: 30000 }, 'nunca menos de 3 cm');
  assert.equal(r.tamanoDelPapel(80, 1e9).height, 3000000, 'nunca más de 3 m');
  assert.equal(r.tamanoDelPapel(80, 0), null);
  assert.equal(r.tamanoDelPapel(80, 'x'), null);
  assert.equal(r.anchoParaMedir(80), 72);
  assert.equal(r.anchoParaMedir(58), 48);
});

// 09/11/2026: una impresora colgada no puede dejar el tablero esperando.
test('conTiempoMaximo: si no contesta, se da por fallido', async () => {
  const nunca = new Promise(() => {});
  assert.deepEqual(await r.conTiempoMaximo(nunca, 20, { ok: false, error: 'La impresora no contesta' }),
    { ok: false, error: 'La impresora no contesta' });
  assert.deepEqual(await r.conTiempoMaximo(Promise.resolve({ ok: true }), 1000, null), { ok: true });
  assert.equal(r.TIEMPO_MAX_IMPRESION_MS, 60000);
});

test('el registro de impresiones: una línea por impresión y solo las últimas', () => {
  const f = new Date(2026, 10, 9, 13, 5, 7);
  assert.equal(r.lineaDeRegistro(f, '0.4.1', '#1A2B en POS-80', { ok: true }), '2026-11-09 13:05:07 v0.4.1 #1A2B en POS-80 -> OK');
  assert.equal(r.lineaDeRegistro(f, '0.4.1', 'hoja', { ok: false, error: 'La impresora\nno contesta' }),
    '2026-11-09 13:05:07 v0.4.1 hoja -> FALLO La impresora no contesta');
  const largo = Array.from({ length: 1005 }, (_, i) => 'l' + i).join('\n');
  const recortado = r.recortarRegistro(largo);
  assert.equal(recortado.split('\n').filter(Boolean).length, 1000);
  assert.ok(recortado.startsWith('l5\n') && recortado.endsWith('l1004\n'));
  assert.equal(r.recortarRegistro(''), '');
});

test('main.js: imprimir con tiempo máximo, registro y versión', () => {
  const M = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(M, /reglas\.conTiempoMaximo\(trabajo, reglas\.TIEMPO_MAX_IMPRESION_MS/);
  assert.match(M, /registrar\(rotulo, r\)/);
  assert.match(M, /ipcMain\.handle\('comandi:version'/);
  assert.match(M, /app\.setAppUserModelId\('es\.comandi\.escritorio'\)/);
  const P = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(P, /versionApp: \(\) => ipcRenderer\.invoke\('comandi:version'\)/);
});

// 09/11/2026: al reiniciarse para actualizarse, se vuelve a abrir sí o sí.
test('ordenVolverAAbrir: espera y abre la aplicación; nada raro pasa', () => {
  const exe = String.raw`C:\Users\x\AppData\Local\Programs\comandi-escritorio\Comandi.exe`;
  assert.deepEqual(r.ordenVolverAAbrir(exe, 60),
    ['/d', '/c', '"ping -n 61 127.0.0.1 >nul & start "" "' + exe + '""']);
  assert.equal(r.ordenVolverAAbrir(String.raw`C:\a\b.exe" & del x`, 60), null);
  assert.equal(r.ordenVolverAAbrir('/usr/bin/electron', 60), null);
  assert.equal(r.ordenVolverAAbrir('', 60), null);
  assert.equal(r.ordenVolverAAbrir(exe, 1)[2].startsWith('"ping -n 6 '), true, 'como poco 5 s');
  const M = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(M, /volverAAbrirseLuego\(\);\s*autoUpdater\.quitAndInstall\(true, true\);/);
});

// 09/11/2026: sin internet al encender, se reintenta hasta que entra.
test('hayQueReintentar: solo la página principal y no al cancelar', () => {
  assert.equal(r.hayQueReintentar(-105, true), true, 'ERR_NAME_NOT_RESOLVED');
  assert.equal(r.hayQueReintentar(-106, true), true, 'ERR_INTERNET_DISCONNECTED');
  assert.equal(r.hayQueReintentar(-3, true), false, 'ERR_ABORTED: se fue a otra página');
  assert.equal(r.hayQueReintentar(-105, false), false, 'un trozo de la página, no la página');
  assert.equal(r.hayQueReintentar(0, true), false);
  assert.equal(r.REINTENTO_MS, 10000);
  const h = r.paginaSinConexion('ERR_<b>');
  assert.match(h, /Conectando con Comandi/);
  assert.ok(!h.includes('<b>'), 'el motivo va sin etiquetas');
  const M = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(M, /ventana\.webContents\.on\('did-fail-load'/);
  assert.match(M, /reintentoTablero = setTimeout\(abrirTablero, reglas\.REINTENTO_MS\)/);
  assert.match(M, /ventana\.webContents\.on\('render-process-gone'/);
  assert.match(M, /registrar\('tablero abierto'/);
});
