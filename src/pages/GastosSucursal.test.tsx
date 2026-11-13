import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoriaGasto, Gasto, PlantillaGasto, ResumenGastos } from "../types";

/**
 * La sucursal en los gastos (PLAN-SUCURSAL-TOTAL §1 y §3 etapa 4):
 *
 * - UN local, o un usuario atado a uno: la pantalla queda como siempre. Sin
 *   selector en el formulario, sin filtro, sin etiqueta.
 * - Organización con 2+ locales: el formulario deja elegir el local o «General
 *   del negocio» (sin local, `sucursalId: null` explícito), el filtro suma esa
 *   opción (`sinSucursal=true`) y con UN local elegido una nota avisa lo que
 *   las cifras no incluyen.
 */

vi.setConfig({ testTimeout: 60_000 });

const sesion = vi.hoisted(() => ({
  /** null = organización; con valor, el usuario está atado a ese local. */
  sucursalId: null as number | null,
  sucursal: undefined as string | undefined,
  /** Lo que sabe un usuario atado de cuántos locales hay (login). */
  negocio: undefined as { sucursalesActivas: number } | undefined,
}));

vi.mock("../store/AuthContext", async () => {
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      usuario: {
        rol: "ADMIN",
        ...permisosDe("ADMIN"),
        sucursalId: sesion.sucursalId,
        sucursal: sesion.sucursal,
      },
      negocio: sesion.negocio,
      rubro: "RESTAURANTE",
    }),
  };
});

vi.mock("../lib/api", () => ({
  api: {
    getResumenGastos: vi.fn(),
    getGastos: vi.fn(),
    getCategoriasGasto: vi.fn(),
    getSucursales: vi.fn(),
    getPlantillasGasto: vi.fn(),
    crearGasto: vi.fn(),
    actualizarGasto: vi.fn(),
    crearPlantillaGasto: vi.fn(),
    actualizarPlantillaGasto: vi.fn(),
  },
}));

import { api } from "../lib/api";
import GastosFarmacia from "./farmacia/GastosFarmacia";
import Gastos from "./Gastos";
import GastosFijos from "./GastosFijos";

const CENTRAL = { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true };
const NORTE = { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false };
const DOS = [CENTRAL, NORTE];

const catalogo: CategoriaGasto[] = [
  { codigo: "ALQUILER", nombre: "Alquiler", propia: false, tipoCosto: "FIJO" },
  { codigo: "LUZ", nombre: "Luz", propia: false, tipoCosto: "FIJO" },
];

const luz: Gasto = {
  id: 2,
  concepto: "Luz Norte",
  categoria: "LUZ",
  categoriaNombre: "Luz",
  tipoCosto: "FIJO",
  monto: 420,
  pagado: 0,
  saldo: 420,
  estado: "PENDIENTE",
  fecha: "2026-09-12",
  fechaVencimiento: null,
  vencido: false,
  diasAtraso: 0,
  diasParaVencer: 0,
  metodoPago: null,
  beneficiario: null,
  nota: null,
  sucursalId: 2,
  sucursal: "Norte",
  recurrente: false,
  numeroFactura: null,
  nit: null,
};

const contador: Gasto = {
  ...luz,
  id: 3,
  concepto: "Contador",
  categoria: "ALQUILER",
  categoriaNombre: "Alquiler",
  sucursalId: null,
  sucursal: null,
};

const resumen: ResumenGastos = {
  total: 420,
  pagado: 0,
  pendiente: 420,
  vencido: 0,
  cantidad: 1,
  cantidadPendientes: 1,
  cantidadVencidos: 0,
  cantidadPagados: 0,
  ventasPeriodo: 8000,
};

