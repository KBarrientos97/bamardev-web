import { describe, expect, it } from "vitest";
import type { Feature } from "../../types";
import { ayudaDeReporte } from "./ayuda";
import { catalogo, gruposVisibles, veFicha, type ContextoCatalogo } from "./catalogo";

const TODOS_LOS_PERMISOS = ["reportes.ver", "reportes.operacion", "reportes.rentabilidad"];

/** El dueño con el plan completo, en un rubro. */
function dueno(rubro: string, extra: Partial<ContextoCatalogo> = {}): ContextoCatalogo {
  return {
    rubro,
    features: [],
    permisos: TODOS_LOS_PERMISOS,
    puede: (s) => s === "gastos" || (s === "reportes_billar" && rubro === "BILLAR") || (s === "reportes_agenda" && ["PELUQUERIA", "BARBERIA", "SPA", "UNAS"].includes(rubro)),
    incluye: () => true,
    ...extra,
  };
}

const ids = (ctx: ContextoCatalogo) => gruposVisibles(ctx).map((g) => [g.titulo, g.fichas.map((f) => f.id)] as const);

describe("cada rubro ve sus reportes", () => {
  it("el billar trae sus mesas en su grupo, con la etiqueta de nuevo, y no los meseros", () => {
    const g = gruposVisibles(dueno("BILLAR"));
    const rubro = g.find((x) => x.id === "rubro");
    expect(rubro).toMatchObject({ titulo: "Billar", nuevo: true });
    expect(rubro?.fichas.map((f) => f.id)).toEqual(["mesas", "ocupacion", "tiempo-fijo", "pausas-ajustes", "cenas"]);
  });

  it("el restaurante ve los meseros y los insumos, y nada del billar ni de la farmacia", () => {
    const todo = ids(dueno("RESTAURANTE")).flatMap(([, f]) => f);
    expect(todo).toEqual(expect.arrayContaining(["meseros", "insumos", "resultado", "cierres"]));
    expect(todo).not.toEqual(expect.arrayContaining(["mesas"]));
    expect(todo).not.toContain("mermas");
    expect(todo).not.toContain("profesionales");
  });

  it("la farmacia ve sus vencimientos y su sugerencia, y habla de medicamentos", () => {
    const g = gruposVisibles(dueno("FARMACIA"));
    expect(g.find((x) => x.id === "rubro")?.fichas.map((f) => f.id)).toEqual(["mermas", "sugerencia-compra"]);
    expect(g.find((x) => x.id === "productos")).toMatchObject({ titulo: "Medicamentos" });
    expect(g.flatMap((x) => x.fichas).find((f) => f.id === "top-productos")?.titulo).toBe("Top medicamentos");
    // Una farmacia no transforma materia prima ni tiene meseros.
    expect(g.flatMap((x) => x.fichas.map((f) => f.id))).not.toEqual(expect.arrayContaining(["insumos"]));
    expect(g.flatMap((x) => x.fichas.map((f) => f.id))).not.toContain("meseros");
  });

  it("una peluquería ve su agenda y no los meseros ni los insumos", () => {
    const g = gruposVisibles(dueno("PELUQUERIA"));
    expect(g.find((x) => x.id === "rubro")).toMatchObject({ titulo: "Agenda" });
    expect(g.find((x) => x.id === "rubro")?.fichas.map((f) => f.id)).toEqual([
      "profesionales",
      "servicios",
      "asistencia",
      "ocupacion-agenda",
      "retencion",
    ]);
    const todo = g.flatMap((x) => x.fichas.map((f) => f.id));
    expect(todo).not.toContain("meseros");
    expect(todo).not.toContain("insumos");
  });
});

describe("cada reporte pide lo mismo que su endpoint", () => {
  it("un plan básico ve las ventas y los cierres, no los de operación ni los de plata", () => {
    const ctx = dueno("RESTAURANTE", { incluye: () => false });
    const todo = ids(ctx).flatMap(([, f]) => f);
    // Vendido sin stock (09-nov) también: son ventas, sin costo, y el
    // restaurante que no cuenta lo necesita sea cual sea su plan.
    expect(todo).toEqual(["ventas", "cierres", "caja", "vendido-sin-stock"]);
  });

  it("sin el permiso de rentabilidad no aparecen el resultado, las compras ni los lentos", () => {
    const ctx = dueno("RESTAURANTE", { permisos: ["reportes.ver", "reportes.operacion"] });
    const todo = ids(ctx).flatMap(([, f]) => f);
    expect(todo).not.toContain("resultado");
    expect(todo).not.toContain("compras");
    expect(todo).not.toContain("productos-lentos");
    expect(todo).toContain("top-productos");
  });

  it("sin acceso a los gastos no se ofrece el estado de resultado, que siempre fallaría", () => {
    const ctx = dueno("RESTAURANTE", { puede: () => false });
    const todo = ids(ctx).flatMap(([, f]) => f);
    expect(todo).not.toContain("resultado");
    expect(todo).not.toContain("equilibrio");
  });

  it("sin fiado en el plan no hay reporte de créditos", () => {
    const features: Feature[] = ["pos", "reportes"];
    const todo = ids(dueno("RESTAURANTE", { features })).flatMap(([, f]) => f);
    expect(todo).not.toContain("creditos");
  });

  it("un grupo sin nada que mostrar no se dibuja", () => {
    const ctx = dueno("MINIMARKET", { incluye: () => false });
    expect(gruposVisibles(ctx).map((g) => g.id)).toEqual(["plata", "operacion"]);
  });
});

