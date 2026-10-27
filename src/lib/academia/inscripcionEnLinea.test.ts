import { describe, expect, it } from "vitest";
import { ajustesDePrueba } from "../../test/academiaFixtures";
import { condicionesInscripcionEnLinea, faltantes, grupoRecibe, type EntradaEnLinea } from "./inscripcionEnLinea";
import type { Carrera, GrupoResumen } from "./tipos";

const curso = (extra: Partial<Carrera> = {}) => ({ id: 1, nombre: "Barbería", activa: true, publicarEnPagina: true, ...extra }) as Carrera;
const grupo = (extra: Partial<GrupoResumen> = {}) =>
  ({ id: 7, inscripcionAbierta: true, cancelado: false, estado: "EN_CURSO", ...extra }) as GrupoResumen;

const TODO_BIEN: EntradaEnLinea = {
  features: ["academia", "preinscripcion_online"],
  ajustes: ajustesDePrueba({ preinscripcionActiva: true, paginaPublicada: true }),
  cursos: [curso()],
  grupos: [grupo()],
  palabras: { carreras: "cursos", Carreras: "Cursos" },
};

const por = (e: EntradaEnLinea) => Object.fromEntries(condicionesInscripcionEnLinea(e).map((c) => [c.clave, c]));

describe("C7 · condiciones de la inscripción en línea", () => {
  it("con todo prendido, las cinco están bien y no falta nada", () => {
    const c = condicionesInscripcionEnLinea(TODO_BIEN);
    expect(c.map((x) => x.clave)).toEqual(["plan", "recibir", "cursos", "pagina", "grupo"]);
    expect(c.every((x) => x.ok === true)).toBe(true);
    expect(faltantes(c)).toHaveLength(0);
  });

  it("sin la feature en el plan: falla, y no hay a dónde ir (lo cambia BamarDev)", () => {
    const c = por({ ...TODO_BIEN, features: ["academia"] });
    expect(c.plan.ok).toBe(false);
    expect(c.plan.arreglo).toBeUndefined();
    expect(c.plan.detalle).toMatch(/BamarDev/);
  });

  it("«Recibir inscripciones» apagado: se arregla ahí mismo", () => {
    const c = por({ ...TODO_BIEN, ajustes: ajustesDePrueba({ preinscripcionActiva: false, paginaPublicada: true }) });
    expect(c.recibir.ok).toBe(false);
    expect(c.recibir.arreglo).toEqual({ texto: "Activar", accion: "activar-recibir" });
  });

  it("ningún curso publicado: lleva a Cursos; con alguno, cuenta cuántos", () => {
    let c = por({ ...TODO_BIEN, cursos: [curso({ publicarEnPagina: false }), curso({ id: 2, publicarEnPagina: false })] });
    expect(c.cursos.ok).toBe(false);
    expect(c.cursos.arreglo).toEqual({ texto: "Ir a Cursos", a: "/configuracion/carreras" });
    expect(c.cursos.detalle).toMatch(/nace apagado/);
    c = por({ ...TODO_BIEN, cursos: [curso(), curso({ id: 2, publicarEnPagina: false }), curso({ id: 3, activa: false })] });
    expect(c.cursos.ok).toBe(true);
    expect(c.cursos.detalle).toBe("1 de 2 publicados.");
  });

  it("un curso retirado no cuenta aunque esté marcado para la página", () => {
    const c = por({ ...TODO_BIEN, cursos: [curso({ activa: false })] });
    expect(c.cursos.ok).toBe(false);
  });

  it("Mi página sin publicar: lleva a Mi página; un backend que no lo manda no opina", () => {
    let c = por({ ...TODO_BIEN, ajustes: ajustesDePrueba({ preinscripcionActiva: true, paginaPublicada: false }) });
    expect(c.pagina.ok).toBe(false);
    expect(c.pagina.arreglo).toEqual({ texto: "Ir a Mi página", a: "/mi-pagina" });
    c = por({ ...TODO_BIEN, ajustes: ajustesDePrueba({ preinscripcionActiva: true }) });
    expect(c.pagina).toBeUndefined();
  });

  it("sin un grupo con la inscripción abierta: lleva al Calendario; cancelado o terminado no cuentan", () => {
    let c = por({ ...TODO_BIEN, grupos: [grupo({ inscripcionAbierta: false }), grupo({ cancelado: true }), grupo({ estado: "TERMINADO" })] });
    expect(c.grupo.ok).toBe(false);
    expect(c.grupo.arreglo).toEqual({ texto: "Ir al Calendario", a: "/academia/calendario" });
    c = por({ ...TODO_BIEN, grupos: [grupo({ estado: "POR_EMPEZAR" })] });
    expect(c.grupo.ok).toBe(true);
    expect(grupoRecibe(grupo({ cancelado: true }))).toBe(false);
  });

  it("lo que todavía no cargó o no se pudo comprobar queda en «?», no en falta", () => {
    let c = condicionesInscripcionEnLinea({ ...TODO_BIEN, ajustes: null, cursos: null, grupos: null });
    expect(c.map((x) => x.ok)).toEqual([true, null, null, null, null]);
    expect(faltantes(c)).toHaveLength(0);
    c = condicionesInscripcionEnLinea({ ...TODO_BIEN, grupos: "error" });
    expect(c.find((x) => x.clave === "grupo")).toMatchObject({ ok: null, detalle: "No se pudieron comprobar los grupos." });
  });
});
