// LA CASHDRO (06/11/2026, Servi-Loli: «quieren cobrar localmente»). La CashDro
// es la máquina que cobra el efectivo y da el cambio (la suya es una CashDro 3,
// de Softsanz Informática). Se le habla por su web, dentro de la red del local:
//   https://<IP>/Cashdro3WS/index3.php?operation=…&name=<usuario>&password=<clave>
// (las de antes, `index.php`; aquí se prueban las dos y se queda la que conteste).
//
// Un cobro: startOperation (type 4 = venta, con el importe en céntimos) → la
// máquina da un número de operación → acknowledgeOperationId → askOperation
// hasta que su estado es «F» (terminada), con lo metido (`totalin`) y lo
// devuelto (`totalout`, el cambio), en céntimos. Para echarse atrás,
// finishOperation (cancela y la máquina devuelve lo metido). Así lo hacen el
// módulo de Odoo (pos_cashdro, index3.php) y los de OCA y Trey (index.php).
//
// Solo desde la aplicación (el proceso principal): la máquina tiene su propio
// certificado, que un navegador no acepta. La contraseña nunca sale de este
// ordenador. Lo de aquí es PURO salvo `peticion`, que se le pasa hecho.

const RUTAS = {
  index3: '/Cashdro3WS/index3.php',
  index: '/Cashdro3WS/index.php',
};
const VENTA = 4;
// SOLTAR DINERO (12/11/2026, Servi-Loli: «el cambio del repartidor lo debe
// soltar la CashDro»). Es la operación que Odoo usa para las devoluciones
// (REFUND_TRANSACTION_TYPE = 3 en addons/pos_cashdro/static/src/cashdro_service.js):
// startOperation con type 3 y el importe en céntimos; la máquina lo da.
const PAGO = 3;
// Para cancelar: 3 en index3.php (Odoo) y 2 en index.php (OCA, Trey).
const CANCELAR = { index3: 3, index: 2 };
const MAX_CENTIMOS = 100000; // 1.000 €: más que eso en un mostrador es un error

// La IP (o el nombre) de la máquina, limpia; '' si no vale.
function ipValida(ip) {
  const t = String(ip == null ? '' : ip).trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /^[a-z0-9.\-]{1,100}(:\d{1,5})?$/i.test(t) ? t : '';
}

// La dirección de una operación.
function urlDe({ ip, ruta, protocolo }, operacion, usuario, clave, params) {
  const q = new URLSearchParams({ operation: operacion, name: usuario || '', password: clave || '' });
  for (const [k, v] of Object.entries(params || {})) q.set(k, String(v));
  return (protocolo || 'https') + '://' + ipValida(ip) + (RUTAS[ruta] || RUTAS.index3) + '?' + q.toString();
}

// Lo que contesta la máquina, igual venga de index3.php ({ code, response }) o
// de index.php ({ code, data }). { ok, datos, error }.
function leerRespuesta(json) {
  if (!json || typeof json !== 'object') return { ok: false, datos: null, error: 'La máquina no ha contestado bien' };
  if (Number(json.code) !== 1) {
    const r = json.response || {};
    const msg = r.errorMessage || json.errorMessage || (typeof json.data === 'string' ? json.data : '') || 'Error ' + json.code;
    return { ok: false, datos: null, error: String(msg) };
  }
  return { ok: true, datos: json.response !== undefined ? json.response : json.data, error: null };
}

// El número de operación que da startOperation.
function idDeOperacion(datos) {
  if (datos && typeof datos === 'object') {
    const op = datos.operation || {};
    const id = op.operationId || op.operationid || op.OperationId || datos.operationId;
    return id ? String(id) : '';
  }
  return datos != null && String(datos).trim() !== '' ? String(datos).trim() : '';
}

// Cómo va una operación (askOperation): { terminada, estado, metido, devuelto }
// en céntimos. En index.php los datos vienen como texto con JSON dentro.
function estadoDeOperacion(datos) {
  let d = datos;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  let op = d && d.operation;
  if (op && op.operation) op = op.operation; // index3.php: response.operation.operation
  if (!op) return null;
  const n = (v) => { const x = parseInt(v, 10); return isFinite(x) && x > 0 ? x : 0; };
  const estado = String(op.state || '');
  return { terminada: estado === 'F', estado, metido: n(op.totalin), devuelto: n(op.totalout) };
}

// PURA. ¿Se ha cobrado entero? Lo que se queda la máquina (metido menos el
// cambio) cubre el importe.
function cobradoEntero(estado, centimos) {
  return !!estado && estado.terminada && estado.metido - estado.devuelto >= centimos;
}

function centimosValidos(c) {
  const n = Math.round(Number(c));
  return isFinite(n) && n > 0 && n <= MAX_CENTIMOS ? n : 0;
}

