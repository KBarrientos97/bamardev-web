import { describe, expect, it } from "vitest";
import type { CargoRol } from "../personal";
import { aliasDeLaDireccion, usuarioDeLaDireccion } from "../aliasDeLaUrl";
import {
  cargoDeDocente,
  enlaceAccesoDocente,
  esCargoDocente,
  esUsuarioValido,
  mensajeAccesoDocente,
  telefonoOculto,
  usuarioSugerido,
} from "./docentes";

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

/** Rediseño de noviembre: el alta y el acceso del docente desde la pantalla Docentes. */
describe("el usuario que se le propone al docente", () => {
  it("sale del primer nombre, en minúsculas y sin tildes ni espacios", () => {
    expect(usuarioSugerido("Lucía Fernández")).toBe("lucia");
    expect(usuarioSugerido("  ÑANDÚ  Pérez ")).toBe("nandu");
    expect(usuarioSugerido("José María")).toBe("jose");
  });

  it("si ya existe, le agrega un número (y no choca con mayúsculas)", () => {
    expect(usuarioSugerido("Lucía Fernández", ["lucia"])).toBe("lucia2");
    expect(usuarioSugerido("Lucía Fernández", ["Lucia", "lucia2"])).toBe("lucia3");
  });

  it("con un nombre muy corto va el nombre entero pegado; vacío, nada", () => {
    expect(usuarioSugerido("Al Paz")).toBe("alpaz");
    expect(usuarioSugerido("   ")).toBe("");
  });

  it("lo propuesto pasa la validación del alta", () => {
    expect(esUsuarioValido(usuarioSugerido("Lucía Fernández", ["lucia"]))).toBe(true);
    expect(esUsuarioValido("a")).toBe(false);
  });
});

describe("el acceso que se le manda por WhatsApp", () => {
  it("el teléfono de la tarjeta tapa los dígitos del medio", () => {
    expect(telefonoOculto("70490686")).toBe("+591 704•••86");
    expect(telefonoOculto("+591 70490686")).toBe("+591 704•••86");
    expect(telefonoOculto(null)).toBe("");
  });

  it("el enlace abre el login con el negocio y el usuario, y nunca lleva la clave", () => {
    const enlace = enlaceAccesoDocente("https://app.bamardev.com", "drick", "lucia");
    expect(enlace).toBe("https://app.bamardev.com/academia/mis-clases?negocio=drick&usuario=lucia");
    const url = new URL(enlace);
    expect(aliasDeLaDireccion(url.search)).toBe("drick");
    expect(usuarioDeLaDireccion(url.search)).toBe("lucia");
    expect(enlace).not.toMatch(/clave|password|contrase/i);
    // Sin alias en la sesión, sólo el usuario.
    expect(enlaceAccesoDocente("https://x", undefined, "lucia")).toBe("https://x/academia/mis-clases?usuario=lucia");
  });

  it("el mensaje lleva el enlace y el usuario, y dice que la contraseña va aparte", () => {
    const m = mensajeAccesoDocente({ nombre: "Lucía Fernández", negocio: "Drick", enlace: "https://x/y", usuario: "lucia" });
    expect(m).toContain("Hola Lucía");
    expect(m).toContain("https://x/y");
    expect(m).toContain("«lucia»");
    expect(m).toContain("La contraseña te la paso aparte.");
  });
});
