import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntregaMesero } from "../../types/salon";

/**
 * Entregas de efectivo del salón: el local de cada entrega sólo se nombra si la
 * lista mezcla 2+ locales (PLAN-SUCURSAL-TOTAL §10.4). Con uno, la pantalla es la
 * de siempre.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 1, rol: "CAJERO", permisos: ["salon.cobrar"], permisosPropios: [] } }),
}));

vi.mock("../../lib/api", () => ({
  api: { entregasMesero: vi.fn(), aprobarEntregas: vi.fn() },
}));

import { api } from "../../lib/api";
import Entregas from "./Entregas";

const entrega = (id: number, almacen: EntregaMesero["almacen"]): EntregaMesero => ({
  id,
  mesaCodigo: `M${id}`,
  comprobante: `V-00000${id}`,
  meseroId: 4,
  meseroNombre: "Juan",
  monto: 26,
  estado: "PENDIENTE",
  creadaEn: "2026-11-12T15:00:00.000Z",
  aprobadaEn: null,
  aprobadaPorNombre: null,
  ...(almacen === undefined ? {} : { almacen }),
});

async function montar(items: EntregaMesero[]) {
  vi.mocked(api.entregasMesero).mockResolvedValue({ items, pendiente: 52, aprobado: 0 });
  render(<Entregas />);
  await act(async () => {});
}

beforeEach(() => {
  vi.mocked(api.entregasMesero).mockReset();
});

describe("entregas de efectivo: el local de cada una", () => {
  it("si la lista mezcla 2 locales, cada entrega dice el suyo", async () => {
    await montar([entrega(1, { id: 1, nombre: "Centro" }), entrega(2, { id: 2, nombre: "Norte" })]);
    expect(screen.getByText("· Centro")).toBeInTheDocument();
    expect(screen.getByText("· Norte")).toBeInTheDocument();
  });

  it("con todas del mismo local no se repite en cada fila", async () => {
    await montar([entrega(1, { id: 2, nombre: "Norte" }), entrega(2, { id: 2, nombre: "Norte" })]);
    expect(screen.queryByText("· Norte")).not.toBeInTheDocument();
  });

  it("un backend anterior (sin almacen) o una caja vieja (null) no cambian nada", async () => {
    await montar([entrega(1, undefined), entrega(2, null)]);
    expect(screen.getByText("M1")).toBeInTheDocument();
    expect(screen.queryByText(/^·/)).not.toBeInTheDocument();
  });
});
