import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import type { PermisoDeRolVista, RolNegocio } from "../types";
import {
  agruparPorDominio,
  autorDelEvento,
  cantidadPermisos,
  mensajeDeError,
  nombresDelCatalogo,
  renglonesDetalle,
  resumenGente,
  rolSinPermisos,
  rolTiene,
  textoCantidadPermisos,
  tonoDeRol,
  veSoloSuAgendaRol,
} from "./roles";

/** Un permiso como lo manda `GET /roles`: con su nombre y su dominio. */
const p = (
  codigo: string,
  alcance: "GENERAL" | "PROPIO" = "GENERAL",
  nombre = codigo,
  dominio: string | null = null,
): PermisoDeRolVista => ({ codigo, alcance, nombre, dominio });

const rol = (id: number, extra: Partial<RolNegocio> = {}): RolNegocio => ({
  id,
  nombre: `Rol ${id}`,
  descripcion: null,
  esAdministrador: false,
  plantilla: null,
  usuarios: 0,
  personal: 0,
  permisos: [],
  ...extra,
});

describe("lib/roles", () => {
  it("el Administrador tiene todo menos lo de ejecutor; los demás, lo que traen", () => {
    expect(rolTiene(rol(1, { esAdministrador: true }), "autorizar.pin")).toBe(true);
    // No reparte ni agenda "lo suyo": lo cubre con los permisos generales.
    expect(rolTiene(rol(1, { esAdministrador: true }), "entregas.realizar")).toBe(false);
    expect(rolTiene(rol(1, { esAdministrador: true }), "agenda.crear_propias")).toBe(false);
    expect(rolTiene(rol(2, { permisos: [p("autorizar.pin")] }), "autorizar.pin")).toBe(true);
    expect(rolTiene(rol(3), "autorizar.pin")).toBe(false);
    expect(rolTiene(null, "autorizar.pin")).toBe(false);
  });

  it("agrupa por dominio con el nombre que trae el permiso, sin catálogo", () => {
    expect(
      agruparPorDominio(
        [p("ventas.vender", "GENERAL", "Vender", "Ventas"), p("agenda.ver", "PROPIO", "Ver la agenda", "Agenda")],
        new Map(),
      ),
    ).toEqual([
      {
        dominio: "Ventas",
        permisos: [{ codigo: "ventas.vender", alcance: "GENERAL", nombre: "Vender", dominio: "Ventas" }],
      },
      {
        dominio: "Agenda",
        permisos: [{ codigo: "agenda.ver", alcance: "PROPIO", nombre: "Ver la agenda", dominio: "Agenda" }],
      },
    ]);
  });

  it("sin nombre propio, agrupa con el del catálogo, o el código si no hay", () => {
    const nombres = nombresDelCatalogo([
      {
        dominio: "Ventas",
        nombre: "Ventas",
        permisos: [
          {
            codigo: "ventas.vender",
            nombre: "Vender",
            descripcion: "",
            sensible: false,
            admitePropio: false,
            disponible: true,
            otorgable: "GENERAL",
          },
        ],
      },
    ]);
    expect(
      agruparPorDominio(
        [
          { codigo: "ventas.vender", alcance: "GENERAL" },
          { codigo: "agenda.ver", alcance: "PROPIO" },
        ],
        nombres,
      ),
    ).toEqual([
      { dominio: "Ventas", permisos: [{ codigo: "ventas.vender", alcance: "GENERAL", nombre: "Vender" }] },
      { dominio: "Otros", permisos: [{ codigo: "agenda.ver", alcance: "PROPIO", nombre: "agenda.ver" }] },
    ]);
  });

  it("ve sólo su agenda: agenda.ver PROPIO sin gestionar", () => {
    expect(veSoloSuAgendaRol(rol(1, { permisos: [p("agenda.ver", "PROPIO")] }))).toBe(true);
    expect(veSoloSuAgendaRol(rol(2, { permisos: [p("agenda.ver")] }))).toBe(false);
    expect(veSoloSuAgendaRol(rol(3, { permisos: [p("agenda.ver", "PROPIO"), p("agenda.gestionar")] }))).toBe(false);
    expect(veSoloSuAgendaRol(rol(4, { esAdministrador: true }))).toBe(false);
  });

  it("el tono: morado el Administrador, el resto por su lugar en la lista", () => {
    const roles = [rol(1, { esAdministrador: true }), rol(2), rol(3)];
    expect(tonoDeRol(roles[0], roles)).toBe("morado");
    expect(tonoDeRol(roles[1], roles)).toBe("azul");
    expect(tonoDeRol(roles[2], roles)).toBe("verde");
    expect(tonoDeRol(rol(99), roles)).toBe("gris");
  });

  it("los rechazos del contrato, en palabras del dueño", () => {
    const err = (status: number, codigo: string, extra: Record<string, unknown> = {}, mensaje = "x") =>
      new ApiError(mensaje, status, { codigo, ...extra });
    expect(mensajeDeError(err(409, "NOMBRE_REPETIDO"))).toBe("Ya hay un rol con ese nombre.");
    expect(mensajeDeError(err(403, "ROL_BLOQUEADO"))).toBe("El Administrador no se edita ni se borra.");
    expect(mensajeDeError(err(403, "ROL_NO_ASIGNABLE"))).toBe(
      "No podés asignar ese rol: tiene permisos que vos no tenés.",
    );
    expect(mensajeDeError(err(400, "ROL_INVALIDO"))).toBe("Ese rol ya no existe. Recargá la página y elegí otro.");
    // REASIGNAR_REQUERIDO dice cuánta gente hay que pasar.
    expect(mensajeDeError(err(409, "REASIGNAR_REQUERIDO", { usuarios: 2, personal: 1 }))).toBe(
      "El rol lo tienen 2 usuarios y 1 persona de Personal: elegí a qué rol pasan.",
    );
    expect(mensajeDeError(err(409, "REASIGNAR_REQUERIDO", { usuarios: 0, personal: 3 }))).toBe(
      "El rol lo tienen 3 personas de Personal: elegí a qué rol pasan.",
    );
    // PERMISO_NO_OTORGABLE nombra los permisos con el catálogo; sin él, queda
    // el mensaje del backend, que ya los nombra.
    const nombres = nombresDelCatalogo([
      {
        dominio: "Gastos",
        nombre: "Gastos",
        permisos: [
          {
            codigo: "gastos.gestionar",
            nombre: "Gastos",
            descripcion: "",
            sensible: false,
            admitePropio: false,
            disponible: true,
            otorgable: null,
          },
        ],
      },
    ]);
    const noOtorgable = err(
      403,
      "PERMISO_NO_OTORGABLE",
      { permisos: ["gastos.gestionar"] },
      "No podés dar un permiso que vos no tenés: Gastos.",
    );
    expect(mensajeDeError(noOtorgable, { nombres })).toBe("No podés dar lo que no tenés: Gastos.");
    expect(mensajeDeError(noOtorgable)).toBe("No podés dar un permiso que vos no tenés: Gastos.");
    // Lo que no es del contrato, tal cual; sin mensaje, el genérico.
    expect(mensajeDeError(new Error("Sin conexión"))).toBe("Sin conexión");
    expect(mensajeDeError(null, { generico: "No se pudo dar el acceso" })).toBe("No se pudo dar el acceso");
  });

  it("la gente de un rol: usuarios y, si hay, personal", () => {
    expect(resumenGente({ usuarios: 1, personal: 0 })).toBe("1 usuario");
    expect(resumenGente({ usuarios: 2, personal: 3 })).toBe("2 usuarios · 3 en personal");
  });
});

