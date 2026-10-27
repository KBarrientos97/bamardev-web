import { describe, expect, it } from "vitest";
import { ajustesDePrueba } from "../../test/academiaFixtures";
import { completo, cuantosHechos, cursoListo, pasosPrimeros, type DatosPrimerosPasos } from "./primerosPasos";
import type { Almacen } from "../../types";
import type { Carrera, Docente, GrupoResumen } from "./tipos";

const sede = (extra: Partial<Almacen> = {}) => ({ id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", direccion: "Av. Blanco 123", ...extra }) as Almacen;
const curso = (extra: Partial<Carrera> = {}) =>
  ({ id: 1, nombre: "Barbería", activa: true, precioModulo: 500, planes: [], materias: [{ id: 1, activa: true }], ...extra }) as Carrera;
const docente = (extra: Partial<Docente> = {}) => ({ personalId: 1, nombre: "Marco", sedes: [], pctDocente: null, retencionPct: null, tieneLogin: true, ...extra });
const grupo = (extra: Partial<GrupoResumen> = {}) => ({ id: 1, cancelado: false, estado: "EN_CURSO", ...extra }) as GrupoResumen;

const TODO: DatosPrimerosPasos = {
  sedes: [sede()],
  ajustes: ajustesDePrueba({ paginaPublicada: true }),
  cursos: [curso()],
  docentes: [docente()],
  grupos: [grupo()],
  features: ["academia", "preinscripcion_online"],
  palabras: { carrera: "curso", docente: "docente", sede: "sede", Sede: "Sede", Sedes: "Sedes" },
};

const hechos = (d: DatosPrimerosPasos) => Object.fromEntries(pasosPrimeros(d).map((x) => [x.clave, x.hecho]));

describe("C1 · pasos de «Primeros pasos»", () => {
  it("con todo cargado son seis, en orden, y están completos", () => {
    const pasos = pasosPrimeros(TODO);
    expect(pasos.map((x) => x.clave)).toEqual(["sede", "franjas", "curso", "docente", "grupo", "pagina"]);
    expect(completo(pasos)).toBe(true);
    expect(cuantosHechos(pasos)).toBe(6);
  });

  it("un instituto nuevo: nada hecho, y cada paso lleva a su pantalla", () => {
    const pasos = pasosPrimeros({
      ...TODO,
      sedes: [sede({ direccion: null })],
      ajustes: ajustesDePrueba({ franjas: [], paginaPublicada: false }),
      cursos: [],
      docentes: [],
      grupos: [],
    });
    expect(completo(pasos)).toBe(false);
    expect(cuantosHechos(pasos)).toBe(0);
    expect(Object.fromEntries(pasos.map((x) => [x.clave, x.a]))).toEqual({
      sede: "/inventario/almacenes",
      franjas: "/configuracion/academia#s-franjas",
      curso: "/configuracion/carreras",
      docente: "/personal",
      grupo: "/academia/calendario",
      pagina: "/mi-pagina",
    });
  });

  it("sede: hace falta la dirección; un depósito o una sede inactiva no cuentan", () => {
    expect(hechos({ ...TODO, sedes: [sede({ direccion: "  " })] }).sede).toBe(false);
    expect(hechos({ ...TODO, sedes: [sede({ tipo: "DEPOSITO" })] }).sede).toBe(false);
    expect(hechos({ ...TODO, sedes: [sede({ activo: false })] }).sede).toBe(false);
    expect(hechos({ ...TODO, sedes: [sede({ direccion: null }), sede({ id: 2 })] }).sede).toBe(true);
  });

  it("curso: con módulos activos y precio (del módulo o de un plan); retirado o sin módulos no cuenta", () => {
    expect(cursoListo(curso())).toBe(true);
    expect(cursoListo(curso({ precioModulo: null, planes: [{ activo: true, total: 1350 } as never] }))).toBe(true);
    expect(cursoListo(curso({ precioModulo: null }))).toBe(false);
    expect(cursoListo(curso({ materias: [{ id: 1, activa: false } as never] }))).toBe(false);
    expect(cursoListo(curso({ activa: false }))).toBe(false);
  });

  it("docente: tiene que tener acceso; uno sin login no alcanza", () => {
    expect(hechos({ ...TODO, docentes: [docente({ tieneLogin: false })] }).docente).toBe(false);
    expect(hechos({ ...TODO, docentes: [docente({ tieneLogin: false }), docente({ personalId: 2 })] }).docente).toBe(true);
  });

  it("grupo: uno vivo; cancelado o terminado no cuentan", () => {
    expect(hechos({ ...TODO, grupos: [grupo({ cancelado: true }), grupo({ estado: "TERMINADO" })] }).grupo).toBe(false);
    expect(hechos({ ...TODO, grupos: [grupo({ estado: "POR_EMPEZAR" })] }).grupo).toBe(true);
  });

  it("la página en línea sólo es un paso si el plan la trae y el backend dice si está publicada", () => {
    expect(pasosPrimeros({ ...TODO, features: ["academia"] }).map((x) => x.clave)).not.toContain("pagina");
    expect(pasosPrimeros({ ...TODO, ajustes: ajustesDePrueba() }).map((x) => x.clave)).not.toContain("pagina");
    expect(hechos({ ...TODO, ajustes: ajustesDePrueba({ paginaPublicada: false }) }).pagina).toBe(false);
  });

  it("lo que no se pudo saber no se inventa: ese paso no aparece, y sin nada no hay «completo»", () => {
    const pasos = pasosPrimeros({ ...TODO, docentes: null, sedes: null });
    expect(pasos.map((x) => x.clave)).toEqual(["franjas", "curso", "grupo", "pagina"]);
    expect(completo([])).toBe(false);
  });
});
