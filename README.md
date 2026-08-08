# Turnos — plataforma de reservas white-label

Sistema de turnos multi-tenant construido sobre **Next.js 14 (App Router) +
TypeScript + TailwindCSS**, con **Airtable** como base de datos, **Mercado
Pago** para el cobro de señas y **n8n** para las automatizaciones de WhatsApp,
email y recordatorios.

Cada negocio (un consultorio, una peluquería, un estudio) es un *tenant*: su
propio logo, colores, horarios, servicios, profesionales y política de
cancelación, sobre la misma instalación.

---

## Arranque rápido

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrí <http://localhost:3000>. **Funciona sin configurar ninguna cuenta**: si
faltan credenciales, la app cae automáticamente al proveedor `mock` con datos
de ejemplo y se puede navegar el flujo completo.

| Ruta | Quién la usa |
|---|---|
| `/book` | Cliente — reservar en 4 pasos |
| `/portal?token=…` | Cliente — cancelar o reprogramar |
| `/employee/agenda` | Profesional — su día y marcado de asistencia |
| `/admin` | Dueño — resumen, agenda, clientes, servicios, marca |

### Requisitos

Node.js 18 o superior (`node -v`). Nada más.

---

## Elegir el proveedor de datos

Una sola línea de `.env.local` decide toda la capa de persistencia:

```env
NEXT_PUBLIC_DATA_PROVIDER=airtable   # airtable | firebase | mock
```

| Valor | Estado | Notas |
|---|---|---|
| `mock` | Listo | En memoria. No requiere cuentas. Se reinicia con el servidor |
| `airtable` | Listo | Ver [`docs/airtable-schema.md`](docs/airtable-schema.md) |
| `firebase` | **Pendiente** | Stub documentado en `lib/services/db.firebase.ts` |

### Configurar Airtable

1. Crear un Base con 5 tablas: `Tenants`, `Services`, `Professionals`,
   `Clients`, `Bookings`. Las columnas exactas están en
   [`docs/airtable-schema.md`](docs/airtable-schema.md).
2. Generar un token en <https://airtable.com/create/tokens> con permisos de
   lectura/escritura sobre ese Base.
3. Completar `AIRTABLE_API_KEY` y `AIRTABLE_BASE_ID` en `.env.local`.
4. Cargar los datos de ejemplo:

```bash
npm run seed:airtable
```

Es idempotente: correrlo dos veces no duplica registros.

---

## Arquitectura

```
app/
  book/                 flujo de reserva del cliente (pasos 1-6)
  book/gracias/         confirmación + link de autogestión
  portal/               cancelar / reprogramar (paso 10)
  employee/agenda/      agenda del profesional (paso 11)
  admin/                panel del dueño
  api/
    catalog/            catálogo público (marca, servicios, profesionales)
    availability/       horarios libres calculados en el servidor (paso 3)
    bookings/           crear turno (paso 6) y marcar asistencia (paso 11)
    portal/             cancelar y reprogramar (paso 10)
    mercadopago/webhook confirmación de pago (paso 7)
    n8n/bookings/       endpoint que consume n8n (recordatorio, modelo PULL)
    cron/reminders/     cron propio de la app (recordatorio, modelo PUSH)

lib/
  types.ts              modelo de dominio
  config.ts             lectura centralizada de variables de entorno
  tenant.ts             resolución del tenant activo y helpers de marca
  services/
    db.ts               punto ÚNICO de acceso a datos
    db.airtable.ts      implementación Airtable (REST, sin SDK)
    db.mock.ts          datos de ejemplo en memoria
    db.firebase.ts      stub pendiente
    bookings.ts         casos de uso: crear, cancelar, reprogramar, cobrar
    mercadopago.ts      preferencias de pago y validación del webhook
    n8n.ts              emisor de eventos firmados con HMAC
    reminders.ts        recordatorio de 24hs (dos modelos)
  utils/
    dates.ts            timezone y horarios, sin dependencias externas
    availability.ts     cruce de horario laboral con turnos ocupados

n8n/                    andamiaje para el colaborador (ver n8n/README.md)
scripts/                seed de Airtable y auditoría del flujo
docs/                   esquema de datos, auditoría y los PDFs de referencia
```

