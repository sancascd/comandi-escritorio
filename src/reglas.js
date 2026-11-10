// LAS REGLAS DE LA APLICACIÓN DE ESCRITORIO (26/10/2026). Puras, con sus
// pruebas (tests/reglas.test.js). La aplicación no sabe nada de pedidos: abre
// el tablero de comandi.es y le presta lo que un navegador no tiene, sobre
// todo imprimir sin preguntar en la impresora que toque.
//
// Dos maneras de imprimir (las elige el restaurante en «Impresoras»):
//   · 'una'        todos los tickets en una impresora (la de siempre);
//   · 'por_ticket' el ticket de cocina en una y el del cliente en otra
//                  (Sabroso Oriental: cocina y barra en el mismo ordenador).

const MODOS = ['una', 'por_ticket'];
const DESTINOS = ['todo', 'cocina', 'cliente'];
// El ancho del rollo de las impresoras de tickets, en milímetros.
const PAPELES = [80, 58];
// Lo que de verdad imprimen (06/11/2026, Servi-Loli: con la aplicación «se
// cortan palabras»). Un rollo de 80 mm solo se imprime en 72 mm (576 puntos) y
// uno de 58, en 48: si se le manda un papel de 80, lo de la derecha se pierde.
// Chrome lo encogía solo; aquí el papel se manda ya de ese ancho.
const IMPRIMIBLE = { 80: 72, 58: 48 };
function rollo(papelMm) {
  return PAPELES.includes(Number(papelMm)) ? Number(papelMm) : 80;
}

const PORTADA = 'https://comandi.es/pedidos';

function texto(v) {
  return typeof v === 'string' ? v.trim().slice(0, 200) : '';
}

// LA CASHDRO (06/11/2026, src/cashdro.js): dónde está y con qué usuario. La
// contraseña se guarda cifrada con la cuenta de Windows (`claveCifrada`, la
// cifra la aplicación) y nunca se le enseña a nadie. `ruta` y `protocolo`, los
// que contestaron al probar.
function cashdroValida(c) {
  const g = c && typeof c === 'object' ? c : {};
  const ip = texto(g.ip).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return {
    ip: /^[a-z0-9.\-]{1,100}(:\d{1,5})?$/i.test(ip) ? ip : '',
    usuario: texto(g.usuario),
    claveCifrada: typeof g.claveCifrada === 'string' ? g.claveCifrada.slice(0, 4000) : '',
    ruta: g.ruta === 'index' ? 'index' : 'index3',
    protocolo: g.protocolo === 'http' ? 'http' : 'https',
    // La huella del certificado de la máquina, apuntada al probar (src/main.js).
    huella: typeof g.huella === 'string' && /^[0-9A-F:]{20,200}$/i.test(g.huella) ? g.huella : '',
  };
}

// ¿Está lista para cobrar? IP, usuario y contraseña puestos.
function cashdroLista(ajustes) {
  const c = ajustes && ajustes.cashdro;
  // Y probada: por https hace falta la huella de su certificado (se apunta al probar).
  return !!(c && c.ip && c.usuario && c.claveCifrada && (c.huella || c.protocolo === 'http'));
}

// Los ajustes guardados, limpios y con todo lo que falte puesto.
function ajustesValidos(guardados) {
  const g = guardados && typeof guardados === 'object' ? guardados : {};
  const imp = g.impresoras && typeof g.impresoras === 'object' ? g.impresoras : {};
  return {
    modo: MODOS.includes(g.modo) ? g.modo : 'una',
    impresoras: { todo: texto(imp.todo), cocina: texto(imp.cocina), cliente: texto(imp.cliente) },
    // Siempre (26/10/2026, Sandra: «que se abra automáticamente para todos»):
    // así nunca se queda un pedido sin imprimir porque nadie la abrió.
    arrancarConWindows: true,
    // El papel a la medida (28/10/2026): cada ticket en su papel, cortado al
    // acabar. Encendido salvo que se apague; el rollo, de 80 mm si no se dice.
    papel: PAPELES.includes(Number(g.papel)) ? Number(g.papel) : 80,
    papelJusto: g.papelJusto !== false,
    // Modo directo (10/11/2026, src/directo.js): para las impresoras que con el
    // controlador de Windows sacan el papel en blanco. Apagado salvo que se elija.
    directo: g.directo === true,
    cashdro: cashdroValida(g.cashdro),
  };
}

// EL PAPEL A LA MEDIDA (28/10/2026). Se mide al ancho que imprime la
// impresora, el mismo con el que luego se imprime (sin márgenes de página:
// los pone la aplicación, 1,5 mm a cada lado; ver src/papel.js).
const PX_POR_MM = 96 / 25.4;
const MARGEN_MM = 8;      // holgura al final, para no partir nunca un ticket
const ALTO_MIN_MM = 30;
const ALTO_MAX_MM = 3000; // tres metros: más que eso es un error

function anchoParaMedir(papelMm) {
  return IMPRIMIBLE[rollo(papelMm)];
}

