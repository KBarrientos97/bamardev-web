import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteMermas } from "../../types";

/**
 * Vencimientos y mermas: lo perdido en el período (la devolución aparte, no
 * es pérdida) y lo que está en riesgo hoy, que lleva a Vencimientos filtrado.
 */

const sesion = vi.hoisted(() => ({ vencimientos: true }));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Farmacia San Rafael" },
      usuario: { rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: 917 },
      puede: (s: string) => (s === "vencimientos" ? sesion.vencimientos : true),
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: { mermas: vi.fn(), getSucursales: vi.fn(async () => []) },
}));

import { api } from "../../lib/api";
import MermasPagina from "./Mermas";
import { rangoDe } from "./periodo";

const nada = { unidades: 0, valor: 0, lotes: 0 };

function reporte(over: Partial<ReporteMermas> = {}): ReporteMermas {
  return {
    resumen: { perdido: 23, unidadesPerdidas: 6, devuelto: 9, unidadesDevueltas: 3, enRiesgo: 35 },
    riesgo: {
      VENCIDO: { unidades: 4, valor: 20, lotes: 1 },
      HASTA_30: { unidades: 5, valor: 15, lotes: 1 },
      HASTA_60: nada,
      HASTA_90: nada,
    },
    porMotivo: [
      { motivo: "Vencimiento", devolucion: false, unidades: 4, valor: 20 },
      { motivo: "Devolución a proveedor", devolucion: true, unidades: 3, valor: 9 },
      { motivo: "Producto dañado", devolucion: false, unidades: 2, valor: 3 },
    ],
    porProducto: [
      {
        productoId: 1,
        nombre: "Amoxicilina 500 mg",
        laboratorio: "BAGÓ",
        motivos: ["Vencimiento"],
        unidades: 4,
        valor: 20,
      },
    ],
    porMes: [{ mes: "2026-09", perdido: 23, devuelto: 9 }],
    detalle: [
      {
        movimientoId: 10,
        fecha: "2026-09-28T15:00:00.000Z",
        motivo: "Vencimiento",
        nota: "estaban en la vitrina",
        devolucion: false,
        productoId: 1,
        nombre: "Amoxicilina 500 mg",
        laboratorio: "BAGÓ",
        cantidad: 4,
        valor: 20,
        lotes: ["AMX-VENCIDO"],
        almacen: "Sucursal Centro",
        usuario: "Regente",
      },
    ],
    ...over,
  };
}

function DondeEstoy() {
  const { pathname, state } = useLocation();
  return <p>{`${pathname} ${JSON.stringify(state)}`}</p>;
}

async function montar() {
  render(
    <MemoryRouter initialEntries={["/reportes/mermas"]}>
      <Routes>
        <Route path="/reportes/mermas" element={<MermasPagina />} />
        <Route path="/vencimientos" element={<DondeEstoy />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.vencimientos = true;
  vi.mocked(api.mermas).mockResolvedValue(reporte());
});

describe("vencimientos y mermas", () => {
  it("lo perdido, lo devuelto (que no es pérdida) y lo que está en riesgo", async () => {
    await montar();
    expect(screen.getByText("Bs 23,00")).toBeInTheDocument();
    expect(screen.getByText("3 unidades · no es pérdida")).toBeInTheDocument();
    expect(screen.getByText("Bs 35,00")).toBeInTheDocument();
    const motivos = screen.getByRole("heading", { name: "Por motivo" }).closest("section")!;
    expect(within(motivos).getByText(/Devolución a proveedor/)).toHaveTextContent(
      "Devolución a proveedor· no es pérdida",
    );
  });

  it("lo cargado de más y lo que no tiene motivo se listan, aclarando que no son pérdida", async () => {
    // Sin la aclaración, "Cargado de más · Bs 3" se lee como plata perdida y el
    // "Perdido" de arriba no daría la suma de la lista.
    vi.mocked(api.mermas).mockResolvedValue(
      reporte({
        porMotivo: [
          { motivo: "Vencimiento", devolucion: false, perdida: true, unidades: 4, valor: 20 },
          { motivo: "Cargado de más", devolucion: false, perdida: false, unidades: 2, valor: 3 },
          { motivo: "Sin motivo", devolucion: false, perdida: false, unidades: 1, valor: 1.5 },
        ],
      }),
    );
    await montar();
    const motivos = screen.getByRole("heading", { name: "Por motivo" }).closest("section")!;
    expect(within(motivos).getByText(/Cargado de más/)).toHaveTextContent(
      "Cargado de más· corrige una carga, no es pérdida",
    );
    expect(within(motivos).getByText(/Sin motivo/)).toHaveTextContent(
      "Sin motivo· no se cuenta como pérdida",
    );
    expect(within(motivos).getByText(/Vencimiento/)).toHaveTextContent(/^Vencimiento$/);
  });

  it("cada baja con su lote, su motivo y quién", async () => {
    await montar();
    const fila = within(screen.getByRole("table")).getByText("Amoxicilina 500 mg").closest("tr")!;
    expect(fila).toHaveTextContent("lote AMX-VENCIDO");
    expect(fila).toHaveTextContent("estaban en la vitrina");
    expect(fila).toHaveTextContent("Regente");
  });

  it("tocar un tramo en riesgo abre Vencimientos filtrado en ese tramo", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Vencido en el estante/ }));
    });
    expect(screen.getByText('/vencimientos {"tramo":"VENCIDO"}')).toBeInTheDocument();
  });

  it("quien no ve Vencimientos, ve el riesgo pero no lo toca", async () => {
    sesion.vencimientos = false;
    await montar();
    expect(screen.queryByRole("button", { name: /Vencido en el estante/ })).toBeNull();
    expect(screen.getByText("Vencido en el estante")).toBeInTheDocument();
  });

  it("sin bajas en el período lo dice, y el riesgo de hoy se sigue viendo", async () => {
    vi.mocked(api.mermas).mockResolvedValue(
      reporte({ detalle: [], porMotivo: [], porProducto: [], porMes: [] }),
    );
    await montar();
    expect(screen.getByText("No hubo bajas en el período")).toBeInTheDocument();
    expect(screen.getByText("En riesgo hoy", { selector: "h2" })).toBeInTheDocument();
  });

  it("el período cambia las fechas que se piden", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Esta gestión" }));
    });
    expect(api.mermas).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: `${new Date().getFullYear()}-01-01` }),
    );
  });
});

describe("rangoDe", () => {
  const hoy = new Date(2026, 8, 29);
  it("este mes, el pasado, tres meses y la gestión", () => {
    expect(rangoDe("mes", hoy)).toEqual({ desde: "2026-09-01", hasta: "2026-09-29" });
    expect(rangoDe("mesPasado", hoy)).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(rangoDe("trimestre", hoy)).toEqual({ desde: "2026-07-01", hasta: "2026-09-29" });
    expect(rangoDe("gestion", hoy)).toEqual({ desde: "2026-01-01", hasta: "2026-09-29" });
  });
});
