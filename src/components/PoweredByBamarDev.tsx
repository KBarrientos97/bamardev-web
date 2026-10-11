import type { CSSProperties } from "react";

/**
 * "(logo) Powered by BamarDev" (pedido del dueño, 09-oct): el mismo pie en
 * todas las webs públicas y en el login. Con estilos en línea y sin imports
 * de la app, para que la reserva online lo use sin cargar nada más
 * (`src/separacion.test.ts`). El logo es decorativo: el texto lo nombra.
 */
export const TEXTO_POWERED_BY = "Powered by BamarDev";

export default function PoweredByBamarDev({
  href = "https://bamardev.com",
  color = "#6B7280",
  tamano = 12,
  logo = 18,
  style,
}: {
  href?: string;
  color?: string;
  tamano?: number;
  logo?: number;
  style?: CSSProperties;
}) {
  return (
    <a
      href={href}
      rel="noopener"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontSize: tamano,
        color,
        textDecoration: "none",
        ...style,
      }}
    >
      <img
        src="/logo-marca-48.png"
        alt=""
        width={logo}
        height={logo}
        style={{ width: logo, height: logo, flex: "none", objectFit: "contain" }}
      />
      {TEXTO_POWERED_BY}
    </a>
  );
}
