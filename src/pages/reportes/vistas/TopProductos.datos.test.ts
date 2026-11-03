import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { TopProductoApi } from "../api";
import {
  armarTop,
  cuantosSinCosto,
  cuentaLoVisible,
  esTiempoDeMesa,
  filasExportTop,
  filtrando,
  filtrarTop,
  fraccionTop,
  guardarOrdenTop,
  hojaTopVisible,
  leerOrdenTop,
  lineaTiempoMesa,
  lineaTop,
  pieTop,
  resumenTop,
  textoFiltro,
  totalesTop,
  valorTop,
} from "./TopProductos.datos";

function producto(nombre: string, ingresos: number, utilidad: number, extra: Partial<TopProductoApi> = {}): TopProductoApi {
  return {
    nombre,
    categoria: "Bebidas",
    ingresos,
    utilidad,
    unidades: 10,
    margenPct: ingresos ? Math.round((utilidad / ingresos) * 100) : 0,
    ...extra,
  };
}

describe("los dos rankings", () => {
  it("más vendidos ordena por ingresos y más rentables por la ganancia de cada artículo", () => {
    const datos = [producto("Cerveza", 1000, 100), producto("Coca Cola", 600, 300), producto("Agua", 500, 250)];
    expect(armarTop(datos, "vendidos", "RESTAURANTE").filas.map((f) => f.nombre)).toEqual(["Cerveza", "Coca Cola", "Agua"]);
    expect(armarTop(datos, "rentables", "RESTAURANTE").filas.map((f) => f.nombre)).toEqual(["Coca Cola", "Agua", "Cerveza"]);
  });

  it("a igual ganancia desempata el que más vendió", () => {
    const datos = [producto("Maní", 200, 100), producto("Papas", 400, 100)];
    expect(armarTop(datos, "rentables", undefined).filas.map((f) => f.nombre)).toEqual(["Papas", "Maní"]);
  });

  it("la barra es contra el primero del ranking y una pérdida no tiene barra", () => {
    const top = armarTop([producto("A", 1000, 400), producto("B", 500, 100), producto("C", 300, -20)], "rentables", undefined);
    const [a, b, c] = top.filas;
    expect(fraccionTop(a, a, "rentables")).toBe(1);
    expect(fraccionTop(b, a, "rentables")).toBeCloseTo(0.25);
    expect(fraccionTop(c, a, "rentables")).toBe(0);
  });
});

describe("el tiempo de mesa del billar", () => {
  it("va aparte del ranking y no le gana a los productos en más rentables", () => {
    // A propósito: es un servicio sin costo, entra entero como ganancia y
    // metido en el ranking quedaba primero por paliza, con las barras de
    // todos los productos achicadas a una rayita.
    const datos = [producto("Tiempo de mesa", 4601, 4601, { categoria: "Sin categoría", unidades: 57 }), producto("Paceña", 2460, 934.8)];
    const top = armarTop(datos, "rentables", "BILLAR");
    expect(top.tiempoMesa?.nombre).toBe("Tiempo de mesa");
    expect(top.filas.map((f) => f.nombre)).toEqual(["Paceña"]);
    expect(fraccionTop(top.filas[0], top.filas[0], "rentables")).toBe(1);
  });

  it("fuera del billar, un producto que se llame así es uno más del ranking", () => {
    const top = armarTop([producto("Tiempo de mesa", 100, 100)], "vendidos", "RESTAURANTE");
    expect(top.tiempoMesa).toBeNull();
    expect(top.filas).toHaveLength(1);
  });

  it("se reconoce sin importar mayúsculas, tildes ni espacios, y nada más que ese nombre", () => {
    expect(esTiempoDeMesa("  TIEMPO DE MESA ", "BILLAR")).toBe(true);
    expect(esTiempoDeMesa("Tiémpo de mesa", "BILLAR")).toBe(true);
    expect(esTiempoDeMesa("Tiempo de mesa VIP", "BILLAR")).toBe(false);
  });

  it("sus unidades son mesas cobradas, no unidades", () => {
    // Cada mesa cerrada entra a la venta como un renglón con cantidad 1:
    // "57 uds" de tiempo de mesa no se entendía.
    const top = armarTop([producto("Tiempo de mesa", 4601, 4601, { unidades: 57 })], "vendidos", "BILLAR");
    expect(lineaTiempoMesa(top.tiempoMesa!)).toBe("57 mesas cobradas · no tiene costo");
  });
});

