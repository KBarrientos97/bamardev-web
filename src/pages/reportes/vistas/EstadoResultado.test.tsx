import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { Gasto } from "../../../types";
import { ContextoReporte, type DatosReporte } from "../contexto";
import EstadoResultado from "./EstadoResultado";

/**
 * El estado de resultado adaptado a cada rubro (pedido de Kevin del 14-oct):
 * el billar parte la venta en mesas y productos, el restaurante sigue como en
 * la app, y lo que no es parte de la cuenta (el resumen, las horas) no tumba
 * el reporte si falla. Lo que sí es parte (los gastos) lo tumba entero.
 */

const reporte = vi.fn();
const getGastos = vi.fn();
const request = vi.fn();
let rubro = "BILLAR";

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
  },
  qs: () => "",
  request: (...a: unknown[]) => request(...a),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro, negocio: { features: [] }, puede: () => true }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sucursalId: null }),
}));

const RANGO = { desde: "2026-09-01", hasta: "2026-09-30" };

function gasto(id: number, concepto: string, categoria: string, monto: number, pagado = 0): Gasto {
  return { id, concepto, categoria, categoriaNombre: categoria, monto, pagado, fecha: "2026-09-01" } as Gasto;
}

const GASTOS = [
  gasto(1, "Alquiler del local", "ALQUILER", 200),
  gasto(2, "Luz de las mesas", "LUZ", 50, 50),
];

/** El financiero, y el resumen con su composición (o un rechazo). */
function respuestas({ resumen = true }: { resumen?: boolean } = {}) {
  reporte.mockImplementation((nombre: string) => {
    if (nombre === "financiero") {
      return Promise.resolve({
        ventas: 520,
        costoVentas: 140,
        utilidadBruta: 380,
        utilidadBrutaDeltaPct: null,
        ventasSinCosto: 0,
        mermas: 0,
        compras: { total: 0, insumos: 0, productos: 0 },
        desglose: [],
      });
    }
    if (nombre === "resumen") {
      return resumen
        ? Promise.resolve({ tickets: { valor: 8, deltaPct: null }, composicion: { servicios: 280, productos: 240 } })
        : Promise.reject(new Error("sin resumen"));
    }
    return Promise.resolve(null);
  });
}

function Ubicacion() {
  const l = useLocation();
  return <p>ahora en {l.pathname} · {JSON.stringify(l.state)}</p>;
}

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", ...RANGO },
    comparacion: { desde: "2026-08-02", hasta: "2026-08-31", contra: "del 02/08 al 31/08/2026", leyenda: "Período anterior" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-08-02", hasta: "2026-08-31" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <MemoryRouter initialEntries={["/reportes/resultado"]}>
      <ContextoReporte.Provider value={datos}>
        <Routes>
          <Route path="/reportes/resultado" element={<EstadoResultado />} />
          <Route path="/reportes/:id" element={<Ubicacion />} />
        </Routes>
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

describe("estado de resultado por rubro", () => {
  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
    request.mockReset();
    rubro = "BILLAR";
  });

  it("el billar muestra el tiempo de mesa con sus horas, los productos y lo que dejó cada parte", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    request.mockResolvedValue({ horas: 12.7, porMesa: [{ horas: 5 }, { horas: 4.2 }, { horas: 3.5 }] });
    mostrar();

    expect(await screen.findByText("Tiempo de mesa")).toBeInTheDocument();
    expect(await screen.findByText("12,7 h jugadas en 3 mesas")).toBeInTheDocument();
    expect(screen.getByText("Bebidas y productos")).toBeInTheDocument();
    expect(screen.getByText("Ganancia de mesas y productos")).toBeInTheDocument();
    expect(screen.getByText(/8 ventas/)).toBeInTheDocument();
    // La ganancia líquida, dicha en palabras: 380 − 250 = 130.
    expect(
      screen.getByText(
        `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(250)}), te quedan ${fmtMoney(130)}: es tu ganancia líquida.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ganancia líquida del período/i)).toBeInTheDocument();
  });

  it("el restaurante va con una sola línea de ventas y habla de la comida, como en la app", async () => {
    rubro = "RESTAURANTE";
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    mostrar();

    expect(await screen.findByText("Ganancia de la comida")).toBeInTheDocument();
    expect(screen.getByText("Costo cargado en cada plato")).toBeInTheDocument();
    expect(screen.queryByText("Tiempo de mesa")).not.toBeInTheDocument();
    // El reporte del billar ni se pide fuera del billar.
    expect(request).not.toHaveBeenCalled();
  });

  it("si el resumen falla, el billar sigue con la venta en una sola línea", async () => {
    // El resumen sólo parte la primera línea: no es una mitad de la cuenta.
    respuestas({ resumen: false });
    getGastos.mockResolvedValue(GASTOS);
    request.mockResolvedValue(null);
    mostrar();

    expect(await screen.findByText("Ganancia de mesas y productos")).toBeInTheDocument();
    expect(screen.queryByText("Tiempo de mesa")).not.toBeInTheDocument();
    expect(screen.getByText("Ventas")).toBeInTheDocument();
  });

  it("si fallan los gastos, falla el reporte entero y no muestra una ganancia inflada", async () => {
    respuestas();
    getGastos.mockRejectedValue(new Error("No se pudieron cargar los gastos"));
    request.mockResolvedValue(null);
    mostrar();

    expect(await screen.findByText("No se pudieron cargar los gastos")).toBeInTheDocument();
    expect(screen.queryByText(/ganancia líquida/i)).not.toBeInTheDocument();
  });

  it("los gastos del local abren su detalle: qué son, agrupados, con lo pagado y lo que falta", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    request.mockResolvedValue(null);
    mostrar();

    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    fireEvent.click(within(cascada).getByText("Gastos del local"));
    const detalle = await screen.findByRole("dialog");
    expect(within(detalle).getByText("Qué son los gastos del local")).toBeInTheDocument();
    expect(within(detalle).getByText(/paños, tacos, bolas/)).toBeInTheDocument();
    expect(within(detalle).getByText(`Pagado ${fmtMoney(50)}`)).toBeInTheDocument();
    expect(within(detalle).getByText(`Falta pagar ${fmtMoney(200)}`)).toBeInTheDocument();
  });

  it("tocar Ventas lleva al historial y le avisa a dónde volver", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    request.mockResolvedValue(null);
    mostrar();

    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    fireEvent.click(within(cascada).getByText("Ventas"));
    expect(await screen.findByText(/ahora en \/reportes\/ventas/)).toHaveTextContent('"volverA":"Estado de resultado"');
  });
});
