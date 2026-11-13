import type { CuerpoPedido, InfoPedidos, RespuestaCrear, Seguimiento } from "./tipos";

/**
 * Cliente público de los pedidos de la página (CONTRATO-PEDIDOS-WEB §4): sin
 * sesión. Va aparte de `lib/api.ts` por lo mismo que la reserva (`apiReserva`):
 * aquel cliente cierra la sesión ante un 401 y arrastra la app al bundle, y la
 * página del negocio la abre un cliente final desde Instagram.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";
const TIMEOUT_MS = 20_000;

/** Un error con el status y el mensaje del backend, ya en español para mostrar. */
export class ErrorPedido extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = "ErrorPedido";
    this.status = status;
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const corte = new AbortController();
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      signal: corte.signal,
      // Sólo con cuerpo: en un GET volvería "no simple" la consulta y el
      // navegador mandaría un OPTIONS antes de cada refresco del seguimiento.
      headers: { ...(opciones.body != null ? { "Content-Type": "application/json" } : {}), ...opciones.headers },
    });
  } catch {
    throw new ErrorPedido(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "Sin internet. Revisá tu conexión y probá de nuevo."
        : "No pudimos conectar. Probá de nuevo en un momento.",
      0,
    );
  } finally {
    clearTimeout(alarma);
  }
  if (!res.ok) {
    let cuerpo: Record<string, unknown> = {};
    try {
      cuerpo = await res.json();
    } catch {
      /* sin cuerpo JSON */
    }
    const m = cuerpo.message;
    let mensaje = Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : "Algo salió mal. Probá de nuevo.";
    if (res.status === 429) mensaje = "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
    if (res.status >= 500) mensaje = "Algo salió mal de nuestro lado. Probá de nuevo en un momento.";
    throw new ErrorPedido(mensaje, res.status);
  }
  return res.json() as Promise<T>;
}

const sub = (s: string) => encodeURIComponent(s);

export const apiPedidoPublico = {
  /** Si la página recibe pedidos y cuáles sucursales están abiertas, con su tarifa. */
  info: (subdominio: string) => pedir<InfoPedidos>(`/publico/pedidos/${sub(subdominio)}`),
  crear: (subdominio: string, cuerpo: CuerpoPedido) =>
    pedir<RespuestaCrear>(`/publico/pedidos/${sub(subdominio)}`, { method: "POST", body: JSON.stringify(cuerpo) }),
  seguimiento: (subdominio: string, token: string) =>
    pedir<Seguimiento>(`/publico/pedidos/${sub(subdominio)}/${sub(token)}`),
  /** Sólo en «Recibido»: después, 409 con «El local ya lo aceptó…». */
  cancelar: (subdominio: string, token: string) =>
    pedir<Seguimiento>(`/publico/pedidos/${sub(subdominio)}/${sub(token)}/cancelar`, { method: "POST" }),
};
