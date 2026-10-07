import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DominioPermisos, EventoRol, PermisoCatalogo, PermisoDeRolVista, RolNegocio, SesionUsuario } from "../../types";

/**
 * La pantalla Roles (PLAN-ROLES-NEGOCIO): lista, crear, renombrar, editar
 * permisos por dominio (con alcance), el Administrador en sólo lectura,
 * borrar con reasignación y la bitácora. El API de roles se programa contra
 * el contrato de §8 y acá va mockeado.
 */

const sesion = vi.hoisted(() => ({ actor: null as unknown as SesionUsuario }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: sesion.actor }),
}));

vi.mock("../../lib/roles", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/roles")>();
  return {
    ...real,
    apiRoles: {
      listar: vi.fn(),
      catalogo: vi.fn(),
      crear: vi.fn(),
      editar: vi.fn(),
      borrar: vi.fn(),
      bitacora: vi.fn(),
      bitacoraDe: vi.fn(),
    },
  };
});

import { ApiError } from "../../lib/api";
import { apiRoles } from "../../lib/roles";
import Roles from "./Roles";

const permiso = (codigo: string, nombre: string, extra: Partial<PermisoCatalogo> = {}): PermisoCatalogo => ({
  codigo,
  nombre,
  descripcion: `Descripción de ${nombre}.`,
  sensible: false,
  admitePropio: false,
  disponible: true,
  otorgable: "GENERAL",
  ...extra,
});

const CATALOGO: DominioPermisos[] = [
  {
    dominio: "Ventas",
    nombre: "Ventas",
    permisos: [permiso("ventas.vender", "Vender"), permiso("ventas.anular", "Anular ventas")],
  },
  {
    dominio: "Agenda",
    nombre: "Agenda",
    permisos: [
      permiso("agenda.ver", "Ver la agenda", { admitePropio: true }),
      permiso("agenda.configurar", "Configurar la agenda"),
      // De ejecutor: el Administrador no lo recibe (lo cubre `agenda.gestionar`).
      permiso("agenda.crear_propias", "Agendar sus citas", { admitePropio: true }),
    ],
  },
  {
    dominio: "Reportes",
    nombre: "Reportes",
    permisos: [
      permiso("reportes.rentabilidad", "Rentabilidad", { disponible: false }),
      permiso("gastos.gestionar", "Gastos", { otorgable: null }),
    ],
  },
  {
    // La ficha de salud quedó como deuda técnica (07-oct): su feature está
    // apagada en todos los negocios, así que el dominio entero se esconde.
    dominio: "Salud",
    nombre: "Salud",
    permisos: [permiso("cliente.editar_salud", "Completar la ficha de salud", { disponible: false, admitePropio: true })],
  },
];

/** Un permiso de rol como lo manda `GET /roles`, con su nombre y su dominio. */
function pr(codigo: string, alcance: "GENERAL" | "PROPIO" = "GENERAL"): PermisoDeRolVista {
  const dominio = CATALOGO.find((d) => d.permisos.some((p) => p.codigo === codigo));
  const nombre = dominio?.permisos.find((p) => p.codigo === codigo)?.nombre ?? codigo;
  return { codigo, alcance, nombre, dominio: dominio?.nombre ?? null };
}

function rol(id: number, nombre: string, extra: Partial<RolNegocio> = {}): RolNegocio {
  return { id, nombre, descripcion: null, esAdministrador: false, plantilla: null, usuarios: 0, personal: 0, permisos: [], ...extra };
}
// El Administrador trae todo el catálogo menos lo de ejecutor, sin cruzarlo
// con el plan (eso lo hace la pantalla).
const ADMINISTRADOR = rol(1, "Administrador", {
  esAdministrador: true,
  usuarios: 1,
  permisos: CATALOGO.flatMap((d) => d.permisos)
    .filter((p) => p.codigo !== "agenda.crear_propias")
    .map((p) => pr(p.codigo)),
});
const CAJERO = rol(3, "Cajero", {
  usuarios: 2,
  personal: 1,
  permisos: [pr("ventas.vender"), pr("gastos.gestionar")],
});
const AYUDANTE = rol(7, "Ayudante");
const ROLES = [ADMINISTRADOR, CAJERO, AYUDANTE];

