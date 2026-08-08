# Entorno de prueba

Probar el flujo completo — incluido el cobro de la seña — **sin cuenta de
Mercado Pago, sin n8n y sin exponer la app a internet**.

```bash
pnpm dev:sandbox
```

| | Dónde | Qué es |
|---|---|---|
| App | <http://localhost:3000> | `next dev` con datos `mock` |
| Mercado Pago | <http://localhost:4010> | simulador: pantalla de checkout + webhook firmado |
| n8n | <http://localhost:4020> | simulador: valida la firma y muestra los mensajes |

Los tres procesos se conectan solos. **No toca tu `.env.local`**: las variables
se le inyectan a `next dev` en memoria, así que al cortar con `Ctrl+C` todo
queda como estaba.

Por defecto usa el proveedor `mock`, así que no escribe en Airtable. Para probar
contra tu base real:

```bash
pnpm dev:sandbox --airtable    # ⚠ escribe registros de verdad
```

---

## Recorrer el flujo de cobro

1. <http://localhost:3000/book>
2. Elegí **"Primera consulta"** — es el servicio con **30% de seña**, así que
   dispara el checkout. "Sesión individual" no pide pago por adelantado.
3. Profesional, día, horario, tus datos, confirmar.
4. Te lleva al checkout simulado. Elegí cómo querés que salga el pago:

   | Botón | Qué pasa |
   |---|---|
   | **Pago aprobado** | webhook → turno `confirmed` + `paid`, se emite `payment.confirmed` |
   | **Pago pendiente** | el turno queda esperando acreditación |
   | **Pago rechazado** | `paymentStatus: failed`, el turno sigue `pending_payment` |

5. Mirá la consola: el simulador de n8n imprime el mensaje que le llegaría al
   paciente por WhatsApp y email.

Todo eso ya está verificado automáticamente:

```bash
pnpm audit:flujo
# 19 OK · 0 avisos · 0 omitidos · 0 fallas
```

---

## Qué tan fiel es el simulador

Emula **el contrato** de la API, no el comportamiento completo de la pasarela.

Lo que sí reproduce fielmente:

- La forma exacta de `POST /checkout/preferences` y `GET /v1/payments/:id`.
- La **firma del webhook**, con el mismo manifest que usa Mercado Pago:
  ```
  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  x-signature: ts=<ts>,v1=<hmac-sha256(manifest, secret)>
  ```
  Esto importa: significa que el validador de la app se ejercita de verdad y no
  hay un camino distinto entre prueba y producción.
- Los tres estados de pago y sus `status_detail`.

Lo que **no** cubre: medios de pago reales, cuotas, contracargos, tiempos de
acreditación, reintentos de notificación de Mercado Pago, ni los códigos de
error de tarjetas específicas.

> Antes de cobrar plata real, hay que pasar por el sandbox oficial. El
> simulador te ahorra las primeras 50 iteraciones, no la última.

---

## Pasar al sandbox oficial de Mercado Pago

Cuando quieras probar contra la infraestructura real (sin mover plata):

### 1. Crear la aplicación

<https://www.mercadopago.com.ar/developers/panel> → **Tus integraciones** →
**Crear aplicación**

- Producto: **Checkout Pro**
- Modelo de integración: **Pagos online**

### 2. Copiar las credenciales **de prueba**

Dentro de la aplicación → **Credenciales de prueba**:

```env
MERCADOPAGO_ACCESS_TOKEN=TEST-1234567890...
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=TEST-abcd-...
MERCADOPAGO_API_BASE=            # vacío = API real
```

> Si el token empieza con `APP_USR-` son **credenciales de producción** y los
> pagos son reales. Para probar tiene que empezar con `TEST-`.

La app detecta el prefijo sola y manda al checkout de sandbox
(`sandbox_init_point`). Mezclarlos es lo que produce el clásico
"Algo salió mal" de Mercado Pago.

### 3. Crear usuarios de prueba

**Cuentas de prueba** → crear **dos**:

| Usuario | Para qué |
|---|---|
| **Vendedor** | de esta cuenta salen las credenciales `TEST-` |
| **Comprador** | con este usuario iniciás sesión en el checkout para pagar |

### 4. Tarjetas de prueba (Argentina)

| Tarjeta | Número | CVV | Vto |
|---|---|---|---|
| Mastercard | `5031 7557 3453 0604` | 123 | 11/30 |
| Visa | `4509 9535 6623 3704` | 123 | 11/30 |
| Amex | `3711 803032 57522` | 1234 | 11/30 |

El **estado del pago lo decide el nombre del titular**:

| Titular | Resultado |
|---|---|
| `APRO` | aprobado |
| `OTHE` | rechazado por error general |
| `FUND` | rechazado por fondos insuficientes |
| `SECU` | rechazado por código de seguridad |
| `EXPI` | rechazado por fecha de vencimiento |
| `CONT` | pendiente de pago |

DNI: `12345678`.

> Estos valores los publica Mercado Pago y **cambian de vez en cuando**.
> Verificá en <https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards>
> si alguno deja de funcionar.

### 5. URL pública para el webhook

Este es el punto donde el simulador te ahorraba trabajo: Mercado Pago real
necesita poder llamar a tu máquina.

```bash
ngrok http 3000
# copiá la URL https que te da
```

```env
NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app
```

Y en el panel de Mercado Pago → **Webhooks** → **Configurar notificaciones**:

- URL: `https://abc123.ngrok-free.app/api/mercadopago/webhook`
- Evento: **Pagos**
- Copiá la **clave secreta** que genera → `MERCADOPAGO_WEBHOOK_SECRET`

Sin esa clave la app acepta cualquier notificación y lo avisa por consola.
En producción es obligatoria: sin ella, cualquiera puede marcar turnos como
pagados con un `curl`.

---

## Probar solo una pieza

```bash
pnpm mock:mercadopago              # solo el simulador de pagos, en :4010
node scripts/mock-n8n.mjs          # solo el receptor de eventos, en :4020
pnpm audit:flujo --no-n8n          # auditoría salteando n8n
pnpm audit:flujo --keep            # deja el turno de prueba sin cancelar
```

El simulador expone dos endpoints pensados para tests automatizados:

```bash
# aprobar un pago sin pasar por el navegador
curl -X POST http://localhost:4010/_mock/pay \
  -H 'Content-Type: application/json' \
  -d '{"bookingId":"bkg_abc123","status":"approved"}'

# ver los eventos que recibió el n8n simulado
curl http://localhost:4020/_eventos
```

---

## Checklist antes de tocar plata real

- [ ] `pnpm audit:flujo` en verde contra el sandbox oficial
- [ ] `MERCADOPAGO_WEBHOOK_SECRET` cargado y validando (probá mandando una firma
      alterada: tiene que dar 401)
- [ ] `MERCADOPAGO_API_BASE` **vacío** en producción
- [ ] Access Token productivo (`APP_USR-`) solo en las variables de entorno del
      deploy, nunca en el repo
- [ ] **Autenticación en `/admin` y `/employee`** — sigue pendiente, y es
      bloqueante para salir a producción
