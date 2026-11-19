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
  //     días de diferencia. Dentro de un grupo, las filas (y los apuntes) del
  //     mismo día son intercambiables, así que el grafo va por DÍAS con
  //     capacidades: aunque haya miles de cafés iguales el mismo día, el
  //     grafo tiene un nodo por día y no una arista por pareja posible.
  // EN: In each group, minimum-cost matching among the maximum-size ones: the
  //     largest number of pairs and, among those, the smallest sum of days
  //     apart. Within a group, rows (and entries) on the same day are
  //     interchangeable, so the graph goes by DAYS with capacities: even with
  //     thousands of equal coffees on one day, the graph has one node per day
  //     and not one edge per possible pair.
  for (const [k, filasGrupo] of filasPorClave) {
    // ES: Por día, en orden: filas por línea y apuntes por posición.
    // EN: Per day, in order: rows by line and entries by position.
    const filasPorDia = new Map<number, number[]>();
    for (const posicion of filasGrupo) {
      const d = diaUTC(filas[posicion].fecha);
      filasPorDia.set(d, [...(filasPorDia.get(d) ?? []), posicion]);
    }
    const apuntesPorDia = new Map<number, number[]>();
    for (const c of grupos.get(k) ?? []) {
      apuntesPorDia.set(c.dia, [...(apuntesPorDia.get(c.dia) ?? []), c.indice]);
    }
    const diasF = [...filasPorDia.keys()].sort((a, b) => a - b);
    const diasA = [...apuntesPorDia.keys()].sort((a, b) => a - b);
    for (const lista of filasPorDia.values()) lista.sort((a, b) => filas[a].linea - filas[b].linea);
    for (const lista of apuntesPorDia.values()) lista.sort((a, b) => a - b);

    const aristas: { izq: number; der: number; coste: number }[] = [];
    diasF.forEach((dF, i) =>
      diasA.forEach((dA, j) => {
        const dias = Math.abs(dF - dA);
        if (dias <= tolerancia) aristas.push({ izq: i, der: j, coste: dias });
      })
    );
    const flujos = flujoCosteMinimo(
      diasF.map((d) => filasPorDia.get(d)?.length ?? 0),
      diasA.map((d) => apuntesPorDia.get(d)?.length ?? 0),
      aristas
    );

    // ES: Se reparten los flujos por día entre filas y apuntes concretos: las
    //     de antes (menor línea, menor posición) primero, y cada fila prueba
    //     antes su día de apunte más cercano.
    // EN: Day flows are handed out to concrete rows and entries: earlier ones
    //     (lower line, lower position) first, and each row tries its closest
    //     entry day first.
    const orden = aristas
      .map((a, n) => ({ ...a, flujo: flujos[n] }))
      .filter((a) => a.flujo > 0)
      .sort((a, b) => a.izq - b.izq || a.coste - b.coste || a.der - b.der);
    for (const a of orden) {
      const libresF = filasPorDia.get(diasF[a.izq]) ?? [];
      const libresA = apuntesPorDia.get(diasA[a.der]) ?? [];
      for (let n = 0; n < a.flujo; n++) {
        const posicion = libresF.shift();
        const indice = libresA.shift();
        if (posicion === undefined || indice === undefined) break;
        const linea = filas[posicion].linea;
        const id = apuntados[indice].id ?? String(indice);
        marcas.set(linea, { linea, tipo: "apuntado", id, dias: a.coste });
      }
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

// ES: Flujo de coste mínimo entre los de flujo máximo en un grafo bipartito
//     con capacidades (caminos más cortos sucesivos): cada vuelta busca el
//     camino más barato del grafo residual (SPFA, que admite los costes
//     negativos de las aristas de vuelta) y empuja por él todo lo que cabe.
//     `capIzq` y `capDer` son cuántas filas y apuntes hay en cada nodo (día);
//     devuelve el flujo de cada arista de `aristas`, en el mismo orden.
// EN: Minimum-cost flow among the maximum-flow ones on a bipartite graph with
//     capacities (successive shortest paths): each round finds the cheapest
//     path of the residual graph (SPFA, which handles the negative costs of
//     the backward edges) and pushes as much as fits along it. `capIzq` and
//     `capDer` are how many rows and entries each node (day) holds; returns
//     the flow of every edge in `aristas`, in the same order.
function flujoCosteMinimo(
  capIzq: number[],
  capDer: number[],
  aristas: { izq: number; der: number; coste: number }[]
): number[] {
  // ES: Nodos: izquierda, derecha, origen y destino. / EN: Nodes: left, right, source and sink.
  const nI = capIzq.length;
  const total = nI + capDer.length + 2;
  const origen = total - 2;
  const destino = total - 1;
  type Arista = { a: number; capacidad: number; coste: number; inversa: number };
  const grafo: Arista[][] = Array.from({ length: total }, () => []);
  // ES: Añade u -> v y su arista de vuelta; devuelve la posición de la de ida.
  // EN: Adds u -> v and its backward edge; returns the forward edge position.
  const unir = (u: number, v: number, capacidad: number, coste: number) => {
    grafo[u].push({ a: v, capacidad, coste, inversa: grafo[v].length });
    grafo[v].push({ a: u, capacidad: 0, coste: -coste, inversa: grafo[u].length - 1 });
    return grafo[u].length - 1;
  };
  capIzq.forEach((c, i) => unir(origen, i, c, 0));
  const posiciones = aristas.map((a) =>
    unir(a.izq, nI + a.der, Math.min(capIzq[a.izq], capDer[a.der]), a.coste)
  );
  capDer.forEach((c, j) => unir(nI + j, destino, c, 0));
  const iniciales = aristas.map((a, n) => grafo[a.izq][posiciones[n]].capacidad);

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
    // ES: Lo que cabe por el camino (su arista más estrecha) y se empuja.
    // EN: What fits along the path (its narrowest edge) is pushed.
    let cabe = Number.POSITIVE_INFINITY;
    for (let v = destino; v !== origen; v = previo[v]) {
      cabe = Math.min(cabe, grafo[previo[v]][aristaPrevia[v]].capacidad);
    }
    for (let v = destino; v !== origen; v = previo[v]) {
      const e = grafo[previo[v]][aristaPrevia[v]];
      e.capacidad -= cabe;
      grafo[v][e.inversa].capacidad += cabe;
    }
  }

  // ES: Flujo de cada arista = capacidad inicial - capacidad que le queda.
  // EN: Flow of each edge = initial capacity - remaining capacity.
  return aristas.map((a, n) => iniciales[n] - grafo[a.izq][posiciones[n]].capacidad);
}
