// =============================================================================
// Proveedor Airtable — implementacion concreta de DataClient sobre la REST API.
// Sin SDK: solo fetch, para no sumar dependencias.
// El esquema de tablas y columnas esperado esta documentado en
// docs/airtable-schema.md (y se puede generar con `pnpm seed:airtable`).
// =============================================================================

import { config } from "@/lib/config";
import type { DataClient } from "./db";
import type {
  AvailabilitySlot,
  Booking,
  Client,
  Professional,
  ClinicalNote,
  Service,
  Tenant,
  User,
  WeeklyHours,
} from "@/lib/types";
import { computeAvailability, isSlotStillFree } from "@/lib/utils/availability";
import { addMinutesISO } from "@/lib/utils/dates";

const API = "https://api.airtable.com/v0";

type Fields = Record<string, unknown>;
interface AirtableRecord {
  id: string;
  fields: Fields;
  createdTime: string;
}

// --- Cliente HTTP minimo -----------------------------------------------------

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API}/${config.airtable.baseId}/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.airtable.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(explicarError(res.status, path, body));
  }
  return (await res.json()) as T;
}

/**
 * Traduce los errores de Airtable a algo accionable.
 *
 * Airtable usa el mismo par de codigos para causas muy distintas: un 403
 * INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND puede ser "la tabla no existe" o "tu
 * token no la puede leer", y no lo aclara a proposito (decirlo confirmaria la
 * existencia de una tabla a un token ajeno). Es defendible de su parte, pero
 * deja al desarrollador mirando un 403 sin saber si el problema es el esquema
 * o el permiso. Se listan las dos causas y el comando que descarta la primera.
 */
function explicarError(status: number, path: string, body: string): string {
  const tabla = decodeURIComponent(path.split("?")[0].split("/")[0] ?? "");
  const crudo = `Airtable ${status} en ${path}: ${body}`;

  const noEncontrado =
    status === 404 || body.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND");
  if (!noEncontrado) return crudo;

  return (
    `${crudo}\n\n` +
    `  La tabla "${tabla}" no respondio. Suele ser una de dos cosas:\n\n` +
    `    a) La tabla no existe todavia en el Base. Pasa al agregar una tabla\n` +
    `       nueva al proyecto sobre un Base creado antes. Se arregla con:\n` +
    `           pnpm setup:airtable --aplicar\n\n` +
    `    b) El token no tiene acceso a esa tabla o al Base entero.\n\n` +
    `  Para saber cual de las dos es:  pnpm check:airtable`
  );
}

/** Lista todos los registros de una tabla, paginando hasta el final. */
async function listAll(
  table: string,
  params: Record<string, string> = {}
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const qs = new URLSearchParams({ pageSize: "100", ...params });
    if (offset) qs.set("offset", offset);
    const page = await request<{
      records: AirtableRecord[];
      offset?: string;
    }>(`${encodeURIComponent(table)}?${qs.toString()}`);
    out.push(...page.records);
    offset = page.offset;
  } while (offset);

  return out;
}

