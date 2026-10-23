/**
 * Los datos del módulo Billar (BILLAR_MODULO_SPEC §4).
 *
 * Las horas son milisegundos y las pone el servidor (§9): la pantalla sólo
 * las muestra y calcula lo que falta para dibujar. Llegan del backend con
 * esta misma forma (ver `api.ts`).
 */

/** Un paquete de tiempo fijo: N horas por un precio cerrado. */
export interface Paquete {
  h: number;
  precio: number;
}

/** Descuento en el TIEMPO de mesa cuando juegan muchas horas (§4.1, §5.5). */
export interface Promo {
  id: string;
  nombre: string;
  /** Horas jugadas desde las que aplica. */
  desde: number;
  /** Porcentaje de descuento sobre el tiempo. Nunca toca los consumos. */
  pct: number;
  /** Pausada sin borrarla. */
  activa: boolean;
  /** ¿Aplica también al tiempo fijo? */
  fijo: boolean;
}

/** La tarifa de un tipo de mesa: Pool, Carambola… */
export interface TipoMesa {
  id: string;
  nombre: string;
  /** Bs por hora. */
  tarifa: number;
  /** Minutos por bloque de cobro. */
  fraccion: number;
  /** Minutos de gracia antes de cobrar el bloque siguiente. */
  tolerancia: number;
  /** Minutos mínimos cobrados en tiempo libre. */
  minimo: number;
  paquetes: Paquete[];
  promos: Promo[];
}

/** Lo que se guarda. `vence` y `cumplido` NO: se calculan (§3). */
export type EstadoMesa = "libre" | "abierta" | "reservada" | "fuera";

/** Lo que se ve: el guardado más los derivados del tiempo (§5.7). */
export type EstadoVisual =
  | "libre"
  | "juego"
  | "vence"
  | "cumplido"
  | "pausada"
  | "reservada"
  | "fuera";

export interface ItemConsumo {
  id: string;
  productoId: number;
  nombre: string;
  precio: number;
  cant: number;
  hora: number;
  anulado?: boolean;
}

/** Cómo se cobra en el billar (el mixto viaja como dos pagos: efectivo y QR). */
export type MetodoCobro = "Efectivo" | "QR" | "Mixto";

/** Fiado sólo aparece en una venta; otra forma de pago del negocio, con su nombre. */
export type MetodoPago = MetodoCobro | "Fiado" | (string & {});

export interface Pago {
  id: string;
  hora: number;
  metodo: MetodoPago;
  monto: number;
  /** Mixto: cuánto fue en efectivo y cuánto por QR. */
  partes?: { efectivo: number; qr: number };
  /** Efectivo: lo que entregó el cliente (para el vuelto del ticket). */
  recibido?: number;
  /** "Prepago 2 h", "Adelanto"… sale en el ticket. */
  nota?: string;
  /** Pagos de una mesa abierta: la caja donde entró y quién lo cobró. */
  cajaId?: number;
  cobradoPor?: string;
}

/** Tiempo fijo: lo contratado, con las extensiones sumadas. */
export interface Prepago {
  min: number;
  /** Bs del tiempo fijo, ya con la promo si aplica. */
  precio: number;
  /** Se cobró al abrir (o al extender). */
  pagado: boolean;
}

/** La promo que ya tenía ganada lo jugado en la otra mesa, congelada al cambiar. */
export interface PromoPrevia {
  nombre: string;
  pct: number;
  descuento: number;
}

/** Tiempo arrastrado al cambiar a una mesa de otro tipo: se cobra a la tarifa vieja. */
export interface TiempoPrevio {
  secs: number;
  min: number;
  /** Antes de la promo: la promo se mira al cerrar (ver `promoDeLaCuenta`). */
  bs: number;
  /** Null o ausente: no había ganado ninguna (o el backend es de antes del 17-oct). */
  promo?: PromoPrevia | null;
  /**
   * En qué segundo jugado la mesa anterior habría cobrado el bloque siguiente
   * (ver `cobroTramo`). Null o ausente con un backend de antes del 18-oct.
   */
  hastaSecs?: number | null;
}

