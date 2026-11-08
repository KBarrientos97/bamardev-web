import { describe, expect, it } from "vitest";
import type { CargoRol } from "../personal";
import { cargoDeDocente, esCargoDocente } from "./docentes";

const cargo = (id: number, nombre: string, permisos: CargoRol["permisos"] = [], esAdministrador = false): CargoRol => ({ id, nombre, esAdministrador, permisos });
const PROPIO = (codigo: string) => ({ codigo, alcance: "PROPIO" as const });
const GENERAL = (codigo: string) => ({ codigo, alcance: "GENERAL" as const });

/** Revisión del 08-nov: el docente se reconoce por sus permisos, no por el nombre del cargo. */
describe("el cargo del docente", () => {
  it("es docente quien pasa lista o carga notas de lo suyo (PROPIO); la Coordinación (GENERAL) y el Administrador, no", () => {
    expect(esCargoDocente(cargo(1, "Profesor", [PROPIO("asistencia.registrar")]))).toBe(true);
    expect(esCargoDocente(cargo(1, "Profesor", [PROPIO("notas.registrar")]))).toBe(true);
    expect(esCargoDocente(cargo(2, "Coordinación", [GENERAL("notas.registrar"), GENERAL("asistencia.registrar")]))).toBe(false);
    expect(esCargoDocente(cargo(3, "Recepción", [GENERAL("academia.inscribir"), PROPIO("academia.ver")]))).toBe(false);
    expect(esCargoDocente(cargo(4, "Administrador", [PROPIO("notas.registrar")], true))).toBe(false);
  });

  it("un rol renombrado o creado como «Profesor» sirve para el alta", () => {
    const cargos = [cargo(9, "Recepción", [GENERAL("academia.inscribir")]), cargo(12, "Profesor", [PROPIO("notas.registrar")])];
    expect(cargoDeDocente(cargos, "Docente")?.id).toBe(12);
  });

  it("entre varios con los permisos, el que se llama como el docente del instituto", () => {
    const cargos = [cargo(12, "Profesor", [PROPIO("notas.registrar")]), cargo(13, "Instructor", [PROPIO("notas.registrar")])];
    expect(cargoDeDocente(cargos, "Instructor")?.id).toBe(13);
    expect(cargoDeDocente(cargos, "Docente")?.id).toBe(12);
  });

  it("sin ninguno con los permisos, el de siempre: el que se llama «Docente»; sin ése, ninguno", () => {
    expect(cargoDeDocente([cargo(5, "Docente"), cargo(9, "Recepción")], "Docente")?.id).toBe(5);
    expect(cargoDeDocente([cargo(9, "Recepción")], "Docente")).toBeUndefined();
  });
});
