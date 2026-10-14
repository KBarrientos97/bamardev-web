import type { EstadoMesa, Prepago, TiempoPrevio, TipoMesa } from "../../pages/billar/tipos";

/**
 * Cliente de la TV pública del billar (`GET /publico/billar/salon/:llave`),
 * sin sesión.
 *
 * Va aparte de `lib/api.ts` por lo mismo que la reserva (apiReserva.ts): aquel
 * cliente agrega el token de la sesión guardada, la cierra ante un 401 y corta
 * por licencia ante un 403. En un televisor del salón nada de eso aplica, y
 * si esa compu tiene además una sesión abierta, la TV no la puede tocar.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";
/** Más corto que el de la app: la TV vuelve a preguntar sola enseguida. */
const TIMEOUT_MS = 15_000;

/** Una mesa como la manda el backend a la TV: sin ids internos, sin cliente y sin montos. */
export interface MesaTvApi {
  numero: number;
  alias?: string;
  tipo: string;
  tarifaPropia?: number;
  estado: EstadoMesa;
  /** Sólo la hora: el nombre de quién reservó no sale de la caja. */
  reserva?: { hora: number };
  sesion?: {
    start: number;
    pausedAt: number | null;
    pausedTotal: number;
    prepago: Prepago | null;
    prev: TiempoPrevio | null;
    consumos: never[];
    pagos: never[];
  };
}

export interface SalonPublicoApi {
  negocio: string;
  /** "BOB", "USD", "PEN". Opcional: un backend anterior no la manda. */
  moneda?: string;
  sucursal: string;
  /** La hora del servidor: el cronómetro corre en la TV, pero contado desde acá. */
  ahora: number;
  avisos: number[];
  tipos: TipoMesa[];
  mesas: MesaTvApi[];
}

/** Un "no" del backend (con su status) o la falta de red (status 0). */
export class ErrorTv extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = "ErrorTv";
    this.status = status;
  }
}

async function pedir<T>(ruta: string, cancelar?: AbortSignal): Promise<T> {
  const corte = new AbortController();
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS);
  const alCancelar = () => corte.abort();
  cancelar?.addEventListener("abort", alCancelar);
  let res: Response;
  try {
    // Sin cabeceras: un GET simple no dispara el OPTIONS previo de CORS.
    res = await fetch(`${BASE}${ruta}`, { signal: corte.signal, cache: "no-store" });
  } catch {
    throw new ErrorTv(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "sin internet"
        : "el servidor no responde",
      0,
    );
  } finally {
    clearTimeout(alarma);
    cancelar?.removeEventListener("abort", alCancelar);
  }
  if (!res.ok) {
    let mensaje = `error ${res.status}`;
    try {
      const cuerpo = (await res.json()) as { message?: unknown };
      if (typeof cuerpo.message === "string") mensaje = cuerpo.message;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ErrorTv(mensaje, res.status);
  }
  return res.json() as Promise<T>;
}

export const apiTv = {
  salon: (llave: string, sucursalId?: number, cancelar?: AbortSignal) =>
    pedir<SalonPublicoApi>(
      `/publico/billar/salon/${encodeURIComponent(llave)}${sucursalId != null ? `?sucursalId=${sucursalId}` : ""}`,
      cancelar,
    ),
};
