// =============================================================================
// Modelo de dominio — compartido por todos los proveedores de datos.
// Toda entidad lleva tenantId: el sistema es multi-tenant (white-label).
// =============================================================================

/** Franja horaria dentro de un dia. Formato "HH:mm" en 24h. */
export interface TimeRange {
  start: string;
  end: string;
}

/**
 * Horario semanal. La clave es el dia de la semana segun Date#getDay():
 * 0 = domingo ... 6 = sabado. Un dia sin franjas = cerrado.
 */
export type WeeklyHours = Partial<Record<number, TimeRange[]>>;

export interface Tenant {
  id: string;
  /** Identificador en la URL: /book?tenant=demo */
  slug: string;
  name: string;
  logoUrl?: string;
  /** Color de marca en hex, ej "#6d28d9". */
  brandColor: string;
  /** IANA timezone, ej "America/Argentina/Buenos_Aires". */
  timezone: string;
  currency: string;
  /** Horas minimas de anticipacion para cancelar o reprogramar. */
  cancellationHours: number;
  /** Granularidad de la grilla de turnos, en minutos. */
  slotIntervalMinutes: number;
  businessHours: WeeklyHours;
  contactEmail?: string;
  contactPhone?: string;
}

export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  /**
   * Porcentaje del precio que se cobra como seña al reservar (0-100).
   * 0 = no requiere pago por adelantado.
   */
  depositPercent: number;
  active: boolean;
  /** Profesionales habilitados para este servicio. */
  professionalIds: string[];
}

export interface Professional {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  active: boolean;
  /** Servicios que puede prestar. */
  serviceIds: string[];
  /** Si esta definido, pisa el horario del negocio para este profesional. */
  workingHours?: WeeklyHours;
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Roles del sistema.
 *   owner    — dueño del negocio: ve y edita todo el tenant
 *   employee — profesional: solo SU agenda y sus turnos
 *   client   — paciente: solo SUS turnos
 */
export type UserRole = "owner" | "employee" | "client";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  /** Hash scrypt. Nunca sale de la capa de datos hacia la UI. */
  passwordHash: string;
  active: boolean;
  /** Solo para role=employee: a que profesional corresponde. */
  professionalId?: string;
  /** Solo para role=client: a que registro de Clients corresponde. */
  clientId?: string;
  createdAt: string;
  lastLoginAt?: string;
}

/** User sin el hash, que es lo unico que puede viajar a un componente. */
export type SafeUser = Omit<User, "passwordHash">;

export function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...resto } = user;
  return resto;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  professionalId?: string;
  clientId?: string;
  active?: boolean;
}

/**
 * Nota clínica sobre un paciente.
 *
 * Va en su propia tabla y no como texto dentro de Clients por dos razones:
 * cada nota necesita su propia marca de tiempo y su autor, y un campo de texto
 * que se va concatenando no permite saber quién escribió qué ni filtrar por
 * autor — que es justo lo que exige la regla de privacidad.
 *
 * Es inmutable a propósito: no se edita ni se borra. Una historia clínica que
 * se puede reescribir sin dejar rastro no sirve como registro.
 */
export interface ClinicalNote {
  id: string;
  tenantId: string;
  clientId: string;
  /** Usuario que la escribió. Define quién puede leerla. */
  authorUserId: string;
  /** Se guarda el nombre además del id: si el usuario se da de baja, la nota
   *  sigue diciendo quién la firmó. */
  authorName: string;
  /** Turno en el contexto del cual se escribió, si aplica. */
  bookingId?: string;
  body: string;
  createdAt: string;
}

export interface CreateNoteInput {
  clientId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  bookingId?: string;
}

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type PaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "refunded"
  | "failed";

export interface Booking {
  id: string;
  tenantId: string;
  serviceId: string;
  professionalId: string;
  clientId: string;
  /** Inicio del turno en ISO 8601 con offset. */
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  /** ID del pago en Mercado Pago, cuando existe. */
  paymentId?: string;
  amountTotal: number;
  amountPaid: number;
  notes?: string;
  /** Token opaco que le permite al cliente gestionar el turno en /portal. */
  publicToken: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
  /** Se completa cuando n8n ya mando el recordatorio de 24hs. Evita duplicados. */
  reminderSentAt?: string;
}

/** Un turno con sus entidades relacionadas ya resueltas, para mostrar en UI. */
export interface BookingDetail extends Booking {
  service?: Service;
  professional?: Professional;
  client?: Client;
  tenant?: Tenant;
}

/** Horario candidato devuelto por getAvailability. */
export interface AvailabilitySlot {
  /** Inicio del slot en ISO 8601. */
  startsAt: string;
  endsAt: string;
  /** "HH:mm" listo para mostrar. */
  label: string;
  available: boolean;
}

// --- Entradas de escritura ---------------------------------------------------

export interface CreateBookingInput {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  client: { name: string; email?: string; phone?: string; notes?: string };
  startsAt: string;
  notes?: string;
  /** Si el servicio pide senia, el turno nace en pending_payment. */
  requiresPayment?: boolean;
}

export type UpdateBookingInput = Partial<
  Pick<
    Booking,
    | "status"
    | "paymentStatus"
    | "paymentId"
    | "amountPaid"
    | "notes"
    | "startsAt"
    | "endsAt"
    | "professionalId"
    | "cancelledAt"
    | "cancellationReason"
    | "reminderSentAt"
  >
>;

export interface BookingFilters {
  from?: string;
  to?: string;
  professionalId?: string;
  clientId?: string;
  status?: BookingStatus[];
}
