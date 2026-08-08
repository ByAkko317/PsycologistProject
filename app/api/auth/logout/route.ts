// POST /api/auth/logout — borra la cookie de sesion.
// Es POST a proposito: con GET, un <img src="/api/auth/logout"> en cualquier
// pagina cerraria la sesion del usuario sin que haga nada.
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  clearSessionCookie();

  const destino = new URL("/login", request.url);
  return NextResponse.redirect(destino, { status: 303 });
}
