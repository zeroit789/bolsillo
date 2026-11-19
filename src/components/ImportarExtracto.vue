<script setup lang="ts">
/* =============================================================================
 * ImportarExtracto.vue — Asistente «Importar extracto» / "Import statement" wizard
 * -----------------------------------------------------------------------------
 * ES: Diálogo que convierte el extracto del banco (CSV o XLSX) en movimientos:
 *       1. Elegir fichero: en la app, diálogo nativo abierto desde Rust; en el
 *          navegador de desarrollo, un <input type="file">. El fichero no se
 *          guarda: se lee en memoria y solo quedan los apuntes creados.
 *       2. Columnas: si un perfil de banco guardado reconoce la cabecera, se
 *          usa; si no, se proponen las columnas por su nombre. El usuario
 *          ajusta fecha, concepto, importe (o cargo + abono), formato de fecha
 *          y decimal y, en CSV, el separador.
 *       3. Vista previa: errores por fila, posibles duplicados (marcados, no
 *          quitados) con casilla para incluir o excluir cada fila, categoría
 *          que pondrán las reglas y cuenta destino.
 *       4. Importar: crea los puntuales (origen "importado", con su huella) y,
 *          si se pide, guarda el perfil con el nombre del banco.
 *     Accesible como el resto: role="dialog", foco atrapado, etiquetas en
 *     cada control y textos ES/EN.
 * EN: Dialog that turns the bank statement (CSV or XLSX) into transactions:
 *       1. Pick file: in the app, a native dialog opened from Rust; in the
 *          development browser, an <input type="file">. The file is not
 *          stored: it is read in memory and only the created entries remain.
 *       2. Columns: if a saved bank profile recognises the header, it is used;
 *          otherwise columns are proposed by their names. The user adjusts
 *          date, concept, amount (or debit + credit), date and decimal format
 *          and, for CSV, the separator.
 *       3. Preview: errors per row, possible duplicates (flagged, not removed)
 *          with a checkbox to include or exclude each row, the category the
 *          rules will set and the destination account.
 *       4. Import: creates the one-off entries ("importado" origin, with their
 *          fingerprint) and, if asked, saves the profile with the bank's name.
 *     Accessible like the rest: role="dialog", focus trap, labels on every
 *     control and ES/EN texts.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y textos / Imports & texts
 *   2. Estado / State
 *   3. Elegir y abrir el fichero / Picking & opening the file
 *   4. Matriz, cabecera y columnas / Matrix, header & columns
 *   5. Perfil inicial (guardado o propuesto) / Initial profile (saved or proposed)
 *   6. Vista previa, duplicados y selección / Preview, duplicates & selection
 *   7. Importar y guardar el perfil / Import & save the profile
 * ===========================================================================*/

// ── 1. Importaciones y textos / Imports & texts ──────────────────────────────
import { computed, reactive, ref, shallowRef, useId, watch } from "vue";
import { useFocoAtrapado } from "../utils/useFocoAtrapado";
import { useFinanzas } from "../stores/finanzas";
import { euro, fechaLegible } from "../utils/format";
import { crearT } from "../i18n";
import {
  abrirExtracto,
  elegirExtractoNativo,
  ErrorExtracto,
  hayDialogoNativo,
  matrizDe,
  type FicheroExtracto,
} from "../utils/extracto";
import {
  crearFirma,
  detectarCabecera,
  detectarPerfil,
  resolverColumna,
  sugerirMapeo,
  type ColumnaRef,
  type MapeoColumnas,
} from "../utils/importador/perfil";
import { sugerirOrdenFecha, type OrdenFecha } from "../utils/importador/fecha";
import type { FormatoDecimal } from "../utils/importador/importeBanco";
import type { SeparadorCSV } from "../utils/importador/csv";
import {
  crearVistaPrevia,
  type ErrorFila,
  type FilaImportada,
} from "../utils/importador/vistaPrevia";
import type { MarcaDuplicado } from "../utils/importador/duplicados";
import { filasAImportar, marcarDuplicados } from "../utils/importador/importar";
import { categorizar } from "../utils/importador/reglas";
import { normalizarTexto } from "../utils/importador/texto";
import type { Celda } from "../utils/importador/xlsx";

// ES: Eventos: cerrar el asistente y avisar de cuántos apuntes se importaron.
// EN: Events: close the wizard and report how many entries were imported.
const emit = defineEmits<{ cerrar: []; importado: [n: number] }>();

