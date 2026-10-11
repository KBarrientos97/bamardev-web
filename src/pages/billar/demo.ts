import type {
  AjustesBillar,
  Caja,
  Mesa,
  NegocioBillar,
  ProductoBillar,
  TipoMesa,
  VentaBillar,
} from "./tipos";

/**
 * MAQUETA: los datos de ejemplo del prototipo (BILLAR_MODULO_SPEC §10), armados
 * alrededor de la hora en que se abre la pantalla para que los cronómetros se
 * vean como en las capturas a cualquier hora. Se va cuando exista el backend.
 */

const MIN = 60_000;
const seg = (h: number, m: number, s = 0) => (h * 3600 + m * 60 + s) * 1000;

export const TIPOS_DEMO: Record<string, TipoMesa> = {
  pool: {
    id: "pool",
    nombre: "Pool",
    tarifa: 20,
    fraccion: 15,
    tolerancia: 3,
    minimo: 30,
    paquetes: [
      { h: 1, precio: 20 },
      { h: 2, precio: 40 },
      { h: 3, precio: 55 },
    ],
    promos: [{ id: "p3", nombre: "Promo 3 h o más", desde: 3, pct: 10, activa: true, fijo: false }],
  },
  carambola: {
    id: "carambola",
    nombre: "Carambola",
    tarifa: 25,
    fraccion: 15,
    tolerancia: 3,
    minimo: 30,
    paquetes: [
      { h: 1, precio: 25 },
      { h: 2, precio: 50 },
      { h: 3, precio: 70 },
    ],
    promos: [],
  },
};

export const PRODUCTOS_DEMO: ProductoBillar[] = [
  { id: 1, nombre: "Cerveza Paceña 620 ml", precio: 15, categoria: "Cervezas", stock: 71 },
  { id: 2, nombre: "Cerveza Huari 620 ml", precio: 17, categoria: "Cervezas", stock: 0 },
  { id: 3, nombre: "Coca Cola 500 ml", precio: 4, categoria: "Bebidas", stock: 48 },
  { id: 4, nombre: "Agua 600 ml", precio: 5, categoria: "Bebidas", stock: 36 },
  { id: 5, nombre: "Maní salado", precio: 5, categoria: "Snacks", stock: 24 },
  { id: 6, nombre: "Papas fritas", precio: 10, categoria: "Snacks", stock: 30 },
  { id: 7, nombre: "Salchipapa", precio: 17, categoria: "Comida", stock: 18 },
  { id: 8, nombre: "Hamburguesa", precio: 20, categoria: "Comida", stock: 12 },
  { id: 9, nombre: "Tiza", precio: 2, categoria: "Accesorios", stock: 40 },
  { id: 10, nombre: "Alquiler taco premium", precio: 10, categoria: "Accesorios", stock: 4 },
];

export const CATEGORIAS_DEMO = ["Cervezas", "Bebidas", "Snacks", "Comida", "Accesorios"];

/**
 * El color del monograma por categoría, como en la maqueta. Va acá y no en
 * `colorDeCategoria` (lib/iconosArticulo) porque ése lo comparten el POS del
 * restaurante y la farmacia: sumarle "Comida" le cambiaría el color a un
 * restaurante que tenga una categoría con ese nombre.
 */
export const COLOR_CATEGORIA: Record<string, { bg: string; fg: string }> = {
  Cervezas: { bg: "#FEF3C7", fg: "#B45309" },
  Bebidas: { bg: "#DBEAFE", fg: "#1D4ED8" },
  Snacks: { bg: "#FFE4E6", fg: "#BE123C" },
  Comida: { bg: "#D1FAE5", fg: "#047857" },
  Accesorios: { bg: "#EDE9FE", fg: "#6D28D9" },
};

/** Dirección y NIT del ticket: en producción salen de la sucursal (§4.6). */
export const NEGOCIO_DEMO: Omit<NegocioBillar, "nombre"> = {
  direccion: "Av. Principal #123",
  sucursal: "Sucursal Principal",
  nit: "1234567019",
  pieTicket: "¡Gracias por su visita!",
};

export const CAJERO_DEMO = "María F.";

export const AJUSTES_DEMO: AjustesBillar = {
  avisos: [10, 5, 1],
  sonido: true,
  voz: true,
  silencio: false,
  pin: { anularConsumo: true, anularMesa: true, anularVenta: true, descuento: true },
};

const item = (p: number, cant: number) => {
  const prod = PRODUCTOS_DEMO.find((x) => x.id === p)!;
  return { productoId: prod.id, nombre: prod.nombre, precio: prod.precio, cant };
};

export interface Semilla {
  caja: Caja;
  mesas: Mesa[];
  ventas: VentaBillar[];
  siguienteCodigo: number;
}

