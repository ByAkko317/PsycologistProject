// =============================================================================
// Casos de uso de autenticación.
//
// Regla que atraviesa todo el archivo: los mensajes de error hacia afuera son
// deliberadamente vagos ("Email o contraseña incorrectos"). Distinguir "ese
// email no existe" de "la contraseña está mal" permite averiguar quién es
// paciente del consultorio, y eso ya es información de salud.
// =============================================================================

import {
  fakeVerify,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/passwords";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import type { SessionPayload } from "@/lib/auth/session";
import type { User, UserRole } from "@/lib/types";

export class AuthFlowError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_CREDENTIALS"
      | "EMAIL_TAKEN"
      | "WEAK_PASSWORD"
      | "INVALID_INPUT"
      | "INACTIVE"
  ) {
    super(message);
    this.name = "AuthFlowError";
  }
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Convierte un User de la base en el payload que va dentro de la cookie. */
export function sessionFromUser(user: User): Omit<SessionPayload, "iat" | "exp"> {
  return {
    uid: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
    name: user.name,
    professionalId: user.professionalId,
    clientId: user.clientId,
  };
}

/**
 * Verifica credenciales. No escribe la cookie: eso lo hace quien llama, para
 * que esta función se pueda testear sin contexto de request.
 */
export async function login(
  emailCrudo: string,
  password: string,
  tenantSlug?: string
): Promise<User> {
  const tenant = await requireTenant(tenantSlug);
  const email = normalizeEmail(emailCrudo);

  if (!email || !password) {
    throw new AuthFlowError("Completá email y contraseña", "INVALID_INPUT");
  }

  const usuario = await db.getUserByEmail(tenant.id, email);

  // Si el email no existe igual pagamos el costo de un scrypt, para que el
  // tiempo de respuesta no delate qué emails están registrados.
  if (!usuario) {
    await fakeVerify();
    throw new AuthFlowError(
      "Email o contraseña incorrectos",
      "INVALID_CREDENTIALS"
    );
  }

  const ok = await verifyPassword(password, usuario.passwordHash);
  if (!ok) {
    throw new AuthFlowError(
      "Email o contraseña incorrectos",
      "INVALID_CREDENTIALS"
    );
  }

  if (!usuario.active) {
    throw new AuthFlowError(
      "Esta cuenta está desactivada. Hablá con el consultorio.",
      "INACTIVE"
    );
  }

  // Best effort: si falla el registro del último acceso, el login sigue.
  db.updateUser(tenant.id, usuario.id, {
    lastLoginAt: new Date().toISOString(),
  }).catch((e) => console.warn("[auth] no se pudo registrar lastLoginAt", e));

  return usuario;
}

/**
 * Alta de un paciente.
 *
 * Si ya existe un registro en Clients con ese email — porque reservó antes sin
 * cuenta — la cuenta se enlaza a ese registro. Así el paciente entra y ve su
 * historial completo, en vez de arrancar de cero.
 */
export async function registerClient(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  tenantSlug?: string;
}): Promise<User> {
  const tenant = await requireTenant(input.tenantSlug);
  const email = normalizeEmail(input.email);
  const name = input.name.trim();

  if (name.length < 2) {
    throw new AuthFlowError("Poné tu nombre y apellido", "INVALID_INPUT");
  }
  if (!EMAIL_RX.test(email)) {
    throw new AuthFlowError("Ese email no parece válido", "INVALID_INPUT");
  }

  const debil = validatePasswordStrength(input.password);
  if (debil) throw new AuthFlowError(debil, "WEAK_PASSWORD");

  const yaExiste = await db.getUserByEmail(tenant.id, email);
  if (yaExiste) {
    throw new AuthFlowError(
      "Ya hay una cuenta con ese email. Probá iniciar sesión.",
      "EMAIL_TAKEN"
    );
  }

  // Enlaza (o crea) el registro de Clients. upsertClient ya deduplica por email.
  const cliente = await db.upsertClient(tenant.id, {
    name,
    email,
    phone: input.phone?.trim() || undefined,
  });

  const passwordHash = await hashPassword(input.password);

  try {
    return await db.createUser(tenant.id, {
      email,
      name,
      role: "client",
      passwordHash,
      clientId: cliente.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_TAKEN") {
      throw new AuthFlowError(
        "Ya hay una cuenta con ese email. Probá iniciar sesión.",
        "EMAIL_TAKEN"
      );
    }
    throw e;
  }
}

/**
 * Alta de usuarios de equipo (dueño o profesional).
 * No hay registro público para estos roles: los crea el dueño desde el panel,
 * o el script scripts/crear-usuario.mjs desde la terminal.
 */
export async function createTeamUser(input: {
  name: string;
  email: string;
  password: string;
  role: Extract<UserRole, "owner" | "employee">;
  professionalId?: string;
  tenantSlug?: string;
}): Promise<User> {
  const tenant = await requireTenant(input.tenantSlug);
  const email = normalizeEmail(input.email);

  if (!EMAIL_RX.test(email)) {
    throw new AuthFlowError("Ese email no parece válido", "INVALID_INPUT");
  }
  const debil = validatePasswordStrength(input.password);
  if (debil) throw new AuthFlowError(debil, "WEAK_PASSWORD");

  if (input.role === "employee" && !input.professionalId) {
    throw new AuthFlowError(
      "Un profesional necesita estar vinculado a una ficha de profesional",
      "INVALID_INPUT"
    );
  }

  try {
    return await db.createUser(tenant.id, {
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(input.password),
      professionalId: input.professionalId,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_TAKEN") {
      throw new AuthFlowError("Ya hay un usuario con ese email", "EMAIL_TAKEN");
    }
    throw e;
  }
}

/** Cambio de contraseña con verificación de la actual. */
export async function changePassword(
  tenantId: string,
  userId: string,
  actual: string,
  nueva: string
): Promise<void> {
  const usuario = await db.getUserById(tenantId, userId);
  if (!usuario) {
    throw new AuthFlowError("Usuario inexistente", "INVALID_CREDENTIALS");
  }

  if (!(await verifyPassword(actual, usuario.passwordHash))) {
    throw new AuthFlowError(
      "La contraseña actual no es correcta",
      "INVALID_CREDENTIALS"
    );
  }

  const debil = validatePasswordStrength(nueva);
  if (debil) throw new AuthFlowError(debil, "WEAK_PASSWORD");

  await db.updateUser(tenantId, userId, {
    passwordHash: await hashPassword(nueva),
  });
}
