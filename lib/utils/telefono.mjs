// =============================================================================
// Regla UNICA de telefonos. La usan el formulario (navegador), el servidor y
// `pnpm reparar:telefonos`. Es .mjs para que el script la importe sin compilar.
//
// Formato guardado: E.164 — "+" y solo digitos, sin espacios. Ej: +5492611234567
// Es lo que espera la API de WhatsApp: cualquier otro caracter en el medio
// hace que el envio falle o salga a otro numero.
// =============================================================================

/** Codigo de pais con el que arranca el campo. El paciente lo puede borrar. */
export const PREFIJO_POR_DEFECTO = "54";

/** E.164 admite hasta 15 digitos; menos de 8 no es un numero completo. */
const MIN_DIGITOS = 8;
const MAX_DIGITOS = 15;

/**
 * @typedef {{ ok: true, telefono: string | undefined } | { ok: false, error: string }} ResultadoTelefono
 */

/**
 * Valida y normaliza un telefono.
 *
 * Acepta separadores comunes (espacios, guiones, puntos, parentesis) y los
 * saca, porque llegan de pegar un numero copiado de otro lado. Rechaza letras
 * y cualquier otro simbolo: ahi no hay forma segura de adivinar que quiso
 * poner. Vacio es valido (el telefono es opcional) y devuelve undefined.
 *
 * @param {string | null | undefined} crudo
 * @returns {ResultadoTelefono}
 */
export function validarTelefono(crudo) {
  const texto = String(crudo ?? "").trim();
  if (!texto) return { ok: true, telefono: undefined };

  if (/[^\d\s+\-().]/.test(texto)) {
    return { ok: false, error: "El teléfono solo puede tener números y el + del código de país." };
  }
  if (texto.lastIndexOf("+") > 0) {
    return { ok: false, error: "El + va solo al principio, antes del código de país." };
  }
  if (!texto.startsWith("+")) {
    // Sin + no se puede saber si el numero trae codigo de pais: "2611234567"
    // se leeria como +261 (Madagascar). Mejor pedirlo que adivinar.
    return { ok: false, error: "Falta el código de país, empezando con +. Ej: +54 9 261 1234567" };
  }

  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return { ok: true, telefono: undefined };

  if (digitos.startsWith("0")) {
    return { ok: false, error: "El código de país no empieza con 0. Ej: +54 para Argentina." };
  }
  // El error mas comun en Argentina: el 0 de larga distancia nacional.
  if (digitos.startsWith("540")) {
    return { ok: false, error: "Sacá el 0 del código de área: +54 9 261…, no +54 0261…" };
  }
  if (digitos.length < MIN_DIGITOS) {
    return { ok: false, error: "El número está incompleto: faltan dígitos." };
  }
  if (digitos.length > MAX_DIGITOS) {
    return { ok: false, error: `Un teléfono internacional tiene como máximo ${MAX_DIGITOS} dígitos.` };
  }

  return { ok: true, telefono: `+${digitos}` };
}
