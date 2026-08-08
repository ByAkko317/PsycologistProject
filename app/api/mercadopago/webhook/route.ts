// POST /api/mercadopago/webhook — paso 7 del flujo.
//
// Mercado Pago avisa aca cuando cambia el estado de un pago. El sistema NO
// confia en el body: usa el id para volver a consultar el pago contra la API.
//
// Requiere URL publica (ngrok en local, o el dominio de Vercel) y cargarla en
// Mercado Pago > Tus integraciones > Webhooks.
import { NextResponse } from "next/server";
import { confirmPayment } from "@/lib/services/bookings";
import { verifyWebhookSignature } from "@/lib/services/mercadopago";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);

  let body: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  } = {};
  try {
    body = await request.json();
  } catch {
    // Mercado Pago a veces notifica solo por query string.
  }

  const tipo = body.type ?? searchParams.get("type") ?? "";
  const dataId = String(
    body.data?.id ?? searchParams.get("data.id") ?? searchParams.get("id") ?? ""
  );

  // Solo interesan las notificaciones de pago.
  if (tipo && tipo !== "payment") {
    return NextResponse.json({ ignored: true, type: tipo });
  }
  if (!dataId) {
    return NextResponse.json(
      { error: "Falta data.id en la notificacion" },
      { status: 400 }
    );
  }

  const firma = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
  });

  if (!firma.valid) {
    console.warn(`[mercadopago] webhook rechazado: ${firma.reason}`);
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  try {
    const resultado = await confirmPayment(dataId);
    console.info("[mercadopago] webhook procesado", resultado);
    // Siempre 200: si devolvemos error, Mercado Pago reintenta en loop.
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[mercadopago] webhook fallo", error);
    // 500 solo cuando el reintento tiene sentido (caida de la API, red, etc).
    return NextResponse.json(
      { error: "No se pudo procesar la notificacion" },
      { status: 500 }
    );
  }
}

/** Mercado Pago hace un GET de prueba al configurar la URL. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "mercadopago/webhook" });
}
