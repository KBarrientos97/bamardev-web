import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecetaPlato, TableroCostos } from "../../lib/recetas/tipos";

/**
 * «Costos de platos» (CONTRATO-recetas-plato §3.5): el aviso cuando el costo se
 * movió, las tres cifras, lo que deja cada plato (del que menos al que más), lo
 * que menos queda, el gráfico y los platos sin receta.
 */

// La pantalla entera, con su gráfico: con la máquina cargada, los 5 s de fábrica no alcanzan.
vi.setConfig({ testTimeout: 30_000 });

const sesion = vi.hoisted(() => ({
  permisos: ["costos.ver", "catalogo.editar"] as string[],
  secciones: ["movimientos", "insumos"] as string[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { permisos: sesion.permisos, permisosPropios: [], sucursalId: null },
    puede: (s: string) => sesion.secciones.includes(s),
    negocio: { tipoNegocio: "RESTAURANTE", recetas: { activas: true, elegirPresa: false, puroDoble: true } },
  }),
}));

// Un local solo: sin selector de sucursal.
vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ sucursalId: null, elegirSucursal: false, valorChip: "", opciones: [], alElegir: () => {} }),
}));

vi.mock("../../lib/recetas/api", () => ({
  apiRecetas: { costos: vi.fn(), marcarVisto: vi.fn(), historial: vi.fn() },
}));

vi.mock("./Movimientos", () => ({ RUTA_REGISTRAR_COMPRA: "/inventario/movimientos?nuevo=entrada" }));

// El editor tiene su propio test: acá sólo importa qué plato abre y qué pasa al guardar.
vi.mock("./recetas/EditorReceta", () => ({
  default: ({ platoId, onGuardada }: { platoId: number; onGuardada: (r: RecetaPlato) => void }) => (
    <div role="dialog" aria-label={`Receta del plato ${platoId}`}>
      <button
        onClick={() =>
          onGuardada({
            platoId,
            nombre: "Broaster cuarto",
            precio: 28,
            conReceta: true,
            lineas: [],
            costo: 14.81,
            costoMinimo: 14.81,
            costoMaximo: 14.81,
            alcanza: null,
            limite: null,
            sinCosto: [],
          })
        }
      >
        Guardar la receta
      </button>
    </div>
  ),
}));

import { apiRecetas } from "../../lib/recetas/api";
import CostosPlatos from "./CostosPlatos";

const TABLERO: TableroCostos = {
  avisoPct: 2,
  vistoEn: "2026-11-20T12:00:00.000Z",
  aviso: {
    platos: [{ id: 12, nombre: "Broaster cuarto", antes: 13.9, ahora: 14.81, precio: 28 }],
    causas: [
      {
        insumoId: 5,
        nombre: "Arroz",
        compraUnidad: "Quintal",
        compraContenido: 46,
        unidad: "Kilogramo",
        costoAntes: 6,
        costoAhora: 6.3,
      },
    ],
  },
  platos: [
    // Deja 47 %, 33 % y 60 %.
    { id: 12, nombre: "Broaster cuarto", precio: 28, costo: 14.81, alcanza: 120, limite: "Pollo para broaster", sinCosto: [] },
    { id: 13, nombre: "Brasa económico", precio: 15, costo: 10, alcanza: 0, limite: "Pollo para brasa", sinCosto: ["Yuca"] },
    { id: 14, nombre: "Broaster entero", precio: 100, costo: 40, alcanza: null, limite: null, sinCosto: [] },
  ],
  sinReceta: [{ id: 40, nombre: "Alitas", precio: 30 }],
  insumos: [
    { id: 5, nombre: "Arroz", seCuenta: false, stock: 46, unidad: "Kilogramo", porciones: 552, porcionNombre: "porción" },
    { id: 8, nombre: "Pollo para broaster", seCuenta: true, stock: 30, unidad: "Unidad", porciones: 240, porcionNombre: "presa" },
  ],
};

function Ubicacion() {
  const l = useLocation();
  return <p>ahora en {`${l.pathname}${l.search}`}</p>;
}

