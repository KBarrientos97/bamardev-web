import { describe, expect, it } from "vitest";
import type { PantallaMenu } from "../../types/menuDigital";
import { enteroEnLetras, totalEnLetras } from "./enLetras";
import { paginar, platosDeLaPantalla, precioTv, type PlatoTv } from "./paginar";

describe("el total en letras del recibo", () => {
  it.each([
    [0, "cero"],
    [1, "uno"],
    [16, "dieciséis"],
    [21, "veintiuno"],
    [30, "treinta"],
    [45, "cuarenta y cinco"],
    [100, "cien"],
    [101, "ciento uno"],
    [123, "ciento veintitrés"],
    [267, "doscientos sesenta y siete"],
    [500, "quinientos"],
    [1000, "mil"],
    [1500, "mil quinientos"],
    [21000, "veintiún mil"],
    [101000, "ciento un mil"],
    [2_000_000, "dos millones"],
  ])("%d es «%s»", (n, letras) => {
    expect(enteroEnLetras(n)).toBe(letras);
  });

  it("los centavos van en número sobre cien", () => {
    expect(totalEnLetras(123)).toBe("Son: ciento veintitrés 00/100 bolivianos");
    expect(totalEnLetras(18.5)).toBe("Son: dieciocho 50/100 bolivianos");
    // El redondeo a centavos no deja "99,999…".
    expect(totalEnLetras(0.1 + 0.2)).toBe("Son: cero 30/100 bolivianos");
  });
});

const pantalla = (p: Partial<PantallaMenu> = {}): PantallaMenu => ({
  numero: 1,
  nombre: "TV 1",
  diseno: "fotos",
  tema: "brasa",
  colores: { fondo: "#000000", acento: "#FFFFFF", texto: "#FFFFFF" },
  titulo: "Pollos",
  subtitulo: "",
  cinta: "",
  categorias: [],
  ocultos: [],
  columnas: 4,
  tamano: "m",
  rotarSeg: 12,
  logo: true,
  fotos: true,
  descripciones: true,
  etiquetas: true,
  agotadosTachados: true,
  ...p,
});

const plato = (id: number, categoriaId: number, extra: Partial<PlatoTv & { enMenu: boolean }> = {}) => ({
  id,
  nombre: `Plato ${String(id).padStart(2, "0")}`,
  precio: 18,
  categoriaId,
  icono: null,
  foto: null,
  descripcion: null,
  etiqueta: null,
  destacado: false,
  agotado: false,
  enMenu: true,
  ...extra,
});

const CATS = [
  { id: 1, nombre: "Pollos" },
  { id: 2, nombre: "Bebidas" },
];

describe("qué platos muestra cada TV", () => {
  const platos = [plato(1, 1), plato(2, 1, { enMenu: false }), plato(3, 2), plato(4, 2, { agotado: true }), plato(5, 1)];

  it("sólo los que están en el menú, de sus categorías y sin los ocultos en esa TV", () => {
    const r = platosDeLaPantalla(pantalla({ categorias: [1], ocultos: [5] }), platos, CATS);
    expect(r.platos.map((p) => p.id)).toEqual([1]);
    expect(r.categorias).toEqual([{ id: 1, nombre: "Pollos" }]);
  });

  it("sin categorías elegidas muestra todas; los agotados, tachados o fuera", () => {
    expect(platosDeLaPantalla(pantalla(), platos, CATS).platos.map((p) => p.id)).toEqual([1, 3, 4, 5]);
    expect(platosDeLaPantalla(pantalla({ agotadosTachados: false }), platos, CATS).platos.map((p) => p.id)).toEqual([1, 3, 5]);
  });

  it("las categorías salen en el orden que eligió el dueño", () => {
    const r = platosDeLaPantalla(pantalla({ categorias: [2, 1] }), platos, CATS);
    expect(r.categorias.map((c) => c.nombre)).toEqual(["Bebidas", "Pollos"]);
  });
});

describe("las páginas de una TV", () => {
  const muchos = Array.from({ length: 25 }, (_, i) => plato(i + 1, i < 12 ? 1 : 2));

  it("Fotos con 4 columnas: 8 platos por página, la última con lo que sobra", () => {
    const paginas = paginar(pantalla(), muchos, CATS);
    expect(paginas).toHaveLength(4);
    expect(paginas.map((p) => (p.diseno === "fotos" ? p.platos.length : 0))).toEqual([8, 8, 8, 1]);
  });

  it("Lista: dos columnas por página y el título de la categoría se repite al seguir", () => {
    const paginas = paginar(pantalla({ diseno: "lista" }), muchos, CATS);
    const columnas = paginas.flatMap((p) => (p.diseno === "lista" ? p.columnas : []));
    // Ninguna columna arranca con un plato suelto, sin su título.
    for (const col of columnas) expect(col[0].categoria).toBeTruthy();
    const todos = columnas.flatMap((c) => c.flatMap((b) => b.platos.map((p) => p.id)));
    expect(todos).toHaveLength(25);
  });

  it("Destacado: el protagonista queda fijo en todas las páginas", () => {
    const conHeroe = muchos.map((p) => (p.id === 7 ? { ...p, destacado: true } : p));
    const paginas = paginar(pantalla({ diseno: "destacado" }), conHeroe, CATS);
    for (const p of paginas) expect(p.diseno === "destacado" && p.heroe?.id).toBe(7);
    const resto = paginas.flatMap((p) => (p.diseno === "destacado" ? p.columna.flatMap((b) => b.platos.map((x) => x.id)) : []));
    expect(resto).not.toContain(7);
    expect(resto).toHaveLength(24);
  });

  it("una TV sin platos igual tiene una página (vacía)", () => {
    expect(paginar(pantalla(), [], CATS)).toEqual([{ diseno: "fotos", platos: [] }]);
  });

  it("el precio de la TV va sin centavos cuando no los tiene", () => {
    expect(precioTv(18)).toBe("18");
    expect(precioTv(18.5)).toBe("18,50");
  });
});
