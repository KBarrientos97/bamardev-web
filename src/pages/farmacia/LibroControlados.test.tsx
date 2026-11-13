import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsientoControlado } from "../../types";

/**
 * El libro de controlados: lo que la farmacia presenta al SEDES. Se lee por
 * libro (psicotrópicos o estupefacientes) y por período, y una venta anulada
 * sigue ahí, marcada.
 */

// Quién mira: por defecto un usuario de un local en un negocio de un local.
const sesion = vi.hoisted(() => ({
  sucursalId: 917 as number | null,
  sucursal: "Sucursal Centro" as string | null,
  activas: undefined as number | undefined,
}));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Farmacia San Rafael", sucursalesActivas: sesion.activas },
      usuario: {
        id: 1,
        rol: "ADMIN",
        ...permisosDe("ADMIN"),
        nombre: "Marcela Quiroga",
        sucursalId: sesion.sucursalId,
        sucursal: sesion.sucursal,
      },
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: { libroControlados: vi.fn(), getSucursales: vi.fn(async () => []) },
}));

import { api } from "../../lib/api";
import LibroControlados from "./LibroControlados";

function asiento(over: Partial<AsientoControlado>): AsientoControlado {
  return {
    id: 1,
    fecha: "2026-09-28T14:30:00.000Z",
    ventaId: 50,
    comprobante: "V-000012",
    producto: { id: 14, nombre: "Clonazepam 2 mg", principioActivo: "Clonazepam", concentracion: "2 mg" },
    condicionVenta: "RECETA_ARCHIVADA",
    controlado: true,
    cantidad: 10,
    pacienteNombre: "Juan Pérez",
    pacienteDocumento: "4567890 LP",
    medicoNombre: "Dra. Ana Rojas",
    medicoMatricula: "R-1234",
    recetaNumero: null,
    recetaFecha: "2026-09-27T00:00:00.000Z",
    almacen: { id: 917, nombre: "Sucursal Centro" },
    despachadoPor: { id: 3, nombre: "Regente" },
    anuladaEn: null,
    ...over,
  };
}

async function montar() {
  render(<LibroControlados />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = 917;
  sesion.sucursal = "Sucursal Centro";
  sesion.activas = undefined;
  vi.mocked(api.libroControlados).mockResolvedValue([
    asiento({}),
    asiento({
      id: 2,
      ventaId: 51,
      producto: { id: 20, nombre: "Morfina 10 mg", principioActivo: "Morfina", concentracion: "10 mg" },
      condicionVenta: "RECETA_VALORADA",
      recetaNumero: "V-000981",
      anuladaEn: "2026-09-28T16:00:00.000Z",
    }),
  ]);
});

describe("el libro", () => {
  it("cada asiento dice paciente, médico, receta y quién lo despachó", async () => {
    await montar();
    const tabla = screen.getByRole("table");
    const fila = within(tabla).getByText("Clonazepam 2 mg").closest("tr")!;
    expect(fila).toHaveTextContent("Juan Pérez (CI 4567890 LP)");
    expect(fila).toHaveTextContent("Dra. Ana Rojas · Mat. R-1234");
    expect(fila).toHaveTextContent("27/09/2026");
    expect(fila).toHaveTextContent("Regente");
    expect(fila).toHaveTextContent("V-000012");
  });

  it("una venta anulada sigue en el libro, marcada", async () => {
    await montar();
    const fila = within(screen.getByRole("table")).getByText("Morfina 10 mg").closest("tr")!;
    expect(within(fila).getByText("Anulada")).toBeInTheDocument();
    expect(fila).toHaveTextContent("N° V-000981");
    expect(screen.getByText(/2 asientos · 1 de ventas anuladas/)).toBeInTheDocument();
  });

  it("arranca en el mes y se filtra por libro", async () => {
    await montar();
    expect(api.libroControlados).toHaveBeenLastCalledWith(
      expect.objectContaining({ libro: null, almacenId: null }),
    );
    const primero = vi.mocked(api.libroControlados).mock.calls[0][0];
    expect(primero.desde).toMatch(/^\d{4}-\d{2}-01$/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Estupefacientes" }));
    });
    expect(api.libroControlados).toHaveBeenLastCalledWith(
      expect.objectContaining({ libro: "ESTUPEFACIENTES" }),
    );
  });

  it("sin ventas de controlados en el período, lo dice", async () => {
    vi.mocked(api.libroControlados).mockResolvedValue([]);
    await montar();
    expect(screen.getByText("No hay ventas de controlados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar a Excel/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeDisabled();
  });
});

describe("el impreso", () => {
  it("Imprimir manda al papel el libro con la farmacia, la sucursal y quién lo imprime", async () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    await montar();
    // En pantalla no se ve; es lo único que sale al imprimir.
    const papel = document.querySelector<HTMLElement>(".libro-impreso")!;
    expect(papel).toHaveClass("hidden");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Imprimir/ }));
    });
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(papel).toHaveTextContent("Farmacia San Rafael");
    expect(papel).toHaveTextContent("Libro de controlados");
    // Quien entró atado a una sucursal imprime el libro de la suya.
    expect(papel).toHaveTextContent("Sucursal: Sucursal Centro");
    expect(papel).toHaveTextContent("por Marcela Quiroga");
    expect(papel).toHaveTextContent("ANULADA");
    imprimir.mockRestore();
  });

  it("filtrado por libro, el papel dice cuál es", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Estupefacientes" }));
    });
    expect(document.querySelector(".libro-impreso")).toHaveTextContent("Libro de Estupefacientes");
  });
});

