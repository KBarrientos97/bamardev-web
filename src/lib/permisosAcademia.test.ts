import { describe, expect, it } from "vitest";
import { ctxDe } from "../test/sesiones";
import { cobraCuotas, puedeVer, rutaInicial, type Seccion } from "./permisos";
import { veMontosAcademia } from "./permisosAcademia";

/**
 * La vertical Educación (PLAN-ACADEMIAS-TECNICO §5 y §8): cada sección pide
 * su permiso y su feature, nada se decide por el rubro. Las features son
 * estrictas: sin `academia` en la lista, nada de esto existe.
 */

const FEATURES = ["pos", "caja", "catalogo", "usuarios", "inventario", "academia", "asistencia", "notas", "preinscripcion_online", "pagina_publica"];
const SECCIONES: Seccion[] = [
  "academia_hoy",
  "academia_grupos",
  "academia_alumnos",
  "academia_preinscripciones",
  "academia_cobranza",
  "academia_carreras",
  "academia_ajustes",
];

const ve = (rol: "ADMIN" | "SUPERVISOR" | "CAJERO" | "PROFESIONAL", features = FEATURES) => {
  const c = ctxDe(rol, "ACADEMIA", features);
  return SECCIONES.filter((s) => puedeVer(c, s));
};

describe("secciones de la academia", () => {
  it("la dirección ve todo", () => {
    expect(ve("ADMIN")).toEqual(SECCIONES);
  });

  it("la coordinación no configura carreras ni ajustes", () => {
    expect(ve("SUPERVISOR")).toEqual([
      "academia_hoy",
      "academia_grupos",
      "academia_alumnos",
      "academia_preinscripciones",
      "academia_cobranza",
    ]);
  });

  it("la secretaría: Hoy, grupos, alumnos, preinscripciones y cobranza", () => {
    expect(ve("CAJERO")).toEqual([
      "academia_hoy",
      "academia_grupos",
      "academia_alumnos",
      "academia_preinscripciones",
      "academia_cobranza",
    ]);
  });

  it("el docente sólo sus grupos (sin la lista de estudiantes) y entra a sus clases de hoy", () => {
    expect(ve("PROFESIONAL")).toEqual(["academia_grupos"]);
    expect(rutaInicial(ctxDe("PROFESIONAL", "ACADEMIA", FEATURES))).toBe("/academia/mis-clases");
  });

  it("un rol a mano con academia.ver PROPIO y sin pasar lista no cae en un bucle (Bug 14)", () => {
    // `/academia/grupos` redirige al Calendario, que pide `academia.ver`
    // GENERAL: ese rol rebotaba entre el inicio y el Calendario para siempre.
    const c = ctxDe("PROFESIONAL", "ACADEMIA", FEATURES, { sin: ["asistencia.registrar"] });
    expect(puedeVer(c, "academia_calendario")).toBe(false);
    expect(puedeVer(c, "academia_mis_clases")).toBe(false);
    const ruta = rutaInicial(c);
    expect(ruta).not.toBe("/academia/grupos");
    expect(ruta).not.toBe("/academia/calendario");
  });

  it("la secretaría y la dirección empiezan el día en el Calendario (Hoy salió del menú el 26-oct)", () => {
    expect(rutaInicial(ctxDe("CAJERO", "ACADEMIA", FEATURES))).toBe("/academia/calendario");
    expect(rutaInicial(ctxDe("ADMIN", "ACADEMIA", FEATURES))).toBe("/academia/calendario");
  });

  it("sin la preinscripción online no hay bandeja de preinscripciones", () => {
    expect(ve("ADMIN", FEATURES.filter((f) => f !== "preinscripcion_online"))).not.toContain("academia_preinscripciones");
  });

  it("features estrictas: con la lista vacía (falla abierta en lo de siempre) no aparece nada", () => {
    expect(ve("ADMIN", [])).toEqual([]);
  });

  it("un restaurante o una peluquería no ven nada nuevo ni cambian de inicio", () => {
    for (const rubro of ["RESTAURANTE", "PELUQUERIA", "FARMACIA"]) {
      const c = ctxDe("ADMIN", rubro, ["pos", "caja", "inventario", "agenda"]);
      expect(SECCIONES.filter((s) => puedeVer(c, s))).toEqual([]);
      expect(rutaInicial(c)).not.toMatch(/^\/academia/);
    }
  });

  it("el instituto no tiene mesas, insumos ni cuentas por cobrar; sí Personal para sus docentes", () => {
    const c = ctxDe("ADMIN", "ACADEMIA", [...FEATURES, "salon", "insumos", "fiado"]);
    expect(puedeVer(c, "mesas")).toBe(false);
    expect(puedeVer(c, "insumos")).toBe(false);
    expect(puedeVer(c, "creditos")).toBe(false);
    // `personal.gestionar` va sin feature desde el backend de la ronda 1 (#1):
    // al instituto le llega, y la pantalla existe por la feature `academia`.
    expect(puedeVer(c, "personal")).toBe(true);
  });
});

