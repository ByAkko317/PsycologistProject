// Aplica el color del tenant sobre los tokens del sistema de diseño.
// Todo lo que use `bg-brand` o `text-brand` toma el color correcto sin
// recompilar Tailwind y sin romper el modo oscuro.
import { contrastForeground, hexToRgbChannels } from "@/lib/tenant";
import type { Tenant } from "@/lib/types";

/**
 * `--brand-soft` es el color de marca muy diluido, para fondos de chips.
 * Necesita dos versiones: en claro se aclara hacia el blanco, y en oscuro se
 * oscurece. Un único valor haría que los chips quemen la vista en modo oscuro.
 */
function tonosSuaves(hex: string): { claro: string; oscuro: string } {
  const [r, g, b] = hexToRgbChannels(hex).split(" ").map(Number);
  return {
    claro: [r, g, b].map((c) => Math.round(c + (255 - c) * 0.92)).join(" "),
    oscuro: [r, g, b].map((c) => Math.round(c * 0.28 + 18)).join(" "),
  };
}

export function BrandStyle({ tenant }: { tenant: Pick<Tenant, "brandColor"> }) {
  const brand = hexToRgbChannels(tenant.brandColor);
  const soft = tonosSuaves(tenant.brandColor);

  const css = [
    `:root{`,
    `--brand:${brand};`,
    `--brand-fg:${contrastForeground(tenant.brandColor)};`,
    `--brand-soft:${soft.claro};`,
    `--ring:${brand};`,
    `}`,
    `.dark{--brand-soft:${soft.oscuro};--ring:${brand};}`,
  ].join("");

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