const regla: PlantillaGasto = {
  id: 1,
  concepto: "Alquiler de la oficina",
  categoria: "ALQUILER",
  categoriaNombre: "Alquiler",
  frecuencia: "MENSUAL",
  diaDelMes: 1,
  monto: 3500,
  activa: true,
  motivoPausa: null,
  beneficiario: null,
  nota: null,
  sucursalId: null,
  sucursal: null,
  proximaCarga: "2026-12-01",
  ultimaCarga: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  sesion.sucursal = undefined;
  sesion.negocio = undefined;
  vi.mocked(api.getSucursales).mockResolvedValue(DOS as never);
  vi.mocked(api.getResumenGastos).mockResolvedValue(resumen);
  vi.mocked(api.getGastos).mockResolvedValue([luz]);
  vi.mocked(api.getCategoriasGasto).mockResolvedValue(catalogo);
  vi.mocked(api.getPlantillasGasto).mockResolvedValue([regla]);
  vi.mocked(api.crearGasto).mockResolvedValue(luz);
  vi.mocked(api.actualizarGasto).mockResolvedValue(luz);
  vi.mocked(api.crearPlantillaGasto).mockResolvedValue(regla);
  vi.mocked(api.actualizarPlantillaGasto).mockResolvedValue(regla);
});

function abrir(pantalla: React.ReactNode) {
  render(<MemoryRouter>{pantalla}</MemoryRouter>);
}

async function tocar(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

/** El campo «Sucursal» de un formulario (su etiqueta lleva una ayuda, por eso la regexp). */
const campoSucursal = (form: HTMLElement) => within(form).queryByRole("combobox", { name: /^Sucursal/ });

/** El filtro de la pantalla. */
const filtro = () => screen.queryByLabelText("Sucursal") as HTMLSelectElement | null;

async function elegirFiltro(valor: string) {
  await act(async () => {
    fireEvent.change(filtro()!, { target: { value: valor } });
  });
}

async function nuevoGasto() {
  await tocar(screen.getByRole("button", { name: /Nuevo gasto/ }));
  return screen.getByRole("dialog", { name: "Nuevo gasto" });
}

/** Llena lo mínimo y guarda. */
async function guardarGasto(form: HTMLElement) {
  fireEvent.change(within(form).getByLabelText("Concepto"), { target: { value: "Internet" } });
  fireEvent.change(within(form).getByLabelText("Categoría"), { target: { value: "LUZ" } });
  fireEvent.change(within(form).getByLabelText("Monto (Bs)"), { target: { value: "100" } });
  await tocar(within(form).getByRole("button", { name: "Guardar" }));
}

describe("Gastos: el campo Sucursal del formulario", () => {
  it("con un solo local no existe, y el gasto se manda sin local como siempre", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([CENTRAL] as never);
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    const form = await nuevoGasto();
    expect(campoSucursal(form)).not.toBeInTheDocument();
    await guardarGasto(form);
    const [cuerpo] = vi.mocked(api.crearGasto).mock.calls[0];
    expect(cuerpo).toHaveProperty("sucursalId", null);
  });

  it("el usuario atado a un local no lo ve ni pide la lista de locales", async () => {
    sesion.sucursalId = 2;
    sesion.sucursal = "Norte";
    sesion.negocio = { sucursalesActivas: 2 };
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    expect(filtro()).not.toBeInTheDocument();
    const form = await nuevoGasto();
    expect(campoSucursal(form)).not.toBeInTheDocument();
    expect(api.getSucursales).not.toHaveBeenCalled();
  });

  it("la organización con 2+ locales lo ve, con los locales y «General del negocio»", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    const form = await nuevoGasto();
    const campo = campoSucursal(form)!;
    expect(campo).toBeInTheDocument();
    expect(within(campo).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Central",
      "Norte",
      "General del negocio",
    ]);
  });

  it("sin filtro arranca en la sucursal sugerida (la principal)", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    const form = await nuevoGasto();
    expect(campoSucursal(form)).toHaveDisplayValue("Central");
    await guardarGasto(form);
    expect(vi.mocked(api.crearGasto).mock.calls[0][0]).toHaveProperty("sucursalId", 1);
  });

  it("con un local filtrado arranca en ese local", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    await elegirFiltro("2");
    const form = await nuevoGasto();
    expect(campoSucursal(form)).toHaveDisplayValue("Norte");
    await guardarGasto(form);
    expect(vi.mocked(api.crearGasto).mock.calls[0][0]).toHaveProperty("sucursalId", 2);
  });

  it("«General del negocio» manda sucursalId: null EXPLÍCITO, no lo omite", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    const form = await nuevoGasto();
    fireEvent.change(campoSucursal(form)!, { target: { value: "" } });
    await guardarGasto(form);
    const [cuerpo] = vi.mocked(api.crearGasto).mock.calls[0];
    expect(Object.prototype.hasOwnProperty.call(cuerpo, "sucursalId")).toBe(true);
    expect(cuerpo.sucursalId).toBeNull();
    // Y viaja como null en el JSON (si fuera undefined se perdería).
    expect(JSON.parse(JSON.stringify(cuerpo)).sucursalId).toBeNull();
  });

  it("mirando «General del negocio», el gasto nuevo nace general", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    await elegirFiltro("general");
    const form = await nuevoGasto();
    expect(campoSucursal(form)).toHaveDisplayValue("General del negocio");
    await guardarGasto(form);
    expect(vi.mocked(api.crearGasto).mock.calls[0][0]).toHaveProperty("sucursalId", null);
  });

  it("al editar arranca en el local del gasto y se puede reasignar", async () => {
    abrir(<Gastos />);
    await tocar(within((await screen.findByText("Luz Norte")).closest("li")!).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar gasto" });
    expect(campoSucursal(form)).toHaveDisplayValue("Norte");
    fireEvent.change(campoSucursal(form)!, { target: { value: "1" } });
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
    expect(api.actualizarGasto).toHaveBeenCalledWith(2, expect.objectContaining({ sucursalId: 1 }));
  });

  it("editar un gasto general lo conserva general y manda null explícito", async () => {
    vi.mocked(api.getGastos).mockResolvedValue([contador]);
    abrir(<Gastos />);
    await tocar(within((await screen.findByText("Contador")).closest("li")!).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar gasto" });
    expect(campoSucursal(form)).toHaveDisplayValue("General del negocio");
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
    const [id, cuerpo] = vi.mocked(api.actualizarGasto).mock.calls[0];
    expect(id).toBe(3);
    expect(cuerpo).toHaveProperty("sucursalId", null);
  });
});

