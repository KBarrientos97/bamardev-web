import { useSyncExternalStore } from "react";
import { ApiError } from "../api";
import { fechaNegocio } from "../agenda/horaAgenda";
import type { Venta, VentaInput } from "../../types";
import { almacenEnMemoria, almacenIndexedDb, type Almacen } from "./almacen";
import { ambitoSesion } from "./sesionLocal";

/**
 * La cola de ventas cobradas sin internet (PLAN-IOS F3). Port de la cola de
 * Android (`SyncQueueEntity`, `SyncManager`, `ErroresRed`): mismas reglas para
 * qué se reintenta y qué se da por rechazado, así una venta no termina distinto
 * según en qué teléfono se cobró.
 *
 * Cada venta lleva su `clienteRequestId` desde que se cobró: si un envío llegó
 * al servidor pero la respuesta se perdió, el siguiente devuelve la misma
 * venta en vez de crear otra. Por eso subirla dos veces no duplica nada.
 */

/** PENDIENTE: no se intentó. ERROR: falló y se reintenta. RECHAZADA: el servidor no la acepta. */
export type EstadoEncolada = "PENDIENTE" | "ERROR" | "RECHAZADA";

/** Lo que viaja al servidor: la venta del cobro más las marcas de la cola. */
export type CuerpoEncolado = VentaInput & {
  clienteRequestId: string;
  /** Cuándo se cobró en el equipo: la venta cae en ese día y esa hora. */
  fechaCliente: string;
  /** El servidor no la rechaza por cupo, stock ni precio cambiado: ya pasó. */
  encolada: true;
};

export interface VentaEncolada {
  id: string;
  cuerpo: CuerpoEncolado;
  /** El ticket que se le mostró al cajero, para el historial. */
  recibo: Venta;
  estado: EstadoEncolada;
  intentos: number;
  creadoEn: string;
  ultimoError: string | null;
}

let almacen: Almacen =
  typeof indexedDB === "undefined" ? almacenEnMemoria() : almacenIndexedDb;

/** Para los tests (jsdom no tiene IndexedDB). */
export function usarAlmacenCola(a: Almacen) {
  almacen = a;
  estado = { ambito: null, ventas: [] };
  avisar();
}

const prefijo = (ambito: string) => `cola:${ambito}:`;
// La clave empieza por la fecha: listar por prefijo ya las devuelve en el
// orden en que se cobraron (FIFO, como Android con `creadoEn`).
const clave = (ambito: string, v: Pick<VentaEncolada, "creadoEn" | "id">) =>
  `${prefijo(ambito)}${v.creadoEn}:${v.id}`;

// ── Estado en memoria, para que las pantallas se enteren ─────────────────────

let estado: { ambito: string | null; ventas: VentaEncolada[] } = { ambito: null, ventas: [] };
const oyentes = new Set<() => void>();

function avisar() {
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

const leer = () => estado;

/** Las ventas de la cola de esta sesión (las rechazadas también). */
export function useColaOffline(): VentaEncolada[] {
  const e = useSyncExternalStore(suscribir, leer, leer);
  return e.ambito === ambitoSesion() ? e.ventas : SIN_VENTAS;
}
const SIN_VENTAS: VentaEncolada[] = [];

/** Vuelve a leer la cola guardada (al abrir la app o cambiar de sesión). */
export async function cargarCola(): Promise<VentaEncolada[]> {
  const ambito = ambitoSesion();
  if (!ambito) {
    estado = { ambito: null, ventas: [] };
    avisar();
    return [];
  }
  const filas = await almacen.listar<VentaEncolada>(prefijo(ambito));
  estado = { ambito, ventas: filas.map(([, v]) => v) };
  avisar();
  return estado.ventas;
}

async function escribir(ambito: string, v: VentaEncolada) {
  await almacen.guardar(clave(ambito, v), v);
}

/**
 * Guarda una venta cobrada sin señal. Se resuelve cuando ya está escrita:
 * recién ahí se le muestra el ticket al cajero.
 */
export async function encolar(cuerpo: CuerpoEncolado, recibo: Venta): Promise<VentaEncolada> {
  const ambito = ambitoSesion();
  if (!ambito) throw new Error("Sin sesión no se puede guardar la venta");
  const v: VentaEncolada = {
    id: cuerpo.clienteRequestId,
    cuerpo,
    recibo,
    estado: "PENDIENTE",
    intentos: 0,
    creadoEn: cuerpo.fechaCliente,
    ultimoError: null,
  };
  // El mismo cobro reintentado sin señal no se encola dos veces: se reemplaza.
  const previa = estado.ventas.find((x) => x.id === v.id);
  if (previa) await almacen.borrar(clave(ambito, previa));
  await escribir(ambito, v);
  await cargarCola();
  return v;
}

/** Sacar una rechazada de la lista, después de cargarla a mano. */
export async function descartar(id: string) {
  const ambito = ambitoSesion();
  const v = estado.ventas.find((x) => x.id === id);
  if (!ambito || !v || v.estado !== "RECHAZADA") return;
  await almacen.borrar(clave(ambito, v));
  await cargarCola();
}

// ── Qué cuenta como pendiente ────────────────────────────────────────────────

/** Las que todavía van a subir: todo menos las rechazadas. */
export function porSubir(ventas: VentaEncolada[]): VentaEncolada[] {
  return ventas.filter((v) => v.estado !== "RECHAZADA");
}

/**
 * Ventas de hoy que esperan subir y gastan cupo (el `P` de §5.1 del plan
 * Emprendedor). Las que cobran una cita no consumen (§2.3).
 */
export function pendientesDeHoy(ventas: VentaEncolada[], hoy = fechaNegocio()): number {
  return porSubir(ventas).filter(
    (v) => v.cuerpo.citaId == null && fechaNegocio(v.cuerpo.fechaCliente) === hoy,
  ).length;
}

// ── Sin señal "pegajoso" ─────────────────────────────────────────────────────

/**
 * Después de un corte, las ventas van directo a la cola por 3 minutos, como
 * Android (`ModoOffline.DURACION_MS`): sin esto cada cobro esperaba el timeout
 * entero con el cliente adelante. Se corta antes si el servidor responde o si
 * una sincronización logra subir algo.
 */
const PEGAJOSO_MS = 3 * 60_000;
let sinSenalHasta = 0;

export function marcarSinSenal(ahora = Date.now()) {
  sinSenalHasta = ahora + PEGAJOSO_MS;
  avisar();
}

export function hayRespuesta() {
  if (sinSenalHasta === 0) return;
  sinSenalHasta = 0;
  avisar();
}

export function sinSenal(ahora = Date.now()): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return ahora < sinSenalHasta;
}

