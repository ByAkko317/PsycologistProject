// =============================================================================
// Proveedor "mock": datos de ejemplo en memoria.
// Permite navegar la app completa sin crear ninguna cuenta externa.
// Se activa cuando NEXT_PUBLIC_DATA_PROVIDER=mock o cuando faltan credenciales.
// Los datos se pierden al reiniciar el servidor: es intencional.
// =============================================================================

import type { DataClient } from "./db";
import type {
  AvailabilitySlot,
  Booking,
  BookingFilters,
  Client,
  CreateBookingInput,
  Professional,
  Service,
  Tenant,
  UpdateBookingInput,
  User,
  WeeklyHours,
} from "@/lib/types";
import { computeAvailability, isSlotStillFree } from "@/lib/utils/availability";
import { addMinutesISO, toDateKey, wallTimeToISO } from "@/lib/utils/dates";

const TZ = "America/Argentina/Buenos_Aires";

const HORARIO_ESTANDAR: WeeklyHours = {
  1: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  2: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  3: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  4: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  5: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "17:00" }],
};

interface Store {
  tenants: Tenant[];
  services: Service[];
  professionals: Professional[];
  clients: Client[];
  bookings: Booking[];
  users: User[];
}

function seed(): Store {
  const tenantId = "tenant_demo";

  const tenants: Tenant[] = [
    {
      id: tenantId,
      slug: "demo",
      name: "Consultorio Bienestar",
      brandColor: "#6d28d9",
      timezone: TZ,
      currency: "ARS",
      cancellationHours: 24,
      slotIntervalMinutes: 30,
      businessHours: HORARIO_ESTANDAR,
      contactEmail: "hola@consultoriobienestar.test",
      contactPhone: "+5491100000000",
    },
  ];

  const professionals: Professional[] = [
    {
      id: "prof_1",
      tenantId,
      name: "Lic. Ana Torres",
      email: "ana@consultoriobienestar.test",
      phone: "+5491111111111",
      active: true,
      serviceIds: ["srv_1", "srv_2", "srv_4"],
    },
    {
      id: "prof_2",
      tenantId,
      name: "Lic. Martin Ruiz",
      email: "martin@consultoriobienestar.test",
      phone: "+5491122222222",
      active: true,
      serviceIds: ["srv_1", "srv_2", "srv_3"],
      workingHours: {
        1: [{ start: "13:00", end: "20:00" }],
        3: [{ start: "13:00", end: "20:00" }],
        5: [{ start: "10:00", end: "16:00" }],
      },
    },
    {
      id: "prof_3",
      tenantId,
      name: "Lic. Carla Gimenez",
      email: "carla@consultoriobienestar.test",
      active: true,
      serviceIds: ["srv_3", "srv_4"],
    },
  ];

  const services: Service[] = [
    {
      id: "srv_1",
      tenantId,
      name: "Primera consulta",
      description: "Entrevista inicial de admision y encuadre.",
      durationMinutes: 50,
      price: 18000,
      depositPercent: 30,
      active: true,
      professionalIds: ["prof_1", "prof_2"],
    },
    {
      id: "srv_2",
      tenantId,
      name: "Sesion individual",
      description: "Sesion de seguimiento, presencial u online.",
      durationMinutes: 50,
      price: 15000,
      depositPercent: 0,
      active: true,
      professionalIds: ["prof_1", "prof_2"],
    },
    {
      id: "srv_3",
      tenantId,
      name: "Terapia de pareja",
      description: "Sesion conjunta de 80 minutos.",
      durationMinutes: 80,
      price: 24000,
      depositPercent: 50,
      active: true,
      professionalIds: ["prof_2", "prof_3"],
    },
    {
      id: "srv_4",
      tenantId,
      name: "Evaluacion psicodiagnostica",
      description: "Administracion de tecnicas y devolucion escrita.",
      durationMinutes: 90,
      price: 32000,
      depositPercent: 50,
      active: true,
      professionalIds: ["prof_1", "prof_3"],
    },
  ];

  const clients: Client[] = [
    {
      id: "cli_1",
      tenantId,
      name: "Sofia Ramirez",
      email: "sofia@ejemplo.test",
      phone: "+5491133333333",
      createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    },
    {
      id: "cli_2",
      tenantId,
      name: "Diego Fernandez",
      email: "diego@ejemplo.test",
      phone: "+5491144444444",
      createdAt: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    },
  ];

  // Un par de turnos de ejemplo en los proximos dias, para que la agenda no
  // arranque vacia y la disponibilidad muestre huecos reales.
  const bookings: Booking[] = [];
  const hoy = new Date();
  const ejemplos: Array<[number, string, string, string, string]> = [
    [1, "10:00", "srv_2", "prof_1", "cli_1"],
    [1, "15:00", "srv_1", "prof_2", "cli_2"],
    [2, "11:00", "srv_3", "prof_2", "cli_1"],
  ];

  ejemplos.forEach(([diasAdelante, hora, serviceId, professionalId, clientId], i) => {
    const service = services.find((s) => s.id === serviceId)!;
    const dateKey = toDateKey(
      new Date(hoy.getTime() + diasAdelante * 86_400_000),
      TZ
    );
    const startsAt = wallTimeToISO(dateKey, hora, TZ);
    bookings.push({
      id: `bkg_seed_${i + 1}`,
      tenantId,
      serviceId,
      professionalId,
      clientId,
      startsAt,
      endsAt: addMinutesISO(startsAt, service.durationMinutes),
      status: "confirmed",
      paymentStatus: service.depositPercent > 0 ? "paid" : "not_required",
      amountTotal: service.price,
      amountPaid:
        service.depositPercent > 0
          ? Math.round((service.price * service.depositPercent) / 100)
          : 0,
      publicToken: `seed-token-${i + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // Usuarios demo. El hash corresponde a la contraseña "demo1234" y se
  // genera al vuelo la primera vez que alguien intenta entrar (ver
  // asegurarUsuariosDemo): no se hardcodea un hash en el repo.
  const users: User[] = [];

  return { tenants, services, professionals, clients, bookings, users };
}

/**
 * Crea los usuarios de demostracion la primera vez que se los necesita.
 *
 * Solo corre con el proveedor mock. Las contraseñas son publicas a proposito:
 * es un entorno de demostracion sin datos reales.
 *
 *   admin@demo.test     / demo1234   -> dueño
 *   ana@demo.test       / demo1234   -> profesional (Lic. Ana Torres)
 *   martin@demo.test    / demo1234   -> profesional (Lic. Martin Ruiz)
 *   sofia@ejemplo.test  / demo1234   -> paciente (con turnos ya cargados)
 */
let usuariosDemoListos = false;

export async function asegurarUsuariosDemo(): Promise<void> {
  if (usuariosDemoListos || store.users.length > 0) {
    usuariosDemoListos = true;
    return;
  }
  usuariosDemoListos = true;

  const { hashPassword } = await import("@/lib/auth/passwords");
  const hash = await hashPassword("demo1234");
  const tenantId = store.tenants[0]?.id ?? "tenant_demo";
  const ahora = new Date().toISOString();

  const definiciones: Array<Omit<User, "id" | "passwordHash" | "createdAt">> = [
    { tenantId, email: "admin@demo.test", name: "Dueño Demo", role: "owner", active: true },
    { tenantId, email: "ana@demo.test", name: "Lic. Ana Torres", role: "employee", active: true, professionalId: "prof_1" },
    { tenantId, email: "martin@demo.test", name: "Lic. Martin Ruiz", role: "employee", active: true, professionalId: "prof_2" },
    { tenantId, email: "sofia@ejemplo.test", name: "Sofia Ramirez", role: "client", active: true, clientId: "cli_1" },
    { tenantId, email: "diego@ejemplo.test", name: "Diego Fernandez", role: "client", active: true, clientId: "cli_2" },
  ];

  for (const def of definiciones) {
    store.users.push({
      ...def,
      id: uid("usr"),
      passwordHash: hash,
      createdAt: ahora,
    });
  }
}

// Sobrevive al hot reload de Next en desarrollo.
const globalStore = globalThis as unknown as { __turnosStore?: Store };
const store: Store = (globalStore.__turnosStore ??= seed());

const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function requireTenant(tenantId: string): Tenant {
  const tenant =
    store.tenants.find((t) => t.id === tenantId) ??
    store.tenants.find((t) => t.slug === tenantId);
  if (!tenant) throw new Error(`Tenant no encontrado: ${tenantId}`);
  return tenant;
}

export const mockClient: DataClient = {
  async getTenant(slugOrId) {
    return (
      store.tenants.find((t) => t.id === slugOrId || t.slug === slugOrId) ?? null
    );
  },

  async listTenants() {
    return [...store.tenants];
  },

  async updateTenant(tenantId, patch) {
    const tenant = requireTenant(tenantId);
    Object.assign(tenant, patch);
    return tenant;
  },

  async listServices(tenantId, opts) {
    const tenant = requireTenant(tenantId);
    return store.services.filter(
      (s) => s.tenantId === tenant.id && (!opts?.activeOnly || s.active)
    );
  },

  async getService(tenantId, serviceId) {
    const tenant = requireTenant(tenantId);
    return (
      store.services.find(
        (s) => s.id === serviceId && s.tenantId === tenant.id
      ) ?? null
    );
  },

  async saveService(tenantId, input) {
    const tenant = requireTenant(tenantId);
    if (input.id) {
      const existing = store.services.find((s) => s.id === input.id);
      if (!existing) throw new Error(`Servicio no encontrado: ${input.id}`);
      Object.assign(existing, input);
      return existing;
    }
    const created: Service = {
      id: uid("srv"),
      tenantId: tenant.id,
      name: input.name ?? "Servicio nuevo",
      description: input.description,
      durationMinutes: input.durationMinutes ?? 30,
      price: input.price ?? 0,
      depositPercent: input.depositPercent ?? 0,
      active: input.active ?? true,
      professionalIds: input.professionalIds ?? [],
    };
    store.services.push(created);
    return created;
  },

  async listProfessionals(tenantId, serviceId) {
    const tenant = requireTenant(tenantId);
    return store.professionals.filter(
      (p) =>
        p.tenantId === tenant.id &&
        p.active &&
        (!serviceId || p.serviceIds.includes(serviceId))
    );
  },

  async getProfessional(tenantId, professionalId) {
    const tenant = requireTenant(tenantId);
    return (
      store.professionals.find(
        (p) => p.id === professionalId && p.tenantId === tenant.id
      ) ?? null
    );
  },

  async listClients(tenantId) {
    const tenant = requireTenant(tenantId);
    return store.clients.filter((c) => c.tenantId === tenant.id);
  },

  async getClient(tenantId, clientId) {
    const tenant = requireTenant(tenantId);
    return (
      store.clients.find(
        (c) => c.id === clientId && c.tenantId === tenant.id
      ) ?? null
    );
  },

  async upsertClient(tenantId, input) {
    const tenant = requireTenant(tenantId);
    const key = (input.email ?? input.phone ?? "").toLowerCase();
    const existing = key
      ? store.clients.find(
          (c) =>
            c.tenantId === tenant.id &&
            ((c.email ?? "").toLowerCase() === key ||
              (c.phone ?? "").toLowerCase() === key)
        )
      : undefined;

    if (existing) {
      existing.name = input.name || existing.name;
      existing.email = input.email ?? existing.email;
      existing.phone = input.phone ?? existing.phone;
      if (input.notes) existing.notes = input.notes;
      return existing;
    }

    const created: Client = {
      id: uid("cli"),
      tenantId: tenant.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
    store.clients.push(created);
    return created;
  },

  async listBookings(tenantId, filters) {
    const tenant = requireTenant(tenantId);
    return store.bookings
      .filter((b) => b.tenantId === tenant.id)
      .filter((b) => !filters?.from || b.startsAt >= filters.from)
      .filter((b) => !filters?.to || b.startsAt <= filters.to)
      .filter(
        (b) =>
          !filters?.professionalId || b.professionalId === filters.professionalId
      )
      .filter((b) => !filters?.clientId || b.clientId === filters.clientId)
      .filter((b) => !filters?.status || filters.status.includes(b.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  async getBooking(tenantId, bookingId) {
    const tenant = requireTenant(tenantId);
    return (
      store.bookings.find(
        (b) => b.id === bookingId && b.tenantId === tenant.id
      ) ?? null
    );
  },

  async getBookingByToken(token) {
    return store.bookings.find((b) => b.publicToken === token) ?? null;
  },

  async createBooking(input) {
    const tenant = requireTenant(input.tenantId);
    const service = await mockClient.getService(tenant.id, input.serviceId);
    if (!service) throw new Error(`Servicio no encontrado: ${input.serviceId}`);

    const endsAt = addMinutesISO(input.startsAt, service.durationMinutes);
    const ocupados = store.bookings.filter((b) => b.tenantId === tenant.id);
    if (
      !isSlotStillFree(input.startsAt, endsAt, input.professionalId, ocupados)
    ) {
      throw new Error("SLOT_TAKEN");
    }

    const client = await mockClient.upsertClient(tenant.id, input.client);
    const requiresPayment =
      input.requiresPayment ?? service.depositPercent > 0;

    const booking: Booking = {
      id: uid("bkg"),
      tenantId: tenant.id,
      serviceId: service.id,
      professionalId: input.professionalId,
      clientId: client.id,
      startsAt: input.startsAt,
      endsAt,
      status: requiresPayment ? "pending_payment" : "confirmed",
      paymentStatus: requiresPayment ? "pending" : "not_required",
      amountTotal: service.price,
      amountPaid: 0,
      notes: input.notes,
      publicToken: uid("tok") + uid("tok"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.bookings.push(booking);
    return booking;
  },

  async updateBooking(tenantId, bookingId, patch) {
    const tenant = requireTenant(tenantId);
    const booking = store.bookings.find(
      (b) => b.id === bookingId && b.tenantId === tenant.id
    );
    if (!booking) throw new Error(`Turno no encontrado: ${bookingId}`);
    Object.assign(booking, patch, { updatedAt: new Date().toISOString() });
    return booking;
  },

  async getUserByEmail(tenantId, email) {
    const tenant = requireTenant(tenantId);
    await asegurarUsuariosDemo();
    const buscado = email.trim().toLowerCase();
    return (
      store.users.find(
        (u) => u.tenantId === tenant.id && u.email.toLowerCase() === buscado
      ) ?? null
    );
  },

  async getUserById(tenantId, userId) {
    const tenant = requireTenant(tenantId);
    await asegurarUsuariosDemo();
    return (
      store.users.find((u) => u.id === userId && u.tenantId === tenant.id) ?? null
    );
  },

  async listUsers(tenantId) {
    const tenant = requireTenant(tenantId);
    await asegurarUsuariosDemo();
    return store.users.filter((u) => u.tenantId === tenant.id);
  },

  async createUser(tenantId, input) {
    const tenant = requireTenant(tenantId);
    await asegurarUsuariosDemo();

    const email = input.email.trim().toLowerCase();
    if (store.users.some((u) => u.tenantId === tenant.id && u.email.toLowerCase() === email)) {
      throw new Error("EMAIL_TAKEN");
    }

    const creado: User = {
      id: uid("usr"),
      tenantId: tenant.id,
      email,
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
      active: input.active ?? true,
      professionalId: input.professionalId,
      clientId: input.clientId,
      createdAt: new Date().toISOString(),
    };
    store.users.push(creado);
    return creado;
  },

  async updateUser(tenantId, userId, patch) {
    const tenant = requireTenant(tenantId);
    const usuario = store.users.find(
      (u) => u.id === userId && u.tenantId === tenant.id
    );
    if (!usuario) throw new Error(`Usuario no encontrado: ${userId}`);
    Object.assign(usuario, patch);
    return usuario;
  },

  async getAvailability({ tenantId, serviceId, professionalId, dateKey }) {
    const tenant = requireTenant(tenantId);
    const [service, professional] = await Promise.all([
      mockClient.getService(tenant.id, serviceId),
      mockClient.getProfessional(tenant.id, professionalId),
    ]);
    if (!service || !professional) return [] as AvailabilitySlot[];

    return computeAvailability({
      tenant,
      service,
      professional,
      dateKey,
      existingBookings: store.bookings.filter((b) => b.tenantId === tenant.id),
    });
  },
};
