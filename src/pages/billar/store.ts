import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import type { CreditoInput, FormaPago, PagoInput } from "../../types";
import { olvidarAvisos, prepararAvisos, reestrenarAvisos } from "./alertas";
import { tarifaDe } from "./calculo";
import {
  aMesa,
  aMesaAdmin,
  aPagos,
  aVenta,
  apiBillar,
  type AjustesApi,
  type Credenciales,
  type MesaApi,
  type TableroApi,
} from "./api";
import { ahoraServidor, fijarDesfase } from "./reloj";
import type { AjustesBillar, Caja, Devolucion, ItemVenta, Mesa, MetodoCobro, ProductoBillar, TipoMesa, VentaBillar } from "./tipos";

/**
 * El estado del billar y lo que se puede hacer con él.
 *
 * Manda el backend (`src/billar`): el tablero se trae cada pocos segundos
 * mientras alguna pantalla del billar lo mira (`useSondeoBillar`), y cada
 * acción es su llamada. Una acción devuelve la mesa entera y se reemplaza al
 * instante, sin esperar la próxima vuelta (como el salón del restaurante).
 *
 * Es un store suelto (`useSyncExternalStore`) y no un contexto porque lo leen
 * pantallas que no se tocan entre sí: el tablero, el consumo, el cierre, las
 * ventas, la TV y el contador del menú.
 */

/** Un aviso flotante: los de tiempo fijo y los de "venta completada". */
export interface Toast {
  id: string;
  tono: "ambar" | "rojo" | "verde";
  titulo: string;
  texto?: string;
  accion?:
    | { tipo: "extender"; mesaId: number }
    | { tipo: "ver"; mesaId: number }
    | { tipo: "ticket"; codigo: string };
}

export interface EstadoBillar {
  /** Ya llegó el primer tablero: antes las pantallas muestran "Cargando". */
  cargado: boolean;
  /** Por qué falló la última carga del tablero; null si anduvo. */
  error: string | null;
  /** La sucursal del tablero: la del cajero; la que elige el dueño (o la de su caja). */
  sucursal: string;
  /** Su id. null hasta que llega el primer tablero. */
  sucursalId: number | null;
  /**
   * Dónde está la caja abierta de quien mira. Si no es la del tablero, el
   * dueño está mirando otro local: ve las mesas pero no las opera desde ahí
   * (el backend exige la caja en el local de la mesa).
   */
  cajaSucursalId: number | null;
  tipos: Record<string, TipoMesa>;
  productos: ProductoBillar[];
  formasPago: FormaPago[];
  /** Los que valen en ESTE equipo: los del negocio con lo que se tocó en la campana. */
  ajustes: AjustesBillar;
  /** Los del negocio, sin lo de este equipo: los que edita el administrador. */
  ajustesNegocio: AjustesBillar;
  caja: Caja;
  mesas: Mesa[];
  /** Las ventas del turno (la caja de quien opera), la más nueva primero. */
  ventas: VentaBillar[];
  toasts: Toast[];
  /** Mesas de billar (administrador): todas, también las guardadas sin usar. */
  admin: { mesas: Mesa[]; cargado: boolean; error: string | null };
}

/** Una mesa como la carga o la edita el administrador (Mesas de billar). */
export interface DatosMesa {
  numero: number;
  alias?: string;
  tipo: string;
  tarifaPropia?: number;
  estado: "activa" | "fuera" | "inactiva";
  motivo?: string;
}

/** Un cobro como lo arma la pantalla de cobrar. */
export interface PagoNuevo {
  metodo: MetodoCobro;
  monto: number;
  partes?: { efectivo: number; qr: number };
  recibido?: number;
}

// ── Preferencias del equipo ─────────────────────────────────────────────────

/**
 * La campana del tablero: silencio, zumbido y voz EN ESTE EQUIPO. Los valores
 * del negocio los pone el administrador en Mesas de billar; el cajero no los
 * puede guardar para todos (y no tiene por qué: la segunda compu de la barra
 * no tiene que hablar). Lo que se toca acá pisa al del negocio sólo acá.
 */
const PREFS_KEY = "bamardev.billar.avisos";
type Preferencias = Partial<Pick<AjustesBillar, "silencio" | "sonido" | "voz">>;

function leerPrefs(): Preferencias {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Preferencias;
  } catch {
    return {};
  }
}

