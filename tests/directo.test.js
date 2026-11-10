// Modo directo (10/11/2026, Lin Lin: el papel salía en blanco).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const d = require('../src/directo');
const r = require('../src/reglas');

test('puntos del rollo: 576 en 80 mm, 384 en 58', () => {
  assert.equal(d.puntosDelRollo(80), 576);
  assert.equal(d.puntosDelRollo(58), 384);
  assert.equal(d.puntosDelRollo(undefined), 576);
});

test('de la imagen a puntos: lo oscuro, negro; lo claro y lo transparente, papel', () => {
  // 10 x 2: fila 0 = negro, blanco, negro, … ; fila 1 = todo transparente.
  const w = 10, h = 2, bgra = Buffer.alloc(w * h * 4);
  for (let x = 0; x < w; x++) {
    const i = x * 4;
    const v = x % 2 === 0 ? 0 : 255;
    bgra[i] = v; bgra[i + 1] = v; bgra[i + 2] = v; bgra[i + 3] = 255;
  }
  const p = d.aPuntos(bgra, w, h);
  assert.equal(p.porFila, 2);
  assert.deepEqual([...p.datos], [0b10101010, 0b10000000, 0, 0]);
});

test('el blanco del final se quita, con un poco de margen', () => {
  const porFila = 1, alto = 100, datos = Buffer.alloc(100);
  datos[10] = 0xff;
  const p = d.sinBlancoAlFinal({ porFila, alto, datos }, 5);
  assert.equal(p.alto, 16);
  assert.equal(d.sinBlancoAlFinal({ porFila, alto, datos: Buffer.alloc(100) }).alto, 0);
});

test('las órdenes ESC/POS: empezar, la imagen a trozos de 128 filas, avanzar y cortar', () => {
  const porFila = 72, alto = 300, datos = Buffer.alloc(porFila * alto, 0x55);
  const b = d.ordenesDelTicket({ porFila, alto, datos });
  assert.deepEqual([...b.subarray(0, 2)], [0x1b, 0x40]);
  // Primer trozo: GS v 0, 72 bytes por fila, 128 filas.
  assert.deepEqual([...b.subarray(2, 10)], [0x1d, 0x76, 0x30, 0x00, 72, 0, 128, 0]);
  const trozos = Math.ceil(alto / d.BANDA);
  assert.equal(b.length, 2 + trozos * 8 + porFila * alto + 3 + 4);
  assert.deepEqual([...b.subarray(b.length - 7)], [0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);
  // Sin cuchilla: sin cortar.
  assert.equal(d.ordenesDelTicket({ porFila, alto, datos }, { cortar: false }).length, b.length - 4);
});

test('el documento del ticket: con los estilos de comandi.es y del ancho que imprime', () => {
  const doc = d.documentoDelTicket({ estilos: '.ticket{color:red}', html: '<div class="ticket">x</div>', anchoMm: 72 });
  assert.match(doc, /<base href="https:\/\/comandi\.es\/">/);
  assert.match(doc, /html \{ width: 72mm !important;/);
  assert.match(doc, /<div class="zona-imprimible solo-imprimir"><div class="ticket">x<\/div><\/div>/);
});

test('los errores de Windows, en cristiano; y el programa de la cola en crudo', () => {
  assert.equal(d.errorDeWindows('error 1801'), 'Windows no encuentra esa impresora');
  assert.match(d.errorDeWindows('error 123'), /\(123\)/);
  assert.match(d.SCRIPT_RAW, /pDataType = "RAW"/);
  assert.match(d.SCRIPT_RAW, /WritePrinter\(h, datos, datos\.Length, out escritos\)/);
});

test('ajustes: el modo directo, apagado salvo que se elija; y la aplicación lo usa', () => {
  assert.equal(r.ajustesValidos(null).directo, false);
  assert.equal(r.ajustesValidos({ directo: true }).directo, true);
  const M = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(M, /r = ajustes\.directo\s*\? await imprimirDirectoPagina\(evento\.sender, impresora, ajustes\.papel\)/);
  assert.match(M, /'-Impresora', nombre, '-Archivo', archivo\]/);
  const H = fs.readFileSync(path.join(__dirname, '..', 'src', 'ajustes.html'), 'utf8');
  assert.match(H, /id="directo"/);
});