// ── Sincronización ──────────────────────────────────────────────────────────

/**
 * Qué hacer con el error de un envío. Igual que `ErroresRed.esRechazoPermanente`
 * y `SyncManager` de Android:
 *
 *  - sin red (status 0): queda, y se corta la vuelta (las demás también van a fallar);
 *  - 426 (app vieja): queda, y se corta;
 *  - 403 `CUPO_AGOTADO`: queda (sube cuando compre créditos), NUNCA rechazada;
 *  - 401, 403, 408, 429 y 5xx: queda y se reintenta después; se corta la vuelta;
 *  - cualquier otro 4xx: RECHAZADA. El servidor dijo que no y repetir no la arregla.
 */
export type Decision = "rechazada" | "reintentar" | "reintentarYParar";

export function decidir(e: unknown): Decision {
  if (!(e instanceof ApiError)) return "reintentarYParar";
  if (e.status === 403 && e.codigo === "CUPO_AGOTADO") return "reintentar";
  if (e.status === 0 || e.status === 426) return "reintentarYParar";
  if ([401, 403, 408, 429].includes(e.status) || e.status >= 500) return "reintentarYParar";
  if (e.status >= 400) return "rechazada";
  return "reintentarYParar";
}

export interface ResultadoSync {
  subidas: number;
  rechazadas: number;
  quedan: number;
}

let enCurso: Promise<ResultadoSync> | null = null;

/**
 * Sube la cola en orden. Una sola vuelta a la vez (el mutex de Android):
 * si ya hay una corriendo, se espera esa.
 *
 * `alSubir` recibe la venta que devolvió el servidor (para el contador del
 * cupo). En iPhone no hay sincronización en segundo plano: esto corre sólo con
 * la app abierta (al abrirla, al volver la red, cada tanto y con el botón).
 */
export function sincronizar(
  enviar: (cuerpo: CuerpoEncolado) => Promise<Venta>,
  alSubir?: (venta: Venta) => void,
): Promise<ResultadoSync> {
  enCurso ??= (async () => {
    const r: ResultadoSync = { subidas: 0, rechazadas: 0, quedan: 0 };
    try {
      const ambito = ambitoSesion();
      if (!ambito) return r;
      const ventas = await cargarCola();
      for (const v of porSubir(ventas)) {
        try {
          const subida = await enviar({ ...v.cuerpo, clienteRequestId: v.id, encolada: true });
          await almacen.borrar(clave(ambito, v));
          r.subidas++;
          hayRespuesta();
          alSubir?.(subida);
        } catch (e) {
          const d = decidir(e);
          const mensaje = e instanceof Error ? e.message : String(e);
          await escribir(ambito, {
            ...v,
            estado: d === "rechazada" ? "RECHAZADA" : "ERROR",
            intentos: v.intentos + 1,
            ultimoError: mensaje,
          });
          if (d === "rechazada") r.rechazadas++;
          else if (e instanceof ApiError && e.status !== 0) hayRespuesta();
          if (d === "reintentarYParar") {
            if (e instanceof ApiError && e.status === 0) marcarSinSenal();
            break;
          }
        }
      }
      r.quedan = porSubir(await cargarCola()).length;
      return r;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}
