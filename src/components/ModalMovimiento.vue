<script setup lang="ts">
/* Modal para añadir o EDITAR un movimiento: gasto/ingreso, fijo (recurrente) o
   variable (puntual). Emite 'guardar' con los datos ya normalizados y 'cerrar'.
   Si recibe la prop `inicial`, el formulario se PRECARGA con esos valores y el
   modal pasa a modo edición. Los fijos pueden llevar un "día de pago" (1-31). */
import { ref, reactive, computed } from "vue";
import { categoriasPorGrupo, NOMBRES_CATEGORIA } from "../data/categorias";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import { crearT } from "../i18n";
import type { Signo, Subdivision } from "../types";

// Diccionario de textos visibles del modal (ES/EN). t("clave") devuelve el
// idioma activo según la store de ajustes; la UI se re-renderiza al cambiarlo.
const t = crearT({
  tituloEditar: { es: "Editar movimiento", en: "Edit transaction" },
  tituloNuevo: { es: "Nuevo movimiento", en: "New transaction" },
  tipo: { es: "Tipo", en: "Type" },
  // Opciones del <select> de clase (gasto/ingreso, fijo/variable)
  gastoVariable: { es: "Gasto variable", en: "Variable expense" },
  gastoFijo: { es: "Gasto fijo (cada mes)", en: "Fixed expense (monthly)" },
  ingresoPuntual: { es: "Ingreso puntual", en: "One-off income" },
  ingresoFijo: { es: "Ingreso fijo (cada mes)", en: "Fixed income (monthly)" },
  concepto: { es: "Concepto", en: "Description" },
  conceptoPlaceholder: { es: "Ej. Supermercado", en: "E.g. Groceries" },
  importe: { es: "Importe (€)", en: "Amount (€)" },
  fecha: { es: "Fecha", en: "Date" },
  diaPago: { es: "Día de pago (1-31)", en: "Payment day (1-31)" },
  diaPagoPlaceholder: { es: "Ej. 5", en: "E.g. 5" },
  categoria: { es: "Categoría", en: "Category" },
  comercio: { es: "Comercio (opcional)", en: "Merchant (optional)" },
  comercioPlaceholder: { es: "Ej. Mercadona", en: "E.g. Mercadona" },
  etiquetas: { es: "Etiquetas (opcional)", en: "Tags (optional)" },
  etiquetasPlaceholder: { es: "Ej. vacaciones, regalo", en: "E.g. holidays, gift" },
  etiquetasAyuda: { es: "Sepáralas con comas.", en: "Separate them with commas." },
  cuenta: { es: "Cuenta (opcional)", en: "Account (optional)" },
  sinCuenta: { es: "— Sin cuenta —", en: "— No account —" },
  dividirEnCategorias: { es: "Dividir en categorías", en: "Split into categories" },
  quitarParte: { es: "Quitar parte", en: "Remove part" },
  anadirParte: { es: "+ añadir parte", en: "+ add part" },
  totalDividido: { es: "Total dividido", en: "Split total" },
  recibo: { es: "Recibo (opcional)", en: "Receipt (optional)" },
  reciboAlt: { es: "Recibo", en: "Receipt" },
  quitar: { es: "Quitar", en: "Remove" },
  avisoFijos: {
    es: "Los fijos se repiten automáticamente en todos los meses desde hoy.",
    en: "Fixed transactions repeat automatically every month from today.",
  },
  cancelar: { es: "Cancelar", en: "Cancel" },
  guardar: { es: "Guardar", en: "Save" },
  // Mensajes de validación mostrados al usuario
  errConcepto: { es: "Pon un concepto", en: "Enter a description" },
  errPartes: {
    es: "Añade al menos 2 partes con importe mayor que 0",
    en: "Add at least 2 parts with an amount greater than 0",
  },
  errImporte: {
    es: "El importe debe ser mayor que 0",
    en: "The amount must be greater than 0",
  },
  errFecha: { es: "Pon una fecha válida", en: "Enter a valid date" },
});