/** Desde que se abre hasta que se cierra. Al cerrar se convierte en una venta. */
export interface Sesion {
  id: string;
  start: number;
  /** Cuándo se abrió de verdad (el inicio se puede corregir). Para el plazo de anular. */
  abierta?: number;
  pausedAt: number | null;
  /**
   * Desde cuándo está en pausa de verdad. `pausedAt` es lo que usa el cobro y un
   * cambio de mesa de otra tarifa la corre a la hora del cambio; para MEDIR la
   * pausa ("hace N min", el ámbar) vale ésta. Backend del 17-oct; sin ella,
   * `pausedAt`.
   */
  pausaDesde?: number;
  /**
   * Los tramos pausados que ya terminaron, en ms: Corregir inicio los usa para
   * decir cuánto queda jugado si la hora nueva deja pausas afuera (ver
   * `pausadoAntesDe`). Backend del 18-oct; sin ellos, como antes.
   */
  pausas?: { desde: number; hasta: number }[];
  /** Segundos acumulados en pausa. */
  pausedTotal: number;
  pauseMotivo?: string;
  cliente?: string;
  garantia?: string;
  nota?: string;
  prepago: Prepago | null;
  prev: TiempoPrevio | null;
  consumos: ItemConsumo[];
  pagos: Pago[];
  /**
   * La tarifa con que se abrió (la propia de la mesa ya aplicada). Si el
   * administrador cambia la tarifa con la mesa en juego, esta cuenta sigue
   * con la de antes: el cambio corre para las que se abran después.
   */
  tarifa?: TipoMesa;
}

export interface Mesa {
  /** El número que se ve: "MESA 5". Único por sucursal. */
  id: number;
  /** El id del backend, el que va en las rutas (el número lo puede cambiar el administrador). */
  idInterno: number;
  tipo: string;
  /** Apodo opcional ("Mesa VIP"): va debajo del número. */
  alias?: string;
  /** Pisa la tarifa del tipo. */
  tarifaPropia?: number;
  estado: EstadoMesa;
  libreDesde?: number;
  fueraMotivo?: string;
  reserva?: { hora: number; nombre: string };
  sesion?: Sesion;
  /**
   * Guardada sin usar: no sale en el tablero ni en la pantalla del salón,
   * pero sigue en Mesas de billar para volver a activarla.
   */
  inactiva?: boolean;
}

/**
 * Una cuenta abierta (21-oct): gente que se sienta a tomar sin jugar. Para el
 * backend es una sesión SIN mesa ni tiempo (su tarifa es de Bs 0): se le
 * cargan consumos, se le cobra de a poco y al final el saldo, con la misma
 * plata que una mesa (arqueo, stock comprometido, PIN).
 */
export interface CuentaSinMesa {
  /** El id de la sesión en el backend: el de las rutas y el de la pantalla. */
  id: number;
  /** "Mesa de afuera", "Juan", "Barra": como la nombró el cajero. */
  nombre: string;
  sesion: Sesion;
}

export interface ItemVenta {
  productoId: number;
  nombre: string;
  precio: number;
  cant: number;
}

