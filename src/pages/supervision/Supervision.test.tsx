import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisionRestaurante } from "./api";
import Supervision from "./Supervision";

vi.setConfig({ testTimeout: 60_000 });

/**
 * La Supervisión del local (12-nov): lo que hacen los cajeros, en vivo, con
 * el estado del equipo de cada caja, y anular con PIN desde ahí. Backend y
 * sesión de mentira: lo que se mira es lo que ve el dueño.
 */

const ver = vi.hoisted(() => vi.fn());
const anularVenta = vi.hoisted(() => vi.fn());
const sesion = vi.hoisted(() => ({ permisos: [] as string[] }));

vi.mock("./api", () => ({ apiSupervision: { ver } }));

vi.mock("../../lib/api", async (original) => {
  const real = await original<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, anularVenta } };
});

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: sesion.permisos },
    negocio: { alias: "local-sup", nombre: "Local de prueba" },
    rubro: "RESTAURANTE",
    incluye: () => true,
    puede: () => true,
  }),
}));

const AHORA = Date.now();
const MIN = 60_000;
const H = 60 * MIN;
const ABRIO = AHORA - 4 * H;

/**
 * Un turno con dos cajas abiertas: la de Rosa en línea, la de Juan sin señal
 * con dos ventas trabadas en el celular, y Ana sin caja. Una venta cobrada,
 * otra anulada, un delivery en camino y un retiro de efectivo.
 */