// Forma de los datos iniciales para precargar el formulario en modo edición.
interface MovimientoInicial {
  recurrente: boolean;
  signo: Signo;
  concepto: string;
  importe: number;
  categoria: string;
  fecha: string;
  diaPago?: number;
  comercio?: string; // dónde se hizo (texto libre); opcional
  tags?: string[]; // etiquetas; en el form se editan como texto separado por comas
  recibo?: string; // imagen del recibo en base64 (solo gastos puntuales)
  cuenta?: string; // id de la cuenta a la que pertenece; opcional
  subdivisiones?: Subdivision[]; // gasto dividido en varias categorías; opcional
}

const props = defineProps<{
  // Si viene, el modal se abre en modo edición precargado con estos valores.
  inicial?: MovimientoInicial;
}>();

const emit = defineEmits<{
  guardar: [
    mov: {
      recurrente: boolean; // true = gasto/ingreso fijo (se repite cada mes)
      signo: Signo;
      concepto: string;
      importe: number;
      categoria: string;
      fecha: string; // "YYYY-MM-DD" (solo se usa si es puntual)
      diaPago?: number; // día del mes (1-31) para fijos; opcional
      comercio?: string; // dónde se hizo; opcional (undefined si vacío)
      tags?: string[]; // etiquetas ya normalizadas (array, sin vacíos)
      recibo?: string; // imagen del recibo en base64 (solo puntuales); opcional
      cuenta?: string; // id de la cuenta a la que pertenece; opcional (undefined si vacío)
      subdivisiones?: Subdivision[]; // partes del gasto dividido (solo gasto puntual); opcional
    }
  ];
  cerrar: [];
}>();

// Las 4 "clases" de alta, que se traducen a recurrente + signo.
const CLASES = [
  { valor: "gasto-variable", etiqueta: "Gasto variable", recurrente: false, signo: "gasto" as Signo },
  { valor: "gasto-fijo", etiqueta: "Gasto fijo (cada mes)", recurrente: true, signo: "gasto" as Signo },
  { valor: "ingreso-puntual", etiqueta: "Ingreso puntual", recurrente: false, signo: "ingreso" as Signo },
  { valor: "ingreso-fijo", etiqueta: "Ingreso fijo (cada mes)", recurrente: true, signo: "ingreso" as Signo },
];

// Deriva la "clase" (valor del select) a partir de recurrente + signo.
function claseDesde(recurrente: boolean, signo: Signo): string {
  const c = CLASES.find((x) => x.recurrente === recurrente && x.signo === signo);
  return c ? c.valor : "gasto-variable";
}

// Mapea el `valor` de cada clase a su clave de traducción, para mostrar la
// etiqueta del <select> en el idioma activo sin tocar la lógica de CLASES.
const CLAVE_CLASE: Record<string, string> = {
  "gasto-variable": "gastoVariable",
  "gasto-fijo": "gastoFijo",
  "ingreso-puntual": "ingresoPuntual",
  "ingreso-fijo": "ingresoFijo",
};

// Grupos de categorías para el <select> con <optgroup>.
// El modal se monta con v-if cada vez que se abre, así que este setup se
// re-ejecuta en cada apertura y categoriasPorGrupo() lee las personalizadas
// (localStorage) frescas, incluyendo el grupo "Personalizadas" si existe.
const grupos = categoriasPorGrupo();
const f = useFinanzas();
// Fecha por defecto: día de hoy ACOTADO al último día del mes que se está viendo
// (evita fechas inválidas tipo "2026-02-31" que dejarían el apunte huérfano).
const [aSel, mSel] = f.mesSeleccionado.split("-").map(Number);
const ultimoDia = new Date(aSel, mSel, 0).getDate();
const diaDef = Math.min(new Date().getDate(), ultimoDia);
const hoy = `${f.mesSeleccionado}-${String(diaDef).padStart(2, "0")}`;

// Estamos editando si nos han pasado datos iniciales.
const esEdicion = computed(() => props.inicial != null);

