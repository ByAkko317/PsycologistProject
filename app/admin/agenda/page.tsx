// Agenda completa del negocio: búsqueda, filtros, paginado y modal de detalle.
//
// Todo lo que antes obligaba a abrir Airtable —ver el turno completo, cambiar
// su estado, corregir el pago— se hace desde acá.
import { PageHeader } from "@/components/app-shell";
import { AgendaLista } from "@/components/agenda-lista";
import { Buscador, FiltroChips, Paginado } from "@/components/listado";
import { requirePageSession } from "@/lib/auth/guards";
import { roleCan } from "@/lib/auth/permissions";
import { buscarTurnos } from "@/lib/services/agenda";
import { etiquetaDeDia, paraModal } from "@/lib/services/serializar";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "confirmed", label: "Confirmados" },
  { value: "pending_payment", label: "Sin pagar" },
  { value: "completed", label: "Asistieron" },
  { value: "no_show", label: "Ausentes" },
  { value: "cancelled", label: "Cancelados" },
];

const RANGOS = [
  { value: "proximos", label: "Próximos" },
  { value: "pasados", label: "Pasados" },
  { value: "todos", label: "Todo" },
];

export default async function AdminAgenda({
  searchParams,
}: {
  searchParams: {
    q?: string;
    pagina?: string;
    estado?: string;
    rango?: string;
    profesional?: string;
  };
}) {
  const sesion = requirePageSession(["owner"], "/admin/agenda");
  const tenant = await requireTenant();

  const resultado = await buscarTurnos({
    tenant,
    sesion,
    q: searchParams.q,
    pagina: Number(searchParams.pagina) || 1,
    estado: searchParams.estado,
    rango: searchParams.rango ?? "proximos",
    profesionalId: searchParams.profesional,
  });

  const perms = {
    asistencia: roleCan(sesion.role, "bookings:attendance"),
    pagos: roleCan(sesion.role, "payments:manage"),
    verImportes: roleCan(sesion.role, "money:view"),
    verPaciente: roleCan(sesion.role, "clients:view:all"),
  };

  const dias = resultado.dias.map((d) => ({
    fecha: d.fecha,
    etiqueta: etiquetaDeDia(d.fecha),
    turnos: d.turnos.map((t) => paraModal(t, tenant)),
  }));

  const profesionales = [
    { value: "todos", label: "Todos" },
    ...resultado.profesionales.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Tocá cualquier turno para ver el detalle y cambiar su estado."
      />

      <div className="mb-5 space-y-3">
        <Buscador
          placeholder="Buscar por paciente, servicio o profesional…"
          ayuda="También busca por el email del paciente."
        />

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <FiltroChips
            nombre="rango"
            opciones={RANGOS}
            actual={searchParams.rango ?? "proximos"}
          />
          <FiltroChips
            nombre="estado"
            opciones={ESTADOS}
            actual={searchParams.estado ?? "todos"}
          />
        </div>

        {profesionales.length > 2 && (
          <FiltroChips
            nombre="profesional"
            opciones={profesionales}
            actual={searchParams.profesional ?? "todos"}
          />
        )}
      </div>

      <div className="mb-4">
        <Paginado
          pagina={resultado.pagina}
          paginas={resultado.paginas}
          total={resultado.total}
          etiqueta="turno"
        />
      </div>

      <AgendaLista
        dias={dias}
        perms={perms}
        timezone={tenant.timezone}
        moneda={tenant.currency}
        vacio={
          searchParams.q
            ? `No hay turnos que coincidan con "${searchParams.q}".`
            : "No hay turnos con esos filtros."
        }
      />

      {resultado.paginas > 1 && (
        <div className="mt-6">
          <Paginado
            pagina={resultado.pagina}
            paginas={resultado.paginas}
            total={resultado.total}
            etiqueta="turno"
          />
        </div>
      )}
    </>
  );
}
