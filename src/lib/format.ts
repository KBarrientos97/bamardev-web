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

/**
 * Una cantidad (unidades, stock, kg de un insumo, lo de un movimiento o un combo) sin
 * ceros de más: "9", "0,5", "2,25", "0,125", "1.500". Kevin, 25-oct: "3,00 en unidad
 * no da: tiene que decir 3, 2, 5". La plata sí lleva sus dos decimales (`fmtMoney`).
 *
 * Hasta 3 decimales porque es la precisión con la que se guardan el stock y los
 * movimientos (Decimal(12,3)): con 2, 0,125 kg salía "0,13". Se redondea ANTES de
 * formatear para que el resto de punto flotante de una resta (2,3 − 0,3 da
 * 1,9999999999999998) salga "2", y un −0,0004 de un saldo del kardex quede en cero:
 * el `|| 0` le saca el signo, que con `fmtNum` salía "-0".
 */
export function fmtCantidad(n: number | null | undefined, maxDecimales = 3): string {
  const factor = 10 ** maxDecimales;
  const v = Math.round(Number(n ?? 0) * factor) / factor || 0;
  return v.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: maxDecimales });
}

/**
 * Plata para lo que lee el CLIENTE (el WhatsApp de su pedido): "Bs 40" si es
 * entera y "Bs 40.50" con centavos, con punto y sin separador de miles.
 * "Bs 40,00" se leía como cuarenta mil (Kevin, 15-oct). Igual que la app
 * (`Moneda.formatCliente`). Se redondea a centavos antes de decidir, para que un
 * 39.999999 de una suma salga "Bs 40". Las pantallas siguen con `fmtMoney`.
 */
export function fmtMontoCliente(n: number | null | undefined): string {
  const centavos = Math.round(Number(n ?? 0) * 100);
  return centavos % 100 === 0
    ? `${simboloMoneda} ${centavos / 100}`
    : `${simboloMoneda} ${(centavos / 100).toFixed(2)}`;
}

/**
 * Sin símbolo y con decimales FIJOS (ninguno, salvo que se pidan): para conteos
 * (ventas, tickets, mesas), porcentajes, ejes de gráficos y celdas apretadas.
 *
 * NO es para cantidades de producto (stock, insumos, kardex, lo de un movimiento):
 * con decimales fuerza los ceros ("48,00 Unidad en stock", que Kevin no quiere ver
 * el 25-oct) y sin ellos redondea (2,5 kg salía "3 kg" y 0,4 kg, "0 kg"). Para eso
 * está `fmtCantidad`.
 */
export function fmtNum(n: number | null | undefined, decimales = 0): string {
  return Number(n ?? 0).toLocaleString("es-BO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function fmtPct(n: number | null | undefined): string {
  return `${Math.round(Number(n ?? 0) * 100)}%`;
}

/** Una fecha suelta yyyy-MM-dd, sin hora: los rangos de reportes vienen así. */
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function aFecha(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;

  // "2026-09-01" lo parsea el navegador como medianoche UTC, que en Bolivia
  // (UTC-4) es el 31/08 a las 20:00 y se mostraría un día antes. Construyendo
  // la fecha por partes queda en hora local y el día es el que dice el texto.
  // Los timestamps completos sí llevan zona y se parsean normal.
  if (SOLO_DIA.test(iso)) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d);
  }

  const d = new Date(iso);
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
