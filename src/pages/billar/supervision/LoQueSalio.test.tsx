import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { ReporteCierreProductos } from "../../../types";
import type { SupervisionApi } from "../api";
import { vistaCuenta, vistaDe } from "../vista";
import { TarjetaLoQueSalio } from "./LoQueSalio";
import { armarSupervision, consumosEnCurso, desglosePorCobrar, resumenSupervision, type PedidoEnCurso } from "./Supervision.datos";

/**
 * "Lo que salió en el turno" de la Supervisión del billar (25-oct), armada con
 * las mismas cuentas que la pantalla: lo cobrado en el turno, lo pedido en las
 * mesas y cuentas abiertas, y el pie que llega al KPI "Por cobrar".
 *
 * El turno es el de la captura de Kevin: una venta de Bs 50 (PACEÑA BOTELLA,
 * PALITO y HILLS); la Mesa 2 con 2 h de tiempo fijo (Bs 40, se cobra al final),
 * 2 CONTI PALITO y Bs 16 adelantados; la Mesa 1 con Bs 10 de tiempo; la cuenta
 * «mesa» con un CONTI y un PALITO PACEÑA. KPI "Por cobrar": Bs 68.
 */

const AHORA = new Date(2026, 9, 25, 22, 0).getTime();
const MIN = 60_000;
const POOL = { id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] };

const consumo = (id: number, productoId: number, nombre: string, precio: number, cant: number) => ({
  id,
  productoId,
  nombre,
  precio,
  cant,
  hora: AHORA - 20 * MIN,
  anulado: false,
  por: "Pepe Mamani",
});
const sesion = (id: number, extra: object) => ({
  id,
  version: 1,
  start: AHORA - 60 * MIN,
  abierta: AHORA - 60 * MIN,
  pausedAt: null,
  pausedTotal: 0,
  prepago: null,
  prev: null,
  tarifa: POOL,
  abiertaPor: "Pepe Mamani",
  consumos: [],
  pagos: [],
  ...extra,
});

const API = {
  ahora: AHORA,
  sucursal: { id: 1, nombre: "Principal" },
  desde: AHORA - 8 * 60 * MIN,
  hoy: { ventas: 1, vendido: 50 },
  ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
  tipos: [POOL],
  mesas: [
    { id: 11, numero: 1, tipo: "pool", estado: "abierta", sesion: sesion(101, { start: AHORA - 30 * MIN, prepago: { min: 60, precio: 10, pagado: false } }) },
    {
      id: 12,
      numero: 2,
      tipo: "pool",
      estado: "abierta",
      sesion: sesion(102, {
        prepago: { min: 120, precio: 40, pagado: false },
        consumos: [consumo(1, 7, "CONTI PALITO", 8, 2)],
        pagos: [{ id: 1, hora: AHORA - 10 * MIN, formaPagoId: 1, metodo: "Efectivo", monto: 16, recibido: 16, concepto: "ADELANTO" }],
      }),
    },
    { id: 13, numero: 3, tipo: "pool", estado: "libre" },
  ],
  cuentas: [
    {
      id: 201,
      nombre: "mesa",
      sucursalId: 1,
      estado: "abierta",
      sesion: sesion(201, {
        tarifa: { ...POOL, id: "cuenta", tarifa: 0, minimo: 0 },
        consumos: [consumo(2, 9, "CONTI", 8, 1), consumo(3, 8, "PALITO PACEÑA", 10, 1)],
      }),
    },
  ],
  cajas: [],
  actividad: [],
} as unknown as SupervisionApi;

/** Lo cobrado en el turno: la única venta. */
const COBRADO: ReporteCierreProductos = {
  unidades: 3,
  total: 50,
  lineas: 3,
  categorias: [
    {
      nombre: "Cervezas",
      unidades: 2,
      total: 35,
      items: [
        { productoId: 1, nombre: "PACEÑA BOTELLA", cantidad: 1, precio: 25, total: 25 },
        { productoId: 8, nombre: "PALITO PACEÑA", cantidad: 1, precio: 10, total: 10 },
      ],
    },
    { nombre: "Cigarros", unidades: 1, total: 15, items: [{ productoId: 4, nombre: "HILLS", cantidad: 1, precio: 15, total: 15 }] },
  ],
};
const NADA: ReporteCierreProductos = { unidades: 0, total: 0, lineas: 0, categorias: [] };

/** Las mesas sin consumos ni adelantos: sólo corre el tiempo. */
const SIN_PEDIDOS = {
  ...API,
  mesas: API.mesas.map((m) => (m.sesion ? { ...m, sesion: { ...m.sesion, consumos: [], pagos: [] } } : m)),
  cuentas: [],
} as SupervisionApi;

