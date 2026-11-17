import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El carrito con el cobro incrustado (Configuración › Punto de venta, 16-nov),
 * sin el POS alrededor: lo que lo apaga o lo frena, y lo que pasa antes de
 * confirmar. El cobro de punta a punta está en `PosCobroEnVenta.test.tsx`.
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "prueba", tipoNegocio: sesion.rubro, features: ["pago_qr_mixto"] },
    usuario: { username: "cajero", permisos: [] },
    rubro: sesion.rubro,
    incluye: (f: string) => f === "pago_qr_mixto",
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { productosPausados: vi.fn(async () => ({ sucursal: { id: 3, nombre: "Centro" }, pausados: [] })) },
}));
vi.mock("../../components/QrCobro", () => ({ QrParaCobrar: () => <p>el QR</p> }));
vi.mock("../farmacia/CatalogoVenta", () => ({ default: () => <p>catálogo de la farmacia</p> }));

import PantallaVenta, { type CobroEnLaVenta, type ModoModificacion } from "./PantallaVenta";
import type { Carrito } from "./useCarrito";

const POLLO = {
  id: 1,
  nombre: "Pollo entero",
  precio: 35,
  tipoProducto: "ALMACENABLE",
  stockTotal: 10,
  stockMinimo: 1,
  habilitado: true,
  componentes: [],
  categoria: null,
} as unknown as Producto;

function carritoConPollo(): Carrito {
  return {
    lineas: [{ producto: POLLO, cantidad: 1, enMesa: 1, nota: "" }],
    unidades: 1,
    subtotal: 35,
    total: 35,
    agregar: vi.fn(),
    setCantidad: vi.fn(),
    setAgregados: vi.fn(),
    setNota: vi.fn(),
    setEnMesa: vi.fn(),
    setConsumo: vi.fn(),
    setConsumoTodo: vi.fn(),
    quitar: vi.fn(),
    vaciar: vi.fn(),
    aDetalles: vi.fn(() => []),
  };
}

const FORMAS = [
  { id: 10, nombre: "Efectivo" },
  { id: 11, nombre: "QR" },
];

let carrito: Carrito;
let cobro: CobroEnLaVenta;
const onCobrar = vi.fn();

async function montar(extra: Partial<Parameters<typeof PantallaVenta>[0]> = {}) {
  carrito = carritoConPollo();
  render(
    <MemoryRouter>
      <PantallaVenta
        productos={[POLLO]}
        categorias={[]}
        carrito={carrito}
        onCobrar={onCobrar}
        sucursalId={3}
        cobro={cobro}
        {...extra}
      />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const carritoEnPantalla = () => screen.getByRole("complementary");
const confirmar = () => within(carritoEnPantalla()).queryByRole("button", { name: /Confirmar cobro/ });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sesion.rubro = "RESTAURANTE";
  cobro = {
    total: 35,
    formasPago: FORMAS,
    onConfirmar: vi.fn(),
    onCredito: vi.fn(),
    enviando: false,
    error: "",
  };
});

