import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "../lib/personal";

/**
 * Personal en un instituto (contrato de la ronda 1): el % se llama "% docente"
 * y suman la retención y el NIT. Lo cambia quien liquida la planilla. En los
 * demás rubros el formulario sigue igual (Personal.test.tsx).
 */

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, rol: "ADMIN", sucursalId: null, permisos: ["personal.gestionar", "planilla.liquidar"] },
    negocio: { id: 20, nombre: "CCTP Horizonte", tipoNegocio: "ACADEMIA", features: ["academia"] },
    puede: () => true,
  }),
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("../lib/api")>()).ApiError,
  api: {
    getSucursales: vi.fn(async () => [{ id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL" }]),
    getUsuarios: vi.fn(async () => []),
  },
}));

vi.mock("../lib/roles", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/roles")>();
  return { ...real, apiRoles: { asignables: vi.fn(async () => []), crear: vi.fn() } };
});

vi.mock("../lib/personal", () => ({
  apiPersonal: {
    listar: vi.fn(),
    cargos: vi.fn(async () => [{ id: 5, nombre: "Docente", esAdministrador: false, permisos: [] }]),
    crear: vi.fn(),
    editar: vi.fn(),
    darAcceso: vi.fn(),
    quitarAcceso: vi.fn(),
    vincular: vi.fn(),
  },
}));

import { apiPersonal } from "../lib/personal";
import Personal from "./Personal";

const MARCO: Persona = {
  id: 7,
  nombre: "Marco Rojas",
  cargoRolId: 5,
  cargo: "Docente",
  activo: true,
  color: null,
  sucursalIds: [1],
  usuarioId: null,
  conAcceso: false,
  recursoId: null,
  profesional: null,
  telefono: "70000001",
  ci: null,
  fechaIngreso: null,
  comisionPct: 20,
  retencionPct: 16,
  nit: null,
  notas: null,
  zona: null,
  vehiculo: null,
  acceso: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiPersonal.listar).mockResolvedValue([MARCO]);
});

describe("Personal en un instituto", () => {
  it("muestra retención y NIT, sin % docente ni color de agenda, y manda sólo lo que cambió", async () => {
    vi.mocked(apiPersonal.editar).mockResolvedValue({ ...MARCO, nit: "123456" });
    render(
      <MemoryRouter>
        <Personal />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Ver Marco Rojas" }));
    const dialogo = screen.getByRole("dialog", { name: "Marco Rojas" });
    expect(within(dialogo).queryByLabelText(/Comisión base/)).not.toBeInTheDocument();
    // C3: el % lo manda el curso (o Ajustes), no la persona; el color es de la agenda de belleza (U2).
    expect(within(dialogo).queryByLabelText(/% docente/)).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: /^Color en la agenda/ })).not.toBeInTheDocument();
    expect(within(dialogo).getByLabelText(/^Retención %/)).toHaveValue("16");
    fireEvent.change(within(dialogo).getByLabelText(/^NIT/), { target: { value: "123456" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    const cuerpo = vi.mocked(apiPersonal.editar).mock.calls[0][1];
    expect(cuerpo).toMatchObject({ nit: "123456" });
    // Ni el % ni la retención cambiaron: no viajan.
    expect(cuerpo).not.toHaveProperty("comisionPct");
    expect(cuerpo).not.toHaveProperty("retencionPct");
  });

  it("sin nadie cargado, el vacío no habla de barberos ni de agenda", async () => {
    vi.mocked(apiPersonal.listar).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Personal />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText(/Cargá a tus docentes/)).toBeInTheDocument();
    expect(screen.queryByText(/barbero/)).not.toBeInTheDocument();
  });
});
