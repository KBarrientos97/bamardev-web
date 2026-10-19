import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { ajustesDePrueba, grupoDetalle } from "../../test/academiaFixtures";

/**
 * N3 · Abrir grupo con un inicio pasado (QA ronda 2, N-5; contrato #31):
 * quien configura el instituto puede elegir un inicio que ya pasó y, ante el
 * 400 FECHA_PASADA, confirmar que el grupo ya venía andando; los demás sólo
 * ven inicios futuros y, si igual llega el rechazo, el mensaje sin opción.
 */

const sesion = vi.hoisted(() => ({ configura: true }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN, SESION_SECRETARIA } = await import("../../test/academiaFixtures");
  return {
    useAuth: () =>
      sesion.configura
        ? { ...SESION_ADMIN, usuario: { ...SESION_ADMIN.usuario, sucursalId: 1, sucursal: "Central" }, puede: () => true }
        : {
            ...SESION_SECRETARIA,
            usuario: { ...SESION_SECRETARIA.usuario, permisos: [...SESION_SECRETARIA.usuario.permisos, "academia.grupos"] },
            puede: () => true,
          },
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { ajustes: vi.fn(), carreras: vi.fn(), docentes: vi.fn(), crearGrupo: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import NuevoGrupo from "./NuevoGrupo";

const fechaPasada = (puedeConfirmar: boolean) =>
  new ApiError("El grupo no puede empezar antes del 2026-10-10, el inicio del módulo en curso.", 400, {
    codigo: "FECHA_PASADA",
    minimo: "2026-10-10",
    puedeConfirmar,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T14:00:00.000Z"));
  sesion.configura = true;
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ franjas: [{ almacenId: null, inicio: "18:00", fin: "20:00" }] }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([
    { id: 3, nombre: "Barbería", activa: true, materias: [{ id: 31, orden: 1, nombre: "Corte", activa: true }], planes: [], cupoDefecto: 20, pctDocente: null, publicarEnPagina: false },
  ] as never);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  const onCreado = vi.fn();
  render(
    <MemoryRouter>
      <NuevoGrupo onCerrar={() => {}} onCreado={onCreado} />
    </MemoryRouter>,
  );
  await act(async () => {});
  const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
  fireEvent.change(within(panel).getByLabelText("Curso"), { target: { value: "3" } });
  return { panel, onCreado };
}

describe("N3 · Abrir grupo con un inicio pasado", () => {
  it("quien configura elige un inicio pasado y confirma que el grupo ya venía andando", async () => {
    vi.mocked(apiAcademia.crearGrupo).mockRejectedValueOnce(fechaPasada(true)).mockResolvedValueOnce(grupoDetalle());
    const { panel, onCreado } = await montar();
    const empieza = within(panel).getByLabelText("Empieza el");
    // El primero sigue siendo el próximo inicio; los pasados van aparte.
    expect(empieza).toHaveValue("2026-11");
    expect(within(empieza).getByRole("group", { name: /Ya empezó/ })).toBeInTheDocument();
    fireEvent.change(empieza, { target: { value: "2026-08" } });
    expect(within(panel).getByText(/Esa fecha ya pasó: elegila sólo para cargar un grupo que ya estaba en clases/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0]).not.toHaveProperty("confirmarInicioPasado");
    const aviso = within(panel).getByRole("alert");
    expect(aviso).toHaveTextContent("El 10 de agosto ya pasó.");
    expect(aviso).toHaveTextContent("El primer inicio posible es el 10 de octubre.");
    expect(within(panel).getByRole("button", { name: "Abrir grupo" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(aviso).getByRole("button", { name: "El grupo ya venía andando" }));
    });
    expect(apiAcademia.crearGrupo).toHaveBeenLastCalledWith(expect.objectContaining({ fechaInicio: "2026-08-10", confirmarInicioPasado: true }));
    expect(onCreado).toHaveBeenCalled();
  });

  it("'Elegir otra fecha' saca el aviso sin mandar nada", async () => {
    vi.mocked(apiAcademia.crearGrupo).mockRejectedValueOnce(fechaPasada(true));
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Empieza el"), { target: { value: "2026-09" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Elegir otra fecha" }));
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
  });

  it("sin academia.configurar: sólo inicios futuros, y el rechazo se explica sin opción de confirmar", async () => {
    sesion.configura = false;
    vi.mocked(apiAcademia.crearGrupo).mockRejectedValueOnce(fechaPasada(false));
    const { panel } = await montar();
    const empieza = within(panel).getByLabelText("Empieza el");
    expect(within(empieza).queryByRole("group", { name: /Ya empezó/ })).not.toBeInTheDocument();
    expect(within(empieza).queryByRole("option", { name: /agosto/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    const aviso = within(panel).getByRole("alert");
    expect(aviso).toHaveTextContent("El primer inicio posible es el 10 de octubre.");
    expect(within(aviso).queryByRole("button")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Abrir grupo" })).toBeEnabled();
  });
});
