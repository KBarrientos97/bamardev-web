import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api";
import type { Aula } from "../../../lib/academia/tipos";

/**
 * Las aulas de cada sede (BACK-5): la lista agrupada por sede, el alta, la
 * edición, la baja y la baja ofrecida cuando el aula está en uso.
 */

const quien = vi.hoisted(() => ({ configura: true, sedes: 2, deSede: false }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN } = await import("../../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...SESION_ADMIN,
      usuario: {
        ...SESION_ADMIN.usuario,
        sucursalId: quien.deSede ? 1 : null,
        sucursal: quien.deSede ? "Central" : null,
        permisos: quien.configura ? SESION_ADMIN.usuario.permisos : ["academia.ver"],
      },
      puede: () => true,
    }),
  };
});

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({
    sucursales: quien.deSede
      ? []
      : [
          { id: 1, nombre: "Central" },
          { id: 2, nombre: "Base" },
        ].slice(0, quien.sedes),
  }),
}));

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { aulas: vi.fn(), crearAula: vi.fn(), editarAula: vi.fn(), borrarAula: vi.fn() },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import Aulas from "./Aulas";

const aula = (id: number, nombre: string, extra: Partial<Aula> = {}): Aula => ({
  id,
  almacenId: 1,
  sede: { id: 1, nombre: "Central" },
  nombre,
  capacidad: null,
  activa: true,
  enUso: 0,
  ...extra,
});

const AULAS: Aula[] = [
  aula(1, "Aula 1", { capacidad: 25, enUso: 2 }),
  aula(2, "Laboratorio", { activa: false }),
  aula(3, "Aula B", { almacenId: 2, sede: { id: 2, nombre: "Base" } }),
];

beforeEach(() => {
  vi.clearAllMocks();
  quien.configura = true;
  quien.sedes = 2;
  quien.deSede = false;
  vi.mocked(apiAcademia.aulas).mockResolvedValue(AULAS);
});

