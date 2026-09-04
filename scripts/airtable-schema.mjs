/**
 * Definición del esquema de Airtable, en un solo lugar.
 *
 * La usan `pnpm check:airtable` (para diagnosticar qué falta) y
 * `pnpm setup:airtable` (para crearlo). Tener una única fuente evita que el
 * diagnóstico y la creación se contradigan, que es como se termina con una
 * base "verificada" que igual no funciona.
 *
 * Tiene que coincidir con docs/airtable-schema.md y con los mappers de
 * lib/services/db.airtable.ts.
 */

const texto = (name) => ({ name, type: "singleLineText" });
const largo = (name) => ({ name, type: "multilineText" });
const email = (name) => ({ name, type: "email" });
const tel = (name) => ({ name, type: "phoneNumber" });
const url = (name) => ({ name, type: "url" });
const entero = (name) => ({
  name,
  type: "number",
  options: { precision: 0 },
});
const decimal = (name) => ({
  name,
  type: "number",
  options: { precision: 2 },
});
const casilla = (name) => ({
  name,
  type: "checkbox",
  options: { icon: "check", color: "greenBright" },
});
const opciones = (name, valores) => ({
  name,
  type: "singleSelect",
  options: { choices: valores.map((v) => ({ name: v })) },
});

/**
 * El PRIMER campo de cada tabla es el campo primario de Airtable, que no puede
 * ser checkbox ni número. Por eso todas arrancan con un campo de texto.
 *
 * Las fechas van como texto y no como campo Date a propósito: Airtable
 * normaliza los Date a UTC y pierde el offset del tenant, lo que rompe el
 * cálculo de disponibilidad en zonas con horario de verano.
 */
export const ESQUEMA = [
  {
    tabla: "Tenants",
    envVar: "AIRTABLE_TABLE_TENANTS",
    descripcion: "Negocios (multi-tenant). Uno por consultorio.",
    campos: [
      texto("slug"),
      texto("name"),
      url("logoUrl"),
      texto("brandColor"),
      texto("timezone"),
      texto("currency"),
      entero("cancellationHours"),
      entero("slotIntervalMinutes"),
      largo("businessHours"),
      email("contactEmail"),
      tel("contactPhone"),
    ],
  },
  {
    tabla: "Services",
    envVar: "AIRTABLE_TABLE_SERVICES",
    descripcion: "Catálogo de servicios que se pueden reservar.",
    campos: [
      texto("name"),
      texto("tenantId"),
      largo("description"),
      entero("durationMinutes"),
      decimal("price"),
      entero("depositPercent"),
      casilla("active"),
      largo("professionalIds"),
    ],
  },
  {
    tabla: "Professionals",
    envVar: "AIRTABLE_TABLE_PROFESSIONALS",
    descripcion: "Fichas de los profesionales que atienden.",
    campos: [
      texto("name"),
      texto("tenantId"),
      email("email"),
      tel("phone"),
      url("avatarUrl"),
      casilla("active"),
      largo("serviceIds"),
      largo("workingHours"),
    ],
  },
  {
    tabla: "Clients",
    envVar: "AIRTABLE_TABLE_CLIENTS",
    descripcion: "Pacientes. Se crean solos al reservar.",
    campos: [
      texto("name"),
      texto("tenantId"),
      email("email"),
      tel("phone"),
      largo("notes"),
      texto("createdAt"),
    ],
  },
  {
    tabla: "Bookings",
    envVar: "AIRTABLE_TABLE_BOOKINGS",
    descripcion: "Turnos.",
    campos: [
      texto("startsAt"),
      texto("tenantId"),
      texto("serviceId"),
      texto("professionalId"),
      texto("clientId"),
      texto("endsAt"),
      opciones("status", [
        "pending_payment",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ]),
      opciones("paymentStatus", [
        "not_required",
        "pending",
        "paid",
        "refunded",
        "failed",
      ]),
      texto("paymentId"),
      decimal("amountTotal"),
      decimal("amountPaid"),
      largo("notes"),
      texto("publicToken"),
      texto("createdAt"),
      texto("updatedAt"),
      texto("cancelledAt"),
      largo("cancellationReason"),
      texto("reminderSentAt"),
    ],
  },
  {
    tabla: "Notes",
    envVar: "AIRTABLE_TABLE_NOTES",
    descripcion:
      "Notas clínicas por paciente. Contiene datos de salud: restringí los permisos de esta tabla.",
    campos: [
      texto("createdAt"),
      texto("tenantId"),
      texto("clientId"),
      texto("authorUserId"),
      texto("authorName"),
      texto("bookingId"),
      largo("body"),
    ],
  },
  {
    tabla: "Users",
    envVar: "AIRTABLE_TABLE_USERS",
    descripcion:
      "Login de dueño, profesional y paciente. Restringí los permisos de esta tabla.",
    campos: [
      texto("email"),
      texto("tenantId"),
      texto("name"),
      opciones("role", ["owner", "employee", "client"]),
      texto("passwordHash"),
      casilla("active"),
      texto("professionalId"),
      texto("clientId"),
      texto("createdAt"),
      texto("lastLoginAt"),
    ],
  },
];

/** Nombre real de la tabla, respetando el override por variable de entorno. */
export function nombreDeTabla(def, env = process.env) {
  return (env[def.envVar] || "").trim() || def.tabla;
}
