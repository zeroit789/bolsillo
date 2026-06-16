/* ===========================================================================
   Exportación de datos de Bolsillo a XLSX (ExcelJS) y PDF (jsPDF + autoTable).
   - 4 funciones públicas: mes/historial × XLSX/PDF.
   - Guardado en disco vía Tauri: diálogo "save" + comando Rust `guardar_archivo`.
   - Todos los importes se muestran formateados en euros (es-ES).
   =========================================================================== */

import ExcelJS from "exceljs"; // librería para generar hojas de cálculo .xlsx
import { jsPDF } from "jspdf"; // generador de PDF en cliente
import autoTable from "jspdf-autotable"; // plugin de tablas para jsPDF (v5: autoTable(doc, opts))
import { save } from "@tauri-apps/plugin-dialog"; // diálogo nativo "Guardar como"
import { invoke } from "@tauri-apps/api/core"; // puente para llamar comandos Rust

import type { LineaMes } from "../types"; // línea unificada de un mes (recurrente/puntual/deuda)
import type { ResumenMes } from "../stores/finanzas"; // totales calculados de un mes

/* ---------------------------------------------------------------------------
   Formateador de moneda en euros con convención española (1.234,56 €).
   Se crea una sola vez y se reutiliza en todas las exportaciones.
   --------------------------------------------------------------------------- */
const fmtEuro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

// Atajo para formatear un número como euros.
function euro(n: number): string {
  return fmtEuro.format(n);
}

/* ---------------------------------------------------------------------------
   Devuelve la etiqueta de tipo de una línea según su signo y si es fija.
     - Ingreso          → signo "ingreso"
     - Gasto fijo       → signo "gasto" + fijo === true
     - Gasto variable   → signo "gasto" + fijo === false
   --------------------------------------------------------------------------- */
function etiquetaTipo(linea: LineaMes): string {
  if (linea.signo === "ingreso") return "Ingreso";
  return linea.fijo ? "Gasto fijo" : "Gasto variable";
}

/* ---------------------------------------------------------------------------
   Helper interno de guardado.
   1. Abre el diálogo nativo con un nombre sugerido y un filtro por extensión.
   2. Si el usuario cancela (ruta null), no hace nada.
   3. Si elige ruta, envía los bytes al backend Rust para escribirlos en disco.

   `bytes` se convierte a `number[]` porque el comando Rust espera un array de
   enteros (no un Uint8Array, que no es serializable directamente a JSON).
   --------------------------------------------------------------------------- */
async function guardar(
  nombreSugerido: string,
  ext: "xlsx" | "pdf",
  bytes: Uint8Array
): Promise<void> {
  // Abre el diálogo "Guardar como" con el filtro de extensión correspondiente.
  const ruta = await save({
    defaultPath: nombreSugerido,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });

  // Usuario canceló el diálogo: salimos sin escribir nada.
  if (ruta === null) return;

  // Llamada al comando Rust que escribe los bytes en la ruta elegida.
  // Si falla, `invoke` lanza un string de error que el llamador puede capturar.
  await invoke("guardar_archivo", { ruta, contenido: Array.from(bytes) });
}

/* ===========================================================================
   1) EXPORTAR MES A XLSX
   Hoja "Movimientos": tabla de líneas + bloque de resumen al final.
   =========================================================================== */