// El tamaño del papel para un ticket de `altoPx` píxeles: { width, height } en
// micras, como lo pide Electron. null si el alto no vale.
function tamanoDelPapel(papelMm, altoPx) {
  const alto = Number(altoPx);
  if (!isFinite(alto) || alto <= 0) return null;
  const mm = Math.min(ALTO_MAX_MM, Math.max(ALTO_MIN_MM, Math.ceil(alto / PX_POR_MM + MARGEN_MM)));
  return { width: IMPRIMIBLE[rollo(papelMm)] * 1000, height: mm * 1000 };
}

// Las tandas de una impresión: en qué «puestos» pinta el tablero los tickets
// y a qué impresora va cada tanda. Con una sola, todo de una vez.
function tandas(ajustes) {
  const a = ajustesValidos(ajustes);
  if (a.modo === 'por_ticket') return ['cocina', 'cliente'];
  return ['todo'];
}

// La impresora de una tanda. '' = la predeterminada de Windows.
function impresoraPara(ajustes, destino) {
  const a = ajustesValidos(ajustes);
  if (!DESTINOS.includes(destino)) return null;
  if (a.modo === 'una') return a.impresoras.todo;
  if (destino === 'todo') return null; // con dos impresoras no hay «todo»
  return a.impresoras[destino];
}

// ¿Está todo elegido? Con dos impresoras, las dos tienen que estar puestas.
function faltaPorElegir(ajustes) {
  const a = ajustesValidos(ajustes);
  if (a.modo === 'por_ticket') {
    return ['cocina', 'cliente'].filter((d) => !a.impresoras[d]);
  }
  return [];
}

// Solo se abre comandi.es dentro de la aplicación; lo demás, en el navegador.
function esDeComandi(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'comandi.es' || u.hostname === 'www.comandi.es');
  } catch (e) {
    return false;
  }
}

// El título de la ventana con los pedidos sin atender, para verlo en la barra.
function tituloCon(pendientes) {
  const n = Math.max(0, Math.round(Number(pendientes) || 0));
  return n > 0 ? '(' + n + ') Comandi' : 'Comandi';
}

// Una versión nueva ya bajada se instala de madrugada (de 4:00 a 4:59, hora
// del ordenador): ningún restaurante está sirviendo a esa hora.
function esHoraDeActualizar(fecha) {
  return fecha instanceof Date && fecha.getHours() === 4;
}

// UN MOMENTO TRANQUILO (06/11/2026, Sandra: esperar a la madrugada «es un
// atraso; cuando necesitan arreglar algo urgente es un coñazo»). Una versión
// ya bajada se instala en cuanto la cocina está tranquila: nadie ha tocado el
// ordenador en 5 minutos (así no se pierde un pedido a medio apuntar) y no se
// ha impreso nada en 10. Los pedidos sin atender no cuentan: siguen en el
// tablero al volver (y en Servi-Loli se quedan sin marcar todo el día). Se
// reinicia en unos segundos y el tablero recupera lo que entrara mientras.
// `ultimaImpresion` en milisegundos (null si no ha impreso desde que se abrió);
// `quietoSeg`, los segundos sin tocar teclado ni ratón.
const TRANQUILO_MS = 10 * 60 * 1000;
const QUIETO_SEG = 5 * 60;
function esMomentoTranquilo({ ahora, ultimaImpresion, quietoSeg, cobrando }) {
  if (cobrando) return false; // nunca a mitad de un cobro en la CashDro
  if (!(Number(quietoSeg) >= QUIETO_SEG)) return false;
  if (ultimaImpresion == null) return true;
  return Number(ahora) - Number(ultimaImpresion) >= TRANQUILO_MS;
}

// NUNCA SE QUEDA ESPERANDO (09/11/2026, Servi-Loli y Lin Lin: «ya no imprime
// automáticamente»). Si la impresora se cuelga (sin papel, apagada, el driver
// atascado), Windows a veces no contesta nunca, y el tablero se quedaba
// esperando ese ticket: no salía ninguno más hasta recargar. Ahora, pasado
// `ms`, se da por fallido con `siNo`.
function conTiempoMaximo(promesa, ms, siNo) {
  let reloj = null;
  const tope = new Promise((resolve) => { reloj = setTimeout(() => resolve(siNo), ms); });
  return Promise.race([Promise.resolve(promesa), tope]).finally(() => clearTimeout(reloj));
}
const TIEMPO_MAX_IMPRESION_MS = 60 * 1000;