describe("el margen que no es un dato", () => {
  it("un artículo sin costo cargado dice eso y no margen 100 %", () => {
    // Con costo cero el backend da margen 100 % y el artículo encabezaba "más
    // rentables" como el mejor de la carta, cuando lo que falta es el costo.
    const top = armarTop([producto("Hielo", 50, 50), producto("Coca Cola", 600, 300)], "vendidos", undefined);
    const hielo = top.filas.find((f) => f.nombre === "Hielo")!;
    expect(hielo.margen).toBeNull();
    expect(lineaTop(hielo)).toBe("Bebidas · 10 uds · sin costo cargado");
    expect(cuantosSinCosto(top)).toBe(1);
  });

  it("sin ingresos el margen se escribe —, no 0 %", () => {
    const top = armarTop([producto("Regalo", 0, -5, { unidades: 1 })], "vendidos", undefined);
    expect(top.filas[0].margen).toBeNull();
    expect(lineaTop(top.filas[0])).toBe("Bebidas · 1 ud · margen —");
  });

  it("con costo cargado muestra el margen entero", () => {
    const top = armarTop([producto("Paceña", 2460, 934.8, { categoria: "Cervezas", unidades: 164 })], "vendidos", undefined);
    expect(lineaTop(top.filas[0])).toBe("Cervezas · 164 uds · margen 38 %");
  });
});

describe("la planilla", () => {
  it("pone el tiempo de mesa arriba y sin puesto, y el margen con un decimal", () => {
    const top = armarTop(
      [producto("Tiempo de mesa", 4601, 4601), producto("Paceña", 2460, 934.8), producto("Hielo", 50, 50)],
      "vendidos",
      "BILLAR",
    );
    const filas = filasExportTop(top);
    expect(filas.map((f) => [f.puesto, f.nombre])).toEqual([
      [null, "Tiempo de mesa"],
      [1, "Paceña"],
      [2, "Hielo"],
    ]);
    expect(filas[1].margenPct).toBe(38);
    expect(filas[2]).toMatchObject({ margenPct: null, nota: "Sin costo cargado" });
  });
});

// ── Restaurante: contar lo que se ve (REP-01 / BUG-reportes-5, 28-oct) ──────

/** La carta de una pollería: el entero es caro y se vende poco; los cuartos, mucho. */
const POLLERIA = [
  producto("Pollo entero", 1200, 400, { categoria: "Pollos", unidades: 10 }),
  producto("Brasa cuarto", 1040, 390, { categoria: "Pollos", unidades: 40 }),
  producto("Broaster medio", 520, 180, { categoria: "Pollos", unidades: 10 }),
  producto("Coca Cola 2L", 560, 160, { categoria: "Bebidas", unidades: 20 }),
  producto("Ají de fideo", 300, 120, { categoria: "Platos de cuchara", unidades: 15 }),
];

describe("el ranking por unidades", () => {
  it("«unidades» ordena por cantidad vendida, no por plata", () => {
    // BUG-reportes-5: "Más vendidos" ordenaba por Bs y el pollo entero, caro,
    // salía primero aunque se vendieran cuatro veces más cuartos.
    expect(armarTop(POLLERIA, "vendidos", "RESTAURANTE").filas[0].nombre).toBe("Pollo entero");
    expect(armarTop(POLLERIA, "unidades", "RESTAURANTE").filas.map((f) => f.nombre)).toEqual([
      "Brasa cuarto",
      "Coca Cola 2L",
      "Ají de fideo",
      "Pollo entero",
      "Broaster medio",
    ]);
  });

  it("a igual cantidad desempata el que más vendió en plata", () => {
    const top = armarTop(POLLERIA, "unidades", "RESTAURANTE");
    expect(top.filas.slice(3).map((f) => f.nombre)).toEqual(["Pollo entero", "Broaster medio"]);
  });

  it("la fila dice las unidades como número y la plata en la línea", () => {
    const [cuarto] = armarTop(POLLERIA, "unidades", "RESTAURANTE").filas;
    expect(valorTop(cuarto, "unidades")).toBe(40);
    expect(pieTop(cuarto, "unidades")).toBe("unidades");
    expect(pieTop({ ...cuarto, unidades: 1 }, "unidades")).toBe("unidad");
    expect(lineaTop(cuarto, "unidades")).toBe(`Pollos · ${fmtMoney(1040)} · margen 38 %`);
    expect(fraccionTop(cuarto, cuarto, "unidades")).toBe(1);
  });

  it("debajo del número va qué número es, y una ganancia negativa se llama pérdida", () => {
    const f = armarTop([producto("Regalo", 10, -5)], "rentables", undefined).filas[0];
    expect(pieTop(f, "vendidos")).toBe("ingreso");
    expect(pieTop(f, "rentables")).toBe("pérdida");
    expect(pieTop({ ...f, utilidad: 3 }, "rentables")).toBe("ganancia");
  });

  it("sólo el restaurante cuenta así: los demás rubros siguen como siempre", () => {
    expect(cuentaLoVisible("RESTAURANTE")).toBe(true);
    for (const rubro of ["BILLAR", "FARMACIA", "PELUQUERIA", "ACADEMIA", "MINIMARKET", undefined]) {
      expect(cuentaLoVisible(rubro)).toBe(false);
    }
  });
});