describe("lo efectivo de un rol (QA R1 W-02/W-03/W-10)", () => {
  const fuera = (codigo: string, alcance: "GENERAL" | "PROPIO" = "GENERAL") => ({ ...p(codigo, alcance), disponible: false });

  it("cuenta sólo lo disponible; el número del backend manda si llega", () => {
    const r = rol(1, { permisos: [p("ventas.vender"), fuera("agenda.ver"), p("caja.operar")] });
    expect(cantidadPermisos(r)).toBe(2);
    expect(cantidadPermisos({ ...r, permisosDisponibles: 1 })).toBe(1);
    expect(textoCantidadPermisos(r)).toBe("2 permisos");
    expect(textoCantidadPermisos({ ...r, permisosDisponibles: 1 })).toBe("1 permiso");
    expect(textoCantidadPermisos(rol(2, { permisos: [fuera("agenda.ver")] }))).toBe("Sin permisos");
    expect(textoCantidadPermisos(rol(3, { esAdministrador: true }))).toBe("Todos los permisos");
  });

  it("sin el campo disponible (backend viejo, /personal/cargos) cuenta todo", () => {
    expect(cantidadPermisos(rol(1, { permisos: [p("ventas.vender"), p("agenda.ver")] }))).toBe(2);
  });

  it("un permiso fuera del plan no lo tiene: ni para el PIN, ni la sucursal, ni la agenda propia", () => {
    const r = rol(1, { permisos: [fuera("autorizar.pin"), fuera("agenda.ver", "PROPIO")] });
    expect(rolTiene(r, "autorizar.pin")).toBe(false);
    expect(veSoloSuAgendaRol(r)).toBe(false);
  });

  it("un rol sin nada efectivo avisa; el Administrador nunca", () => {
    expect(rolSinPermisos(rol(1))).toBe(true);
    expect(rolSinPermisos(rol(1, { permisos: [fuera("agenda.ver")] }))).toBe(true);
    expect(rolSinPermisos(rol(1, { permisos: [p("ventas.vender")] }))).toBe(false);
    expect(rolSinPermisos(rol(1, { esAdministrador: true }))).toBe(false);
    expect(rolSinPermisos(null)).toBe(false);
  });
});

describe("la bitácora (QA R1 W-05/W-06)", () => {
  it("quién: Sistema, Soporte o la persona", () => {
    expect(autorDelEvento({ origen: "SISTEMA", porSoporte: false, autor: null })).toBe("Sistema");
    expect(autorDelEvento({ origen: "SOPORTE", porSoporte: true, autor: { id: 1, nombre: "Kevin" } })).toBe("Soporte de BamarDev");
    expect(autorDelEvento({ origen: "NEGOCIO", porSoporte: false, autor: { id: 1, nombre: "Omar" } })).toBe("Omar");
    // Backend sin `origen`.
    expect(autorDelEvento({ porSoporte: true, autor: null })).toBe("Soporte de BamarDev");
    expect(autorDelEvento({ porSoporte: false, autor: null })).toBe("Sistema");
  });

  it("DESCRIPCION se lee como un cambio de descripción, no de nombre", () => {
    const nombres = nombresDelCatalogo([]);
    expect(renglonesDetalle({ accion: "DESCRIPCION", detalle: { de: "Cobra", a: "Cobra y vende" } }, nombres)).toEqual([
      "«Cobra» → «Cobra y vende»",
    ]);
    expect(renglonesDetalle({ accion: "DESCRIPCION", detalle: { de: "Cobra", a: null } }, nombres)).toEqual([
      "«Cobra» → sin descripción",
    ]);
    expect(
      renglonesDetalle({ accion: "RENOMBRAR", detalle: { de: "Caja", a: "Cajero", descripcion: { de: null, a: "Cobra" } } }, nombres),
    ).toEqual(["Caja → Cajero", "Descripción: sin descripción → «Cobra»"]);
  });
});
