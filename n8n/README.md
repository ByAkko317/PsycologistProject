# Integración n8n — guía para el colaborador

Todo lo que sale de la app hacia n8n ya está construido y probado. Lo que falta
es **lo que pasa dentro de n8n**: conectar los proveedores reales de WhatsApp y
email, y activar los workflows.

Los 5 archivos de `workflows/` se importan directo en n8n y ya traen todo
armado: validación de firma, mensajes redactados y los nodos de WhatsApp y
Gmail conectados. Al importarlos solo falta elegir tus credenciales y activar.

---

## 1. Qué está hecho y qué falta

| Pieza | Estado | Dónde |
|---|---|---|
| Emisión de los 5 eventos, firmados con HMAC | Hecho | `lib/services/n8n.ts` |
| Payload canónico (todo lo que un mensaje necesita) | Hecho | `bookingPayload()` |
| Endpoint entrante para el Cron de recordatorios | Hecho | `app/api/n8n/bookings/route.ts` |
| Cron propio de la app (modelo PUSH) | Hecho | `app/api/cron/reminders/route.ts` |
| Los 5 workflows, con WhatsApp y Gmail conectados | Hecho | `n8n/workflows/*.json` |
| **Credenciales del proveedor** | **Pendiente — tuyo** | dentro de n8n |
| **Elegir la credencial en cada nodo de envío** | **Pendiente — tuyo** | al importar |

La app **nunca** arma ni envía un mensaje. Solo avisa "pasó esto" con todos los
datos. Todo el texto vive en n8n, así que se puede cambiar la redacción sin
tocar el código ni volver a deployar.

---

## 2. Puesta en marcha (15 minutos)

### 2.1 Variables de entorno

```bash
cd n8n
cp .env.n8n.example .env.n8n     # .env.n8n está en .gitignore
```

Completá los cuatro valores. En n8n Cloud se cargan a mano en
`Settings → Variables`, una por una.

| Variable | Valor | Para qué |
|---|---|---|
| `TURNOS_WEBHOOK_SECRET` | el mismo string que `N8N_WEBHOOK_SECRET` de la app | validar la firma de los eventos entrantes y autenticarse contra la API |
| `TURNOS_APP_URL` | `http://host.docker.internal:3000` en local | el workflow de recordatorios consulta la API |
| `TURNOS_TENANT_SLUG` | `demo` | qué negocio consultar en el recordatorio |
| `WHATSAPP_PHONE_NUMBER_ID` | el identificador del número, en Meta for Developers | desde qué número salen los mensajes |

> **`localhost` no sirve para `TURNOS_APP_URL`.** Adentro del contenedor,
> `localhost` es el contenedor mismo: n8n se llamaría a sí mismo en vez de
> llamar a la app. Usá `host.docker.internal`, o directamente la URL del túnel
> si ya lo levantaste para Mercado Pago.

### 2.2 Levantar n8n

```bash
cd n8n
docker compose up
```

**Usá el compose, no un `docker run` a mano.** Los workflows necesitan dos
opciones que el comando suelto no lleva, y sin ellas fallan con errores que no
se parecen en nada a la causa:

| Opción | Si falta |
|---|---|
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | `access to env vars denied` en *Validar firma*. n8n 2.0 invirtió el default de esta variable, así que instalaciones nuevas la necesitan explícita |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | `require('crypto')` falla y no se puede verificar la firma |

El compose además fija la versión de la imagen. Sin tag, Docker reusa la que
tengas cacheada: así terminaron dos máquinas del mismo equipo corriendo 2.29 y
2.36, con defaults distintos y fallas distintas.

> Cada volumen de Docker es una instalación separada, con sus propios
> workflows y credenciales. Si venís de probar con `docker run -v n8ndata:...`,
> lo que estabas ejecutando estaba en **ese** volumen, no en el del compose:
> hay que volver a importar los workflows.

> Generá el secreto una sola vez y usá el mismo de los dos lados:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

**Las variables de n8n no van en el `.env.local` de la app.** La app nunca habla
con WhatsApp: solo avisa "pasó esto" y n8n decide a quién le escribe. Puestas
del lado de la app no las lee nadie, y no hay ningún error que lo delate.

### 2.3 Importar los workflows

En n8n: `Workflows → Import from File`, uno por archivo:

```
workflows/01-booking-created.json
workflows/02-booking-cancelled.json
workflows/03-booking-rescheduled.json
workflows/04-payment-confirmed.json
workflows/05-reminder-24h.json
```

Llegan **desactivados y sin credencial asignada**, a propósito. Un workflow que
se importa activo empieza a mandar mensajes reales antes de que nadie mire a
dónde van. Después de importar, en cada nodo de WhatsApp y de Gmail elegí tu
credencial del desplegable, probá, y recién ahí activalo.

