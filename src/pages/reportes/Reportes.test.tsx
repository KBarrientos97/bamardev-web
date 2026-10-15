import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La pantalla de Reportes (rediseño de oct-2026): qué reportes ve cada rubro,
 * el período que vale para todos y qué pasa cuando el backend rechaza uno por
 * el tope de ventas.
 */

const sesion = vi.hoisted(() => ({ rubro: "FARMACIA" as string, soloAgenda: false }));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () =>
      sesion.soloAgenda
        ? {
            // La recepción de un salón con los reportes de la agenda y sin el
            // permiso general (un rol armado por el negocio).
            rubro: sesion.rubro,
            incluye: () => true,
            puede: (s: string) => s === "reportes_agenda",
            usuario: { rol: "CAJERO", permisos: ["agenda.reportes"], permisosPropios: [], sucursalId: 917 },
            negocio: { id: 1, nombre: "Prueba", features: [] },
          }
        : {
            rubro: sesion.rubro,
            incluye: () => true,
            puede: (s: string) => !["reportes_billar", "reportes_agenda"].includes(s),
            usuario: { rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: 917 },
            negocio: { id: 1, nombre: "Prueba", features: [] },
          },
  };
});

vi.mock("../../lib/api", async (original) => {
  const real = await original<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      // Todo queda cargando salvo lo que cada test decida.
      reporte: vi.fn(() => new Promise(() => {})),
      getSucursales: vi.fn(async () => []),
      getGastos: vi.fn(() => new Promise(() => {})),
      mermas: vi.fn(() => new Promise(() => {})),
    },
    request: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock("../../lib/agenda/apiComisiones", () => ({
  apiComisiones: { reporteAgenda: vi.fn(() => new Promise(() => {})) },
}));

import Reportes from "./Reportes";
import { api } from "../../lib/api";

async function montar(ruta = "/reportes") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/reportes/*" element={<Reportes />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** El menú de la izquierda, por el texto de cada reporte. */
const enMenu = (titulo: string) =>
  Array.from(document.querySelectorAll('nav[aria-label="Reportes"] a')).find((a) => a.textContent?.trim() === titulo) ?? null;

beforeEach(() => {
  sesion.rubro = "FARMACIA";
  sesion.soloAgenda = false;
  sessionStorage.clear();
  vi.mocked(api.reporte).mockImplementation(() => new Promise(() => {}));
});

describe("cada rubro ve sus reportes en el menú", () => {
  it("la farmacia tiene sus vencimientos y su sugerencia de compra, cada uno en su dirección", async () => {
    await montar();
    expect(enMenu("Sugerencia de compra")?.getAttribute("href")).toBe("/reportes/sugerencia-compra");
    expect(enMenu("Vencimientos y mermas")?.getAttribute("href")).toBe("/reportes/mermas");
    expect(enMenu("Top medicamentos")).not.toBeNull();
  });

  it("el restaurante no los ve, y sigue con sus meseros y sus insumos", async () => {
    sesion.rubro = "RESTAURANTE";
    await montar();
    expect(enMenu("Sugerencia de compra")).toBeNull();
    expect(enMenu("Vencimientos y mermas")).toBeNull();
    expect(enMenu("Ventas por mesero")).not.toBeNull();
    expect(enMenu("Insumos")).not.toBeNull();
  });

  it("un reporte que este usuario no ve (un link viejo) vuelve al resumen", async () => {
    sesion.rubro = "RESTAURANTE";
    await montar("/reportes/mermas");
    expect(await screen.findByText("Lo más importante del período", { exact: false })).toBeInTheDocument();
  });
});

describe("el período vale para todos los reportes", () => {
  it("arranca en el mes en curso y dice contra qué compara cada flecha", async () => {
    await montar();
    expect(screen.getByRole("button", { name: "Mes" }).className).toContain("bg-primary-boton");
    expect(screen.getByText(/flechas comparadas con 1–\d+ de|flechas comparadas con el 1 de/)).toBeInTheDocument();
  });

  it("al elegir Semana compara contra la semana anterior", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    });
    expect(screen.getByText(/flechas comparadas con la semana anterior/)).toBeInTheDocument();
  });
});

/**
 * Tope de reportes: el backend rechaza con un mensaje pensado para el cliente
 * ("elegí un período más corto"). Se ve ese texto donde iba el reporte, con
 * Reintentar, y no un error genérico ni la pantalla rota.
 */
