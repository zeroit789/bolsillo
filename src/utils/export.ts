/* ===========================================================================
   export.ts — Exportación a XLSX, PDF y CSV / XLSX, PDF & CSV export
   ---------------------------------------------------------------------------
   ES: Exportación de datos de Bolsillo a XLSX (ExcelJS), PDF (jsPDF +
       autoTable) y CSV.
       - 5 funciones públicas: mes × XLSX/PDF e historial × XLSX/PDF/CSV.
       - Guardado en disco vía Tauri: diálogo "save" + comando Rust
         `guardar_archivo`.
       - Todos los importes se muestran formateados en euros (es-ES).
   EN: Exports Bolsillo data to XLSX (ExcelJS), PDF (jsPDF + autoTable) and CSV.
       - 5 public functions: month × XLSX/PDF and history × XLSX/PDF/CSV.
       - Saved to disk through Tauri: "save" dialog + the `guardar_archivo`
         Rust command.
       - Every amount is shown formatted in euros (es-ES).
   ---------------------------------------------------------------------------
   ÍNDICE / INDEX:
     1. Exportar mes a XLSX / Export month to XLSX
     2. Exportar mes a PDF / Export month to PDF
     3. Exportar historial a XLSX / Export history to XLSX
     4. Exportar historial a PDF / Export history to PDF
     5. Exportar historial a CSV / Export history to CSV
   =========================================================================== */

import ExcelJS from "exceljs"; // ES: librería para generar hojas de cálculo .xlsx / EN: library to build .xlsx spreadsheets
import { jsPDF } from "jspdf"; // ES: generador de PDF en cliente / EN: client-side PDF generator
import autoTable from "jspdf-autotable"; // ES: plugin de tablas para jsPDF (v5: autoTable(doc, opts)) / EN: tables plugin for jsPDF (v5: autoTable(doc, opts))
import { save } from "@tauri-apps/plugin-dialog"; // ES: diálogo nativo "Guardar como" / EN: native "Save as" dialog
import { invoke } from "@tauri-apps/api/core"; // ES: puente para llamar comandos Rust / EN: bridge to call Rust commands

import type { LineaMes, EstadoDeuda, Plan } from "../types"; // ES: línea unificada + estado de deuda + plan de ahorro / EN: unified line + debt status + savings plan
import type { ResumenMes } from "../stores/finanzas"; // ES: totales calculados de un mes / EN: computed totals of a month

/* ---------------------------------------------------------------------------
   ES: Formateador de moneda en euros con convención española (1.234,56 €).
       Se crea una sola vez y se reutiliza en todas las exportaciones.
   EN: Euro currency formatter using the Spanish convention (1.234,56 €).
       Created once and reused by every export.
   --------------------------------------------------------------------------- */
const fmtEuro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

// ES: Atajo para formatear un número como euros.
// EN: Shortcut to format a number as euros.
function euro(n: number): string {
  return fmtEuro.format(n);
}

/* ---------------------------------------------------------------------------
   ES: Devuelve la etiqueta de tipo de una línea según su signo y si es fija.
         - Ingreso          → signo "ingreso"
         - Gasto fijo       → signo "gasto" + fijo === true
         - Gasto variable   → signo "gasto" + fijo === false
   EN: Returns the type label of a line from its sign and whether it is fixed.
         - Income           → signo "ingreso"
         - Fixed expense    → signo "gasto" + fijo === true
         - Variable expense → signo "gasto" + fijo === false
       The labels stay in Spanish because the exported files use Spanish headers.
   --------------------------------------------------------------------------- */
function etiquetaTipo(linea: LineaMes): string {
  if (linea.signo === "ingreso") return "Ingreso";
  return linea.fijo ? "Gasto fijo" : "Gasto variable";
}

/* ---------------------------------------------------------------------------
   ES: Helper interno de guardado.
       1. Abre el diálogo nativo con un nombre sugerido y un filtro por extensión.
       2. Si el usuario cancela (ruta null), no hace nada.
       3. Si elige ruta, envía los bytes al backend Rust para escribirlos en disco.
       `bytes` se convierte a `number[]` porque el comando Rust espera un array
       de enteros (no un Uint8Array, que no es serializable directamente a JSON).
   EN: Internal save helper.
       1. Opens the native dialog with a suggested name and an extension filter.
       2. If the user cancels (null path), it does nothing.
       3. If a path is chosen, it sends the bytes to the Rust backend to write
          them to disk.
       `bytes` is turned into `number[]` because the Rust command expects an
       array of integers (a Uint8Array is not directly JSON-serializable).
   --------------------------------------------------------------------------- */
