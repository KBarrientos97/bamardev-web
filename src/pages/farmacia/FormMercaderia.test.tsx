import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, ArticuloMovimiento, Movimiento } from "../../types";

/**
 * Editar un movimiento PENDIENTE no puede costarle a nadie lo que ya cargó.
 *
 * Mientras esté pendiente el inventario no se tocó, así que corregir el almacén
 * o pasar de salida a entrada es tan válido como corregir una cantidad: los
 * renglones se quedan donde están. Vaciarlos era tirar diez líneas de una
 * recepción de droguería sin avisar y sin forma de deshacerlo.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ incluye: () => true }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getAlmacenes: vi.fn(),
    getMovimiento: vi.fn(),
    getArticulosMovimiento: vi.fn(),
    lotesDeProducto: vi.fn(async () => []),
    actualizarMovimiento: vi.fn(async () => ({})),
    actualizarDetalleMovimiento: vi.fn(async () => ({})),
    agregarDetalleMovimiento: vi.fn(async () => ({})),
    eliminarDetalleMovimiento: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import FormMercaderia from "./FormMercaderia";

const DEPOSITO = 1;
const MOSTRADOR = 2;

/** Cuánta amoxicilina hay en cada almacén. El de al lado tiene menos. */
const STOCK: Record<number, number> = { [DEPOSITO]: 100, [MOSTRADOR]: 3 };

function almacen(id: number, nombre: string): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo: "DEPOSITO",
    esPrincipal: id === DEPOSITO,
    direccion: null,
    telefono: null,
  };
}

function articulo(stock: number): ArticuloMovimiento {
  return {
    id: 7,
    nombre: "Amoxicilina 500 mg",
    esInsumo: false,
    costo: 5,
    precio: 12,
    stock,
    unidad: "unidad",
    manejaLote: true,
  };
}

const salidaPendiente: Movimiento = {
  id: 950,
  tipo: "SALIDA",
  comprobante: null,
  descripcion: "Vencimiento · prueba de la pantalla nueva",
  estado: "PENDIENTE",
  fecha: "2026-09-15T12:00:00.000Z",
  fechaAprobacion: null,
  origen: "PRODUCTO",
  almacen: { id: DEPOSITO, nombre: "Depósito" },
  items: 1,
  monto: 60,
  detalles: [
    {
      id: 301,
      productoId: 7,
      producto: "Amoxicilina 500 mg",
      cantidad: 12,
      costo: 5,
      descripcion: null,
      loteCodigo: "AMX-2601",
      loteVencimiento: "2028-04-30",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAlmacenes).mockResolvedValue([
    almacen(DEPOSITO, "Depósito"),
    almacen(MOSTRADOR, "Mostrador"),
  ]);
  vi.mocked(api.getMovimiento).mockResolvedValue(salidaPendiente);
  vi.mocked(api.getArticulosMovimiento).mockImplementation(
    async (almacenId?: number) => [articulo(STOCK[almacenId ?? DEPOSITO] ?? 0)],
  );
});

async function abrirEdicion() {
  render(
    <MemoryRouter initialEntries={["/inventario/movimientos/950/editar"]}>
      <Routes>
        <Route
          path="/inventario/movimientos/:id/editar"
          element={<FormMercaderia tipoInicial="SALIDA" />}
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
}

/** Elegir otro almacén y esperar a que llegue su lista de artículos. */
async function elegirAlmacen(id: number) {
  await act(async () => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: String(id) } });
  });
}

async function clickEn(nombre: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nombre }));
  });
}

describe("Editar un movimiento pendiente", () => {
  it("cambiar de almacén deja los renglones donde están", async () => {
    await abrirEdicion();

    await elegirAlmacen(MOSTRADOR);

    expect(screen.getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByText("1 línea")).toBeInTheDocument();
    // La cantidad tecleada tampoco se pierde.
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
  });

  it("avisa en el acto si en el almacén nuevo ya no alcanza", async () => {
    await abrirEdicion();

    expect(screen.getByText(/Stock en Depósito: 100/)).toBeInTheDocument();

    await elegirAlmacen(MOSTRADOR);

    // Sin esperar a Guardar: se sacan 12 y en Mostrador quedan 3.
    await waitFor(() =>
      expect(screen.getByText(/Stock en Mostrador: 3 u\..*no alcanza/)).toBeInTheDocument(),
    );
  });

  it("pasar de salida a entrada deja los renglones donde están", async () => {
    await abrirEdicion();

    await clickEn(/Entrada/);

    expect(screen.getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByText("1 línea")).toBeInTheDocument();
    // Y ahora sí pide lote, que es lo único que cambia al recibir.
    expect(screen.getByPlaceholderText("Lote")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("MM/AAAA")).toBeInTheDocument();
  });

  it("cambiar almacén y tipo seguido tampoco los pierde", async () => {
    await abrirEdicion();

    await elegirAlmacen(MOSTRADOR);
    await clickEn(/Entrada/);
    await elegirAlmacen(DEPOSITO);

    expect(screen.getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByText("1 línea")).toBeInTheDocument();
  });
});
