// GET /book/pagar?token=... — reabre el checkout de un turno sin pagar.
//
// Es un link y no un formulario para que funcione igual desde la pantalla de
// vuelta, desde un email o desde WhatsApp. Crear la preferencia no cobra nada.
import { NextResponse } from "next/server";
import { BookingError, reabrirPago } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return NextResponse.redirect(new URL("/book", url));

  // A la pantalla de vuelta va un codigo, no el texto: un mensaje armado en la
  // URL lo podria escribir cualquiera y mostrarse como si fuera nuestro.
  const volver = (codigo: "vencido" | "no_disponible" | "error") =>
    NextResponse.redirect(
      new URL(`/book/gracias?token=${encodeURIComponent(token)}&reintento=${codigo}`, url)
    );

  try {
    return NextResponse.redirect(await reabrirPago(token));
  } catch (error) {
    if (error instanceof BookingError) {
      if (error.code === "NOT_FOUND") return NextResponse.redirect(new URL("/book", url));
      return volver(error.code === "TOO_LATE" ? "vencido" : "no_disponible");
    }
    console.error("[pagar] no se pudo reabrir el checkout", error);
    return volver("error");
  }
}
