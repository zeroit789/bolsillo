/* ===========================================================================
   Almacén persistente de los datos financieros, SIEMPRE cifrado en disco.
   Mantiene en memoria el "secreto" activo (derivado de la credencial del
   usuario o de un secreto de ofuscación) y cifra/descifra con él.
   Los ajustes (tema, config de bloqueo) NO son sensibles y van en claro.
   =========================================================================== */
import { esDatosValidos, type DatosBolsillo } from "../types";
import { cifrar, descifrar } from "./cripto";

const CLAVE_DATOS = "bolsillo.datos.cif";

// Secreto usado cuando el usuario NO ha puesto credencial. No da seguridad
// fuerte (está en el binario), pero evita que los datos se vean en claro.
const SECRETO_OFUSCACION = "bolsillo::ofuscacion::v1::Z3r0";

// Secreto activo en memoria (nunca se persiste).
let secretoActual: string = SECRETO_OFUSCACION;

export function usarOfuscacion() {
  secretoActual = SECRETO_OFUSCACION;
}
export function usarSecreto(s: string) {
  secretoActual = s;
}

// ¿Hay datos ya guardados en disco?
export function hayDatos(): boolean {
  return localStorage.getItem(CLAVE_DATOS) !== null;
}

// Carga y descifra los datos. Devuelve null si no hay nada guardado o si el
// contenido descifrado no tiene la forma esperada (corrupto). Lanza error si
// el secreto no es válido (credencial incorrecta) — AES-GCM falla al descifrar.
export async function cargar(): Promise<DatosBolsillo | null> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (!blob) return null;
  const json = await descifrar(blob, secretoActual);
  const datos = JSON.parse(json);
  return esDatosValidos(datos) ? datos : null;
}

// Cola para SERIALIZAR los guardados: como cifrar es async (PBKDF2 + AES), dos
// guardados solapados podrían escribir en orden inverso y dejar en disco un blob
// que no corresponde al último estado (o cifrado con un secreto antiguo). La cola
// garantiza que se cifra y escribe de uno en uno, en orden, con el secreto vigente.
let cola: Promise<void> = Promise.resolve();

export function guardar(datos: DatosBolsillo): Promise<void> {
  // Captura el secreto vigente AL ENCOLAR (no al ejecutar): así el cifrado no
  // depende del orden de resolución de la cola frente a cambios de secreto.
  const secreto = secretoActual;
  cola = cola
    .catch(() => {})
    .then(async () => {
      const blob = await cifrar(JSON.stringify(datos), secreto);
      localStorage.setItem(CLAVE_DATOS, blob);
    });
  return cola;
}

// Comprueba si un secreto puede descifrar los datos actuales (para validar
// la credencial al desbloquear). true si descifra, false si no.
export async function secretoValido(secreto: string): Promise<boolean> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (!blob) return true; // no hay datos aún: cualquier secreto sirve para empezar
  try {
    await descifrar(blob, secreto);
    return true;
  } catch {
    return false;
  }
}
