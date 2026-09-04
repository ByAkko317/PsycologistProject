// =============================================================================
// Consultas de turnos para los paneles: alcance por rol, búsqueda y paginado.
//
// Mismo criterio que patients.ts: el alcance se resuelve acá una sola vez, no
// en cada página. Un profesional ve su agenda; la administración, todo.
// =============================================================================

import { AuthError, type SessionPayload } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { db, expandBookings } from "@/lib/services/db";
import type { BookingDetail, BookingStatus, Tenant } from "@/lib/types";
import { toDateKey } from "@/lib/utils/dates";

export const POR_PAGINA = 20;

function norm(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export interface AgendaPage {
  /** Turnos agrupados por día, ya ordenados. */
  dias: { fecha: string; turnos: BookingDetail[] }[];
  total: number;
  pagina: number;
  paginas: number;
  /** Solo tiene valor para quien puede ver todas las agendas. */
  profesionales: { id: string; name: string }[];
}

export interface BuscarTurnosArgs {
  tenant: Tenant;
  sesion: SessionPayload;
  q?: string;
  pagina?: number;
  /** Filtro de estado. "todos" o un BookingStatus. */
  estado?: string;
  /** Solo lo obedece quien puede ver todas las agendas. */
  profesionalId?: string;
  /** "proximos" (default) | "pasados" | "todos" */
  rango?: string;
  /** Día puntual "YYYY-MM-DD". Si está, ignora `rango`. */
  fecha?: string;
}

export async function buscarTurnos({
  tenant,
  sesion,
  q = "",
  pagina = 1,
  estado = "todos",
  profesionalId,
  rango = "proximos",
  fecha,
}: BuscarTurnosArgs): Promise<AgendaPage> {
  const verTodas = roleCan(sesion.role, "bookings:view:all");

  if (!verTodas && !roleCan(sesion.role, "bookings:view:assigned")) {
    throw new AuthError("Tu usuario no puede ver turnos", "FORBIDDEN", 403);
  }

  // El ?profesional= de la URL solo lo obedece quien puede ver todas las
  // agendas. Para un profesional siempre se usa el de su sesión.
  const filtroProfesional = verTodas
    ? profesionalId || undefined
    : (sesion.professionalId ?? "__sin_ficha__");

  const [bookings, profesionales] = await Promise.all([
    db.listBookings(tenant.id, { professionalId: filtroProfesional }),
    verTodas ? db.listProfessionals(tenant.id) : Promise.resolve([]),
  ]);

  let detalles = await expandBookings(tenant.id, bookings);

  // --- Rango temporal ---
  const ahora = Date.now();
  if (fecha) {
    detalles = detalles.filter(
      (b) => toDateKey(b.startsAt, tenant.timezone) === fecha
    );
  } else if (rango === "proximos") {
    // Se incluye el día de hoy completo: un turno de esta mañana sigue siendo
    // relevante para marcar asistencia.
    const hoy = toDateKey(new Date(), tenant.timezone);
    detalles = detalles.filter(
      (b) => toDateKey(b.startsAt, tenant.timezone) >= hoy
    );
  } else if (rango === "pasados") {
    detalles = detalles.filter((b) => new Date(b.startsAt).getTime() < ahora);
  }

  // --- Estado ---
  if (estado !== "todos") {
    detalles = detalles.filter((b) => b.status === (estado as BookingStatus));
  }

  // --- Búsqueda: paciente, servicio o profesional ---
  const termino = norm(q.trim());
  if (termino) {
    detalles = detalles.filter((b) => {
      const campos = [
        b.client?.name,
        b.client?.email,
        b.service?.name,
        b.professional?.name,
      ];
      return campos.some((c) => c && norm(c).includes(termino));
    });
  }

  // Los próximos van de más cercano a más lejano; los pasados, al revés.
  const ascendente = !fecha && rango !== "pasados";
  detalles.sort((a, b) =>
    ascendente
      ? a.startsAt.localeCompare(b.startsAt)
      : b.startsAt.localeCompare(a.startsAt)
  );

  const total = detalles.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const desde = (actual - 1) * POR_PAGINA;
  const pagina_ = detalles.slice(desde, desde + POR_PAGINA);

  // --- Agrupar por día ---
  const porDia = new Map<string, BookingDetail[]>();
  for (const b of pagina_) {
    const key = toDateKey(b.startsAt, tenant.timezone);
    porDia.set(key, [...(porDia.get(key) ?? []), b]);
  }

  return {
    dias: [...porDia.entries()].map(([fecha, turnos]) => ({ fecha, turnos })),
    total,
    pagina: actual,
    paginas,
    profesionales: profesionales.map((p) => ({ id: p.id, name: p.name })),
  };
}

/**
 * Un turno puntual, con el alcance del rol aplicado.
 *
 * Devuelve null cuando existe pero no le corresponde a esta sesión, por el
 * mismo motivo que en pacientes: un 403 confirmaría que ese turno existe.
 */
export async function verTurno(
  tenant: Tenant,
  sesion: SessionPayload,
  bookingId: string
): Promise<BookingDetail | null> {
  const booking = await db.getBooking(tenant.id, bookingId);
  if (!booking) return null;

  if (!roleCan(sesion.role, "bookings:view:all")) {
    if (booking.professionalId !== sesion.professionalId) return null;
  }

  const [detalle] = await expandBookings(tenant.id, [booking]);
  return detalle ?? null;
}
