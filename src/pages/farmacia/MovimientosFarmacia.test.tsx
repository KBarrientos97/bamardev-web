import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movimiento } from "../../types";

/**
 * El registro de Movimientos de la farmacia con transferencias: se leen
 * "de dónde a dónde", y "Editar" las abre en su pantalla. Las entradas y las
 * salidas se ven y se editan como siempre.
 */

vi.mock("../../lib/api", () => ({
  api: {
    getMovimientos: vi.fn(),
    getMovimiento: vi.fn(),
    aprobarMovimiento: vi.fn(async () => ({})),
    anularMovimiento: vi.fn(async () => ({})),
    eliminarMovimiento: vi.fn(async () => ({})),
    eliminarDetalleMovimiento: vi.fn(async () => ({})),
    actualizarDetalleMovimiento: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import MovimientosFarmacia from "./MovimientosFarmacia";

function movimiento(id: number, extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id,
    tipo: "ENTRADA",
    comprobante: null,
    descripcion: null,
    estado: "PENDIENTE",
    fecha: "2026-10-01T12:00:00.000Z",
    fechaAprobacion: null,
    origen: "PRODUCTO",
    almacen: { id: 1, nombre: "Centro" },
    almacenDestino: null,
    items: 1,
    productos: ["Amoxicilina 500 mg"],
    monto: 60,
    detalles: [],
    ...extra,
  };
}

const ENTRADA = movimiento(10, { descripcion: "Droguería INTI" });
const TRANSFERENCIA = movimiento(11, {
  tipo: "TRANSFERENCIA",
  descripcion: "Reposición",
  almacenDestino: { id: 2, nombre: "Equipetrol" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMovimientos).mockResolvedValue([ENTRADA, TRANSFERENCIA]);
  vi.mocked(api.getMovimiento).mockImplementation(async (id: number) =>
    id === TRANSFERENCIA.id ? TRANSFERENCIA : ENTRADA,
  );
});

function abrir() {
  render(
    <MemoryRouter initialEntries={["/inventario/movimientos"]}>
      <Routes>
        <Route path="/inventario/movimientos" element={<MovimientosFarmacia />} />
        <Route
          path="/inventario/movimientos/transferencia/:id/editar"
          element={<p>editar transferencia</p>}
        />
        <Route path="/inventario/movimientos/:id/editar" element={<p>editar ingreso o salida</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Transferencias en el registro", () => {
  it("la tarjeta dice de qué sucursal a cuál", async () => {
    abrir();
    const tarjeta = (await screen.findByText(/Centro → Equipetrol/)).closest("button")!;
    expect(within(tarjeta).getByText("Transferencia")).toBeInTheDocument();
  });

  it("el detalle muestra las dos puntas y no pide factura ni motivo", async () => {
    abrir();
    fireEvent.click(await screen.findByText(/Centro → Equipetrol/));
    const detalle = await screen.findByRole("dialog", { name: "Transferencia · #11" });
    expect(await within(detalle).findByText("Sale de")).toBeInTheDocument();
    expect(within(detalle).getByText("Va a")).toBeInTheDocument();
    expect(within(detalle).getByText("Equipetrol")).toBeInTheDocument();
    expect(within(detalle).queryByText("Motivo")).not.toBeInTheDocument();
    expect(within(detalle).queryByText("Nº factura")).not.toBeInTheDocument();
  });

  it("Editar una transferencia la abre en su pantalla", async () => {
    abrir();
    fireEvent.click(await screen.findByText(/Centro → Equipetrol/));
    const detalle = await screen.findByRole("dialog", { name: "Transferencia · #11" });
    fireEvent.click(await within(detalle).findByRole("button", { name: "Editar" }));
    expect(await screen.findByText("editar transferencia")).toBeInTheDocument();
  });

  it("el chip de transferencias aparece sólo si hay alguna", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: "Transferencias" })).toBeInTheDocument();
  });
});

describe("Entradas y salidas, como siempre", () => {
  it("sin transferencias no hay chip de transferencias", async () => {
    vi.mocked(api.getMovimientos).mockResolvedValue([ENTRADA]);
    abrir();
    await screen.findByText(/Droguería INTI/);
    expect(screen.getByRole("button", { name: "Entradas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferencias" })).not.toBeInTheDocument();
  });

  it("la entrada se lee con su sucursal y se edita en la pantalla de siempre", async () => {
    abrir();
    const tarjeta = (await screen.findByText(/Droguería INTI/)).closest("button")!;
    expect(within(tarjeta).getByText(/Centro/)).toBeInTheDocument();
    expect(within(tarjeta).queryByText(/→/)).not.toBeInTheDocument();

    fireEvent.click(tarjeta);
    const detalle = await screen.findByRole("dialog", { name: "Entrada · #10" });
    expect(await within(detalle).findByText("Sucursal")).toBeInTheDocument();
    expect(within(detalle).getByText("Nº factura")).toBeInTheDocument();
    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("editar ingreso o salida")).toBeInTheDocument();
  });
});

describe("Mientras carga", () => {
  it("no dice «0 registrados» antes de que llegue la lista", async () => {
    vi.mocked(api.getMovimientos).mockReturnValue(new Promise(() => {}));
    abrir();
    expect(screen.getByText("Entradas y salidas de stock")).toBeInTheDocument();
    expect(screen.queryByText(/0 registrados/)).not.toBeInTheDocument();
  });
});
