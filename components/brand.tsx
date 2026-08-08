// Inyecta el color del tenant como CSS variables. Todo lo que use `bg-brand`
// o `text-brand` toma el color correcto sin recompilar Tailwind.
import { contrastForeground, hexToRgbChannels } from "@/lib/tenant";
import type { Tenant } from "@/lib/types";

export function BrandStyle({ tenant }: { tenant: Tenant }) {
  const css = `:root{--brand-rgb:${hexToRgbChannels(
    tenant.brandColor
  )};--brand-fg-rgb:${contrastForeground(tenant.brandColor)};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export function BrandHeader({
  tenant,
  subtitle,
}: {
  tenant: Tenant;
  subtitle?: string;
}) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
        {tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="h-9 w-9 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            {tenant.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <p className="font-semibold leading-tight">{tenant.name}</p>
          {subtitle && (
            <p className="text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
    </header>
  );
}
