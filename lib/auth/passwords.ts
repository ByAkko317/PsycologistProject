// =============================================================================
// Hash de contrasenias con scrypt (viene en Node, no suma dependencias).
//
// scrypt es deliberadamente lento y usa mucha memoria: eso encarece los ataques
// de fuerza bruta por GPU. Nunca guardar una contrasenia en texto plano ni con
// un hash rapido tipo SHA-256 pelado.
// =============================================================================

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

// promisify(scrypt) toma la sobrecarga de 3 argumentos y deja afuera las
// opciones de costo, asi que se envuelve a mano.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivada) =>
      err ? reject(err) : resolve(derivada)
    );
  });
}

// Parametros de costo. Subirlos endurece el hash pero tarda mas por login.
const N = 16384; // costo de CPU/memoria
const r = 8; // tamanio de bloque
const p = 1; // paralelismo
const KEYLEN = 64;
const SALT_BYTES = 16;

/** Formato guardado: scrypt$N$r$p$saltBase64$hashBase64 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("La contrasenia debe tener al menos 8 caracteres");
  }

  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(plain.normalize("NFKC"), salt, KEYLEN, {
    N,
    r,
    p,
    // scrypt necesita permiso explicito para usar >32MB con estos parametros.
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * Verifica una contrasenia contra el hash guardado.
 * Nunca lanza por hash mal formado: devuelve false. Asi un registro corrupto
 * no distingue "usuario inexistente" de "hash roto" para quien esta probando.
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  try {
    const [algo, nStr, rStr, pStr, saltB64, hashB64] = stored.split("$");
    if (algo !== "scrypt") return false;

    const salt = Buffer.from(saltB64, "base64");
    const esperado = Buffer.from(hashB64, "base64");

    const calculado = await scryptAsync(
      plain.normalize("NFKC"),
      salt,
      esperado.length,
      {
        N: Number(nStr),
        r: Number(rStr),
        p: Number(pStr),
        maxmem: 64 * 1024 * 1024,
      }
    );

    return (
      calculado.length === esperado.length &&
      timingSafeEqual(calculado, esperado)
    );
  } catch {
    return false;
  }
}

/**
 * Hash descartable con el mismo costo que uno real.
 *
 * Se usa cuando el email no existe: sin esto, un login con email inexistente
 * responde al instante y uno con email valido tarda ~100ms. Esa diferencia
 * alcanza para enumerar que emails estan registrados en el consultorio, que en
 * un contexto de salud ya es informacion sensible.
 */
export async function fakeVerify(): Promise<false> {
  await scryptAsync("contrasenia-que-no-existe", randomBytes(SALT_BYTES), KEYLEN, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return false;
}

/** Reglas minimas de contrasenia. Devuelve el motivo si no pasa. */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 8) return "Tiene que tener al menos 8 caracteres";
  if (plain.length > 200) return "Demasiado larga";
  if (/^\d+$/.test(plain)) return "No puede ser solo numeros";
  const comunes = [
    "12345678", "password", "contrasenia", "qwertyui", "11111111", "123456789",
  ];
  if (comunes.includes(plain.toLowerCase())) return "Es demasiado facil de adivinar";
  return null;
}
