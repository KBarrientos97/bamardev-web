import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, type Bloque, type BloqueMenu } from "./menu";
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
 * El instituto (ronda 2, lienzo MenuV2): un menú por rol. La recepción ve lo
 * del día y vender; el dueño suma Control y, abajo, Ajustes y un "Más"
 * plegado con los módulos generales (no se le quita ninguno); el docente,
 * sólo sus clases. Nada de lo que no existe en el rubro.
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

  it("la recepción: Hoy, Calendario, Estudiantes, Cobranza, Punto de venta y Caja", () => {
    const m = menuDe("CAJERO");
    expect(m.map((b) => b.bloque)).toEqual(["dia", "vender"]);
    expect(bloque(m, "dia")).toEqual(["Hoy", "Calendario", "Estudiantes", "Inscripciones online", "Cobranza"]);
    expect(bloque(m, "vender")).toEqual(["Punto de venta", "Caja"]);
  });

  it("el administrador suma Control y abajo Ajustes y Más, con los módulos generales adentro", () => {
    const m = menuDe("ADMIN");
    expect(m.map((b) => b.bloque)).toEqual(["dia", "vender", "control", "administracion"]);
    expect(bloque(m, "control")).toEqual(["Panel de control", "Planilla docentes", "Reportes"]);
    expect(bloque(m, "administracion")).toEqual(["Ajustes", "Más"]);
    const nombres = todos(m);
    // Lo que el dueño ya tenía sigue estando, dentro de "Más".
    for (const si of ["Personal", "Usuarios", "Inventario", "Gastos operativos", "Mi página", "Más reportes", "Sedes", "Cursos"]) {
      expect(nombres).toContain(si);
    }
    for (const no of ["Cuentas por cobrar", "Mesas del salón", "Insumos", "Billar", "Grupos", "Mis clases de hoy"]) {
      expect(nombres).not.toContain(no);
    }
  });

  it("el docente ve sólo sus clases", () => {
    const m = menuDe("PROFESIONAL");
    expect(m.map((b) => b.bloque)).toEqual(["clases"]);
    expect(bloque(m, "clases")).toEqual(["Mis clases de hoy", "Pasar lista", "Notas", "Mi planilla"]);
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
    for (const b of m) expect(["dia", "control", "clases"]).not.toContain(b.bloque);
  });
});
