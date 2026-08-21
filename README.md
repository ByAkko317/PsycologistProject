# Turnos, plataforma de reservas white-label

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
corepack enable            # una sola vez por computadora
pnpm install
cp .env.example .env.local
pnpm dev
```

En **Windows con CMD**, `cp` no existe; el resto es igual:

```cmd
copy .env.example .env.local
```

(en PowerShell `cp` funciona, porque es un alias de `Copy-Item`)

Abrí <http://localhost:3000>. **Funciona sin configurar ninguna cuenta**: si
faltan credenciales, la app cae automáticamente al proveedor `mock` con datos
de ejemplo y se puede navegar el flujo completo.

| Ruta | Quién la usa | Requiere sesión |
|---|---|---|
| `/book` | Paciente — reservar en 4 pasos | no |
| `/portal?token=…` | Paciente — gestionar el turno del link del mensaje | no |
| `/portal` | Paciente — todos sus turnos | sí (paciente) |
| `/registro` · `/login` | Alta e ingreso | — |
| `/employee/agenda` | Profesional — su día y marcado de asistencia | sí (profesional) |
| `/admin` | Dueño — resumen, agenda, clientes, servicios, marca | sí (dueño) |

Con el proveedor `mock`, la pantalla de login lista las cuentas de prueba
(contraseña `demo1234` para todas).

### Entorno de prueba completo

```bash
pnpm dev:sandbox
```

Levanta la app junto a un **Mercado Pago simulado** y un **n8n simulado**, para
recorrer el flujo de cobro de punta a punta sin ninguna cuenta y sin exponer
nada a internet. Detalle en [`docs/entorno-pruebas.md`](docs/entorno-pruebas.md).

Si alguno de los tres puertos (3000, 4010, 4020) está ocupado, avisa cuál antes
de arrancar. Para mover la app:

```bash
pnpm dev:sandbox --port=3001
```

### Requisitos

Node.js 18 o superior (`node -v`). Nada más: **pnpm viene con Node** a través de
corepack, no hay que instalarlo aparte.

```bash
corepack enable
pnpm -v      # debería imprimir 9.15.4
```

`package.json` fija la versión exacta en `packageManager`, así que corepack baja
esa y no otra.

#### Por qué pnpm y no npm

| | Qué cambia |
|---|---|
| **`node_modules` aislado** | Un paquete solo puede importar lo que declara. Con el árbol plano de npm, cualquier dependencia transitiva es alcanzable desde cualquier lado — y también explotable |
| **Scripts de instalación bloqueados** | `pnpm.onlyBuiltDependencies` está en `[]`: ninguna dependencia puede ejecutar `postinstall`. Es el vector de supply chain más usado |
| **Un solo gestor** | El hook `preinstall` rechaza `npm install` y `yarn install`. Dos lockfiles conviviendo significa que el árbol que auditaste no es el que se deploya |
| **Integridad verificada** | `verify-store-integrity=true` chequea el hash de cada paquete antes de usarlo |

La configuración vive en [`.npmrc`](.npmrc), con un comentario por línea
explicando qué hace cada opción.

> Si alguna dependencia futura realmente necesita compilar algo nativo, hay que
> agregarla **a propósito** a `pnpm.onlyBuiltDependencies` en `package.json` y
> correr `pnpm rebuild`. Que sea una decisión explícita es el punto.

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
pnpm seed:airtable
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
  auth/
    passwords.ts        hash y verificación scrypt
    session.ts          cookie firmada, sin estado en el servidor
    guards.ts           requireSession para páginas, APIs y server actions
  services/
    auth.ts             login, registro y alta de usuarios del equipo
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
scripts/
  only-pnpm.mjs         guard: bloquea npm install y yarn install
  setup-git-remote.mjs  conecta el repo con GitHub sin exponer el token
  crear-usuario.mjs     alta de duenio o profesional desde la terminal
  seed-airtable.mjs     carga de datos de ejemplo
  audit-flujo.mjs       auditoría de los 11 pasos del flujo
  mock-mercadopago.mjs  simulador de la pasarela de pago
  mock-n8n.mjs          receptor de eventos que valida la firma
  sandbox.mjs           levanta los tres procesos juntos
docs/                   esquema de datos, entorno de prueba, GitHub, auditoría
```

### Dos reglas que sostienen todo lo demás

**1. Ningún componente importa un proveedor de datos concreto.** Todo pasa por
`lib/services/db.ts`. Migrar de Airtable a Firestore es completar
`db.firebase.ts` y cambiar una variable de entorno (cero cambios de UI).

**2. La app no arma mensajes.** Solo emite eventos con todos los datos que un
mensaje podría necesitar. El texto, el canal y el momento se deciden dentro de
n8n. Cambiar la redacción de una confirmación no requiere deployar.

---

## Integraciones

