import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { fueraDeAlcance, rutaCobroAlumno, rutaCobroInscripcion, textoEvento } from "./vista";

/**
 * El historial de la ficha: el `detalle` de cada evento es el JSON que guardó
 * el backend y se pintaba tal cual ("INSCRIBIR · [object Object]", QA ronda
 * 2, B-17). Acá se lee en palabras.
 */
describe("textoEvento", () => {
  const limpio = (s: string) => s.replace(/\s/g, " ");

  it("la inscripción dice el total y, si hubo rebaja, el precio de lista", () => {
    const t = textoEvento({ accion: "INSCRIBIR", detalle: { planPagoId: 3, precioLista: 1500, total: 1350 } });
    expect(t.titulo).toBe("Inscripción");
    expect(limpio(t.detalle)).toMatch(/^total Bs 1\.350,00 · precio de lista Bs 1\.500,00$/);
  });

  it("sin montos (el docente) queda el título solo, nunca [object Object]", () => {
    const t = textoEvento({ accion: "INSCRIBIR", detalle: { planPagoId: 3, precioLista: null, total: null } });
    expect(t).toEqual({ titulo: "Inscripción", detalle: "" });
  });

  it("la beca con su porcentaje y su motivo", () => {
    const t = textoEvento({ accion: "BECA", detalle: { pct: 50, monto: null, motivo: "Rendimiento", autorizadoPorId: 1 } });
    expect(t).toEqual({ titulo: "Beca 50 %", detalle: "Rendimiento" });
  });

  it("el retiro con el motivo y las cuotas anuladas", () => {
    const t = textoEvento({ accion: "RETIRO", detalle: { motivo: "Se mudó", cuotasAnuladas: [10, 11] } });
    expect(t).toEqual({ titulo: "Retiro", detalle: "Se mudó · 2 cuotas anuladas" });
  });

  it("la nota corregida y las notas reabiertas", () => {
    expect(textoEvento({ accion: "NOTA", detalle: { materiaId: 3, anterior: 60, nueva: 75 } })).toEqual({ titulo: "Nota corregida", detalle: "de 60 a 75" });
    expect(textoEvento({ accion: "NOTA", detalle: { materiaId: 3, reabierta: true, motivo: "Recuperatorio" } })).toEqual({
      titulo: "Notas reabiertas",
      detalle: "Recuperatorio",
    });
  });

  it("la inscripción online cuenta las fotos", () => {
    const t = textoEvento({ accion: "PREINSCRIBIR", detalle: { origen: "ONLINE", edad: 17, fotos: ["FOTO", "CI_ANVERSO"] } });
    expect(t).toEqual({ titulo: "Inscripción online", detalle: "desde la página · 17 años · con 2 de 3 fotos" });
  });

  it("una acción desconocida se lee igual, sin los ids", () => {
    const t = textoEvento({ accion: "CAMBIO_SEDE", detalle: { deId: 1, aId: 2, motivo: "Horario" } });
    expect(t).toEqual({ titulo: "Cambio sede", detalle: "motivo Horario" });
  });

  it("un detalle de texto se muestra tal cual", () => {
    expect(textoEvento({ accion: "Inscripción", detalle: "plan Cuotas" })).toEqual({ titulo: "Inscripción", detalle: "plan Cuotas" });
  });
});

describe("fueraDeAlcance (QA ronda 2, N-3)", () => {
  it("otra sede, lo que no existe (o no es del docente), y lo que no es de alcance", () => {
    expect(fueraDeAlcance(new ApiError("Ese grupo es de otra sede", 403, { codigo: "OTRA_SEDE" }))).toBe("OTRA_SEDE");
    expect(fueraDeAlcance(new ApiError("Ese grupo no existe", 404, { codigo: "GRUPO_NO_EXISTE" }))).toBe("NO_EXISTE");
    expect(fueraDeAlcance(new ApiError("No existe", 404))).toBe("NO_EXISTE");
    expect(fueraDeAlcance(new ApiError("Ese día el grupo no tiene clase.", 404, { codigo: "SIN_CLASE" }))).toBeNull();
    expect(fueraDeAlcance(new ApiError("Sin permiso", 403))).toBeNull();
    expect(fueraDeAlcance(new Error("Sin conexión"))).toBeNull();
  });
});

describe("A1: Cobrar lleva a «Cobrar a estudiante», no al POS", () => {
  it("con la inscripción, lo acordado y la sede del grupo", () => {
    expect(rutaCobroInscripcion(103, { id: 2, nombre: "Norte" }, 350)).toBe(
      "/academia/cobranza/cobrar?inscripcion=103&monto=350&sede=2&sedeNombre=Norte",
    );
    expect(rutaCobroInscripcion(103)).toBe("/academia/cobranza/cobrar?inscripcion=103");
  });

  it("sin la inscripción, busca al estudiante por su código (o su nombre)", () => {
    expect(rutaCobroAlumno({ id: 53, nombre: "Céspedes", codigo: "2026-0103" })).toBe(
      "/academia/cobranza/cobrar?alumno=53&q=2026-0103",
    );
    expect(rutaCobroAlumno({ id: 53, nombre: "Céspedes" })).toBe("/academia/cobranza/cobrar?alumno=53&q=C%C3%A9spedes");
  });
});