// Estado del formulario: precargado si hay `inicial`, valores por defecto si no.
const form = reactive({
  clase: props.inicial
    ? claseDesde(props.inicial.recurrente, props.inicial.signo)
    : "gasto-variable",
  concepto: props.inicial?.concepto ?? "",
  importe: (props.inicial ? props.inicial.importe : "") as string | number,
  categoria: props.inicial?.categoria ?? "Supermercado",
  fecha: props.inicial?.fecha ?? hoy,
  // Día de pago para fijos: number si viene, "" si no (input number vacío).
  diaPago: (props.inicial?.diaPago ?? "") as number | "",
  // Comercio: texto libre opcional.
  comercio: props.inicial?.comercio ?? "",
  // Etiquetas: en el form son TEXTO (separadas por comas). Si vienen como array
  // en `inicial`, las unimos con ", " para que el usuario pueda editarlas.
  tagsTexto: props.inicial?.tags ? props.inicial.tags.join(", ") : "",
  // Recibo: data URL base64 (solo gastos puntuales). "" = sin recibo.
  recibo: props.inicial?.recibo ?? "",
  // Cuenta/monedero al que pertenece el movimiento. "" = sin cuenta.
  cuenta: props.inicial?.cuenta ?? "",
});

// --- Gasto dividido (split en varias categorías; solo gastos puntuales) ---
// Activo si venimos editando un movimiento que ya traía subdivisiones.
const dividido = ref<boolean>(
  Array.isArray(props.inicial?.subdivisiones) && props.inicial!.subdivisiones!.length > 0
);
// Partes del gasto dividido. En el form el importe es texto (acepta coma decimal);
// se normaliza a number al guardar. Precarga desde inicial si las trae.
const partes = reactive<{ categoria: string; importe: string }[]>(
  props.inicial?.subdivisiones?.length
    ? props.inicial.subdivisiones.map((s) => ({ categoria: s.categoria, importe: String(s.importe) }))
    : [
        // Por defecto arrancamos con 2 filas vacías (mínimo válido).
        { categoria: NOMBRES_CATEGORIA[0], importe: "" },
        { categoria: NOMBRES_CATEGORIA[0], importe: "" },
      ]
);

// Lista de nombres de categoría para los <select> de cada parte.
const nombresCategoria = NOMBRES_CATEGORIA;

const error = ref("");

