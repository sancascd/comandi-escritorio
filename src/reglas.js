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
  };
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

module.exports = { MODOS, DESTINOS, PORTADA, ajustesValidos, tandas, impresoraPara, faltaPorElegir, esDeComandi, tituloCon, esHoraDeActualizar };
