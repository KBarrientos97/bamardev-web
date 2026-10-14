import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecetaServicio } from "../../lib/belleza/apiExtras";

/**
 * Insumos por servicio: la receta de cada servicio (qué insumos gasta al
 * cobrarse). El costo y margen vive en Reportes (ver MargenServicios.test).
 */

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: {
    recetas: vi.fn(),
    insumos: vi.fn(),
    guardarReceta: vi.fn(),
    rentabilidadServicios: vi.fn(),
  },
}));

import { apiExtras } from "../../lib/belleza/apiExtras";
import RecetasServicio from "./RecetasServicio";

const TINTE: RecetaServicio = {
  servicioId: 100,
  servicio: "Tinte raíz",
  precio: 150,
  habilitado: true,
  items: [
    { insumoId: 200, insumo: "Tinte 7.1", unidad: "g", cantidad: 60, costoUnitario: 0.5, costo: 30 },
  ],
  costo: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiExtras.recetas).mockResolvedValue([
    TINTE,
    { servicioId: 101, servicio: "Corte", precio: 50, habilitado: true, items: [], costo: 0 },
  ]);
  vi.mocked(apiExtras.insumos).mockResolvedValue([
    { id: 200, nombre: "Tinte 7.1", costo: 0.5, esInsumo: true, unidad: "g" },
    { id: 201, nombre: "Oxidante 20 vol", costo: 0.1, esInsumo: true, unidad: "ml" },
  ]);
});

async function montar() {
  render(
    <MemoryRouter>
      <RecetasServicio />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Insumos por servicio", () => {
  it("cada servicio con lo que gasta y su costo", async () => {
    await montar();
    const lista = screen.getByRole("list", { name: "Servicios" });
    expect(within(lista).getByText("60 g Tinte 7.1")).toBeInTheDocument();
    expect(within(lista).getByText("Sin receta: no descuenta insumos")).toBeInTheDocument();
  });

  it("edita la receta: suma el oxidante y guarda las cantidades", async () => {
    vi.mocked(apiExtras.guardarReceta).mockResolvedValue({ ...TINTE, costo: 39 });
    await montar();
    const tinte = screen.getByText("Tinte raíz").closest("li")!;
    fireEvent.click(within(tinte).getByText("Receta"));
    fireEvent.click(screen.getByText("Agregar insumo"));
    fireEvent.change(screen.getByLabelText("Insumo 2"), { target: { value: "201" } });
    fireEvent.change(screen.getByLabelText("Cantidad 2"), { target: { value: "90" } });
    expect(screen.getByText(/Costo por servicio/)).toHaveTextContent("39,00");
    await act(async () => {
      fireEvent.click(screen.getByText("Guardar receta"));
    });
    expect(apiExtras.guardarReceta).toHaveBeenCalledWith(100, [
      { insumoId: 200, cantidad: 60 },
      { insumoId: 201, cantidad: 90 },
    ]);
  });

  it("no guarda un renglón sin cantidad", async () => {
    await montar();
    fireEvent.click(within(screen.getByText("Corte").closest("li")!).getByText("Receta"));
    fireEvent.click(screen.getByText("Agregar insumo"));
    fireEvent.change(screen.getByLabelText("Insumo 1"), { target: { value: "200" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Guardar receta"));
    });
    expect(apiExtras.guardarReceta).not.toHaveBeenCalled();
    expect(screen.getByText("Cada insumo necesita una cantidad mayor a 0.")).toBeInTheDocument();
  });

  it("el costo y margen ya no es una pestaña: lleva al reporte, en Reportes", async () => {
    await montar();
    expect(screen.queryByRole("tab", { name: "Costo y margen" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /costo y margen de cada servicio/ })).toHaveAttribute(
      "href",
      "/reportes/margen-servicios",
    );
    expect(apiExtras.rentabilidadServicios).not.toHaveBeenCalled();
  });
});
