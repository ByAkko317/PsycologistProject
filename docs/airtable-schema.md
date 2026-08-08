# Esquema de Airtable

El proveedor `db.airtable.ts` espera **5 tablas** dentro de un mismo Base.
Los nombres de tabla se pueden cambiar desde `.env.local`
(`AIRTABLE_TABLE_*`), pero **los nombres de columna deben coincidir
exactamente** con los de abajo (Airtable distingue mayusculas).

> Regla general: todas las tablas menos `Tenants` llevan una columna
> `tenantId` de tipo **Single line text** con el *record ID* del tenant
> (ej. `recXXXXXXXXXXXXXX`). Es lo que hace multi-tenant al sistema.

---

## 1. `Tenants`

| Columna | Tipo Airtable | Notas |
|---|---|---|
| `slug` | Single line text | Identificador en la URL: `/book?tenant=demo` |
| `name` | Single line text | Nombre visible del negocio |
| `logoUrl` | URL | Opcional |
| `brandColor` | Single line text | Hex, ej. `#6d28d9` |
| `timezone` | Single line text | IANA, ej. `America/Argentina/Buenos_Aires` |
| `currency` | Single line text | ej. `ARS` |
| `cancellationHours` | Number (integer) | Anticipacion minima para cancelar |
| `slotIntervalMinutes` | Number (integer) | Granularidad de la grilla, ej. `30` |
| `businessHours` | Long text | **JSON** (ver formato abajo) |
| `contactEmail` | Email | Opcional |
| `contactPhone` | Phone | Opcional |

### Formato de `businessHours`

JSON donde la clave es el dia de la semana (`0` = domingo … `6` = sabado).
Un dia ausente significa **cerrado**.

```json
{
  "1": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
  "2": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
  "3": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
  "4": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
  "5": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"17:00"}]
}
```

---

## 2. `Services`

| Columna | Tipo Airtable | Notas |
|---|---|---|
| `tenantId` | Single line text | Record ID del tenant |
| `name` | Single line text | |
| `description` | Long text | Opcional |
| `durationMinutes` | Number (integer) | Duracion del turno |
| `price` | Number (decimal) | Precio total |
| `depositPercent` | Number (integer) | `0` = sin senia; `30` = 30% por adelantado |
| `active` | Checkbox | Solo los activos aparecen en `/book` |
| `professionalIds` | Long text | Record IDs separados por coma |

---

## 3. `Professionals`

| Columna | Tipo Airtable | Notas |
|---|---|---|
| `tenantId` | Single line text | |
| `name` | Single line text | |
| `email` | Email | Opcional |
| `phone` | Phone | Opcional |
| `avatarUrl` | URL | Opcional |
| `active` | Checkbox | |
| `serviceIds` | Long text | Record IDs separados por coma |
| `workingHours` | Long text | JSON, mismo formato que `businessHours`. Vacio = hereda el horario del negocio |

---

## 4. `Clients`

| Columna | Tipo Airtable | Notas |
|---|---|---|
| `tenantId` | Single line text | |
| `name` | Single line text | |
| `email` | Email | Se usa como clave de deduplicacion |
| `phone` | Phone | Clave de deduplicacion alternativa |
| `notes` | Long text | Notas internas del negocio |
| `createdAt` | Single line text | ISO 8601 |

---

## 5. `Bookings`

| Columna | Tipo Airtable | Notas |
|---|---|---|
| `tenantId` | Single line text | |
| `serviceId` | Single line text | Record ID de `Services` |
| `professionalId` | Single line text | Record ID de `Professionals` |
| `clientId` | Single line text | Record ID de `Clients` |
| `startsAt` | Single line text | ISO 8601 **con offset**, ej. `2026-08-10T14:30:00-03:00` |
| `endsAt` | Single line text | idem |
| `status` | Single select | `pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show` |
| `paymentStatus` | Single select | `not_required`, `pending`, `paid`, `refunded`, `failed` |
| `paymentId` | Single line text | ID del pago en Mercado Pago |
| `amountTotal` | Number (decimal) | |
| `amountPaid` | Number (decimal) | |
| `notes` | Long text | |
| `publicToken` | Single line text | Token opaco para `/portal` — **no indexar publicamente** |
| `createdAt` | Single line text | ISO 8601 |
| `updatedAt` | Single line text | ISO 8601 |
| `cancelledAt` | Single line text | ISO 8601, opcional |
| `cancellationReason` | Long text | Opcional |
| `reminderSentAt` | Single line text | ISO 8601. Lo escribe n8n al mandar el recordatorio de 24hs |

> `startsAt` y `endsAt` van como **texto**, no como campo Date de Airtable.
> Airtable normaliza los Date a UTC y pierde el offset del tenant, lo que rompe
> el calculo de disponibilidad en zonas con horario de verano.

---

## Carga inicial automatica

Con `AIRTABLE_API_KEY` y `AIRTABLE_BASE_ID` en `.env.local` (y las 5 tablas ya
creadas con las columnas de arriba):

```bash
npm run seed:airtable
```

Crea el tenant `demo`, 3 profesionales, 4 servicios y 2 clientes de ejemplo.
Es idempotente por `slug` / `email`: correrlo dos veces no duplica registros.