function respuesta(): SupervisionRestaurante {
  return {
    ahora: Date.now(),
    sucursal: { id: 1, nombre: "Principal" },
    semana: { desde: AHORA - 2 * 24 * H, hasta: AHORA + 5 * 24 * H },
    hoy: { ventas: 1, vendido: 60.5 },
    turno: {
      cajaId: 1,
      defectoId: 1,
      desde: ABRIO,
      hasta: null,
      ventas: 1,
      vendido: 60.5,
      anuladas: 1,
      anulado: 30,
      fiado: 15,
      descuentos: 0,
      porMedio: { efectivo: { monto: 60.5, cobros: 1 }, qr: { monto: 0, cobros: 0 }, otros: [], mixtas: 0 },
      // `porCobrar` es la CANTIDAD de pedidos que se cobran al entregar; la plata es `porCobrarTotal`.
      pedidos: { enCamino: 1, porCobrar: 1, porCobrarTotal: 45 },
    },
    cajas: [
      {
        id: 1,
        abierta: true,
        cajero: "Rosa Quispe",
        cajeroId: 7,
        desde: ABRIO,
        hasta: null,
        inicial: 100,
        ventas: 1,
        vendido: 60.5,
        anuladas: 1,
        anulado: 30,
        equipo: { ultimoContactoEn: AHORA - 20_000, pendientes: 0, ultimaVentaEn: AHORA - 30 * MIN, ultimaVentaEnEquipoEn: null, estado: "EN_LINEA" },
      },
      {
        id: 2,
        abierta: true,
        cajero: "Juan Mamani",
        cajeroId: 8,
        desde: AHORA - 2 * H,
        hasta: null,
        inicial: 50,
        ventas: 0,
        vendido: 0,
        anuladas: 0,
        anulado: 0,
        equipo: { ultimoContactoEn: AHORA - 10 * MIN, pendientes: 2, ultimaVentaEn: AHORA - 15 * MIN, ultimaVentaEnEquipoEn: null, estado: "SIN_SENAL" },
      },
    ],
    cajeros: [
      {
        id: 7,
        nombre: "Rosa Quispe",
        rol: "Cajero",
        cajaId: 1,
        abiertaDesde: ABRIO,
        ultimaActividadEn: AHORA - 30 * MIN,
        ventas: 1,
        vendido: 60.5,
        equipo: { ultimoContactoEn: AHORA - 20_000, pendientes: 0, ultimaVentaEn: AHORA - 30 * MIN, ultimaVentaEnEquipoEn: null, estado: "EN_LINEA" },
      },
      {
        id: 8,
        nombre: "Juan Mamani",
        rol: "Cajero",
        cajaId: 2,
        abiertaDesde: AHORA - 2 * H,
        ultimaActividadEn: AHORA - 15 * MIN,
        ventas: 0,
        vendido: 0,
        equipo: { ultimoContactoEn: AHORA - 10 * MIN, pendientes: 2, ultimaVentaEn: AHORA - 15 * MIN, ultimaVentaEnEquipoEn: null, estado: "SIN_SENAL" },
      },
      {
        id: 9,
        nombre: "Ana Flores",
        rol: "Cajero",
        cajaId: null,
        abiertaDesde: null,
        ultimaActividadEn: AHORA - 26 * H,
        ventas: 0,
        vendido: 0,
        // El celular de su turno de ayer: sin caja abierta no se muestra.
        equipo: { ultimoContactoEn: AHORA - 26 * H, pendientes: 0, ultimaVentaEn: null, ultimaVentaEnEquipoEn: null, estado: "SIN_SENAL" },
      },
    ],
    ventas: [
      {
        id: 101,
        comprobante: "V-000101",
        hora: AHORA - 30 * MIN,
        quien: "Rosa Quispe",
        cajaId: 1,
        total: 60.5,
        descuento: 0,
        fiada: false,
        tipoPedido: "LOCAL",
        estadoEntrega: null,
        clienteNombre: null,
        porCobrar: false,
        pagos: [
          { medio: "Efectivo", monto: 40.5 },
          { medio: "QR", monto: 20 },
        ],
        items: [
          { productoId: 1, nombre: "Cuarto de pollo", cantidad: 2, precio: 25, subtotal: 50 },
          { productoId: 2, nombre: "Gaseosa 500 ml", cantidad: 1, precio: 10.5, subtotal: 10.5 },
        ],
        anulada: null,
      },
      {
        id: 102,
        comprobante: "V-000102",
        hora: AHORA - 50 * MIN,
        quien: "Rosa Quispe",
        cajaId: 1,
        total: 30,
        descuento: 0,
        fiada: false,
        tipoPedido: "LOCAL",
        estadoEntrega: null,
        clienteNombre: null,
        porCobrar: false,
        pagos: [{ medio: "QR", monto: 30 }],
        items: [{ productoId: 3, nombre: "Porción de papas", cantidad: 3, precio: 10, subtotal: 30 }],
        anulada: { en: AHORA - 40 * MIN, por: "Marta Admin", motivo: "Error al cobrar" },
      },
    ],
    pedidos: [
      {
        id: 103,
        comprobante: "V-000103",
        tipo: "DELIVERY",
        estado: "PENDIENTE",
        cliente: "María Flores",
        total: 45,
        hora: AHORA - 20 * MIN,
        quien: "Rosa Quispe",
        repartidor: "Pedro Repartidor",
        porCobrar: true,
      },
    ],
    efectivo: [{ id: 5, cajaId: 1, hora: AHORA - H, quien: "Rosa Quispe", tipo: "EGRESO", monto: 20, texto: "Sacó Bs 20,00 · compra de hielo" }],
    actividad: [
      {
        id: "anulacion-102",
        hora: AHORA - 40 * MIN,
        quien: "Marta Admin",
        texto: "Anuló la venta V-000102 de Bs 30,00 (Error al cobrar)",
        lugar: "V-000102",
        motivo: "Error al cobrar",
        codigo: "ANULACION",
        ref: { venta: 102 },
      },
      { id: "venta-101", hora: AHORA - 30 * MIN, quien: "Rosa Quispe", texto: "Cobró Bs 60,50 · 3 u. · Efectivo + QR", lugar: "V-000101", codigo: "VENTA", ref: { venta: 101 } },
      { id: "pedido-103", hora: AHORA - 20 * MIN, quien: "Rosa Quispe", texto: "Despachó el delivery de María Flores", lugar: "V-000103", codigo: "PEDIDO", ref: { venta: 103 } },
      { id: "caja-1-abre", hora: ABRIO, quien: "Rosa Quispe", texto: "Abrió la caja con Bs 100,00", codigo: "CAJA_ABIERTA", ref: { caja: 1 } },
    ],
  };
}

