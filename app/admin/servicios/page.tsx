// Catalogo editable: precio, duracion, seña y que profesional lo presta.
// La interaccion (acordeon, alta en pop-up, borrado) vive en ServiciosPanel;
// aca se arman los datos.
import { ServiciosPanel, type ServicioVista } from "@/components/servicios-panel";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AdminServicios() {
  const tenant = await requireTenant();
  const [servicios, profesionales, turnos] = await Promise.all([
    db.listServices(tenant.id),
    db.listProfessionals(tenant.id),
    db.listBookings(tenant.id),
  ]);

  // Cuantos turnos tiene cada servicio: decide si borrarlo lo elimina o lo
  // archiva, y el pop-up de confirmacion lo avisa antes.
  const porServicio = new Map<string, number>();
  for (const t of turnos) {
    porServicio.set(t.serviceId, (porServicio.get(t.serviceId) ?? 0) + 1);
  }

  const vistas: ServicioVista[] = servicios.map((s) => ({
    ...s,
    turnos: porServicio.get(s.id) ?? 0,
  }));

  return (
    <ServiciosPanel
      servicios={vistas.filter((s) => !s.archived)}
      archivados={vistas.filter((s) => s.archived)}
      profesionales={profesionales.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
