/* ===========================================================================
   Almacén persistente de los datos financieros, SIEMPRE cifrado en disco.
   Mantiene en memoria el "secreto" activo (derivado de la credencial del
   usuario o de un secreto de ofuscación) y cifra/descifra con él.
   Los ajustes (tema, config de bloqueo) NO son sensibles y van en claro.
   =========================================================================== */
import type { DatosBolsillo } from "../types";
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

// Carga y descifra los datos. Devuelve null si no hay nada guardado.
// Lanza error si el secreto no es válido (credencial incorrecta).
export async function cargar(): Promise<DatosBolsillo | null> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (!blob) return null;
  const json = await descifrar(blob, secretoActual);
  return JSON.parse(json) as DatosBolsillo;
}

// Cifra y guarda los datos con el secreto activo.
export async function guardar(datos: DatosBolsillo): Promise<void> {
  const blob = await cifrar(JSON.stringify(datos), secretoActual);
  localStorage.setItem(CLAVE_DATOS, blob);
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
