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
   * Porcentaje del precio que se cobra como senia al reservar (0-100).
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
  >
>;

export interface BookingFilters {
  from?: string;
  to?: string;
  professionalId?: string;
  clientId?: string;
  status?: BookingStatus[];
}