### 2.4 Copiar las URLs de los webhooks a la app

Cada workflow importado tiene un nodo **Webhook**. Al abrirlo muestra dos URLs
(Test y Production). Copiá la de **Production** a `.env.local`:

```env
N8N_WEBHOOK_BOOKING_CREATED=https://tu-n8n/webhook/turnos-booking-created
N8N_WEBHOOK_BOOKING_CANCELLED=https://tu-n8n/webhook/turnos-booking-cancelled
N8N_WEBHOOK_BOOKING_RESCHEDULED=https://tu-n8n/webhook/turnos-booking-rescheduled
N8N_WEBHOOK_PAYMENT_CONFIRMED=https://tu-n8n/webhook/turnos-payment-confirmed
N8N_WEBHOOK_REMINDER_24H=https://tu-n8n/webhook/turnos-booking-reminder
N8N_WEBHOOK_SECRET=el-mismo-secreto-de-arriba
```

Si una URL queda vacía, la app loguea el evento y sigue funcionando: no rompe
nada. Eso permite trabajar los workflows de a uno.

### 2.5 Los campos que arma el mensaje

Los nodos de envío ya están conectados. Si querés cambiar la redacción, editá el
nodo `Armar mensaje`, que deja preparados estos campos:

| Campo | Contenido |
|---|---|
| `{{ $json.para_whatsapp }}` | teléfono en formato internacional, listo para enviar |
| `{{ $json.para_email }}` | email del cliente |
| `{{ $json.asunto }}` | asunto sugerido |
| `{{ $json.texto }}` | cuerpo del mensaje, ya redactado |
| `{{ $json.original }}` | el evento crudo completo, por si necesitás otro dato |

---

## 3. Seguridad: la firma HMAC

Cada request saliente lleva estos headers:

```
Content-Type: application/json
X-Turnos-Event: booking.created
X-Turnos-Signature: <hmac-sha256-hex del body crudo, con N8N_WEBHOOK_SECRET>
```

El nodo **`Validar firma`** de cada workflow ya hace la verificación y corta la
ejecución si no coincide. **No lo borres**: sin eso, cualquiera que descubra tu
URL de webhook puede disparar mensajes a los clientes del consultorio.

> El nodo Webhook viene con `rawBody` activado a propósito. La firma se calcula
> sobre el JSON exacto que mandó la app; si n8n re-serializa el objeto, el
> hash cambia y la validación falla.

Las llamadas en el sentido inverso (n8n → app) usan un bearer simple:

```
Authorization: Bearer <N8N_WEBHOOK_SECRET>
```

---

## 4. Contrato de los eventos

Todos comparten el mismo sobre:

```jsonc
{
  "event": "booking.created",
  "emittedAt": "2026-08-07T18:22:10.482Z",
  "version": 1,                  // subí esto si cambia la forma del payload
  "tenantId": "recAbC123",
  "tenantSlug": "demo",
  "data": { /* ver abajo */ }
}
```

### 4.1 `data` — base común a los 5 eventos

```jsonc
{
  "booking": {
    "id": "recBkg001",
    "status": "confirmed",           // pending_payment | confirmed | cancelled | completed | no_show
    "paymentStatus": "not_required", // not_required | pending | paid | refunded | failed
    "startsAt": "2026-08-18T09:00:00-03:00",
    "endsAt": "2026-08-18T09:50:00-03:00",
    "amountTotal": 15000,
    "amountPaid": 0,
    "notes": "",
    "cancellationReason": ""
  },
  "display": {                       // ya formateado en la zona del negocio
    "timezone": "America/Argentina/Buenos_Aires",
    "date": "martes, 18 de agosto",
    "time": "09:00"
  },
  "client": {
    "id": "recCli001",
    "name": "Sofía Ramírez",
    "email": "sofia@ejemplo.test",
    "phone": "+5491133333333"        // formato internacional, listo para WhatsApp
  },
  "service": {
    "id": "recSrv002",
    "name": "Sesión individual",
    "durationMinutes": 50,
    "price": 15000
  },
  "professional": {
    "id": "recPro001",
    "name": "Lic. Ana Torres",
    "email": "ana@consultoriobienestar.test"
  },
  "business": {
    "name": "Consultorio Bienestar",
    "email": "hola@consultoriobienestar.test",
    "phone": "+5491100000000",
    "cancellationHours": 24
  },
  "links": {
    "manage": "https://tu-app.vercel.app/portal?token=tok_abc123"
  }
}
```

### 4.2 Campos extra por evento

