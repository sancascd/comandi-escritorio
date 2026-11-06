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
function esMomentoTranquilo({ ahora, ultimaImpresion, quietoSeg }) {
  if (!(Number(quietoSeg) >= QUIETO_SEG)) return false;
  if (ultimaImpresion == null) return true;
  return Number(ahora) - Number(ultimaImpresion) >= TRANQUILO_MS;
}

module.exports = { MODOS, DESTINOS, PAPELES, IMPRIMIBLE, PORTADA, ajustesValidos, anchoParaMedir, tamanoDelPapel, tandas, impresoraPara, faltaPorElegir, esDeComandi, tituloCon, esHoraDeActualizar, esMomentoTranquilo };
