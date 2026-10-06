import { describe, expect, it } from "vitest";
import type { SesionNegocio } from "../types";
import { conPerfilDelEstado } from "./perfilNegocio";
import { TEMAS } from "./temas";

const PERFIL = {
  rubro: "BARBERIA",
  nombre: "Barbería",
  vertical: "BELLEZA",
  estado: "EN_DESARROLLO" as const,
  icono: "navaja",
  etiquetasRol: { CAJERO: "Recepción", PROFESIONAL: "Barbero" },
  config: { rolesOfrecidos: ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] },
};

const BARBERIA: SesionNegocio = {
  id: 9,
  nombre: "Barbería QA",
  tipoNegocio: "BARBERIA",
  features: ["pos", "caja"],
};

describe("conPerfilDelEstado", () => {
  it("un backend que no manda perfilVersion no cambia nada", () => {
    // Es el backend de hoy: la sesión tiene que quedar idéntica (la misma
    // referencia, para no recalcular permisos en cada chequeo).
    expect(conPerfilDelEstado(BARBERIA, {})).toBe(BARBERIA);
    expect(conPerfilDelEstado(BARBERIA, { perfilVersion: null })).toBe(BARBERIA);
  });

  it("la misma versión tampoco", () => {
    const guardada = { ...BARBERIA, perfilVersion: 3, perfil: PERFIL };
    const otraPaleta = { tokens: TEMAS.SPA, clave: "LAVANDA" };
    expect(conPerfilDelEstado(guardada, { perfilVersion: 3, tema: otraPaleta })).toBe(guardada);
  });

  it("una versión nueva trae el tema y el perfil", () => {
    const guardada = { ...BARBERIA, perfilVersion: 3 };
    const tema = { clave: "LAVANDA", tokens: TEMAS.SPA };
    const nueva = conPerfilDelEstado(guardada, { perfilVersion: 4, tema, perfil: PERFIL });
    expect(nueva).toEqual({ ...guardada, perfilVersion: 4, tema, perfil: PERFIL });
    // Lo demás de la sesión no se toca.
    expect(nueva.features).toBe(BARBERIA.features);
  });

  it("un campo ausente no borra el que había", () => {
    const tema = { clave: "CARBON", tokens: TEMAS.BARBERIA };
    const guardada = { ...BARBERIA, perfilVersion: 1, tema, perfil: PERFIL };
    const nueva = conPerfilDelEstado(guardada, { perfilVersion: 2 });
    expect(nueva.tema).toBe(tema);
    expect(nueva.perfil).toBe(PERFIL);
    expect(nueva.perfilVersion).toBe(2);
  });

  it("un null explícito sí lo saca (vuelve al color del rubro)", () => {
    const tema = { clave: "CARBON", tokens: TEMAS.BARBERIA };
    const guardada = { ...BARBERIA, perfilVersion: 1, tema };
    expect(conPerfilDelEstado(guardada, { perfilVersion: 2, tema: null }).tema).toBeNull();
  });
});
