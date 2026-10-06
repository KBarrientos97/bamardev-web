import { describe, expect, it } from "vitest";
import type { RolNegocio } from "../types";
import {
  agruparPorDominio,
  alcanceOtorgable,
  nombresDelCatalogo,
  resumenGente,
  rolTiene,
  tonoDeRol,
  veSoloSuAgendaRol,
} from "./roles";

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
  it("el Administrador tiene todo; los demás, lo que traen", () => {
    expect(rolTiene(rol(1, { esAdministrador: true }), "autorizar.pin")).toBe(true);
    expect(rolTiene(rol(2, { permisos: [{ codigo: "autorizar.pin", alcance: "GENERAL" }] }), "autorizar.pin")).toBe(true);
    expect(rolTiene(rol(3), "autorizar.pin")).toBe(false);
    expect(rolTiene(null, "autorizar.pin")).toBe(false);
  });

  it("nadie da lo que no tiene, y 'general' cubre 'sólo lo suyo'", () => {
    const actor = { permisos: ["agenda.ver", "ventas.vender"], permisosPropios: ["agenda.ver"] };
    expect(alcanceOtorgable(actor, "ventas.vender")).toBe("GENERAL");
    expect(alcanceOtorgable(actor, "agenda.ver")).toBe("PROPIO");
    expect(alcanceOtorgable(actor, "gastos.gestionar")).toBeNull();
    expect(alcanceOtorgable({ esAdministrador: true }, "gastos.gestionar")).toBe("GENERAL");
    expect(alcanceOtorgable(null, "ventas.vender")).toBeNull();
  });

  it("agrupa por dominio con el nombre del catálogo, o el código si no hay", () => {
    const nombres = nombresDelCatalogo([
      {
        dominio: "Ventas",
        nombre: "Ventas",
        permisos: [
          { codigo: "ventas.vender", nombre: "Vender", descripcion: "", sensible: false, admitePropio: false, disponible: true, otorgable: true },
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
    expect(veSoloSuAgendaRol(rol(1, { permisos: [{ codigo: "agenda.ver", alcance: "PROPIO" }] }))).toBe(true);
    expect(veSoloSuAgendaRol(rol(2, { permisos: [{ codigo: "agenda.ver", alcance: "GENERAL" }] }))).toBe(false);
    expect(
      veSoloSuAgendaRol(
        rol(3, {
          permisos: [
            { codigo: "agenda.ver", alcance: "PROPIO" },
            { codigo: "agenda.gestionar", alcance: "GENERAL" },
          ],
        }),
      ),
    ).toBe(false);
    expect(veSoloSuAgendaRol(rol(4, { esAdministrador: true }))).toBe(false);
  });

  it("el tono: morado el Administrador, el resto por su lugar en la lista", () => {
    const roles = [rol(1, { esAdministrador: true }), rol(2), rol(3)];
    expect(tonoDeRol(roles[0], roles)).toBe("morado");
    expect(tonoDeRol(roles[1], roles)).toBe("azul");
    expect(tonoDeRol(roles[2], roles)).toBe("verde");
    expect(tonoDeRol(rol(99), roles)).toBe("gris");
  });

  it("la gente de un rol: usuarios y, si hay, personal", () => {
    expect(resumenGente({ usuarios: 1, personal: 0 })).toBe("1 usuario");
    expect(resumenGente({ usuarios: 2, personal: 3 })).toBe("2 usuarios · 3 en personal");
  });
});
