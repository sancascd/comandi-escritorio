// La CashDro (06/11/2026, Servi-Loli): cobrar en el mostrador. Una máquina de
// mentira que contesta como las de verdad (index3.php como Odoo; index.php como
// OCA y Trey).
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/cashdro');
const r = require('../src/reglas');

// Una máquina de mentira: `ruta` la que tiene, y cómo va el cobro en cada pregunta.
function maquina({ ruta = 'index3', usuario = 'comandi', clave = 'secreta', pasos = [], fallaRed = false } = {}) {
  const vistas = [];
  let paso = 0;
  const peticion = async (url) => {
    if (fallaRed) throw new Error('connect ETIMEDOUT');
    const u = new URL(url);
    vistas.push(u);
    if (u.pathname !== c.RUTAS[ruta]) return { status: 404, json: null };
    if (u.searchParams.get('name') !== usuario || u.searchParams.get('password') !== clave) {
      return { status: 200, json: { code: -1, response: { errorMessage: 'Usuario o contraseña incorrectos' } }, huella: 'AA:BB:CC:DD:EE:FF:00:11:22:33' };
    }
    const op = u.searchParams.get('operation');
    const ok = (datos) => (ruta === 'index3' ? { code: 1, response: datos } : { code: 1, data: datos });
    let json;
    if (op === 'askOperationExecuting') json = ok(ruta === 'index3' ? { operation: { OperationId: 0 } } : '0');
    else if (op === 'startOperation') json = ok(ruta === 'index3' ? { operation: { operationId: '777' } } : '777');
    else if (op === 'acknowledgeOperationId') json = ok(ruta === 'index3' ? {} : '');
    else if (op === 'askOperation') {
      const p = pasos[Math.min(paso++, pasos.length - 1)];
      const operation = { operationid: '777', state: p.state, totalin: String(p.totalin), totalout: String(p.totalout) };
      json = ok(ruta === 'index3' ? { operation: { operation } } : JSON.stringify({ operation }));
    } else if (op === 'finishOperation') json = ok(ruta === 'index3' ? {} : '');
    else json = { code: -1, response: { errorMessage: 'Operación desconocida' } };
    return { status: 200, json, huella: 'AA:BB:CC:DD:EE:FF:00:11:22:33' };
  };
  return { peticion, vistas };
}
const CFG = { ip: '192.168.1.50', usuario: 'comandi', clave: 'secreta', protocolo: 'https' };

test('la IP: limpia, sin http ni rutas, y nada raro', () => {
  assert.equal(c.ipValida(' https://192.168.1.50/Cashdro3WS '), '192.168.1.50');
  assert.equal(c.ipValida('192.168.1.50:8443'), '192.168.1.50:8443');
  assert.equal(c.ipValida('192.168.1.50?x=1&y'), '');
  assert.equal(c.ipValida(''), '');
});

test('la dirección lleva la operación, el usuario y la contraseña, bien escapados', () => {
  const u = new URL(c.urlDe({ ip: '192.168.1.50', ruta: 'index3' }, 'startOperation', 'comandi', 'a&b=c', { type: 4 }));
  assert.equal(u.origin + u.pathname, 'https://192.168.1.50/Cashdro3WS/index3.php');
  assert.equal(u.searchParams.get('password'), 'a&b=c');
  assert.equal(u.searchParams.get('type'), '4');
});

test('probar: averigua la conexión nueva o la de antes, y apunta la huella', async () => {
  for (const ruta of ['index3', 'index']) {
    const m = maquina({ ruta });
    const p = await c.probar(m.peticion, CFG);
    assert.equal(p.ok, true, ruta);
    assert.equal(p.ruta, ruta);
    assert.equal(p.huella, 'AA:BB:CC:DD:EE:FF:00:11:22:33');
    assert.ok(m.vistas.every((u) => u.searchParams.get('operation') === 'askOperationExecuting'), 'probar no cobra nada');
  }
});

test('probar: contraseña mala o máquina que no se ve', async () => {
  const mala = await c.probar(maquina().peticion, { ...CFG, clave: 'otra' });
  assert.equal(mala.ok, false);
  assert.match(mala.error, /contraseña/);
  const lejos = await c.probar(maquina({ fallaRed: true }).peticion, CFG);
  assert.equal(lejos.ok, false);
  assert.match(lejos.error, /No se llega/);
  assert.equal((await c.probar(maquina().peticion, { ...CFG, ip: 'x y' })).error, 'La IP no es válida');
});

