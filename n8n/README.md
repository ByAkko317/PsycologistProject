# Integración n8n — guía para el colaborador

Todo lo que sale de la app hacia n8n ya está construido y probado. Lo que falta
es **lo que pasa dentro de n8n**: conectar los proveedores reales de WhatsApp y
email, y activar los workflows.

Esta carpeta es tu punto de partida. Los 5 archivos de `workflows/` se importan
directo en n8n y ya traen la validación de firma resuelta y los mensajes
redactados: solo hay que reemplazar los nodos marcados como
**`REEMPLAZAR`** por los nodos reales de tu proveedor.

---

## 1. Qué está hecho y qué falta

| Pieza | Estado | Dónde |
|---|---|---|
| Emisión de los 5 eventos, firmados con HMAC | Hecho | `lib/services/n8n.ts` |
| Payload canónico (todo lo que un mensaje necesita) | Hecho | `bookingPayload()` |
| Endpoint entrante para el Cron de recordatorios | Hecho | `app/api/n8n/bookings/route.ts` |
| Cron propio de la app (modelo PUSH) | Hecho | `app/api/cron/reminders/route.ts` |
| Esqueletos de los 5 workflows | Hecho | `n8n/workflows/*.json` |
| **Nodos de envío de WhatsApp** | **Pendiente — tuyo** | dentro de n8n |
| **Nodos de envío de email** | **Pendiente — tuyo** | dentro de n8n |
| **Credenciales del proveedor** | **Pendiente — tuyo** | dentro de n8n |

La app **nunca** arma ni envía un mensaje. Solo avisa "pasó esto" con todos los
datos. Todo el texto vive en n8n, así que se puede cambiar la redacción sin
tocar el código ni volver a deployar.

---

## 2. Puesta en marcha (15 minutos)

### 2.1 Levantar n8n

```bash
# opción rápida, sin instalar nada
docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n
```

O crear una cuenta en [n8n.cloud](https://n8n.cloud).

### 2.2 Variables de entorno **dentro de n8n**

En n8n: `Settings → Variables` (cloud) o variables de entorno del contenedor.

| Variable | Valor | Para qué |
|---|---|---|
| `TURNOS_WEBHOOK_SECRET` | el mismo string que `N8N_WEBHOOK_SECRET` de la app | validar la firma de los eventos entrantes y autenticarse contra la API |
| `TURNOS_APP_URL` | `https://tu-app.vercel.app` (o la URL de ngrok) | el workflow de recordatorios consulta la API |
| `TURNOS_TENANT_SLUG` | `demo` | qué negocio consultar en el recordatorio |

> Generá el secreto una sola vez y usá el mismo de los dos lados:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 2.3 Importar los workflows

En n8n: `Workflows → Import from File`, uno por archivo:

```
workflows/01-booking-created.json
workflows/02-booking-cancelled.json
workflows/03-booking-rescheduled.json
workflows/04-payment-confirmed.json
workflows/05-reminder-24h.json
```

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

### 2.5 Reemplazar los nodos `REEMPLAZAR`

Cada placeholder es un nodo *No Operation* con una nota que dice exactamente qué
poner y qué campos usar. Los campos que te deja armados el nodo `Armar mensaje`:

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

Levantá la app (`npm run dev`), entrá a `http://localhost:3000/book` y reservá
un turno. Vas a ver la ejecución aparecer en n8n al instante.

Para que **Mercado Pago** pueda avisar, la app necesita URL pública:

```bash
ngrok http 3000
# y poner esa URL en NEXT_PUBLIC_APP_URL
```

---

## 7. Checklist antes de devolver la rama

- [ ] Los 5 workflows importados y **activos** en n8n
- [ ] `Validar firma` intacto en los 4 workflows de webhook
- [ ] Nodos `REEMPLAZAR` cambiados por los reales (WhatsApp / email)
- [ ] Credenciales guardadas **dentro de n8n**, nunca en este repo
- [ ] Las 5 URLs cargadas en `.env.local` (y en Vercel, si está deployado)
- [ ] Elegido **un solo** modelo de recordatorio (A o B) y desactivado el otro
- [ ] Workflows exportados de vuelta a `n8n/workflows/` con los nodos reales
- [ ] Prueba de firma alterada → el workflow falla
- [ ] Una reserva real de punta a punta llegó por WhatsApp y/o email

> ⚠️ Al exportar desde n8n, revisá que el JSON **no incluya credenciales**.
> El `.gitignore` ya bloquea `n8n/**/credentials*.json`, pero las credenciales
> también pueden filtrarse dentro de un nodo si se cargaron a mano en vez de
> usar el gestor de credenciales de n8n.

Cuando subas los workflows, corremos la auditoría automática:

```bash
npm run audit:flujo
```

Recorre los 11 pasos del flujo del PDF y reporta cuáles quedaron cubiertos de
punta a punta. Ver `docs/auditoria.md`.
