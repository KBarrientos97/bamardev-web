import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { TopProductoApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import TopProductos from "./TopProductos";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Top productos en el restaurante (REP-01 / BUG-reportes-5, 28-oct): como en
 * la app, se cuenta. Buscador, categoría, la métrica Unidades y el total de lo
 * que queda a la vista: "¿cuántos cuartos vendí este mes?". Los demás rubros
 * ven la pantalla de siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" as string }));
const reporte = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, reporte: (...a: unknown[]) => reporte(...a) } };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { id: 1, username: "kevin", permisos: ["reportes.ver"] },
    negocio: { alias: "polleria-omar", nombre: "Pollería", features: [] },
  }),
}));

const prod = (nombre: string, categoria: string, ingresos: number, utilidad: number, unidades: number): TopProductoApi => ({
  nombre,
  categoria,
  ingresos,
  utilidad,
  unidades,
  margenPct: Math.round((utilidad / ingresos) * 100),
});

/** Como lo manda el backend: todo lo vendido, ordenado por ingresos. */
const POLLERIA: TopProductoApi[] = [
  prod("Pollo entero", "Pollos", 1200, 400, 10),
  prod("Brasa cuarto", "Pollos", 1040, 390, 40),
  prod("Coca Cola 2L", "Bebidas", 560, 160, 20),
  prod("Broaster medio", "Pollos", 520, 180, 10),
  prod("Ají de fideo", "Platos de cuchara", 300, 120, 15),
];

const NOMBRES = /^(Pollo entero|Brasa cuarto|Coca Cola 2L|Broaster medio|Ají de fideo)$/;

/** Los productos de la lista, en el orden en que se ven. */
const enLista = () => screen.getAllByText(NOMBRES).map((e) => e.textContent);

let exportacion: Exportacion | null = null;

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "mes", desde: "2026-10-01", hasta: "2026-10-28" },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-28", contra: "1–28 de septiembre", leyenda: "1–28 de septiembre" },
    rango: { desde: "2026-10-01", hasta: "2026-10-28" },
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-28" },
    sucursalNombre: "",
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <TopProductos />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

function buscar(texto: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar producto o categoría" }), { target: { value: texto } });
}

const total = () => screen.getByRole("region", { name: "En lo que estás viendo" });

beforeEach(() => {
  sesion.rubro = "RESTAURANTE";
  exportacion = null;
  localStorage.clear();
  reporte.mockReset().mockResolvedValue(POLLERIA);
});

describe("Top productos del restaurante: contar lo que se busca", () => {
  it("las pestañas dicen lo que miden, y «Unidades» ordena por cantidad vendida", async () => {
    // BUG-reportes-5: "Más vendidos" ordenaba por Bs y el pollo entero, caro,
    // salía primero aunque se vendieran cuatro veces más cuartos.
    mostrar();
    await screen.findByText("Brasa cuarto");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Ingresos", "Ganancia", "Unidades"]);
    expect(enLista()[0]).toBe("Pollo entero");

    fireEvent.click(screen.getByRole("tab", { name: "Unidades" }));
    expect(enLista()).toEqual(["Brasa cuarto", "Coca Cola 2L", "Ají de fideo", "Pollo entero", "Broaster medio"]);
    expect(total()).toHaveTextContent("95 unidades");
  });

  it("buscar «pollo» deja los pollos (por su categoría, aunque ninguno se llame así) y el total dice cuánto, con el filtro al lado", async () => {
    mostrar();
    await screen.findByText("Brasa cuarto");
    buscar("pollo");
    expect(enLista()).toEqual(["Pollo entero", "Brasa cuarto", "Broaster medio"]);
    expect(total()).toHaveTextContent("«pollo»");
    expect(total()).toHaveTextContent(fmtMoney(2760));
    expect(total()).toHaveTextContent(`3 productos · 60 unidades · ganancia ${fmtMoney(970)}`);

    fireEvent.click(screen.getByRole("tab", { name: "Unidades" }));
    expect(total()).toHaveTextContent("60 unidades");
  });

  it("la categoría recorta la lista y se escribe al lado del total", async () => {
    mostrar();
    await screen.findByText("Brasa cuarto");
    const categoria = screen.getByRole("combobox", { name: "Categoría" });
    expect(within(categoria).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todas las categorías",
      "Bebidas",
      "Platos de cuchara",
      "Pollos",
    ]);
    fireEvent.change(categoria, { target: { value: "Bebidas" } });
    expect(enLista()).toEqual(["Coca Cola 2L"]);
    expect(total()).toHaveTextContent("Bebidas");
    expect(total()).toHaveTextContent("1 producto · 20 unidades");
  });

  it("si nada coincide, lo dice y ofrece ver todos: no es que no se vendió", async () => {
    mostrar();
    await screen.findByText("Brasa cuarto");
    buscar("pizza");
    expect(screen.getByText("Ningún producto coincide")).toBeInTheDocument();
    // Un total en cero se leería como un dato.
    expect(screen.queryByRole("region", { name: "En lo que estás viendo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(enLista()).toHaveLength(5);
    expect(screen.getByRole("textbox", { name: "Buscar producto o categoría" })).toHaveValue("");
  });

  it("la métrica elegida se recuerda: quien entra a contar, la próxima vez abre en Unidades", async () => {
    mostrar();
    await screen.findByText("Brasa cuarto");
    expect(screen.getByRole("tab", { name: "Ingresos" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Unidades" }));
    cleanup();

    mostrar();
    await screen.findByText("Brasa cuarto");
    expect(screen.getByRole("tab", { name: "Unidades" })).toHaveAttribute("aria-selected", "true");
    expect(enLista()[0]).toBe("Brasa cuarto");
  });

  it("el Excel lleva lo que se ve, con el total y el filtro escrito", async () => {
    mostrar();
    await screen.findByText("Brasa cuarto");
    buscar("pollo");
    await act(async () => {});
    const [h] = exportacion!.hojas();
    expect(h.nombre).toBe("Top productos (Ingresos)");
    expect(h.filas.slice(1, 4).map((f) => f[1])).toEqual(["Pollo entero", "Brasa cuarto", "Broaster medio"]);
    expect(h.filas).toContainEqual([null, "Total", null, 60, 2760, 970, 35.1, null]);
    expect(h.filas[h.filas.length - 1]).toEqual([null, "Filtro", "Todas las categorías · «pollo»"]);
  });
});

describe("Top productos en los demás rubros: la pantalla de siempre", () => {
  for (const rubro of ["BILLAR", "FARMACIA"]) {
    it(`${rubro.toLowerCase()}: «Más vendidos» y «Más rentables», sin buscador, sin categoría ni total`, async () => {
      sesion.rubro = rubro;
      // Aunque haya una métrica guardada de antes.
      localStorage.setItem("bamardev.reportes.topMetrica_polleria-omar_kevin", "unidades");
      mostrar();
      await screen.findByText("Brasa cuarto");
      expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Más vendidos", "Más rentables"]);
      expect(screen.getByRole("tab", { name: "Más vendidos" })).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByRole("textbox", { name: "Buscar producto o categoría" })).toBeNull();
      expect(screen.queryByRole("combobox", { name: "Categoría" })).toBeNull();
      expect(screen.queryByRole("region", { name: "En lo que estás viendo" })).toBeNull();
      expect(exportacion!.hojas().map((h) => h.nombre)).toEqual(["Más vendidos", "Más rentables"]);
    });
  }
});
