import { api } from "../api";
import { almacenEnMemoria, almacenIndexedDb, type Almacen } from "./almacen";
import type { VentaEncolada } from "./cola";
import { ambitoSesion } from "./sesionLocal";

/**
 * El manifiesto del turno y el latido del equipo (12-nov): lo que el POS le
 * cuenta al servidor sobre las ventas que registró en esta caja, para que el
 * cierre lo confirme el servidor y Supervisión sepa si el equipo sigue ahí.
 * Port de `ventas_del_turno` (SyncManager) y `LatidoCaja` de Android.
 *
 * Por qué hace falta también en la web: la cajera de la compu cierra caja
 * igual que la del celular, y el servidor cerraba sin mirar nada de este
 * equipo. Con la app instalada vendiendo sin internet (PLAN-IOS F3), una venta
 * que el equipo creía subida y nunca llegó quedaba fuera del arqueo,
 * existiendo sólo en esta compu. Y en Supervisión la caja de la web no decía
 * nada del equipo ("no se sabe") mientras la del APK decía «En línea · hace
 * 20 s».
 *
 * Una venta se anota SÓLO cuando el equipo sabe que existe en algún lado: con
 * el 2xx en vivo o al encolarla. Nunca antes del intento ni ante una respuesta
 * de error: un POST que murió sin llegar dejaría una clave fantasma y el
 * cierre quedaría trabado para siempre con VENTAS_SIN_CONFIRMAR por una venta
 * que no existe en ningún lado (la regla de `VentaRepositoryImpl` en Android).
 * Una encolada que el servidor rechazó al sincronizar (RECHAZADA) se saca: ya
 * no va a llegar nunca, y declararla trabaría el cierre igual.
 *
 * Nada de acá frena una venta ni un cierre: toda lectura o escritura que
 * falle (IndexedDB en un navegador privado, sin cuota) se traga, y sin
 * manifiesto el servidor cierra como siempre.
 */
export interface ManifiestoTurno {
  cajaId: number;
  /** Las claves (`clienteRequestId`) de las ventas registradas en esta caja. */
  claves: string[];
  /** Cuándo se cobró la última en este equipo (ISO), subida o no. */
  ultimaVentaEn: string | null;
}

let almacen: Almacen = typeof indexedDB === "undefined" ? almacenEnMemoria() : almacenIndexedDb;

/** Para los tests (jsdom no tiene IndexedDB). */
export function usarAlmacenTurno(a: Almacen) {
  almacen = a;
}

/** Un manifiesto sin ventas hace más que esto es de un turno que ya no existe. */
const VIGENCIA_MANIFIESTO_MS = 14 * 24 * 60 * 60 * 1000;

const prefijo = (ambito: string) => `turno:${ambito}:`;
const clave = (ambito: string, cajaId: number) => `${prefijo(ambito)}${cajaId}`;

/**
 * Cuánto se espera al IndexedDB al cerrar. Un navegador con el almacenamiento
 * trabado no puede dejar a la cajera sin cerrar la caja: pasado esto se cierra
 * sin manifiesto, como un APK viejo.
 */
const TOPE_LECTURA_MS = 3_000;

function conTope<T>(promesa: Promise<T>): Promise<T | undefined> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<undefined>((ok) => {
    reloj = setTimeout(() => ok(undefined), TOPE_LECTURA_MS);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj));
}

/**
 * Anota una venta que el equipo sabe que existe: el 2xx en vivo o la cola.
 * `cuando` es la hora del cobro (la de la cola, si se encoló).
 */
export async function anotarVentaDelTurno(
  cajaId: number | null | undefined,
  clienteRequestId: string,
  cuando = new Date(),
): Promise<void> {
  const ambito = ambitoSesion();
  if (cajaId == null || !ambito || !clienteRequestId) return;
  try {
    const k = clave(ambito, cajaId);
    const actual = (await almacen.leer<ManifiestoTurno>(k)) ?? { cajaId, claves: [], ultimaVentaEn: null };
    const claves = actual.claves.includes(clienteRequestId) ? actual.claves : [...actual.claves, clienteRequestId];
    const hora = cuando.toISOString();
    // ISO en UTC: comparar los textos es comparar las horas.
    const ultimaVentaEn = actual.ultimaVentaEn && actual.ultimaVentaEn > hora ? actual.ultimaVentaEn : hora;
    await almacen.guardar<ManifiestoTurno>(k, { cajaId, claves, ultimaVentaEn });
    // El admin de una organización puede tener una caja abierta en cada sede
    // (13-nov), así que el manifiesto de OTRA caja puede ser de un turno
    // vivo: no se borra por ser distinta. Se limpian sólo los viejos de verdad
    // (un turno que cerró desde otro equipo y no se va a declarar nunca más),
    // para no acumular por siempre.
    const corte = new Date(cuando.getTime() - VIGENCIA_MANIFIESTO_MS).toISOString();
    for (const [otra, m] of await almacen.listar<ManifiestoTurno>(prefijo(ambito))) {
      if (otra !== k && (m.ultimaVentaEn ?? "") < corte) await almacen.borrar(otra);
    }
  } catch {
    /* el manifiesto nunca frena una venta */
  }
}