describe("cobrar cuotas (desde A1, en «Cobrar a estudiante»)", () => {
  it("con la feature y con inscribir o cobranza", () => {
    expect(cobraCuotas(ctxDe("CAJERO", "ACADEMIA", FEATURES))).toBe(true);
    expect(cobraCuotas(ctxDe("ADMIN", "ACADEMIA", FEATURES))).toBe(true);
  });

  it("la pantalla pide lo mismo: cobranza o inscribir, nunca el docente", () => {
    for (const rol of ["CAJERO", "ADMIN", "SUPERVISOR"] as const) {
      expect(puedeVer(ctxDe(rol, "ACADEMIA", FEATURES), "academia_cobrar"), rol).toBe(true);
    }
    // Con sólo uno de los dos permisos alcanza.
    expect(puedeVer(ctxDe("CAJERO", "ACADEMIA", FEATURES, { sin: ["academia.cobranza"] }), "academia_cobrar")).toBe(true);
    expect(puedeVer(ctxDe("CAJERO", "ACADEMIA", FEATURES, { sin: ["academia.inscribir"] }), "academia_cobrar")).toBe(true);
    expect(puedeVer(ctxDe("PROFESIONAL", "ACADEMIA", FEATURES), "academia_cobrar")).toBe(false);
    expect(puedeVer(ctxDe("ADMIN", "ACADEMIA", []), "academia_cobrar")).toBe(false);
  });

  it("el docente no cobra, y sin la feature nadie", () => {
    expect(cobraCuotas(ctxDe("PROFESIONAL", "ACADEMIA", FEATURES))).toBe(false);
    expect(cobraCuotas(ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja"]))).toBe(false);
    expect(cobraCuotas(ctxDe("ADMIN", "ACADEMIA", []))).toBe(false);
  });
});

/**
 * Ronda 2 (MenuV2): lo del docente pide el alcance PROPIO —la recepción
 * también pasa lista, pero desde el grupo—; el panel de control y las fotos,
 * sólo el Administrador.
 */
describe("secciones de la ronda 2", () => {
  const NUEVAS: Seccion[] = [
    "academia_calendario",
    "academia_mis_clases",
    "academia_lista",
    "academia_notas",
    "academia_planilla",
    "academia_control",
    "academia_reportes",
  ];
  const TODAS = [...FEATURES, "planilla_docente", "reportes"];
  const veNuevas = (rol: "ADMIN" | "SUPERVISOR" | "CAJERO" | "PROFESIONAL") => {
    const c = ctxDe(rol, "ACADEMIA", TODAS);
    return NUEVAS.filter((s) => puedeVer(c, s));
  };

  it("el administrador: calendario, planilla de todos, control y reportes", () => {
    expect(veNuevas("ADMIN")).toEqual(["academia_calendario", "academia_planilla", "academia_control", "academia_reportes"]);
  });

  it("la recepción: sólo el calendario", () => {
    expect(veNuevas("CAJERO")).toEqual(["academia_calendario"]);
  });

  it("el docente: sus clases, la lista y las notas (su planilla ya no: D1, 22-oct)", () => {
    expect(veNuevas("PROFESIONAL")).toEqual(["academia_mis_clases", "academia_lista", "academia_notas"]);
  });

  it("la planilla es sólo del administrador: la coordinación tampoco la ve (D1)", () => {
    expect(puedeVer(ctxDe("SUPERVISOR", "ACADEMIA", TODAS), "academia_planilla")).toBe(false);
    expect(puedeVer(ctxDe("ADMIN", "ACADEMIA", TODAS), "academia_planilla")).toBe(true);
  });

  it("sin la feature de la planilla, nadie ve planillas", () => {
    const c = ctxDe("ADMIN", "ACADEMIA", FEATURES);
    expect(puedeVer(c, "academia_planilla")).toBe(false);
  });
});

describe("veMontosAcademia (la misma regla que veMontos del backend)", () => {
  const con = (permisos: string[], propios: string[] = []) => ({ permisos, permisosPropios: propios });

  it("el docente (academia.ver propio) no ve montos", () => {
    expect(veMontosAcademia(con(["academia.ver", "asistencia.registrar"], ["academia.ver"]))).toBe(false);
  });

  it("con academia.ver general sí", () => {
    expect(veMontosAcademia(con(["academia.ver"]))).toBe(true);
  });

  it("propio pero con inscribir o cobranza, también: el backend se los manda", () => {
    expect(veMontosAcademia(con(["academia.ver", "academia.cobranza"], ["academia.ver"]))).toBe(true);
    expect(veMontosAcademia(con(["academia.ver", "academia.inscribir"], ["academia.ver"]))).toBe(true);
  });

  it("sin sesión o sin academia.ver no esconde nada (no es docente)", () => {
    expect(veMontosAcademia(null)).toBe(true);
    expect(veMontosAcademia(con([]))).toBe(true);
  });
});
