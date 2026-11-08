import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendario } from "../../lib/academia/tipos";
import type { Persona } from "../../lib/personal";

/**
 * Docentes (rediseño de noviembre): la gente de Personal con el cargo de
 * docente, con su acceso, sus grupos del mes y el acceso por WhatsApp (el
 * enlace con el negocio y el usuario, nunca la clave); y el alta rápida con
 * el usuario propuesto por el nombre.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, permisos: [...s.usuario.permisos, "personal.gestionar"] },
      negocio: { ...s.negocio, nombre: "Drick", alias: "drick" },
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn(async () => [{ id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL" }]) } };
});

vi.mock("../../lib/personal", () => ({
  apiPersonal: { listar: vi.fn(), cargos: vi.fn(), crear: vi.fn(), darAcceso: vi.fn() },
}));

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { calendario: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { apiPersonal } from "../../lib/personal";
import Docentes from "./Docentes";

const persona = (extra: Partial<Persona>): Persona => ({
  id: 1,
  nombre: "",
  cargoRolId: 5,
  cargo: "Docente",
  activo: true,
  color: null,
  sucursalIds: [1],
  usuarioId: null,
  conAcceso: false,
  recursoId: null,
  profesional: null,
  telefono: null,
  acceso: null,
  ...extra,
});

const LUCIA = persona({
  id: 21,
  nombre: "Lucía Fernández",
  telefono: "70490686",
  usuarioId: 40,
  conAcceso: true,
  acceso: { usuarioId: 40, username: "lucia", rol: null, rolId: 5, rolNombre: "Docente", activo: true, ultimoLogin: null },
});
const PEDRO = persona({ id: 22, nombre: "Pedro Gil" });
const RECEPCION = persona({ id: 23, nombre: "Ana Recepción", cargoRolId: 6, cargo: "Recepción" });

const CARGOS = [
  { id: 5, nombre: "Docente", esAdministrador: false, permisos: [{ codigo: "asistencia.registrar", alcance: "PROPIO" as const }] },
  { id: 6, nombre: "Recepción", esAdministrador: false, permisos: [{ codigo: "academia.inscribir", alcance: "GENERAL" as const }] },
];

const grupoCal = (grupoId: number, nombre: string, personalId: number) => ({
  grupoId,
  nombre,
  carrera: { id: 3, nombre: "Barbería" },
  modulo: { orden: 2, nombre: "Degradados", total: 3 },
  ultimo: false,
  dias: [1, 3, 5],
  aula: "Aula 2",
  docente: { personalId, nombre: "Lucía Fernández" },
  inscritos: 14,
  cupo: null,
  inscripcionAbierta: false,
  pagaronModulo: null,
});

const CALENDARIO: Calendario = {
  sede: null,
  meses: ["2026-11"],
  filas: [
    { inicio: "08:00", fin: "10:00", esFranja: true, celdas: [{ mes: "2026-11", grupos: [grupoCal(7, "L-M-V 08:00–10:00", 21)] }] },
    { inicio: "19:00", fin: "21:00", esFranja: true, celdas: [{ mes: "2026-11", grupos: [grupoCal(8, "L-M-V 19:00–21:00", 21)] }] },
  ],
};

let abrir: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  abrir = vi.spyOn(window, "open").mockReturnValue(null);
  vi.mocked(apiPersonal.listar).mockResolvedValue([PEDRO, LUCIA, RECEPCION]);
  vi.mocked(apiPersonal.cargos).mockResolvedValue(CARGOS);
  vi.mocked(apiAcademia.calendario).mockResolvedValue(CALENDARIO);
});
afterEach(() => abrir.mockRestore());

async function montar() {
  render(
    <MemoryRouter>
      <Docentes />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** El texto del `wa.me` que se abrió, ya decodificado. */
const textoDelWhatsapp = () => {
  const url = new URL(String(abrir.mock.calls[0][0]));
  return { numero: url.pathname, texto: url.searchParams.get("text") ?? "" };
};