// ---------- Hablar con la máquina ----------
// `peticion(url)` → { status, json } (o lanza si no llega). `cfg` = { ip,
// usuario, clave, ruta, protocolo }.
async function operar(peticion, cfg, operacion, params) {
  const { status, json, huella } = await peticion(urlDe(cfg, operacion, cfg.usuario, cfg.clave, params));
  if (status === 404) return { ok: false, datos: null, error: 'Esta máquina no tiene esa conexión', noExiste: true };
  if (status !== 200) return { ok: false, datos: null, error: 'La máquina contesta con un error (' + status + ')' };
  return { ...leerRespuesta(json), huella: huella || '' };
}

// Qué conexión tiene la máquina: la nueva (index3.php) o la de antes. Devuelve
// { ok, ruta, protocolo, huella, error } (`huella`: la del certificado, para
// no hablar luego con otra). Pregunta si hay una operación en marcha: no
// cobra ni toca nada.
async function probar(peticion, cfg) {
  if (!ipValida(cfg.ip)) return { ok: false, error: 'La IP no es válida' };
  let ultimo = 'No contesta';
  for (const protocolo of ['https', 'http']) {
    for (const ruta of ['index3', 'index']) {
      let r;
      try { r = await operar(peticion, { ...cfg, ruta, protocolo }, 'askOperationExecuting'); }
      catch (e) { ultimo = 'No se llega a la máquina (' + (e && e.message ? e.message : 'sin respuesta') + ')'; break; }
      if (r.noExiste) continue;
      if (r.ok) return { ok: true, ruta, protocolo, huella: r.huella, error: null };
      // Contesta pero no le gusta: si es el usuario o la contraseña, no vale;
      // si es otra cosa (una máquina que no conoce esa pregunta), ya se llega.
      if (/usuari|user|contrase|password|login|auth|credencial|permis/i.test(r.error || '')) {
        return { ok: false, ruta, protocolo, error: r.error };
      }
      return { ok: true, ruta, protocolo, huella: r.huella, error: null, aviso: r.error };
    }
  }
  return { ok: false, error: ultimo };
}

// Empieza un cobro: { ok, operacion, error }.
async function empezarCobro(peticion, cfg, centimos) {
  const c = centimosValidos(centimos);
  if (!c) return { ok: false, error: 'Importe no válido' };
  const r = await operar(peticion, cfg, 'startOperation', {
    type: VENTA, posid: 'comandi', posuser: cfg.usuario, parameters: JSON.stringify({ amount: String(c) }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  const id = idDeOperacion(r.datos);
  if (!id) return { ok: false, error: 'La máquina no ha dado número de operación' };
  const a = await operar(peticion, cfg, 'acknowledgeOperationId', { operationId: id });
  if (!a.ok) return { ok: false, error: a.error };
  return { ok: true, operacion: id, error: null };
}

// Empieza a soltar dinero (el cambio de un repartidor): { ok, operacion, error }.
async function empezarPago(peticion, cfg, centimos) {
  const c = centimosValidos(centimos);
  if (!c) return { ok: false, error: 'Importe no válido' };
  const r = await operar(peticion, cfg, 'startOperation', {
    type: PAGO, posid: 'comandi', posuser: cfg.usuario, parameters: JSON.stringify({ amount: String(c) }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  const id = idDeOperacion(r.datos);
  if (!id) return { ok: false, error: 'La máquina no ha dado número de operación' };
  const a = await operar(peticion, cfg, 'acknowledgeOperationId', { operationId: id });
  if (!a.ok) return { ok: false, error: a.error };
  return { ok: true, operacion: id, error: null };
}

// PURA. ¿Ha soltado ya todo? Lo que ha dado la máquina cubre el importe.
function pagadoEntero(estado, centimos) {
  return !!estado && estado.terminada && estado.devuelto >= centimos;
}

// Cómo va: { ok, terminada, estado, metido, devuelto, error }.
async function comoVa(peticion, cfg, operacion) {
  const r = await operar(peticion, cfg, 'askOperation', { operationId: operacion });
  if (!r.ok) return { ok: false, error: r.error };
  const e = estadoDeOperacion(r.datos);
  if (!e) return { ok: false, error: 'La máquina no dice cómo va el cobro' };
  return { ok: true, ...e, error: null };
}

// Se echa atrás: la máquina devuelve lo metido.
async function cancelar(peticion, cfg, operacion) {
  const r = await operar(peticion, cfg, 'finishOperation', { operationId: operacion, type: CANCELAR[cfg.ruta] || 3 });
  return { ok: r.ok, error: r.error };
}

module.exports = {
  RUTAS, VENTA, PAGO, CANCELAR, MAX_CENTIMOS,
  ipValida, urlDe, leerRespuesta, idDeOperacion, estadoDeOperacion, cobradoEntero, pagadoEntero, centimosValidos,
  operar, probar, empezarCobro, empezarPago, comoVa, cancelar,
};
