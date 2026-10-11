import { useSyncExternalStore } from "react";
import { fmtMoney } from "../../lib/format";
import { marcarLoYaPasado, olvidarAvisos } from "./alertas";
import { cuentaDe, precioFijo, round2, segundosJugados, tarifaDe } from "./calculo";
import { AJUSTES_DEMO, CAJERO_DEMO, PRODUCTOS_DEMO, TIPOS_DEMO, semilla } from "./demo";
import type {
  AjustesBillar,
  Caja,
  ItemVenta,
  Mesa,
  MetodoPago,
  Pago,
  ProductoBillar,
  RegistroAuditoria,
  Sesion,
  TipoMesa,
  VentaBillar,
} from "./tipos";

/**
 * El estado del billar y lo que se puede hacer con él.
 *
 * MAQUETA (oct-2026): vive en memoria y arranca con el turno de ejemplo cada
 * vez que se recarga la página. Las acciones tienen la forma de los endpoints
 * de la spec (§9): cuando llegue el backend, cada una pasa a ser su llamada y
 * el estado se trae de `GET /billar/mesas`; las pantallas no se enteran.
 *
 * Es un store suelto (`useSyncExternalStore`) y no un contexto porque lo leen
 * pantallas que no se tocan entre sí: el tablero, el consumo, el cierre, las
 * ventas y el contador del menú.
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
  tipos: Record<string, TipoMesa>;
  productos: ProductoBillar[];
  ajustes: AjustesBillar;
  caja: Caja;
  cajero: string;
  mesas: Mesa[];
  ventas: VentaBillar[];
  siguienteCodigo: number;
  toasts: Toast[];
  /** Pausas, anulaciones, cambios de mesa y extensiones (§4.7), la más nueva al final. */
  auditoria: RegistroAuditoria[];
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
  metodo: Exclude<MetodoPago, "Fiado">;
  monto: number;
  partes?: { efectivo: number; qr: number };
  recibido?: number;
}

let secuencia = 0;
const nuevoId = (prefijo: string) => `${prefijo}${Date.now().toString(36)}${(secuencia++).toString(36)}`;

function crear(ahora: number): EstadoBillar {
  const s = semilla(ahora);
  // La Mesa 5 arranca con 6 min: el aviso de 10 ya pasó y no se dispara de golpe.
  marcarLoYaPasado(s.mesas, AJUSTES_DEMO.avisos, (m) => (m.sesion ? segundosJugados(m.sesion, ahora) : 0));
  // Las mesas en juego del ejemplo se abrieron con la tarifa de hoy.
  const mesas = s.mesas.map((m) =>
    m.sesion ? { ...m, sesion: { ...m.sesion, tarifa: tarifaDe(m, TIPOS_DEMO[m.tipo]) } } : m,
  );
  return {
    tipos: TIPOS_DEMO,
    productos: PRODUCTOS_DEMO.map((p) => ({ ...p })),
    ajustes: { ...AJUSTES_DEMO, pin: { ...AJUSTES_DEMO.pin } },
    cajero: CAJERO_DEMO,
    toasts: [],
    auditoria: [],
    ...s,
    mesas,
  };
}

let estado = crear(Date.now());
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

// ── Ayudas ──────────────────────────────────────────────────────────────────

/** La tarifa que se le cobra a la mesa: con la que se abrió si está en juego, si no la de hoy. */
export function tipoDe(e: EstadoBillar, mesa: Mesa): TipoMesa {
  return mesa.sesion?.tarifa ?? tarifaVigente(e, mesa);
}

/** La tarifa de hoy: la propia de la mesa o la de su tipo. */
export function tarifaVigente(e: EstadoBillar, mesa: Pick<Mesa, "tipo" | "tarifaPropia">): TipoMesa {
  return tarifaDe(mesa, e.tipos[mesa.tipo] ?? Object.values(e.tipos)[0]);
}

/** El número de una mesa nueva o renumerada: entero de 1 a 999 y sin repetir. */
export function errorDeNumero(e: EstadoBillar, numero: number): string | null {
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) return "Poné un número de 1 a 999.";
  if (e.mesas.some((m) => m.id === numero)) return `Ya existe la Mesa ${numero}.`;
  return null;
}

