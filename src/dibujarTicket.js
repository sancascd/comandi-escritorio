// DIBUJAR UN TICKET PARA EL MODO DIRECTO (10/11/2026, src/directo.js). Una
// ventana invisible pinta el ticket con los estilos de impresión de comandi.es,
// del ancho que imprime el rollo, y devuelve la imagen en puntos de la
// impresora (576 de ancho en un rollo de 80 mm).

const directo = require('./directo');

const MM_A_CSS = 96 / 25.4;
const ALTO_MAX = 12000; // un ticket de más de un metro y medio es un error

async function conDepurador(wc, fn) {
  const dbg = wc.debugger;
  let enganche = false;
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); enganche = true; }
    return await fn(dbg);
  } finally {
    if (enganche) { try { dbg.detach(); } catch (e) { /* da igual */ } }
  }
}

// Lo que se ve al imprimir en el tablero ahora mismo: los tickets (su HTML) y
// los estilos de la página. Se mira con la página «en modo impresión» un
// instante, igual que al medir el papel.
const GUION_TICKETS = `(() => {
  const tickets = Array.from(document.querySelectorAll('.zona-imprimible .ticket')).filter((t) => t.getClientRects().length > 0);
  const css = [];
  for (const s of Array.from(document.styleSheets)) {
    try { for (const r of Array.from(s.cssRules)) css.push(r.cssText); } catch (e) { /* de otro sitio: fuera */ }
  }
  return { estilos: css.join('\\n'), tickets: tickets.map((t) => t.outerHTML) };
})()`;

async function ticketsDeLaPagina(webContents) {
  return conDepurador(webContents, async (dbg) => {
    await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    try {
      const r = await webContents.executeJavaScript(GUION_TICKETS, true);
      return { estilos: String((r && r.estilos) || ''), tickets: Array.isArray(r && r.tickets) ? r.tickets : [] };
    } finally {
      try { await dbg.sendCommand('Emulation.setEmulatedMedia', { media: '' }); } catch (e) { /* da igual */ }
    }
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Pinta un ticket y da sus puntos: { porFila, alto, datos } (src/directo.js).
async function dibujar(BrowserWindow, { estilos, html, anchoMm, puntos }) {
  const zoom = puntos / (anchoMm * MM_A_CSS);
  const win = new BrowserWindow({
    show: false,
    width: puntos,
    height: 800,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, zoomFactor: zoom, backgroundThrottling: false },
  });
  try {
    const doc = directo.documentoDelTicket({ estilos, html, anchoMm });
    await win.loadURL('data:text/html;base64,' + Buffer.from(doc, 'utf8').toString('base64'));
    win.webContents.setZoomFactor(zoom);
    // Todo «en modo impresión» hasta tener la foto: al soltar el depurador se
    // quita, y la foto saldría con los estilos de pantalla.
    const { img, alto } = await conDepurador(win.webContents, async (dbg) => {
      await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
      // Que estén el logo y las letras antes de pintar (como mucho 3 s).
      const altoCss = await win.webContents.executeJavaScript(`(async () => {
        const imgs = Array.from(document.images).filter((i) => !i.complete);
        await Promise.race([
          Promise.all(imgs.map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }))),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
        try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
        return Math.ceil(document.documentElement.scrollHeight);
      })()`, true);
      const a = Math.min(ALTO_MAX, Math.max(40, Math.ceil(Number(altoCss) * zoom) + 4));
      win.setContentSize(puntos, a);
      await esperar(300);
      return { img: await win.webContents.capturePage({ x: 0, y: 0, width: puntos, height: a }), alto: a };
    });
    const tam = img.getSize();
    if (!tam.width || !tam.height) throw new Error('el ticket ha salido vacío al dibujarlo');
    // Si la pantalla escala (125 %…), la imagen viene más grande: se ajusta al ancho.
    const ajustada = tam.width === puntos ? img : img.resize({ width: puntos, quality: 'best' });
    const t2 = ajustada.getSize();
    return directo.sinBlancoAlFinal(directo.aPuntos(ajustada.toBitmap(), t2.width, t2.height));
  } finally {
    win.destroy();
  }
}

module.exports = { ticketsDeLaPagina, dibujar, GUION_TICKETS };