// EL REGISTRO DE IMPRESIONES (09/11/2026): cada impresión, con su hora y lo
// que contestó la impresora, en `impresiones.log` (carpeta de la aplicación).
// Para saber qué pasó cuando dicen «no ha salido». Solo las últimas líneas.
const MAX_LINEAS_REGISTRO = 1000;
function lineaDeRegistro(fecha, version, que, r) {
  const f = fecha instanceof Date ? fecha : new Date();
  const dos = (n) => String(n).padStart(2, '0');
  const hora = f.getFullYear() + '-' + dos(f.getMonth() + 1) + '-' + dos(f.getDate()) + ' '
    + dos(f.getHours()) + ':' + dos(f.getMinutes()) + ':' + dos(f.getSeconds());
  const estado = r && r.ok ? 'OK' : 'FALLO ' + String((r && r.error) || '').replace(/\s+/g, ' ').slice(0, 200);
  return hora + ' v' + String(version || '?') + ' ' + String(que || '').replace(/\s+/g, ' ').slice(0, 120) + ' -> ' + estado;
}
function recortarRegistro(texto, max = MAX_LINEAS_REGISTRO) {
  const lineas = String(texto || '').split('\n').filter(Boolean);
  return lineas.slice(-max).join('\n') + (lineas.length ? '\n' : '');
}

// La orden para cmd.exe que abre la aplicación pasados `segundos` (src/main.js,
// volverAAbrirseLuego). `ping` hace de reloj: `timeout` no va sin consola.
// null si la ruta no es un .exe de verdad (nada raro pasa por aquí).
function ordenVolverAAbrir(exe, segundos) {
  const ruta = String(exe || '');
  if (!/^[a-z]:\\[^"<>|&^%]+\.exe$/i.test(ruta)) return null;
  const s = Math.max(5, Math.min(600, Math.round(Number(segundos) || 60)));
  return ['/d', '/c', '"ping -n ' + (s + 1) + ' 127.0.0.1 >nul & start "" "' + ruta + '""'];
}

// SIN VENTANA NEGRA (10/11/2026, a Sandra le salió la ventana del «ping» al
// actualizarse: la Terminal de Windows 11 no hace caso a «ábrela oculta»). El
// reloj de «volver a abrirse» va ahora en un guion de Windows (wscript), que no
// abre ninguna ventana: espera y abre la aplicación. El de cmd queda de
// reserva, por si wscript no está. null si la ruta no es un .exe de verdad.
function guionVolverAAbrir(exe, segundos) {
  const ruta = String(exe || '');
  if (!/^[a-z]:\\[^"<>|&^%]+\.exe$/i.test(ruta)) return null;
  const s = Math.max(5, Math.min(600, Math.round(Number(segundos) || 60)));
  return 'WScript.Sleep ' + (s * 1000) + '\r\n'
    + 'CreateObject("WScript.Shell").Run """' + ruta + '""", 1, False\r\n';
}

// SI AL ENCENDER EL ORDENADOR AÚN NO HAY INTERNET (09/11/2026, Servi-Loli: el
// sábado 08/11 no salió ningún ticket solo de 8:56 a 10:19). La aplicación se
// abre sola al encender, a veces antes de que haya red; la página no cargaba y
// la ventana se quedaba en blanco o con el error, sin volver a intentarlo
// nunca. Ahora, si la que falla es la página principal, se enseña «Conectando
// con Comandi» y se reintenta cada 10 segundos hasta que entra. -3 es «se ha
// cancelado» (porque se ha ido a otra página): eso no es un fallo.
const REINTENTO_MS = 10 * 1000;
function hayQueReintentar(codigo, esPrincipal) {
  const c = Number(codigo);
  return !!esPrincipal && isFinite(c) && c < 0 && c !== -3;
}
function paginaSinConexion(motivo) {
  const m = String(motivo || '').replace(/[<>&"]/g, '').slice(0, 120);
  return '<!doctype html><html lang="es"><meta charset="utf-8"><title>Comandi</title>'
    + '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;'
    + 'font-family:Segoe UI,system-ui,sans-serif;background:#f6f7f6;color:#1f2a24">'
    + '<div style="text-align:center;max-width:32rem;padding:2rem">'
    + '<p style="font-size:2rem;font-weight:700;margin:0 0 .5rem">Conectando con Comandi…</p>'
    + '<p style="font-size:1.15rem;margin:0 0 1rem">Todavía no hay internet en este ordenador. '
    + 'Se vuelve a intentar sola cada 10 segundos: no hace falta tocar nada.</p>'
    + '<p style="font-size:.85rem;color:#6b756f;margin:0">Si en unos minutos sigue igual, mira el wifi o el router.'
    + (m ? ' (' + m + ')' : '') + '</p></div></body></html>';
}

// UN TABLERO COLGADO (09/11/2026): si la página deja de responder tanto rato,
// se vuelve a abrir. Sin tablero no hay tickets.
const COLGADO_MS = 60 * 1000;

module.exports = { guionVolverAAbrir, REINTENTO_MS, hayQueReintentar, paginaSinConexion, COLGADO_MS, ordenVolverAAbrir, conTiempoMaximo, TIEMPO_MAX_IMPRESION_MS, lineaDeRegistro, recortarRegistro, MODOS, DESTINOS, PAPELES, IMPRIMIBLE, PORTADA, ajustesValidos, anchoParaMedir, tamanoDelPapel, tandas, impresoraPara, faltaPorElegir, esDeComandi, tituloCon, esHoraDeActualizar, esMomentoTranquilo, cashdroValida, cashdroLista };