/** El que se sugiere para una mesa nueva: el que sigue al más alto. */
export function siguienteNumero(e: EstadoBillar): number {
  return Math.max(0, ...e.mesas.map((m) => m.id)) + 1;
}

/** Las que salen en el tablero y en la TV: todas menos las inactivas. */
export function mesasEnUso(e: EstadoBillar): Mesa[] {
  return e.mesas.filter((m) => !m.inactiva);
}

/** Sin la sesión ni lo del turno: como queda una mesa al cerrarse o al pasar la cuenta a otra. */
function mesaLibre(m: Mesa, ahora: number): Mesa {
  return {
    id: m.id,
    tipo: m.tipo,
    alias: m.alias,
    tarifaPropia: m.tarifaPropia,
    inactiva: m.inactiva,
    estado: "libre",
    libreDesde: ahora,
  };
}

function registrar(e: EstadoBillar, r: Omit<RegistroAuditoria, "id" | "hora" | "quien"> & { quien?: string }): EstadoBillar {
  return {
    ...e,
    auditoria: [...e.auditoria, { id: nuevoId("a"), hora: Date.now(), quien: e.cajero, ...r }],
  };
}

/** "6 min", "1 h 5 min": lo que duró una pausa, para la auditoría. */
function duracion(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min / 60} h`;
}

function conMesa(e: EstadoBillar, id: number, fn: (m: Mesa) => Mesa): EstadoBillar {
  return { ...e, mesas: e.mesas.map((m) => (m.id === id ? fn(m) : m)) };
}

function conSesion(e: EstadoBillar, id: number, fn: (s: Sesion, m: Mesa) => Sesion): EstadoBillar {
  return conMesa(e, id, (m) => (m.sesion ? { ...m, sesion: fn(m.sesion, m) } : m));
}

function moverStock(productos: ProductoBillar[], items: { productoId: number; cant: number }[], signo: 1 | -1) {
  return productos.map((p) => {
    const cant = items.filter((i) => i.productoId === p.id).reduce((t, i) => t + i.cant, 0);
    return cant ? { ...p, stock: Math.max(0, p.stock + signo * cant) } : p;
  });
}

function pagoDe(p: PagoNuevo, nota?: string): Pago {
  return { id: nuevoId("p"), hora: Date.now(), ...p, nota };
}

/** Las líneas de consumo juntadas por producto y precio, para la venta y el ticket. */
export function agruparItems(consumos: { productoId: number; nombre: string; precio: number; cant: number; anulado?: boolean }[]): ItemVenta[] {
  const out: ItemVenta[] = [];
  for (const c of consumos) {
    if (c.anulado) continue;
    const igual = out.find((x) => x.productoId === c.productoId && x.precio === c.precio);
    if (igual) igual.cant += c.cant;
    else out.push({ productoId: c.productoId, nombre: c.nombre, precio: c.precio, cant: c.cant });
  }
  return out;
}

function codigo(e: EstadoBillar): [string, EstadoBillar] {
  return [`V00${e.siguienteCodigo}`, { ...e, siguienteCodigo: e.siguienteCodigo + 1 }];
}

// ── Acciones (una por endpoint de la spec §9) ───────────────────────────────

export interface AbrirOpciones {
  modo: "libre" | "fijo";
  horas?: number;
  /** Tiempo fijo cobrado al instante. Sin esto, se cobra al final. */
  pago?: PagoNuevo;
  cliente?: string;
  garantia?: string;
  nota?: string;
}

export const billar = {
  /** POST /billar/mesas/:id/abrir */
  abrir(mesaId: number, o: AbrirOpciones) {
    cambiar((e) =>
      conMesa(e, mesaId, (m) => {
        const t = tipoDe(e, m);
        const horas = o.horas ?? 0;
        const fijo = o.modo === "fijo" && horas > 0 ? precioFijo(t, horas) : null;
        const ahora = Date.now();
        return {
          id: m.id,
          tipo: m.tipo,
          alias: m.alias,
          tarifaPropia: m.tarifaPropia,
          inactiva: m.inactiva,
          estado: "abierta",
          sesion: {
            tarifa: t,
            id: nuevoId("s"),
            start: ahora,
            pausedAt: null,
            pausedTotal: 0,
            // Si venía reservada, el cliente es el de la reserva.
            cliente: o.cliente?.trim() || m.reserva?.nombre,
            garantia: o.garantia,
            nota: o.nota?.trim() || undefined,
            prepago: fijo ? { min: horas * 60, precio: fijo.precio, pagado: !!o.pago } : null,
            prev: null,
            consumos: [],
            pagos: o.pago ? [pagoDe(o.pago, `Prepago ${horas} h`)] : [],
          },
        };
      }),
    );
  },

  /** POST /billar/sesiones/:id/consumos — descuenta stock. */
  agregarConsumos(mesaId: number, items: { productoId: number; cant: number }[]) {
    cambiar((e) => {
      const ahora = Date.now();
      const lineas = items
        .filter((i) => i.cant > 0)
        .map((i) => {
          const p = e.productos.find((x) => x.id === i.productoId)!;
          return { id: nuevoId("c"), productoId: p.id, nombre: p.nombre, precio: p.precio, cant: i.cant, hora: ahora };
        });
      const conConsumo = conSesion(e, mesaId, (s) => ({ ...s, consumos: [...s.consumos, ...lineas] }));
      return { ...conConsumo, productos: moverStock(e.productos, items, -1) };
    });
  },

  /** DELETE /billar/sesiones/:id/consumos/:itemId — repone stock. */
  anularConsumo(mesaId: number, itemId: string, motivo: string, autorizo?: string) {
    cambiar((e) => {
      const linea = e.mesas.find((m) => m.id === mesaId)?.sesion?.consumos.find((c) => c.id === itemId);
      if (!linea || linea.anulado) return e;
      const sin = conSesion(e, mesaId, (s) => ({
        ...s,
        consumos: s.consumos.map((c) => (c.id === itemId ? { ...c, anulado: true } : c)),
      }));
      return registrar(
        { ...sin, productos: moverStock(e.productos, [linea], 1) },
        { mesaId, accion: `Anuló ${linea.cant}× ${linea.nombre}`, motivo, autorizo },
      );
    });
  },

  /** POST /billar/sesiones/:id/pagos — un adelanto o pago parcial. */
  pagar(mesaId: number, pago: PagoNuevo, nota = "Adelanto") {
    cambiar((e) => conSesion(e, mesaId, (s) => ({ ...s, pagos: [...s.pagos, pagoDe(pago, nota)] })));
  },

  pausar(mesaId: number, motivo: string) {
    cambiar((e) =>
      conSesion(e, mesaId, (s) => (s.pausedAt ? s : { ...s, pausedAt: Date.now(), pauseMotivo: motivo })),
    );
  },

  /** La pausa queda en la auditoría al reanudar, cuando ya se sabe cuánto duró. */
  reanudar(mesaId: number) {
    cambiar((e) => {
      const s = e.mesas.find((m) => m.id === mesaId)?.sesion;
      if (!s?.pausedAt) return e;
      const pausa = Date.now() - s.pausedAt;
      const sigue = conSesion(e, mesaId, (x) => ({
        ...x,
        pausedTotal: x.pausedTotal + Math.floor(pausa / 1000),
        pausedAt: null,
        pauseMotivo: undefined,
      }));
      return registrar(sigue, { mesaId, accion: `Pausó ${duracion(pausa)}`, motivo: s.pauseMotivo });
    });
  },

  /** POST /billar/sesiones/:id/extender — suma minutos y precio al tiempo fijo. */
  extender(mesaId: number, horas: number, pago?: PagoNuevo) {
    cambiar((e) => {
      const m = e.mesas.find((x) => x.id === mesaId);
      if (!m?.sesion?.prepago) return e;
      const extra = precioFijo(tipoDe(e, m), horas).precio;
      const extendida = conSesion(e, mesaId, (s) => {
        if (!s.prepago) return s;
        olvidarAvisos(s.id);
        return {
          ...s,
          prepago: {
            min: s.prepago.min + horas * 60,
            precio: round2(s.prepago.precio + extra),
            pagado: s.prepago.pagado && !!pago,
          },
          pagos: pago ? [...s.pagos, pagoDe(pago, `Extensión ${horas} h`)] : s.pagos,
        };
      });
      return registrar(extendida, {
        mesaId,
        accion: `Extendió ${horas} h · ${fmtMoney(extra)}${pago ? "" : " (al final)"}`,
      });
    });
  },

  /**
   * POST /billar/sesiones/:id/cambiar. La cuenta se muda entera. Si la mesa
   * nueva es de otro tipo, lo jugado hasta acá queda cobrado a la tarifa vieja
   * (`prev`) y el cronómetro sigue sumando.
   */
  cambiarMesa(origenId: number, destinoId: number) {
    cambiar((e) => {
      const origen = e.mesas.find((m) => m.id === origenId);
      const destino = e.mesas.find((m) => m.id === destinoId);
      if (!origen?.sesion || !destino || destino.estado !== "libre") return e;
      const ahora = Date.now();
      let sesion = origen.sesion;
      const vieja = tipoDe(e, origen);
      const nueva = tarifaVigente(e, destino);
      // El tiempo fijo ya tiene su precio: el excedente sigue a la tarifa con que se abrió.
      if (!sesion.prepago && (vieja.id !== nueva.id || vieja.tarifa !== nueva.tarifa)) {
        const c = cuentaDe(sesion, vieja, ahora);
        const bruto = c.tiempoBs + (c.promo?.descuento ?? 0);
        sesion = {
          ...sesion,
          tarifa: nueva,
          start: ahora,
          pausedTotal: 0,
          pausedAt: sesion.pausedAt ? ahora : null,
          prev: { secs: segundosJugados(sesion, ahora), min: c.cobradoMin, bs: round2(bruto) },
        };
      }
      const movida = {
        ...e,
        mesas: e.mesas.map((m) => {
          if (m.id === origenId) return mesaLibre(m, ahora);
          if (m.id === destinoId) return { ...m, estado: "abierta" as const, libreDesde: undefined, sesion };
          return m;
        }),
      };
      return registrar(movida, { mesaId: origenId, accion: `Pasó la cuenta a la Mesa ${destinoId}` });
    });
  },

  reservar(mesaId: number, hora: number, nombre: string) {
    cambiar((e) => conMesa(e, mesaId, (m) => ({ ...m, estado: "reservada", reserva: { hora, nombre: nombre.trim() } })));
  },

  cancelarReserva(mesaId: number) {
    cambiar((e) =>
      conMesa(e, mesaId, (m) => ({ ...m, estado: "libre", reserva: undefined, libreDesde: Date.now() })),
    );
  },

  fueraDeServicio(mesaId: number, motivo: string) {
    cambiar((e) => conMesa(e, mesaId, (m) => ({ ...m, estado: "fuera", fueraMotivo: motivo, reserva: undefined })));
  },

  volverAServicio(mesaId: number) {
    cambiar((e) =>
      conMesa(e, mesaId, (m) => ({ ...m, estado: "libre", fueraMotivo: undefined, libreDesde: Date.now() })),
    );
  },

  /**
   * POST /billar/sesiones/:id/cerrar → una venta normal. La mesa queda libre.
   * Devuelve el código de la venta. MAQUETA: con el backend la cuenta la
   * recalcula el servidor con las mismas funciones (§9).
   */
  cerrar(mesaId: number, cobro: { pago?: PagoNuevo; fiado?: { cliente: string } }, hasta = Date.now()): string | null {
    let hecho: string | null = null;
    cambiar((e) => {
      const m = e.mesas.find((x) => x.id === mesaId);
      if (!m?.sesion) return e;
      const s = m.sesion;
      const ahora = Date.now();
      // La cuenta es la que vio el cajero al cobrar (`hasta`): si el tiempo
      // subió de tramo mientras contaba el vuelto, no se le cobra distinto.
      const c = cuentaDe(s, tipoDe(e, m), hasta);
      const pagos = [...s.pagos];
      if (c.saldo > 0 && cobro.fiado) {
        pagos.push({ id: nuevoId("p"), hora: ahora, metodo: "Fiado", monto: c.saldo, nota: cobro.fiado.cliente });
      } else if (c.saldo > 0 && cobro.pago) {
        pagos.push(pagoDe({ ...cobro.pago, monto: c.saldo }));
      }
      const [cod, e2] = codigo(e);
      hecho = cod;
      const recibido = cobro.pago?.metodo === "Efectivo" ? cobro.pago.recibido : undefined;
      const venta: VentaBillar = {
        codigo: cod,
        hora: ahora,
        cajero: e.cajero,
        cliente: cobro.fiado?.cliente ?? s.cliente,
        origen: "mesa",
        mesaId: m.id,
        tipoMesa: m.tipo,
        tiempoMin: c.cobradoMin,
        tiempoBs: c.tiempoBs,
        promo: c.promo ?? undefined,
        items: agruparItems(s.consumos),
        consumosBs: c.consumosBs,
        total: c.total,
        pagos,
        recibido,
        cambio: recibido !== undefined ? round2(recibido - c.saldo) : undefined,
      };
      return {
        ...conMesa(e2, mesaId, (x) => mesaLibre(x, ahora)),
        ventas: [...e2.ventas, venta],
      };
    });
    return hecho;
  },

  /** POST /billar/ventas-rapidas → venta sin mesa, descuenta stock. */
  ventaRapida(items: { productoId: number; cant: number }[], pago: PagoNuevo, cliente?: string): string {
    let hecho = "";
    cambiar((e) => {
      const [cod, e2] = codigo(e);
      hecho = cod;
      const lineas = items
        .filter((i) => i.cant > 0)
        .map((i) => {
          const p = e.productos.find((x) => x.id === i.productoId)!;
          return { productoId: p.id, nombre: p.nombre, precio: p.precio, cant: i.cant };
        });
      const total = round2(lineas.reduce((t, l) => t + l.precio * l.cant, 0));
      const venta: VentaBillar = {
        codigo: cod,
        hora: Date.now(),
        cajero: e.cajero,
        cliente: cliente?.trim() || undefined,
        origen: "rapida",
        tiempoMin: 0,
        tiempoBs: 0,
        items: lineas,
        consumosBs: total,
        total,
        pagos: [pagoDe({ ...pago, monto: total })],
        recibido: pago.metodo === "Efectivo" ? pago.recibido : undefined,
        cambio: pago.metodo === "Efectivo" && pago.recibido !== undefined ? round2(pago.recibido - total) : undefined,
      };
      return { ...e2, ventas: [...e2.ventas, venta], productos: moverStock(e.productos, lineas, -1) };
    });
    return hecho;
  },

  /** Anular una venta (PIN + motivo): repone el stock y sale de la caja. */
  anularVenta(cod: string, motivo: string, autorizo?: string) {
    cambiar((e) => {
      const v = e.ventas.find((x) => x.codigo === cod);
      if (!v || v.anulada) return e;
      const anulada = {
        ...e,
        ventas: e.ventas.map((x) =>
          x.codigo === cod ? { ...x, anulada: { hora: Date.now(), quien: autorizo ?? e.cajero, motivo } } : x,
        ),
        productos: moverStock(e.productos, v.items, 1),
      };
      return registrar(anulada, {
        mesaId: v.mesaId,
        accion: `Anuló la venta ${v.codigo} · ${fmtMoney(v.total)}`,
        motivo,
        autorizo,
      });
    });
  },

  abrirCaja(inicial: number) {
    cambiar((e) => ({ ...e, caja: { abierta: true, desde: Date.now(), inicial }, ventas: [] }));
  },

  /**
   * POST /billar/caja/cerrar. Las mesas abiertas NO lo impiden (como en la
   * captura de Cerrar caja): siguen corriendo y se cobran en el turno que
   * venga, con su saldo. Lo que ya pagaron queda en esta caja.
   */
  cerrarCaja() {
    cambiar((e) => ({ ...e, caja: { ...e.caja, abierta: false } }));
  },

  // ── Mesas de billar (administrador) ──

  /** POST /billar/mesas. Devuelve el error para el formulario, o null. */
  crearMesa(d: DatosMesa): string | null {
    const error = errorDeNumero(leerBillar(), d.numero);
    if (error) return error;
    cambiar((e) => {
      const nueva: Mesa = {
        id: d.numero,
        tipo: d.tipo,
        alias: d.alias,
        tarifaPropia: d.tarifaPropia,
        estado: d.estado === "fuera" ? "fuera" : "libre",
        fueraMotivo: d.estado === "fuera" ? d.motivo : undefined,
        libreDesde: Date.now(),
        inactiva: d.estado === "inactiva" || undefined,
      };
      return { ...e, mesas: [...e.mesas, nueva].sort((a, b) => a.id - b.id) };
    });
    return null;
  },

  /**
   * PUT /billar/mesas/:id. Con la mesa en juego sólo se cambian el apodo y la
   * tarifa (que corre desde la próxima vez que se abra): el número, el tipo y
   * el estado esperan a que se cierre.
   */
  editarMesa(id: number, d: DatosMesa): string | null {
    const e0 = leerBillar();
    const m0 = e0.mesas.find((m) => m.id === id);
    if (!m0) return "La mesa ya no existe.";
    const enJuego = m0.estado === "abierta";
    if (d.numero !== id) {
      if (enJuego) return "El número se cambia cuando la mesa se cierre.";
      const error = errorDeNumero(e0, d.numero);
      if (error) return error;
    }
    cambiar((e) => {
      const mesas = e.mesas.map((m): Mesa => {
        if (m.id !== id) return m;
        const base = { ...m, alias: d.alias, tarifaPropia: d.tarifaPropia };
        if (enJuego) return base;
        const ahora = Date.now();
        const conTipo = { ...base, id: d.numero, tipo: d.tipo, inactiva: d.estado === "inactiva" || undefined };
        if (d.estado === "fuera") {
          return { ...conTipo, estado: "fuera", fueraMotivo: d.motivo, reserva: undefined, libreDesde: undefined };
        }
        // Una inactiva no guarda la reserva: ya no está en el tablero.
        if (d.estado === "inactiva") return { ...conTipo, estado: "libre", fueraMotivo: undefined, reserva: undefined, libreDesde: ahora };
        if (m.estado === "fuera") return { ...conTipo, estado: "libre", fueraMotivo: undefined, libreDesde: ahora };
        return conTipo;
      });
      return { ...e, mesas: mesas.sort((a, b) => a.id - b.id) };
    });
    return null;
  },

  /** DELETE /billar/mesas/:id (soft delete: las ventas hechas siguen en el historial). */
  eliminarMesa(id: number): string | null {
    const m = leerBillar().mesas.find((x) => x.id === id);
    if (m?.estado === "abierta") return `La Mesa ${id} está en juego: cerrala primero.`;
    cambiar((e) => ({ ...e, mesas: e.mesas.filter((x) => x.id !== id) }));
    return null;
  },

  /** PUT /billar/tipos + PUT /billar/ajustes, juntos: es un solo "Guardar cambios". */
  guardarTarifas(tipos: Record<string, TipoMesa>, ajustes: Pick<AjustesBillar, "avisos" | "sonido" | "voz" | "pin">) {
    cambiar((e) => ({ ...e, tipos, ajustes: { ...e.ajustes, ...ajustes } }));
  },

  ajustar(cambio: Partial<AjustesBillar>) {
    cambiar((e) => ({ ...e, ajustes: { ...e.ajustes, ...cambio } }));
  },

  avisar(t: Omit<Toast, "id">) {
    const id = nuevoId("t");
    // Como mucho cuatro a la vez: el más viejo se va.
    cambiar((e) => ({ ...e, toasts: [...e.toasts.slice(-3), { ...t, id }] }));
    return id;
  },

  descartar(id: string) {
    cambiar((e) => ({ ...e, toasts: e.toasts.filter((t) => t.id !== id) }));
  },
};