describe("el cobro en el carrito", () => {
  it("en lugar de «Cobrar»: el medio de pago, el efectivo, Confirmar y el fiado", async () => {
    await montar();
    const panel = carritoEnPantalla();
    expect(within(panel).queryByRole("button", { name: /^Cobrar / })).not.toBeInTheDocument();
    for (const m of ["Efectivo", "QR", "Mixto"]) expect(within(panel).getByRole("button", { name: m })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Efectivo recibido")).toBeInTheDocument();
    expect(confirmar()).toHaveTextContent("Confirmar cobro · Bs 35,00");
    expect(within(panel).getByRole("button", { name: "Vender a crédito (fiado)" })).toBeInTheDocument();
    // Sin la cabecera «← Cobrar» ni el cartel del total: el total ya está en el carrito.
    expect(screen.queryByRole("heading", { name: "Cobrar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Total a cobrar")).not.toBeInTheDocument();
  });

  it("confirmar manda los pagos al cobro del POS", async () => {
    await montar();
    fireEvent.change(within(carritoEnPantalla()).getByLabelText("Efectivo recibido"), { target: { value: "40" } });
    fireEvent.click(confirmar()!);
    expect(cobro.onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 35, recibido: 40 }]);
  });

  it("una nota escrita y sin confirmar se guarda ANTES, y el cobro sale en el dibujo siguiente", async () => {
    await montar();
    const panel = carritoEnPantalla();
    fireEvent.click(within(panel).getByRole("button", { name: "Nota" }));
    fireEvent.change(within(panel).getByLabelText("Nota de Pollo entero"), { target: { value: "sin ají" } });
    fireEvent.change(within(panel).getByLabelText("Efectivo recibido"), { target: { value: "35" } });
    await act(async () => {
      fireEvent.click(confirmar()!);
    });
    expect(carrito.setNota).toHaveBeenCalledWith(1, "sin ají");
    expect(cobro.onConfirmar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(carrito.setNota).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cobro.onConfirmar).mock.invocationCallOrder[0],
    );
  });

  it("y lo mismo antes de ir al fiado", async () => {
    await montar();
    const panel = carritoEnPantalla();
    fireEvent.click(within(panel).getByRole("button", { name: "Nota" }));
    fireEvent.change(within(panel).getByLabelText("Nota de Pollo entero"), { target: { value: "sin sal" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Vender a crédito (fiado)" }));
    expect(carrito.setNota).toHaveBeenCalledWith(1, "sin sal");
    expect(cobro.onCredito).toHaveBeenCalledTimes(1);
  });

  it("sin el fiado (no hay permiso o no se puede fiar), no se ofrece", async () => {
    cobro = { ...cobro, onCredito: undefined };
    await montar();
    expect(within(carritoEnPantalla()).queryByRole("button", { name: /fiado/ })).not.toBeInTheDocument();
  });

  it("mientras se registra: «Registrando…» y apagado; el error del servidor, en el carrito", async () => {
    cobro = { ...cobro, enviando: true, error: "No se pudo registrar la venta" };
    await montar();
    const boton = within(carritoEnPantalla()).getByRole("button", { name: "Registrando…" });
    expect(boton).toBeDisabled();
    expect(within(carritoEnPantalla()).getByText("No se pudo registrar la venta")).toBeInTheDocument();
  });

  it("lo que frenaba «Cobrar» frena Confirmar y se dice (un paquete sin cliente)", async () => {
    await montar({ bloqueoCobro: "Elegí a nombre de quién queda el paquete (arriba) para cobrar." });
    expect(confirmar()).toBeDisabled();
    expect(within(carritoEnPantalla()).getByText(/Elegí a nombre de quién queda el paquete/)).toBeInTheDocument();
  });

  it("y la cotización de una promoción en vuelo", async () => {
    await montar({ descuentos: { total: 30, nodo: null, bloqueado: true } });
    expect(confirmar()).toBeDisabled();
  });

  it("los pedidos de las apps de delivery quedan después del cobro, como alternativa", async () => {
    await montar({ plataformas: { disponibles: ["YANGO"], onElegir: vi.fn() } });
    const panel = carritoEnPantalla();
    // El 🛵 es de adorno (aria-hidden): se busca el botón que lo lleva.
    const plataforma = within(panel).getByText("🛵").closest("button")!;
    const fiado = within(panel).getByRole("button", { name: "Vender a crédito (fiado)" });
    expect(fiado.compareDocumentPosition(plataforma) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("con el carrito vacío, el vacío de siempre y sin cobro", async () => {
    carrito = carritoConPollo();
    render(
      <MemoryRouter>
        <PantallaVenta
          productos={[POLLO]}
          categorias={[]}
          carrito={{ ...carrito, lineas: [], unidades: 0, subtotal: 0, total: 0 }}
          onCobrar={onCobrar}
          cobro={cobro}
        />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(within(carritoEnPantalla()).getByText("Carrito vacío")).toBeInTheDocument();
    expect(confirmar()).not.toBeInTheDocument();
  });
});

describe("dónde el carrito sigue con «Cobrar» aunque llegue el cobro", () => {
  it("modificando una venta ya cobrada: su pie de siempre", async () => {
    const modificacion: ModoModificacion = {
      titulo: "Cambio de V-000012",
      resumen: null,
      etiqueta: "Cobrar Bs 4,00 de diferencia",
      vacio: "Sin nada",
    };
    await montar({ modificacion });
    expect(confirmar()).not.toBeInTheDocument();
    fireEvent.click(within(carritoEnPantalla()).getByRole("button", { name: "Cobrar Bs 4,00 de diferencia" }));
    expect(onCobrar).toHaveBeenCalled();
  });

  it("en la farmacia", async () => {
    sesion.rubro = "FARMACIA";
    await montar();
    expect(confirmar()).not.toBeInTheDocument();
    expect(within(carritoEnPantalla()).getByRole("button", { name: "Cobrar Bs 35,00" })).toBeInTheDocument();
  });

  it("en la hoja del carrito del celular, nunca: el cobro va sólo en la columna", async () => {
    await montar();
    // La píldora flotante (la del celular) abre la hoja: ahí el carrito es el de siempre, con «Cobrar».
    fireEvent.click(document.querySelector<HTMLButtonElement>("button.fixed")!);
    const botonesCobrar = screen.getAllByRole("button", { name: "Cobrar Bs 35,00" });
    expect(botonesCobrar).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Confirmar cobro/ })).toHaveLength(1);
  });
});