/** La misma respuesta de un backend sin latidos (cajas de la web, APK viejo): ni cajas ni cajeros traen `equipo`. */
function sinEquipo(): SupervisionRestaurante {
  const r = respuesta();
  return {
    ...r,
    cajas: r.cajas.map(({ equipo: _equipo, ...c }) => c),
    cajeros: r.cajeros.map(({ equipo: _equipo, ...c }) => c),
  };
}

/** Monta y espera la primera respuesta (sin `findBy`, para que sirva también con el reloj de mentira). */
async function montar() {
  render(<Supervision />);
  await act(async () => {});
}

const seccion = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("section")!;
/** La tarjeta de un número de arriba, por su etiqueta. */
const kpi = (etiqueta: string) => screen.getByText(etiqueta).parentElement!;
const bloques = () => screen.getByRole("region", { name: "Lo que hizo la caja" });

beforeEach(() => {
  ver.mockReset().mockImplementation(async () => respuesta());
  anularVenta.mockReset().mockResolvedValue({});
  sesion.permisos = ["caja.ver_todas", "ventas.anular", "autorizar.pin"];
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Supervisión del local: lo que ve el dueño", () => {
  it("los números del turno: lo vendido, lo anulado, el fiado y los pedidos en camino con lo que falta cobrar", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: /Supervisión/ })).toBeInTheDocument();
    expect(kpi("Vendido en el turno")).toHaveTextContent(/Bs\s60,50/);
    expect(kpi("Anulado")).toHaveTextContent("1 venta anulada");
    expect(kpi("Fiado")).toHaveTextContent(/Bs\s15,00/);
    expect(kpi("Pedidos en camino")).toHaveTextContent("1");
    // La plata (porCobrarTotal) y de cuántos pedidos (porCobrar): antes salía "Bs 1,00 por cobrar".
    expect(kpi("Pedidos en camino")).toHaveTextContent(/Bs\s45,00 por cobrar · 1 pedido/);
    expect(kpi("Pedidos en camino")).not.toHaveTextContent(/Bs\s1,00/);
    // Descuentos en cero no se muestra: un "Bs 0,00" ahí se lee como un dato.
    expect(screen.queryByText("Descuentos")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Turno que estás viendo" })).toHaveDisplayValue(/Turno en curso · Rosa Quispe/);
  });

  it("sin pedidos en camino ni fiado, esos números no aparecen", async () => {
    ver.mockImplementation(async () => {
      const r = respuesta();
      return { ...r, turno: { ...r.turno, fiado: 0, pedidos: { enCamino: 0, porCobrar: 0, porCobrarTotal: 0 } } };
    });
    await montar();
    expect(screen.queryByText("Pedidos en camino")).toBeNull();
    expect(screen.queryByText("Fiado")).toBeNull();
  });

  it("los cajeros: quién tiene caja y desde cuándo, quién no, y cómo está el equipo de cada caja", async () => {
    await montar();
    const cajeros = seccion("Cajeros");
    expect(cajeros).toHaveTextContent("2 con caja abierta de 3");
    const filas = within(cajeros).getAllByRole("listitem");
    // Los de caja abierta arriba, por nombre.
    expect(filas.map((f) => within(f).getByText(/^(Rosa Quispe|Juan Mamani|Ana Flores)$/).textContent)).toEqual(["Juan Mamani", "Rosa Quispe", "Ana Flores"]);

    const [juan, rosa, ana] = filas;
    expect(rosa).toHaveTextContent(/Caja abierta desde .* · lleva 4 h/);
    expect(rosa).toHaveTextContent(/inicial Bs\s100,00/);
    expect(within(rosa).getByText(/^En línea · hace \d+ s$/)).toBeInTheDocument();

    expect(juan).toHaveTextContent(/inicial Bs\s50,00/);
    expect(within(juan).getByText(/^Sin señal desde .* · 2 ventas sin subir en el equipo · última venta sincronizada .*$/)).toBeInTheDocument();

    // Ana no tiene caja: se dice cuándo hizo algo, y su celular de ayer no se muestra.
    expect(ana).toHaveTextContent(/Sin caja abierta · última actividad/);
    expect(ana).not.toHaveTextContent(/Sin señal|En línea/);
  });

  it("la caja del turno lleva el estado de su equipo", async () => {
    await montar();
    const caja = seccion("Caja del turno");
    expect(within(caja).getByText("Rosa Quispe")).toBeInTheDocument();
    expect(within(caja).getByText(/^En línea · hace \d+ s$/)).toBeInTheDocument();
  });

  it("sin latidos (una caja de la web, un APK viejo) no se afirma nada del equipo", async () => {
    ver.mockImplementation(async () => sinEquipo());
    await montar();
    expect(screen.queryByText(/En línea ·/)).toBeNull();
    expect(screen.queryByText(/Sin señal desde/)).toBeNull();
    // Lo demás de los cajeros sigue igual.
    expect(seccion("Cajeros")).toHaveTextContent(/Caja abierta desde/);
  });

  it("el buscador encuentra la venta por comprobante, por #id o por cajero", async () => {
    await montar();
    const buscador = within(bloques()).getByRole("searchbox", { name: "Buscar una venta" });
    const visibles = () =>
      within(bloques())
        .queryAllByRole("button", { name: /el detalle de la venta/ })
        .map((b) => b.getAttribute("aria-label"));

    expect(visibles()).toEqual(["Ver el detalle de la venta V-000101", "Ver el detalle de la venta V-000102"]);
    fireEvent.change(buscador, { target: { value: "v-102" } });
    expect(visibles()).toEqual(["Ver el detalle de la venta V-000102"]);
    fireEvent.change(buscador, { target: { value: "#101" } });
    expect(visibles()).toEqual(["Ver el detalle de la venta V-000101"]);
    fireEvent.change(buscador, { target: { value: "rosa" } });
    expect(visibles()).toHaveLength(2);
    fireEvent.change(buscador, { target: { value: "V-999" } });
    expect(visibles()).toEqual([]);
    expect(within(bloques()).getByText("Ninguna venta del turno coincide con «V-999».")).toBeInTheDocument();
  });

  it("tocar una venta en la actividad la abre aunque el buscador la estuviera escondiendo", async () => {
    await montar();
    fireEvent.change(within(bloques()).getByRole("searchbox", { name: "Buscar una venta" }), { target: { value: "V-000102" } });
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
    fireEvent.click(within(actividad).getByRole("button", { name: /Ver la venta: Rosa Quispe · Cobró Bs 60,50/ }));
    expect(screen.getByRole("button", { name: "Cerrar el detalle de la venta V-000101" })).toHaveAttribute("aria-expanded", "true");
    expect(within(bloques()).getByRole("searchbox", { name: "Buscar una venta" })).toHaveValue("");
  });

  it("los pedidos en camino y el efectivo tienen su pestaña", async () => {
    await montar();
    fireEvent.click(within(bloques()).getByRole("button", { name: /^Pedidos/ }));
    expect(within(bloques()).getByText("En camino")).toBeInTheDocument();
    expect(within(bloques()).getByText("María Flores")).toBeInTheDocument();
    expect(within(bloques()).getByText("Pedro Repartidor")).toBeInTheDocument();
    // Se cobra al entregar: el dueño ve que Pedro vuelve con esa plata.
    expect(within(bloques()).getByText(/^Por cobrar · Bs\s45,00$/)).toBeInTheDocument();
    fireEvent.click(within(bloques()).getByRole("button", { name: /^Efectivo/ }));
    expect(within(bloques()).getByText(/compra de hielo/)).toBeInTheDocument();
  });

  it("un pedido ya pagado no lleva «Por cobrar», y una venta que se cobra al entregar no dice «Sin pago»", async () => {
    ver.mockImplementation(async () => {
      const r = respuesta();
      return {
        ...r,
        pedidos: r.pedidos.map((p) => ({ ...p, porCobrar: false })),
        ventas: [{ ...r.ventas[0], id: 104, comprobante: "V-000104", pagos: [], porCobrar: true, tipoPedido: "DELIVERY", estadoEntrega: "PENDIENTE" }],
      };
    });
    await montar();
    expect(within(bloques()).getByRole("button", { name: "Ver el detalle de la venta V-000104" })).toHaveTextContent("Se cobra al entregar");
    expect(within(bloques()).queryByText(/Sin pago/)).toBeNull();
    fireEvent.click(within(bloques()).getByRole("button", { name: /^Pedidos/ }));
    expect(within(bloques()).getByText("María Flores")).toBeInTheDocument();
    expect(within(bloques()).queryByText(/Por cobrar/)).toBeNull();
  });

  it("la actividad lleva el nombre de cada usuario y el chip Pedidos la filtra", async () => {
    await montar();
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
    expect(within(actividad).getAllByText("Marta Admin").length).toBeGreaterThan(0);
    fireEvent.click(within(actividad).getByRole("button", { name: "Pedidos" }));
    expect(within(actividad).getByText(/Despachó el delivery de María Flores/)).toBeInTheDocument();
    expect(within(actividad).queryByText(/Abrió la caja/)).toBeNull();
    expect(within(actividad).queryByText(/Cobró Bs/)).toBeNull();
  });
});