async function createRecord(
  table: string,
  fields: Fields
): Promise<AirtableRecord> {
  return request<AirtableRecord>(encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

async function updateRecord(
  table: string,
  id: string,
  fields: Fields
): Promise<AirtableRecord> {
  return request<AirtableRecord>(`${encodeURIComponent(table)}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

/** Escapa comillas para usar un valor dentro de filterByFormula. */
const q = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

const eqFormula = (field: string, value: string) =>
  `{${field}} = ${q(value)}`;

const andFormula = (...parts: string[]) => `AND(${parts.join(", ")})`;

// --- Serializacion de campos -------------------------------------------------

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : v == null || v === "" ? fallback : Number(v);

const bool = (v: unknown, fallback = false): boolean =>
  typeof v === "boolean" ? v : v == null ? fallback : Boolean(v);

/** Airtable guarda listas como texto separado por comas o como multi-select. */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Los horarios viajan como JSON dentro de un campo Long text. */
function parseHours(v: unknown): WeeklyHours | undefined {
  if (!v || typeof v !== "string") return undefined;
  try {
    const parsed = JSON.parse(v) as WeeklyHours;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// --- Mappers -----------------------------------------------------------------

function toTenant(r: AirtableRecord): Tenant {
  const f = r.fields;
  return {
    id: r.id,
    slug: str(f.slug, r.id),
    name: str(f.name, "Sin nombre"),
    logoUrl: str(f.logoUrl) || undefined,
    brandColor: str(f.brandColor, "#6d28d9"),
    timezone: str(f.timezone, "America/Argentina/Buenos_Aires"),
    currency: str(f.currency, "ARS"),
    cancellationHours: num(f.cancellationHours, 24),
    slotIntervalMinutes: num(f.slotIntervalMinutes, 30),
    businessHours: parseHours(f.businessHours) ?? {},
    contactEmail: str(f.contactEmail) || undefined,
    contactPhone: str(f.contactPhone) || undefined,
  };
}

function toService(r: AirtableRecord): Service {
  const f = r.fields;
  return {
    id: r.id,
    tenantId: str(f.tenantId),
    name: str(f.name, "Servicio"),
    description: str(f.description) || undefined,
    durationMinutes: num(f.durationMinutes, 30),
    price: num(f.price, 0),
    depositPercent: num(f.depositPercent, 0),
    active: bool(f.active, true),
    professionalIds: toList(f.professionalIds),
  };
}

function toProfessional(r: AirtableRecord): Professional {
  const f = r.fields;
  return {
    id: r.id,
    tenantId: str(f.tenantId),
    name: str(f.name, "Profesional"),
    email: str(f.email) || undefined,
    phone: str(f.phone) || undefined,
    avatarUrl: str(f.avatarUrl) || undefined,
    active: bool(f.active, true),
    serviceIds: toList(f.serviceIds),
    workingHours: parseHours(f.workingHours),
  };
}

function toClient(r: AirtableRecord): Client {
  const f = r.fields;
  return {
    id: r.id,
    tenantId: str(f.tenantId),
    name: str(f.name, "Cliente"),
    email: str(f.email) || undefined,
    phone: str(f.phone) || undefined,
    notes: str(f.notes) || undefined,
    createdAt: str(f.createdAt, r.createdTime),
  };
}

function toNote(r: AirtableRecord): ClinicalNote {
  const f = r.fields;
  return {
    id: r.id,
    tenantId: str(f.tenantId),
    clientId: str(f.clientId),
    authorUserId: str(f.authorUserId),
    authorName: str(f.authorName, "Desconocido"),
    bookingId: str(f.bookingId) || undefined,
    body: str(f.body),
    createdAt: str(f.createdAt, r.createdTime),
  };
}

function toUser(r: AirtableRecord): User {
  const f = r.fields;
  return {
    id: r.id,
    tenantId: str(f.tenantId),
    email: str(f.email).toLowerCase(),
    name: str(f.name, "Usuario"),
    role: (str(f.role, "client") as User["role"]) ?? "client",
    passwordHash: str(f.passwordHash),
    active: bool(f.active, true),
    professionalId: str(f.professionalId) || undefined,
    clientId: str(f.clientId) || undefined,
    createdAt: str(f.createdAt, r.createdTime),
    lastLoginAt: str(f.lastLoginAt) || undefined,
  };
}

function toBooking(r: AirtableRecord): Booking {
  const f = r.fields;
  return {
    id: r.id,
    tenantId: str(f.tenantId),
    serviceId: str(f.serviceId),
    professionalId: str(f.professionalId),
    clientId: str(f.clientId),
    startsAt: str(f.startsAt),
    endsAt: str(f.endsAt),
    status: (str(f.status, "confirmed") as Booking["status"]) ?? "confirmed",
    paymentStatus: (str(
      f.paymentStatus,
      "not_required"
    ) as Booking["paymentStatus"]) ?? "not_required",
    paymentId: str(f.paymentId) || undefined,
    amountTotal: num(f.amountTotal),
    amountPaid: num(f.amountPaid),
    notes: str(f.notes) || undefined,
    publicToken: str(f.publicToken),
    createdAt: str(f.createdAt, r.createdTime),
    updatedAt: str(f.updatedAt, r.createdTime),
    cancelledAt: str(f.cancelledAt) || undefined,
    cancellationReason: str(f.cancellationReason) || undefined,
    reminderSentAt: str(f.reminderSentAt) || undefined,
  };
}

// --- Resolucion de tenant ----------------------------------------------------

/** Acepta el record id o el slug y siempre devuelve el tenant completo. */
async function resolveTenant(slugOrId: string): Promise<Tenant | null> {
  if (slugOrId.startsWith("rec")) {
    try {
      const rec = await request<AirtableRecord>(
        `${encodeURIComponent(config.airtable.tables.tenants)}/${slugOrId}`
      );
      return toTenant(rec);
    } catch {
      // sigue por slug
    }
  }
  const records = await listAll(config.airtable.tables.tenants, {
    filterByFormula: eqFormula("slug", slugOrId),
    maxRecords: "1",
  });
  return records[0] ? toTenant(records[0]) : null;
}

async function requireTenantId(slugOrId: string): Promise<string> {
  const tenant = await resolveTenant(slugOrId);
  if (!tenant) throw new Error(`Tenant no encontrado: ${slugOrId}`);
  return tenant.id;
}

const T = config.airtable.tables;
const token = () =>
  `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

// --- Implementacion ----------------------------------------------------------

export const airtableClient: DataClient = {
  getTenant: resolveTenant,

  async listTenants() {
    return (await listAll(T.tenants)).map(toTenant);
  },

  async updateTenant(tenantId, patch) {
    const id = await requireTenantId(tenantId);
    const fields: Fields = {};
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.logoUrl !== undefined) fields.logoUrl = patch.logoUrl;
    if (patch.brandColor !== undefined) fields.brandColor = patch.brandColor;
    if (patch.timezone !== undefined) fields.timezone = patch.timezone;
    if (patch.currency !== undefined) fields.currency = patch.currency;
    if (patch.cancellationHours !== undefined)
      fields.cancellationHours = patch.cancellationHours;
    if (patch.slotIntervalMinutes !== undefined)
      fields.slotIntervalMinutes = patch.slotIntervalMinutes;
    if (patch.businessHours !== undefined)
      fields.businessHours = JSON.stringify(patch.businessHours);
    if (patch.contactEmail !== undefined)
      fields.contactEmail = patch.contactEmail;
    if (patch.contactPhone !== undefined)
      fields.contactPhone = patch.contactPhone;

    return toTenant(await updateRecord(T.tenants, id, fields));
  },

  async listServices(tenantId, opts) {
    const id = await requireTenantId(tenantId);
    const services = (
      await listAll(T.services, { filterByFormula: eqFormula("tenantId", id) })
    ).map(toService);
    return opts?.activeOnly ? services.filter((s) => s.active) : services;
  },

  async getService(tenantId, serviceId) {
    const services = await airtableClient.listServices(tenantId);
    return services.find((s) => s.id === serviceId) ?? null;
  },

  async saveService(tenantId, input) {
    const id = await requireTenantId(tenantId);
    const fields: Fields = {
      tenantId: id,
      name: input.name,
      description: input.description ?? "",
      durationMinutes: input.durationMinutes,
      price: input.price,
      depositPercent: input.depositPercent,
      active: input.active ?? true,
      professionalIds: (input.professionalIds ?? []).join(","),
    };
    Object.keys(fields).forEach(
      (k) => fields[k] === undefined && delete fields[k]
    );

    const record = input.id
      ? await updateRecord(T.services, input.id, fields)
      : await createRecord(T.services, fields);
    return toService(record);
  },

  async listProfessionals(tenantId, serviceId) {
    const id = await requireTenantId(tenantId);
    const professionals = (
      await listAll(T.professionals, {
        filterByFormula: eqFormula("tenantId", id),
      })
    )
      .map(toProfessional)
      .filter((p) => p.active);

    return serviceId
      ? professionals.filter((p) => p.serviceIds.includes(serviceId))
      : professionals;
  },

  async getProfessional(tenantId, professionalId) {
    const professionals = await airtableClient.listProfessionals(tenantId);
    return professionals.find((p) => p.id === professionalId) ?? null;
  },

  async listClients(tenantId) {
    const id = await requireTenantId(tenantId);
    return (
      await listAll(T.clients, { filterByFormula: eqFormula("tenantId", id) })
    ).map(toClient);
  },

  async getClient(tenantId, clientId) {
    const clients = await airtableClient.listClients(tenantId);
    return clients.find((c) => c.id === clientId) ?? null;
  },

  async upsertClient(tenantId, input) {
    const id = await requireTenantId(tenantId);

    const matchers: string[] = [];
    if (input.email) matchers.push(eqFormula("email", input.email));
    if (input.phone) matchers.push(eqFormula("phone", input.phone));

    if (matchers.length > 0) {
      const found = await listAll(T.clients, {
        filterByFormula: andFormula(
          eqFormula("tenantId", id),
          `OR(${matchers.join(", ")})`
        ),
        maxRecords: "1",
      });
      if (found[0]) {
        const merged: Fields = { name: input.name };
        if (input.email) merged.email = input.email;
        if (input.phone) merged.phone = input.phone;
        if (input.notes) merged.notes = input.notes;
        return toClient(await updateRecord(T.clients, found[0].id, merged));
      }
    }

    return toClient(
      await createRecord(T.clients, {
        tenantId: id,
        name: input.name,
        email: input.email ?? "",
        phone: input.phone ?? "",
        notes: input.notes ?? "",
        createdAt: new Date().toISOString(),
      })
    );
  },

  async listBookings(tenantId, filters) {
    const id = await requireTenantId(tenantId);

    const parts = [eqFormula("tenantId", id)];
    if (filters?.from) parts.push(`{startsAt} >= ${q(filters.from)}`);
    if (filters?.to) parts.push(`{startsAt} <= ${q(filters.to)}`);
    if (filters?.professionalId)
      parts.push(eqFormula("professionalId", filters.professionalId));
    if (filters?.clientId) parts.push(eqFormula("clientId", filters.clientId));

    const records = await listAll(T.bookings, {
      filterByFormula: parts.length > 1 ? andFormula(...parts) : parts[0],
    });

    return records
      .map(toBooking)
      .filter((b) => !filters?.status || filters.status.includes(b.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  async getBooking(tenantId, bookingId) {
    const id = await requireTenantId(tenantId);
    try {
      const record = await request<AirtableRecord>(
        `${encodeURIComponent(T.bookings)}/${bookingId}`
      );
      const booking = toBooking(record);
      return booking.tenantId === id ? booking : null;
    } catch {
      return null;
    }
  },

  async getBookingByToken(publicToken) {
    const records = await listAll(T.bookings, {
      filterByFormula: eqFormula("publicToken", publicToken),
      maxRecords: "1",
    });
    return records[0] ? toBooking(records[0]) : null;
  },

  async createBooking(input) {
    const id = await requireTenantId(input.tenantId);
    const service = await airtableClient.getService(id, input.serviceId);
    if (!service) throw new Error(`Servicio no encontrado: ${input.serviceId}`);

    const endsAt = addMinutesISO(input.startsAt, service.durationMinutes);

    // Relectura del dia para evitar doble reserva del mismo horario.
    const sameDay = await airtableClient.listBookings(id, {
      from: input.startsAt.slice(0, 10),
      to: `${input.startsAt.slice(0, 10)}T23:59:59+00:00`,
      professionalId: input.professionalId,
    });
    if (
      !isSlotStillFree(input.startsAt, endsAt, input.professionalId, sameDay)
    ) {
      throw new Error("SLOT_TAKEN");
    }

    const client = await airtableClient.upsertClient(id, input.client);
    const requiresPayment =
      input.requiresPayment ?? service.depositPercent > 0;
    const now = new Date().toISOString();

    return toBooking(
      await createRecord(T.bookings, {
        tenantId: id,
        serviceId: service.id,
        professionalId: input.professionalId,
        clientId: client.id,
        startsAt: input.startsAt,
        endsAt,
        status: requiresPayment ? "pending_payment" : "confirmed",
        paymentStatus: requiresPayment ? "pending" : "not_required",
        amountTotal: service.price,
        amountPaid: 0,
        notes: input.notes ?? "",
        publicToken: token(),
        createdAt: now,
        updatedAt: now,
      })
    );
  },

  async updateBooking(tenantId, bookingId, patch) {
    const fields: Fields = { ...patch, updatedAt: new Date().toISOString() };
    Object.keys(fields).forEach(
      (k) => fields[k] === undefined && delete fields[k]
    );
    return toBooking(await updateRecord(T.bookings, bookingId, fields));
  },

  async listNotes(tenantId, clientId) {
    const id = await requireTenantId(tenantId);
    const records = await listAll(T.notes, {
      filterByFormula: andFormula(
        eqFormula("tenantId", id),
        eqFormula("clientId", clientId)
      ),
    });
    return records
      .map(toNote)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createNote(tenantId, input) {
    const id = await requireTenantId(tenantId);
    return toNote(
      await createRecord(T.notes, {
        tenantId: id,
        clientId: input.clientId,
        authorUserId: input.authorUserId,
        authorName: input.authorName,
        bookingId: input.bookingId ?? "",
        body: input.body,
        createdAt: new Date().toISOString(),
      })
    );
  },

  async getUserByEmail(tenantId, email) {
    const id = await requireTenantId(tenantId);
    const buscado = email.trim().toLowerCase();

    const records = await listAll(T.users, {
      filterByFormula: andFormula(
        eqFormula("tenantId", id),
        `LOWER({email}) = ${q(buscado)}`
      ),
      maxRecords: "1",
    });
    return records[0] ? toUser(records[0]) : null;
  },

  async getUserById(tenantId, userId) {
    const id = await requireTenantId(tenantId);
    try {
      const record = await request<AirtableRecord>(
        `${encodeURIComponent(T.users)}/${userId}`
      );
      const user = toUser(record);
      return user.tenantId === id ? user : null;
    } catch {
      return null;
    }
  },

  async listUsers(tenantId) {
    const id = await requireTenantId(tenantId);
    return (
      await listAll(T.users, { filterByFormula: eqFormula("tenantId", id) })
    ).map(toUser);
  },

  async createUser(tenantId, input) {
    const id = await requireTenantId(tenantId);
    const email = input.email.trim().toLowerCase();

    // Airtable no tiene constraint de unicidad: se chequea antes.
    const existente = await airtableClient.getUserByEmail(id, email);
    if (existente) throw new Error("EMAIL_TAKEN");

    return toUser(
      await createRecord(T.users, {
        tenantId: id,
        email,
        name: input.name,
        role: input.role,
        passwordHash: input.passwordHash,
        active: input.active ?? true,
        professionalId: input.professionalId ?? "",
        clientId: input.clientId ?? "",
        createdAt: new Date().toISOString(),
      })
    );
  },

  async updateUser(tenantId, userId, patch) {
    const fields: Fields = { ...patch };
    delete (fields as Record<string, unknown>).id;
    delete (fields as Record<string, unknown>).tenantId;
    Object.keys(fields).forEach(
      (k) => fields[k] === undefined && delete fields[k]
    );
    return toUser(await updateRecord(T.users, userId, fields));
  },

  async getAvailability({ tenantId, serviceId, professionalId, dateKey }) {
    const tenant = await resolveTenant(tenantId);
    if (!tenant) return [] as AvailabilitySlot[];

    const [service, professional, bookings] = await Promise.all([
      airtableClient.getService(tenant.id, serviceId),
      airtableClient.getProfessional(tenant.id, professionalId),
      airtableClient.listBookings(tenant.id, { professionalId }),
    ]);
    if (!service || !professional) return [];

    return computeAvailability({
      tenant,
      service,
      professional,
      dateKey,
      existingBookings: bookings,
    });
  },
};
