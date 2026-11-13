import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextoReporte, type DatosReporte, type SucursalDeArchivo } from "./contexto";
import EnviarResumen from "./EnviarResumen";

/**
 * «Enviar resumen» dice de qué sucursal es el texto (PLAN-SUCURSAL-TOTAL §3
 * etapa 6): la elegida, «Todas las sucursales» en el consolidado de una
 * organización con 2+ locales y la sede del usuario asignado. Con un solo local
 * el encabezado es el de siempre.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Pollos Don Omar" }, rubro: "RESTAURANTE" }),
}));

vi.mock("./vistas/resumen/useResumen", () => ({
  useDatosResumen: () => ({
    resumen: {
      datos: { ventas: 500, ventasDeltaPct: null, composicion: null, porCobrar: null },
      error: "",
      recargar: () => {},
    },
    billar: null,
    meseros: null,
    agenda: null,
    mermas: null,
    metodos: null,
    creditos: null,
    er: null,
  }),
}));

function mostrar(sucursalArchivo: SucursalDeArchivo | null, sucursalNombre = "") {
  const datos: DatosReporte = {
    periodo: { preset: "mes", desde: "2026-11-01", hasta: "2026-11-30" },
    comparacion: { desde: "2026-10-02", hasta: "2026-10-31", contra: "octubre", leyenda: "Período anterior" },
    rango: { desde: "2026-11-01", hasta: "2026-11-30" },
    rangoAnterior: { desde: "2026-10-02", hasta: "2026-10-31" },
    sucursalNombre,
    sucursalArchivo,
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <ContextoReporte.Provider value={datos}>
      <EnviarResumen onCerrar={() => {}} />
    </ContextoReporte.Provider>,
  );
}

const encabezado = () => document.querySelector("pre")?.textContent?.split("\n")[0];

describe("el texto del resumen dice de qué sucursal es", () => {
  it("el consolidado de una organización con 2+ locales dice «Todas las sucursales»", () => {
    mostrar({ nombre: "Todas las sucursales", rotulo: "Sucursal" });
    expect(encabezado()).toBe("Pollos Don Omar · Todas las sucursales");
  });

  it("con un local elegido dice cuál", () => {
    mostrar({ nombre: "Norte", rotulo: "Sucursal" }, "Norte");
    expect(encabezado()).toBe("Pollos Don Omar · Norte");
  });

  it("el asignado a una sede lleva el nombre de la suya", () => {
    mostrar({ nombre: "Sucursal Norte", rotulo: "Sucursal" });
    expect(encabezado()).toBe("Pollos Don Omar · Sucursal Norte");
  });

  it("con un solo local el encabezado es el de siempre", () => {
    mostrar(null);
    expect(encabezado()).toBe("Pollos Don Omar");
    expect(screen.queryByText(/Todas las sucursales/)).toBeNull();
  });
});