/** La venta que el servidor rechazó al sincronizar: ya no va a existir. */
export async function quitarVentaDelTurno(clienteRequestId: string): Promise<void> {
  const ambito = ambitoSesion();
  if (!ambito) return;
  try {
    for (const [k, m] of await almacen.listar<ManifiestoTurno>(prefijo(ambito))) {
      if (!m.claves.includes(clienteRequestId)) continue;
      await almacen.guardar<ManifiestoTurno>(k, { ...m, claves: m.claves.filter((c) => c !== clienteRequestId) });
    }
  } catch {
    /* ídem */
  }
}

/** El manifiesto de una caja de esta sesión; null si no hay (o no se pudo leer). */
export async function manifiestoDelTurno(cajaId: number): Promise<ManifiestoTurno | null> {
  const ambito = ambitoSesion();
  if (!ambito) return null;
  try {
    return (await conTope(almacen.leer<ManifiestoTurno>(clave(ambito, cajaId)))) ?? null;
  } catch {
    return null;
  }
}

/** La caja cerró: su manifiesto ya no sirve. */
export async function olvidarTurno(cajaId: number): Promise<void> {
  const ambito = ambitoSesion();
  if (!ambito) return;
  try {
    await almacen.borrar(clave(ambito, cajaId));
  } catch {
    /* ídem */
  }
}

/**
 * Lo que este equipo declara en `POST caja/:id/cerrar` para que el servidor
 * confirme el cierre: cuántas ventas le quedan en la cola y las claves del
 * manifiesto, sin las que el servidor rechazó (la cola las lista hasta que el
 * cajero las descarte, pero ya no van a llegar).
 *
 * Cero y vacío no viajan: para el servidor es lo mismo que no mandarlos, y así
 * el cierre de siempre sigue siendo exactamente el de siempre.
 */
export async function declaracionDelEquipo(
  cajaId: number,
  cola: ReadonlyArray<Pick<VentaEncolada, "id" | "estado">>,
): Promise<{ pendientesEnEquipo?: number; ventasDelEquipo?: string[] }> {
  // Las mismas que `porSubir` (todo menos las rechazadas); no se importa
  // cola.ts para no armar un ciclo entre módulos.
  const pendientes = cola.filter((v) => v.estado !== "RECHAZADA").length;
  const rechazadas = new Set(cola.filter((v) => v.estado === "RECHAZADA").map((v) => v.id));
  const claves = ((await manifiestoDelTurno(cajaId))?.claves ?? []).filter((c) => !rechazadas.has(c));
  return {
    ...(pendientes > 0 ? { pendientesEnEquipo: pendientes } : {}),
    ...(claves.length ? { ventasDelEquipo: claves } : {}),
  };
}

// ── El latido ────────────────────────────────────────────────────────────────

/** Cada cuánto late el POS con la pantalla a la vista (el mismo minuto que Android). */
export const LATIDO_MS = 60_000;

export interface RespuestaLatido {
  ok: boolean;
  /** La caja ya la cerraron desde otro lado. */
  cerrada?: boolean;
  ahora?: number;
}

/**
 * Un latido (`POST caja/:id/latido`): cuántas ventas hay sin subir y cuándo se
 * cobró la última en este equipo. Silencioso: un latido que falla no es un
 * error del cajero (un backend anterior a la ruta contesta 404), y sin
 * latidos Supervisión simplemente no afirma nada. Devuelve la respuesta, o
 * null si no la hubo.
 */
export async function latidoDeCaja(
  cajaId: number,
  pendientes: number,
  enviar: (id: number, dto: { pendientes: number; ultimaVentaEnEquipoEn?: string }) => Promise<RespuestaLatido> = api.latidoCaja,
): Promise<RespuestaLatido | null> {
  try {
    const m = await manifiestoDelTurno(cajaId);
    return await enviar(cajaId, {
      pendientes,
      ...(m?.ultimaVentaEn ? { ultimaVentaEnEquipoEn: m.ultimaVentaEn } : {}),
    });
  } catch {
    return null;
  }
}