function guardarPrefs(p: Preferencias) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Sin almacenamiento la preferencia dura hasta recargar.
  }
}

let prefs = leerPrefs();
let ajustesNegocio: AjustesApi = {
  avisos: [10, 5, 1],
  sonido: true,
  voz: true,
  pin: { anularConsumo: true, anularMesa: true },
  tieneTokenSalon: false,
};

const conPrefs = (a: AjustesApi): AjustesBillar => ({ silencio: false, ...a, ...prefs });

// ── La sucursal que mira el dueño ───────────────────────────────────────────

/**
 * La sucursal que eligió el usuario de organización en el tablero, recordada
 * en el equipo como la vista de tarjetas (multisucursal, 13-oct). Vale para
 * todo lo que lee este store: el tablero, el consumo, la TV interna, los
 * avisos de fondo y Mesas de billar. Va por negocio: el id de un local no
 * significa nada en otro.
 *
 * null = no eligió: el backend decide (al cajero, la suya; al dueño, la de su
 * caja abierta o la principal). Un negocio de un solo local nunca elige, así
 * que pide lo mismo que antes. Al cajero el backend le fuerza la suya aunque
 * llegue otra, así que un número viejo guardado acá no le cambia nada.
 */
const SUCURSAL_KEY = "bamardev.billar.sucursal";
let sucursalPedida: number | null = null;

const claveSucursal = (negocio: string) => `${SUCURSAL_KEY}.${negocio}`;