// Convierte un texto con coma/punto decimal a número redondeado a céntimos.
// Devuelve 0 si no es un número válido.
function aImporte(txt: string): number {
  const n = Number(String(txt).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// Añade una parte vacía al gasto dividido.
function anadirParte() {
  partes.push({ categoria: NOMBRES_CATEGORIA[0], importe: "" });
}

// Quita la parte indicada (mantenemos al menos 2 filas para no romper el mínimo).
function quitarParte(i: number) {
  if (partes.length > 2) partes.splice(i, 1);
}

// Suma de las partes del gasto dividido (number, céntimos).
const sumaPartes = computed(() =>
  Math.round(partes.reduce((acc, p) => acc + aImporte(p.importe), 0) * 100) / 100
);

// Lee el fichero de imagen elegido, lo REDIMENSIONA con canvas (máx 800px en el
// lado mayor) y lo exporta a JPEG calidad 0.7 como data URL base64. Redimensionar
// evita inflar el almacenamiento cifrado con fotos enormes del móvil.
function onRecibo(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Calcula el factor de escala para que el lado mayor sea como mucho 800px.
      const max = 800;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * escala);
      const h = Math.round(img.height * escala);
      // Dibuja la imagen redimensionada en un canvas y la exporta a JPEG 0.7.
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      form.recibo = canvas.toDataURL("image/jpeg", 0.7);
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

// Quita el recibo cargado (vuelve a "sin recibo").
function quitarRecibo() {
  form.recibo = "";
}

const claseActual = computed(() => CLASES.find((c) => c.valor === form.clase)!);
const esRecurrente = computed(() => claseActual.value.recurrente);
// El gasto dividido SOLO aplica a gastos puntuales (signo gasto y NO recurrente).
const esGastoPuntual = computed(
  () => !claseActual.value.recurrente && claseActual.value.signo === "gasto"
);

function guardar() {
  if (!form.concepto.trim()) return (error.value = t("errConcepto"));

  // ¿Está activo el modo dividido? Solo tiene sentido en gastos puntuales.
  const usandoDividido = esGastoPuntual.value && dividido.value;

  // Cálculo del importe:
  //  - dividido -> es la SUMA de las partes (se ignora el input normal).
  //  - normal -> el input de importe (acepta coma decimal).
  const importe = usandoDividido
    ? sumaPartes.value
    : Math.round(Number(String(form.importe).replace(",", ".")) * 100) / 100;

  // Validación del gasto dividido: al menos 2 partes con importe > 0.
  if (usandoDividido) {
    const validas = partes.filter((p) => aImporte(p.importe) > 0);
    if (validas.length < 2)
      return (error.value = t("errPartes"));
  }

  if (!importe || importe <= 0) return (error.value = t("errImporte"));
  if (!esRecurrente.value && !form.fecha) return (error.value = t("errFecha"));

  // Día de pago: solo para fijos y solo si se ha rellenado (si no, undefined).
  const diaPago =
    esRecurrente.value && form.diaPago !== "" ? Number(form.diaPago) : undefined;

  // Comercio: undefined si está vacío (no guardamos cadenas en blanco).
  const comercio = form.comercio.trim() || undefined;

  // Etiquetas: del texto separado por comas a array (trim + sin vacíos).
  // undefined si no queda ninguna etiqueta válida.
  const tagsArr = form.tagsTexto
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const tags = tagsArr.length > 0 ? tagsArr : undefined;

  // Recibo: solo tiene sentido en puntuales y solo si hay imagen cargada.
  const recibo = !esRecurrente.value && form.recibo ? form.recibo : undefined;

  // Cuenta: undefined si no se ha elegido ninguna (no guardamos "").
  const cuenta = form.cuenta || undefined;

  // Subdivisiones: solo si está activo el modo dividido (gasto puntual).
  // Normaliza cada parte a number y descarta las que queden a 0.
  const subdivisiones = usandoDividido
    ? partes
        .map((p) => ({ categoria: p.categoria, importe: aImporte(p.importe) }))
        .filter((p) => p.importe > 0)
    : undefined;

  emit("guardar", {
    recurrente: claseActual.value.recurrente,
    signo: claseActual.value.signo,
    concepto: form.concepto.trim(),
    importe,
    categoria: form.categoria,
    fecha: form.fecha,
    diaPago,
    comercio,
    tags,
    recibo,
    cuenta,
    subdivisiones,
  });
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click.self="emit('cerrar')"
  >
    <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl">
      <!-- Título según el modo (edición vs alta) -->
      <h2 class="font-display text-xl font-bold mb-4">
        {{ esEdicion ? t("tituloEditar") : t("tituloNuevo") }}
      </h2>

      <div class="space-y-3">
        <div>
          <label class="text-muted text-sm">{{ t("tipo") }}</label>
          <select
            v-model="form.clase"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option v-for="c in CLASES" :key="c.valor" :value="c.valor">{{ t(CLAVE_CLASE[c.valor]) }}</option>
          </select>
        </div>

        <div>
          <label class="text-muted text-sm">{{ t("concepto") }}</label>
          <input
            v-model="form.concepto"
            type="text"
            :placeholder="t('conceptoPlaceholder')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <label class="text-muted text-sm">{{ t("importe") }}</label>
            <!-- Si el gasto está dividido, el importe es la SUMA de las partes:
                 mostramos esa suma y deshabilitamos el input manual. -->
            <input
              v-if="esGastoPuntual && dividido"
              :value="euro(sumaPartes)"
              type="text"
              disabled
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-muted outline-none opacity-60 cursor-not-allowed"
            />
            <input
              v-else
              v-model="form.importe"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
          <!-- La fecha solo importa en los movimientos puntuales -->
          <div v-if="!esRecurrente" class="flex-1">
            <label class="text-muted text-sm">{{ t("fecha") }}</label>
            <input
              v-model="form.fecha"
              type="date"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
          <!-- Día de pago: solo para fijos (recurrentes), opcional -->
          <div v-if="esRecurrente" class="flex-1">
            <label class="text-muted text-sm">{{ t("diaPago") }}</label>
            <input
              v-model="form.diaPago"
              type="number"
              min="1"
              max="31"
              :placeholder="t('diaPagoPlaceholder')"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        <div>
          <label class="text-muted text-sm">{{ t("categoria") }}</label>
          <select
            v-model="form.categoria"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <optgroup v-for="g in grupos" :key="g.grupo" :label="g.grupo">
              <option v-for="c in g.items" :key="c" :value="c">{{ c }}</option>
            </optgroup>
          </select>
        </div>

        <!-- Comercio: texto libre opcional (Mercadona, Amazon…) -->
        <div>
          <label class="text-muted text-sm">{{ t("comercio") }}</label>
          <input
            v-model="form.comercio"
            type="text"
            :placeholder="t('comercioPlaceholder')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Etiquetas: texto separado por comas; se convierte a array al guardar -->
        <div>
          <label class="text-muted text-sm">{{ t("etiquetas") }}</label>
          <input
            v-model="form.tagsTexto"
            type="text"
            :placeholder="t('etiquetasPlaceholder')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <p class="text-faint text-xs mt-1">{{ t("etiquetasAyuda") }}</p>
        </div>

        <!-- Cuenta/monedero: opcional, para puntuales y recurrentes -->
        <div>
          <label class="text-muted text-sm">{{ t("cuenta") }}</label>
          <select
            v-model="form.cuenta"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <!-- Opción vacía = sin cuenta asignada -->
            <option value="">{{ t("sinCuenta") }}</option>
            <!-- Una opción por cada cuenta del store (value = id) -->
            <option v-for="c in f.cuentas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>

        <!-- Gasto dividido: SOLO para gastos puntuales (signo gasto, no recurrente) -->
        <div v-if="esGastoPuntual" class="rounded-lg border border-border p-3 space-y-3">
          <!-- Toggle para activar/desactivar el reparto en categorías -->
          <label class="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input v-model="dividido" type="checkbox" class="accent-brand" />
            {{ t("dividirEnCategorias") }}
          </label>

          <!-- Filas dinámicas: una por cada parte del gasto -->
          <template v-if="dividido">
            <div v-for="(p, i) in partes" :key="i" class="flex gap-2">
              <!-- Categoría de la parte -->
              <select
                v-model="p.categoria"
                class="flex-1 rounded-lg bg-surface-2 border border-border px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
              >
                <option v-for="n in nombresCategoria" :key="n" :value="n">{{ n }}</option>
              </select>
              <!-- Importe de la parte (acepta coma decimal) -->
              <input
                v-model="p.importe"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                class="w-24 rounded-lg bg-surface-2 border border-border px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
              />
              <!-- Quitar esta parte (solo si quedan más de 2) -->
              <button
                type="button"
                class="px-2 text-faint hover:text-danger transition-colors disabled:opacity-30"
                :disabled="partes.length <= 2"
                :title="t('quitarParte')"
                @click="quitarParte(i)"
              >
                ✕
              </button>
            </div>

            <!-- Añadir una parte nueva -->
            <button
              type="button"
              class="text-sm text-brand hover:text-brand-soft transition-colors"
              @click="anadirParte"
            >
              {{ t("anadirParte") }}
            </button>

            <!-- Suma de las partes (es el importe real del movimiento) -->
            <p class="text-faint text-xs">{{ t("totalDividido") }}: {{ euro(sumaPartes) }}</p>
          </template>
        </div>

        <!-- Recibo: SOLO para puntuales (no recurrentes). Imagen redimensionada -->
        <div v-if="!esRecurrente">
          <label class="text-muted text-sm">{{ t("recibo") }}</label>
          <!-- Si aún no hay imagen, mostramos el selector de fichero -->
          <input
            v-if="!form.recibo"
            type="file"
            accept="image/*"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1 file:text-white"
            @change="onRecibo"
          />
          <!-- Si ya hay imagen, miniatura + botón para quitarla -->
          <div v-else class="mt-1 flex items-center gap-3">
            <img :src="form.recibo" :alt="t('reciboAlt')" class="h-20 w-20 rounded-lg object-cover border border-border" />
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1 text-sm text-muted hover:text-danger transition-colors"
              @click="quitarRecibo"
            >
              {{ t("quitar") }}
            </button>
          </div>
        </div>

        <p v-if="esRecurrente" class="text-faint text-xs">
          {{ t("avisoFijos") }}
        </p>
        <p v-if="error" class="text-danger text-sm">{{ error }}</p>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          class="flex-1 rounded-lg border border-border px-4 py-2 text-muted hover:text-ink transition-colors"
          @click="emit('cerrar')"
        >
          {{ t("cancelar") }}
        </button>
        <button
          class="flex-1 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="guardar"
        >
          {{ t("guardar") }}
        </button>
      </div>
    </div>
  </div>
</template>