async function montar() {
  render(<Roles />);
  await act(async () => {});
}

/** Abre un dominio plegado del editor. */
function abrirDominio(nombre: string) {
  fireEvent.click(screen.getByText(nombre, { selector: "summary span" }));
}

const editor = () => screen.getByRole("dialog");

beforeEach(() => {
  vi.clearAllMocks();
  sesion.actor = {
    id: 1,
    username: "duena",
    rol: "SUPERVISOR",
    rolNombre: "Encargada",
    esAdministrador: false,
    permisos: ["roles.gestionar", "ventas.vender", "ventas.anular", "agenda.ver", "agenda.configurar"],
    permisosPropios: [],
  };
  vi.mocked(apiRoles.listar).mockResolvedValue(ROLES);
  vi.mocked(apiRoles.catalogo).mockResolvedValue(CATALOGO);
  vi.mocked(apiRoles.bitacoraDe).mockResolvedValue([]);
});

describe("la lista", () => {
  it("cada rol con cuánta gente lo tiene; el Administrador con candado", async () => {
    await montar();
    const lista = screen.getByRole("list", { name: "Roles del negocio" });
    const cajero = within(lista).getByRole("button", { name: "Ver el rol Cajero" });
    expect(cajero).toHaveTextContent("2 usuarios · 1 en personal");
    expect(cajero).toHaveTextContent("2 permisos");
    const admin = within(lista).getByRole("button", { name: "Ver el rol Administrador" });
    expect(admin).toHaveTextContent("Sólo lectura");
    expect(admin).toHaveTextContent("Todos los permisos");
  });

  it("QA R1 W-02: el conteo es de lo que el negocio puede usar, no de lo que trae la plantilla", async () => {
    vi.mocked(apiRoles.listar).mockResolvedValue([
      ADMINISTRADOR,
      // El backend ya lo cuenta...
      rol(4, "Vendedor", { permisos: [pr("ventas.vender"), { ...pr("agenda.ver"), disponible: false }], permisosDisponibles: 1 }),
      // ...y si no lo manda, se cuenta acá con `disponible`.
      rol(5, "Recepción", { permisos: [pr("ventas.vender"), pr("ventas.anular"), { ...pr("agenda.ver"), disponible: false }] }),
      rol(6, "Mozo", { permisos: [{ ...pr("agenda.ver"), disponible: false }] }),
    ]);
    await montar();
    const lista = screen.getByRole("list", { name: "Roles del negocio" });
    expect(within(lista).getByRole("button", { name: "Ver el rol Vendedor" })).toHaveTextContent("1 permiso");
    expect(within(lista).getByRole("button", { name: "Ver el rol Recepción" })).toHaveTextContent("2 permisos");
    expect(within(lista).getByRole("button", { name: "Ver el rol Mozo" })).toHaveTextContent("Sin permisos");
  });
});