### Dos reglas que sostienen todo lo demás

**1. Ningún componente importa un proveedor de datos concreto.** Todo pasa por
`lib/services/db.ts`. Migrar de Airtable a Firestore es completar
`db.firebase.ts` y cambiar una variable de entorno — cero cambios de UI.

**2. La app no arma mensajes.** Solo emite eventos con todos los datos que un
mensaje podría necesitar. El texto, el canal y el momento se deciden dentro de
n8n. Cambiar la redacción de una confirmación no requiere deployar.

---

## Integraciones

| Integración | Variable | Si falta |
|---|---|---|
| Airtable | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` | cae a `mock` |
| Mercado Pago | `MERCADOPAGO_ACCESS_TOKEN` | el turno queda pendiente de pago |
| n8n | `N8N_WEBHOOK_*`, `N8N_WEBHOOK_SECRET` | el evento se loguea y se sigue |

Ninguna integración faltante rompe una reserva. Es deliberado: el sistema tiene
que poder tomar turnos aunque WhatsApp o la pasarela estén caídos.

### Webhooks entrantes y URL pública

Mercado Pago y n8n necesitan poder llamar de vuelta a la app. En local:

```bash
ngrok http 3000
# poner esa URL en NEXT_PUBLIC_APP_URL
```

O probar esa parte directamente sobre el deploy (Vercel).

### n8n

Todo lo que el colaborador necesita está en **[`n8n/README.md`](n8n/README.md)**:
contrato de los 5 eventos con ejemplos, workflows importables, validación de
firma y checklist de entrega.

Eventos emitidos:

| Evento | Cuándo |
|---|---|
| `booking.created` | el cliente confirma el turno |
| `booking.cancelled` | el cliente cancela desde `/portal` |
| `booking.rescheduled` | el cliente mueve el horario |
| `payment.confirmed` | Mercado Pago acredita el pago |
| `booking.reminder_24h` | 24hs antes del turno |

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run seed:airtable` | carga datos de ejemplo en Airtable |
| `npm run audit:flujo` | audita los 11 pasos del flujo de punta a punta |

La auditoría se documenta en [`docs/auditoria.md`](docs/auditoria.md).

---

## Trabajo en equipo

El repo lo tocan dos personas: la app y las automatizaciones avanzan en
paralelo. Para no pisarse:

```bash
git checkout -b feature/nombre-de-lo-que-hacés
# … trabajar …
git add .
git commit -m "feat(alcance): descripción breve"
git push -u origin feature/nombre-de-lo-que-hacés
```

- **App (`app/`, `lib/`, `components/`)** y **automatizaciones (`n8n/`)** son
  zonas separadas a propósito: casi nunca hay conflicto.
- El único punto de contacto es `.env.example`. Si agregás una variable,
  documentala ahí con un comentario que explique de dónde se saca.
- Nunca commitear `.env.local`. El `.gitignore` ya lo bloquea, junto con
  `n8n/**/credentials*.json`.

---

## Qué falta

- [ ] **Autenticación.** `/admin` y `/employee` no tienen login todavía. No
      deployar públicamente sin resolverlo — hoy cualquiera con la URL entra.
      El plan es Firebase Authentication (Email/Password), como indica el PDF.
- [ ] **Proveedor Firebase** (`lib/services/db.firebase.ts`).
- [ ] **Nodos reales de WhatsApp y email** dentro de n8n.
- [ ] Reintentos con backoff para eventos de n8n que fallan.
- [ ] Tests automatizados de `computeAvailability` (hoy se valida vía
      `audit:flujo` contra el servidor levantado).

---

Documentos de referencia del proyecto en [`docs/`](docs/):
`Turnos-Guia-de-inicio.pdf` y `Turnos-Flujo-Integraciones-Git.pdf`.