async function montar() {
  render(
    <MemoryRouter initialEntries={["/inventario/costos-platos"]}>
      <Routes>
        <Route path="/inventario/costos-platos" element={<CostosPlatos />} />
        <Route path="/inventario/insumos" element={<Ubicacion />} />
        <Route path="/inventario/movimientos" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Lo que te deja cada plato" });
  await act(async () => {});
}

const filas = () => within(screen.getByRole("list", { name: "Lo que te deja cada plato" })).getAllByRole("listitem");

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["costos.ver", "catalogo.editar"];
  sesion.secciones = ["movimientos", "insumos"];
  vi.mocked(apiRecetas.costos).mockResolvedValue(TABLERO);
  vi.mocked(apiRecetas.marcarVisto).mockResolvedValue({ vistoEn: "2026-11-27T15:00:00.000Z" });
  vi.mocked(apiRecetas.historial).mockImplementation(async (id: number) => ({
    puntos:
      id === 12
        ? [
            { fecha: "2026-11-01T12:00:00.000Z", costo: 13.9 },
            { fecha: "2026-11-15T12:00:00.000Z", costo: 14.2 },
            { fecha: "2026-11-26T12:00:00.000Z", costo: 14.81 },
          ]
        : [{ fecha: "2026-11-02T12:00:00.000Z", costo: 10 }],
  }));
});