describe("un reporte rechazado por el tope", () => {
  const DEMASIADO_GRANDE = "Este período tiene 18.230 ventas y el máximo por reporte es 15.000. Elegí un período más corto.";

  it("si el rechazado es el resumen, el mensaje va en su lugar y el menú sigue", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.reporte).mockImplementation((nombre: string) =>
      nombre === "resumen" ? Promise.reject(new Error(DEMASIADO_GRANDE)) : new Promise(() => {}),
    );
    await montar();
    expect(await screen.findByText(DEMASIADO_GRANDE)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Reintentar" }).length).toBeGreaterThan(0);
    expect(enMenu("Top productos")).not.toBeNull();
  });

  it("al abrir un reporte rechazado se ve el mensaje del backend, con Reintentar", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.reporte).mockImplementation((nombre: string) =>
      nombre === "top-productos" ? Promise.reject(new Error(DEMASIADO_GRANDE)) : new Promise(() => {}),
    );
    await montar("/reportes/top-productos");
    expect(await screen.findByText(DEMASIADO_GRANDE)).toBeInTheDocument();
    expect(screen.queryByText(/Error 422/)).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

/**
 * El tope de 3 meses (regla del dueño, 13-oct-2026): ningún preset lo pasa y
 * el rango personalizado no deja aplicar más, con un mensaje que dice qué
 * hacer. El backend rechaza igual lo que pase (400 RANGO_DEMASIADO_LARGO).
 */
describe("el tope de 3 meses", () => {
  async function abrirPersonalizado() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));
    });
  }
  const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

  it("ya no hay \"Año\": el período más largo es 3 meses", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: "Año" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "3 meses" }));
    });
    expect(screen.getByText(/flechas comparadas con los 3 meses anteriores/)).toBeInTheDocument();
    await abrirPersonalizado();
    expect(screen.queryByRole("button", { name: "Año" })).toBeNull();
    expect(screen.getByRole("button", { name: "Últimos 3 meses" })).toBeInTheDocument();
  });

  it("un rango a mano de más de 3 meses no se aplica y dice por qué", async () => {
    await montar();
    await abrirPersonalizado();
    escribir("Desde", "2026-06-01");
    escribir("Hasta", "2026-09-30");
    expect(screen.getByRole("alert")).toHaveTextContent("Un reporte puede abarcar hasta 3 meses (92 días). Acortá el rango. Elegiste 122 días.");
    expect(screen.getByRole("button", { name: "Aplicar rango" })).toBeDisabled();
  });

  it("de julio a septiembre entero (92 días) sí se aplica", async () => {
    await montar();
    await abrirPersonalizado();
    escribir("Desde", "2026-07-01");
    escribir("Hasta", "2026-09-30");
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aplicar rango" }));
    });
    expect(screen.getByRole("button", { name: /01\/07 – 30\/09\/2026/ })).toBeInTheDocument();
  });

  it("el calendario no ofrece días fuera de los 3 meses", async () => {
    await montar();
    await abrirPersonalizado();
    escribir("Desde", "2026-07-01");
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("max", "2026-09-30");
    escribir("Hasta", "2026-09-30");
    expect(screen.getByLabelText("Desde")).toHaveAttribute("min", "2026-07-01");
  });

  it("un período largo guardado de antes (o un \"Año\") no se reabre: arranca en el mes", async () => {
    sessionStorage.setItem("bamardev_reportes_periodo", JSON.stringify({ preset: "rango", desde: "2025-01-01", hasta: "2025-12-31" }));
    await montar();
    expect(screen.getByRole("button", { name: "Mes" }).className).toContain("bg-primary-boton");
    sessionStorage.setItem("bamardev_reportes_periodo", JSON.stringify({ preset: "anio", desde: "2026-01-01", hasta: "2026-10-13" }));
    await montar();
    expect(screen.getAllByRole("button", { name: "Mes" }).at(-1)!.className).toContain("bg-primary-boton");
  });
});

/**
 * Reportes es la única pantalla de reportes: también entra quien sólo tiene
 * los de la agenda (la recepción). Ve sus reportes y nada más.
 */
describe("quien sólo ve los reportes de la agenda", () => {
  beforeEach(() => {
    sesion.rubro = "BARBERIA";
    sesion.soloAgenda = true;
  });

  it("ve el grupo de la agenda, sin Resumen ni los de ventas", async () => {
    await montar("/reportes/profesionales");
    expect(enMenu("Producción por profesional")?.getAttribute("href")).toBe("/reportes/profesionales");
    expect(enMenu("Asistencia")).not.toBeNull();
    expect(enMenu("Resumen")).toBeNull();
    expect(enMenu("Ventas")).toBeNull();
    expect(enMenu("Top productos")).toBeNull();
    expect(screen.queryByRole("button", { name: /Enviar resumen/ })).toBeNull();
  });

  it("la portada de Reportes lo lleva a su primer reporte, no a un Resumen que no puede leer", async () => {
    vi.mocked(api.reporte).mockClear();
    await montar("/reportes");
    expect(await screen.findByRole("heading", { name: "Producción por profesional" })).toBeInTheDocument();
    expect(api.reporte).not.toHaveBeenCalledWith("resumen", expect.anything(), expect.anything());
  });
});

/**
 * Un reporte abierto desde otro (el Estado de resultado lleva a Ventas, a
 * Compras…) vuelve a ése con la flecha, como en la app. Antes volvía siempre
 * al resumen y el dueño tenía que buscar de nuevo el resultado que miraba.
 */
describe("la flecha de volver", () => {
  it("abierto desde el estado de resultado, vuelve a él", async () => {
    render(
      <MemoryRouter initialEntries={["/reportes/resultado", { pathname: "/reportes/equilibrio", state: { volverA: "Estado de resultado" } }]} initialIndex={1}>
        <Routes>
          <Route path="/reportes/*" element={<Reportes />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    const flecha = screen.getByRole("button", { name: "Volver a Estado de resultado" });
    fireEvent.click(flecha);
    await act(async () => {});
    expect(await screen.findByRole("heading", { name: "Estado de resultado" })).toBeInTheDocument();
  });

  it("abierto desde el menú, vuelve al resumen como siempre", async () => {
    await montar("/reportes/equilibrio");
    expect(screen.getByRole("button", { name: "Volver al resumen" })).toBeInTheDocument();
  });
});
