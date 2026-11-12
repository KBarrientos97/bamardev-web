import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * La ficha del catálogo (la que abre Artículos en una farmacia) le muestra a
 * cada quien lo que puede usar.
 *
 * B6 (11-nov): Costo, Margen e Historial de costos salían sin `costos.ver`
 * —el backend quita el campo y se leía "Costo Bs 0,00 · Margen 100%" como si
 * fuera un dato— y Editar/Eliminar salían sin administrar el catálogo, con su
 * 403 al tocarlos. Y #17: desde la ficha se anota el encargo.
 */

const sesion = vi.hoisted(() => ({
  permisos: ["costos.ver"] as string[],
  secciones: ["productos", "encargos"] as string[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    puede: (s: string) => sesion.secciones.includes(s),
    incluye: () => true,
    usuario: { rol: "ADMIN", sucursalId: null, permisos: sesion.permisos, permisosPropios: [] },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    existenciasProducto: vi.fn(async () => []),
    lotesDeProducto: vi.fn(async () => []),
    ubicacionesUsadas: vi.fn(async () => []),
    buscarProductos: vi.fn(),
    crearEncargo: vi.fn(),
  },
}));

// Los equivalentes (#11): se mockea sólo la llamada, el panel es el de verdad.
vi.mock("./buscarEquivalentes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./buscarEquivalentes")>()),
  pedirEquivalentes: vi.fn(async () => []),
}));

import { api } from "../../lib/api";
import { pedirEquivalentes } from "./buscarEquivalentes";
import { FichaMedicamento } from "./FichaMedicamento";

const amoxicilina: Producto = {
  id: 1,
  nombre: "Amoxicilina 500 mg",
  descripcion: null,
  codBarra: "7790001",
  tipoProducto: "ALMACENABLE",
  precio: 1.3,
  costo: 0.42,
  stockMinimo: 10,
  habilitado: true,
  icono: null,
  categoria: null,
  unidadMedida: null,
  stockTotal: 240,
  componentes: [],
  principioActivo: "Amoxicilina",
  concentracion: "500 mg",
  formaFarmaceutica: "Cápsula",
  laboratorio: "BAGÓ",
  registroSanitario: "II-40233/2022",
  condicionVenta: "RECETA_MEDICA",
  manejaLote: true,
  controlado: false,
};

const acciones = {
  onClose: vi.fn(),
  onEditar: vi.fn(),
  onEliminar: vi.fn(),
  onRestaurar: vi.fn(),
};

async function abrir(over: Partial<Producto> = {}, enPapelera = false) {
  const { unmount } = render(
    <FichaMedicamento producto={{ ...amoxicilina, ...over }} enPapelera={enPapelera} {...acciones} />,
  );
  const ficha = screen.getByRole("dialog", { name: "Amoxicilina 500 mg" });
  // Se espera a que lleguen existencias y lotes: lo que se prueba es la ficha
  // ya armada, no la que está cargando.
  await within(ficha).findByText(/No queda saldo/);
  return { ficha, unmount };
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["costos.ver"];
  sesion.secciones = ["productos", "encargos"];
  vi.mocked(api.crearEncargo).mockResolvedValue({} as never);
});

describe("lo que ve el dueño", () => {
  it("costo, margen e historial, y edita o elimina", async () => {
    const { ficha } = await abrir();
    expect(within(ficha).getByText("Costo")).toBeInTheDocument();
    expect(ficha).toHaveTextContent("0,42");
    expect(within(ficha).getByText("Margen")).toBeInTheDocument();
    expect(ficha).toHaveTextContent("68%");
    expect(within(ficha).getByRole("button", { name: /Historial de costos/ })).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: /Eliminar/ })).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: /Editar/ })).toBeInTheDocument();
  });
});