/** Una venta del turno: de una mesa cerrada, de una cuenta abierta o una venta rápida (§4.5). */
export interface VentaBillar {
  /** El id de la venta en el backend: con él se anula. */
  id: number;
  codigo: string;
  hora: number;
  cajero: string;
  cliente?: string;
  /** "cuenta": una cuenta abierta cobrada (sin mesa ni tiempo, backend del 21-oct). */
  origen: "mesa" | "rapida" | "cuenta";
  mesaId?: number;
  /** El nombre de la cuenta abierta, si es de una. */
  cuenta?: string;
  tipoMesa?: string;
  tiempoMin: number;
  /**
   * De `tiempoMin`, los que vinieron de una mesa de otra tarifa (backend del
   * 18-oct): sin separarlos, todo el tiempo salía con el tipo de la última mesa.
   */
  tiempoPrevioMin?: number;
  tiempoBs: number;
  promo?: { nombre: string; pct: number; descuento: number };
  items: ItemVenta[];
  consumosBs: number;
  total: number;
  pagos: Pago[];
  /** Del último cobro en efectivo, para el ticket. */
  recibido?: number;
  cambio?: number;
  /**
   * Lo devuelto porque la cuenta bajó después de pagar. Cuando lo hay no hubo
   * cobro final: reemplaza al recibido y al cambio en el ticket.
   */
  devuelto?: Devolucion;
  /**
   * Efectivo de adelantos de esta mesa que cobró OTRA caja, por cajero: si se
   * anula la venta, esa plata está en el cajón de ellos.
   */
  adelantosOtraCaja?: { cajero: string; monto: number }[];
  /**
   * Minutos que la mesa estuvo en pausa (no se cobran). El ticket los muestra
   * para que el cliente vea el tiempo que no se le cobró. Desde el 17-oct.
   */
  pausaMin?: number;
  /** Ya se le corrigió el medio de pago (una vez por venta). Desde el 17-oct. */
  pagoCorregido?: boolean;
  /** Algo de esta mesa se cobró en OTRA caja, en cualquier medio: no se corrige acá. */
  cobradoEnOtraCaja?: boolean;
  anulada?: { hora: number; quien: string; motivo: string };
}

/** Lo que hay que devolverle al cliente cuando lo pagado pasa la cuenta. */
export interface Devolucion {
  efectivo: number;
  /** Lo que se devuelve por el mismo medio en que entró (QR, tarjeta). */
  otros: { metodo: string; monto: number }[];
}

/** Un producto del inventario, visto desde el billar. */
export interface ProductoBillar {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  /** Lo que queda para vender (lo cargado a mesas abiertas ya está restado); null = servicio, sin stock. */
  stock: number | null;
  /** El código de barras, para buscarlo o escanearlo (backend del 18-oct). */
  codBarra?: string | null;
  /** La llave del ícono del artículo, la del Punto de venta (backend del 23-oct). */
  icono?: string | null;
}

/**
 * Qué acciones piden el PIN de un encargado (§4.4). Anular una venta no está
 * acá porque en todo el sistema pide PIN siempre, y el billar no tiene
 * descuentos: esas dos casillas de la maqueta no hacían nada.
 */
export interface PinesBillar {
  anularConsumo: boolean;
  anularMesa: boolean;
  /**
   * Pausar congela el reloj: es tiempo que no se cobra. Llega desde el 17-oct;
   * sin el campo (backend anterior) no se pide PIN, como antes.
   */
  pausar: boolean;
}

export interface AjustesBillar {
  /** Minutos antes del fin del tiempo fijo en que se avisa. */
  avisos: number[];
  sonido: boolean;
  voz: boolean;
  /** Silencio global del tablero (la campana tachada). Es de este equipo, no viaja. */
  silencio: boolean;
  pin: PinesBillar;
  /** Si ya hay una llave para la pantalla del salón (la TV sin usuario). */
  tieneTokenSalon?: boolean;
  /**
   * A qué hora termina la jornada, en minutos desde la medianoche (0 a 720):
   * lo cobrado antes cuenta para el día anterior en los reportes (ver
   * `lib/jornada.ts`). Opcional: un backend anterior no lo manda.
   */
  horaCorteMin?: number;
}

/** Una línea de la auditoría (§4.7): pausas, anulaciones, cambios de mesa. */
export interface RegistroAuditoria {
  id: number;
  hora: number;
  mesaId?: number;
  /** "Pausó 6 min", "Anuló 1× Cerveza Paceña 620 ml". */
  accion: string;
  quien: string;
  motivo?: string;
  /** Quién puso el PIN, si hizo falta. */
  autorizo?: string;
}

/** La caja de quien opera: el billar cobra con la caja del cajero, como el POS. */
export interface Caja {
  abierta: boolean;
  /** El id de la caja (sólo abierta). */
  id?: number;
  desde: number;
  inicial: number;
}