describe("crear un rol", () => {
  it("con nombre y permisos por dominio", async () => {
    vi.mocked(apiRoles.crear).mockResolvedValue(rol(9, "Ayudante de caja"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Ayudante de caja" } });
    abrirDominio("Ventas");
    fireEvent.click(within(editor()).getByLabelText(/Vender/));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.crear).toHaveBeenCalledWith({
      nombre: "Ayudante de caja",
      permisos: [{ codigo: "ventas.vender", alcance: "GENERAL" }],
    });
    expect(screen.getByText('Rol "Ayudante de caja" creado.')).toBeInTheDocument();
    expect(apiRoles.listar).toHaveBeenCalledTimes(2);
  });

  it("un permiso que admite 'sólo lo suyo' elige el alcance", async () => {
    vi.mocked(apiRoles.crear).mockResolvedValue(rol(9, "Estilista"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Estilista" } });
    abrirDominio("Agenda");
    fireEvent.click(within(editor()).getByLabelText(/Ver la agenda/));
    const alcance = within(editor()).getByRole("radiogroup", { name: "Alcance de Ver la agenda" });
    expect(within(alcance).getByRole("radio", { name: "General" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(alcance).getByRole("radio", { name: "Sólo lo suyo" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.crear).toHaveBeenCalledWith({
      nombre: "Estilista",
      permisos: [{ codigo: "agenda.ver", alcance: "PROPIO" }],
    });
  });

  it("lo que el plan no incluye no aparece; lo que quien edita no tiene, apagado y con el motivo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    abrirDominio("Reportes");
    expect(within(editor()).queryByLabelText(/Rentabilidad/)).toBeNull();
    expect(within(editor()).queryByText("Tu plan no lo incluye.")).toBeNull();
    // El total del dominio cuenta sólo lo que se ofrece.
    expect(screen.getByText("Reportes", { selector: "summary span" }).parentElement).toHaveTextContent("0 de 1");
    expect(within(editor()).getByLabelText(/^Gastos/)).toBeDisabled();
    expect(within(editor()).getByText("No lo tenés, así que no lo podés dar.")).toBeInTheDocument();
  });

  it("un dominio con todo apagado (la ficha de salud) no se muestra", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    expect(within(editor()).queryByText("Salud", { selector: "summary span" })).toBeNull();
    expect(within(editor()).queryByLabelText(/ficha de salud/)).toBeNull();
  });

  it("un permiso fuera del plan que el rol ya trae va aparte, plegado, y se puede sacar (QA R1 W-02)", async () => {
    vi.mocked(apiRoles.listar).mockResolvedValue([
      ADMINISTRADOR,
      rol(8, "Terapeuta", { permisos: [pr("ventas.vender"), { ...pr("cliente.editar_salud", "PROPIO"), disponible: false }] }),
    ]);
    vi.mocked(apiRoles.editar).mockResolvedValue(rol(8, "Terapeuta"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Terapeuta" }));
    // Su dominio no aparece: no se mezcla con lo que sí hace.
    expect(within(editor()).queryByText("Salud", { selector: "summary span" })).toBeNull();
    const aparte = within(editor()).getByText("No incluidos en tu plan", { selector: "summary span" });
    expect(aparte.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(aparte);
    const salud = within(editor()).getByLabelText(/^Completar la ficha de salud/);
    expect(salud).toBeChecked();
    fireEvent.click(salud);
    // Sacado, no se vuelve a dar.
    expect(salud).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).toHaveBeenCalledWith(8, { permisos: [{ codigo: "ventas.vender", alcance: "GENERAL" }] });
  });

  it("lo del rol fuera del plan no infla el conteo de su dominio (QA R1 W-02/W-04)", async () => {
    vi.mocked(apiRoles.listar).mockResolvedValue([
      ADMINISTRADOR,
      rol(9, "Vendedor", { permisos: [pr("ventas.vender"), { ...pr("reportes.rentabilidad"), disponible: false }] }),
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Vendedor" }));
    expect(screen.getByText("Reportes", { selector: "summary span" }).parentElement).toHaveTextContent("0 de 1");
    const reportes = screen.getByText("Reportes", { selector: "summary span" }).closest("details")!;
    expect(within(reportes).queryByLabelText(/^Rentabilidad/)).toBeNull();
    fireEvent.click(within(editor()).getByText("No incluidos en tu plan", { selector: "summary span" }));
    expect(within(editor()).getByLabelText(/^Rentabilidad/)).toBeChecked();
  });

  it("un permiso que el catálogo ya ni lista (otro rubro) también va aparte, con su nombre", async () => {
    vi.mocked(apiRoles.listar).mockResolvedValue([
      ADMINISTRADOR,
      rol(10, "Encargado", {
        permisos: [
          pr("ventas.vender"),
          { codigo: "controlados.libro", alcance: "GENERAL", nombre: "Libro de controlados", dominio: "Farmacia", disponible: false },
        ],
      }),
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Encargado" }));
    expect(within(editor()).queryByText("Farmacia", { selector: "summary span" })).toBeNull();
    fireEvent.click(within(editor()).getByText("No incluidos en tu plan", { selector: "summary span" }));
    expect(within(editor()).getByLabelText(/^Libro de controlados/)).toBeChecked();
  });

  it("un rol sin nada fuera del plan no muestra la sección aparte", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    expect(within(editor()).queryByText("No incluidos en tu plan")).toBeNull();
  });

  it("quien tiene un permiso sólo sobre lo suyo no puede dar el general (lo dice `otorgable`)", async () => {
    vi.mocked(apiRoles.catalogo).mockResolvedValue(
      CATALOGO.map((d) => ({
        ...d,
        permisos: d.permisos.map((p) => (p.codigo === "agenda.ver" ? { ...p, otorgable: "PROPIO" as const } : p)),
      })),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    abrirDominio("Agenda");
    fireEvent.click(within(editor()).getByLabelText(/Ver la agenda/));
    const alcance = within(editor()).getByRole("radiogroup", { name: "Alcance de Ver la agenda" });
    expect(within(alcance).getByRole("radio", { name: "Sólo lo suyo" })).toHaveAttribute("aria-checked", "true");
    expect(within(alcance).getByRole("radio", { name: "General" })).toBeDisabled();
  });

  it("un nombre repetido lo dice en palabras (409 NOMBRE_REPETIDO)", async () => {
    vi.mocked(apiRoles.crear).mockRejectedValue(new ApiError("Conflict", 409, { codigo: "NOMBRE_REPETIDO" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Cajero" } });
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(within(editor()).getByText("Ya hay un rol con ese nombre.")).toBeInTheDocument();
  });

  it("QA R1 W-01: el error sale en el pie, junto a Guardar, no al final de los dominios", async () => {
    vi.mocked(apiRoles.crear).mockRejectedValue(new ApiError("Conflict", 409, { codigo: "NOMBRE_REPETIDO" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "cajero" } });
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    const alerta = within(editor()).getByRole("alert");
    expect(alerta).toHaveTextContent("Ya hay un rol con ese nombre.");
    // Mismo contenedor que los botones (el pie fijo del modal), no el cuerpo
    // con scroll donde están los permisos.
    const pie = alerta.parentElement!;
    expect(within(pie).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(within(pie).queryByText("Ventas", { selector: "summary span" })).toBeNull();
  });

  it("QA R1 W-01: sin nombre, el aviso también se ve junto a Guardar", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.crear).not.toHaveBeenCalled();
    const alerta = within(editor()).getByRole("alert");
    expect(alerta).toHaveTextContent("Poné el nombre del rol.");
    expect(within(alerta.parentElement!).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("403 PERMISO_NO_OTORGABLE nombra los permisos con el catálogo", async () => {
    vi.mocked(apiRoles.crear).mockRejectedValue(
      new ApiError("No podés dar un permiso que vos no tenés: Gastos.", 403, {
        codigo: "PERMISO_NO_OTORGABLE",
        permisos: ["gastos.gestionar"],
      }),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Caja chica" } });
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(within(editor()).getByText("No podés dar lo que no tenés: Gastos.")).toBeInTheDocument();
  });
});

describe("editar un rol", () => {
  it("renombrar manda sólo el nombre (la bitácora distingue renombrar de cambiar permisos)", async () => {
    vi.mocked(apiRoles.editar).mockResolvedValue({ ...CAJERO, nombre: "Caja" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Caja" } });
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).toHaveBeenCalledWith(3, { nombre: "Caja" });
  });

  it("cambiar permisos manda la lista completa, sin el nombre", async () => {
    vi.mocked(apiRoles.editar).mockResolvedValue(CAJERO);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    abrirDominio("Ventas");
    expect(within(editor()).getByLabelText(/^Vender/)).toBeChecked();
    fireEvent.click(within(editor()).getByLabelText(/Anular ventas/));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).toHaveBeenCalledWith(3, {
      permisos: [
        { codigo: "ventas.vender", alcance: "GENERAL" },
        { codigo: "gastos.gestionar", alcance: "GENERAL" },
        { codigo: "ventas.anular", alcance: "GENERAL" },
      ],
    });
  });

  it("un permiso que el rol trae y quien edita no tiene se puede sacar, pero no volver a dar", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    abrirDominio("Reportes");
    const gastos = within(editor()).getByLabelText(/^Gastos/);
    expect(gastos).toBeChecked();
    expect(gastos).toBeEnabled();
    fireEvent.click(gastos);
    expect(gastos).not.toBeChecked();
    expect(gastos).toBeDisabled();
  });

  it("sin cambios, guardar no llama al backend", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).not.toHaveBeenCalled();
  });

  it("el Administrador se ve en sólo lectura, con el candado", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Administrador" }));
    expect(within(editor()).getByText(/El Administrador es el rol del dueño/)).toBeInTheDocument();
    expect(within(editor()).queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(within(editor()).queryByRole("button", { name: "Borrar" })).toBeNull();
    abrirDominio("Ventas");
    expect(within(editor()).getByLabelText(/^Vender/)).toBeChecked();
    expect(within(editor()).getByLabelText(/^Vender/)).toBeDisabled();
  });

  it("el Administrador se ve con lo que trae: sin lo que el plan no incluye ni lo de ejecutor", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Administrador" }));
    abrirDominio("Agenda");
    expect(within(editor()).getByLabelText(/^Ver la agenda/)).toBeChecked();
    expect(within(editor()).getByLabelText(/^Agendar sus citas/)).not.toBeChecked();
    abrirDominio("Reportes");
    expect(within(editor()).queryByLabelText(/^Rentabilidad/)).toBeNull();
    expect(within(editor()).queryByText("Salud", { selector: "summary span" })).toBeNull();
    expect(within(editor()).getByText(/agendar o bloquear lo suyo/)).toBeInTheDocument();
  });

  it("muestra el historial del rol", async () => {
    const evento: EventoRol = {
      id: 1,
      fecha: "2026-10-07T15:00:00.000Z",
      accion: "PERMISOS",
      rolId: 3,
      rolNombre: "Cajero",
      detalle: { agregados: [{ codigo: "ventas.anular", alcance: "GENERAL" }], quitados: [] },
      autor: { id: 1, nombre: "Omar" },
      porSoporte: false,
    };
    vi.mocked(apiRoles.bitacoraDe).mockResolvedValue([evento]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Historial de cambios" }));
    });
    expect(apiRoles.bitacoraDe).toHaveBeenCalledWith(3);
    expect(within(editor()).getByText("Agregó: Anular ventas")).toBeInTheDocument();
  });
});

describe("borrar un rol", () => {
  async function borrar(nombre: string) {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: `Ver el rol ${nombre}` }));
    fireEvent.click(within(editor()).getByRole("button", { name: "Borrar" }));
  }

  it("con gente, hay que elegir a qué rol pasan (nunca al Administrador)", async () => {
    vi.mocked(apiRoles.borrar).mockResolvedValue({});
    await borrar("Cajero");
    const dialogo = screen.getByRole("dialog", { name: 'Borrar "Cajero"' });
    expect(dialogo).toHaveTextContent("Lo tienen 2 usuarios · 1 en personal");
    const destino = within(dialogo).getByLabelText("Pasan a");
    expect(within(destino).getAllByRole("option").map((o) => o.textContent)).toEqual(["Elegí un rol…", "Ayudante"]);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(apiRoles.borrar).not.toHaveBeenCalled();
    expect(within(dialogo).getByText("Elegí a qué rol pasan.")).toBeInTheDocument();
    fireEvent.change(destino, { target: { value: "7" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(apiRoles.borrar).toHaveBeenCalledWith(3, 7);
    expect(screen.getByText('Rol "Cajero" borrado. Su gente pasó a "Ayudante".')).toBeInTheDocument();
  });

  it("sin gente se borra directo", async () => {
    vi.mocked(apiRoles.borrar).mockResolvedValue({});
    await borrar("Ayudante");
    const dialogo = screen.getByRole("dialog", { name: 'Borrar "Ayudante"' });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(apiRoles.borrar).toHaveBeenCalledWith(7, undefined);
  });

  it("si mientras tanto alguien le asignó el rol (409), pide el destino", async () => {
    vi.mocked(apiRoles.borrar).mockRejectedValue(
      new ApiError("Conflict", 409, { codigo: "REASIGNAR_REQUERIDO", usuarios: 1, personal: 0 }),
    );
    await borrar("Ayudante");
    const dialogo = screen.getByRole("dialog", { name: 'Borrar "Ayudante"' });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(within(dialogo).getByText("El rol lo tienen 1 usuario: elegí a qué rol pasan.")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Pasan a")).toBeInTheDocument();
  });
});

describe("la bitácora", () => {
  it("dice quién cambió qué, y lo que hizo el soporte", async () => {
    vi.mocked(apiRoles.bitacora).mockResolvedValue([
      { id: 3, fecha: "2026-10-07T17:00:00.000Z", accion: "PERMISOS", rolId: 3, rolNombre: "Caja", detalle: { agregados: [], quitados: [{ codigo: "gastos.gestionar", alcance: "GENERAL" }], cambiados: [{ codigo: "agenda.ver", de: "GENERAL", a: "PROPIO" }] }, autor: { id: 1, nombre: "Omar" }, porSoporte: false },
      { id: 2, fecha: "2026-10-07T16:00:00.000Z", accion: "RENOMBRAR", rolId: 3, rolNombre: "Caja", detalle: { de: "Cajero", a: "Caja" }, autor: { id: 1, nombre: "Omar" }, porSoporte: false },
      { id: 1, fecha: "2026-10-07T15:00:00.000Z", accion: "RESTABLECER", rolId: 3, rolNombre: "Cajero", detalle: { plantillaId: 4, agregados: [{ codigo: "ventas.vender", alcance: "GENERAL" }], quitados: [] }, motivo: "pedido del dueño", autor: null, porSoporte: true },
      { id: 0, fecha: "2026-10-07T14:00:00.000Z", accion: "ELIMINAR", rolId: 8, rolNombre: "Lavaplatos", detalle: { reasignadoA: { id: 7, nombre: "Ayudante" }, usuarios: 1, personal: 0 }, autor: { id: 1, nombre: "Omar" }, porSoporte: false },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bitácora" }));
    await act(async () => {});
    const lista = screen.getByRole("list", { name: "Bitácora de roles" });
    expect(lista).toHaveTextContent("Omar renombró Caja");
    expect(lista).toHaveTextContent("Cajero → Caja");
    // Los permisos, por su nombre (el catálogo está a mano en esta pantalla).
    expect(lista).toHaveTextContent("Quitó: Gastos");
    expect(lista).toHaveTextContent("Ver la agenda: general → sólo lo suyo");
    expect(lista).toHaveTextContent("Soporte de BamarDev restableció Cajero");
    expect(lista).toHaveTextContent("Agregó: Vender");
    expect(lista).toHaveTextContent("Motivo: pedido del dueño");
    expect(lista).toHaveTextContent("Su gente pasó a Ayudante");
  });

  it("QA R1 W-05: cada evento con el nombre que tenía el rol en ese momento", async () => {
    vi.mocked(apiRoles.bitacora).mockResolvedValue([
      { id: 3, fecha: "2026-10-07T17:00:00.000Z", accion: "RENOMBRAR", rolId: 9, rolNombre: "Caja y reportes", detalle: { de: "Caja simple", a: "Caja y reportes" }, autor: { id: 1, nombre: "Diego" }, porSoporte: false, origen: "NEGOCIO" },
      { id: 2, fecha: "2026-10-07T16:00:00.000Z", accion: "PERMISOS", rolId: 9, rolNombre: "Caja simple", detalle: { agregados: [{ codigo: "ventas.anular", alcance: "GENERAL" }], quitados: [] }, autor: { id: 1, nombre: "Diego" }, porSoporte: false, origen: "NEGOCIO" },
      { id: 1, fecha: "2026-10-07T15:00:00.000Z", accion: "CREAR", rolId: 9, rolNombre: "Caja simple", detalle: null, autor: { id: 1, nombre: "Diego" }, porSoporte: false, origen: "NEGOCIO" },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bitácora" }));
    await act(async () => {});
    const renglones = within(screen.getByRole("list", { name: "Bitácora de roles" })).getAllByRole("listitem");
    expect(renglones[0]).toHaveTextContent("Diego renombró Caja y reportes");
    expect(renglones[1]).toHaveTextContent("Diego cambió los permisos de Caja simple");
    expect(renglones[2]).toHaveTextContent("Diego creó Caja simple");
  });

  it("QA R1 W-06: lo de la migración o el alta es del Sistema, no de «Alguien»", async () => {
    vi.mocked(apiRoles.bitacora).mockResolvedValue([
      { id: 2, fecha: "2026-10-07T15:00:00.000Z", accion: "CREAR", rolId: 1, rolNombre: "Administrador", detalle: null, autor: null, porSoporte: false, origen: "SISTEMA" },
      // Backend sin `origen`: sin autor y sin soporte, también es del sistema.
      { id: 1, fecha: "2026-10-07T15:00:00.000Z", accion: "CREAR", rolId: 2, rolNombre: "Encargado", detalle: null, autor: null, porSoporte: false },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bitácora" }));
    await act(async () => {});
    const lista = screen.getByRole("list", { name: "Bitácora de roles" });
    expect(lista).toHaveTextContent("Sistema creó Administrador");
    expect(lista).toHaveTextContent("Sistema creó Encargado");
    expect(lista).not.toHaveTextContent("Alguien");
  });

  it("QA R1 W-05: cambiar sólo la descripción se lee (DESCRIPCION y el RENOMBRAR viejo)", async () => {
    vi.mocked(apiRoles.bitacora).mockResolvedValue([
      { id: 2, fecha: "2026-10-07T16:00:00.000Z", accion: "DESCRIPCION", rolId: 3, rolNombre: "Cajero", detalle: { de: null, a: "Cobra en caja" }, autor: { id: 1, nombre: "Omar" }, porSoporte: false, origen: "NEGOCIO" },
      { id: 1, fecha: "2026-10-07T15:00:00.000Z", accion: "RENOMBRAR", rolId: 3, rolNombre: "Cajero", detalle: { descripcion: { de: "Cobra", a: null } }, autor: { id: 1, nombre: "Omar" }, porSoporte: false },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bitácora" }));
    await act(async () => {});
    const renglones = within(screen.getByRole("list", { name: "Bitácora de roles" })).getAllByRole("listitem");
    expect(renglones[0]).toHaveTextContent("Omar cambió la descripción de Cajero");
    expect(renglones[0]).toHaveTextContent("sin descripción → «Cobra en caja»");
    expect(renglones[0]).not.toHaveTextContent("DESCRIPCION");
    expect(renglones[1]).toHaveTextContent("Descripción: «Cobra» → sin descripción");
  });
});