describe("Gastos: el filtro «General del negocio» y la nota de lo que no incluye", () => {
  it("con un solo local no hay filtro", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([CENTRAL] as never);
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    expect(filtro()).not.toBeInTheDocument();
  });

  it("el filtro suma «General del negocio» a «Todas» y a cada local", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    expect(within(filtro()!).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todas las sucursales",
      "Central",
      "Norte",
      "General del negocio",
    ]);
  });

  it("elegirlo pide sinSucursal al resumen, a la lista y a las reglas que se vienen", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    // Sin elegirlo, nada nuevo viaja.
    expect(vi.mocked(api.getGastos).mock.calls[0][0].sinSucursal).toBeFalsy();
    await elegirFiltro("general");
    expect(api.getGastos).toHaveBeenLastCalledWith(expect.objectContaining({ sinSucursal: true, sucursalId: null }));
    expect(api.getResumenGastos).toHaveBeenLastCalledWith(
      expect.objectContaining({ sinSucursal: true, sucursalId: null }),
    );
    expect(api.getPlantillasGasto).toHaveBeenLastCalledWith(null, true);
  });

  it("volver a un local o a «Todas» apaga el filtro general", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    await elegirFiltro("general");
    await elegirFiltro("1");
    expect(api.getGastos).toHaveBeenLastCalledWith(expect.objectContaining({ sinSucursal: false, sucursalId: 1 }));
    await elegirFiltro("");
    expect(api.getGastos).toHaveBeenLastCalledWith(expect.objectContaining({ sinSucursal: false, sucursalId: null }));
  });

  it("con UN local elegido y generales en el período, la nota dice cuánto no incluye", async () => {
    vi.mocked(api.getResumenGastos).mockResolvedValue({ ...resumen, generales: { total: 80, cantidad: 1 } });
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    // Con todas, las cifras ya incluyen lo general: no hay nada que avisar.
    expect(screen.queryByText(/No incluye gastos generales/)).not.toBeInTheDocument();
    await elegirFiltro("2");
    expect(await screen.findByText("No incluye gastos generales del negocio (Bs 80,00)")).toBeInTheDocument();
    // Mirando lo general, tampoco.
    await elegirFiltro("general");
    expect(screen.queryByText(/No incluye gastos generales/)).not.toBeInTheDocument();
  });

  it("sin gastos generales (o con un backend que no manda el dato) no hay nota", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    await elegirFiltro("2");
    expect(screen.queryByText(/No incluye gastos generales/)).not.toBeInTheDocument();
    vi.mocked(api.getResumenGastos).mockResolvedValue({ ...resumen, generales: { total: 0, cantidad: 0 } });
    await elegirFiltro("1");
    expect(screen.queryByText(/No incluye gastos generales/)).not.toBeInTheDocument();
  });

  it("«Sobre las ventas» aclara que, para lo general, las ventas son las de todo el negocio", async () => {
    abrir(<Gastos />);
    await screen.findByText("Luz Norte");
    expect(screen.getByText(/^Ventas Bs/)).toBeInTheDocument();
    await elegirFiltro("general");
    expect(await screen.findByText(/^Ventas de todo el negocio Bs/)).toBeInTheDocument();
  });
});