const uid = useId();
const t = crearT({
  titulo: { es: "Importar extracto", en: "Import statement" },
  intro: {
    es: "Elige el extracto que descargas de la web de tu banco (CSV o Excel .xlsx). El fichero no se guarda: solo los movimientos que importes.",
    en: "Pick the statement you download from your bank's website (CSV or Excel .xlsx). The file is not stored: only the transactions you import.",
  },
  elegir: { es: "Elegir fichero…", en: "Choose file…" },
  elegirOtro: { es: "Elegir otro fichero", en: "Choose another file" },
  ficheroLabel: { es: "Fichero del extracto", en: "Statement file" },
  leyendo: { es: "Leyendo…", en: "Reading…" },
  perfilDetectado: { es: "Perfil reconocido: @p", en: "Recognised profile: @p" },
  perfilNuevo: {
    es: "Banco nuevo: revisa las columnas propuestas.",
    en: "New bank: check the proposed columns.",
  },
  columnas: { es: "Columnas", en: "Columns" },
  colFecha: { es: "Fecha", en: "Date" },
  colConcepto: { es: "Concepto", en: "Description" },
  colConcepto2: { es: "Concepto adicional (opcional)", en: "Extra description (optional)" },
  ninguna: { es: "— Ninguna —", en: "— None —" },
  modoImporte: { es: "Importe", en: "Amount" },
  modoUna: { es: "Una columna con signo", en: "One signed column" },
  modoDos: { es: "Cargo y abono por separado", en: "Separate debit and credit" },
  colImporte: { es: "Columna del importe", en: "Amount column" },
  colCargo: { es: "Cargo (gastos)", en: "Debit (expenses)" },
  colAbono: { es: "Abono (ingresos)", en: "Credit (income)" },
  formatoFecha: { es: "Formato de fecha", en: "Date format" },
  dma: { es: "Día/mes/año (31/01/2026)", en: "Day/month/year (31/01/2026)" },
  amd: { es: "Año-mes-día (2026-01-31)", en: "Year-month-day (2026-01-31)" },
  formatoDecimal: { es: "Formato del importe", en: "Amount format" },
  coma: { es: "1.234,56 (coma decimal)", en: "1.234,56 (decimal comma)" },
  punto: { es: "1,234.56 (punto decimal)", en: "1,234.56 (decimal point)" },
  separador: { es: "Separador del CSV", en: "CSV separator" },
  sepAuto: { es: "Automático", en: "Automatic" },
  sepPuntoComa: { es: "Punto y coma ( ; )", en: "Semicolon ( ; )" },
  sepComa: { es: "Coma ( , )", en: "Comma ( , )" },
  sepTab: { es: "Tabulador", en: "Tab" },
  columnaN: { es: "Columna @n", en: "Column @n" },
  vistaPrevia: { es: "Vista previa", en: "Preview" },
  resumen: {
    es: "@f filas leídas · @s para importar · @d posibles duplicados · @e con errores",
    en: "@f rows read · @s to import · @d possible duplicates · @e with errors",
  },
  ignoradas: { es: "@n líneas sin movimiento se han saltado.", en: "@n lines with no transaction were skipped." },
  manuales: {
    es: "Buscar duplicados también en lo apuntado a mano (±3 días, cualquier concepto)",
    en: "Also look for duplicates in hand-entered items (±3 days, any description)",
  },
  importar: { es: "Importar", en: "Import" },
  incluirFila: { es: "Importar la fila @n", en: "Import row @n" },
  marcaApuntado: { es: "Ya apuntado", en: "Already entered" },
  marcaFichero: { es: "Repetido en el fichero", en: "Repeated in the file" },
  thFecha: { es: "Fecha", en: "Date" },
  thConcepto: { es: "Concepto", en: "Description" },
  thImporte: { es: "Importe", en: "Amount" },
  thCategoria: { es: "Categoría", en: "Category" },
  thAviso: { es: "Aviso", en: "Notice" },
  masFilas: {
    es: "Se muestran @v de @t filas (primero las marcadas). Las que no ves se importan igual.",
    en: "Showing @v of @t rows (flagged ones first). The ones you do not see are imported as well.",
  },
  verMas: { es: "Ver más", en: "Show more" },
  errores: { es: "Filas con errores (no se importan)", en: "Rows with errors (not imported)" },
  errorFila: { es: "Fila @n · @c: @m «@v»", en: "Row @n · @c: @m “@v”" },
  campofecha: { es: "fecha", en: "date" },
  campoconcepto: { es: "concepto", en: "description" },
  campoimporte: { es: "importe", en: "amount" },
  motivovacio: { es: "vacío", en: "empty" },
  motivoinvalido: { es: "no se entiende", en: "not understood" },
  motivoexcede: { es: "demasiado grande", en: "too large" },
  motivocero: { es: "es cero", en: "is zero" },
  motivoambos: { es: "cargo y abono a la vez", en: "both debit and credit" },
  cuentaDestino: { es: "Cuenta destino", en: "Destination account" },
  sinCuenta: { es: "— Sin cuenta —", en: "— No account —" },
  guardarPerfil: { es: "Guardar estas columnas como perfil del banco", en: "Save these columns as the bank's profile" },
  nombrePerfil: { es: "Nombre del banco", en: "Bank name" },
  errNombrePerfil: { es: "Pon el nombre del banco para guardar el perfil.", en: "Enter the bank name to save the profile." },
  errPerfil: { es: "No se pudo guardar el perfil.", en: "The profile could not be saved." },
  botonImportar: { es: "Importar @n movimientos", en: "Import @n transactions" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  cerrar: { es: "Cerrar", en: "Close" },
  hecho: { es: "Se han importado @n movimientos.", en: "@n transactions were imported." },
  problemaSinCabecera: {
    es: "No se encuentra la fila de cabecera: elige las columnas por número.",
    en: "The header row cannot be found: choose the columns by number.",
  },
  problemaColumna: { es: "Falta la columna de @r.", en: "The @r column is missing." },
  elige: { es: "Elige las columnas de fecha, concepto e importe.", en: "Choose the date, description and amount columns." },
  // ES: Errores al abrir (ErrorExtracto). / EN: Opening errors (ErrorExtracto).
  "err-vacio": { es: "El fichero está vacío.", en: "The file is empty." },
  "err-grande": {
    es: "El fichero es demasiado grande (pasa de 20 MB, o es un Excel que ocupa demasiado al abrirlo).",
    en: "The file is too large (over 20 MB, or an Excel file that takes up too much once opened).",
  },
  "err-xls": {
    es: "Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o CSV.",
    en: "It is an old Excel file (.xls). Open it and save it as .xlsx or CSV.",
  },
  "err-xlsx": { es: "No se pudo leer el Excel.", en: "The Excel file could not be read." },
  "err-hoja": { es: "La hoja tiene demasiadas filas o columnas.", en: "The sheet has too many rows or columns." },
  "err-comillas": {
    es: "El CSV tiene una comilla sin cerrar en la fila @n.",
    en: "The CSV has an unclosed quote on row @n.",
  },
  "err-otro": { es: "No se pudo abrir el fichero.", en: "The file could not be opened." },
}); // prettier-ignore

// ── 2. Estado / State ────────────────────────────────────────────────────────
const f = useFinanzas();
// ES: Paso del asistente. / EN: Wizard step.
const paso = ref<"elegir" | "revisar" | "hecho">("elegir");
// ES: Fichero abierto (shallow: la matriz de un XLSX puede ser grande).
// EN: Opened file (shallow: an XLSX matrix can be large).
const fichero = shallowRef<FicheroExtracto | null>(null);
const nombreFichero = ref("");
const error = ref("");
const ocupado = ref(false);
const importados = ref(0);
// ES: Perfil guardado que se está usando (null = banco nuevo).
// EN: Saved profile in use (null = new bank).
const perfilId = ref<string | null>(null);

// ES: Configuración de lectura. Las columnas van por índice (-1 = ninguna);
//     al guardar el perfil se pasan a su nombre de cabecera.
// EN: Reading configuration. Columns go by index (-1 = none); when saving the
//     profile they are turned into their header name.
const conf = reactive({
  separador: "" as "" | SeparadorCSV,
  fecha: -1,
  concepto: -1,
  concepto2: -1,
  modo: "una" as "una" | "dos",
  importe: -1,
  cargo: -1,
  abono: -1,
  formatoFecha: "dma" as OrdenFecha,
  formatoDecimal: "coma" as FormatoDecimal,
  cuenta: "",
  manuales: false,
  guardar: true,
  nombre: "",
});

// ES: Diálogo accesible: foco atrapado y Escape cierra.
// EN: Accessible dialog: focus trap and Escape closes.
const caja = ref<HTMLElement | null>(null);
const idTitulo = useId();
useFocoAtrapado(caja, { alEscape: () => emit("cerrar") });

// ES: Texto de un error al abrir o leer. / EN: Text of an opening or reading error.
function textoError(e: unknown): string {
  if (e instanceof ErrorExtracto) {
    return t(`err-${e.codigo}`).replace("@n", String(e.fila ?? ""));
  }
  return t("err-otro");
}

// ── 3. Elegir y abrir el fichero / Picking & opening the file ────────────────
// ES: Botón «Elegir fichero»: diálogo nativo en la app; en el navegador, el
//     <input type="file"> oculto.
// EN: "Choose file" button: native dialog in the app; in the browser, the
//     hidden <input type="file">.
const inputFichero = ref<HTMLInputElement | null>(null);
async function elegir() {
  if (ocupado.value) return;
  if (!hayDialogoNativo()) {
    inputFichero.value?.click();
    return;
  }
  error.value = "";
  ocupado.value = true;
  try {
    const bytes = await elegirExtractoNativo();
    if (bytes) await cargar(bytes, "");
  } catch (e) {
    error.value = textoError(e);
  } finally {
    ocupado.value = false;
  }
}

// ES: Fichero elegido con el <input> del navegador. / EN: File picked with the browser <input>.
async function alElegirInput(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const archivo = input.files?.[0];
  input.value = "";
  if (!archivo) return;
  error.value = "";
  ocupado.value = true;
  try {
    await cargar(new Uint8Array(await archivo.arrayBuffer()), archivo.name);
  } catch (e) {
    error.value = textoError(e);
  } finally {
    ocupado.value = false;
  }
}

// ES: Abre los bytes, prepara el perfil y pasa a revisar.
// EN: Opens the bytes, prepares the profile and moves on to review.
async function cargar(bytes: Uint8Array, nombre: string) {
  const abierto = await abrirExtracto(bytes);
  // ES: Se lee ya una vez para que un CSV roto falle aquí y no en la vista.
  // EN: Read once now so a broken CSV fails here and not in the view.
  matrizDe(abierto);
  fichero.value = abierto;
  nombreFichero.value = nombre;
  conf.separador = "";
  prepararPerfil();
  paso.value = "revisar";
}

// ── 4. Matriz, cabecera y columnas / Matrix, header & columns ────────────────
// ES: Matriz leída con el separador elegido (o el error de comillas).
// EN: Matrix read with the chosen separator (or the quote error).
const lectura = computed<{ matriz: Celda[][]; error: string }>(() => {
  if (!fichero.value) return { matriz: [], error: "" };
  try {
    return { matriz: matrizDe(fichero.value, conf.separador || undefined), error: "" };
  } catch (e) {
    return { matriz: [], error: textoError(e) };
  }
});
const matriz = computed(() => lectura.value.matriz);
// ES: Fila de cabecera detectada (-1 = sin cabecera). / EN: Detected header row (-1 = no header).
const filaCabecera = computed(() => detectarCabecera(matriz.value));
const cabecera = computed<Celda[]>(() =>
  filaCabecera.value >= 0 ? (matriz.value[filaCabecera.value] ?? []) : []
);
// ES: Opciones de columna: su nombre de cabecera o «Columna N».
// EN: Column options: their header name or "Column N".
const opcionesColumna = computed(() => {
  const ancho = matriz.value.reduce((m, fila) => Math.max(m, fila.length), 0);
  return Array.from({ length: ancho }, (_, i) => {
    const c = cabecera.value[i];
    const nombre = c === null || c === undefined ? "" : String(c).trim();
    return { valor: i, texto: nombre || t("columnaN").replace("@n", String(i + 1)) };
  });
});

// ── 5. Perfil inicial (guardado o propuesto) / Initial profile (saved or proposed) ──
// ES: Índice de una referencia de columna en la cabecera actual (-1 si no está).
// EN: Index of a column reference in the current header (-1 if missing).
function indiceDe(ref: ColumnaRef | undefined): number {
  if (ref === undefined) return -1;
  return resolverColumna(filaCabecera.value >= 0 ? cabecera.value : null, ref);
}

// ES: Aplica un mapeo (de un perfil o propuesto) a la configuración.
// EN: Applies a mapping (from a profile or proposed) to the configuration.
function aplicarMapeo(m: Partial<MapeoColumnas>) {
  conf.fecha = indiceDe(m.fecha);
  const conceptos = Array.isArray(m.concepto)
    ? m.concepto
    : m.concepto !== undefined
      ? [m.concepto]
      : [];
  conf.concepto = indiceDe(conceptos[0]);
  conf.concepto2 = indiceDe(conceptos[1]);
  conf.modo = m.importe === undefined && m.cargo !== undefined ? "dos" : "una";
  conf.importe = indiceDe(m.importe);
  conf.cargo = indiceDe(m.cargo);
  conf.abono = indiceDe(m.abono);
}

// ES: Busca un perfil guardado que reconozca la cabecera; si no hay, propone
//     columnas por nombre y adivina los formatos con las primeras filas.
// EN: Looks for a saved profile that recognises the header; if none, proposes
//     columns by name and guesses the formats from the first rows.
function prepararPerfil() {
  const perfil = filaCabecera.value >= 0 ? detectarPerfil(cabecera.value, f.perfilesBanco) : null;
  if (perfil) {
    perfilId.value = perfil.id;
    conf.nombre = perfil.nombre;
    if (fichero.value?.tipo === "csv" && perfil.separador) conf.separador = perfil.separador;
    conf.formatoFecha = perfil.formatoFecha;
    conf.formatoDecimal = perfil.formatoDecimal;
    aplicarMapeo(perfil.columnas);
    return;
  }
  perfilId.value = null;
  conf.nombre = "";
  aplicarMapeo(filaCabecera.value >= 0 ? sugerirMapeo(cabecera.value) : {});
  const datos = matriz.value.slice(filaCabecera.value + 1, filaCabecera.value + 41);
  if (conf.fecha >= 0) {
    conf.formatoFecha = sugerirOrdenFecha(datos.map((fila) => fila[conf.fecha] ?? null)) ?? "dma";
  }
  // ES: Decimal: si algún importe acaba en ",dd" es coma; si en ".dd", punto.
  // EN: Decimal: if any amount ends in ",dd" it is a comma; if ".dd", a point.
  const cols = conf.modo === "una" ? [conf.importe] : [conf.cargo, conf.abono];
  const muestras = datos.flatMap((fila) => cols.map((c) => (c >= 0 ? String(fila[c] ?? "") : "")));
  if (muestras.some((m) => /,\d{1,2}$/.test(m.trim()))) conf.formatoDecimal = "coma";
  else if (muestras.some((m) => /\.\d{1,2}$/.test(m.trim()))) conf.formatoDecimal = "punto";
}

// ES: Mapeo actual en índices (null si falta algo obligatorio).
// EN: Current mapping in indexes (null if something mandatory is missing).
const mapeo = computed<MapeoColumnas | null>(() => {
  if (conf.fecha < 0 || conf.concepto < 0) return null;
  const concepto = conf.concepto2 >= 0 ? [conf.concepto, conf.concepto2] : conf.concepto;
  if (conf.modo === "una") return conf.importe < 0 ? null : { fecha: conf.fecha, concepto, importe: conf.importe };
  if (conf.cargo < 0 || conf.abono < 0) return null;
  return { fecha: conf.fecha, concepto, cargo: conf.cargo, abono: conf.abono };
}); // prettier-ignore

// ── 6. Vista previa, duplicados y selección / Preview, duplicates & selection ──
// ES: Vista previa con la fila de cabecera detectada. / EN: Preview with the detected header row.
const vista = computed(() =>
  mapeo.value
    ? crearVistaPrevia(
        matriz.value,
        {
          formatoFecha: conf.formatoFecha,
          formatoDecimal: conf.formatoDecimal,
          columnas: mapeo.value,
        },
        { filaCabecera: filaCabecera.value }
      )
    : null
);

// ES: Marcas de duplicado (utils/importador/importar.ts, marcarDuplicados):
//     con la cuenta destino elegida solo se mira esa cuenta y lo que no tiene
//     cuenta; si se pide, también lo apuntado a mano con margen de días.
// EN: Duplicate flags (utils/importador/importar.ts, marcarDuplicados): with
//     the chosen destination account only that account and unassigned items
//     are checked; if asked, also hand-entered items with a day margin.
const marcas = computed<MarcaDuplicado[]>(() => {
  const filas = vista.value?.filas ?? [];
  if (!filas.length) return [];
  return marcarDuplicados(filas, f.puntuales, {
    cuenta: conf.cuenta || undefined,
    manuales: conf.manuales,
  });
});
const marcaDe = computed(() => new Map(marcas.value.map((m) => [m.linea, m])));

// ES: Decisiones del usuario por línea (se reinician si cambia la lectura).
// EN: User decisions per line (reset if the reading changes).
const decision = ref(new Map<number, boolean>());
watch(vista, () => (decision.value = new Map()));
const seleccionadas = computed(() =>
  filasAImportar(vista.value?.filas ?? [], marcas.value, decision.value)
);
const lineasSeleccionadas = computed(() => new Set(seleccionadas.value.map((x) => x.linea)));
// ES: Marca o desmarca una fila. / EN: Ticks or unticks a row.
function cambiarFila(linea: number, incluir: boolean) {
  const m = new Map(decision.value);
  m.set(linea, incluir);
  decision.value = m;
}

// ES: Filas a pintar: primero las marcadas, de 300 en 300 ("Ver más"), para
//     no congelar la ventana con miles de filas pero poder revisarlas todas.
//     Lo mismo con los errores, de 200 en 200.
// EN: Rows to render: flagged first, 300 at a time ("Show more"), so
//     thousands of rows do not freeze the window but all can be reviewed.
//     The same with errors, 200 at a time.
const PASO_FILAS = 300;
const PASO_ERRORES = 200;
const limiteFilas = ref(PASO_FILAS);
const limiteErrores = ref(PASO_ERRORES);
watch(vista, () => {
  limiteFilas.value = PASO_FILAS;
  limiteErrores.value = PASO_ERRORES;
});
const visibles = computed<FilaImportada[]>(() => {
  const filas = vista.value?.filas ?? [];
  const marcadas = filas.filter((x) => marcaDe.value.has(x.linea));
  const resto = filas.filter((x) => !marcaDe.value.has(x.linea));
  return [...marcadas, ...resto].slice(0, limiteFilas.value);
});

// ES: Categoría que pondrán las reglas a una fila. / EN: Category the rules will give a row.
function categoriaDe(x: FilaImportada): string {
  return categorizar(x.concepto, x.signo, f.reglas)?.categoria ?? "Otros";
}

// ES: Texto de un error de fila. / EN: Text of a row error.
function textoErrorFila(e: ErrorFila): string {
  return t("errorFila")
    .replace("@n", String(e.linea))
    .replace("@c", t(`campo${e.campo}`))
    .replace("@m", t(`motivo${e.motivo}`))
    .replace("@v", e.valor);
}

// ES: Problema que impide leer (sin cabecera, columna que falta…).
// EN: Problem that prevents reading (no header, missing column…).
const problema = computed(() => {
  if (lectura.value.error) return lectura.value.error;
  if (!mapeo.value) return t("elige");
  const p = vista.value?.problema;
  if (!p) return "";
  if (p.tipo === "sinCabecera") return t("problemaSinCabecera");
  return t("problemaColumna").replace("@r", p.rol);
});

// ES: Resumen de la lectura. / EN: Reading summary.
const textoResumen = computed(() =>
  t("resumen")
    .replace("@f", String(vista.value?.filas.length ?? 0))
    .replace("@s", String(seleccionadas.value.length))
    .replace("@d", String(marcas.value.length))
    .replace("@e", String(new Set(vista.value?.errores.map((e) => e.linea) ?? []).size))
);

// ── 7. Importar y guardar el perfil / Import & save the profile ──────────────
// ES: Índice -> referencia para el perfil: el nombre de la cabecera si existe
//     y es único; si no, el índice.
// EN: Index -> reference for the profile: the header name if it exists and is
//     unique; otherwise the index.
function referencia(i: number): ColumnaRef {
  const c = cabecera.value[i];
  const nombre = c === null || c === undefined || c instanceof Date ? "" : String(c).trim();
  if (!nombre) return i;
  const n = normalizarTexto(nombre);
  const repetido = cabecera.value.filter((x) => typeof x === "string" && normalizarTexto(x) === n);
  return repetido.length === 1 ? nombre : i;
}

// ES: Crea los apuntes y, si se pidió, guarda el perfil del banco.
// EN: Creates the entries and, if asked, saves the bank profile.
function importar() {
  const m = mapeo.value;
  if (!m || !seleccionadas.value.length) return;
  if (conf.guardar) {
    if (!conf.nombre.trim()) return (error.value = t("errNombrePerfil"));
    const aRef = (r: ColumnaRef) => referencia(r as number);
    const columnas: MapeoColumnas = {
      fecha: aRef(m.fecha),
      concepto: Array.isArray(m.concepto) ? m.concepto.map(aRef) : aRef(m.concepto),
      ...(m.importe !== undefined
        ? { importe: aRef(m.importe) }
        : { cargo: aRef(m.cargo!), abono: aRef(m.abono!) }),
    };
    const id = f.guardarPerfil({
      ...(perfilId.value ? { id: perfilId.value } : {}),
      nombre: conf.nombre,
      ...(fichero.value?.tipo === "csv" && conf.separador ? { separador: conf.separador } : {}),
      formatoFecha: conf.formatoFecha,
      formatoDecimal: conf.formatoDecimal,
      columnas,
      ...(filaCabecera.value >= 0 ? { firma: crearFirma(cabecera.value) } : {}),
    });
    if (!id) return (error.value = t("errPerfil"));
  }
  importados.value = f.importarFilas(seleccionadas.value, { cuenta: conf.cuenta || undefined });
  emit("importado", importados.value);
  paso.value = "hecho";
}
</script>

<template>
  <!-- ES: Capa oscura; clic fuera cierra. / EN: Dim overlay; click outside closes. -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    @click.self="emit('cerrar')"
  >
    <div
      ref="caja"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="idTitulo"
      class="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-surface border border-border p-6 shadow-2xl"
    >
      <h2 :id="idTitulo" class="font-display text-xl font-bold">{{ t("titulo") }}</h2>

      <!-- ES: Paso 1: elegir fichero. / EN: Step 1: pick a file. -->
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <p v-if="paso === 'elegir'" class="w-full text-sm text-muted">{{ t("intro") }}</p>
        <button
          v-if="paso !== 'hecho'"
          type="button"
          class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-ink font-medium hover:border-brand disabled:opacity-50"
          :disabled="ocupado"
          @click="elegir"
        >
          {{ ocupado ? t("leyendo") : paso === "revisar" ? t("elegirOtro") : t("elegir") }}
        </button>
        <span v-if="nombreFichero && paso === 'revisar'" class="text-sm text-faint truncate">{{
          nombreFichero
        }}</span>
        <!-- ES: Selector del navegador (oculto; lo abre el botón). / EN: Browser picker (hidden; the button opens it). -->
        <label :for="`${uid}-fichero`" class="sr-only">{{ t("ficheroLabel") }}</label>
        <input
          :id="`${uid}-fichero`"
          ref="inputFichero"
          type="file"
          accept=".csv,.txt,.tsv,.xlsx"
          class="hidden"
          tabindex="-1"
          @change="alElegirInput"
        />
      </div>
      <p v-if="error" role="alert" class="mt-2 text-sm text-danger">{{ error }}</p>

      <!-- ES: Paso 2-3: columnas y vista previa. / EN: Steps 2-3: columns and preview. -->
      <template v-if="paso === 'revisar'">
        <p class="mt-3 text-sm" :class="perfilId ? 'text-ok' : 'text-muted'">
          {{ perfilId ? t("perfilDetectado").replace("@p", conf.nombre) : t("perfilNuevo") }}
        </p>

        <fieldset class="mt-3 rounded-lg border border-border p-3">
          <legend class="px-1 text-sm text-muted">{{ t("columnas") }}</legend>
          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <label :for="`${uid}-fecha`" class="text-xs text-muted">{{ t("colFecha") }}</label>
              <select :id="`${uid}-fecha`" v-model.number="conf.fecha" class="campo">
                <option :value="-1">{{ t("ninguna") }}</option>
                <option v-for="o in opcionesColumna" :key="o.valor" :value="o.valor">
                  {{ o.texto }}
                </option>
              </select>
            </div>
            <div>
              <label :for="`${uid}-concepto`" class="text-xs text-muted">{{
                t("colConcepto")
              }}</label>
              <select :id="`${uid}-concepto`" v-model.number="conf.concepto" class="campo">
                <option :value="-1">{{ t("ninguna") }}</option>
                <option v-for="o in opcionesColumna" :key="o.valor" :value="o.valor">
                  {{ o.texto }}
                </option>
              </select>
            </div>
            <div>
              <label :for="`${uid}-concepto2`" class="text-xs text-muted">{{
                t("colConcepto2")
              }}</label>
              <select :id="`${uid}-concepto2`" v-model.number="conf.concepto2" class="campo">
                <option :value="-1">{{ t("ninguna") }}</option>
                <option v-for="o in opcionesColumna" :key="o.valor" :value="o.valor">
                  {{ o.texto }}
                </option>
              </select>
            </div>
            <div>
              <label :for="`${uid}-modo`" class="text-xs text-muted">{{ t("modoImporte") }}</label>
              <select :id="`${uid}-modo`" v-model="conf.modo" class="campo">
                <option value="una">{{ t("modoUna") }}</option>
                <option value="dos">{{ t("modoDos") }}</option>
              </select>
            </div>
            <div v-if="conf.modo === 'una'">
              <label :for="`${uid}-importe`" class="text-xs text-muted">{{
                t("colImporte")
              }}</label>
              <select :id="`${uid}-importe`" v-model.number="conf.importe" class="campo">
                <option :value="-1">{{ t("ninguna") }}</option>
                <option v-for="o in opcionesColumna" :key="o.valor" :value="o.valor">
                  {{ o.texto }}
                </option>
              </select>
            </div>
            <template v-else>
              <div>
                <label :for="`${uid}-cargo`" class="text-xs text-muted">{{ t("colCargo") }}</label>
                <select :id="`${uid}-cargo`" v-model.number="conf.cargo" class="campo">
                  <option :value="-1">{{ t("ninguna") }}</option>
                  <option v-for="o in opcionesColumna" :key="o.valor" :value="o.valor">
                    {{ o.texto }}
                  </option>
                </select>
              </div>
              <div>
                <label :for="`${uid}-abono`" class="text-xs text-muted">{{ t("colAbono") }}</label>
                <select :id="`${uid}-abono`" v-model.number="conf.abono" class="campo">
                  <option :value="-1">{{ t("ninguna") }}</option>
                  <option v-for="o in opcionesColumna" :key="o.valor" :value="o.valor">
                    {{ o.texto }}
                  </option>
                </select>
              </div>
            </template>
            <div>
              <label :for="`${uid}-ffecha`" class="text-xs text-muted">{{
                t("formatoFecha")
              }}</label>
              <select :id="`${uid}-ffecha`" v-model="conf.formatoFecha" class="campo">
                <option value="dma">{{ t("dma") }}</option>
                <option value="amd">{{ t("amd") }}</option>
              </select>
            </div>
            <div>
              <label :for="`${uid}-fdecimal`" class="text-xs text-muted">{{
                t("formatoDecimal")
              }}</label>
              <select :id="`${uid}-fdecimal`" v-model="conf.formatoDecimal" class="campo">
                <option value="coma">{{ t("coma") }}</option>
                <option value="punto">{{ t("punto") }}</option>
              </select>
            </div>
            <div v-if="fichero?.tipo === 'csv'">
              <label :for="`${uid}-sep`" class="text-xs text-muted">{{ t("separador") }}</label>
              <select :id="`${uid}-sep`" v-model="conf.separador" class="campo">
                <option value="">{{ t("sepAuto") }}</option>
                <option value=";">{{ t("sepPuntoComa") }}</option>
                <option value=",">{{ t("sepComa") }}</option>
                <option :value="'\t'">{{ t("sepTab") }}</option>
              </select>
            </div>
          </div>
        </fieldset>

        <!-- ES: Vista previa. / EN: Preview. -->
        <section class="mt-4" :aria-label="t('vistaPrevia')">
          <p v-if="problema" role="alert" class="text-sm text-danger">{{ problema }}</p>
          <template v-else-if="vista">
            <p class="text-sm text-muted" aria-live="polite">{{ textoResumen }}</p>
            <p v-if="vista.ignoradas" class="text-xs text-faint">
              {{ t("ignoradas").replace("@n", String(vista.ignoradas)) }}
            </p>
            <label class="mt-2 flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input v-model="conf.manuales" type="checkbox" class="accent-brand" />
              {{ t("manuales") }}
            </label>

            <div class="mt-3 overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <caption class="sr-only">
                  {{
                    t("vistaPrevia")
                  }}
                </caption>
                <thead class="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th scope="col" class="px-2 py-2">{{ t("importar") }}</th>
                    <th scope="col" class="px-2 py-2">{{ t("thFecha") }}</th>
                    <th scope="col" class="px-2 py-2">{{ t("thConcepto") }}</th>
                    <th scope="col" class="px-2 py-2 text-right">{{ t("thImporte") }}</th>
                    <th scope="col" class="px-2 py-2">{{ t("thCategoria") }}</th>
                    <th scope="col" class="px-2 py-2">{{ t("thAviso") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="x in visibles" :key="x.linea" class="border-t border-border">
                    <td class="px-2 py-1.5">
                      <input
                        type="checkbox"
                        class="accent-brand"
                        :checked="lineasSeleccionadas.has(x.linea)"
                        :aria-label="t('incluirFila').replace('@n', String(x.linea))"
                        @change="cambiarFila(x.linea, ($event.target as HTMLInputElement).checked)"
                      />
                    </td>
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ fechaLegible(x.fecha) }}</td>
                    <td class="px-2 py-1.5 max-w-xs truncate" :title="x.concepto">
                      {{ x.concepto }}
                    </td>
                    <td
                      class="px-2 py-1.5 text-right whitespace-nowrap"
                      :class="x.signo === 'ingreso' ? 'text-ok' : 'text-ink'"
                    >
                      {{ x.signo === "ingreso" ? "+" : "−" }}{{ euro(x.importe) }}
                    </td>
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ categoriaDe(x) }}</td>
                    <td class="px-2 py-1.5 whitespace-nowrap text-xs">
                      <span
                        v-if="marcaDe.get(x.linea)?.tipo === 'apuntado'"
                        class="rounded-full bg-danger/15 text-danger px-2 py-0.5"
                        >{{ t("marcaApuntado") }}</span
                      >
                      <span
                        v-else-if="marcaDe.get(x.linea)?.tipo === 'fichero'"
                        class="rounded-full bg-brand/15 text-brand px-2 py-0.5"
                        >{{ t("marcaFichero") }}</span
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p
              v-if="vista.filas.length > visibles.length"
              class="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint"
            >
              {{
                t("masFilas")
                  .replace("@v", String(visibles.length))
                  .replace("@t", String(vista.filas.length))
              }}
              <button
                type="button"
                class="rounded border border-border px-2 py-0.5 text-ink hover:border-brand"
                @click="limiteFilas += PASO_FILAS"
              >
                {{ t("verMas") }}
              </button>
            </p>

            <!-- ES: Filas con errores. / EN: Rows with errors. -->
            <details v-if="vista.errores.length" class="mt-3 text-sm">
              <summary class="cursor-pointer text-danger">
                {{ t("errores") }} ({{ vista.errores.length }})
              </summary>
              <ul class="mt-2 space-y-1 text-xs text-muted">
                <li v-for="(e, i) in vista.errores.slice(0, limiteErrores)" :key="i">
                  {{ textoErrorFila(e) }}
                </li>
              </ul>
              <button
                v-if="vista.errores.length > limiteErrores"
                type="button"
                class="mt-1 rounded border border-border px-2 py-0.5 text-xs text-ink hover:border-brand"
                @click="limiteErrores += PASO_ERRORES"
              >
                {{ t("verMas") }}
              </button>
            </details>

            <!-- ES: Cuenta destino y perfil. / EN: Destination account and profile. -->
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label :for="`${uid}-cuenta`" class="text-xs text-muted">{{
                  t("cuentaDestino")
                }}</label>
                <select :id="`${uid}-cuenta`" v-model="conf.cuenta" class="campo">
                  <option value="">{{ t("sinCuenta") }}</option>
                  <option v-for="c in f.cuentas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
              </div>
              <div>
                <label class="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input v-model="conf.guardar" type="checkbox" class="accent-brand" />
                  {{ t("guardarPerfil") }}
                </label>
                <template v-if="conf.guardar">
                  <label :for="`${uid}-nombre`" class="sr-only">{{ t("nombrePerfil") }}</label>
                  <input
                    :id="`${uid}-nombre`"
                    v-model="conf.nombre"
                    type="text"
                    :placeholder="t('nombrePerfil')"
                    class="campo"
                  />
                </template>
              </div>
            </div>
          </template>
        </section>
      </template>

      <!-- ES: Paso 4: hecho. / EN: Step 4: done. -->
      <p v-if="paso === 'hecho'" role="status" class="mt-4 text-ok">
        {{ t("hecho").replace("@n", String(importados)) }}
      </p>

      <!-- ES: Botones. / EN: Buttons. -->
      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-muted hover:text-ink"
          @click="emit('cerrar')"
        >
          {{ paso === "hecho" ? t("cerrar") : t("cancelar") }}
        </button>
        <button
          v-if="paso === 'revisar'"
          type="button"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft disabled:opacity-50"
          :disabled="!seleccionadas.length || !!problema"
          @click="importar"
        >
          {{ t("botonImportar").replace("@n", String(seleccionadas.length)) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ES: Estilo común de los selects y campos del asistente.
   EN: Shared style of the wizard's selects and inputs. */
.campo {
  margin-top: 0.25rem;
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  padding: 0.375rem 0.75rem;
  color: var(--color-ink);
  outline: none;
}
.campo:focus {
  border-color: var(--color-brand);
}
</style>
