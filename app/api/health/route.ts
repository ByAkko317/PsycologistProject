// GET /api/health — identifica a esta app en un puerto.
//
// Lo usa `pnpm tunel` para encontrar en qué puerto está corriendo. Next salta
// solo al 3001 si el 3000 está ocupado, y un túnel apuntado al 3000 termina
// mandando la vuelta de Mercado Pago a otro programa (pasó con Grafana).
// No expone nada del negocio: solo dice qué es.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ app: "turnos-saas" });
}
