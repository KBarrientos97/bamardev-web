import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisionFarmacia } from "./api";
import Supervision from "./Supervision";

vi.setConfig({ testTimeout: 60_000 });

/**
 * La pantalla de Supervisión de la farmacia (11-nov): lo que hace la auxiliar,
 * en vivo y sin poder tocar nada, con el nombre de quien hizo cada cosa.
 * Backend y sesión de mentira: lo que se mira es lo que ve el administrador.
 */

const ver = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({ apiSupervisionFarmacia: { ver } }));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: ["caja.ver_todas"] },
    negocio: { alias: "farmacia-sup", nombre: "Farmacia de prueba" },
    incluye: () => true,
    puede: () => true,
  }),
}));

const AHORA = Date.now();
const MIN = 60_000;
const H = 60 * MIN;
const ABRIO = AHORA - 4 * H;

/** Un turno con la caja de Rosa abierta: una venta con controlado cobrada, otra anulada por la administradora, un controlado y un encargo. */
function respuesta(): SupervisionFarmacia {
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
      fiado: 0,
      descuentos: 0,
      controlados: 1,
      porMedio: { efectivo: { monto: 60.5, cobros: 1 }, qr: { monto: 0, cobros: 0 }, otros: [], mixtas: 0 },
      encargos: { anotados: 1, entregados: 0 },
    },
    cajas: [{ id: 1, abierta: true, cajero: "Rosa Quispe", cajeroId: 7, desde: ABRIO, hasta: null, inicial: 100, ventas: 1, vendido: 60.5, anuladas: 1, anulado: 30 }],
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
        tipoPedido: "MOSTRADOR",
        pagos: [{ medio: "Efectivo", monto: 60.5 }],
        items: [
          { productoId: 1, nombre: "Alprazolam 0,5 mg", cantidad: 1, precio: 35.5, subtotal: 35.5, controlado: true, condicionVenta: "RECETA_RETENIDA" },
          { productoId: 2, nombre: "Paracetamol 500 mg", cantidad: 5, precio: 5, subtotal: 25, controlado: false, condicionVenta: "LIBRE" },
        ],
        conReceta: true,
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
        tipoPedido: "MOSTRADOR",
        pagos: [{ medio: "QR", monto: 30 }],
        items: [{ productoId: 3, nombre: "Ibuprofeno 400 mg", cantidad: 3, precio: 10, subtotal: 30, controlado: false, condicionVenta: "LIBRE" }],
        conReceta: false,
        anulada: { en: AHORA - 40 * MIN, por: "Marta Admin", motivo: "Se equivocó de producto" },
      },
    ],
    controlados: [
      {
        id: 5,
        ventaId: 101,
        hora: AHORA - 30 * MIN,
        quien: "Rosa Quispe",
        producto: "Alprazolam 0,5 mg",
        cantidad: 1,
        paciente: "Juan Pérez",
        documento: "1234567 LP",
        medico: "Dra. Ana López",
        matricula: "M-4455",
        receta: "R-100",
        anulada: false,
      },
    ],
    encargos: [
      {
        id: 9,
        hora: AHORA - 2 * H,
        quien: "Rosa Quispe",
        descripcion: "Insulina glargina",
        cantidad: 1,
        estado: "PEDIDO",
        cliente: "María Flores",
        telefono: "70011223",
        llegoEn: null,
        entregadoEn: null,
      },
    ],
    efectivo: [],
    inventario: [],
    actividad: [
      {
        id: "anulacion-102",
        hora: AHORA - 40 * MIN,
        quien: "Marta Admin",
        texto: "Anuló la venta V-000102 de Bs 30,00 (Se equivocó de producto)",
        lugar: "V-000102",
        motivo: "Se equivocó de producto",
        codigo: "ANULACION",
        ref: { venta: 102 },
      },
      {
        id: "venta-101",
        hora: AHORA - 30 * MIN,
        quien: "Rosa Quispe",
        texto: "Cobró Bs 60,50 · 2 artículos · Efectivo · con receta: Alprazolam 0,5 mg",
        lugar: "V-000101",
        codigo: "VENTA",
        ref: { venta: 101 },
      },
      {
        id: "controlado-5",
        hora: AHORA - 30 * MIN,
        quien: "Rosa Quispe",
        texto: "Despachó 1 u. de Alprazolam 0,5 mg a Juan Pérez · Dra. Ana López · receta R-100",
        codigo: "CONTROLADO",
        ref: { venta: 101 },
      },
      {
        id: "venta-102",
        hora: AHORA - 50 * MIN,
        quien: "Rosa Quispe",
        texto: "Cobró Bs 30,00 · 3 u. de Ibuprofeno 400 mg · QR",
        lugar: "V-000102",
        codigo: "VENTA",
        ref: { venta: 102 },
      },
      { id: "encargo-9", hora: AHORA - 2 * H, quien: "Rosa Quispe", texto: "Anotó el encargo «Insulina glargina» para María Flores", codigo: "ENCARGO", ref: {} },
      { id: "caja-1-abre", hora: ABRIO, quien: "Rosa Quispe", texto: "Abrió la caja con Bs 100,00", codigo: "CAJA_ABIERTA", ref: { caja: 1 } },
    ],
  };
}