async function montar(sedeId?: number) {
  render(
    <MemoryRouter>
      <Aulas sedeId={sedeId} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Aulas · la lista", () => {
  it("agrupa por sede y dice capacidad, cuántos grupos la usan y su estado", async () => {
    await montar();
    const central = screen.getByRole("region", { name: /^Central/ });
    const fila1 = within(central).getByText("Aula 1").closest("li")!;
    expect(fila1).toHaveTextContent("Capacidad 25");
    expect(fila1).toHaveTextContent("2 grupos la usan");
    expect(fila1).toHaveTextContent("Activa");
    const lab = within(central).getByText("Laboratorio").closest("li")!;
    expect(lab).toHaveTextContent("De baja");
    expect(lab).toHaveTextContent("Sin capacidad cargada");
    expect(lab).toHaveTextContent("Ningún grupo la usa");
    expect(within(screen.getByRole("region", { name: /^Base/ })).getByText("Aula B")).toBeInTheDocument();
  });

  it("con varias sedes ofrece el selector y pide sólo la elegida", async () => {
    await montar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    await act(async () => {});
    expect(apiAcademia.aulas).toHaveBeenLastCalledWith({ sede: 2 });
  });

  it("con una sola sede no hay selector", async () => {
    quien.sedes = 1;
    vi.mocked(apiAcademia.aulas).mockResolvedValue([AULAS[0]]);
    await montar();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("con sedeId muestra esa sede sola, sin selector, y la pide al backend", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([AULAS[2]]);
    await montar(2);
    expect(apiAcademia.aulas).toHaveBeenCalledWith({ sede: 2 });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Aula B")).toBeInTheDocument();
    expect(screen.queryByText("Aula 1")).not.toBeInTheDocument();
  });

  it("sin aulas, la guía para agregar la primera", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([]);
    await montar();
    expect(screen.getByText("Todavía no cargaste aulas")).toBeInTheDocument();
    expect(screen.getByText(/Agregá la primera para elegirla al abrir un grupo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva aula" })).toBeInTheDocument();
  });

  it("sin academia.configurar se ve la lista pero no hay con qué modificarla", async () => {
    quien.configura = false;
    await montar();
    expect(screen.getByText("Aula 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva aula" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Más acciones/ })).not.toBeInTheDocument();
  });

  it("quien está atado a una sede ve la suya sin selector", async () => {
    quien.deSede = true;
    vi.mocked(apiAcademia.aulas).mockResolvedValue([AULAS[0]]);
    await montar();
    expect(screen.getByRole("region", { name: /^Central/ })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("con una sede, la tarjeta se llama «Aulas» (no repite el nombre de la sede)", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([AULAS[0]]);
    await montar(1);
    expect(screen.getByRole("region", { name: /^Aulas/ })).toBeInTheDocument();
  });
});

describe("Aulas · alta y edición", () => {
  it("Nueva aula: nombre y capacidad, con la sede elegida arriba preseleccionada", async () => {
    vi.mocked(apiAcademia.crearAula).mockResolvedValue(aula(9, "Aula 9", { almacenId: 2, sede: { id: 2, nombre: "Base" } }));
    await montar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Nueva aula" }));
    const panel = screen.getByRole("complementary", { name: "Nueva aula" });
    // La sede ya está elegida arriba: el panel no la vuelve a preguntar.
    expect(within(panel).queryByLabelText("Sede")).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: " Aula 9 " } });
    fireEvent.change(within(panel).getByLabelText(/Capacidad/), { target: { value: "30" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(apiAcademia.crearAula).toHaveBeenCalledWith({ almacenId: 2, nombre: "Aula 9", capacidad: 30 });
    expect(screen.queryByRole("complementary", { name: "Nueva aula" })).not.toBeInTheDocument();
    expect(screen.getByText("Aula 9 quedó cargada.")).toBeInTheDocument();
  });

  it("ronda 1 · W8: el formulario tiene su propio botón de envío, para que Enter guarde", async () => {
    vi.mocked(apiAcademia.crearAula).mockResolvedValue(aula(9, "Aula 9"));
    await montar(1);
    vi.mocked(apiAcademia.aulas).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Nueva aula" }));
    const panel = screen.getByRole("complementary", { name: "Nueva aula" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aula 9" } });
    const envio = panel.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(envio).not.toBeNull();
    await act(async () => {
      fireEvent.click(envio);
    });
    expect(apiAcademia.crearAula).toHaveBeenCalledWith({ almacenId: 1, nombre: "Aula 9" });
  });

  it("viendo todas las sedes, el alta pregunta en cuál va", async () => {
    vi.mocked(apiAcademia.crearAula).mockResolvedValue(aula(9, "Aula 9"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva aula" }));
    const panel = screen.getByRole("complementary", { name: "Nueva aula" });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    // Sin nombre aún; con nombre pero sin sede, no se manda.
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aula 9" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(within(panel).getByText("Elegí la sede.")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Sede"), { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(apiAcademia.crearAula).toHaveBeenCalledWith({ almacenId: 1, nombre: "Aula 9" });
  });

  it("el error del backend se muestra tal cual y el panel queda abierto", async () => {
    vi.mocked(apiAcademia.crearAula).mockRejectedValue(new ApiError("Ya hay un aula con ese nombre en la sede", 409, { codigo: "AULA_REPETIDA" }));
    quien.sedes = 1;
    vi.mocked(apiAcademia.aulas).mockResolvedValue([AULAS[0]]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva aula" }));
    const panel = screen.getByRole("complementary", { name: "Nueva aula" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aula 1" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(within(panel).getByText("Ya hay un aula con ese nombre en la sede")).toBeInTheDocument();
  });

  it("pide un nombre y una capacidad válida antes de mandar", async () => {
    quien.sedes = 1;
    vi.mocked(apiAcademia.aulas).mockResolvedValue([AULAS[0]]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva aula" }));
    const panel = screen.getByRole("complementary", { name: "Nueva aula" });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(within(panel).getByText("Ponele un nombre al aula.")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aula 2" } });
    fireEvent.change(within(panel).getByLabelText(/Capacidad/), { target: { value: "0" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(within(panel).getByText(/número entre 1 y 1000/)).toBeInTheDocument();
    expect(apiAcademia.crearAula).not.toHaveBeenCalled();
  });

  it("Editar: manda el nombre y la capacidad (vacía = sin capacidad)", async () => {
    vi.mocked(apiAcademia.editarAula).mockResolvedValue(aula(1, "Aula Magna"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Aula 1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    const panel = screen.getByRole("complementary", { name: "Editar aula" });
    expect(within(panel).getByLabelText("Nombre")).toHaveValue("Aula 1");
    expect(within(panel).getByLabelText(/Capacidad/)).toHaveValue("25");
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aula Magna" } });
    fireEvent.change(within(panel).getByLabelText(/Capacidad/), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    });
    expect(apiAcademia.editarAula).toHaveBeenCalledWith(1, { nombre: "Aula Magna", capacidad: null });
  });
});

describe("Aulas · baja y eliminación", () => {
  it("Dar de baja y Reactivar", async () => {
    vi.mocked(apiAcademia.editarAula).mockResolvedValue(aula(1, "Aula 1", { activa: false }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Aula 1" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Dar de baja" }));
    });
    expect(apiAcademia.editarAula).toHaveBeenLastCalledWith(1, { activa: false });
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Laboratorio" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Reactivar" }));
    });
    expect(apiAcademia.editarAula).toHaveBeenLastCalledWith(2, { activa: true });
  });

  it("Eliminar pide confirmación y borra", async () => {
    vi.mocked(apiAcademia.borrarAula).mockResolvedValue({ id: 3, borrada: true, gruposDesvinculados: 0 });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Aula B" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    const dialogo = screen.getByRole("dialog", { name: "Eliminar el aula" });
    expect(apiAcademia.borrarAula).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    });
    expect(apiAcademia.borrarAula).toHaveBeenCalledWith(3);
    expect(screen.getByText("Aula B eliminada.")).toBeInTheDocument();
  });

  it("AULA_EN_USO: muestra el mensaje del backend y ofrece darla de baja", async () => {
    vi.mocked(apiAcademia.borrarAula).mockRejectedValue(
      new ApiError("El aula la usan 2 grupos vigentes: Barbería L-V y Uñas. Podés darla de baja.", 409, { codigo: "AULA_EN_USO", grupos: [] }),
    );
    vi.mocked(apiAcademia.editarAula).mockResolvedValue(aula(1, "Aula 1", { activa: false }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Aula 1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Eliminar el aula" })).getByRole("button", { name: "Eliminar" }));
    });
    const uso = screen.getByRole("dialog", { name: "El aula está en uso" });
    expect(uso).toHaveTextContent("El aula la usan 2 grupos vigentes: Barbería L-V y Uñas. Podés darla de baja.");
    await act(async () => {
      fireEvent.click(within(uso).getByRole("button", { name: "Dar de baja" }));
    });
    expect(apiAcademia.editarAula).toHaveBeenCalledWith(1, { activa: false });
  });
});
