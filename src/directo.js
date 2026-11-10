// IMPRIMIR EN MODO DIRECTO (10/11/2026, Lin Lin: «sale un papelito en blanco»;
// Sandra: «su otro programa de pedidos sí funciona bien con la impresora, pero
// Comandi le da fallo; hay que hacer Comandi mucho más compatible»).
//
// Lo normal (src/papel.js) es imprimir como un navegador: Windows convierte la
// página con el CONTROLADOR de la impresora. Si el controlador no es el suyo
// («Genérico / Solo texto», el de otro modelo…), el papel sale en blanco o mal,
// aunque los programas de caja impriman perfecto: esos le hablan a la
// impresora en su propio idioma (ESC/POS) y no usan el controlador.
//
// El modo directo hace lo mismo que ellos: cada ticket se dibuja tal cual se ve
// (logo, letra, chino), se pasa a puntos blancos y negros del ancho que imprime
// la impresora (576 en un rollo de 80 mm, 384 en uno de 58) y se manda como
// imagen ESC/POS, en crudo, a la cola de Windows (sin controlador de por medio).
//
// Aquí lo PURO (con sus pruebas); la ventana invisible que dibuja y la cola de
// Windows están en src/main.js.

// Puntos de ancho que imprime cada rollo (203 ppp: 8 puntos por milímetro).
const PUNTOS = { 80: 576, 58: 384 };
function puntosDelRollo(papelMm) {
  return PUNTOS[Number(papelMm) === 58 ? 58 : 80];
}

// Lo que tiene que tener el ticket al dibujarlo: el ancho en milímetros que
// imprime el rollo, sin márgenes de página. Va con los estilos de comandi.es.
function documentoDelTicket({ estilos, html, anchoMm }) {
  const ancho = Number(anchoMm) > 0 ? Number(anchoMm) : 72;
  return '<!doctype html><html><head><meta charset="utf-8"><base href="https://comandi.es/">'
    + '<style>' + String(estilos || '') + '</style>'
    + '<style>@page { size: auto; margin: 0; } html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; } '
    + 'html { width: ' + ancho + 'mm !important; box-sizing: border-box; padding: 0 1.5mm !important; } '
    + '.zona-imprimible { display: block !important; position: static !important; } '
    + '.ticket { break-before: auto !important; break-after: auto !important; page-break-before: auto !important; page-break-after: auto !important; }</style>'
    + '</head><body><div class="zona-imprimible solo-imprimir">' + String(html || '') + '</div></body></html>';
}

// De la imagen (BGRA, como la da Electron) a puntos: negro si es oscuro. Cada
// fila, en bytes de 8 puntos (el de la izquierda, el bit más alto).
function aPuntos(bgra, ancho, alto, umbral = 160) {
  const w = Math.max(0, Math.floor(ancho));
  const h = Math.max(0, Math.floor(alto));
  const porFila = Math.ceil(w / 8);
  const datos = Buffer.alloc(porFila * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const b = bgra[i], g = bgra[i + 1], r = bgra[i + 2], a = bgra[i + 3];
      // Lo transparente cuenta como papel (blanco).
      const luz = a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
      if (luz < umbral) datos[y * porFila + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { porFila, alto: h, datos };
}

// Quita las filas en blanco del final (el papel sale con el largo justo).
function sinBlancoAlFinal({ porFila, alto, datos }, margenFilas = 24) {
  let ultima = -1;
  for (let y = alto - 1; y >= 0 && ultima < 0; y--) {
    for (let k = 0; k < porFila; k++) if (datos[y * porFila + k]) { ultima = y; break; }
  }
  const filas = Math.min(alto, ultima < 0 ? 0 : ultima + 1 + margenFilas);
  return { porFila, alto: filas, datos: datos.subarray(0, porFila * filas) };
}

// Las órdenes ESC/POS de un ticket: empezar, la imagen a trozos (GS v 0; de 128
// filas, que algunas impresoras no aguantan más de golpe), unas líneas en
// blanco y cortar (si no tiene cuchilla, no hace nada).
const BANDA = 128;
function ordenesDelTicket({ porFila, alto, datos }, { cortar = true } = {}) {
  const partes = [Buffer.from([0x1b, 0x40])]; // ESC @
  for (let y = 0; y < alto; y += BANDA) {
    const filas = Math.min(BANDA, alto - y);
    partes.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, porFila & 0xff, (porFila >> 8) & 0xff, filas & 0xff, (filas >> 8) & 0xff]));
    partes.push(Buffer.from(datos.subarray(y * porFila, (y + filas) * porFila)));
  }
  partes.push(Buffer.from([0x1b, 0x64, 0x04])); // ESC d 4: cuatro líneas
  if (cortar) partes.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])); // GS V 66 0: avanza y corta
  return Buffer.concat(partes);
}

// El programa de PowerShell que manda los bytes a la cola de Windows en crudo
// («RAW»): OpenPrinter / StartDocPrinter / WritePrinter de winspool.drv. Sale
// con 0 si ha ido bien; si no, escribe el código de error de Windows.
const SCRIPT_RAW = String.raw`param([string]$Impresora, [string]$Archivo)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ComandiRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static int Mandar(string impresora, byte[] datos) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Comandi"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return Marshal.GetLastWin32Error();
      try {
        StartPagePrinter(h);
        int escritos;
        bool bien = WritePrinter(h, datos, datos.Length, out escritos);
        int err = Marshal.GetLastWin32Error();
        EndPagePrinter(h);
        if (!bien) return err == 0 ? -1 : err;
        if (escritos != datos.Length) return -2;
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return 0;
  }
}
"@
$datos = [System.IO.File]::ReadAllBytes($Archivo)
$r = [ComandiRaw]::Mandar($Impresora, $datos)
if ($r -ne 0) { Write-Output ("error " + $r); exit 2 }
exit 0
`;

// Lo que dice Windows, en cristiano.
function errorDeWindows(salida) {
  const m = /error (-?\d+)/.exec(String(salida || ''));
  const c = m ? Number(m[1]) : NaN;
  if (c === 1801) return 'Windows no encuentra esa impresora';
  if (c === 5) return 'Windows no deja usar esa impresora';
  if (c === -2) return 'La impresora no ha cogido el ticket entero';
  if (Number.isFinite(c)) return 'Windows no ha podido mandarlo a la impresora (' + c + ')';
  return 'No se ha podido mandar a la impresora';
}

module.exports = { PUNTOS, puntosDelRollo, documentoDelTicket, aPuntos, sinBlancoAlFinal, ordenesDelTicket, SCRIPT_RAW, errorDeWindows, BANDA };
