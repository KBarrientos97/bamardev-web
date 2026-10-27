import { describe, expect, it } from "vitest";
import { ajustesDePrueba } from "../../test/academiaFixtures";
import { completo, cuantosHechos, cursoListo, pasosEsperados, pasosPrimeros, type DatosPrimerosPasos } from "./primerosPasos";
import type { Carrera, Docente, GrupoResumen, Sede } from "./tipos";

const sede = (extra: Partial<Sede> = {}): Sede => ({
  id: 1,
  nombre: "Central",
  direccion: "Av. Blanco 123",
  telefono: null,
  horarioAtencion: null,
  esPrincipal: true,
  aulas: 2,
  franjas: 5,
  gruposVigentes: 1,
  ...extra,
});
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
  features: ["academia", "preinscripcion_online", "pagina_publica"],
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
      sedes: [sede({ direccion: null, franjas: 0 })],
      ajustes: ajustesDePrueba({ paginaPublicada: false }),
      cursos: [],
      docentes: [],
      grupos: [],
    });
    expect(completo(pasos)).toBe(false);
    expect(cuantosHechos(pasos)).toBe(0);
    expect(Object.fromEntries(pasos.map((x) => [x.clave, x.a]))).toEqual({
      // Con una sola sede la pantalla ya la muestra entera: el enlace no necesita decir cuál.
      sede: "/configuracion/sedes",
      franjas: "/configuracion/sedes",
      curso: "/configuracion/carreras",
      docente: "/personal",
      grupo: "/academia/calendario",
      pagina: "/mi-pagina",
    });
  });

  it("sede: hace falta la dirección en alguna; una dirección en blanco no cuenta", () => {
    expect(hechos({ ...TODO, sedes: [sede({ direccion: "  " })] }).sede).toBe(false);
    expect(hechos({ ...TODO, sedes: [sede({ direccion: null })] }).sede).toBe(false);
    expect(hechos({ ...TODO, sedes: [sede({ direccion: null }), sede({ id: 2 })] }).sede).toBe(true);
  });

  it("franjas (C5): alcanza con que una sede tenga; ya no se miran los Ajustes ni el inventario", () => {
    expect(hechos({ ...TODO, sedes: [sede({ franjas: 0 })] }).franjas).toBe(false);
    expect(hechos({ ...TODO, sedes: [sede({ franjas: 0 }), sede({ id: 2, franjas: 3 })] }).franjas).toBe(true);
    // Aunque los Ajustes digan lo contrario (franjas viejas o ninguna), manda el conteo de las sedes.
    expect(hechos({ ...TODO, sedes: [sede({ franjas: 0 })], ajustes: ajustesDePrueba() }).franjas).toBe(false);
    expect(hechos({ ...TODO, ajustes: null }).franjas).toBe(true);
  });

  it("con varias sedes, el enlace abre la primera que falta; con una, la pantalla de Sedes a secas", () => {
    const pasos = (sedes: Sede[]) => Object.fromEntries(pasosPrimeros({ ...TODO, sedes }).map((x) => [x.clave, x.a]));
    expect(pasos([sede({ direccion: null, franjas: 0 })])).toMatchObject({ sede: "/configuracion/sedes", franjas: "/configuracion/sedes" });
    expect(pasos([sede(), sede({ id: 7, direccion: null, franjas: 0 })])).toMatchObject({
      sede: "/configuracion/sedes?sede=7&ver=editar",
      franjas: "/configuracion/sedes?sede=7&ver=franjas",
    });
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
    // Con la inscripción en línea pero sin la página pública, el enlace a /mi-pagina rebotaría: no es un paso.
    expect(pasosPrimeros({ ...TODO, features: ["academia", "preinscripcion_online"] }).map((x) => x.clave)).not.toContain("pagina");
    expect(pasosEsperados(["academia", "preinscripcion_online"])).toBe(5);
    expect(pasosEsperados(["academia", "preinscripcion_online", "pagina_publica"])).toBe(6);
    expect(pasosPrimeros({ ...TODO, ajustes: ajustesDePrueba() }).map((x) => x.clave)).not.toContain("pagina");
    expect(hechos({ ...TODO, ajustes: ajustesDePrueba({ paginaPublicada: false }) }).pagina).toBe(false);
  });

  it("lo que no se pudo saber no se inventa: ese paso no aparece, y sin nada no hay «completo»", () => {
    const pasos = pasosPrimeros({ ...TODO, docentes: null, sedes: null });
    // Sin sedes (un corte, un permiso) tampoco se inventa el paso de las franjas.
    expect(pasos.map((x) => x.clave)).toEqual(["curso", "grupo", "pagina"]);
    expect(completo([])).toBe(false);
  });
});
