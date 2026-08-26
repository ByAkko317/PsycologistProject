// =============================================================================
// Matriz de permisos: fuente ÚNICA de qué puede hacer cada rol.
//
// La usan los dos lados:
//   - la UI, para no dibujar botones que después van a dar 403;
//   - el servidor, para rechazar de verdad.
//
// Es importante que sea el mismo archivo. Si la UI y el backend tuvieran cada
// uno su propia lista, tarde o temprano se separan y aparece un botón que
// promete algo que el servidor niega — o peor, una acción que la UI esconde
// pero el endpoint sigue aceptando.
//
// Recordatorio que vale para todo el archivo: **esconder un botón no es una
// medida de seguridad**. Cada capability se vuelve a chequear en el endpoint.
// =============================================================================

import type { SessionPayload } from "@/lib/auth/session";
import type { UserRole } from "@/lib/types";

export type Capability =
  // --- Turnos ---
  | "bookings:view:own" // ver los turnos propios (paciente)
  | "bookings:view:assigned" // ver los turnos de su agenda (profesional)
  | "bookings:view:all" // ver todos los del negocio (dueño)
  | "bookings:create" // reservar
  | "bookings:cancel:own" // cancelar el propio
  | "bookings:reschedule:own" // mover el propio
  | "bookings:attendance" // marcar asistió / ausente
  | "bookings:manage:all" // cancelar o mover cualquiera
  // --- Datos sensibles ---
  | "money:view" // precios, importes, ingresos
  | "clients:view:all" // ficha y contacto de todos los pacientes
  // --- Configuración del negocio ---
  | "services:manage"
  | "branding:manage"
  | "team:manage" // alta y baja de usuarios del equipo
  | "analytics:view";

/**
 * Qué puede cada rol.
 *
 * `employee` es deliberadamente corto: su agenda funciona como parte de
 * trabajo. Ve a quién atiende y marca si vino, nada más. No ve importes, no
 * cancela ni reprograma, y no accede a la ficha de pacientes que no atiende.
 * Cancelar un turno tiene consecuencias sobre el paciente y sobre el cobro:
 * es una decisión de la administración.
 */
const MATRIZ: Record<UserRole, Capability[]> = {
  client: [
    "bookings:view:own",
    "bookings:create",
    "bookings:cancel:own",
    "bookings:reschedule:own",
  ],

  employee: ["bookings:view:assigned", "bookings:attendance"],

  owner: [
    "bookings:view:all",
    "bookings:view:assigned",
    "bookings:create",
    "bookings:attendance",
    "bookings:manage:all",
    "money:view",
    "clients:view:all",
    "services:manage",
    "branding:manage",
    "team:manage",
    "analytics:view",
  ],
};

/** ¿Este rol tiene esta capacidad? */
export function roleCan(role: UserRole, cap: Capability): boolean {
  return MATRIZ[role].includes(cap);
}

/** ¿Esta sesión tiene esta capacidad? Sin sesión, solo lo público. */
export function can(
  sesion: SessionPayload | null | undefined,
  cap: Capability
): boolean {
  if (!sesion) return false;
  return roleCan(sesion.role, cap);
}

/** Todas las capacidades de un rol, para pasárselas a un componente cliente. */
export function capabilitiesOf(role: UserRole): Capability[] {
  return [...MATRIZ[role]];
}

// --- Navegación --------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  /** Si está, el ítem solo aparece cuando el rol tiene esta capacidad. */
  requires?: Capability;
}

const NAV: Record<UserRole, NavItem[]> = {
  client: [
    { href: "/portal", label: "Mis turnos" },
    { href: "/book", label: "Reservar" },
  ],
  employee: [{ href: "/employee/agenda", label: "Mi agenda" }],
  owner: [
    { href: "/admin", label: "Resumen" },
    { href: "/admin/agenda", label: "Agenda" },
    { href: "/admin/clientes", label: "Pacientes" },
    { href: "/admin/servicios", label: "Servicios" },
    { href: "/admin/equipo", label: "Equipo" },
    { href: "/admin/marca", label: "Marca" },
  ],
};

/** Menú que corresponde a la sesión. Sin sesión, solo lo público. */
export function navFor(sesion: SessionPayload | null | undefined): NavItem[] {
  if (!sesion) return [{ href: "/book", label: "Reservar turno" }];
  return NAV[sesion.role].filter(
    (i) => !i.requires || roleCan(sesion.role, i.requires)
  );
}

/** Etiqueta legible del rol, para mostrar junto al nombre. */
export function roleLabel(role: UserRole): string {
  return { owner: "Administración", employee: "Profesional", client: "Paciente" }[
    role
  ];
}

/** A dónde va cada rol al iniciar sesión o al tocar el logo. */
export function homeFor(sesion: SessionPayload | null | undefined): string {
  if (!sesion) return "/";
  return { owner: "/admin", employee: "/employee/agenda", client: "/portal" }[
    sesion.role
  ];
}
