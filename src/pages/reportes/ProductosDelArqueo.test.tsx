import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import type { ReporteCierreGanancia } from "../../types";

const { reporteCierreGanancia, sesion } = vi.hoisted(() => ({
  reporteCierreGanancia: vi.fn(),
  sesion: { rubro: "RESTAURANTE", incluye: true, permisos: ["reportes.ver", "reportes.rentabilidad"] },
}));

vi.mock("../../lib/api", async (original) => {
  const real = await original<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, reporteCierreGanancia } };
});

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { id: 1, permisos: sesion.permisos },
    negocio: { nombre: "Don Omar", features: [] },
    incluye: () => sesion.incluye,
  }),
}));

// Es lo que ve la cajera: si aparece, el arqueo cayó a la lista sin costos.
vi.mock("../pos/PantallaCierre", () => ({
  ProductosDelTurno: () => <p>lista de siempre</p>,
}));

import { ProductosDelArqueo } from "./ProductosDelArqueo";

const respuesta: ReporteCierreGanancia = {
  unidades: 4,
  total: 72,
  lineas: 1,
  costo: 48,
  ganancia: 24,
  categorias: [
    {
      nombre: "POLLOS",
      unidades: 4,
      total: 72,
      costo: 48,
      ganancia: 24,
      items: [{ productoId: 1, nombre: "Broaster", cantidad: 4, precio: 18, total: 72, costo: 48, ganancia: 24 }],
    },
  ],
};

async function montar() {
  render(<ProductosDelArqueo cajaId={7} subtitulo="07 nov · Cajera" onClose={() => {}} />);
  await act(async () => {});
}

beforeEach(() => {
  reporteCierreGanancia.mockReset();
  reporteCierreGanancia.mockResolvedValue(respuesta);
  sesion.rubro = "RESTAURANTE";
  sesion.incluye = true;
  sesion.permisos = ["reportes.ver", "reportes.rentabilidad"];
});

describe("productos vendidos del arqueo de Reportes", () => {
  it("el dueño ve el cuadro del turno, con costo y ganancia", async () => {
    await montar();
    expect(reporteCierreGanancia).toHaveBeenCalledWith(7);
    expect(screen.getByText("Broaster")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Costo" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Ganancia" })).toBeInTheDocument();
    expect(screen.queryByText("lista de siempre")).not.toBeInTheDocument();
  });

  it("sin rentabilidad ni siquiera pide el costo", async () => {
    // Kevin: "ese dato de costo y ganancia sólo es para el dueño". Esconderlo
    // en pantalla no alcanza: el dato tampoco tiene que viajar.
    sesion.permisos = ["reportes.ver"];
    await montar();
    expect(reporteCierreGanancia).not.toHaveBeenCalled();
    expect(screen.getByText("lista de siempre")).toBeInTheDocument();
  });

  it("un backend que todavía no tiene la ruta deja el arqueo como siempre", async () => {
    // PROD lo recibe después que la web: un 404 no puede romper el arqueo.
    reporteCierreGanancia.mockRejectedValue(new ApiError("No existe", 404));
    await montar();
    expect(screen.getByText("lista de siempre")).toBeInTheDocument();
  });

  it("un permiso quitado recién también cae a la lista", async () => {
    reporteCierreGanancia.mockRejectedValue(new ApiError("Sin permiso", 403));
    await montar();
    expect(screen.getByText("lista de siempre")).toBeInTheDocument();
  });

  it("cualquier otro error se dice: caer a la lista escondería que falló", async () => {
    reporteCierreGanancia.mockRejectedValue(new ApiError("Se cayó", 500));
    await montar();
    expect(screen.getByText("Se cayó")).toBeInTheDocument();
    expect(screen.queryByText("lista de siempre")).not.toBeInTheDocument();
  });

  it("un turno sin ventas lo dice, sin una tabla en cero", async () => {
    reporteCierreGanancia.mockResolvedValue({ ...respuesta, lineas: 0, categorias: [], total: 0, unidades: 0, costo: 0, ganancia: 0 });
    await montar();
    expect(screen.getByText("En este turno todavía no se vendió nada.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
