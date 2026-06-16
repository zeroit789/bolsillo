<script setup lang="ts">
/* Modal para añadir o EDITAR un movimiento: gasto/ingreso, fijo (recurrente) o
   variable (puntual). Emite 'guardar' con los datos ya normalizados y 'cerrar'.
   Si recibe la prop `inicial`, el formulario se PRECARGA con esos valores y el
   modal pasa a modo edición. Los fijos pueden llevar un "día de pago" (1-31). */
import { ref, reactive, computed } from "vue";
import { categoriasPorGrupo } from "../data/categorias";
import { useFinanzas } from "../stores/finanzas";
import type { Signo } from "../types";

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
});
const error = ref("");

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

function guardar() {
  // Acepta coma decimal española y redondea a 2 decimales (céntimos).
  const importe = Math.round(Number(String(form.importe).replace(",", ".")) * 100) / 100;
  if (!form.concepto.trim()) return (error.value = "Pon un concepto");
  if (!importe || importe <= 0) return (error.value = "El importe debe ser mayor que 0");
  if (!esRecurrente.value && !form.fecha) return (error.value = "Pon una fecha válida");

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
        {{ esEdicion ? "Editar movimiento" : "Nuevo movimiento" }}
      </h2>

      <div class="space-y-3">
        <div>
          <label class="text-muted text-sm">Tipo</label>
          <select
            v-model="form.clase"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option v-for="c in CLASES" :key="c.valor" :value="c.valor">{{ c.etiqueta }}</option>
          </select>
        </div>

        <div>
          <label class="text-muted text-sm">Concepto</label>
          <input
            v-model="form.concepto"
            type="text"
            placeholder="Ej. Supermercado"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <label class="text-muted text-sm">Importe (€)</label>
            <input
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
            <label class="text-muted text-sm">Fecha</label>
            <input
              v-model="form.fecha"
              type="date"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
          <!-- Día de pago: solo para fijos (recurrentes), opcional -->
          <div v-if="esRecurrente" class="flex-1">
            <label class="text-muted text-sm">Día de pago (1-31)</label>
            <input
              v-model="form.diaPago"
              type="number"
              min="1"
              max="31"
              placeholder="Ej. 5"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        <div>
          <label class="text-muted text-sm">Categoría</label>
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
          <label class="text-muted text-sm">Comercio (opcional)</label>
          <input
            v-model="form.comercio"
            type="text"
            placeholder="Ej. Mercadona"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Etiquetas: texto separado por comas; se convierte a array al guardar -->
        <div>
          <label class="text-muted text-sm">Etiquetas (opcional)</label>
          <input
            v-model="form.tagsTexto"
            type="text"
            placeholder="Ej. vacaciones, regalo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <p class="text-faint text-xs mt-1">Sepáralas con comas.</p>
        </div>

        <!-- Recibo: SOLO para puntuales (no recurrentes). Imagen redimensionada -->
        <div v-if="!esRecurrente">
          <label class="text-muted text-sm">Recibo (opcional)</label>
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
            <img :src="form.recibo" alt="Recibo" class="h-20 w-20 rounded-lg object-cover border border-border" />
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1 text-sm text-muted hover:text-danger transition-colors"
              @click="quitarRecibo"
            >
              Quitar
            </button>
          </div>
        </div>

        <p v-if="esRecurrente" class="text-faint text-xs">
          Los fijos se repiten automáticamente en todos los meses desde hoy.
        </p>
        <p v-if="error" class="text-danger text-sm">{{ error }}</p>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          class="flex-1 rounded-lg border border-border px-4 py-2 text-muted hover:text-ink transition-colors"
          @click="emit('cerrar')"
        >
          Cancelar
        </button>
        <button
          class="flex-1 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="guardar"
        >
          Guardar
        </button>
      </div>
    </div>
  </div>
</template>
