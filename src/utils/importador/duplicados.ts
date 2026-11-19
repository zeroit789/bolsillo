/* =============================================================================
 * duplicados.ts — Duplicados al importar / Duplicates on import
 * -----------------------------------------------------------------------------
 * ES: Marca (nunca quita) las filas importadas que podrían estar repetidas,
 *     para que el asistente las enseñe y el usuario decida:
 *       1. "apuntado": casa con un movimiento que ya está en la app: mismo
 *          signo, mismos CÉNTIMOS, concepto normalizado igual (si no se apaga
 *          con compararConcepto: false) y fechas a no más de `toleranciaDias`
 *          días. El emparejamiento es 1 a 1 y máximo: cada fila y cada
 *          apunte se usan una sola vez, se busca el mayor número de parejas
 *          y, entre ellos, la menor suma de días. Así un café apuntado
 *          no tapa los dos cafés del extracto.
 *       2. "fichero": fila idéntica (fecha, céntimos, signo y concepto
 *          normalizado) a otra anterior del mismo fichero. Es solo un aviso:
 *          dos cafés iguales el mismo día son legítimos.
 *     Una fila lleva como mucho una marca; "apuntado" pesa más que "fichero".
 *     Por defecto toleranciaDias = 0 y compararConcepto = true: lo seguro para
 *     reimportar un extracto que se solapa con otro ya importado (mismo texto
 *     del banco). Para cruzar con lo apuntado a mano (otro concepto, otro día)
 *     la interfaz puede pasar compararConcepto: false y unos días de margen.
 *     Fechas comparadas en UTC (sin cambios de hora) con los 10 primeros
 *     caracteres ("AAAA-MM-DD"); importes de lo apuntado pasados a céntimos
 *     con redondear2, para que 0,1 + 0,2 sea 30 céntimos.
 * EN: Flags (never removes) imported rows that might be repeated, so the
 *     wizard shows them and the user decides:
 *       1. "apuntado": matches a movement already in the app: same sign, same
 *          CENTS, equal normalised concept (unless turned off with
 *          compararConcepto: false) and dates no more than `toleranciaDias`
 *          days apart. Pairing is 1 to 1 and maximum: every row and entry is
 *          used only once, the largest number of pairs is sought and, if
 *          tied, the smallest sum of days. So one entered coffee does not
 *          hide the two coffees in the statement.
 *       2. "fichero": row identical (date, cents, sign and normalised concept)
 *          to an earlier one in the same file. Only a warning: two equal
 *          coffees on the same day are legit.
 *     A row carries at most one flag; "apuntado" outweighs "fichero".
 *     Defaults toleranciaDias = 0 and compararConcepto = true: the safe choice
 *     to re-import a statement overlapping one already imported (same bank
 *     text). To cross with hand-entered items (another concept, another day)
 *     the UI can pass compararConcepto: false and a few days of margin.
 *     Dates compared in UTC (no DST changes) using the first 10 characters
 *     ("YYYY-MM-DD"); entered amounts turned into cents with redondear2, so
 *     0.1 + 0.2 is 30 cents.
 * ===========================================================================*/
import { redondear2 } from "../importe";
import { normalizarTexto } from "./texto";
import type { FilaImportada, SignoMovimiento } from "./vistaPrevia";

// ES: Movimiento ya apuntado (un Puntual encaja tal cual). Importe en euros.
// EN: Already entered movement (a Puntual fits as is). Amount in euros.
export interface MovimientoComparable {
  id?: string;
  fecha: string;
  concepto: string;
  importe: number;
  signo: SignoMovimiento;
}

// ES: Opciones de la detección. / EN: Detection options.
export interface OpcionesDuplicados {
  toleranciaDias?: number; // ES: ± días; 0 = misma fecha / EN: ± days; 0 = same date
  compararConcepto?: boolean; // ES: true por defecto / EN: true by default
}

// ES: Marca de posible duplicado de una fila importada.
// EN: Possible-duplicate flag of an imported row.
export type MarcaDuplicado =
  | { linea: number; tipo: "apuntado"; id: string; dias: number }
  | { linea: number; tipo: "fichero"; lineaOriginal: number };