| Evento | Cuándo se dispara | Agrega a `data` |
|---|---|---|
| `booking.created` | el cliente confirma el turno (paso 6) | `payment: { required, depositAmount, checkoutUrl }` |
| `booking.cancelled` | el cliente cancela desde `/portal` (paso 10) | — (usar `booking.cancellationReason`) |
| `booking.rescheduled` | el cliente mueve el horario (paso 10) | `previousStartsAt` (ISO del horario viejo) |
| `payment.confirmed` | Mercado Pago acredita el pago (paso 7) | `payment: { id, amount, status }` |
| `booking.reminder_24h` | 24hs antes del turno (paso 9) | — |

`checkoutUrl` puede venir en `null` si el servicio no pide seña o si Mercado
Pago no está configurado. Chequealo antes de meterlo en el mensaje.

---

## 5. El recordatorio de 24hs: elegí un modelo

Los dos están implementados y usan el mismo campo `reminderSentAt`, así que no
se pisan. **Activá uno solo.**

### Modelo A — PULL (es el del workflow `05-reminder-24h.json`)

El Cron vive dentro de n8n:

```
Schedule (cada hora)
  → GET  {{TURNOS_APP_URL}}/api/n8n/bookings?tenant=demo&window=24h&minLead=2h
  → un item por turno
  → armar mensaje → enviar
  → POST {{TURNOS_APP_URL}}/api/n8n/bookings  {bookingId, action:"reminder_sent"}
```

El GET ya filtra los que fueron avisados, así que correrlo de más no duplica
mensajes. Ambas llamadas necesitan `Authorization: Bearer <secreto>`.

**Ventaja:** todo el control queda en n8n, no hace falta tocar la app.

### Modelo B — PUSH (es el que describe el PDF)

El cron vive en la app (`vercel.json` ya lo deja configurado cada hora):

```
Vercel Cron → GET /api/cron/reminders
            → la app emite booking.reminder_24h por cada turno
            → n8n recibe el evento como cualquier otro webhook
```

Si vas por acá, el workflow de recordatorio se arma igual que los otros cuatro:
nodo Webhook → `Validar firma` → armar mensaje → enviar. No necesitás el
`05-reminder-24h.json`.

**Ventaja:** un solo patrón para los 5 eventos; n8n no necesita credenciales de
la app.

**Ventana:** de anticipación, no centrada. Un turno es elegible desde que entra
en las próximas 24hs y sigue siéndolo hasta que efectivamente se avisa; el campo
`reminderSentAt` garantiza que se mande una sola vez. Así, si el cron pierde una
corrida el recordatorio igual sale en la siguiente.

`minLead` (default 2hs) evita mandar un "recordatorio" de algo que empieza en 20
minutos. Se puede ajustar por query string:
`/api/n8n/bookings?window=24h&minLead=3h`.

---

## 6. Probar sin esperar a que pase algo real

### Disparar un evento a mano

```bash
SECRET="tu-secreto"
BODY='{"event":"booking.created","emittedAt":"2026-08-07T18:00:00Z","version":1,"tenantId":"t1","tenantSlug":"demo","data":{"booking":{"id":"test","status":"confirmed","paymentStatus":"not_required","startsAt":"2026-08-18T09:00:00-03:00","endsAt":"2026-08-18T09:50:00-03:00","amountTotal":15000,"amountPaid":0,"notes":"","cancellationReason":""},"display":{"timezone":"America/Argentina/Buenos_Aires","date":"martes, 18 de agosto","time":"09:00"},"client":{"id":"c1","name":"Prueba","email":"prueba@ejemplo.test","phone":"+5491100000000"},"service":{"id":"s1","name":"Sesión individual","durationMinutes":50,"price":15000},"professional":{"id":"p1","name":"Lic. Ana Torres","email":"ana@ejemplo.test"},"business":{"name":"Consultorio Bienestar","email":"hola@ejemplo.test","phone":"+5491100000000","cancellationHours":24},"links":{"manage":"http://localhost:3000/portal?token=test"}}}'
SIG=$(node -e "console.log(require('crypto').createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$SECRET" "$BODY")

curl -X POST https://tu-n8n/webhook/turnos-booking-created \
  -H "Content-Type: application/json" \
  -H "X-Turnos-Event: booking.created" \
  -H "X-Turnos-Signature: $SIG" \
  -d "$BODY"
```

Cambiá un carácter del body sin recalcular la firma: el workflow **tiene que**
fallar en `Validar firma`. Si pasa igual, la validación no está funcionando.

### Recorrer el flujo real

Levantá la app (`pnpm dev`), entrá a `http://localhost:3000/book` y reservá
un turno. Vas a ver la ejecución aparecer en n8n al instante.

Para que **Mercado Pago** pueda avisar, la app necesita URL pública:

```bash
ngrok http 3000
# y poner esa URL en NEXT_PUBLIC_APP_URL
```

---

## 7. Antes de commitear un workflow exportado

**Este es el paso que ya falló una vez.** Corré siempre:

```bash
pnpm check:workflows            # falla si algo no se puede publicar
pnpm check:workflows --arreglar # corrige lo que se corrige solo
```