describe("el costo y margen por servicio (antes, una pestaña de las recetas)", () => {
  const conRecetas = (rubro: string, recetas: boolean): ContextoCatalogo => ({
    rubro,
    features: [],
    permisos: [],
    puede: (s) => s === "reportes_agenda" || (recetas && s === "recetas_servicio"),
    incluye: () => true,
  });
  const fichas = (ctx: ContextoCatalogo) => gruposVisibles(ctx).flatMap((g) => g.fichas.map((f) => f.id));

  it("lo ve quien arma las recetas, en el grupo de la agenda", () => {
    const g = gruposVisibles(conRecetas("PELUQUERIA", true));
    expect(g.find((x) => x.id === "rubro")?.fichas.map((f) => f.id)).toContain("margen-servicios");
  });

  it("sin la sección de recetas no aparece, ni fuera de belleza", () => {
    expect(fichas(conRecetas("PELUQUERIA", false))).not.toContain("margen-servicios");
    expect(fichas(conRecetas("RESTAURANTE", true))).not.toContain("margen-servicios");
  });
});

describe("academia (L5, 28-oct)", () => {
  const conFiado: Feature[] = ["pos", "reportes", "fiado"];

  it("no ve Créditos (fiado) aunque el plan traiga el fiado; los demás rubros siguen igual", () => {
    const academia = ids(dueno("ACADEMIA", { features: conFiado })).flatMap(([, f]) => f);
    expect(academia).not.toContain("creditos");
    expect(academia).toEqual(expect.arrayContaining(["resultado", "ventas", "top-productos"]));
    for (const rubro of ["RESTAURANTE", "BILLAR", "PELUQUERIA", "FARMACIA"]) {
      expect(ids(dueno(rubro, { features: conFiado })).flatMap(([, f]) => f)).toContain("creditos");
    }
  });
});

describe("cada reporte explica cómo se calcula (L5)", () => {
  const RUBROS = ["RESTAURANTE", "BILLAR", "PELUQUERIA", "FARMACIA", "MINIMARKET", "ACADEMIA", undefined];

  it("todas las fichas del catálogo y el Resumen tienen su ayuda, en todos los rubros", () => {
    for (const rubro of RUBROS) {
      for (const id of ["resumen", ...catalogo(rubro).map((f) => f.id)]) {
        const a = ayudaDeReporte(id, rubro);
        expect(a, `${id} en ${rubro}`).not.toBeNull();
        expect(a!.queMuestra.length).toBeGreaterThan(20);
        expect(a!.deDonde.length).toBeGreaterThan(20);
      }
    }
  });

  it("en la academia habla de cuotas y de los sueldos docentes", () => {
    const r = ayudaDeReporte("resultado", "ACADEMIA")!;
    expect(r.queMuestra).toMatch(/cuotas/);
    expect(r.deDonde).toMatch(/Sueldos docentes es lo que se PAGÓ/);
    expect(r.noIncluye?.join(" ")).toMatch(/Planilla pendiente de pagar/);
    expect(ayudaDeReporte("resultado", "RESTAURANTE")!.deDonde).not.toMatch(/docentes/);
    expect(ayudaDeReporte("top-productos", "ACADEMIA")!.noIncluye?.join(" ")).toMatch(/cuotas/);
  });
});