async function guardar(
  nombreSugerido: string,
  ext: "xlsx" | "pdf" | "csv",
  bytes: Uint8Array
): Promise<void> {
  // ES: Abre el diálogo "Guardar como" con el filtro de extensión correspondiente.
  // EN: Opens the "Save as" dialog with the matching extension filter.
  const ruta = await save({
    defaultPath: nombreSugerido,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });

  // ES: Usuario canceló el diálogo: salimos sin escribir nada.
  // EN: The user cancelled the dialog: exit without writing anything.
  if (ruta === null) return;

  // ES: Llamada al comando Rust que escribe los bytes en la ruta elegida.
  //     Si falla, `invoke` lanza un string de error que el llamador puede capturar.
  // EN: Call the Rust command that writes the bytes to the chosen path. If it fails,
  //     `invoke` throws an error string the caller can catch.
  await invoke("guardar_archivo", { ruta, contenido: Array.from(bytes) });
}

/* ===========================================================================
   1) EXPORTAR MES A XLSX / EXPORT MONTH TO XLSX
   ES: Hoja "Movimientos": tabla de líneas + resumen + deudas y planes (si hay).
   EN: "Movimientos" sheet: lines table + summary + debts and plans (if any).
   =========================================================================== */
export async function exportarMesXLSX(
  mesLabel: string,
  lineas: LineaMes[],
  resumen: ResumenMes,
  // ES: Params opcionales: no rompen las llamadas existentes (por defecto vacíos).
  // EN: Optional params: they don't break existing calls (empty by default).
  deudas: EstadoDeuda[] = [],
  planes: Plan[] = []
): Promise<void> {
  // ES: Libro y hoja de trabajo.
  // EN: Workbook and worksheet.
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Movimientos");

  // ES: Definición de columnas con sus anchos. La clave (`key`) se usa al añadir filas.
  // EN: Column definitions with their widths. The `key` is used when adding rows.
  hoja.columns = [
    { header: "Concepto", key: "concepto", width: 32 },
    { header: "Categoría", key: "categoria", width: 20 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Importe (€)", key: "importe", width: 16 },
  ];

  // ES: --- Estilo de la fila de cabecera: negrita + fondo gris claro ---
  // EN: --- Header row style: bold + light grey background ---
  const filaCabecera = hoja.getRow(1);
  filaCabecera.font = { bold: true }; // ES: texto en negrita / EN: bold text
  filaCabecera.eachCell((celda) => {
    // ES: Relleno sólido gris claro para destacar la cabecera.
    // EN: Solid light grey fill to highlight the header.
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  // ES: --- Filas de datos: una por cada línea del mes ---
  // EN: --- Data rows: one per line of the month ---
  for (const linea of lineas) {
    // ES: Añadimos la fila usando las claves de columna definidas arriba.
    // EN: Add the row using the column keys defined above.
    const fila = hoja.addRow({
      concepto: linea.concepto,
      categoria: linea.categoria,
      tipo: etiquetaTipo(linea),
      importe: linea.importe,
    });

    // ES: La celda del importe se formatea como moneda y se colorea:
    //     verde para ingresos, rojo para gastos (color de fuente).
    // EN: The amount cell is formatted as currency and colored: green for income, red
    //     for expenses (font color).
    const celdaImporte = fila.getCell("importe");
    celdaImporte.numFmt = '#,##0.00 "€"'; // ES: formato numérico con símbolo € / EN: number format with the € symbol
    celdaImporte.font = {
      color: { argb: linea.signo === "ingreso" ? "FF1E8E3E" : "FFD93025" },
    };
  }

  // ES: --- Bloque de resumen tras una fila en blanco ---
  // EN: --- Summary block after a blank row ---
  hoja.addRow([]); // ES: separador visual / EN: visual separator

  // ES: Cabecera del bloque resumen en negrita.
  // EN: Summary block header in bold.
  const filaResumenTitulo = hoja.addRow(["Resumen", "", "", ""]);
  filaResumenTitulo.getCell(1).font = { bold: true };

  // ES: Pares etiqueta/valor del resumen del mes.
  // EN: Label/value pairs of the month summary.
  const filasResumen: [string, number][] = [
    ["Ingresos", resumen.ingresos],
    ["Gastos fijos", resumen.gastosFijos],
    ["Gastos variables", resumen.gastosVariables],
    ["Total gastos", resumen.totalGastos],
    ["Disponible", resumen.disponible],
  ];

  // ES: Volcamos cada par como una fila: etiqueta en col A, importe en col D.
  // EN: Write each pair as a row: label in column A, amount in column D.
  for (const [etiqueta, valor] of filasResumen) {
    const fila = hoja.addRow([etiqueta, "", "", valor]);
    fila.getCell(1).font = { bold: true }; // ES: etiqueta en negrita / EN: bold label
    const celdaValor = fila.getCell(4);
    celdaValor.numFmt = '#,##0.00 "€"'; // ES: formato euros / EN: euro format
  }

  // ES: --- Sección Deudas (solo si hay datos) ---
  //     Se coloca en la misma hoja, separada por una fila en blanco.
  // EN: --- Debts section (only if there is data) --- Placed on the same sheet,
  //     separated by a blank row.
  if (deudas.length) {
    hoja.addRow([]); // ES: separador visual / EN: visual separator

    // ES: Título de la sección en negrita.
    // EN: Section title in bold.
    const filaTituloDeudas = hoja.addRow(["Deudas", "", "", "", "", ""]);
    filaTituloDeudas.getCell(1).font = { bold: true };

    // ES: Cabecera de columnas de la tabla de deudas (negrita + fondo gris claro).
    // EN: Column header of the debts table (bold + light grey background).
    const cabDeudas = hoja.addRow([
      "Concepto",
      "Total",
      "Pagado",
      "Pendiente",
      "Cuota",
      "Progreso %",
    ]);
    cabDeudas.font = { bold: true };
    cabDeudas.eachCell((celda) => {
      celda.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    // ES: Una fila por deuda: importes con formato euro, progreso como texto "%".
    // EN: One row per debt: amounts in euro format, progress as "%" text.
    for (const e of deudas) {
      const fila = hoja.addRow([
        e.deuda.concepto,
        e.deuda.total,
        e.pagado,
        e.pendiente,
        e.cuotaDelMes,
        `${e.progreso}%`,
      ]);
      // ES: Columnas numéricas de importe (2..5) con el mismo formato euro.
      // EN: Numeric amount columns (2..5) with the same euro format.
      for (let col = 2; col <= 5; col++) {
        fila.getCell(col).numFmt = '#,##0.00 "€"';
      }
    }
  }

  // ES: --- Sección Planes (solo si hay datos) ---
  // EN: --- Plans section (only if there is data) ---
  if (planes.length) {
    hoja.addRow([]); // ES: separador visual / EN: visual separator

    // ES: Título de la sección en negrita.
    // EN: Section title in bold.
    const filaTituloPlanes = hoja.addRow(["Planes", "", "", "", ""]);
    filaTituloPlanes.getCell(1).font = { bold: true };

    // ES: Cabecera de columnas de la tabla de planes (negrita + fondo gris claro).
    // EN: Column header of the plans table (bold + light grey background).
    const cabPlanes = hoja.addRow([
      "Nombre",
      "Objetivo",
      "Aportado",
      "Restante",
      "Progreso %",
    ]);
    cabPlanes.font = { bold: true };
    cabPlanes.eachCell((celda) => {
      celda.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    // ES: Una fila por plan: calculamos restante y progreso a partir de objetivo/aportado.
    // EN: One row per plan: remaining and progress are computed from goal/saved.
    for (const p of planes) {
      const restante = Math.max(0, p.objetivo - p.aportado); // ES: nunca negativo / EN: never negative
      const progreso =
        p.objetivo > 0
          ? Math.min(100, Math.round((p.aportado / p.objetivo) * 100))
          : 0; // ES: 0..100, evita dividir por cero / EN: 0..100, avoids dividing by zero
      const fila = hoja.addRow([
        p.nombre,
        p.objetivo,
        p.aportado,
        restante,
        `${progreso}%`,
      ]);
      // ES: Columnas numéricas de importe (2..4) con el mismo formato euro.
      // EN: Numeric amount columns (2..4) with the same euro format.
      for (let col = 2; col <= 4; col++) {
        fila.getCell(col).numFmt = '#,##0.00 "€"';
      }
    }
  }

  // ES: Serializamos el libro a un buffer y delegamos el guardado.
  // EN: Serialize the workbook to a buffer and hand off the saving.
  const buf = await wb.xlsx.writeBuffer();
  await guardar(`Bolsillo - ${mesLabel}.xlsx`, "xlsx", new Uint8Array(buf as ArrayBuffer));
}

/* ===========================================================================
   2) EXPORTAR MES A PDF / EXPORT MONTH TO PDF
   ES: Título + tabla de líneas (autoTable) + pie con resumen + deudas y planes.
   EN: Title + lines table (autoTable) + summary footer + debts and plans.
   =========================================================================== */
export async function exportarMesPDF(
  mesLabel: string,
  lineas: LineaMes[],
  resumen: ResumenMes,
  // ES: Params opcionales: no rompen las llamadas existentes (por defecto vacíos).
  // EN: Optional params: they don't break existing calls (empty by default).
  deudas: EstadoDeuda[] = [],
  planes: Plan[] = []
): Promise<void> {
  // ES: Documento A4 vertical por defecto.
  // EN: A4 portrait document by default.
  const doc = new jsPDF();

  // ES: Título del documento.
  // EN: Document title.
  doc.setFontSize(16);
  doc.text(`Bolsillo — ${mesLabel}`, 14, 18);

  // ES: Cabecera de la tabla.
  // EN: Table header.
  const head = [["Concepto", "Categoría", "Tipo", "Importe (€)"]];

  // ES: Cuerpo de la tabla: cada línea como un array de celdas (strings).
  // EN: Table body: each line as an array of cells (strings).
  const body = lineas.map((linea) => [
    linea.concepto,
    linea.categoria,
    etiquetaTipo(linea),
    euro(linea.importe),
  ]);

  // ES: Tabla con autoTable (API v5: autoTable(doc, opciones)).
  // EN: Table with autoTable (v5 API: autoTable(doc, options)).
  autoTable(doc, {
    head,
    body,
    startY: 26, // ES: empieza bajo el título / EN: starts below the title
    styles: { fontSize: 9 },
    headStyles: { fillColor: [60, 60, 60] }, // ES: cabecera gris oscuro / EN: dark grey header
    columnStyles: { 3: { halign: "right" } }, // ES: importes alineados a la derecha / EN: amounts right-aligned
  });

  // ES: Calculamos la Y final de la tabla para colocar el pie con el resumen.
  //     `lastAutoTable` lo añade el plugin; tipamos el acceso para TS estricto.
  // EN: Compute the table's final Y to place the summary footer. `lastAutoTable` is
  //     added by the plugin; the access is typed for strict TS.
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 26;

  // ES: Pie con el resumen del mes.
  // EN: Footer with the month summary.
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

  // ES: Helper local: lee la Y final de la última autoTable para encadenar tablas.
  // EN: Local helper: reads the final Y of the last autoTable to chain tables.
  const ultimaY = (defecto: number): number =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? defecto;

  // ES: --- Tabla de Deudas (solo si hay datos) ---
  // EN: --- Debts table (only if there is data) ---
  if (deudas.length) {
    // ES: Título de la sección encima de la tabla.
    // EN: Section title above the table.
    let yDeudas = y + 12;
    doc.setFontSize(11);
    doc.text("Deudas", 14, yDeudas);

    // ES: Tabla con autoTable: importes formateados en euros, progreso como "%".
    // EN: autoTable table: amounts formatted in euros, progress as "%".
    autoTable(doc, {
      head: [["Concepto", "Total", "Pagado", "Pendiente", "Cuota", "Progreso %"]],
      body: deudas.map((e) => [
        e.deuda.concepto,
        euro(e.deuda.total),
        euro(e.pagado),
        euro(e.pendiente),
        euro(e.cuotaDelMes),
        `${e.progreso}%`,
      ]),
      startY: yDeudas + 4, // ES: empieza bajo el título / EN: starts below the title
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] }, // ES: cabecera gris oscuro / EN: dark grey header
      // ES: Importes y progreso alineados a la derecha (columnas 1..5).
      // EN: Amounts and progress right-aligned (columns 1..5).
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
    });

    // ES: Avanzamos la Y de referencia para encadenar la tabla siguiente.
    // EN: Move the reference Y forward to chain the next table.
    y = ultimaY(yDeudas + 4);
  }

  // ES: --- Tabla de Planes (solo si hay datos) ---
  // EN: --- Plans table (only if there is data) ---
  if (planes.length) {
    // ES: Título de la sección encima de la tabla.
    // EN: Section title above the table.
    let yPlanes = y + 12;
    doc.setFontSize(11);
    doc.text("Planes", 14, yPlanes);

    // ES: Tabla con autoTable: restante y progreso calculados a partir de objetivo/aportado.
    // EN: autoTable table: remaining and progress computed from goal/saved.
    autoTable(doc, {
      head: [["Nombre", "Objetivo", "Aportado", "Restante", "Progreso %"]],
      body: planes.map((p) => {
        const restante = Math.max(0, p.objetivo - p.aportado); // ES: nunca negativo / EN: never negative
        const progreso =
          p.objetivo > 0
            ? Math.min(100, Math.round((p.aportado / p.objetivo) * 100))
            : 0; // ES: 0..100, evita dividir por cero / EN: 0..100, avoids dividing by zero
        return [
          p.nombre,
          euro(p.objetivo),
          euro(p.aportado),
          euro(restante),
          `${progreso}%`,
        ];
      }),
      startY: yPlanes + 4, // ES: empieza bajo el título / EN: starts below the title
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] }, // ES: cabecera gris oscuro / EN: dark grey header
      // ES: Importes y progreso alineados a la derecha (columnas 1..4).
      // EN: Amounts and progress right-aligned (columns 1..4).
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });
  }

  // ES: Exportamos a ArrayBuffer y guardamos.
  // EN: Export to an ArrayBuffer and save.
  const bytes = doc.output("arraybuffer");
  await guardar(`Bolsillo - ${mesLabel}.pdf`, "pdf", new Uint8Array(bytes));
}

/* ===========================================================================
   3) EXPORTAR HISTORIAL A XLSX / EXPORT HISTORY TO XLSX
   ES: Hoja "Historial": una fila por mes con todos sus totales.
   EN: "Historial" sheet: one row per month with all its totals.
   =========================================================================== */
export async function exportarHistorialXLSX(filas: ResumenMes[]): Promise<void> {
  // ES: Libro y hoja del historial.
  // EN: History workbook and sheet.
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Historial");

  // ES: Columnas del historial con anchos razonables.
  // EN: History columns with sensible widths.
  hoja.columns = [
    { header: "Mes", key: "mes", width: 14 },
    { header: "Ingresos", key: "ingresos", width: 16 },
    { header: "Gastos fijos", key: "gastosFijos", width: 16 },
    { header: "Gastos variables", key: "gastosVariables", width: 18 },
    { header: "Total gastos", key: "totalGastos", width: 16 },
    { header: "Disponible", key: "disponible", width: 16 },
  ];

  // ES: Cabecera en negrita con fondo gris claro.
  // EN: Bold header with a light grey background.
  const filaCabecera = hoja.getRow(1);
  filaCabecera.font = { bold: true };
  filaCabecera.eachCell((celda) => {
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  // ES: Una fila por mes; las columnas numéricas se formatean como euros.
  // EN: One row per month; numeric columns are formatted as euros.
  for (const f of filas) {
    const fila = hoja.addRow({
      mes: f.mes,
      ingresos: f.ingresos,
      gastosFijos: f.gastosFijos,
      gastosVariables: f.gastosVariables,
      totalGastos: f.totalGastos,
      disponible: f.disponible,
    });
    // ES: Aplicamos formato moneda a las 5 columnas numéricas (índices 2..6).
    // EN: Apply currency format to the 5 numeric columns (indexes 2..6).
    for (let col = 2; col <= 6; col++) {
      fila.getCell(col).numFmt = '#,##0.00 "€"';
    }
  }

  // ES: Serializar y guardar.
  // EN: Serialize and save.
  const buf = await wb.xlsx.writeBuffer();
  await guardar("Bolsillo - Historial.xlsx", "xlsx", new Uint8Array(buf as ArrayBuffer));
}

/* ===========================================================================
   4) EXPORTAR HISTORIAL A PDF / EXPORT HISTORY TO PDF
   ES: Título + tabla con una fila por mes (autoTable).
   EN: Title + table with one row per month (autoTable).
   =========================================================================== */
export async function exportarHistorialPDF(filas: ResumenMes[]): Promise<void> {
  // ES: Documento A4 vertical.
  // EN: A4 portrait document.
  const doc = new jsPDF();

  // ES: Título.
  // EN: Title.
  doc.setFontSize(16);
  doc.text("Bolsillo — Historial", 14, 18);

  // ES: Cabecera de la tabla.
  // EN: Table header.
  const head = [
    ["Mes", "Ingresos", "Gastos fijos", "Gastos variables", "Total gastos", "Disponible"],
  ];

  // ES: Cuerpo: cada mes con sus importes formateados en euros.
  // EN: Body: each month with its amounts formatted in euros.
  const body = filas.map((f) => [
    f.mes,
    euro(f.ingresos),
    euro(f.gastosFijos),
    euro(f.gastosVariables),
    euro(f.totalGastos),
    euro(f.disponible),
  ]);

  // ES: Tabla con autoTable v5.
  // EN: Table with autoTable v5.
  autoTable(doc, {
    head,
    body,
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
    // ES: Las 5 columnas de importes (índices 1..5) alineadas a la derecha.
    // EN: The 5 amount columns (indexes 1..5) right-aligned.
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  // ES: Exportar y guardar.
  // EN: Export and save.
  const bytes = doc.output("arraybuffer");
  await guardar("Bolsillo - Historial.pdf", "pdf", new Uint8Array(bytes));
}

/* ===========================================================================
   5) EXPORTAR HISTORIAL A CSV / EXPORT HISTORY TO CSV
   ES: Una fila por mes con sus totales. Separador ';' (convención española,
       así los importes pueden llevar coma decimal sin chocar con el delimitador).
   EN: One row per month with its totals. ';' separator (Spanish convention, so
       amounts can carry a decimal comma without clashing with the delimiter).
   =========================================================================== */
export async function exportarHistorialCSV(filas: ResumenMes[]): Promise<void> {
  // ES: Separador de columnas: ';' para que la coma decimal no rompa el CSV.
  // EN: Column separator: ';' so the decimal comma doesn't break the CSV.
  const SEP = ";";

  // ES: Pasa un número a texto con coma decimal y 2 decimales (sin símbolo €):
  //     1234.5 -> "1234,50". Se evita el separador de miles para no chocar con ';'.
  // EN: Turns a number into text with a decimal comma and 2 decimals (no € sign):
  //     1234.5 -> "1234,50". The thousands separator is avoided so it never clashes
  //     with ';'.
  const num = (n: number): string => n.toFixed(2).replace(".", ",");

  // ES: Escapa un campo de texto: si contiene ';', comillas o saltos de línea, lo
  //     envuelve en comillas dobles y duplica las comillas internas (RFC 4180).
  // EN: Escapes a text field: if it contains ';', quotes or line breaks, it wraps it
  //     in double quotes and doubles the inner quotes (RFC 4180).
  const esc = (texto: string): string => {
    if (/[";\n\r]/.test(texto)) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  };

  // ES: Encabezados de columna (mismos que la tabla del historial).
  // EN: Column headers (same as the history table).
  const cabecera = [
    "Mes",
    "Ingresos",
    "Gastos fijos",
    "Gastos variables",
    "Total gastos",
    "Disponible",
  ];

  // ES: Construimos las líneas: cabecera + una fila por mes.
  // EN: Build the lines: header + one row per month.
  const lineas: string[] = [cabecera.map(esc).join(SEP)];
  for (const f of filas) {
    lineas.push(
      [
        esc(f.mes),
        num(f.ingresos),
        num(f.gastosFijos),
        num(f.gastosVariables),
        num(f.totalGastos),
        num(f.disponible),
      ].join(SEP)
    );
  }

  // ES: Unimos con CRLF (compatibilidad amplia, p. ej. Excel) y antepones un BOM
  //     UTF-8 para que Excel reconozca los acentos correctamente.
  // EN: Join with CRLF (broad compatibility, e.g. Excel) and prepend a UTF-8 BOM so
  //     Excel reads accented characters correctly.
  const contenido = "﻿" + lineas.join("\r\n");

  // ES: Pasamos el texto a bytes UTF-8 y reutilizamos el mismo helper de guardado.
  // EN: Encode the text as UTF-8 bytes and reuse the same save helper.
  const bytes = new TextEncoder().encode(contenido);
  await guardar("Bolsillo - Historial.csv", "csv", bytes);
}
