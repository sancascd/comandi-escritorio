// EL PAPEL A LA MEDIDA (28/10/2026, Servi-Loli: la hoja de cocina «sale muy
// larga y en blanco»). Sin decirle nada, la impresora usa el papel que tenga
// puesto en Windows (a veces 80 × 297 mm, o más) y corta al final de ESE papel.
// Ahora la aplicación mide cada ticket tal como se imprime y lo manda solo, con
// el largo justo: cada ticket sale en su papel y se corta al acabar, sin tocar
// nada en la impresora.
//
// Cómo: con el tablero «en modo impresión» un instante (lo que se ve al
// imprimir: solo los tickets) se mide cada ticket; luego se imprime uno a uno,
// escondiendo los demás. Si algo falla, se imprime como siempre.

const reglas = require('./reglas');

// Mide los tickets que salen ahora al imprimir y los numera. Devuelve sus
// altos en píxeles (vacío si no hay ninguno). Se ejecuta en la página, ya «en
// modo impresión»: la página se pone del ancho del papel y, ticket a ticket,
// se deja solo ese y se mira hasta dónde llega desde arriba del todo (así
// cuentan también el margen de la página y el del título).
function guionMedir(anchoMm) {
  const ancho = Number(anchoMm) > 0 ? Number(anchoMm) : 74;
  return `(() => {
    document.querySelectorAll('[data-comandi-trozo]').forEach((t) => t.removeAttribute('data-comandi-trozo'));
    const tickets = Array.from(document.querySelectorAll('.zona-imprimible .ticket'))
      .filter((t) => t.getClientRects().length > 0);
    if (!tickets.length) return [];
    tickets.forEach((t, i) => t.setAttribute('data-comandi-trozo', String(i)));
    const ancho = document.createElement('style');
    ancho.textContent = 'html { width: ${ancho}mm !important; max-width: ${ancho}mm !important; }';
    document.head.appendChild(ancho);
    const solo = document.createElement('style');
    document.head.appendChild(solo);
    const finBody = parseFloat(getComputedStyle(document.body).marginBottom) || 0;
    const altos = tickets.map((t, i) => {
      solo.textContent = '[data-comandi-trozo]:not([data-comandi-trozo="' + i + '"]) { display: none !important; } '
        + '[data-comandi-trozo] { break-before: auto !important; page-break-before: auto !important; }';
      const arriba = document.documentElement.getBoundingClientRect().top;
      return t.getBoundingClientRect().bottom - arriba + finBody;
    });
    solo.remove();
    ancho.remove();
    return altos;
  })()`;
}

// Al imprimir, solo el ticket «i» (y sin saltos de página: va solo).
function guionSolo(i) {
  const n = Math.max(0, Math.round(Number(i) || 0));
  return `(() => {
    let st = document.getElementById('comandi-solo');
    if (!st) { st = document.createElement('style'); st.id = 'comandi-solo'; document.head.appendChild(st); }
    st.textContent = '@media print { [data-comandi-trozo]:not([data-comandi-trozo="${n}"]) { display: none !important; } '
      + '[data-comandi-trozo] { break-before: auto !important; page-break-before: auto !important; '
      + 'break-after: auto !important; page-break-after: auto !important; } }';
    return true;
  })()`;
}

const GUION_LIMPIAR = `(() => {
  const st = document.getElementById('comandi-solo');
  if (st) st.remove();
  document.querySelectorAll('[data-comandi-trozo]').forEach((t) => t.removeAttribute('data-comandi-trozo'));
  return true;
})()`;

// Pone la página «en modo impresión» un instante y mide los tickets.
async function medirTickets(webContents, anchoMm) {
  const dbg = webContents.debugger;
  let enganche = false;
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); enganche = true; }
    await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    const altos = await webContents.executeJavaScript(guionMedir(anchoMm), true);
    return Array.isArray(altos) ? altos : [];
  } finally {
    try { await dbg.sendCommand('Emulation.setEmulatedMedia', { media: '' }); } catch (e) { /* da igual */ }
    if (enganche) { try { dbg.detach(); } catch (e) { /* da igual */ } }
  }
}

// Imprime cada ticket en su papel. `imprimir(pageSize)` es la impresión de
// siempre con ese tamaño (null = el de la impresora): { ok, error }.
async function imprimirALaMedida(webContents, papelMm, imprimir) {
  const limpiar = () => webContents.executeJavaScript(GUION_LIMPIAR, true).catch(() => {});
  let altos = [];
  try { altos = await medirTickets(webContents, reglas.anchoParaMedir(papelMm)); } catch (e) { altos = []; }
  const tamanos = altos.map((a) => reglas.tamanoDelPapel(papelMm, a));
  if (tamanos.length === 0 || tamanos.some((t) => !t)) {
    await limpiar();
    return imprimir(null);
  }
  try {
    for (let i = 0; i < tamanos.length; i++) {
      await webContents.executeJavaScript(guionSolo(i), true);
      const r = await imprimir(tamanos[i]);
      if (!r.ok) {
        // Si ni el primero sale a la medida, como siempre (todo de una vez).
        if (i === 0) { await limpiar(); return imprimir(null); }
        return r;
      }
    }
    return { ok: true, error: null };
  } finally {
    await limpiar();
  }
}

module.exports = { guionMedir, guionSolo, GUION_LIMPIAR, medirTickets, imprimirALaMedida };
