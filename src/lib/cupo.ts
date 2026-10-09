import type { CupoEstado, UnidadCupo } from "../types";
import { fechaNegocio } from "./agenda/horaAgenda";

/**
 * Cupo diario y créditos del Plan Emprendedor (PLAN-EMPRENDEDOR-TECNICO §5.1).
 *
 * Todo lo de acá es puro: recibe el último `cupo` que mandó el servidor (el
 * "snapshot") y decide qué mostrar y si se puede vender. El servidor sigue
 * siendo la verdad —rechaza con 403 `CUPO_AGOTADO` si otro equipo vendió
 * antes—; esto existe para no mandar una venta que ya se sabe que va a rebotar
 * y para avisar antes de que pase.
 *
 * La misma cuenta la hace Android. La web no tiene cola offline, así que sus
 * ventas pendientes de sincronizar (`P` en el plan) son siempre 0; el
 * parámetro queda para que la fórmula se lea igual en los dos clientes.
 */

/**
 * ¿Hay cupo que controlar? Sin `cupo` (backend anterior, sesión vieja) o con
 * `ilimitado` (Básico, Profesional: Omar) la respuesta es no, y entonces la
 * pantalla queda exactamente como siempre.
 */
export function aplicaCupo(cupo: CupoEstado | null | undefined): cupo is CupoEstado {
  return !!cupo && cupo.ilimitado === false;
}

export interface Proyeccion {
  /** Lo usado hoy por el cupo (0 si el snapshot es de otro día). */
  usadas: number;
  /** null = sin límite para esta unidad. */
  limite: number | null;
  /** Lugares que quedan en el cupo del día; `Infinity` sin límite. */
  restante: number;
  /** El saldo, descontado lo que la cola todavía no subió (en la web, nada). */
  saldo: number;
  /** Créditos que cuesta una venta o una cita fuera del cupo. */
  costo: number;
  /** ¿Se puede vender (o agendar) una más? */
  puede: boolean;
  /** El cupo del día ya se llenó: la próxima sale del monedero. */
  usaCreditos: boolean;
}

const SIN_LIMITE: Proyeccion = {
  usadas: 0,
  limite: null,
  restante: Infinity,
  saldo: 0,
  costo: 0,
  puede: true,
  usaCreditos: false,
};

/**
 * La proyección local de §5.1, para ventas o citas.
 *
 * Si el snapshot es de un día anterior (la pestaña quedó abierta desde ayer)
 * el contador arranca en 0, como lo hará el servidor; el saldo se conserva,
 * porque los créditos no vencen con el día.
 */
export function proyectar(
  cupo: CupoEstado | null | undefined,
  unidad: UnidadCupo,
  opts: { hoy?: string; pendientes?: number } = {},
): Proyeccion {
  if (!aplicaCupo(cupo)) return SIN_LIMITE;
  const hoy = opts.hoy ?? fechaNegocio();
  // Las citas no son offline (D23): para ellas no hay pendientes nunca.
  const pendientes = unidad === "VENTA" ? Math.max(0, opts.pendientes ?? 0) : 0;
  const contador = unidad === "VENTA" ? cupo.hoy.ventas : cupo.hoy.citas;
  const usadas = hoy === cupo.fecha ? contador.usadas : 0;
  const limite = contador.limite;
  const costo = unidad === "VENTA" ? cupo.creditosPorVenta : cupo.creditosPorCita;
  if (limite == null) {
    return { usadas, limite: null, restante: Infinity, saldo: cupo.creditos.saldo, costo, puede: true, usaCreditos: false };
  }
  const restante = Math.max(0, limite - usadas - pendientes);
  const exceso = Math.max(0, usadas + pendientes - limite);
  const saldo = cupo.creditos.saldo - exceso * costo;
  const puede = restante > 0 || saldo >= costo;
  return { usadas, limite, restante, saldo, costo, puede, usaCreditos: restante === 0 };
}