/** Nadie abrió caja en la semana: el backend manda el turno en null y los números en cero. */
function sinCajas(): SupervisionFarmacia {
  const r = respuesta();
  return {
    ...r,
    turno: {
      ...r.turno,
      cajaId: null,
      defectoId: null,
      ventas: 0,
      vendido: 0,
      anuladas: 0,
      anulado: 0,
      controlados: 0,
      porMedio: { efectivo: { monto: 0, cobros: 0 }, qr: { monto: 0, cobros: 0 }, otros: [], mixtas: 0 },
      encargos: { anotados: 0, entregados: 0 },
    },
    cajas: [],
    ventas: [],
    controlados: [],
    encargos: [],
    actividad: [],
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

beforeEach(() => {
  ver.mockReset().mockImplementation(async () => respuesta());
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Farmacia: la supervisión del administrador", () => {
  it("dice quién está en caja y los números del turno", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: /Supervisión/ })).toBeInTheDocument();
    expect(kpi("Vendido en el turno")).toHaveTextContent(/Bs\s60,50/);
    expect(kpi("Vendido en el turno")).toHaveTextContent("1 venta");
    expect(kpi("Anulado")).toHaveTextContent(/Bs\s30,00/);
    expect(kpi("Anulado")).toHaveTextContent("1 venta anulada");
    expect(kpi("Controlados despachados")).toHaveTextContent("1");
    expect(kpi("Controlados despachados")).toHaveTextContent("con receta, en el libro");
    expect(kpi("Encargos anotados")).toHaveTextContent("1");
    expect(kpi("Encargos anotados")).toHaveTextContent("0 entregados en el turno");
    // Fiado y descuentos en cero no se muestran: un "Bs 0,00" ahí se lee como un dato.
    expect(screen.queryByText("Fiado")).toBeNull();
    expect(screen.queryByText("Descuentos")).toBeNull();

    const porMedio = seccion("Cobrado por medio");
    expect(within(porMedio).getByText("Efectivo").parentElement).toHaveTextContent(/Bs\s60,50/);
    expect(within(porMedio).getByText("Efectivo").parentElement).toHaveTextContent("1 cobro");
    expect(within(porMedio).getByText("QR").parentElement).toHaveTextContent("0 cobros");

    const caja = seccion("Caja del turno");
    expect(within(caja).getByText("Rosa Quispe")).toBeInTheDocument();
    expect(within(caja).getByText("Abierta")).toBeInTheDocument();
    expect(within(caja).getByText("Sigue abierta")).toBeInTheDocument();
    expect(within(caja).getByText(/1 venta · 1 anulada/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Turno que estás viendo" })).toHaveDisplayValue(/Turno en curso · Rosa Quispe/);
  });

  it("es sólo para mirar: no hay cómo vender, anular, cobrar ni cerrar la caja", async () => {
    await montar();
    for (const no of [/^Anular/, /Cobrar/, /Cerrar caja/, /Abrir caja/, /Nueva venta/, /Entregar/]) {
      expect(screen.queryByRole("button", { name: no })).toBeNull();
    }
  });

  it("la venta anulada va tachada y dice quién autorizó y por qué; la que lleva un controlado lo marca", async () => {
    await montar();
    const anulada = screen.getByRole("button", { name: "Ver el detalle de la venta V-000102" });
    expect(anulada).toHaveTextContent("Anulada");
    expect(anulada).toHaveTextContent(/Autorizó la anulación Marta Admin/);
    expect(anulada).toHaveTextContent("«Se equivocó de producto»");
    expect(within(anulada).getByText("V-000102")).toHaveClass("line-through");

    const conControlado = screen.getByRole("button", { name: "Ver el detalle de la venta V-000101" });
    expect(conControlado).toHaveTextContent("Controlado");
    expect(conControlado).toHaveTextContent("2 renglones · 6 u. · Efectivo");
    // Se toca y se abre con sus renglones y pagos, sin otro pedido al servidor.
    fireEvent.click(conControlado);
    const fila = conControlado.closest("li")!;
    expect(within(fila).getByText(/1× Alprazolam 0,5 mg/)).toBeInTheDocument();
    expect(within(fila).getByText(/5× Paracetamol 500 mg/)).toBeInTheDocument();
    expect(within(fila).getByText("Pagó con Efectivo")).toBeInTheDocument();
    expect(within(fila).getByText(/receta quedó asentada/)).toBeInTheDocument();
    expect(ver).toHaveBeenCalledTimes(1);
  });

  it("los controlados y los encargos tienen su bloque", async () => {
    await montar();
    const bloques = screen.getByRole("region", { name: "Lo que hizo el mostrador" });
    fireEvent.click(within(bloques).getByRole("button", { name: /^Controlados/ }));
    expect(within(bloques).getByText("Juan Pérez")).toBeInTheDocument();
    expect(within(bloques).getByText("1234567 LP")).toBeInTheDocument();
    expect(within(bloques).getByText("Dra. Ana López")).toBeInTheDocument();
    expect(within(bloques).getByText("M-4455")).toBeInTheDocument();
    expect(within(bloques).getByText("R-100")).toBeInTheDocument();
    fireEvent.click(within(bloques).getByRole("button", { name: /^Encargos/ }));
    expect(within(bloques).getByText("Pedido")).toBeInTheDocument();
    expect(within(bloques).getByText("Insulina glargina")).toBeInTheDocument();
    expect(within(bloques).getByText(/para María Flores · 70011223/)).toBeInTheDocument();
    fireEvent.click(within(bloques).getByRole("button", { name: /^Efectivo/ }));
    expect(within(bloques).getByText("No se movió efectivo a mano en este turno.")).toBeInTheDocument();
  });

  it("la actividad lleva el nombre de cada usuario y el chip Controlados la filtra", async () => {
    await montar();
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
    expect(within(actividad).getByText("Abrió la caja con Bs 100,00", { exact: false })).toBeInTheDocument();
    expect(within(actividad).getAllByText("Marta Admin").length).toBeGreaterThan(0);
    expect(within(actividad).getByText("«Se equivocó de producto»")).toBeInTheDocument();
    fireEvent.click(within(actividad).getByRole("button", { name: "Controlados" }));
    expect(within(actividad).getByText(/Despachó 1 u\. de Alprazolam/)).toBeInTheDocument();
    expect(within(actividad).queryByText(/Abrió la caja/)).toBeNull();
    expect(within(actividad).queryByText(/Anuló la venta/)).toBeNull();
    expect(within(actividad).queryByText(/Cobró Bs/)).toBeNull();
    fireEvent.click(within(actividad).getByRole("button", { name: "Anulaciones" }));
    expect(within(actividad).getByText(/Anuló la venta V-000102/)).toBeInTheDocument();
    expect(within(actividad).queryByText(/Despachó/)).toBeNull();
  });

  it("tocar una venta en la actividad la abre en el bloque de Ventas", async () => {
    await montar();
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
    fireEvent.click(within(actividad).getByRole("button", { name: /Ver la venta: Rosa Quispe · Cobró Bs 60,50/ }));
    const venta = screen.getByRole("button", { name: "Cerrar el detalle de la venta V-000101" });
    expect(venta).toHaveAttribute("aria-expanded", "true");
  });

  it("sin cajas en la semana muestra el vacío", async () => {
    ver.mockImplementation(async () => sinCajas());
    await montar();
    expect(screen.getByText("Nadie abrió caja esta semana todavía")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Turno que estás viendo" })).toBeNull();
    expect(kpi("Vendido hoy")).toHaveTextContent(/Bs\s0,00/);
  });

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

  it("el sondeo vuelve a pedir cada 5 segundos", async () => {
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