// ES: Días desde 1970 de una fecha "AAAA-MM-DD…" (UTC); NaN si no se lee.
// EN: Days since 1970 of a "YYYY-MM-DD…" date (UTC); NaN if unreadable.
function diaUTC(fecha: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

// ES: Detecta los posibles duplicados (ver cabecera). Devuelve las marcas
//     ordenadas por línea; las filas no se tocan.
// EN: Detects possible duplicates (see header). Returns the flags sorted by
//     line; rows are left untouched.
export function detectarDuplicados(
  filas: FilaImportada[],
  apuntados: MovimientoComparable[],
  opciones: OpcionesDuplicados = {}
): MarcaDuplicado[] {
  const tolerancia = Math.max(0, Math.floor(opciones.toleranciaDias ?? 0));
  const conConcepto = opciones.compararConcepto ?? true;
  const marcas = new Map<number, MarcaDuplicado>();

  // ES: Clave de agrupación: signo + céntimos (+ concepto si se compara).
  // EN: Grouping key: sign + cents (+ concept when compared).
  const clave = (signo: string, centimos: number, concepto: string) =>
    `${signo}|${centimos}|${conConcepto ? normalizarTexto(concepto) : ""}`;

  // ── 1. Contra lo apuntado / Against what is entered ────────────────────────
  const grupos = new Map<string, { indice: number; dia: number }[]>();
  apuntados.forEach((a, indice) => {
    const centimos = Math.round(redondear2(Math.abs(a.importe)) * 100);
    const k = clave(a.signo, centimos, a.concepto);
    const lista = grupos.get(k) ?? [];
    lista.push({ indice, dia: diaUTC(a.fecha) });
    grupos.set(k, lista);
  });
  // ES: Filas agrupadas por clave (solo pueden casar con apuntes de su grupo).
  // EN: Rows grouped by key (they can only match entries of their own group).
  const filasPorClave = new Map<string, number[]>();
  filas.forEach((f, posicion) => {
    const k = clave(f.signo, f.centimos, f.concepto);
    if (!grupos.has(k)) return;
    const lista = filasPorClave.get(k) ?? [];
    lista.push(posicion);
    filasPorClave.set(k, lista);
  });

  // ES: En cada grupo, emparejamiento de coste mínimo entre los de tamaño
  //     máximo: el mayor número de parejas y, entre ellos, la menor suma de
  //     días de diferencia.
  // EN: In each group, minimum-cost matching among the maximum-size ones: the
  //     largest number of pairs and, among those, the smallest sum of days apart.
  for (const [k, filasGrupo] of filasPorClave) {
    const apuntesGrupo = grupos.get(k) ?? [];
    const pares: { fila: number; apunte: number; coste: number }[] = [];
    filasGrupo.forEach((posicion, f) => {
      const dia = diaUTC(filas[posicion].fecha);
      apuntesGrupo.forEach((c, a) => {
        const dias = Math.abs(dia - c.dia);
        if (dias <= tolerancia) pares.push({ fila: f, apunte: a, coste: dias });
      });
    });
    for (const [f, a] of emparejarCosteMinimo(filasGrupo.length, apuntesGrupo.length, pares)) {
      const posicion = filasGrupo[f];
      const indice = apuntesGrupo[a].indice;
      const linea = filas[posicion].linea;
      const dias = Math.abs(diaUTC(filas[posicion].fecha) - apuntesGrupo[a].dia);
      const id = apuntados[indice].id ?? String(indice);
      marcas.set(linea, { linea, tipo: "apuntado", id, dias });
    }
  }

  // ── 2. Dentro del fichero / Within the file ────────────────────────────────
  // ES: Aquí el concepto se compara siempre: son filas del mismo banco.
  // EN: Here the concept is always compared: they are rows from the same bank.
  const vistas = new Map<string, number>();
  for (const f of filas) {
    const k = `${f.fecha.slice(0, 10)}|${f.signo}|${f.centimos}|${normalizarTexto(f.concepto)}`;
    const primera = vistas.get(k);
    if (primera === undefined) vistas.set(k, f.linea);
    else if (!marcas.has(f.linea)) {
      marcas.set(f.linea, { linea: f.linea, tipo: "fichero", lineaOriginal: primera });
    }
  }

  return [...marcas.values()].sort((a, b) => a.linea - b.linea);
}

// ES: Emparejamiento bipartito de coste mínimo entre los de tamaño máximo,
//     con caminos más cortos sucesivos (flujo de coste mínimo, capacidad 1):
//     cada vuelta añade una pareja por el camino más barato del grafo
//     residual (SPFA, admite los costes negativos de las aristas de vuelta).
//     Devuelve pares [fila, apunte] con índices locales del grupo. Los grupos
//     son pequeños (mismo signo, céntimos y concepto dentro de la tolerancia).
// EN: Minimum-cost bipartite matching among the maximum-size ones, with
//     successive shortest paths (min-cost flow, capacity 1): each round adds
//     one pair through the cheapest path of the residual graph (SPFA, which
//     handles the negative costs of the backward edges). Returns [row, entry]
//     pairs with group-local indexes. Groups are small (same sign, cents and
//     concept within tolerance).
function emparejarCosteMinimo(
  nFilas: number,
  nApuntes: number,
  pares: { fila: number; apunte: number; coste: number }[]
): [number, number][] {
  // ES: Nodos: filas, apuntes, origen y destino. / EN: Nodes: rows, entries, source and sink.
  const total = nFilas + nApuntes + 2;
  const origen = total - 2;
  const destino = total - 1;
  type Arista = { a: number; capacidad: number; coste: number; inversa: number };
  const grafo: Arista[][] = Array.from({ length: total }, () => []);
  const unir = (u: number, v: number, coste: number) => {
    grafo[u].push({ a: v, capacidad: 1, coste, inversa: grafo[v].length });
    grafo[v].push({ a: u, capacidad: 0, coste: -coste, inversa: grafo[u].length - 1 });
  };
  for (let f = 0; f < nFilas; f++) unir(origen, f, 0);
  for (const p of pares) unir(p.fila, nFilas + p.apunte, p.coste);
  for (let a = 0; a < nApuntes; a++) unir(nFilas + a, destino, 0);

  for (;;) {
    // ES: Camino más barato del origen al destino (SPFA).
    // EN: Cheapest path from source to sink (SPFA).
    const distancia = new Array<number>(total).fill(Number.POSITIVE_INFINITY);
    const previo = new Array<number>(total).fill(-1);
    const aristaPrevia = new Array<number>(total).fill(-1);
    const enCola = new Array<boolean>(total).fill(false);
    const cola: number[] = [origen];
    distancia[origen] = 0;
    enCola[origen] = true;
    for (let i = 0; i < cola.length; i++) {
      const u = cola[i];
      enCola[u] = false;
      grafo[u].forEach((e, j) => {
        if (e.capacidad > 0 && distancia[u] + e.coste < distancia[e.a]) {
          distancia[e.a] = distancia[u] + e.coste;
          previo[e.a] = u;
          aristaPrevia[e.a] = j;
          if (!enCola[e.a]) {
            enCola[e.a] = true;
            cola.push(e.a);
          }
        }
      });
    }
    if (distancia[destino] === Number.POSITIVE_INFINITY) break;
    // ES: Se empuja una unidad por el camino encontrado.
    // EN: One unit is pushed along the path found.
    for (let v = destino; v !== origen; v = previo[v]) {
      const e = grafo[previo[v]][aristaPrevia[v]];
      e.capacidad -= 1;
      grafo[v][e.inversa].capacidad += 1;
    }
  }

  // ES: Parejas = aristas fila -> apunte agotadas. / EN: Pairs = used row -> entry edges.
  const resultado: [number, number][] = [];
  for (let f = 0; f < nFilas; f++) {
    for (const e of grafo[f]) {
      if (e.a >= nFilas && e.a < nFilas + nApuntes && e.capacidad === 0) {
        resultado.push([f, e.a - nFilas]);
      }
    }
  }
  return resultado;
}
