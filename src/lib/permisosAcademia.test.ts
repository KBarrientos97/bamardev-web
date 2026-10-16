import { describe, expect, it } from "vitest";
import { ctxDe } from "../test/sesiones";
import { cobraCuotas, puedeVer, rutaInicial, type Seccion } from "./permisos";

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

  it("el docente sólo sus grupos y sus alumnos, y entra a sus grupos", () => {
    expect(ve("PROFESIONAL")).toEqual(["academia_grupos", "academia_alumnos"]);
    expect(rutaInicial(ctxDe("PROFESIONAL", "ACADEMIA", FEATURES))).toBe("/academia/grupos");
  });

  it("la secretaría y la dirección empiezan el día en Hoy", () => {
    expect(rutaInicial(ctxDe("CAJERO", "ACADEMIA", FEATURES))).toBe("/academia/hoy");
    expect(rutaInicial(ctxDe("ADMIN", "ACADEMIA", FEATURES))).toBe("/academia/hoy");
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

describe("cobrar cuotas en el POS", () => {
  it("con la feature y con inscribir o cobranza", () => {
    expect(cobraCuotas(ctxDe("CAJERO", "ACADEMIA", FEATURES))).toBe(true);
    expect(cobraCuotas(ctxDe("ADMIN", "ACADEMIA", FEATURES))).toBe(true);
  });

  it("el docente no cobra, y sin la feature nadie", () => {
    expect(cobraCuotas(ctxDe("PROFESIONAL", "ACADEMIA", FEATURES))).toBe(false);
    expect(cobraCuotas(ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja"]))).toBe(false);
    expect(cobraCuotas(ctxDe("ADMIN", "ACADEMIA", []))).toBe(false);
  });
});
