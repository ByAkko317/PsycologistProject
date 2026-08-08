// =============================================================================
// Sesiones: cookie firmada, sin estado en el servidor.
//
// La cookie lleva el payload en base64url y una firma HMAC-SHA256 al final.
// El servidor no guarda sesiones: si la firma valida y no venció, es legítima.
//
// La cookie es httpOnly (JavaScript de la página no la puede leer, así que un
// XSS no se lleva la sesión), sameSite=lax (corta CSRF en POST cross-site) y
// secure en producción.
//
// Contrapartida honesta de no tener estado: no se puede revocar una sesión
// puntual antes de que expire. Por eso duran 7 días y el payload es mínimo.
// Si más adelante hace falta "cerrar sesión en todos los dispositivos", se
// agrega un campo `sessionsValidFrom` al usuario y se compara contra `iat`.
// =============================================================================

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { UserRole } from "@/lib/types";

export const COOKIE_NAME = "turnos_session";
const DURACION_DIAS = 7;

export interface SessionPayload {
  /** id del usuario */
  uid: string;
  tenantId: string;
  role: UserRole;
  email: string;
  name: string;
  /** Solo para empleados: a qué profesional corresponde. */
  professionalId?: string;
  /** Solo para pacientes: a qué registro de Clients corresponde. */
  clientId?: string;
  /** emitido en (epoch segundos) */
  iat: number;
  /** vence en (epoch segundos) */
  exp: number;
}

// --- secreto -----------------------------------------------------------------

let secretoEfimero: string | null = null;

/**
 * Secreto de firma.
 *
 * En producción es obligatorio: sin él, cualquiera que conozca el formato puede
 * fabricarse una cookie de dueño. En desarrollo se genera uno al vuelo para que
 * el proyecto arranque sin configurar nada — con la contra de que las sesiones
 * se caen en cada reinicio del servidor.
 */
function getSecret(): string {
  const configurado = (process.env.AUTH_SECRET ?? "").trim();
  if (configurado) {
    if (configurado.length < 32 && process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET es demasiado corto (mínimo 32 caracteres). " +
          'Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    return configurado;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta AUTH_SECRET. Sin ese valor las sesiones se pueden falsificar. " +
        'Generalo con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (!secretoEfimero) {
    secretoEfimero = randomBytes(32).toString("hex");
    console.warn(
      "[auth] AUTH_SECRET no configurado: se generó uno efímero para desarrollo.\n" +
        "       Las sesiones se van a cerrar cada vez que reinicies el servidor.\n" +
        "       Poné AUTH_SECRET en .env.local para que dejen de caerse."
    );
  }
  return secretoEfimero;
}

// --- firma -------------------------------------------------------------------

const b64url = (buf: Buffer) => buf.toString("base64url");

function firmar(datos: string): string {
  return createHmac("sha256", getSecret()).update(datos).digest("base64url");
}

/** Arma el valor de la cookie a partir del payload. */
export function createSessionToken(
  datos: Omit<SessionPayload, "iat" | "exp">
): { token: string; expiresAt: Date } {
  const ahora = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...datos,
    iat: ahora,
    exp: ahora + DURACION_DIAS * 24 * 60 * 60,
  };

  const cuerpo = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return {
    token: `${cuerpo}.${firmar(cuerpo)}`,
    expiresAt: new Date(payload.exp * 1000),
  };
}

/** Valida firma y vencimiento. Devuelve null ante cualquier problema. */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const corte = token.lastIndexOf(".");
  if (corte <= 0) return null;

  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);

  const esperada = firmar(cuerpo);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8")
    ) as SessionPayload;

    if (!payload.uid || !payload.role || !payload.tenantId) return null;
    if (payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

// --- acceso desde server components / actions / route handlers ---------------

/** Sesión actual, o null si no hay o no vale. */
export function getSession(): SessionPayload | null {
  return verifySessionToken(cookies().get(COOKIE_NAME)?.value);
}

/** Escribe la cookie de sesión. Solo desde una server action o route handler. */
export function setSessionCookie(
  datos: Omit<SessionPayload, "iat" | "exp">
): void {
  const { token, expiresAt } = createSessionToken(datos);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// --- helpers de autorización -------------------------------------------------

export class AuthError extends Error {
  constructor(
    message: string,
    public code: "NO_SESSION" | "FORBIDDEN",
    public status = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Exige sesión con alguno de los roles indicados.
 * Lanza AuthError; las páginas lo traducen a redirect y las APIs a 401/403.
 */
export function requireSession(roles?: UserRole[]): SessionPayload {
  const sesion = getSession();
  if (!sesion) {
    throw new AuthError("Necesitás iniciar sesión", "NO_SESSION", 401);
  }
  if (roles && !roles.includes(sesion.role)) {
    throw new AuthError(
      "Tu usuario no tiene permiso para esta sección",
      "FORBIDDEN",
      403
    );
  }
  return sesion;
}

/** A dónde mandar a cada rol después de iniciar sesión. */
export function homeForRole(role: UserRole): string {
  switch (role) {
    case "owner":
      return "/admin";
    case "employee":
      return "/employee/agenda";
    default:
      return "/portal";
  }
}