describe("B6: lo que no le corresponde no se dibuja", () => {
  it("sin `costos.ver` no hay Costo, Margen ni Historial de costos", async () => {
    sesion.permisos = [];
    const { ficha } = await abrir();
    expect(within(ficha).queryByText("Costo")).toBeNull();
    expect(within(ficha).queryByText("Margen")).toBeNull();
    expect(ficha).not.toHaveTextContent("0,42");
    expect(within(ficha).queryByRole("button", { name: /Historial de costos/ })).toBeNull();
    // Lo demás sigue: el precio es del mostrador.
    expect(ficha).toHaveTextContent("1,30");
    expect(within(ficha).getByRole("button", { name: /Editar/ })).toBeInTheDocument();
  });

  it("con el permiso pero sin el costo en la respuesta, tampoco: no se inventa un Bs 0,00", async () => {
    // El backend lo quita (`ocultarCosto`) aunque el tipo diga `number`.
    const { ficha } = await abrir({ costo: undefined as unknown as number });
    expect(within(ficha).queryByText("Costo")).toBeNull();
    expect(within(ficha).queryByText("Margen")).toBeNull();
  });

  it("sin administrar el catálogo no hay Editar, Eliminar ni Restaurar", async () => {
    sesion.secciones = ["encargos"];
    const activo = await abrir();
    expect(within(activo.ficha).queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(within(activo.ficha).queryByRole("button", { name: /Eliminar/ })).toBeNull();
    activo.unmount();

    const { ficha } = await abrir({}, true);
    expect(within(ficha).queryByRole("button", { name: /Restaurar/ })).toBeNull();
  });
});

describe("#17: encargar desde la ficha", () => {
  async function tocar(el: HTMLElement) {
    await act(async () => {
      fireEvent.click(el);
    });
  }

  it("abre el alta con el medicamento puesto y, anotado, avisa en la ficha", async () => {
    const { ficha } = await abrir();
    await tocar(within(ficha).getByRole("button", { name: "Encargar" }));

    const alta = screen.getByRole("dialog", { name: "Nuevo encargo" });
    expect(within(alta).getByPlaceholderText(/La crema para la alergia/)).toHaveValue("Amoxicilina 500 mg");
    await tocar(within(alta).getByRole("button", { name: "Anotar" }));

    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: 1, descripcion: "Amoxicilina 500 mg" }),
    );
    expect(screen.queryByRole("dialog", { name: "Nuevo encargo" })).toBeNull();
    expect(ficha).toHaveTextContent("Encargo anotado");
  });

  it("sin `encargos` no hay botón", async () => {
    sesion.secciones = ["productos"];
    const { ficha } = await abrir();
    expect(within(ficha).queryByRole("button", { name: "Encargar" })).toBeNull();
  });
});

describe("#11: equivalentes", () => {
  it("lista los otros con la misma droga, con stock y precio, y sin Agregar: esta ficha no vende", async () => {
    vi.mocked(pedirEquivalentes).mockResolvedValue([
      { ...amoxicilina, id: 9, nombre: "Amoxicilina INTI", laboratorio: "INTI", precio: 0.9, stockTotal: 50 },
    ]);
    const { ficha } = await abrir();
    expect(within(ficha).getByText("Equivalentes")).toBeInTheDocument();
    expect(await within(ficha).findByText("Amoxicilina INTI")).toBeInTheDocument();
    // La del catálogo no tiene caja: el backend mira la sucursal de quien pregunta.
    expect(pedirEquivalentes).toHaveBeenCalledWith(1, null);
    expect(ficha).toHaveTextContent("0,90");
    expect(ficha).toHaveTextContent("50 u.");
    expect(within(ficha).queryByRole("button", { name: "Agregar a la venta" })).toBeNull();
  });

  it("sin principio activo no pide nada y dice que falta cargarlo", async () => {
    const { ficha } = await abrir({ principioActivo: null });
    expect(ficha).toHaveTextContent("Sin principio activo en la ficha");
    expect(pedirEquivalentes).not.toHaveBeenCalled();
  });
});
