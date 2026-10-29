import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * "Unir otra mesa" al abrir (BUG-salon-1 y BUG-salon-4): su propio diálogo y
 * la llamada con la otra mesa, de a una, como une el backend.
 */

vi.mock("../../lib/api", () => ({
  api: {
    abrirMesa: vi.fn(),
    unirMesa: vi.fn(),
    separarMesa: vi.fn(),
    reservarMesa: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import AbrirMesa from "./AbrirMesa";

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 8,
    capacidadTotal: 8,
    unidas: [],
    activa: true,
    estado: "LIBRE",
    comensales: 0,
    consumo: 0,
    propina: 0,
    comandas: [],
    ...p,
  };
}

const M1 = mesa();
const M2 = mesa({ id: 2, codigo: "M2", nombre: "Mesa M2", capacidad: 6, capacidadTotal: 6 });
const M3_CON_ARRIMADA = mesa({
  id: 3,
  codigo: "M3",
  nombre: "Mesa M3",
  unidas: [{ id: 9, codigo: "M9", capacidad: 2 }],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("unir otra mesa al abrir", () => {
  it("abre el diálogo de unir y une la elegida, de a una", async () => {
    const unida = { ...M1, unidas: [{ id: 2, codigo: "M2", capacidad: 6 }], capacidadTotal: 14 };
    vi.mocked(api.unirMesa).mockResolvedValue(unida);
    const onMesaCambiada = vi.fn();
    render(
      <AbrirMesa
        mesa={M1}
        mesasDelSalon={[M1, M2, M3_CON_ARRIMADA]}
        onAtras={() => {}}
        onAbierta={() => {}}
        onMesaCambiada={onMesaCambiada}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unir otra mesa" }));
    // Se abría el de "pasar": "¿A qué mesa la paso?".
    expect(screen.getByRole("dialog", { name: "¿Con qué mesa la unís?" })).toBeInTheDocument();
    expect(screen.queryByText("Mesa M3")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Mesa M2"));
    });
    expect(api.unirMesa).toHaveBeenCalledWith(1, 2);
    expect(onMesaCambiada).toHaveBeenCalledWith(unida);
  });
});