function leerSucursal(negocio: string): number | null {
  try {
    const n = Number(localStorage.getItem(claveSucursal(negocio)));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function guardarSucursal(negocio: string | null, id: number | null) {
  if (!negocio) return;
  try {
    if (id == null) localStorage.removeItem(claveSucursal(negocio));
    else localStorage.setItem(claveSucursal(negocio), String(id));
  } catch {
    // Sin almacenamiento la elección dura hasta recargar.
  }
}

// ── El estado ───────────────────────────────────────────────────────────────

function inicial(): EstadoBillar {
  return {
    cargado: false,
    error: null,
    sucursal: "",
    sucursalId: null,
    cajaSucursalId: null,
    tipos: {},
    productos: [],
    formasPago: [],
    ajustes: conPrefs(ajustesNegocio),
    ajustesNegocio: { silencio: false, ...ajustesNegocio },
    caja: { abierta: false, desde: 0, inicial: 0 },
    mesas: [],
    ventas: [],
    toasts: [],
    admin: { mesas: [], cargado: false, error: null },
  };
}

let estado = inicial();
const oyentes = new Set<() => void>();

function cambiar(fn: (e: EstadoBillar) => EstadoBillar) {
  estado = fn(estado);
  for (const f of oyentes) f();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function useBillar(): EstadoBillar {
  return useSyncExternalStore(suscribir, () => estado);
}

/** Para el motor de avisos, que lee fuera del render. */
export function leerBillar(): EstadoBillar {
  return estado;
}


const mensaje = (err: unknown, otro: string) => (err instanceof Error && err.message ? err.message : otro);

// ── La carga ────────────────────────────────────────────────────────────────

/**
 * Cuántas acciones terminaron. La vuelta del tablero que salió ANTES de una
 * acción trae la mesa como estaba: si se aplicara, la mesa recién abierta
 * volvería a verse libre hasta la vuelta siguiente.
 */
let acciones = 0;
let trayendo = false;

function aplicarTablero(t: TableroApi) {
  ajustesNegocio = t.ajustes;
  cambiar((e) => ({
    ...e,
    cargado: true,
    error: null,
    sucursal: t.sucursal.nombre,
    sucursalId: t.sucursal.id,
    cajaSucursalId: t.caja.abierta ? (t.caja.sucursalId ?? null) : null,
    tipos: Object.fromEntries(t.tipos.map((x) => [x.id, x])),
    ajustes: conPrefs(t.ajustes),
    ajustesNegocio: { silencio: false, ...t.ajustes },
    caja: t.caja.abierta
      ? { abierta: true, id: t.caja.id, desde: t.caja.desde, inicial: t.caja.inicial }
      : { abierta: false, desde: 0, inicial: 0 },
    mesas: t.mesas.map(aMesa),
  }));
}

/** Cuándo llegó el último tablero, en la hora de este equipo (0: nunca). */
let tableroEn = 0;

/**
 * Si el tablero en memoria es de hace más de `ms`. Con la pestaña escondida el
 * sondeo no corre y la copia queda vieja: los avisos lo miran antes de sonar
 * (ver `MotorAvisos`).
 */
export function tableroViejo(ms = 10_000): boolean {
  return Date.now() - tableroEn > ms;
}

/** Trae el tablero. Sin `forzar`, no se superpone con otra vuelta en curso. */
export async function recargar(forzar = false): Promise<void> {
  if (trayendo && !forzar) return;
  trayendo = true;
  const marca = acciones;
  const pedida = sucursalPedida;
  const pedido = Date.now();
  try {
    const t = await apiBillar.tablero(pedida);
    // La hora del servidor, corrida a la mitad del viaje: sin esto, una compu
    // con el reloj adelantado cobraba con una hora que el servidor rechaza.
    fijarDesfase(t.ahora - (pedido + Date.now()) / 2);
    // Si mientras viajaba el dueño cambió de sucursal, es el tablero de otro local.
    if (marca !== acciones || pedida !== sucursalPedida) return;
    const primera = !estado.cargado;
    aplicarTablero(t);
    tableroEn = Date.now();
    if (primera) prepararAvisos(estado.mesas, estado.ajustes.avisos, ahoraServidor());
  } catch (err) {
    // La sucursal recordada ya no sirve (la borraron, o pasó a depósito): el
    // backend responde 400 y "Reintentar" volvía a pedir la misma, con el
    // billar trabado para siempre en este equipo. Se olvida y se pide lo que
    // decide el backend.
    if (pedida != null && pedida === sucursalPedida && err instanceof ApiError && err.status === 400) {
      olvidarSucursal();
      trayendo = false;
      await recargar(true);
      return;
    }
    cambiar((e) => ({ ...e, error: mensaje(err, "No se pudo traer el tablero") }));
  } finally {
    trayendo = false;
  }
}

/** Deja de pedir la sucursal elegida, también en el equipo. */
function olvidarSucursal() {
  sucursalPedida = null;
  guardarSucursal(negocioCargado, null);
}

export async function cargarProductos(): Promise<void> {
  const pedida = sucursalPedida;
  try {
    const productos = await apiBillar.productos(pedida);
    // El catálogo trae el precio y el stock de UN local: el de antes de
    // cambiar de sucursal no sirve.
    if (pedida !== sucursalPedida) return;
    cambiar((e) => ({ ...e, productos }));
  } catch {
    // Queda el catálogo anterior; la próxima acción lo vuelve a pedir.
  }
}

export async function cargarVentas(): Promise<void> {
  try {
    const ventas = (await apiBillar.ventas()).map(aVenta);
    cambiar((e) => ({ ...e, ventas }));
  } catch {
    // Quedan las de antes; "Ventas" las vuelve a pedir al entrar.
  }
}

async function formasPago(): Promise<FormaPago[]> {
  if (estado.formasPago.length) return estado.formasPago;
  const formas = await api.getFormasPago();
  cambiar((e) => ({ ...e, formasPago: formas }));
  return formas;
}

const CADA_MS = 5_000;
const LENTO_MS = 30_000;
let usuarios = 0;
let reloj: ReturnType<typeof setInterval> | null = null;
let vueltas = 0;
/** De qué negocio es lo que hay en memoria (ver `useSondeoBillar`). */
let negocioCargado: string | null = null;

function vuelta() {
  if (document.hidden) return;
  void recargar();
  // El catálogo y las ventas cambian menos: cada media minuto (y después de
  // cada acción de este equipo, que los pide al momento).
  if (++vueltas % (LENTO_MS / CADA_MS) === 0) {
    void cargarProductos();
    void cargarVentas();
  }
}

function alVolver() {
  if (!document.hidden) vuelta();
}

/**
 * De qué negocio es lo que hay en memoria, con la sucursal que recordaba este
 * equipo para él. La llama también Mesas de billar, que no sondea: quien sólo
 * administra no pasa por el tablero y tiene que ver el local que eligió.
 */
export function usarNegocio(negocio: string | undefined) {
  if (negocio !== undefined && negocioCargado !== negocio) {
    // Sin avisar a nadie: esto corre en pleno render, y lo que se monta ahora
    // ya lee el estado vacío.
    if (negocioCargado !== null) estado = inicial();
    negocioCargado = negocio;
    sucursalPedida = leerSucursal(negocio);
  }
}

/**
 * Mantiene el tablero al día mientras la pantalla que lo usa está montada:
 * otra caja pudo abrir, cobrar o mover una mesa. Con la pestaña escondida no
 * pregunta; al volver, pregunta enseguida.
 *
 * `negocio` es el alias de la sesión: si cambió (salió y entró a otro negocio
 * sin recargar la página), lo de antes se borra antes de mostrar nada.
 */
export function useSondeoBillar(negocio: string | undefined) {
  usarNegocio(negocio);
  useEffect(() => {
    usuarios++;
    if (usuarios === 1) {
      void recargar();
      void cargarProductos();
      void cargarVentas();
      void formasPago().catch(() => undefined);
      reloj = setInterval(vuelta, CADA_MS);
      document.addEventListener("visibilitychange", alVolver);
    }
    return () => {
      usuarios--;
      if (usuarios === 0) {
        if (reloj) clearInterval(reloj);
        reloj = null;
        document.removeEventListener("visibilitychange", alVolver);
      }
    };
  }, []);
}

// ── Ayudas ──────────────────────────────────────────────────────────────────

/** La tarifa que se le cobra a la mesa: con la que se abrió si está en juego, si no la de hoy. */
export function tipoDe(e: EstadoBillar, mesa: Mesa): TipoMesa {
  return mesa.sesion?.tarifa ?? tarifaVigente(e, mesa);
}

/** La tarifa de hoy: la propia de la mesa o la de su tipo. */
export function tarifaVigente(e: EstadoBillar, mesa: Pick<Mesa, "tipo" | "tarifaPropia">): TipoMesa {
  return tarifaDe(mesa, e.tipos[mesa.tipo] ?? Object.values(e.tipos)[0] ?? TIPO_VACIO);
}

/** Mientras no llegan los tipos (o si el tipo se borró): nada se cobra con esto. */
const TIPO_VACIO: TipoMesa = {
  id: "",
  nombre: "Mesa",
  tarifa: 0,
  fraccion: 15,
  tolerancia: 0,
  minimo: 0,
  paquetes: [],
  promos: [],
};

/** El número de una mesa nueva o renumerada: entero de 1 a 999 y sin repetir. */
export function errorDeNumero(mesas: Mesa[], numero: number): string | null {
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) return "Poné un número de 1 a 999.";
  if (mesas.some((m) => m.id === numero)) return `Ya existe la Mesa ${numero}.`;
  return null;
}

/** El que se sugiere para una mesa nueva: el que sigue al más alto. */
export function siguienteNumero(mesas: Mesa[]): number {
  return Math.max(0, ...mesas.map((m) => m.id)) + 1;
}

/** Las que salen en el tablero y en la TV: todas menos las inactivas. */
export function mesasEnUso(e: EstadoBillar): Mesa[] {
  return e.mesas.filter((m) => !m.inactiva);
}

/** Las líneas de consumo juntadas por producto y precio, para la cuenta y el cierre. */
export function agruparItems(
  consumos: { productoId: number; nombre: string; precio: number; cant: number; anulado?: boolean }[],
): ItemVenta[] {
  const out: ItemVenta[] = [];
  for (const c of consumos) {
    if (c.anulado) continue;
    const igual = out.find((x) => x.productoId === c.productoId && x.precio === c.precio);
    if (igual) igual.cant += c.cant;
    else out.push({ productoId: c.productoId, nombre: c.nombre, precio: c.precio, cant: c.cant });
  }
  return out;
}

function mesaDe(numero: number): Mesa {
  const m = estado.mesas.find((x) => x.id === numero);
  if (!m) throw new Error(`La Mesa ${numero} ya no está en el tablero. Volvé a cargarlo.`);
  return m;
}

function sesionDe(numero: number): { mesa: Mesa; sesionId: string } {
  const mesa = mesaDe(numero);
  if (!mesa.sesion) throw new Error(`La Mesa ${numero} ya no está en juego.`);
  return { mesa, sesionId: mesa.sesion.id };
}

/** Pone la mesa que devolvió una acción, en su lugar (por id interno: el número puede cambiar). */
function ponerMesa(m: MesaApi): Mesa {
  const nueva = aMesa(m);
  acciones++;
  cambiar((e) => {
    const sin = e.mesas.filter((x) => x.idInterno !== nueva.idInterno);
    // Una mesa inactiva no está en el tablero (`GET /billar/tablero` no la trae).
    const mesas = nueva.inactiva ? sin : [...sin, nueva].sort((a, b) => a.id - b.id);
    return { ...e, mesas };
  });
  return nueva;
}

// ── Acciones (una por endpoint) ─────────────────────────────────────────────

export interface AbrirOpciones {
  modo: "libre" | "fijo";
  horas?: number;
  /** Tiempo fijo cobrado al instante. Sin esto, se cobra al final. */
  pago?: PagoNuevo;
  cliente?: string;
  garantia?: string;
  nota?: string;
  /** El mismo en un reintento: el backend devuelve la mesa ya abierta. */
  clienteRequestId: string;
}

/**
 * Lo que hace cada botón. Todas devuelven una promesa: la pantalla espera la
 * respuesta para cerrar el diálogo o mostrar el error del servidor (caja
 * cerrada, mesa que cambió, PIN incorrecto…) sin perder lo que se cargó.
 */
export const billar = {
  async abrir(mesaId: number, o: AbrirOpciones): Promise<Mesa> {
    const mesa = mesaDe(mesaId);
    const pagos = o.pago ? aPagos(o.pago, await formasPago()) : undefined;
    const r = await apiBillar.abrir(mesa.idInterno, {
      modo: o.modo,
      ...(o.modo === "fijo" ? { horas: o.horas } : {}),
      ...(pagos ? { pagos } : {}),
      // Si venía reservada, el cliente es el de la reserva.
      cliente: o.cliente?.trim() || mesa.reserva?.nombre || undefined,
      garantia: o.garantia || undefined,
      nota: o.nota?.trim() || undefined,
      clienteRequestId: o.clienteRequestId,
    });
    return ponerMesa(r);
  },

  /** Carga a la cuenta. El stock se descuenta al cobrar, pero ya no se ofrece a otra mesa. */
  /** `clienteRequestId`: el mismo en un reintento de la misma carga (ver reintentos.ts). */
  async agregarConsumos(
    mesaId: number,
    items: { productoId: number; cant: number }[],
    clienteRequestId: string,
  ): Promise<Mesa> {
    const { sesionId } = sesionDe(mesaId);
    const r = await apiBillar.consumos(
      sesionId,
      items.filter((i) => i.cant > 0).map((i) => ({ productoId: i.productoId, cantidad: i.cant })),
      clienteRequestId,
    );
    void cargarProductos();
    return ponerMesa(r);
  },

  async anularConsumo(mesaId: number, itemId: string, motivo: string, cred: Credenciales): Promise<Mesa> {
    const { sesionId } = sesionDe(mesaId);
    const r = await apiBillar.anularConsumo(sesionId, itemId, motivo, cred);
    void cargarProductos();
    return ponerMesa(r);
  },

  /** Un adelanto o pago parcial: entra a la caja ahora y queda en la cuenta. */
  async pagar(mesaId: number, pago: PagoNuevo, clienteRequestId: string): Promise<Mesa> {
    const { sesionId } = sesionDe(mesaId);
    return ponerMesa(await apiBillar.pagar(sesionId, aPagos(pago, await formasPago()), clienteRequestId));
  },

  async pausar(mesaId: number, motivo: string): Promise<Mesa> {
    return ponerMesa(await apiBillar.pausar(sesionDe(mesaId).sesionId, motivo));
  },

  async reanudar(mesaId: number): Promise<Mesa> {
    return ponerMesa(await apiBillar.reanudar(sesionDe(mesaId).sesionId));
  },

  /** Suma horas al tiempo fijo; con `pago`, cobradas ahora. */
  async extender(mesaId: number, horas: number, pago: PagoNuevo | undefined, clienteRequestId: string): Promise<Mesa> {
    const { sesionId } = sesionDe(mesaId);
    const pagos = pago ? aPagos(pago, await formasPago()) : undefined;
    const r = await apiBillar.extender(sesionId, horas, pagos, clienteRequestId);
    // Las horas nuevas vuelven a avisar desde cero.
    olvidarAvisos(sesionId);
    return ponerMesa(r);
  },

  /**
   * La cuenta se muda entera a una mesa libre. Si es de otro tipo, lo jugado
   * queda a la tarifa vieja (`prev`), lo calcula el servidor.
   */
  async cambiarMesa(origenId: number, destinoId: number): Promise<Mesa> {
    const { sesionId } = sesionDe(origenId);
    const destino = mesaDe(destinoId);
    const r = await apiBillar.cambiar(sesionId, destino.idInterno);
    const nueva = ponerMesa(r);
    // La de origen quedó libre: la trae el tablero.
    void recargar(true);
    return nueva;
  },

  async editarInicio(mesaId: number, inicio: number, motivo: string, cred: Credenciales): Promise<Mesa> {
    const { sesionId } = sesionDe(mesaId);
    return ponerMesa(await apiBillar.editarInicio(sesionId, inicio, motivo, cred));
  },

  /**
   * La mesa se abrió por error: no se cobra nada. Devuelve cuánto hay que
   * devolverle al cliente y en qué (el detalle, si el backend ya lo manda).
   */
  async anularMesa(
    mesaId: number,
    motivo: string,
    cred: Credenciales,
    clienteRequestId: string,
  ): Promise<{ total: number; detalle?: Devolucion }> {
    const { sesionId } = sesionDe(mesaId);
    const r = await apiBillar.anular(sesionId, motivo, cred, clienteRequestId);
    ponerMesa(r.mesa);
    void cargarProductos();
    return { total: r.devolver, detalle: r.devolverDetalle };
  },

  async reservar(mesaId: number, hora: number, nombre: string): Promise<Mesa> {
    return ponerMesa(await apiBillar.reservar(mesaDe(mesaId).idInterno, hora, nombre.trim()));
  },

  async cancelarReserva(mesaId: number): Promise<Mesa> {
    return ponerMesa(await apiBillar.cancelarReserva(mesaDe(mesaId).idInterno));
  },

  async fueraDeServicio(mesaId: number, motivo: string): Promise<Mesa> {
    return ponerMesa(await apiBillar.fueraDeServicio(mesaDe(mesaId).idInterno, motivo));
  },

  async volverAServicio(mesaId: number): Promise<Mesa> {
    return ponerMesa(await apiBillar.volverAServicio(mesaDe(mesaId).idInterno));
  },

  /**
   * Cobra y cierra: una venta normal, con su comprobante. El servidor calcula
   * la cuenta hasta `hasta` con las mismas fórmulas; si no llega al total que
   * vio el cajero (alguien cargó algo mientras tanto), no cobra. Devuelve el
   * comprobante de la venta.
   */
  async cerrar(
    mesaId: number,
    cobro: {
      hasta: number;
      totalEsperado: number;
      pago?: PagoNuevo;
      /** Fiado: el saldo a Cuentas por cobrar (con un adelanto, si dejó algo). */
      credito?: { credito: CreditoInput; pagos: PagoInput[] };
      clienteRequestId: string;
    },
  ): Promise<string> {
    const { sesionId } = sesionDe(mesaId);
    const pagos = cobro.credito
      ? cobro.credito.pagos
      : cobro.pago
        ? aPagos(cobro.pago, await formasPago())
        : undefined;
    const r = await apiBillar.cerrar(sesionId, {
      hasta: cobro.hasta,
      totalEsperado: cobro.totalEsperado,
      ...(pagos?.length ? { pagos } : {}),
      ...(cobro.credito ? { credito: cobro.credito.credito } : {}),
      clienteRequestId: cobro.clienteRequestId,
    });
    // Un reintento de un cobro que ya había entrado devuelve sólo la venta.
    if (r.mesa) ponerMesa(r.mesa);
    else void recargar(true);
    await cargarVentas();
    void cargarProductos();
    return r.venta.comprobante ?? `#${r.venta.id}`;
  },

  /** Venta sin mesa (§7.7): una venta normal del POS, por el mismo camino. */
  /**
   * La venta rápida. Devuelve el comprobante y, si la venta ya había entrado
   * con OTROS pagos, cómo se cobró de verdad (`yaEntro`).
   *
   * Un reintento con la misma clave devuelve la venta que ya estaba, con sus
   * pagos: si se cortó la respuesta y el cliente dijo "le pago por QR", la
   * venta seguía en efectivo, el aviso decía "QR" y la caja esperaba un
   * efectivo que no entró (revisión del 16-oct).
   *
   * Sin "Cliente": el backend no guarda el nombre en una venta de mostrador (y
   * con una sola letra la rechazaba), así que la pantalla ya no lo pide.
   */
  async ventaRapida(
    items: { productoId: number; cant: number }[],
    pago: PagoNuevo,
    clienteRequestId: string,
  ): Promise<{ codigo: string; yaEntro: string | null }> {
    const formas = await formasPago();
    const pagos = aPagos(pago, formas);
    const venta = await api.crearVenta({
      detalles: items
        .filter((i) => i.cant > 0)
        .map((i) => ({
          productoId: i.productoId,
          cantidad: i.cant,
          precio: estado.productos.find((p) => p.id === i.productoId)?.precio,
        })),
      pagos,
      clienteRequestId,
    });
    acciones++;
    await cargarVentas();
    void cargarProductos();
    const firma = (ps: { formaPagoId: number; monto: number }[]) =>
      ps
        .map((p) => `${p.formaPagoId}:${Math.round(p.monto * 100)}`)
        .sort()
        .join("|");
    const reales = venta.pagos ?? [];
    const yaEntro =
      reales.length && firma(reales) !== firma(pagos)
        ? reales
            .map((p) => `${p.formaPago ?? formas.find((f) => f.id === p.formaPagoId)?.nombre ?? "otro medio"} ${fmtMoney(p.monto)}`)
            .join(" + ")
        : null;
    return { codigo: venta.comprobante ?? `#${venta.id}`, yaEntro };
  },

  /** Anular una venta (PIN siempre, como en todo el sistema): repone el stock y sale de la caja. */
  async anularVenta(ventaId: number, motivo: string, cred: Credenciales): Promise<void> {
    await api.anularVenta(ventaId, { ...cred, motivo });
    await cargarVentas();
    void cargarProductos();
  },

  /** Lo de la campana: sólo en este equipo (ver `PREFS_KEY`). */
  ajustar(cambio: Preferencias) {
    prefs = { ...prefs, ...cambio };
    guardarPrefs(prefs);
    cambiar((e) => ({ ...e, ajustes: conPrefs(ajustesNegocio) }));
  },

  // ── La sucursal (usuario de organización) ──

  /** La que eligió en este equipo; null si no eligió (decide el backend). */
  sucursalElegida(): number | null {
    return sucursalPedida;
  },

  /**
   * El dueño elige qué local mira (ver `sucursalPedida`). Lo del local de
   * antes se vacía en el acto: si no, por un momento se veían sus mesas con
   * el nombre del nuevo. Los avisos arrancan como en un equipo nuevo.
   */
  elegirSucursal(id: number | null) {
    if (id === sucursalPedida) return;
    sucursalPedida = id;
    guardarSucursal(negocioCargado, id);
    reestrenarAvisos();
    cambiar((e) => ({ ...e, cargado: false, error: null, mesas: [], productos: [] }));
    // Sin nadie mirando el tablero (Mesas de billar de quien sólo administra)
    // no se pide: le daría 403, y el 400 de una sucursal vieja la olvidaría.
    if (usuarios === 0) return;
    void recargar(true);
    void cargarProductos();
  },

  /**
   * Recién abierta la caja desde el billar. Si el dueño había elegido un
   * local y abrió la caja en otro, el tablero pasa al de la caja: es donde
   * puede operar. Sin elección (un negocio de un solo local, o un cajero) es
   * el `recargar` de siempre.
   */
  seguirCaja(cajaSucursalId: number | null) {
    if (sucursalPedida != null && cajaSucursalId != null && cajaSucursalId !== sucursalPedida) {
      billar.elegirSucursal(cajaSucursalId);
    } else {
      void recargar(true);
    }
  },

  // ── Mesas de billar (administrador) ──

  /**
   * Las mesas del local elegido, las tarifas y los ajustes, todo de
   * `/billar/admin`. Antes las tarifas venían del tablero, que pide atender
   * el billar: un rol que lo administra sin atenderlo no podía entrar
   * (13-oct).
   */
  async cargarAdmin(): Promise<void> {
    const pedida = sucursalPedida;
    try {
      const [mesas, tipos, ajustes] = await Promise.all([
        apiBillar.adminMesas(pedida),
        apiBillar.adminTipos(),
        apiBillar.adminAjustes(),
      ]);
      // Cambió de sucursal mientras viajaba: esas mesas son de otro local.
      if (pedida !== sucursalPedida) return;
      ajustesNegocio = ajustes;
      cambiar((e) => ({
        ...e,
        tipos: Object.fromEntries(tipos.map((x) => [x.id, x])),
        ajustes: conPrefs(ajustes),
        ajustesNegocio: { silencio: false, ...ajustes },
        admin: { mesas: mesas.map(aMesaAdmin).sort((a, b) => a.id - b.id), cargado: true, error: null },
      }));
    } catch (err) {
      cambiar((e) => ({ ...e, admin: { ...e.admin, error: mensaje(err, "No se pudieron traer las mesas") } }));
    }
  },

  /** Devuelve el error para el formulario, o null si se guardó. */
  async crearMesa(d: DatosMesa): Promise<string | null> {
    const error = errorDeNumero(estado.admin.mesas, d.numero);
    if (error) return error;
    try {
      await apiBillar.crearMesa({
        ...d,
        tarifaPropia: d.tarifaPropia ?? null,
        // En el local que se está mirando: el número es único por sucursal.
        ...(sucursalPedida != null ? { sucursalId: sucursalPedida } : {}),
      });
    } catch (err) {
      return mensaje(err, "No se pudo crear la mesa");
    }
    await billar.cargarAdmin();
    return null;
  },

  /**
   * Con la mesa en juego sólo se cambian el apodo y la tarifa (que corre
   * desde la próxima vez que se abra): el número, el tipo y el estado esperan
   * a que se cierre. Lo cuida también el servidor.
   */
  async editarMesa(id: number, d: DatosMesa): Promise<string | null> {
    const m0 = estado.admin.mesas.find((m) => m.id === id);
    if (!m0) return "La mesa ya no existe.";
    if (d.numero !== id) {
      if (m0.estado === "abierta") return "El número se cambia cuando la mesa se cierre.";
      const error = errorDeNumero(estado.admin.mesas, d.numero);
      if (error) return error;
    }
    try {
      await apiBillar.editarMesa(m0.idInterno, { ...d, tarifaPropia: d.tarifaPropia ?? null });
    } catch (err) {
      return mensaje(err, "No se pudo guardar la mesa");
    }
    await billar.cargarAdmin();
    return null;
  },

  /** Baja lógica: las ventas que tuvo siguen en el historial. */
  async eliminarMesa(id: number): Promise<string | null> {
    const m = estado.admin.mesas.find((x) => x.id === id);
    if (!m) return null;
    if (m.estado === "abierta") return `La Mesa ${id} está en juego: cerrala primero.`;
    try {
      await apiBillar.eliminarMesa(m.idInterno);
    } catch (err) {
      return mensaje(err, "No se pudo eliminar la mesa");
    }
    await billar.cargarAdmin();
    return null;
  },

  /** PUT tipos + PUT ajustes, juntos: es un solo "Guardar cambios". */
  async guardarTarifas(
    tipos: Record<string, TipoMesa>,
    ajustes: Pick<AjustesBillar, "avisos" | "sonido" | "voz" | "pin" | "horaCorteMin">,
  ): Promise<string | null> {
    try {
      await apiBillar.guardarTipos(
        Object.values(tipos).map((t) => ({
          codigo: t.id,
          nombre: t.nombre,
          tarifa: t.tarifa,
          fraccion: t.fraccion,
          tolerancia: t.tolerancia,
          minimo: t.minimo,
          paquetes: t.paquetes,
          promos: t.promos,
        })),
      );
      await apiBillar.guardarAjustes({
        avisos: ajustes.avisos,
        sonido: ajustes.sonido,
        voz: ajustes.voz,
        pinAnularConsumo: ajustes.pin.anularConsumo,
        pinAnularMesa: ajustes.pin.anularMesa,
        // La hora en que termina la jornada (reportes); sin ella no se toca.
        ...(ajustes.horaCorteMin != null ? { horaCorteMin: ajustes.horaCorteMin } : {}),
      });
    } catch (err) {
      return mensaje(err, "No se pudieron guardar las tarifas");
    }
    await billar.cargarAdmin();
    return null;
  },

  avisar(t: Omit<Toast, "id">) {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // Como mucho cuatro a la vez: el más viejo se va.
    cambiar((e) => ({ ...e, toasts: [...e.toasts.slice(-3), { ...t, id }] }));
    return id;
  },

  descartar(id: string) {
    cambiar((e) => ({ ...e, toasts: e.toasts.filter((t) => t.id !== id) }));
  },
};