### Por qué no alcanza con revisarlo a ojo

La versión anterior de esta guía decía "revisá que el JSON no incluya
credenciales". Se siguió al pie de la letra y aun así se publicaron cinco
workflows con el número de WhatsApp de una cuenta real.

El aviso apuntaba al problema equivocado. n8n **nunca** exporta tokens, así que
buscar credenciales no encuentra nada y uno queda tranquilo. Lo que sí exporta,
en silencio, es todo lo que identifica tu instalación:

| Qué exporta n8n | Por qué importa en un repo abierto |
|---|---|
| `phoneNumberId` del nodo de WhatsApp | quien lo importe manda mensajes desde **tu** número |
| `credentials.id` de cada nodo | son filas de *tu* n8n; en otra instancia da "credential not found" |
| `meta.instanceId` | identifica tu instalación de n8n |
| `pinData` | **lo más grave**: guarda una ejecución real, con nombre, teléfono y mail de un paciente |
| `active: true` | al importarlo empieza a mandar mensajes solo |

Ninguno de esos valores *parece* un secreto, y por eso pasan la revisión visual.
El script los conoce a todos y no se olvida.

### Checklist

- [ ] `pnpm check:workflows` en verde ← **antes que nada**
- [ ] Los 5 workflows importados y funcionando en n8n
- [ ] `Validar firma` intacto en los 4 workflows de webhook
- [ ] Nodos de envío conectados a tu credencial (WhatsApp / email)
- [ ] Credenciales guardadas **dentro de n8n**, nunca en este repo
- [ ] `WHATSAPP_PHONE_NUMBER_ID` en las variables de n8n, no en el JSON
- [ ] Las 5 URLs cargadas en `.env.local` (y en Vercel, si está deployado)
- [ ] Elegido **un solo** modelo de recordatorio (A o B) y desactivado el otro
- [ ] Prueba de firma alterada → el workflow falla
- [ ] Una reserva real de punta a punta llegó por WhatsApp y/o email

> Los workflows quedan versionados con `active: false`. Eso es correcto: el
> archivo del repo es una plantilla, no el estado de tu n8n. Que estén activos
> en tu instancia no se versiona ni hace falta.

Cuando subas los workflows, corremos la auditoría automática:

```bash
pnpm audit:flujo
```

Recorre los 11 pasos del flujo del PDF y reporta cuáles quedaron cubiertos de
punta a punta. Ver `docs/auditoria.md`.

---

## 8. Errores frecuentes

### `access to env vars denied`

```
ExpressionError: access to env vars denied
causeDetailed: ...remove the environment variable 'N8N_BLOCK_ENV_ACCESS_IN_NODE'
```

n8n 2.0 invirtió el default de `N8N_BLOCK_ENV_ACCESS_IN_NODE` a `true`, así que
las instalaciones nuevas bloquean `$env` en expresiones y en el nodo Code. Los
cinco workflows lo usan: el secreto de la firma, el número de WhatsApp, la URL
de la app.

El `docker-compose.yml` ya trae `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Si
levantaste n8n de otra forma, agregala.

Tiene una consecuencia: con `$env` desbloqueado, cualquiera que pueda editar un
workflow en esa instancia lee **todas** las variables de entorno del contenedor.
En una instancia de desarrollo de una persona da igual. En una compartida, el
secreto conviene moverlo a una credencial de n8n.

### `Cannot find module 'crypto'` en *Validar firma*

Falta `NODE_FUNCTION_ALLOW_BUILTIN=crypto`. También está en el compose.

En modo interno (el default) alcanza con ponerlo en el contenedor de n8n: el
task runner hereda el entorno. Con runners externos va en el contenedor del
runner.

### El recordatorio no trae ningún turno, o falla la llamada a la app

`TURNOS_APP_URL` apunta a `localhost`. Adentro del contenedor eso es el
contenedor mismo. Usá `http://host.docker.internal:3000`, con esquema.

### n8n arranca pero los workflows son los de antes

Cada volumen de Docker es una instalación independiente. `docker run -v n8ndata:...`
y `docker compose up` usan volúmenes distintos, con workflows y credenciales
distintos.

Para ver qué hay:

```bash
docker volume ls
```

Los workflows importados quedan guardados en el volumen: cambiar el JSON del
repo no los actualiza. Después de un `git pull` que los toque, hay que volver a
importarlos desde `Workflows → Import from File`.

### Fallas distintas en dos máquinas del mismo equipo

`n8nio/n8n` sin tag reusa la imagen cacheada de cada máquina. El compose fija la
versión justamente para esto.

```bash
docker compose pull      # traer la versión fijada
```

### `Python 3 is missing from this system`

Es un aviso, no un error. Ningún workflow de este proyecto usa Python.
