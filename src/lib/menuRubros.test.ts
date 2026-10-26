import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { aplanar, caminoA, construirMenu, esActivo, tituloDe, type Bloque, type BloqueMenu } from "./menu";
import { puedeVer } from "./permisos";
import { RUBROS } from "./rubro";

/**
 * La división del menú es la misma en todos los rubros (11-oct-2026: la de la
 * barbería, que Kevin pidió para todos). Cada rubro ve lo suyo —eso lo decide
 * `permisos.ts`—, pero los bloques y los grupos salen en el mismo orden.
 *
 * Recorre `RUBROS` y uno inventado: un rubro nuevo entra solo a estos tests y
 * nace con la división. Si alguno falla después de agregar una pantalla, casi
 * seguro quedó suelta al final de Administración: va dentro del grupo de su
 * tema (ver `ITEMS` en menu.ts).
 */

/**
 * Todas las features que abren una pantalla del menú: el dueño con el plan
 * más grande. Que un rubro vea algo que el backend no le da (mesas de salón en
 * un minimarket) no importa acá: lo que se mira es el orden, no el contenido.
 */
const TODAS = [
  "pos",
  "caja",
  "catalogo",
  "usuarios",
  "inventario",
  "insumos",
  "multi_almacen",
  "reportes",
  "gastos",
  "fiado",
  "delivery",
  "salon",
  "billar",
  "lotes",
  "encargos",
  "agenda",
  "clientes",
  "reserva_online",
  "comisiones",
  "propinas",
  "gift_cards",
  "consumo_servicio",
  "pagina_publica",
  "enlaces_cortos",
  "asistente_pagina",
  "promociones",
  "clientes_retencion",
  // Educación: sólo compatibles con EDUCACION en el backend; acá van para
  // todos porque lo que se mira es el orden.
  "academia",
  "asistencia",
  "notas",
  "planilla_docente",
  "preinscripcion_online",
];

const BLOQUES: Bloque[] = ["agenda", "vender", "stock", "administracion"];
// Reportes va entre los grupos, de primer nivel: junta los de todas las
// funcionalidades y ya no cuelga de Finanzas (13-oct-2026).
const GRUPOS = ["Equipo", "Finanzas", "Reportes", "Marketing"];
/** Lo que se arma una vez: suelto, debajo de los grupos y en este orden. */
const SUELTOS = ["Mesas del salón", "Mesas de billar", "Configuración"];

function menu(rol: Plantilla, rubro: string): BloqueMenu[] {
  const c = ctxDe(rol, rubro, TODAS, { extra: rol === "ADMIN" ? PERMISOS_NUEVOS : [] });
  return construirMenu((s) => puedeVer(c, s), rubro);
}

const administracion = (m: BloqueMenu[]) =>
  m.find((b) => b.bloque === "administracion")?.nodos.map((n) => n.item.label) ?? [];

// El instituto tiene su propio menú por rol (ronda 2, `ITEMS_ACADEMIA`): se
// prueba aparte, abajo.
describe.each([...RUBROS.filter((r) => r !== "ACADEMIA"), "RUBRO_NUEVO"])("menú de %s", (rubro) => {
  it("los bloques van en el orden de siempre", () => {
    const orden = menu("ADMIN", rubro).map((b) => b.bloque);
    expect(orden).toEqual(BLOQUES.filter((b) => orden.includes(b)));
  });

  it("Administración: Equipo, Finanzas, Reportes y Marketing, y abajo lo que se arma una vez", () => {
    const items = administracion(menu("ADMIN", rubro));
    expect(items.slice(0, GRUPOS.length)).toEqual(GRUPOS);
    // Nada suelto fuera de esa lista: una pantalla nueva va en su grupo.
    const resto = items.slice(GRUPOS.length);
    expect(resto).toEqual(SUELTOS.filter((s) => resto.includes(s)));
  });

  it("ningún rol ve un grupo con una sola pantalla adentro", () => {
    // Al cajero, con sólo "Cuentas por cobrar", una carpeta "Finanzas" le
    // agregaría un clic para llegar a lo único que tiene.
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as Plantilla[]) {
      for (const n of aplanar(menu(rol, rubro).flatMap((b) => b.nodos))) {
        if (n.hijos.length) expect(n.hijos.length, `${rol}: ${n.item.label}`).toBeGreaterThan(1);
      }
    }
  });

  it("hay UNA sola entrada a reportes, suelta, y ningún grupo esconde otra", () => {
    const todos = aplanar(menu("ADMIN", rubro).flatMap((b) => b.nodos));
    const reportes = todos.filter((n) => n.item.a.startsWith("/reportes"));
    expect(reportes.map((n) => [n.item.a, n.item.label, n.hijos.length])).toEqual([["/reportes", "Reportes", 0]]);
    const finanzas = todos.find((n) => n.item.label === "Finanzas");
    expect(finanzas?.hijos.map((h) => h.item.label) ?? []).not.toContain("Reportes");
  });
});