| Integración | Variable | Si falta |
|---|---|---|
| Sesiones | `AUTH_SECRET` | en dev genera uno efímero; en prod **no arranca** |
| Airtable | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` | cae a `mock` |
| Mercado Pago | `MERCADOPAGO_ACCESS_TOKEN` | el turno queda pendiente de pago |
| n8n | `N8N_WEBHOOK_*`, `N8N_WEBHOOK_SECRET` | el evento se loguea y se sigue |

Ninguna integración faltante rompe una reserva. Es deliberado: el sistema tiene
que poder tomar turnos aunque WhatsApp o la pasarela estén caídos.

### Mercado Pago

Tres formas de probar el cobro, de menos a más fiel:

| | Cómo | Cuándo |
|---|---|---|
| **Simulador local** | `pnpm dev:sandbox` | desarrollo diario. Sin cuenta, sin ngrok |
| **Sandbox oficial** | credenciales `TEST-` + ngrok | antes de deployar |
| **Producción** | credenciales `APP_USR-` | plata real |

La app detecta el prefijo del Access Token y manda al checkout que corresponde.
Paso a paso de las tres: [`docs/entorno-pruebas.md`](docs/entorno-pruebas.md).

### Webhooks entrantes y URL pública

Mercado Pago y n8n necesitan poder llamar de vuelta a la app. Con el simulador
esto no hace falta; contra el sandbox oficial sí:

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
| `pnpm dev` | servidor de desarrollo |
| `pnpm build` | build de producción |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm seed:airtable` | carga datos de ejemplo en Airtable |
| `pnpm crear:usuario` | crea un usuario dueño o profesional |
| `pnpm audit:flujo` | audita los 11 pasos del flujo de punta a punta |
| `pnpm dev:sandbox` | levanta el entorno de prueba completo (app + Mercado Pago simulado + n8n simulado) |
| `pnpm mock:mercadopago` | solo el simulador de Mercado Pago |

Documentación por tema:

- [`docs/entorno-pruebas.md`](docs/entorno-pruebas.md) — simulador de pagos y sandbox oficial de Mercado Pago
- [`docs/airtable-schema.md`](docs/airtable-schema.md) — tablas y columnas exactas
- [`docs/github.md`](docs/github.md) — conectar el repo y qué token hace falta
- [`docs/auditoria.md`](docs/auditoria.md) — qué verifica `pnpm audit:flujo`
- [`n8n/README.md`](n8n/README.md) — guía completa para el colaborador

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
  `.env.git` y `n8n/**/credentials*.json`.
- Si agregás o subís una dependencia, commiteá **`pnpm-lock.yaml` en el mismo
  commit**. Un lockfile desactualizado hace que cada uno instale un árbol
  distinto.
- Cómo conectar el repo y qué credenciales hace falta pedirle a GitHub:
  [`docs/github.md`](docs/github.md).

---

## Autenticación y permisos

Sesión propia sobre Airtable: hash **scrypt** de la contraseña y **cookie
firmada con HMAC-SHA256**, `httpOnly` y `sameSite=lax`. Sin dependencias
externas ni cuentas nuevas.

| Rol | Ve | No puede |
|---|---|---|
| `owner` | todo el tenant: agenda completa, clientes, servicios, marca, y la agenda de cualquier profesional | — |
| `employee` | **solo su propia agenda** y sus turnos | entrar a `/admin`, tocar turnos de otro profesional |
| `client` | **solo sus turnos** | ver datos de otro paciente, entrar a `/admin` o `/employee` |

Detalles que importan:

- **El filtro sale siempre de la sesión, nunca de la URL.** Un profesional que
  ponga `?profesional=otro` sigue viendo la suya; un paciente que mande el
  `bookingId` de otro recibe un 404.
- **404, no 403, cuando el recurso es de otro.** Un 403 confirmaría que ese
  turno existe.
- **El link del mensaje sigue funcionando sin login.** `/portal?token=…` da
  acceso a *ese* turno y nada más — es lo que hace que el WhatsApp que manda
  n8n siga sirviendo.
- **Los mensajes de error del login son deliberadamente vagos** y el tiempo de
  respuesta es constante exista o no el email. Distinguir "ese email no existe"
  de "la contraseña está mal" permitiría averiguar quién es paciente del
  consultorio.
- **No hay registro público de `owner` ni `employee`.** Se crean con
  `pnpm crear:usuario`, que pide la contraseña por consola para que no quede en
  el historial de la terminal.

`AUTH_SECRET` es obligatorio en producción: sin él la app no arranca. En
desarrollo genera uno efímero y avisa.

---

## Qué falta

- [ ] **Recuperar contraseña** por email (vía n8n).
- [ ] **ABM de usuarios desde el panel** — hoy los crea `pnpm crear:usuario`.
- [ ] **Rate limiting** en `/login` y en la creación de turnos.
- [ ] **Proveedor Firebase** (`lib/services/db.firebase.ts`).
- [ ] **Nodos reales de WhatsApp y email** dentro de n8n.
- [ ] Reintentos con backoff para eventos de n8n que fallan.
- [ ] Tests automatizados de `computeAvailability` (hoy se valida vía
      `audit:flujo` contra el servidor levantado).

---

Documentos de referencia del proyecto en [`docs/`](docs/):
`Turnos-Guia-de-inicio.pdf` y `Turnos-Flujo-Integraciones-Git.pdf`.
