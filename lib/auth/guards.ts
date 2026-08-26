// =============================================================================
// Guards para paginas y APIs.
//
// requireSession() de session.ts lanza AuthError. Aca se traduce eso a lo que
// corresponde en cada contexto: una pagina redirige, una API responde 401/403.
// =============================================================================

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { AuthError, getSession, type SessionPayload } from "@/lib/auth/session";
import type { UserRole } from "@/lib/types";

/**
 * Para server components. Si no hay sesion manda al login conservando a donde
 * queria ir; si el rol no alcanza, manda a /sin-permiso.
 */
export function requirePageSession(
  roles: UserRole[],
  volverA?: string
): SessionPayload {
  const sesion = getSession();

  if (!sesion) {
    const next = volverA ? `?next=${encodeURIComponent(volverA)}` : "";
    redirect(`/login${next}`);
  }
  if (!roles.includes(sesion.role)) {
    redirect("/sin-permiso");
  }
  return sesion;
}

/**
 * Para route handlers. Devuelve la sesion o una NextResponse ya armada.
 *
 *   const auth = requireApiSession(["owner"]);
 *   if (auth instanceof NextResponse) return auth;
 */
export function requireApiSession(
  roles: UserRole[]
): SessionPayload | NextResponse {
  const sesion = getSession();

  if (!sesion) {
    return NextResponse.json(
      { error: "Necesitás iniciar sesión", code: "NO_SESSION" },
      { status: 401 }
    );
  }
  if (!roles.includes(sesion.role)) {
    return NextResponse.json(
      { error: "Tu usuario no tiene permiso", code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  return sesion;
}

/** Para server actions: lanza y corta la accion. */
export function requireActionSession(roles: UserRole[]): SessionPayload {
  const sesion = getSession();
  if (!sesion) throw new AuthError("Necesitás iniciar sesión", "NO_SESSION", 401);
  if (!roles.includes(sesion.role)) {
    throw new AuthError("Tu usuario no tiene permiso", "FORBIDDEN", 403);
  }
  return sesion;
}

/**
 * Un empleado solo puede operar sobre SU agenda; el dueño, sobre cualquiera.
 * Devuelve el professionalId que corresponde usar, o null = todos.
 */
export function scopeProfessional(
  sesion: SessionPayload,
  pedido?: string
): string | null {
  if (sesion.role === "owner") return pedido ?? null;
  return sesion.professionalId ?? "__sin_profesional__";
}
