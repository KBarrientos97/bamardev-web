import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "../lib/personal";

/**
 * Personal (PLAN-ROLES §9.4): la lista con y sin acceso, el alta de alguien
 * sin login, "Darle acceso" (con un rol del negocio) y "Quitar acceso". El
 * cargo es un rol del negocio (PLAN-ROLES-NEGOCIO), elegible de la lista o
 * creado en el momento por quien edita roles.
 */

const PERMISOS_DUENIO = ["personal.gestionar", "comisiones.liquidar", "roles.gestionar"];
const sesion = vi.hoisted(() => ({
  usuario: { id: 1, rol: "ADMIN", sucursalId: null, permisos: [] as string[] },
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: sesion.usuario,
    negocio: { id: 15, nombre: "Barbería", tipoNegocio: "BARBERIA", features: ["agenda"] },
    puede: () => true,
  }),
}));

vi.mock("../lib/api", async (importOriginal) => ({
  // ApiError real: los rechazos de rol se reconocen por su código.
  ApiError: (await importOriginal<typeof import("../lib/api")>()).ApiError,
  api: {
    getSucursales: vi.fn(async () => [{ id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL" }]),
    getUsuarios: vi.fn(async () => []),
  },
}));

/** Los roles del negocio, como los devuelve el backend (contrato §8). */
const ROLES = vi.hoisted(() => {
  const rol = (id: number, nombre: string, esAdministrador = false) => ({
    id,
    nombre,
    descripcion: null,
    esAdministrador,
    plantilla: null,
    usuarios: 0,
    personal: 0,
    permisos: [],
  });
  return [rol(1, "Administrador", true), rol(3, "Recepción"), rol(4, "Barbero")];
});

vi.mock("../lib/roles", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/roles")>();
  return {
    ...real,
    // El Administrador nunca es asignable desde acá.
    apiRoles: { asignables: vi.fn(async () => ROLES.slice(1)), crear: vi.fn() },
  };
});

vi.mock("../lib/personal", () => ({
  apiPersonal: {
    listar: vi.fn(),
    cargos: vi.fn(async () => ROLES),
    crear: vi.fn(),
    editar: vi.fn(),
    darAcceso: vi.fn(),
    quitarAcceso: vi.fn(),
    vincular: vi.fn(),
  },
}));

import { ApiError, api } from "../lib/api";
import { apiPersonal } from "../lib/personal";
import { apiRoles } from "../lib/roles";
import Personal from "./Personal";

const base: Persona = {
  id: 1,
  nombre: "Dueño",
  cargoRolId: 1,
  cargo: "Administrador",
  activo: true,
  color: null,
  sucursalIds: [],
  usuarioId: 10,
  conAcceso: true,
  recursoId: null,
  profesional: null,
  telefono: null,
  ci: null,
  fechaIngreso: "2026-10-01",
  comisionPct: null,
  notas: null,
  zona: null,
  vehiculo: null,
  acceso: { usuarioId: 10, username: "admin", rol: "ADMIN", rolId: 1, rolNombre: "Administrador", activo: true, ultimoLogin: null },
};
const LUCHO: Persona = {
  ...base,
  id: 2,
  nombre: "Lucho",
  cargoRolId: 4,
  cargo: "Barbero",
  sucursalIds: [1],
  usuarioId: null,
  conAcceso: false,
  recursoId: 30,
  profesional: { recursoId: 30, nombre: "Lucho", activo: true },
  acceso: null,
};
const ANA: Persona = {
  ...base,
  id: 3,
  nombre: "Ana",
  cargoRolId: 3,
  cargo: "Recepción",
  sucursalIds: [1],
  usuarioId: 11,
  // El código legado dice CAJERO; lo que se muestra es el nombre del rol.
  acceso: { usuarioId: 11, username: "ana", rol: "CAJERO", rolId: 3, rolNombre: "Recepción", activo: true, ultimoLogin: null },
};

async function montar() {
  render(
    <MemoryRouter>
      <Personal />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.usuario = { id: 1, rol: "ADMIN", sucursalId: null, permisos: PERMISOS_DUENIO };
  vi.mocked(apiPersonal.listar).mockResolvedValue([base, LUCHO, ANA]);
});

describe("Personal", () => {
  it("lista a la gente con y sin acceso, y cuenta los accesos", async () => {
    await montar();
    expect(apiPersonal.listar).toHaveBeenCalledWith({ incluirInactivos: true });
    expect(screen.getByText("3 personas · 2 con acceso al sistema")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Personal" });
    const lucho = within(lista).getByRole("button", { name: "Ver Lucho" });
    expect(lucho).toHaveTextContent("Sin acceso");
    expect(lucho).toHaveTextContent("En la agenda");
    expect(within(lista).getByRole("button", { name: "Ver Ana" })).toHaveTextContent("Con acceso");

    fireEvent.click(screen.getByRole("button", { name: "Sin acceso" }));
    expect(within(screen.getByRole("list", { name: "Personal" })).getAllByRole("button")).toHaveLength(1);
  });

  it("da de alta a alguien sin login", async () => {
    vi.mocked(apiPersonal.crear).mockResolvedValue({ ...LUCHO, id: 4, nombre: "Nico", recursoId: null, profesional: null });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva persona" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Nico" } });
    fireEvent.change(within(dialogo).getByLabelText("Cargo"), { target: { value: "4" } });
    fireEvent.change(within(dialogo).getByLabelText(/Comisión base/), { target: { value: "40" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiPersonal.crear).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Nico", cargoRolId: 4, comisionPct: 40, sucursalIds: [1] }),
    );
    expect(screen.getByText('"Nico" quedó guardado.')).toBeInTheDocument();
  });

  it("le da acceso a un profesional sin login, con el rol de su cargo", async () => {
    vi.mocked(apiPersonal.darAcceso).mockResolvedValue({
      ...LUCHO,
      usuarioId: 12,
      conAcceso: true,
      acceso: { usuarioId: 12, username: "lucho", rol: "PROFESIONAL", rolId: 4, rolNombre: "Barbero", activo: true, ultimoLogin: null },
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Darle acceso" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Darle acceso" });
    // El rol por defecto es el de su cargo; el Administrador no se ofrece.
    expect(within(dialogo).getByLabelText("Rol")).toHaveValue("4");
    expect(within(dialogo).getAllByRole("option").map((o) => o.textContent)).toEqual(["Recepción", "Barbero"]);
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "Lucho" } });
    fireEvent.change(within(dialogo).getByLabelText("Contraseña"), { target: { value: "secreto1" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Darle acceso" }));
    });
    expect(apiPersonal.darAcceso).toHaveBeenCalledWith(2, {
      username: "lucho",
      password: "secreto1",
      rolId: 4,
    });
    expect(screen.getByText('"Lucho" ya puede entrar como @lucho.')).toBeInTheDocument();
  });

  it("QA R1 W-10: si arranca en un cargo sin permisos, avisa que no va a ver nada", async () => {
    const vende = { codigo: "ventas.vender", alcance: "GENERAL" as const, nombre: "Vender", dominio: "Ventas" };
    vi.mocked(apiRoles.asignables).mockResolvedValueOnce([
      { ...ROLES[1], permisos: [vende] },
      // El cargo de Lucho: un rol sin permisos ("Lavacabezas").
      { ...ROLES[2], permisos: [] },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Darle acceso" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Darle acceso" });
    expect(within(dialogo).getByLabelText("Rol")).toHaveValue("4");
    expect(within(dialogo).getByRole("status")).toHaveTextContent(
      "Este rol no tiene permisos: la persona no va a ver nada.",
    );
    fireEvent.change(within(dialogo).getByLabelText("Rol"), { target: { value: "3" } });
    expect(within(dialogo).queryByRole("status")).toBeNull();
  });

  it("muestra el error del cupo que devuelve el backend", async () => {
    vi.mocked(apiPersonal.darAcceso).mockRejectedValue(
      new Error("Tu plan permite 4 usuarios activos. Desactivá uno o contratá usuarios extra."),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Darle acceso" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Darle acceso" });
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "lucho" } });
    fireEvent.change(within(dialogo).getByLabelText("Contraseña"), { target: { value: "secreto1" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Darle acceso" }));
    });
    expect(within(dialogo).getByText(/Tu plan permite 4 usuarios activos/)).toBeInTheDocument();
  });

  it("un rol que quien da el acceso no puede asignar (403 ROL_NO_ASIGNABLE), en palabras", async () => {
    vi.mocked(apiPersonal.darAcceso).mockRejectedValue(
      new ApiError("Forbidden", 403, { codigo: "ROL_NO_ASIGNABLE" }),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Darle acceso" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Darle acceso" });
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "lucho" } });
    fireEvent.change(within(dialogo).getByLabelText("Contraseña"), { target: { value: "secreto1" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Darle acceso" }));
    });
    expect(
      within(dialogo).getByText("No podés asignar ese rol: tiene permisos que vos no tenés."),
    ).toBeInTheDocument();
  });

  it("quitar acceso pide confirmación y la persona sigue", async () => {
    vi.mocked(apiPersonal.quitarAcceso).mockResolvedValue({
      ...ANA,
      conAcceso: false,
      acceso: { ...ANA.acceso!, activo: false },
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Ana" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Quitar acceso" }));
    const confirmar = screen.getByRole("dialog", { name: "Quitar acceso" });
    expect(confirmar).toHaveTextContent("Sigue en Personal");
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Quitar acceso" }));
    });
    expect(apiPersonal.quitarAcceso).toHaveBeenCalledWith(3);
    expect(screen.getByText('"Ana" ya no entra al sistema.')).toBeInTheDocument();
  });
  // ── QA S2 ronda 1 (PER-02 a PER-14) ───────────────────────────────────────

  it("mientras carga no dice 0 personas (PER-13)", async () => {
    vi.mocked(apiPersonal.listar).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <Personal />
      </MemoryRouter>,
    );
    // El subtítulo (y la lista) dicen "Cargando…", no un conteo en cero.
    expect(screen.getAllByText("Cargando…").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/0 personas/)).toBeNull();
  });

  it("el dueño sin sucursal aparece al filtrar por cualquiera y dice Todas (PER-03)", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([
      { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL" },
      { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL" },
    ] as never);
    await montar();
    const lista = () => screen.getByRole("list", { name: "Personal" });
    expect(within(lista()).getByRole("button", { name: "Ver Dueño" })).toHaveTextContent("Todas las sucursales");
    fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: "2" } });
    expect(within(lista()).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Ver Dueño"]);
  });

  it("la línea de acceso dice el nombre del rol del negocio (PER-05)", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Ana" }));
    await act(async () => {});
    expect(screen.getByRole("region", { name: "Acceso al sistema" })).toHaveTextContent(
      "Entra como @ana (Recepción)",
    );
  });

  it("el cargo se elige de los roles del negocio, sin el Administrador", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Nueva persona" });
    expect(within(within(dialogo).getByLabelText("Cargo")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Sin cargo",
      "Recepción",
      "Barbero",
      "+ Crear un cargo nuevo…",
    ]);
  });

  it("quien edita roles crea un cargo nuevo en el momento: un rol sin permisos", async () => {
    vi.mocked(apiRoles.crear).mockResolvedValue({ ...ROLES[1], id: 9, nombre: "Ayudante" });
    vi.mocked(apiPersonal.cargos).mockResolvedValueOnce(ROLES).mockResolvedValue([...ROLES, { ...ROLES[1], id: 9, nombre: "Ayudante" }]);
    vi.mocked(apiPersonal.crear).mockResolvedValue({ ...LUCHO, id: 7, nombre: "Rita" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Nueva persona" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Rita" } });
    fireEvent.change(within(dialogo).getByLabelText("Cargo"), { target: { value: "__nuevo" } });
    fireEvent.change(within(dialogo).getByPlaceholderText("Ayudante"), { target: { value: "Ayudante" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Crear" }));
    });
    expect(apiRoles.crear).toHaveBeenCalledWith({ nombre: "Ayudante", permisos: [] });
    expect(within(dialogo).getByLabelText("Cargo")).toHaveValue("9");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiPersonal.crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Rita", cargoRolId: 9 }));
  });

  it("sin roles.gestionar no se ofrece crear un cargo", async () => {
    sesion.usuario = { id: 1, rol: "SUPERVISOR", sucursalId: null, permisos: ["personal.gestionar"] };
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Nueva persona" });
    expect(within(dialogo).queryByRole("option", { name: /Crear un cargo nuevo/ })).toBeNull();
  });

  it("filtra por cargo con los roles del negocio", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Cargo"), { target: { value: "4" } });
    expect(
      within(screen.getByRole("list", { name: "Personal" })).getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Ver Lucho"]);
  });

  it("el color se guarda como se ve (PER-04, PER-14)", async () => {
    vi.mocked(apiPersonal.crear).mockResolvedValue({ ...LUCHO, id: 4, nombre: "Nico" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Nueva persona" });
    // Sin elegir: dice "Sin color" y guarda null.
    expect(within(dialogo).getByRole("group", { name: "Color en la agenda" })).toHaveTextContent("Sin color");
    fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Nico" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiPersonal.crear).toHaveBeenLastCalledWith(expect.objectContaining({ color: null }));

    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    await act(async () => {});
    const otra = screen.getByRole("dialog", { name: "Nueva persona" });
    fireEvent.change(within(otra).getByLabelText("Nombre"), { target: { value: "Nico" } });
    fireEvent.click(within(otra).getByRole("button", { name: "Elegir color" }));
    expect(within(otra).getByLabelText("Elegir color")).toHaveValue("#7357b8");
    await act(async () => {
      fireEvent.click(within(otra).getByRole("button", { name: "Guardar" }));
    });
    expect(apiPersonal.crear).toHaveBeenLastCalledWith(expect.objectContaining({ color: "#7357B8" }));
  });

  it("al vincular avisa que la ficha propia del usuario se une y desaparece (PER-06)", async () => {
    const PABLO: Persona = {
      ...base,
      id: 5,
      nombre: "Pablo Ríos",
      cargo: "Barbero",
      ci: "1234567",
      sucursalIds: [1],
      usuarioId: 20,
      acceso: { usuarioId: 20, username: "pablo", rol: "PROFESIONAL", rolId: 4, rolNombre: "Barbero", activo: true, ultimoLogin: null },
    };
    const SIN_LOGIN: Persona = { ...LUCHO, id: 6, nombre: "Nueva", recursoId: null, profesional: null };
    vi.mocked(apiPersonal.listar).mockResolvedValue([base, LUCHO, ANA, PABLO, SIN_LOGIN]);
    vi.mocked(api.getUsuarios).mockResolvedValue([
      { id: 10, nombre: "Dueño", usuario: "admin", rol: "ADMIN", rolId: 1, esAdministrador: true, activo: true },
      { id: 20, nombre: "Pablo Ríos", usuario: "pablo", rol: "PROFESIONAL", rolId: 4, activo: true },
      { id: 21, nombre: "Suelto", usuario: "suelto", rol: "CAJERO", rolId: 3, activo: true },
      // Un rol que quien mira no puede asignar (el backend daría 403): no se ofrece.
      { id: 22, nombre: "Otro encargado", usuario: "otro", rol: "SUPERVISOR", rolId: 2, activo: true },
    ] as never);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Nueva" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Vincular a un usuario existente" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Vincular a un usuario" });
    expect(within(dialogo).getByRole("option", { name: /Pablo Ríos \(@pablo\) · tiene ficha propia/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("option", { name: /@admin/ })).toBeNull();
    expect(within(dialogo).queryByRole("option", { name: /@otro/ })).toBeNull();
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "20" } });
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      '@pablo ya tiene su ficha "Pablo Ríos" con Barbero, CI 1234567',
    );
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "21" } });
    expect(within(dialogo).queryByRole("alert")).toBeNull();
  });

  it("reactivar a un profesional avisa que su columna de la agenda sigue inactiva (PER-14)", async () => {
    const DE_BAJA: Persona = { ...LUCHO, activo: false, profesional: { recursoId: 30, nombre: "Lucho", activo: false } };
    vi.mocked(apiPersonal.listar).mockResolvedValue([base, DE_BAJA, ANA]);
    vi.mocked(apiPersonal.editar).mockResolvedValue({ ...DE_BAJA, activo: true });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    });
    expect(screen.getByText(/volvió al equipo\. Su columna en la agenda sigue inactiva/)).toBeInTheDocument();
  });

  it("con la columna apagada no dice «En la agenda» (VER-02) y dice dónde reactivarla", async () => {
    const inactivo = { ...LUCHO, profesional: { recursoId: 30, nombre: "Lucho", activo: false } };
    vi.mocked(apiPersonal.listar).mockResolvedValue([base, inactivo, ANA]);
    await montar();
    const lucho = within(screen.getByRole("list", { name: "Personal" })).getByRole("button", { name: "Ver Lucho" });
    expect(lucho).not.toHaveTextContent("En la agenda");
    expect(lucho).toHaveTextContent("Agenda inactiva");
    fireEvent.click(lucho);
    expect(screen.getByText(/En la agenda es "Lucho" \(columna inactiva\)/)).toBeInTheDocument();
  });

  it("a quien no es profesional le dice dónde darle agenda, con la pestaña del rubro (DIA-16)", async () => {
    await montar();
    fireEvent.click(within(screen.getByRole("list", { name: "Personal" })).getByRole("button", { name: "Ver Ana" }));
    expect(screen.getByRole("link", { name: "Configuración de agenda › Barberos y espacios" })).toHaveAttribute(
      "href",
      "/configuracion/agenda?pestana=recursos",
    );
  });
});