test('un cobro de 12,50 €: empieza, va metiendo y acaba con el cambio', async () => {
  for (const ruta of ['index3', 'index']) {
    const m = maquina({ ruta, pasos: [
      { state: 'E', totalin: 500, totalout: 0 },
      { state: 'F', totalin: 2000, totalout: 750 },
    ] });
    const cfg = { ...CFG, ruta };
    const e = await c.empezarCobro(m.peticion, cfg, 1250);
    assert.deepEqual(e, { ok: true, operacion: '777', error: null }, ruta);
    const inicio = m.vistas.find((u) => u.searchParams.get('operation') === 'startOperation');
    assert.equal(inicio.searchParams.get('type'), '4', 'una venta');
    assert.deepEqual(JSON.parse(inicio.searchParams.get('parameters')), { amount: '1250' });
    assert.ok(m.vistas.some((u) => u.searchParams.get('operation') === 'acknowledgeOperationId'));
    const a = await c.comoVa(m.peticion, cfg, '777');
    assert.equal(a.terminada, false);
    assert.equal(a.metido, 500);
    const b = await c.comoVa(m.peticion, cfg, '777');
    assert.equal(b.terminada, true);
    assert.equal(b.devuelto, 750);
    assert.equal(c.cobradoEntero(b, 1250), true);
  }
});

test('si el cliente se echa atrás: cancelar (3 en la nueva, 2 en la de antes) y no cuenta como cobrado', async () => {
  for (const [ruta, tipo] of [['index3', '3'], ['index', '2']]) {
    const m = maquina({ ruta, pasos: [{ state: 'F', totalin: 500, totalout: 500 }] });
    const cfg = { ...CFG, ruta };
    assert.equal((await c.cancelar(m.peticion, cfg, '777')).ok, true);
    const fin = m.vistas.find((u) => u.searchParams.get('operation') === 'finishOperation');
    assert.equal(fin.searchParams.get('type'), tipo, ruta);
    assert.equal(c.cobradoEntero(await c.comoVa(m.peticion, cfg, '777'), 1250), false);
  }
});

test('importes que no valen no llegan a la máquina', async () => {
  const m = maquina();
  for (const malo of [0, -5, 'x', 100001]) {
    assert.equal((await c.empezarCobro(m.peticion, CFG, malo)).ok, false);
  }
  assert.equal(m.vistas.length, 0);
});

test('los ajustes: lista solo con IP, usuario, contraseña y probada', () => {
  const base = { ip: '192.168.1.50', usuario: 'comandi', claveCifrada: 'xx' };
  assert.equal(r.cashdroLista({ cashdro: r.cashdroValida(base) }), false, 'sin probar');
  assert.equal(r.cashdroLista({ cashdro: r.cashdroValida({ ...base, huella: 'AA:BB:CC:DD:EE:FF:00:11:22:33' }) }), true);
  assert.equal(r.cashdroLista({ cashdro: r.cashdroValida({ ...base, protocolo: 'http' }) }), true);
  assert.equal(r.cashdroLista({ cashdro: r.cashdroValida({ ...base, claveCifrada: '' , huella: 'AA:BB:CC:DD:EE:FF:00:11:22:33' }) }), false);
  assert.equal(r.ajustesValidos({}).cashdro.ip, '');
});

test('nunca se reinicia para actualizarse a mitad de un cobro', () => {
  assert.equal(r.esMomentoTranquilo({ ahora: 1e9, ultimaImpresion: null, quietoSeg: 999, cobrando: true }), false);
});

// 12/11/2026: soltar dinero (el cambio del repartidor), como las devoluciones de Odoo.
test('soltar 27,60 €: operación tipo 3 con el importe; acaba cuando la máquina lo ha dado', async () => {
  const m = maquina({ pasos: [
    { state: 'E', totalin: 0, totalout: 1000 },
    { state: 'F', totalin: 0, totalout: 2760 },
  ] });
  const e = await c.empezarPago(m.peticion, CFG, 2760);
  assert.deepEqual(e, { ok: true, operacion: '777', error: null });
  const inicio = m.vistas.find((u) => u.searchParams.get('operation') === 'startOperation');
  assert.equal(inicio.searchParams.get('type'), '3', 'un pago (soltar dinero)');
  assert.deepEqual(JSON.parse(inicio.searchParams.get('parameters')), { amount: '2760' });
  const a = await c.comoVa(m.peticion, CFG, '777');
  assert.equal(c.pagadoEntero(a, 2760), false);
  const b = await c.comoVa(m.peticion, CFG, '777');
  assert.equal(c.pagadoEntero(b, 2760), true);
  assert.equal((await c.empezarPago(m.peticion, CFG, 0)).ok, false);
  const M = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(M, /ipcMain\.handle\('comandi:cashdro-pagar'/);
});