/** La tarjeta como la arma Supervisión, y el "Por cobrar" de su KPI. */
function montar({
  productos = COBRADO,
  api = API,
  verEnCurso = true,
  enCurso,
}: { productos?: ReporteCierreProductos; api?: SupervisionApi; verEnCurso?: boolean; enCurso?: PedidoEnCurso[] } = {}) {
  const { mesas, cuentas } = armarSupervision(api);
  const contexto = { tipos: { pool: POOL }, ajustes: { avisos: [10, 5, 1] } };
  const vMesas = mesas.map((m) => vistaDe(contexto, m.mesa, AHORA));
  const vCuentas = cuentas.map((c) => vistaCuenta(c.cuenta, AHORA));
  render(
    <TarjetaLoQueSalio
      productos={productos}
      enCurso={enCurso ?? consumosEnCurso(api)}
      porCobrar={desglosePorCobrar(vMesas, vCuentas)}
      verEnCurso={verEnCurso}
    />,
  );
  const tarjeta = screen.getByRole("region", { name: "Lo que salió en el turno" });
  return {
    tarjeta,
    kpi: resumenSupervision(api, vMesas, vCuentas).porCobrar,
    cuerpo: tarjeta.querySelector(":scope > div.grid") as HTMLElement,
    pie: tarjeta.querySelector("footer"),
  };
}

