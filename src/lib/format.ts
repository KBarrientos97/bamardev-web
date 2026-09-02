/** Formateo de moneda, fechas y números. El negocio factura en BOB. */

let simboloMoneda = "Bs";

/** El login trae la moneda del negocio; se fija una vez al entrar. */
export function fijarMoneda(codigo?: string) {
  if (codigo === "USD") simboloMoneda = "$";
  else if (codigo === "PEN") simboloMoneda = "S/";
  else simboloMoneda = "Bs";
}

export function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${simboloMoneda} ${v.toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Sin decimales ni símbolo: para ejes de gráficos y celdas apretadas. */
export function fmtNum(n: number | null | undefined, decimales = 0): string {
  return Number(n ?? 0).toLocaleString("es-BO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function fmtPct(n: number | null | undefined): string {
  return `${Math.round(Number(n ?? 0) * 100)}%`;
}

function aFecha(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtFecha(iso: string | Date | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtHora(iso: string | Date | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "—";
  return d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
}

export function fmtFechaHora(iso: string | Date | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "—";
  return `${fmtFecha(d)} ${fmtHora(d)}`;
}

/** "hace 5 min", "ayer", "12/08/2026" — para "último acceso" y listados. */
export function tiempoRelativo(iso: string | Date | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "Nunca";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "Recién";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias < 7) return `hace ${dias} días`;
  return fmtFecha(d);
}

/** yyyy-MM-dd en hora local (no UTC: `toISOString` corre el día en Bolivia). */
export function isoDia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Iniciales para los avatares del drawer y de usuarios. */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
}