describe("Gastos automáticos: la sucursal de la regla", () => {
  const nuevaRegla = async () => {
    await screen.findByText("Alquiler de la oficina");
    await tocar(screen.getByRole("button", { name: /Nuevo gasto automático/ }));
    return screen.getByRole("dialog", { name: "Nuevo gasto automático" });
  };

  async function guardarRegla(form: HTMLElement) {
    fireEvent.change(within(form).getByLabelText("Concepto"), { target: { value: "Internet" } });
    fireEvent.change(within(form).getByLabelText("Categoría"), { target: { value: "LUZ" } });
    fireEvent.change(within(form).getByLabelText("Monto (Bs)"), { target: { value: "100" } });
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
  }

  it("con un solo local no hay filtro, ni ayuda, ni campo en el formulario", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([CENTRAL] as never);
    abrir(<GastosFijos />);
    const form = await nuevaRegla();
    expect(filtro()).not.toBeInTheDocument();
    expect(screen.queryByText(/nace con la sucursal de su regla/)).not.toBeInTheDocument();
    expect(campoSucursal(form)).not.toBeInTheDocument();
    await guardarRegla(form);
    expect(vi.mocked(api.crearPlantillaGasto).mock.calls[0][0]).toHaveProperty("sucursalId", null);
  });

  it("la organización con 2+ locales filtra las reglas y lee que el gasto nace con la sucursal de su regla", async () => {
    abrir(<GastosFijos />);
    await screen.findByText("Alquiler de la oficina");
    expect(screen.getByText(/nace con la sucursal de su regla/)).toBeInTheDocument();
    expect(within(filtro()!).getAllByRole("option").map((o) => o.textContent)).toContain("General del negocio");
    await elegirFiltro("general");
    expect(api.getPlantillasGasto).toHaveBeenLastCalledWith(null, true);
    await elegirFiltro("2");
    expect(api.getPlantillasGasto).toHaveBeenLastCalledWith(2, false);
  });

  it("el formulario arranca en la sucursal sugerida y deja elegir «General del negocio» (null explícito)", async () => {
    abrir(<GastosFijos />);
    const form = await nuevaRegla();
    expect(campoSucursal(form)).toHaveDisplayValue("Central");
    fireEvent.change(campoSucursal(form)!, { target: { value: "" } });
    await guardarRegla(form);
    const [cuerpo] = vi.mocked(api.crearPlantillaGasto).mock.calls[0];
    expect(Object.prototype.hasOwnProperty.call(cuerpo, "sucursalId")).toBe(true);
    expect(cuerpo.sucursalId).toBeNull();
  });

  it("con un local filtrado la regla nueva nace en él", async () => {
    abrir(<GastosFijos />);
    await screen.findByText("Alquiler de la oficina");
    await elegirFiltro("2");
    await tocar(screen.getByRole("button", { name: /Nuevo gasto automático/ }));
    const form = screen.getByRole("dialog", { name: "Nuevo gasto automático" });
    expect(campoSucursal(form)).toHaveDisplayValue("Norte");
    await guardarRegla(form);
    expect(vi.mocked(api.crearPlantillaGasto).mock.calls[0][0]).toHaveProperty("sucursalId", 2);
  });

  it("al editar una regla general sigue general y se puede pasar a un local", async () => {
    abrir(<GastosFijos />);
    await tocar(
      within((await screen.findByText("Alquiler de la oficina")).closest("li")!).getByRole("button", {
        name: "Editar",
      }),
    );
    const form = screen.getByRole("dialog", { name: "Editar gasto automático" });
    expect(campoSucursal(form)).toHaveDisplayValue("General del negocio");
    fireEvent.change(campoSucursal(form)!, { target: { value: "2" } });
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
    expect(api.actualizarPlantillaGasto).toHaveBeenCalledWith(1, expect.objectContaining({ sucursalId: 2 }));
  });
});

