import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { esDatoViejo, esReintentable, mensajeDelBackend, tieneCodigo } from "./errores";

describe("errores de academia", () => {
  it("el mensaje del backend se muestra tal cual; el de respaldo sólo para lo que no es un error", () => {
    expect(mensajeDelBackend(new ApiError("El grupo tiene 3 estudiantes inscritos: retiralos antes.", 409, { codigo: "GRUPO_CON_INSCRITOS" }), "No se pudo")).toBe(
      "El grupo tiene 3 estudiantes inscritos: retiralos antes.",
    );
    expect(mensajeDelBackend("algo raro", "No se pudo")).toBe("No se pudo");
    expect(mensajeDelBackend(new Error(""), "No se pudo")).toBe("No se pudo");
  });

  it("sólo CUOTAS_CAMBIARON es reintentable", () => {
    expect(esReintentable(new ApiError("x", 409, { codigo: "CUOTAS_CAMBIARON" }))).toBe(true);
    expect(esReintentable(new ApiError("x", 409, { codigo: "GRUPO_CON_INSCRITOS" }))).toBe(false);
    expect(esReintentable(new Error("x"))).toBe(false);
  });

  it("CUOTA_SIN_SALDO y GRUPO_CANCELADO dicen que lo que se ve ya cambió", () => {
    expect(esDatoViejo(new ApiError("x", 400, { codigo: "CUOTA_SIN_SALDO" }))).toBe(true);
    expect(esDatoViejo(new ApiError("x", 400, { codigo: "GRUPO_CANCELADO" }))).toBe(true);
    expect(esDatoViejo(new ApiError("x", 403, { codigo: "CLASE_DE_OTRO_DOCENTE" }))).toBe(false);
    expect(tieneCodigo(new ApiError("x", 403), "CLASE_DE_OTRO_DOCENTE")).toBe(false);
  });
});