describe("Docentes", () => {
  it("sólo los de cargo docente, con el WhatsApp tapado, si entran al sistema y sus grupos del mes", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Docentes" })).toBeInTheDocument();
    const lista = within(screen.getByRole("list", { name: "Docentes" }));
    expect(lista.getAllByRole("listitem", { name: /./ }).map((li) => li.getAttribute("aria-label"))).toEqual(["Lucía Fernández", "Pedro Gil"]);
    expect(screen.queryByText("Ana Recepción")).not.toBeInTheDocument();

    const lucia = screen.getByRole("listitem", { name: "Lucía Fernández" });
    expect(lucia).toHaveTextContent("LF");
    expect(lucia).toHaveTextContent("WhatsApp +591 704•••86");
    expect(lucia).not.toHaveTextContent("70490686");
    expect(lucia).toHaveTextContent("Puede entrar · usuario lucia");
    const grupos = within(within(lucia).getByRole("list", { name: "Grupos de Lucía Fernández" })).getAllByRole("link");
    expect(grupos.map((g) => g.textContent)).toEqual([
      "Barbería · L-M-V 08:00–10:00 · M2 Degradados · Aula 2",
      "Barbería · L-M-V 19:00–21:00 · M2 Degradados · Aula 2",
    ]);
    expect(grupos[0]).toHaveAttribute("href", "/academia/grupos/7");
    // Sin la clave en ningún lado y sin «Darle acceso» para quien ya entra.
    expect(within(lucia).queryByRole("link", { name: /Darle acceso/ })).not.toBeInTheDocument();

    const pedro = screen.getByRole("listitem", { name: "Pedro Gil" });
    expect(pedro).toHaveTextContent("Sin WhatsApp cargado");
    expect(pedro).toHaveTextContent("Sin acceso");
    expect(pedro).toHaveTextContent("Este mes no dicta ningún grupo.");
    expect(within(pedro).queryByRole("button", { name: /WhatsApp/ })).not.toBeInTheDocument();
    // Darle acceso es la ficha de Personal, ya abierta.
    expect(within(pedro).getByRole("link", { name: /Darle acceso/ })).toHaveAttribute("href", "/personal?persona=22");
    // No hay «Ver su horario»: el Calendario no filtra por docente.
    expect(screen.queryByText(/Ver su horario/)).not.toBeInTheDocument();
  });

  it("«Mandarle el acceso por WhatsApp» abre wa.me con el enlace al login (negocio y usuario puestos), sin la clave", async () => {
    await montar();
    fireEvent.click(within(screen.getByRole("listitem", { name: "Lucía Fernández" })).getByRole("button", { name: "Mandarle el acceso por WhatsApp" }));
    expect(abrir).toHaveBeenCalledTimes(1);
    const { numero, texto } = textoDelWhatsapp();
    expect(numero).toBe("/59170490686");
    expect(texto).toContain(`${window.location.origin}/academia/mis-clases?negocio=drick&usuario=lucia`);
    expect(texto).toContain("Tu usuario es «lucia»");
    expect(texto).toContain("La contraseña te la paso aparte.");
    expect(texto).not.toMatch(/password|clave:/i);
  });

  it("si los grupos no se pueden leer, la lista va igual (sin decir que no dictan nada)", async () => {
    vi.mocked(apiAcademia.calendario).mockRejectedValue(new Error("sin red"));
    await montar();
    expect(screen.getByRole("listitem", { name: "Lucía Fernández" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Grupos de/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/no dicta/)).not.toBeInTheDocument();
  });
});

describe("Docentes · «Nuevo docente»", () => {
  it("propone el usuario con el nombre (con un número si ya existe), se puede cambiar, y al guardar ofrece mandarle el acceso", async () => {
    vi.mocked(apiPersonal.crear).mockResolvedValue({ ...PEDRO, id: 30, nombre: "Lucía Paz" });
    vi.mocked(apiPersonal.darAcceso).mockResolvedValue({ ...PEDRO, id: 30 });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo docente" }));
    await act(async () => {}); // los cargos, la gente y las sedes
    const panel = within(screen.getByRole("region", { name: "Nuevo docente" }));
    fireEvent.change(panel.getByLabelText("Nombre y apellido"), { target: { value: "Lucía Paz" } });
    fireEvent.change(panel.getByLabelText(/WhatsApp/), { target: { value: "71234567" } });
    fireEvent.click(panel.getByRole("switch", { name: "Que pueda entrar al sistema (pasar lista y notas)" }));
    // «lucia» ya es de Lucía Fernández: va con un número.
    expect(panel.getByLabelText("Usuario")).toHaveValue("lucia2");
    fireEvent.change(panel.getByLabelText("Usuario"), { target: { value: "luciapaz" } });
    // Escrito a mano, el nombre ya no lo pisa.
    fireEvent.change(panel.getByLabelText("Nombre y apellido"), { target: { value: "Lucía Paz Rojas" } });
    expect(panel.getByLabelText("Usuario")).toHaveValue("luciapaz");
    fireEvent.change(panel.getByLabelText("Contraseña"), { target: { value: "secreta1" } });
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Guardar docente" }));
    });
    expect(apiPersonal.crear).toHaveBeenCalledWith({ nombre: "Lucía Paz Rojas", telefono: "71234567", cargoRolId: 5, sucursalIds: [1] });
    expect(apiPersonal.darAcceso).toHaveBeenCalledWith(30, { username: "luciapaz", password: "secreta1", rolId: 5, sucursalId: 1 });
    // Vuelve a pedir la lista y ofrece el WhatsApp.
    expect(apiPersonal.listar).toHaveBeenCalledTimes(3);
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("entra como «luciapaz»");
    fireEvent.click(within(aviso).getByRole("button", { name: "Mandarle el acceso por WhatsApp" }));
    const { numero, texto } = textoDelWhatsapp();
    expect(numero).toBe("/59171234567");
    expect(texto).toContain("usuario=luciapaz");
    expect(texto).not.toContain("secreta1");
  });

  it("sin acceso no ofrece el WhatsApp (no hay usuario que mandar)", async () => {
    vi.mocked(apiPersonal.crear).mockResolvedValue({ ...PEDRO, id: 31, nombre: "Raúl Vega" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo docente" }));
    await act(async () => {});
    const panel = within(screen.getByRole("region", { name: "Nuevo docente" }));
    fireEvent.change(panel.getByLabelText("Nombre y apellido"), { target: { value: "Raúl Vega" } });
    fireEvent.change(panel.getByLabelText(/WhatsApp/), { target: { value: "71234567" } });
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Guardar docente" }));
    });
    expect(apiPersonal.darAcceso).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("sin acceso al sistema");
    expect(within(screen.getByRole("status")).queryByRole("button", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});
