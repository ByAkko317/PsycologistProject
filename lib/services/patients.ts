// =============================================================================
// Consultas de pacientes: alcance por rol, búsqueda y paginado.
//
// Todo el filtrado vive acá y no en las páginas, para que la regla de alcance
// —qué pacientes puede ver cada rol— sea imposible de olvidar en una vista
// nueva. Las páginas piden datos; nunca deciden a quién pueden mostrar.
//
// La paginación es en memoria. Con volúmenes de consultorio (miles de
// pacientes) alcanza, y evita atarnos a las capacidades de filtrado de un
// proveedor puntual. Si algún tenant crece lo suficiente, el lugar para
// arreglarlo es este archivo.
// =============================================================================

import { AuthError, type SessionPayload } from "@/lib/auth/session";
import { puedeLeerNota, roleCan } from "@/lib/auth/permissions";
import { db, expandBookings } from "@/lib/services/db";
import type {
  Booking,
  BookingDetail,
  Client,
  ClinicalNote,
  Tenant,
} from "@/lib/types";

export const POR_PAGINA = 12;

/** Un paciente con lo que hace falta para la fila del listado. */
export interface PatientRow {
  client: Client;
  turnos: number;
  /** Turnos que efectivamente ocurrieron. */
  atendidos: number;
  ultimoTurno?: string;
  proximoTurno?: string;
  /** Total cobrado. Solo se completa para quien puede ver plata. */
  cobrado: number | null;
}

export interface PatientPage {
  filas: PatientRow[];
  total: number;
  pagina: number;
  paginas: number;
  /** True si el listado está recortado por el alcance del rol. */
  alcanceLimitado: boolean;
}