describe("Ventas y ganancia (6-nov, como la app)", () => {
  const ve = (ctx: ContextoCatalogo) => ids(ctx).flatMap(([, f]) => f).includes("ventas-ganancia");

  it("está en Productos, debajo de Top, para el dueño", () => {
    const productos = gruposVisibles(dueno("RESTAURANTE")).find((g) => g.id === "productos");
    const lista = productos?.fichas.map((f) => f.id) ?? [];
    expect(lista.indexOf("ventas-ganancia")).toBe(lista.indexOf("top-productos") + 1);
  });

  it("pide operación Y rentabilidad: toda la pantalla es costo", () => {
    // El encargado con "Rentabilidad" apagada no la ve, aunque vea Top productos.
    expect(ve(dueno("RESTAURANTE", { permisos: ["reportes.ver", "reportes.operacion"] }))).toBe(false);
    expect(ve(dueno("RESTAURANTE", { permisos: ["reportes.ver", "reportes.rentabilidad"] }))).toBe(false);
    // Un plan sin el nivel de rentabilidad tampoco: el backend no le daría los costos.
    expect(ve(dueno("RESTAURANTE", { incluye: (c) => c !== "reportes_rentabilidad" }))).toBe(false);
    expect(ve(dueno("RESTAURANTE"))).toBe(true);
  });

  it("tiene su «Cómo se calcula»", () => {
    expect(ayudaDeReporte("ventas-ganancia", "RESTAURANTE")?.queMuestra).toMatch(/cajero/);
  });
});

describe("Vendido sin stock (09-nov)", () => {
  const ve = (ctx: ContextoCatalogo) => ids(ctx).flatMap(([, f]) => f).includes("vendido-sin-stock");

  it("está en Inventario, debajo de Stock crítico, para el restaurante", () => {
    const inventario = gruposVisibles(dueno("RESTAURANTE")).find((g) => g.id === "inventario");
    const lista = inventario?.fichas.map((f) => f.id) ?? [];
    expect(lista.indexOf("vendido-sin-stock")).toBe(lista.indexOf("stock-critico") + 1);
  });

  it("lo ve quien ve las ventas, con cualquier plan: es lo que reemplaza al stock mientras no se cuenta", () => {
    expect(ve(dueno("RESTAURANTE", { permisos: ["reportes.ver"], incluye: () => false }))).toBe(true);
    expect(ve(dueno("RESTAURANTE", { permisos: [] }))).toBe(false);
  });

  it("sólo en el restaurante, el único que puede vender sin stock", () => {
    for (const rubro of ["FARMACIA", "BILLAR", "MINIMARKET", "PELUQUERIA"]) expect(ve(dueno(rubro))).toBe(false);
  });

  it("veFicha lo enlaza sólo con la entrada a Reportes", () => {
    const ctx = dueno("RESTAURANTE", { puede: (s) => s === "reportes" });
    expect(veFicha("vendido-sin-stock", ctx)).toBe(true);
    expect(veFicha("vendido-sin-stock", { ...ctx, puede: () => false })).toBe(false);
  });

  it("tiene su «Cómo se calcula», que dice que cuenta sólo lo que faltó", () => {
    expect(ayudaDeReporte("vendido-sin-stock", "RESTAURANTE")?.deDonde).toMatch(/si había 2 y se vendieron 5, son 3/);
  });
});

describe("Comparar sucursales (13-nov)", () => {
  const ve = (ctx: ContextoCatalogo) => ids(ctx).flatMap(([, f]) => f).includes("comparar-sucursales");

  it("lo ve la organización con 2+ sucursales, en Plata, debajo del Estado de resultado", () => {
    const plata = gruposVisibles(dueno("RESTAURANTE", { variasSucursales: true })).find((g) => g.id === "plata");
    const lista = plata?.fichas.map((f) => f.id) ?? [];
    expect(lista.indexOf("comparar-sucursales")).toBe(lista.indexOf("resultado") + 1);
  });

  it("con un solo local, o para quien es de una sede, no existe (la regla de oro)", () => {
    expect(ve(dueno("RESTAURANTE"))).toBe(false);
    expect(ve(dueno("RESTAURANTE", { variasSucursales: false }))).toBe(false);
  });

  it("pide lo mismo que el Estado de resultado: rentabilidad en el plan y en el rol, y poder ver los gastos", () => {
    const con = { variasSucursales: true };
    expect(ve(dueno("RESTAURANTE", { ...con, permisos: ["reportes.ver", "reportes.operacion"] }))).toBe(false);
    expect(ve(dueno("RESTAURANTE", { ...con, incluye: () => false }))).toBe(false);
    expect(ve(dueno("RESTAURANTE", { ...con, puede: () => false }))).toBe(false);
  });

  it("existe en todos los rubros que tienen sucursales", () => {
    for (const rubro of ["RESTAURANTE", "FARMACIA", "PELUQUERIA", "BILLAR", "ACADEMIA"]) {
      expect(ve(dueno(rubro, { variasSucursales: true })), rubro).toBe(true);
    }
  });

  it("veFicha no lo ofrece desde fuera sin saber que hay varias sucursales", () => {
    const ctx = dueno("RESTAURANTE", { puede: () => true });
    expect(veFicha("comparar-sucursales", ctx)).toBe(false);
    expect(veFicha("comparar-sucursales", { ...ctx, variasSucursales: true })).toBe(true);
  });
});
