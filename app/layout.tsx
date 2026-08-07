import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turnos — Reservas online",
  description:
    "Plataforma de reservas y turnos white-label: agenda, clientes, pagos y recordatorios automaticos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