/** El turno de ejemplo, con `ahora` como la hora de la captura (≈ 09:42 p. m.). */
export function semilla(ahora: number): Semilla {
  const consumo = (id: string, p: number, cant: number, hace: number) => ({
    id,
    ...item(p, cant),
    hora: ahora - hace,
  });

  const mesas: Mesa[] = [
    { id: 1, tipo: "pool", estado: "libre", libreDesde: ahora - 27 * MIN },
    {
      id: 2,
      tipo: "pool",
      estado: "abierta",
      sesion: {
        id: "s2",
        start: ahora - seg(0, 47, 9),
        pausedAt: null,
        pausedTotal: 0,
        prepago: null,
        prev: null,
        consumos: [],
        pagos: [],
      },
    },
    {
      id: 3,
      tipo: "pool",
      estado: "abierta",
      sesion: {
        id: "s3",
        start: ahora - seg(1, 37, 9),
        pausedAt: null,
        pausedTotal: 0,
        cliente: "Carlos",
        garantia: "Carnet",
        prepago: null,
        prev: null,
        consumos: [
          consumo("c31", 1, 2, 80 * MIN),
          consumo("c32", 7, 1, 55 * MIN),
          consumo("c33", 5, 1, 40 * MIN),
          consumo("c34", 1, 1, 12 * MIN),
        ],
        pagos: [{ id: "p31", hora: ahora - 50 * MIN, metodo: "QR", monto: 50, nota: "Adelanto" }],
      },
    },
    {
      id: 4,
      tipo: "pool",
      estado: "abierta",
      sesion: {
        id: "s4",
        start: ahora - seg(0, 44, 9),
        pausedAt: ahora - seg(0, 5, 59),
        pausedTotal: 0,
        pauseMotivo: "Problema con la mesa",
        prepago: null,
        prev: null,
        consumos: [consumo("c41", 3, 2, 30 * MIN)],
        pagos: [],
      },
    },
    {
      id: 5,
      tipo: "pool",
      estado: "abierta",
      sesion: {
        id: "s5",
        start: ahora - seg(1, 53, 45),
        pausedAt: null,
        pausedTotal: 0,
        prepago: { min: 120, precio: 40, pagado: true },
        prev: null,
        consumos: [consumo("c51", 1, 2, 70 * MIN)],
        pagos: [
          { id: "p51", hora: ahora - seg(1, 53, 45), metodo: "Efectivo", monto: 40, nota: "Prepago 2 h", recibido: 50 },
        ],
      },
    },
    {
      id: 6,
      tipo: "carambola",
      estado: "reservada",
      reserva: { hora: ahora + 48 * MIN, nombre: "Jorge R." },
    },
    { id: 7, tipo: "carambola", estado: "libre", libreDesde: ahora - 62 * MIN },
    { id: 8, tipo: "pool", estado: "fuera", fueraMotivo: "Cambio de paño" },
  ];

  const venta = (
    n: number,
    hace: number,
    v: Omit<VentaBillar, "codigo" | "hora" | "cajero" | "consumosBs" | "total">,
  ): VentaBillar => {
    const consumosBs = v.items.reduce((t, i) => t + i.precio * i.cant, 0);
    return {
      codigo: `V00${n}`,
      hora: ahora - hace,
      cajero: CAJERO_DEMO,
      consumosBs,
      total: v.tiempoBs + consumosBs,
      ...v,
    };
  };
  const pago = (metodo: VentaBillar["pagos"][number]["metodo"], monto: number, hace: number) => ({
    id: `pv${hace}`,
    hora: ahora - hace,
    metodo,
    monto,
  });

  const ventas: VentaBillar[] = [
    venta(1035, seg(3, 30), {
      origen: "rapida",
      tiempoMin: 0,
      tiempoBs: 0,
      items: [item(3, 2)],
      pagos: [pago("Efectivo", 8, seg(3, 30))],
      recibido: 10,
      cambio: 2,
    }),
    venta(1036, seg(3, 2), {
      origen: "mesa",
      mesaId: 1,
      tipoMesa: "pool",
      tiempoMin: 60,
      tiempoBs: 20,
      items: [item(1, 2)],
      pagos: [pago("QR", 50, seg(3, 2))],
    }),
    venta(1037, seg(2, 37), {
      origen: "mesa",
      mesaId: 7,
      tipoMesa: "carambola",
      tiempoMin: 90,
      tiempoBs: 37.5,
      items: [item(5, 2)],
      pagos: [pago("Efectivo", 47.5, seg(2, 37))],
      recibido: 50,
      cambio: 2.5,
    }),
    venta(1038, seg(2, 20), {
      origen: "rapida",
      tiempoMin: 0,
      tiempoBs: 0,
      items: [item(8, 1), item(3, 1)],
      pagos: [pago("Efectivo", 24, seg(2, 20))],
      recibido: 24,
      cambio: 0,
    }),
    venta(1039, seg(1, 52), {
      origen: "mesa",
      mesaId: 2,
      tipoMesa: "pool",
      tiempoMin: 75,
      tiempoBs: 25,
      items: [item(1, 3), item(6, 1)],
      pagos: [{ ...pago("Mixto", 80, seg(1, 52)), partes: { efectivo: 50, qr: 30 } }],
    }),
    venta(1040, seg(1, 27), {
      origen: "mesa",
      mesaId: 6,
      tipoMesa: "carambola",
      tiempoMin: 120,
      tiempoBs: 50,
      items: [item(2, 4)],
      pagos: [pago("QR", 118, seg(1, 27))],
    }),
    venta(1041, seg(1, 2), {
      origen: "mesa",
      mesaId: 4,
      tipoMesa: "pool",
      tiempoMin: 30,
      tiempoBs: 10,
      items: [item(9, 1)],
      pagos: [pago("Efectivo", 12, seg(1, 2))],
      recibido: 12,
      cambio: 0,
    }),
    // Cuando se cerró quedó libre la Mesa 1: "libre hace 27 min".
    venta(1042, 27 * MIN, {
      origen: "mesa",
      mesaId: 1,
      tipoMesa: "pool",
      tiempoMin: 105,
      tiempoBs: 35,
      items: [item(1, 2), item(7, 1)],
      pagos: [pago("Efectivo", 82, 27 * MIN)],
      recibido: 100,
      cambio: 18,
    }),
    venta(1043, seg(0, 17), {
      origen: "rapida",
      tiempoMin: 0,
      tiempoBs: 0,
      items: [item(1, 3)],
      pagos: [pago("QR", 45, seg(0, 17))],
    }),
  ];

  return {
    caja: { abierta: true, desde: ahora - seg(3, 42), inicial: 200 },
    mesas,
    ventas,
    siguienteCodigo: 1044,
  };
}