/**
 * Supervisión del billar (21-oct): va en Vender, justo debajo de Billar, y la
 * ve quien administra el billar —no la cajera—, en los mismos rubros donde
 * existe Billar. No es un grupo ni queda suelta en Administración.
 */
describe("menú: Supervisión del billar", () => {
  const vender = (m: BloqueMenu[]) => m.find((b) => b.bloque === "vender")?.nodos.map((n) => n.item.label) ?? [];
  const SIN_BILLAR = ["FARMACIA", "PELUQUERIA", "BARBERIA", "SPA", "UNAS"];

  it.each(RUBROS.filter((r) => r !== "ACADEMIA" && !SIN_BILLAR.includes(r)))("%s: el administrador la ve debajo de Billar", (rubro) => {
    const v = vender(menu("ADMIN", rubro));
    expect(v).toContain("Billar");
    expect(v[v.indexOf("Billar") + 1]).toBe("Supervisión");
  });

  it.each(RUBROS.filter((r) => r !== "ACADEMIA" && !SIN_BILLAR.includes(r)))("%s: la cajera no la ve", (rubro) => {
    expect(vender(menu("CAJERO", rubro))).not.toContain("Supervisión");
  });

  it.each(SIN_BILLAR.filter((r) => RUBROS.includes(r as never)))("%s: sin billar, sin Supervisión", (rubro) => {
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as Plantilla[]) {
      const todos = aplanar(menu(rol, rubro).flatMap((b) => b.nodos)).map((n) => n.item.label);
      expect(todos).not.toContain("Supervisión");
    }
  });

  it("el encargado (billar.admin) también la ve, sin pedir caja", () => {
    expect(vender(menu("SUPERVISOR", "BILLAR"))).toContain("Supervisión");
  });
});

/**
 * El instituto: un menú por rol. Todo lo que es sólo del instituto vive en UN
 * grupo "Academia" (dueño, 26-oct); afuera quedan vender y, para el dueño, un
 * "Más" plegado con los módulos generales (no se le quita ninguno). Nada de
 * lo que no existe en el rubro.
 */