export async function exportarMesXLSX(
  mesLabel: string,
  lineas: LineaMes[],
  resumen: ResumenMes
): Promise<void> {
  // Libro y hoja de trabajo.
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Movimientos");

  // Definición de columnas con sus anchos. La clave (`key`) se usa al añadir filas.
  hoja.columns = [
    { header: "Concepto", key: "concepto", width: 32 },
    { header: "Categoría", key: "categoria", width: 20 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Importe (€)", key: "importe", width: 16 },
  ];

  // --- Estilo de la fila de cabecera: negrita + fondo gris claro ---
  const filaCabecera = hoja.getRow(1);
  filaCabecera.font = { bold: true }; // texto en negrita
  filaCabecera.eachCell((celda) => {
    // Relleno sólido gris claro para destacar la cabecera.
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  // --- Filas de datos: una por cada línea del mes ---
  for (const linea of lineas) {
    // Añadimos la fila usando las claves de columna definidas arriba.
    const fila = hoja.addRow({
      concepto: linea.concepto,
      categoria: linea.categoria,
      tipo: etiquetaTipo(linea),
      importe: linea.importe,
    });

    // La celda del importe se formatea como moneda y se colorea:
    // verde para ingresos, rojo para gastos (color de fuente).
    const celdaImporte = fila.getCell("importe");
    celdaImporte.numFmt = '#,##0.00 "€"'; // formato numérico con símbolo €
    celdaImporte.font = {
      color: { argb: linea.signo === "ingreso" ? "FF1E8E3E" : "FFD93025" },
    };
  }

  // --- Bloque de resumen tras una fila en blanco ---
  hoja.addRow([]); // separador visual

  // Cabecera del bloque resumen en negrita.
  const filaResumenTitulo = hoja.addRow(["Resumen", "", "", ""]);
  filaResumenTitulo.getCell(1).font = { bold: true };

  // Pares etiqueta/valor del resumen del mes.
  const filasResumen: [string, number][] = [
    ["Ingresos", resumen.ingresos],
    ["Gastos fijos", resumen.gastosFijos],
    ["Gastos variables", resumen.gastosVariables],
    ["Total gastos", resumen.totalGastos],
    ["Disponible", resumen.disponible],
  ];

  // Volcamos cada par como una fila: etiqueta en col A, importe en col D.
  for (const [etiqueta, valor] of filasResumen) {
    const fila = hoja.addRow([etiqueta, "", "", valor]);
    fila.getCell(1).font = { bold: true }; // etiqueta en negrita
    const celdaValor = fila.getCell(4);
    celdaValor.numFmt = '#,##0.00 "€"'; // formato euros
  }

  // Serializamos el libro a un buffer y delegamos el guardado.
  const buf = await wb.xlsx.writeBuffer();
  await guardar(`Bolsillo - ${mesLabel}.xlsx`, "xlsx", new Uint8Array(buf as ArrayBuffer));
}

/* ===========================================================================
   2) EXPORTAR MES A PDF
   Título + tabla de líneas (autoTable) + pie con resumen.
   =========================================================================== */
export async function exportarMesPDF(
  mesLabel: string,
  lineas: LineaMes[],
  resumen: ResumenMes
): Promise<void> {
  // Documento A4 vertical por defecto.
  const doc = new jsPDF();

  // Título del documento.
  doc.setFontSize(16);
  doc.text(`Bolsillo — ${mesLabel}`, 14, 18);

  // Cabecera de la tabla.
  const head = [["Concepto", "Categoría", "Tipo", "Importe (€)"]];

  // Cuerpo de la tabla: cada línea como un array de celdas (strings).
  const body = lineas.map((linea) => [
    linea.concepto,
    linea.categoria,
    etiquetaTipo(linea),
    euro(linea.importe),
  ]);

  // Tabla con autoTable (API v5: autoTable(doc, opciones)).
  autoTable(doc, {
    head,
    body,
    startY: 26, // empieza bajo el título
    styles: { fontSize: 9 },
    headStyles: { fillColor: [60, 60, 60] }, // cabecera gris oscuro
    columnStyles: { 3: { halign: "right" } }, // importes alineados a la derecha
  });

  // Calculamos la Y final de la tabla para colocar el pie con el resumen.
  // `lastAutoTable` lo añade el plugin; tipamos el acceso para TS estricto.
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 26;

  // Pie con el resumen del mes.
  let y = finalY + 12;
  doc.setFontSize(11);
  doc.text("Resumen", 14, y);
  doc.setFontSize(10);
  y += 7;
  doc.text(`Ingresos: ${euro(resumen.ingresos)}`, 14, y);
  y += 6;
  doc.text(`Gastos: ${euro(resumen.totalGastos)}`, 14, y);
  y += 6;
  doc.text(`Disponible: ${euro(resumen.disponible)}`, 14, y);

  // Exportamos a ArrayBuffer y guardamos.
  const bytes = doc.output("arraybuffer");
  await guardar(`Bolsillo - ${mesLabel}.pdf`, "pdf", new Uint8Array(bytes));
}

/* ===========================================================================
   3) EXPORTAR HISTORIAL A XLSX
   Hoja "Historial": una fila por mes con todos sus totales.
   =========================================================================== */
export async function exportarHistorialXLSX(filas: ResumenMes[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Historial");

  // Columnas del historial con anchos razonables.
  hoja.columns = [
    { header: "Mes", key: "mes", width: 14 },
    { header: "Ingresos", key: "ingresos", width: 16 },
    { header: "Gastos fijos", key: "gastosFijos", width: 16 },
    { header: "Gastos variables", key: "gastosVariables", width: 18 },
    { header: "Total gastos", key: "totalGastos", width: 16 },
    { header: "Disponible", key: "disponible", width: 16 },
  ];

  // Cabecera en negrita con fondo gris claro.
  const filaCabecera = hoja.getRow(1);
  filaCabecera.font = { bold: true };
  filaCabecera.eachCell((celda) => {
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  // Una fila por mes; las columnas numéricas se formatean como euros.
  for (const f of filas) {
    const fila = hoja.addRow({
      mes: f.mes,
      ingresos: f.ingresos,
      gastosFijos: f.gastosFijos,
      gastosVariables: f.gastosVariables,
      totalGastos: f.totalGastos,
      disponible: f.disponible,
    });
    // Aplicamos formato moneda a las 5 columnas numéricas (índices 2..6).
    for (let col = 2; col <= 6; col++) {
      fila.getCell(col).numFmt = '#,##0.00 "€"';
    }
  }

  // Serializar y guardar.
  const buf = await wb.xlsx.writeBuffer();
  await guardar("Bolsillo - Historial.xlsx", "xlsx", new Uint8Array(buf as ArrayBuffer));
}

/* ===========================================================================
   4) EXPORTAR HISTORIAL A PDF
   Título + tabla con una fila por mes (autoTable).
   =========================================================================== */
export async function exportarHistorialPDF(filas: ResumenMes[]): Promise<void> {
  const doc = new jsPDF();

  // Título.
  doc.setFontSize(16);
  doc.text("Bolsillo — Historial", 14, 18);

  // Cabecera de la tabla.
  const head = [
    ["Mes", "Ingresos", "Gastos fijos", "Gastos variables", "Total gastos", "Disponible"],
  ];

  // Cuerpo: cada mes con sus importes formateados en euros.
  const body = filas.map((f) => [
    f.mes,
    euro(f.ingresos),
    euro(f.gastosFijos),
    euro(f.gastosVariables),
    euro(f.totalGastos),
    euro(f.disponible),
  ]);

  // Tabla con autoTable v5.
  autoTable(doc, {
    head,
    body,
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
    // Las 5 columnas de importes (índices 1..5) alineadas a la derecha.
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  // Exportar y guardar.
  const bytes = doc.output("arraybuffer");
  await guardar("Bolsillo - Historial.pdf", "pdf", new Uint8Array(bytes));
}