describe("lo que salió en el turno: lo cobrado y lo pedido", () => {
  it("la plata con centavos y las cantidades sin ceros, con el mismo renglón en las dos columnas", () => {
    const { tarjeta } = montar();
    // El ajuste del 25-oct había dejado "Bs 50 cobrado" debajo de un KPI de "Bs 50,00".
    expect(within(tarjeta).getByText("Bs 50,00 cobrado")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Ya cobrado")).toBeInTheDocument();
    expect(within(tarjeta).getByText("1 u × Bs 25,00")).toBeInTheDocument();
    // A la derecha decía "2 u", sin precio, y a la izquierda "1 × Bs 25", sin "u".
    expect(within(tarjeta).getByText("Pedido en mesas y cuentas abiertas")).toBeInTheDocument();
    expect(within(tarjeta).getByText("2 u × Bs 8,00")).toBeInTheDocument();
    expect(within(tarjeta).getByText("4 unidades · 3 productos")).toBeInTheDocument();
    // No es "sin cobrar": la Mesa 2 ya adelantó lo que pidió.
    expect(within(tarjeta).queryByText(/sin cobrar/)).toBeNull();
  });

  it("el pie hace la cuenta y da exacto el «Por cobrar» del KPI", () => {
    const { pie, kpi } = montar();
    expect(kpi).toBe(68);
    expect(pie).not.toBeNull();
    const p = within(pie!);
    expect(p.getByText("Por cobrar en mesas y cuentas abiertas")).toBeInTheDocument();
    expect(pie).toHaveTextContent("Tiempo Bs 50,00 + consumos Bs 34,00 − ya adelantado Bs 16,00");
    // Cada término entero: en el celular la cuenta baja de renglón sin partir "Bs 16,00".
    expect(p.getByText("− ya adelantado Bs 16,00")).toHaveClass("whitespace-nowrap");
    expect(p.getByText(fmtMoney(kpi))).toBeInTheDocument();
  });

  it("el adelanto se ve: en el encabezado, con lo que ya entró por mesas abiertas", () => {
    // Antes no aparecía en ningún lado de la tarjeta: al cajón habían entrado
    // Bs 66 y la tarjeta decía "Bs 50 cobrado".
    const { tarjeta } = montar();
    expect(within(tarjeta).getByText(/Bs\s16,00 adelantado en mesas y cuentas abiertas/)).toBeInTheDocument();
  });

  it("sin adelantos el encabezado no habla de adelantos", () => {
    const { tarjeta } = montar({ api: SIN_PEDIDOS });
    expect(within(tarjeta).queryByText(/adelantado/)).toBeNull();
  });

  it("lo pagado de más se avisa aparte y el pie sigue dando el KPI", () => {
    // La Mesa 1 adelantó Bs 15 por Bs 10 de tiempo: Bs 5 se le devuelven.
    const api = {
      ...API,
      mesas: API.mesas.map((m) =>
        m.id === 11
          ? { ...m, sesion: { ...m.sesion!, pagos: [{ id: 2, hora: AHORA - 5 * MIN, formaPagoId: 1, metodo: "Efectivo", monto: 15, recibido: 15, concepto: "ADELANTO" as const }] } }
          : m,
      ),
    } as SupervisionApi;
    const { pie, kpi } = montar({ api });
    expect(within(pie!).getByText(fmtMoney(kpi))).toBeInTheDocument();
    expect(within(pie!).getByText("Bs 5,00 adelantados de más se devuelven al cerrar la mesa.")).toBeInTheDocument();
  });
});

describe("lo que salió: un turno cerrado y los lados vacíos", () => {
  it("en un turno cerrado no muestra lo pedido en mesas, ni el pie, ni adelantos", () => {
    const { tarjeta, pie } = montar({ verEnCurso: false });
    expect(within(tarjeta).queryByText("Pedido en mesas y cuentas abiertas")).toBeNull();
    expect(within(tarjeta).queryByText(/Nada pedido/)).toBeNull();
    expect(within(tarjeta).queryByText(/adelantado/)).toBeNull();
    expect(pie).toBeNull();
  });

  it("un turno cerrado sin ventas lo dice como cerrado", () => {
    const { tarjeta } = montar({ productos: NADA, verEnCurso: false });
    expect(within(tarjeta).getByText("En este turno no se cobró nada.")).toBeInTheDocument();
  });

  it("sin nada pedido, una línea a todo el ancho y lo cobrado ocupa toda la tarjeta", () => {
    // Antes la mitad derecha quedaba en blanco con un recuadro punteado.
    const { tarjeta, cuerpo, pie } = montar({ api: SIN_PEDIDOS });
    expect(within(tarjeta).getByText("Nada pedido en mesas y cuentas abiertas.")).toBeInTheDocument();
    expect(cuerpo.className).not.toMatch(/grid-cols-2/);
    // El tiempo de las mesas sigue corriendo: el pie lo cuenta.
    expect(within(pie!).getByText("Tiempo Bs 50,00")).toBeInTheDocument();
    expect(within(pie!).getByText("Bs 50,00")).toBeInTheDocument();
  });

  it("sin nada cobrado, la línea va arriba y lo pedido ocupa toda la tarjeta", () => {
    const { tarjeta, cuerpo } = montar({ productos: NADA });
    expect(within(tarjeta).getByText("Todavía no se cobró nada en este turno.")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Pedido en mesas y cuentas abiertas")).toBeInTheDocument();
    expect(cuerpo.className).not.toMatch(/grid-cols-2/);
  });

  it("dos columnas sólo si las dos tienen algo, y según el ancho de la tarjeta, no de la pantalla", () => {
    const { cuerpo } = montar();
    // A 1280 con el menú y la actividad al costado la tarjeta mide ~556 px:
    // con `lg:` las dos columnas quedaban de ~245 px y cortaban los nombres.
    expect(cuerpo.className).toMatch(/@3xl:grid-cols-2/);
    expect(cuerpo.className).not.toMatch(/(^|\s)lg:grid-cols-2/);
  });
});

describe("lo que salió: en el celular no crece sin tope", () => {
  it("muestra los primeros 6 productos de cada lado y «Ver los N» despliega el resto", () => {
    const enCurso = Array.from({ length: 10 }, (_, i) => ({
      productoId: 100 + i,
      nombre: `Producto ${i + 1}`,
      cantidad: 1,
      precio: 50 - i,
      total: 50 - i,
    }));
    const { tarjeta } = montar({ enCurso });
    expect(within(tarjeta).getByText("Producto 6")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("Producto 7")).toBeNull();
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Ver los 10 productos" }));
    expect(within(tarjeta).getByText("Producto 10")).toBeInTheDocument();
  });

  it("el tiempo de mesa ya cobrado va aparte, no como un producto", () => {
    const conTiempo: ReporteCierreProductos = {
      ...COBRADO,
      unidades: 5,
      total: 100,
      lineas: 4,
      categorias: [
        ...COBRADO.categorias,
        { nombre: "Sin categoría", unidades: 2, total: 50, items: [{ productoId: 99, nombre: "Tiempo de mesa", cantidad: 2, precio: 25, total: 50, tiempoMesa: true }] },
      ],
    };
    const { tarjeta } = montar({ productos: conTiempo });
    expect(within(tarjeta).getByText("Bs 100,00 cobrado")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Tiempo de mesa · 2 mesas cobradas")).toBeInTheDocument();
    expect(within(tarjeta).getByText("3 unidades · 3 productos")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("Sin categoría")).toBeNull();
  });
});