describe("Gastos de la farmacia: el mismo selector y filtro, y el local en cada fila", () => {
  it("con gastos de dos locales cada fila dice el suyo; el general no dice nada", async () => {
    vi.mocked(api.getGastos).mockResolvedValue([luz, { ...luz, id: 4, concepto: "Luz Central", sucursalId: 1, sucursal: "Central" }, contador]);
    abrir(<GastosFarmacia />);
    const norte = (await screen.findByText("Luz Norte")).closest("button")!;
    expect(norte).toHaveTextContent("Norte");
    expect(screen.getByText("Luz Central").closest("button")).toHaveTextContent("· Central");
    expect(screen.getByText("Contador").closest("button")).not.toHaveTextContent(/Norte|Central/);
  });

  it("si todos son del mismo local no se repite", async () => {
    vi.mocked(api.getGastos).mockResolvedValue([luz, { ...luz, id: 4, concepto: "Agua Norte" }]);
    abrir(<GastosFarmacia />);
    const fila = (await screen.findByText("Luz Norte")).closest("button")!;
    expect(fila.textContent!.replace("Luz Norte", "")).not.toContain("Norte");
  });

  it("el filtro suma «General del negocio» y pide sinSucursal", async () => {
    abrir(<GastosFarmacia />);
    await screen.findByText("Luz Norte");
    const select = screen.getByLabelText("Sucursal") as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toContain("General del negocio");
    await act(async () => {
      fireEvent.change(select, { target: { value: "general" } });
    });
    expect(api.getGastos).toHaveBeenLastCalledWith(expect.objectContaining({ sinSucursal: true }));
    expect(api.getPlantillasGasto).toHaveBeenLastCalledWith(null, true);
  });

  it("el formulario compartido trae el campo Sucursal y la nota de lo que no incluye", async () => {
    vi.mocked(api.getResumenGastos).mockResolvedValue({ ...resumen, generales: { total: 80, cantidad: 1 } });
    abrir(<GastosFarmacia />);
    await screen.findByText("Luz Norte");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: "2" } });
    });
    expect(await screen.findByText("No incluye gastos generales del negocio (Bs 80,00)")).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Nuevo gasto/ }));
    const form = screen.getByRole("dialog", { name: "Nuevo gasto" });
    expect(campoSucursal(form)).toHaveDisplayValue("Norte");
  });
});