describe("el buscador y la categoría", () => {
  const filas = armarTop(POLLERIA, "unidades", "RESTAURANTE").filas;

  it("busca en el nombre y en la categoría, sin importar tildes ni mayúsculas", () => {
    // Tecleando "pollo" el dueño espera los pollos, y ninguno se llama así.
    expect(filtrarTop(filas, "POLLO", null).visibles.map((f) => f.nombre)).toEqual([
      "Brasa cuarto",
      "Pollo entero",
      "Broaster medio",
    ]);
    expect(filtrarTop(filas, "aji", null).visibles.map((f) => f.nombre)).toEqual(["Ají de fideo"]);
    expect(filtrarTop(filas, "  cuarto ", null).busqueda).toBe("cuarto");
  });

  it("la categoría recorta, y junta con el buscador", () => {
    expect(filtrarTop(filas, "", "Bebidas").visibles.map((f) => f.nombre)).toEqual(["Coca Cola 2L"]);
    expect(filtrarTop(filas, "medio", "Pollos").visibles.map((f) => f.nombre)).toEqual(["Broaster medio"]);
    expect(filtrarTop(filas, "medio", "Bebidas").visibles).toEqual([]);
  });

  it("las categorías son las que vendieron en el período, alfabéticas", () => {
    expect(filtrarTop(filas, "", null).categorias).toEqual(["Bebidas", "Platos de cuchara", "Pollos"]);
  });

  it("una categoría que en este período no vendió cae en todas, en vez de dejar la lista vacía sin explicación", () => {
    const v = filtrarTop(filas, "", "Postres");
    expect(v.categoria).toBeNull();
    expect(v.visibles).toHaveLength(5);
    expect(filtrando(v)).toBe(false);
  });

  it("el filtro se escribe al lado del total", () => {
    expect(textoFiltro({ categoria: "Pollos", busqueda: "cuarto" })).toBe("Pollos · «cuarto»");
    expect(textoFiltro({ categoria: "Pollos", busqueda: "" })).toBe("Pollos");
    expect(textoFiltro({ categoria: null, busqueda: "cuarto" })).toBe("«cuarto»");
    // En la planilla la categoría se nombra siempre.
    expect(textoFiltro({ categoria: null, busqueda: "cuarto" }, true)).toBe("Todas las categorías · «cuarto»");
  });
});