/** Normaliza para buscar sin acentos ni distinción de mayúsculas. */
function norm(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Pacientes que la sesión puede ver.
 *
 * El profesional solo alcanza a quienes atendió: el cruce se hace por sus
 * turnos, no por un parámetro de la URL. Es lo que impide que cambiando un id
 * acceda al padrón completo del consultorio.
 */
async function alcance(
  tenant: Tenant,
  sesion: SessionPayload
): Promise<{ clientes: Client[]; bookings: Booking[]; limitado: boolean }> {
  const todos = await db.listClients(tenant.id);

  if (roleCan(sesion.role, "clients:view:all")) {
    return {
      clientes: todos,
      bookings: await db.listBookings(tenant.id),
      limitado: false,
    };
  }

  if (!roleCan(sesion.role, "clients:view:attended")) {
    throw new AuthError("Tu usuario no puede ver pacientes", "FORBIDDEN", 403);
  }

  // Sin ficha profesional vinculada no atendió a nadie: lista vacía, no error.
  if (!sesion.professionalId) {
    return { clientes: [], bookings: [], limitado: true };
  }

  const mios = await db.listBookings(tenant.id, {
    professionalId: sesion.professionalId,
  });
  const atendidos = new Set(mios.map((b) => b.clientId));

  return {
    clientes: todos.filter((c) => atendidos.has(c.id)),
    bookings: mios,
    limitado: true,
  };
}

export interface BuscarPacientesArgs {
  tenant: Tenant;
  sesion: SessionPayload;
  q?: string;
  pagina?: number;
  /** "todos" | "activos" (con turnos futuros) | "sin-turnos" */
  filtro?: string;
}

export async function buscarPacientes({
  tenant,
  sesion,
  q = "",
  pagina = 1,
  filtro = "todos",
}: BuscarPacientesArgs): Promise<PatientPage> {
  const { clientes, bookings, limitado } = await alcance(tenant, sesion);
  const veImportes = roleCan(sesion.role, "money:view");
  const ahora = Date.now();

  // Índice de turnos por paciente, para no recorrer la lista una vez por fila.
  const porCliente = new Map<string, Booking[]>();
  for (const b of bookings) {
    porCliente.set(b.clientId, [...(porCliente.get(b.clientId) ?? []), b]);
  }

  let filas: PatientRow[] = clientes.map((client) => {
    const suyos = (porCliente.get(client.id) ?? []).filter(
      (b) => b.status !== "cancelled"
    );
    const pasados = suyos
      .filter((b) => new Date(b.startsAt).getTime() < ahora)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const futuros = suyos
      .filter((b) => new Date(b.startsAt).getTime() >= ahora)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    return {
      client,
      turnos: suyos.length,
      atendidos: suyos.filter((b) => b.status === "completed").length,
      ultimoTurno: pasados[0]?.startsAt,
      proximoTurno: futuros[0]?.startsAt,
      cobrado: veImportes
        ? suyos.reduce((acc, b) => acc + b.amountPaid, 0)
        : null,
    };
  });

  // --- Búsqueda: nombre, email o teléfono ---
  const termino = norm(q.trim());
  if (termino) {
    // El teléfono se compara sin separadores: "+54 9 11 1234" tiene que
    // encontrarse escribiendo "91112 34".
    const soloDigitos = termino.replace(/\D/g, "");

    filas = filas.filter(({ client }) => {
      if (norm(client.name).includes(termino)) return true;
      if (client.email && norm(client.email).includes(termino)) return true;
      if (
        soloDigitos.length >= 3 &&
        client.phone &&
        client.phone.replace(/\D/g, "").includes(soloDigitos)
      ) {
        return true;
      }
      return false;
    });
  }

  // --- Filtro ---
  if (filtro === "activos") {
    filas = filas.filter((f) => f.proximoTurno);
  } else if (filtro === "sin-turnos") {
    filas = filas.filter((f) => f.turnos === 0);
  }

  // Más recientes primero: quien tiene un turno próximo sube.
  filas.sort((a, b) => {
    if (a.proximoTurno && b.proximoTurno) {
      return a.proximoTurno.localeCompare(b.proximoTurno);
    }
    if (a.proximoTurno) return -1;
    if (b.proximoTurno) return 1;
    return (b.ultimoTurno ?? "").localeCompare(a.ultimoTurno ?? "");
  });

  const total = filas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const desde = (actual - 1) * POR_PAGINA;

  return {
    filas: filas.slice(desde, desde + POR_PAGINA),
    total,
    pagina: actual,
    paginas,
    alcanceLimitado: limitado,
  };
}

export interface PatientDetail {
  client: Client;
  turnos: BookingDetail[];
  notas: ClinicalNote[];
  /** Notas que existen pero esta sesión no puede leer. */
  notasOcultas: number;
  puedeEscribirNota: boolean;
  veImportes: boolean;
}

/**
 * Ficha completa de un paciente.
 *
 * Devuelve null —no lanza— cuando el paciente existe pero está fuera del
 * alcance del rol. La página lo traduce a 404: un 403 confirmaría que ese
 * paciente existe en el consultorio, que ya es información.
 */
export async function verPaciente(
  tenant: Tenant,
  sesion: SessionPayload,
  clientId: string
): Promise<PatientDetail | null> {
  const { clientes, bookings } = await alcance(tenant, sesion);

  const client = clientes.find((c) => c.id === clientId);
  if (!client) return null;

  const suyos = bookings
    .filter((b) => b.clientId === clientId)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const todasLasNotas = await db.listNotes(tenant.id, clientId);
  const visibles = todasLasNotas.filter((n) =>
    puedeLeerNota(sesion, n.authorUserId)
  );

  return {
    client,
    turnos: await expandBookings(tenant.id, suyos),
    notas: visibles,
    notasOcultas: todasLasNotas.length - visibles.length,
    puedeEscribirNota: roleCan(sesion.role, "notes:write"),
    veImportes: roleCan(sesion.role, "money:view"),
  };
}

/**
 * Agrega una nota. Verifica el alcance antes de escribir: sin esto, alguien
 * podría anotar sobre un paciente que no atiende mandando su id.
 */
export async function agregarNota(
  tenant: Tenant,
  sesion: SessionPayload,
  clientId: string,
  body: string
): Promise<ClinicalNote> {
  if (!roleCan(sesion.role, "notes:write")) {
    throw new AuthError("Tu usuario no puede escribir notas", "FORBIDDEN", 403);
  }

  const texto = body.trim();
  if (texto.length < 2) throw new Error("La nota está vacía");
  if (texto.length > 5000) throw new Error("La nota es demasiado larga");

  const { clientes } = await alcance(tenant, sesion);
  if (!clientes.some((c) => c.id === clientId)) {
    throw new AuthError("Paciente fuera de tu alcance", "FORBIDDEN", 403);
  }

  return db.createNote(tenant.id, {
    clientId,
    authorUserId: sesion.uid,
    authorName: sesion.name,
    body: texto,
  });
}
