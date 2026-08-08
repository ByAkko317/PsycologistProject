# Auditoría del flujo

`pnpm audit:flujo` recorre los **11 pasos** de
`Turnos-Flujo-Integraciones-Git.pdf` contra una instancia real de la app y
reporta cuáles quedaron cubiertos de punta a punta.

```bash
pnpm dev                    # en otra terminal
pnpm audit:flujo

# contra el deploy
pnpm audit:flujo --url https://turnos.vercel.app

# sin tocar n8n (útil mientras el colaborador todavía está armando los workflows)
pnpm audit:flujo --no-n8n
```

## Qué verifica cada paso

| # | Paso del PDF | Qué comprueba la auditoría |
|---|---|---|
| 1 | Cliente elige servicio | `/book` responde y lista servicios con duración |
| 2 | Elige profesional | Hay al menos un profesional habilitado para ese servicio |
| 3 | Disponibilidad real | `/api/availability` devuelve slots libres en los próximos 21 días |
| 4 | Resumen antes de confirmar | El wizard renderiza sin error |
| 5 | Seña con Mercado Pago | Se creó la preferencia y volvió un `checkoutUrl` |
| 6 | Creación del turno | `POST /api/bookings` responde 201 **y** una segunda reserva del mismo slot da 409 |
| 7 | Webhook de Mercado Pago | El endpoint responde y **rechaza con 401 una firma inválida** |
| 8 | Eventos hacia n8n | Por cada webhook configurado: acepta la firma válida **y rechaza la alterada** |
| 9 | Recordatorio 24hs | Modelo PULL (`/api/n8n/bookings`, con y sin token) y modelo PUSH (`/api/cron/reminders`) |
| 10 | Cancelar / reprogramar | `/portal` abre con el token y rechaza horarios inválidos |
| 11 | Asistencia y dashboard | `/employee/agenda` y `/admin` responden; `PATCH /api/bookings/:id` marca asistencia |

## Cómo leer el resultado

| Símbolo | Significado |
|---|---|
| `✓ OK` | El paso funciona de punta a punta |
| `! AVISO` | Funciona, pero hay algo inseguro o a medias — leer el detalle |
| `– OMITIDO` | Depende de una cuenta externa que todavía no está configurada. No es un error |
| `✗ FALLA` | Algo está roto. El script termina con exit code 1 |

El aviso más importante es este:

```
! 8. n8n · booking.created   ⚠ acepta una firma INVÁLIDA: revisar el nodo 'Validar firma'
```

Significa que el workflow procesó un evento que no vino de la app. Cualquiera
que descubra la URL del webhook podría mandarle mensajes a los pacientes.

## Efectos sobre los datos

- Crea **un turno de prueba** a nombre de "Auditoría Automática" y lo **cancela
  al terminar**. Con `--keep` lo deja para inspeccionarlo a mano.
- Dispara eventos de prueba contra los webhooks de n8n. El payload de prueba
  viene con `client.phone` **vacío a propósito**, así que un workflow bien
  armado no le manda WhatsApp a nadie real. El `client.email` es
  `auditoria@turnos.test`, un dominio que no existe.
- El modelo PUSH del recordatorio marca `reminderSentAt` en los turnos que
  estén dentro de la ventana de anticipación de 24hs. Si estás auditando
  **producción**, tenelo
  en cuenta: esos turnos no van a recibir un segundo recordatorio.

> Para auditar sin ningún efecto sobre datos reales, apuntá a una instancia con
> `NEXT_PUBLIC_DATA_PROVIDER=mock`.