describe("menú de ACADEMIA", () => {
  const SOLO_ACADEMIA = ["pos", "caja", "catalogo", "usuarios", "inventario", "multi_almacen", "reportes",
    "gastos", "fiado", "salon", "insumos", "pagina_publica", "academia", "asistencia", "notas",
    "planilla_docente", "preinscripcion_online"];
  const menuDe = (rol: Plantilla, vocabulario?: Record<string, string>) => {
    const c = ctxDe(rol, "ACADEMIA", SOLO_ACADEMIA, { extra: rol === "ADMIN" ? PERMISOS_NUEVOS : [] });
    return construirMenu((s) => puedeVer(c, s), "ACADEMIA", vocabulario);
  };
  const bloque = (m: BloqueMenu[], b: Bloque) => m.find((x) => x.bloque === b)?.nodos.map((n) => n.item.label);
  const todos = (m: BloqueMenu[]) => aplanar(m.flatMap((b) => b.nodos)).map((n) => n.item.label);
  /** Lo que hay dentro del grupo Academia. */
  const academia = (m: BloqueMenu[]) => {
    const grupo = m.find((x) => x.bloque === "instituto")?.nodos;
    expect(grupo?.map((n) => n.item.label)).toEqual(["Academia"]);
    return grupo![0].hijos.map((n) => n.item.label);
  };

  it("la recepción: el grupo Academia con lo del día y Cobranza, y aparte Punto de venta y Caja", () => {
    const m = menuDe("CAJERO");
    expect(m.map((b) => b.bloque)).toEqual(["instituto", "vender"]);
    // A1 (22-oct): cobrar a un estudiante es aparte del POS, que queda para
    // productos; desde el 26-oct se entra por Cobranza, sin un "Cobrar" suelto.
    expect(academia(m)).toEqual(["Hoy", "Calendario", "Estudiantes", "Inscripciones online", "Cobranza"]);
    expect(bloque(m, "vender")).toEqual(["Punto de venta", "Caja"]);
  });

  it("estando en Cobrar a estudiante se enciende Cobranza y la barra del celular dice dónde está", () => {
    const m = menuDe("CAJERO");
    const planos = aplanar(m.flatMap((b) => b.nodos));
    const cobranza = planos.find((n) => n.item.label === "Cobranza")!;
    expect(esActivo(cobranza.item, "/academia/cobranza/cobrar")).toBe(true);
    expect(tituloDe(planos, "/academia/cobranza/cobrar")).toBe("Cobrar a estudiante");
  });

  it("el administrador: TODO lo del instituto en Academia, y abajo Más con los módulos generales", () => {
    const m = menuDe("ADMIN");
    expect(m.map((b) => b.bloque)).toEqual(["instituto", "vender", "administracion"]);
    expect(academia(m)).toEqual([
      "Hoy", "Calendario", "Estudiantes", "Inscripciones online", "Cobranza",
      "Panel de control", "Planilla docentes", "Reportes", "Cursos", "Sedes", "Ajustes",
    ]);
    expect(bloque(m, "vender")).toEqual(["Punto de venta", "Caja"]);
    expect(bloque(m, "administracion")).toEqual(["Más"]);
    const nombres = todos(m);
    // Lo que el dueño ya tenía sigue estando, dentro de "Más".
    for (const si of ["Personal", "Usuarios", "Inventario", "Gastos operativos", "Mi página", "Más reportes"]) {
      expect(nombres).toContain(si);
    }
    for (const no of ["Cuentas por cobrar", "Mesas del salón", "Insumos", "Billar", "Grupos", "Mis clases de hoy"]) {
      expect(nombres).not.toContain(no);
    }
  });

  it("el grupo Academia lleva a su primera pantalla y se abre estando en cualquiera de las suyas", () => {
    const m = menuDe("ADMIN");
    const grupo = m[0].nodos[0];
    expect(grupo.item.a).toBe("/academia/hoy");
    expect(caminoA(m.flatMap((b) => b.nodos), "/academia/planilla")).toEqual([grupo.id]);
    expect(caminoA(m.flatMap((b) => b.nodos), "/configuracion/carreras")).toEqual([grupo.id]);
  });

  it("el docente ve sólo sus clases, dentro de Academia (sin «Mi planilla»: es del admin, D1 del 22-oct)", () => {
    const m = menuDe("PROFESIONAL");
    expect(m.map((b) => b.bloque)).toEqual(["instituto"]);
    expect(academia(m)).toEqual(["Mis clases de hoy", "Pasar lista", "Notas"]);
    expect(m[0].nodos[0].item.a).toBe("/academia/mis-clases");
  });

  it("la barra del celular lleva siempre el título de la pantalla, también las que no están en el menú (QA ronda 2, B-28)", () => {
    for (const rol of ["PROFESIONAL", "CAJERO", "ADMIN"] as Plantilla[]) {
      const planos = aplanar(menuDe(rol).flatMap((b) => b.nodos));
      expect(tituloDe(planos, "/academia/grupos/43")).toBe("Grupo");
      expect(tituloDe(planos, "/academia/grupos/43/notas")).toBe("Notas");
      expect(tituloDe(planos, "/academia/grupos/43/lista")).toBe("Pasar lista");
    }
    const docente = aplanar(menuDe("PROFESIONAL").flatMap((b) => b.nodos));
    expect(tituloDe(docente, "/academia/notas")).toBe("Notas");
    expect(tituloDe(docente, "/academia/mis-clases")).toBe("Mis clases");
  });

  it("el vocabulario del perfil nombra las cosas", () => {
    const nombres = todos(menuDe("ADMIN", { carrera: "carrera", clientes: "alumnos" }));
    expect(nombres).toContain("Carreras");
    expect(nombres).toContain("Alumnos");
  });

  it("ningún rol ve un grupo con una sola pantalla adentro", () => {
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] as Plantilla[]) {
      for (const n of aplanar(menuDe(rol).flatMap((b) => b.nodos))) {
        if (n.hijos.length) expect(n.hijos.length, `${rol}: ${n.item.label}`).toBeGreaterThan(1);
      }
    }
  });

  it("los demás rubros no cambian: un restaurante no ve bloques del instituto", () => {
    const c = ctxDe("ADMIN", "RESTAURANTE", SOLO_ACADEMIA);
    const m = construirMenu((s) => puedeVer(c, s), "RESTAURANTE");
    for (const b of m) expect(b.bloque).not.toBe("instituto");
    expect(todos(m)).not.toContain("Academia");
  });
});