/** "−3" con el signo menos de verdad: el guion se pierde al lado de un número. */
export function fmtCreditos(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/** Palabra de la unidad, en plural o singular. */
export function palabraUnidad(unidad: UnidadCupo, n: number): string {
  if (unidad === "VENTA") return n === 1 ? "venta" : "ventas";
  return n === 1 ? "cita" : "citas";
}

/**
 * El texto del chip: "Hoy 32/50 · Créditos 240" en el POS y
 * "Citas hoy 12/50 · Créditos 240" en la agenda. Sin límite para esa unidad
 * sólo queda el saldo: un "12/∞" no le dice nada a nadie.
 */
export function textoChip(cupo: CupoEstado, unidad: UnidadCupo, hoy?: string): { contador: string | null; creditos: string } {
  const p = proyectar(cupo, unidad, { hoy });
  const prefijo = unidad === "VENTA" ? "Hoy" : "Citas hoy";
  return {
    contador: p.limite == null ? null : `${prefijo} ${p.usadas}/${p.limite}`,
    creditos: `Créditos ${fmtCreditos(cupo.creditos.saldo)}`,
  };
}

/** Título de la hoja que se abre al no poder vender o agendar. */
export function tituloAgotado(cupo: CupoEstado | null | undefined, unidad: UnidadCupo): string {
  const limite = unidad === "VENTA" ? cupo?.hoy.ventas.limite : cupo?.hoy.citas.limite;
  if (limite == null) return "No te quedan créditos";
  return `Llegaste a tus ${limite} ${palabraUnidad(unidad, limite)} de hoy`;
}

/** Desde cuánto saldo se avisa que quedan pocos créditos. */
export const SALDO_BAJO = 20;

export interface AvisoCupo {
  /** Identifica el aviso dentro del día: se muestra una sola vez. */
  clave: string;
  texto: string;
}

/**
 * Los avisos que corresponden con este snapshot (§5.1). Cada uno se muestra
 * una sola vez por día: de eso se encarga quien los muestra, con las marcas.
 *
 *   • al 80 % del cupo (40/50): "Te quedan 10 ventas en el cupo de hoy";
 *   • con el cupo lleno y créditos para seguir: desde ahora cada una usa
 *     créditos (cubre "la primera vez que se usan créditos": es la venta que
 *     sigue);
 *   • con saldo bajo, pero sólo cuando el cupo ya está por llenarse: con 10
 *     créditos de regalo y el cupo en 3/50, "te quedan 10 créditos" todos los
 *     días sería ruido que el dueño aprende a ignorar.
 */
export function avisosDe(cupo: CupoEstado | null | undefined, unidad: UnidadCupo, hoy?: string): AvisoCupo[] {
  if (!aplicaCupo(cupo)) return [];
  const p = proyectar(cupo, unidad, { hoy });
  if (p.limite == null) return [];
  const avisos: AvisoCupo[] = [];
  const umbral = Math.ceil(p.limite * 0.8);
  const cercaDelLimite = p.usadas >= umbral;
  if (cercaDelLimite && p.restante > 0) {
    avisos.push({
      clave: `${unidad}:80`,
      texto: `Te ${p.restante === 1 ? "queda" : "quedan"} ${p.restante} ${palabraUnidad(unidad, p.restante)} en el cupo de hoy`,
    });
  }
  if (p.usaCreditos && p.puede) {
    avisos.push({
      clave: `${unidad}:creditos`,
      texto:
        `Ya usaste las ${p.limite} de hoy: desde ahora cada ${palabraUnidad(unidad, 1)} usa ` +
        `${p.costo} ${p.costo === 1 ? "crédito" : "créditos"} (te quedan ${fmtCreditos(p.saldo)})`,
    });
  }
  if (cercaDelLimite && p.saldo < SALDO_BAJO) {
    avisos.push({
      // Una sola clave para ventas y citas: es el mismo monedero.
      clave: "saldo",
      texto: p.saldo === 1 ? "Te queda 1 crédito" : `Te quedan ${fmtCreditos(p.saldo)} créditos`,
    });
  }
  return avisos;
}

/** Marcas de "ya se mostró hoy". Viven en el navegador: son una comodidad. */
const AVISOS_KEY = "bamardev_web_cupo_avisos";

interface Marcas {
  fecha: string;
  claves: string[];
}

function leerMarcas(): Marcas | null {
  try {
    const raw = localStorage.getItem(AVISOS_KEY);
    return raw ? (JSON.parse(raw) as Marcas) : null;
  } catch {
    return null;
  }
}

/**
 * Los avisos que todavía no se mostraron hoy. Las marcas de otro día no
 * cuentan: al día siguiente cada aviso vuelve a poder salir una vez.
 */
export function sinMostrar(avisos: AvisoCupo[], fecha: string, marcas: Marcas | null = leerMarcas()): AvisoCupo[] {
  const vistas = marcas?.fecha === fecha ? marcas.claves : [];
  return avisos.filter((a) => !vistas.includes(a.clave));
}

/** Anota que el aviso ya salió hoy. Sin almacenamiento, se pierde y listo. */
export function marcarMostrado(clave: string, fecha: string): void {
  const previas = leerMarcas();
  const claves = previas?.fecha === fecha ? previas.claves : [];
  if (claves.includes(clave)) return;
  try {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ fecha, claves: [...claves, clave] }));
  } catch {
    /* modo privado: el aviso puede repetirse, no es grave */
  }
}

/** El 403 `CUPO_AGOTADO`, venga de ventas o de la agenda. */
export function esCupoAgotado(e: unknown): boolean {
  // Por forma y no con `instanceof ApiError`: el error es el mismo objeto,
  // pero así este archivo no arrastra el cliente HTTP (y los tests que lo
  // reemplazan no tienen que proveer la clase).
  const x = e as { status?: number; codigo?: string } | null;
  return !!x && x.codigo === "CUPO_AGOTADO";
}

/** El `cupo` que trae el cuerpo del 403, si vino bien formado. */
export function cupoDelError(e: unknown): CupoEstado | null {
  const detalle = (e as { detalle?: Record<string, unknown> } | null)?.detalle;
  const cupo = detalle?.cupo as CupoEstado | undefined;
  return cupo && typeof cupo === "object" && "hoy" in cupo ? cupo : null;
}