describe("Costos de platos", () => {
  it("el aviso: qué subió, por qué, y cuánto deja ahora", async () => {
    await montar();

    const aviso = screen.getByRole("region", { name: "Cambios de costo" });
    expect(within(aviso).getByRole("heading", { name: "Subió el costo de 1 plato" })).toBeInTheDocument();
    expect(within(aviso).getByText("Arroz: el quintal pasó de Bs 276,00 a Bs 289,80.")).toBeInTheDocument();
    expect(within(aviso).getByText(/Te costaba Bs 13,90 · ahora/)).toHaveTextContent("Te costaba Bs 13,90 · ahora Bs 14,81");
    expect(within(aviso).getByText("+ Bs 0,91")).toBeInTheDocument();
    expect(within(aviso).getByText("Ganás Bs 13,19 por plato")).toBeInTheDocument();
    expect(within(aviso).getByText("El precio de venta no se toca: lo decidís vos. Esto sólo te avisa.")).toBeInTheDocument();
  });

  it("«Ya lo vi» lo marca y vuelve a pedir el tablero", async () => {
    await montar();
    vi.mocked(apiRecetas.costos).mockResolvedValue({ ...TABLERO, aviso: { platos: [], causas: [] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ya lo vi" }));
    });

    expect(apiRecetas.marcarVisto).toHaveBeenCalledTimes(1);
    expect(apiRecetas.costos).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText(
        "Ningún plato cambió de costo 2 % o más desde la última vez que miraste. Ese margen lo ajustás en Configuración.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cambios de costo" })).not.toBeInTheDocument();
  });

  it("las tres cifras: cuántos tienen receta, lo que queda de cada Bs 100 y el que menos deja", async () => {
    await montar();

    expect(screen.getByText("3 de 4")).toBeInTheDocument();
    expect(screen.getByText("1 todavía sin receta")).toBeInTheDocument();
    // (47,1 + 33,3 + 60) ÷ 3
    expect(screen.getByText("te quedan Bs 47")).toBeInTheDocument();
    const peor = screen.getByText("El plato que menos deja").parentElement!;
    expect(within(peor).getByText("Brasa económico")).toBeInTheDocument();
    expect(within(peor).getByText("Bs 5,00 por plato · 33 % del precio")).toBeInTheDocument();
  });

  it("lo que deja cada plato, del que menos al que más, con la barra y lo que falta", async () => {
    await montar();

    const [primero, segundo, tercero] = filas();
    expect(primero).toHaveTextContent("Brasa económico");
    expect(within(primero).getByText("Ya no alcanza para ningún plato")).toBeInTheDocument();
    expect(within(primero).getByText("Costo incompleto")).toBeInTheDocument();
    expect(segundo).toHaveTextContent("Broaster cuarto");
    expect(within(segundo).getByText("Alcanza para 120 platos")).toBeInTheDocument();
    expect(within(segundo).getByText("Costo Bs 14,81 · Precio Bs 28,00")).toBeInTheDocument();
    expect(within(segundo).getByText("Ganás Bs 13,19")).toBeInTheDocument();
    expect(within(segundo).getByText("47 % del precio")).toBeInTheDocument();
    expect(within(segundo).queryByText("Costo incompleto")).not.toBeInTheDocument();
    // Nada se cuenta: no dice para cuántos alcanza.
    expect(tercero).toHaveTextContent("Broaster entero");
    expect(within(tercero).queryByText(/alcanza/i)).not.toBeInTheDocument();
  });

  it("tocar un plato abre su receta; al guardarla se vuelve a pedir el tablero", async () => {
    await montar();

    fireEvent.click(within(filas()[1]).getByRole("button"));
    const editor = screen.getByRole("dialog", { name: "Receta del plato 12" });
    await act(async () => {
      fireEvent.click(within(editor).getByRole("button", { name: "Guardar la receta" }));
    });
    expect(screen.queryByRole("dialog", { name: "Receta del plato 12" })).not.toBeInTheDocument();
    expect(apiRecetas.costos).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Receta de Broaster cuarto guardada.")).toBeInTheDocument();
  });

  it("los platos sin receta: tocar uno abre el editor para armarla", async () => {
    await montar();

    fireEvent.click(screen.getByRole("button", { name: "Alitas" }));
    expect(screen.getByRole("dialog", { name: "Receta del plato 40" })).toBeInTheDocument();
  });

  it("lo que menos queda: lo que se cuenta y lo que se estima", async () => {
    await montar();

    const lista = screen.getByRole("list", { name: "Lo que menos te queda" });
    expect(within(lista).getByText("Deberían quedar 46 kilos, unas 552 porciones.")).toBeInTheDocument();
    expect(within(lista).getByText("Quedan 30 unidades, 240 presas.")).toBeInTheDocument();
    expect(within(lista).getByText("Se estima")).toBeInTheDocument();
    expect(within(lista).getByText("Se cuenta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver todos los insumos" }));
    expect(await screen.findByText("ahora en /inventario/insumos")).toBeInTheDocument();
  });

  it("el gráfico arranca en el plato del aviso y se puede elegir otro", async () => {
    await montar();

    expect(apiRecetas.historial).toHaveBeenCalledWith(12);
    expect(await screen.findByRole("img", { name: "Costo de Broaster cuarto: pasó de Bs 13,90 a Bs 14,81" })).toBeInTheDocument();
    expect(screen.getByText("Hoy:").parentElement).toHaveTextContent("Hoy: Bs 14,81");

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Plato del gráfico" }), { target: { value: "13" } });
    });
    expect(apiRecetas.historial).toHaveBeenLastCalledWith(13);
    expect(await screen.findByText("Todavía no cambió de costo: Bs 10,00.")).toBeInTheDocument();
  });

  it("«Registrar compra» lleva a la entrada de Movimientos", async () => {
    await montar();

    fireEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    expect(await screen.findByText("ahora en /inventario/movimientos?nuevo=entrada")).toBeInTheDocument();
  });

  it("quien ve los costos pero no edita el catálogo mira y nada más", async () => {
    sesion.permisos = ["costos.ver"];
    sesion.secciones = [];
    await montar();

    expect(within(filas()[1]).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alitas" })).not.toBeInTheDocument();
    expect(screen.getByText("Alitas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver todos los insumos" })).not.toBeInTheDocument();
  });

  it("sin platos con receta todavía", async () => {
    vi.mocked(apiRecetas.costos).mockResolvedValue({
      ...TABLERO,
      aviso: { platos: [], causas: [] },
      platos: [],
      insumos: [],
    });
    await montar();

    expect(screen.getByText("Todavía no hay platos con receta")).toBeInTheDocument();
    expect(screen.getByText("0 de 1")).toBeInTheDocument();
    expect(screen.getByText(/Cuando un plato tenga receta, acá ves cómo cambia su costo/)).toBeInTheDocument();
    expect(apiRecetas.historial).not.toHaveBeenCalled();
  });
});
