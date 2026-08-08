// =============================================================================
// Punto UNICO de acceso a datos.
// El resto de la app importa siempre `db` desde aca y nunca un proveedor
// concreto. Cambiar de Airtable a Firebase es cambiar una variable de entorno.
// =============================================================================

import { resolveDataProvider } from "@/lib/config";
import type {
  AvailabilitySlot,
  Booking,
  BookingDetail,
  BookingFilters,
  Client,
  CreateBookingInput,
  CreateUserInput,
  Professional,
  Service,
  Tenant,
  UpdateBookingInput,
  User,
} from "@/lib/types";

export interface DataClient {
  // --- Tenants ---
  getTenant(slugOrId: string): Promise<Tenant | null>;
  listTenants(): Promise<Tenant[]>;
  updateTenant(tenantId: string, patch: Partial<Tenant>): Promise<Tenant>;

  // --- Catalogo ---
  listServices(
    tenantId: string,
    opts?: { activeOnly?: boolean }
  ): Promise<Service[]>;
  getService(tenantId: string, serviceId: string): Promise<Service | null>;
  saveService(
    tenantId: string,
    service: Partial<Service> & { id?: string }
  ): Promise<Service>;

  listProfessionals(
    tenantId: string,
    serviceId?: string
  ): Promise<Professional[]>;
  getProfessional(
    tenantId: string,
    professionalId: string
  ): Promise<Professional | null>;

  // --- CRM ---
  listClients(tenantId: string): Promise<Client[]>;
  getClient(tenantId: string, clientId: string): Promise<Client | null>;
  upsertClient(
    tenantId: string,
    input: { name: string; email?: string; phone?: string; notes?: string }
  ): Promise<Client>;

  // --- Turnos ---
  listBookings(tenantId: string, filters?: BookingFilters): Promise<Booking[]>;
  getBooking(tenantId: string, bookingId: string): Promise<Booking | null>;
  getBookingByToken(token: string): Promise<Booking | null>;
  createBooking(input: CreateBookingInput): Promise<Booking>;
  updateBooking(
    tenantId: string,
    bookingId: string,
    patch: UpdateBookingInput
  ): Promise<Booking>;

  // --- Usuarios y autenticacion ---
  /** Busca por email dentro del tenant. Devuelve el User COMPLETO (con hash). */
  getUserByEmail(tenantId: string, email: string): Promise<User | null>;
  getUserById(tenantId: string, userId: string): Promise<User | null>;
  listUsers(tenantId: string): Promise<User[]>;
  createUser(tenantId: string, input: CreateUserInput): Promise<User>;
  updateUser(
    tenantId: string,
    userId: string,
    patch: Partial<Omit<User, "id" | "tenantId">>
  ): Promise<User>;

  // --- Disponibilidad ---
  getAvailability(args: {
    tenantId: string;
    serviceId: string;
    professionalId: string;
    dateKey: string;
  }): Promise<AvailabilitySlot[]>;
}

let cached: DataClient | null = null;

/** Instancia del proveedor activo (lazy, cacheada por proceso). */
export function getDb(): DataClient {
  if (cached) return cached;

  const provider = resolveDataProvider();
  switch (provider) {
    case "airtable": {
      const { airtableClient } = require("./db.airtable");
      cached = airtableClient as DataClient;
      break;
    }
    case "firebase": {
      const { firebaseClient } = require("./db.firebase");
      cached = firebaseClient as DataClient;
      break;
    }
    default: {
      const { mockClient } = require("./db.mock");
      cached = mockClient as DataClient;
      break;
    }
  }
  return cached!;
}

/** Azucar sintactico: `db.listServices(...)` sin llamar a getDb() cada vez. */
export const db: DataClient = new Proxy({} as DataClient, {
  get(_target, prop: string) {
    const client = getDb() as unknown as Record<string, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Turno con servicio, profesional, cliente y tenant ya resueltos. */
export async function getBookingDetail(
  tenantId: string,
  booking: Booking
): Promise<BookingDetail> {
  const [service, professional, client, tenant] = await Promise.all([
    db.getService(tenantId, booking.serviceId),
    db.getProfessional(tenantId, booking.professionalId),
    db.getClient(tenantId, booking.clientId),
    db.getTenant(tenantId),
  ]);

  return {
    ...booking,
    service: service ?? undefined,
    professional: professional ?? undefined,
    client: client ?? undefined,
    tenant: tenant ?? undefined,
  };
}

/** Resuelve varios turnos a la vez sin repetir lecturas del catalogo. */
export async function expandBookings(
  tenantId: string,
  bookings: Booking[]
): Promise<BookingDetail[]> {
  const [services, professionals, clients, tenant] = await Promise.all([
    db.listServices(tenantId),
    db.listProfessionals(tenantId),
    db.listClients(tenantId),
    db.getTenant(tenantId),
  ]);

  const byId = <T extends { id: string }>(items: T[]) =>
    new Map(items.map((i) => [i.id, i]));

  const serviceMap = byId(services);
  const professionalMap = byId(professionals);
  const clientMap = byId(clients);

  return bookings.map((b) => ({
    ...b,
    service: serviceMap.get(b.serviceId),
    professional: professionalMap.get(b.professionalId),
    client: clientMap.get(b.clientId),
    tenant: tenant ?? undefined,
  }));
}