describe("la sucursal en el libro (PLAN-SUCURSAL-TOTAL)", () => {
  const dosLocales = [
    { id: 917, nombre: "Sucursal Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    { id: 918, nombre: "Sucursal Equipetrol", activo: true, tipo: "SUCURSAL", esPrincipal: false },
  ];
  const deEquipetrol = (id: number, ventaId: number) =>
    asiento({ id, ventaId, almacen: { id: 918, nombre: "Sucursal Equipetrol" } });

  /** Baja la planilla y devuelve su texto y el nombre del archivo. */
  async function bajar() {
    const bajado: { planilla?: Blob; archivo?: string } = {};
    const original = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      bajado.planilla = b as Blob;
      return "blob:planilla";
    });
    URL.revokeObjectURL = vi.fn();
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        bajado.archivo = this.download;
      });
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Exportar a Excel/ }));
      });
      return { texto: await bajado.planilla!.text(), archivo: bajado.archivo ?? "" };
    } finally {
      URL.createObjectURL = original.crear;
      URL.revokeObjectURL = original.revocar;
      clic.mockRestore();
    }
  }

  function comoOrganizacion() {
    sesion.sucursalId = null;
    sesion.sucursal = null;
    sesion.activas = 2;
    vi.mocked(api.getSucursales).mockResolvedValue(dosLocales as never);
    vi.mocked(api.libroControlados).mockResolvedValue([
      asiento({ id: 1 }),
      deEquipetrol(2, 51),
      asiento({ id: 3, ventaId: 52 }),
    ]);
  }

  it("con 'Todas' y 2+ locales no se puede imprimir: pide elegir una sucursal, sin armar el papel", async () => {
    comoOrganizacion();
    await montar();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeDisabled();
    expect(screen.getByText(/Para imprimir elegí una sucursal/)).toBeInTheDocument();
    expect(document.querySelector(".libro-impreso")).toBeNull();
  });

  it("elegida una sucursal, se imprime su libro con su nombre en el encabezado", async () => {
    comoOrganizacion();
    await montar();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Sucursal Equipetrol" }));
    });
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeEnabled();
    expect(screen.queryByText(/Para imprimir elegí una sucursal/)).toBeNull();
    expect(document.querySelector(".libro-impreso")).toHaveTextContent("Sucursal: Sucursal Equipetrol");
  });

  it("el Excel consolidado numera cada local en su libro y dice de cuál es en el archivo", async () => {
    comoOrganizacion();
    await montar();
    const { texto, archivo } = await bajar();
    const lineas = texto.split("\r\n");
    // Centro 1, Equipetrol 1, Centro 2: cada local empieza en 1.
    expect(lineas[1].startsWith('"1";')).toBe(true);
    expect(lineas[2].startsWith('"1";')).toBe(true);
    expect(lineas[3].startsWith('"2";')).toBe(true);
    expect(archivo).toMatch(/^libro-de-controlados-todas-las-sucursales-/);
  });

  it("el atado a un local con 2+ locales lee su sede, sin selector, y su libro la lleva", async () => {
    sesion.activas = 2;
    await montar();
    expect(screen.getByText(/Se llena solo al cobrar\. · Sucursal Centro/)).toBeInTheDocument();
    expect(screen.queryByText(/Para imprimir elegí una sucursal/)).toBeNull();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeEnabled();
    expect(document.querySelector(".libro-impreso")).toHaveTextContent("Sucursal: Sucursal Centro");
    expect(api.getSucursales).not.toHaveBeenCalled();
  });

  it("con un solo local el Excel y el papel quedan como siempre: sin nombre en el archivo", async () => {
    await montar();
    const { archivo } = await bajar();
    expect(archivo).toMatch(/^libro-de-controlados-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