describe("el total de lo que queda a la vista", () => {
  const filas = armarTop(POLLERIA, "unidades", "RESTAURANTE").filas;

  it("«¿cuántos pollos vendí?»: suma las unidades, la plata y la ganancia de lo visible", () => {
    const t = totalesTop(filtrarTop(filas, "", "Pollos").visibles);
    expect(t).toEqual({ cuantos: 3, unidades: 60, ingresos: 2760, utilidad: 970 });
  });

  it("las unidades por peso se suman con sus decimales y sin el ruido de los decimales", () => {
    const t = totalesTop([
      { ...filas[0], unidades: 0.1 },
      { ...filas[1], unidades: 0.2 },
    ]);
    expect(t.unidades).toBe(0.3);
  });

  it("dice primero el número de la métrica elegida y los otros dos al pie", () => {
    const t = { cuantos: 3, unidades: 60, ingresos: 2760, utilidad: 970 };
    expect(resumenTop(t, "unidades")).toEqual({
      valor: "60",
      sufijo: "unidades",
      perdida: false,
      detalle: `3 productos · ingresos ${fmtMoney(2760)} · ganancia ${fmtMoney(970)}`,
    });
    expect(resumenTop(t, "vendidos")).toMatchObject({ valor: fmtMoney(2760), sufijo: "de ingresos", detalle: `3 productos · 60 unidades · ganancia ${fmtMoney(970)}` });
    expect(resumenTop(t, "rentables")).toMatchObject({ valor: fmtMoney(970), sufijo: "de ganancia", detalle: `3 productos · 60 unidades · ingresos ${fmtMoney(2760)}` });
    expect(resumenTop({ ...t, cuantos: 1, unidades: 1 }, "unidades")).toMatchObject({ sufijo: "unidad", detalle: expect.stringMatching(/^1 producto · /) });
  });

  it("una ganancia negativa se llama pérdida, en rojo", () => {
    const t = { cuantos: 1, unidades: 2, ingresos: 10, utilidad: -12 };
    expect(resumenTop(t, "rentables")).toMatchObject({ valor: fmtMoney(12), sufijo: "de pérdida", perdida: true });
    expect(resumenTop(t, "vendidos").detalle).toBe(`1 producto · 2 unidades · pérdida ${fmtMoney(12)}`);
  });
});

describe("la planilla del restaurante", () => {
  it("lleva lo que se ve, en el orden elegido, con el total y el filtro escrito", () => {
    const filas = armarTop([...POLLERIA, producto("Hielo", 50, 50, { categoria: "Pollos", unidades: 5 })], "unidades", "RESTAURANTE").filas;
    const h = hojaTopVisible(filtrarTop(filas, "", "Pollos"), "Unidades");
    expect(h.nombre).toBe("Top productos (Unidades)");
    expect(h.filas.slice(1, 5).map((f) => f[1])).toEqual(["Brasa cuarto", "Pollo entero", "Broaster medio", "Hielo"]);
    expect(h.filas[5]).toEqual([]);
    expect(h.filas[6]).toEqual([null, "Total", null, 65, 2810, 1020, 36.3, "Incluye 1 producto sin costo cargado"]);
    expect(h.filas[7]).toEqual([null, "Filtro", "Pollos"]);
  });

  it("sin filtro no dice ningún filtro, y sin ingresos el margen del total queda vacío", () => {
    const h = hojaTopVisible(filtrarTop(armarTop([producto("Regalo", 0, -5, { unidades: 1 })], "vendidos", "RESTAURANTE").filas, "", null), "Ingresos");
    expect(h.filas[h.filas.length - 1]).toEqual([null, "Total", null, 1, 0, -5, null, null]);
  });
});

describe("la métrica que se recuerda", () => {
  beforeEach(() => localStorage.clear());

  it("la primera vez abre en ingresos, y después en la última elegida", () => {
    expect(leerOrdenTop("polleria-omar", "kevin")).toBe("vendidos");
    guardarOrdenTop("polleria-omar", "kevin", "unidades");
    expect(leerOrdenTop("polleria-omar", "kevin")).toBe("unidades");
  });

  it("es de cada negocio y de cada usuario", () => {
    // El contador y el dueño miran la misma compu buscando cosas distintas.
    guardarOrdenTop("polleria-omar", "kevin", "unidades");
    expect(leerOrdenTop("polleria-omar", "contador")).toBe("vendidos");
    expect(leerOrdenTop("otro-negocio", "kevin")).toBe("vendidos");
  });

  it("un valor que ya no existe abre en ingresos", () => {
    localStorage.setItem("bamardev.reportes.topMetrica_polleria-omar_kevin", "margen");
    expect(leerOrdenTop("polleria-omar", "kevin")).toBe("vendidos");
  });

  it("sin almacenamiento (modo privado) no se rompe: abre en ingresos y elegir sigue andando", () => {
    const leer = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const guardar = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(leerOrdenTop("polleria-omar", "kevin")).toBe("vendidos");
    expect(() => guardarOrdenTop("polleria-omar", "kevin", "unidades")).not.toThrow();
    leer.mockRestore();
    guardar.mockRestore();
  });
});