describe("Supervisión del local: anular", () => {
  it("con el permiso, la venta abierta ofrece Anular; la ya anulada, no", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de la venta V-000101" }));
    expect(screen.getByRole("button", { name: "Anular la venta V-000101" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de la venta V-000102" }));
    expect(screen.queryByRole("button", { name: "Anular la venta V-000102" })).toBeNull();
  });

  it("sin el permiso de anular, el botón no existe", async () => {
    sesion.permisos = ["caja.ver_todas"];
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de la venta V-000101" }));
    expect(screen.queryByRole("button", { name: /^Anular/ })).toBeNull();
  });

  it("abre el diálogo del Historial (por dónde vuelve la plata, motivo y PIN), anula y vuelve a pedir al servidor", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de la venta V-000101" }));
    fireEvent.click(screen.getByRole("button", { name: "Anular la venta V-000101" }));
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    expect(dialogo).toHaveTextContent(/V-000101 · Bs\s60,50/);
    expect(dialogo).toHaveTextContent(/Bs\s20,00 por QR: devolvelos por QR o transferencia/);
    expect(dialogo).toHaveTextContent(/Bs\s40,50 en efectivo: salen de la caja/);
    // Quien autoriza con PIN no tiene que poner otro usuario.
    expect(within(dialogo).queryByText("Usuario que autoriza")).toBeNull();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Error al cobrar" }));
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), { target: { value: "1234" } });
    expect(ver).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(anularVenta).toHaveBeenCalledWith(101, { autorizadorPin: "1234", motivo: "Error al cobrar" });
    // Sin esperar al sondeo: la venta tiene que verse anulada ya.
    expect(ver).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "Anular venta" })).toBeNull();
  });

  it("sin el PIN propio, pide el usuario del encargado que autoriza", async () => {
    sesion.permisos = ["caja.ver_todas", "ventas.anular"];
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de la venta V-000101" }));
    fireEvent.click(screen.getByRole("button", { name: "Anular la venta V-000101" }));
    expect(within(screen.getByRole("dialog", { name: "Anular venta" })).getByText("Usuario que autoriza")).toBeInTheDocument();
  });
});

describe("Supervisión del local: el sondeo y los errores", () => {
  it("si el servidor no responde, muestra el error con Reintentar", async () => {
    ver.mockRejectedValueOnce(new Error("Se cayó el servidor"));
    await montar();
    expect(screen.getByText("Se cayó el servidor")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(ver).toHaveBeenCalledTimes(2);
    expect(within(seccion("Caja del turno")).getByText("Rosa Quispe")).toBeInTheDocument();
  });

  it("vuelve a pedir cada 5 segundos, a la ruta del local", async () => {
    vi.useFakeTimers();
    await montar();
    expect(ver).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(ver).toHaveBeenCalledTimes(2);
    expect(ver).toHaveBeenLastCalledWith(null, null);
  });
});
