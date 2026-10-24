import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_ICONO,
  CATEGORIA_DEL_RUBRO,
  ICONOS_ARTICULO,
  buscarIconos,
  categoriaDelRubro,
  categoriaInicial,
  colorDeCategoria,
  iconoPorLlave,
  iconosDeCategoria,
  inicialesDe,
} from "./iconosArticulo";
import { RUBROS } from "./rubro";

/**
 * Las llaves y el monograma tienen que dar lo mismo que en la app: un artículo
 * con ícono puesto desde Android debe verse igual acá, y el producto sin ícono
 * debe mostrar las mismas iniciales en las dos plataformas.
 */
describe("iconosArticulo", () => {
  it("resuelve una llave del catálogo", () => {
    const i = iconoPorLlave("medio_pollo_broaster");
    expect(i?.etiqueta).toBe("Broaster medio");
    expect(i?.src).toBeTruthy();
  });

  it("una llave desconocida o vacía cae al monograma", () => {
    // Un ícono que existe en una versión más nueva de la app no puede romper
    // la web: simplemente no se dibuja.
    expect(iconoPorLlave("pizza_hawaiana")).toBeNull();
    expect(iconoPorLlave("")).toBeNull();
    expect(iconoPorLlave("   ")).toBeNull();
    expect(iconoPorLlave(null)).toBeNull();
    expect(iconoPorLlave(undefined)).toBeNull();
  });

  it("no hay llaves repetidas en el catálogo", () => {
    const llaves = ICONOS_ARTICULO.map((i) => i.llave);
    expect(new Set(llaves).size).toBe(llaves.length);
  });

  it("cada ícono tiene su imagen y una sección que existe", () => {
    const claves = new Set<string>(CATEGORIAS_ICONO.map((c) => c.clave));
    for (const i of ICONOS_ARTICULO) {
      expect(claves.has(i.categoria), `${i.llave} → ${i.categoria}`).toBe(true);
      // Sin archivo `ic_art_<llave>.webp` el glob no da URL y se vería roto.
      expect(i.src, i.llave).toMatch(/ic_art_.+\.webp/);
    }
  });

  it("ningún ícono se mete en el JS como base64", () => {
    // El `?no-inline` del glob: si alguien lo saca, los chicos vuelven a
    // inflar el chunk (ver el comentario de `URLS`).
    expect(ICONOS_ARTICULO.some((i) => i.src.startsWith("data:"))).toBe(false);
  });

  it("cada sección tiene íconos y su pestaña es uno de ellos", () => {
    expect(new Set(CATEGORIAS_ICONO.map((c) => c.clave)).size).toBe(CATEGORIAS_ICONO.length);
    for (const c of CATEGORIAS_ICONO) {
      expect(iconosDeCategoria(c.clave).length, c.clave).toBeGreaterThan(0);
      expect(iconoPorLlave(c.tab)?.categoria, c.clave).toBe(c.clave);
    }
  });

  it("los 16 de pollería de siempre conservan su llave", () => {
    // Ya los usan productos reales (Omar): renombrar uno lo deja en monograma.
    const viejos = [
      "economico_pollo_broaster", "cuarto_pollo_broaster", "medio_pollo_broaster", "pollo_entero_broaster",
      "economico_pollo_brasa", "cuarto_pollo_brasa", "medio_pollo_brasa", "pollo_entero_brasa",
      "combo_pollo_soda", "hamburguesa", "hamburguesa_soda", "salchipapas",
      "papas_fritas", "arroz", "soda", "jugos",
    ];
    for (const llave of viejos) {
      expect(iconoPorLlave(llave)?.categoria, llave).toBe("polleria");
    }
    expect(ICONOS_ARTICULO).toHaveLength(193);
  });

  it("la licorería (para el billar) tiene sus 18 íconos y abre ahí", () => {
    const llaves = iconosDeCategoria("licoreria").map((i) => i.llave);
    expect(llaves).toHaveLength(18);
    expect(llaves).toEqual(expect.arrayContaining(["cerveza_pacena_botella", "red_bull", "cigarrillos", "encendedor"]));
    // Una llave nunca se renombra: la guardan los productos (y la app).
    expect(iconoPorLlave("hoja_coca")?.categoria).toBe("licoreria");
    expect(categoriaDelRubro("BILLAR")).toBe("licoreria");
    // Buscar "cerveza" encuentra también las marcas, no sólo las genéricas.
    expect(buscarIconos("cerveza").map((i) => i.llave)).toEqual(
      expect.arrayContaining(["cerveza", "brindis", "cerveza_huari", "cerveza_corona"]),
    );
  });

  it("cada rubro abre en una sección que existe", () => {
    const claves = new Set<string>(CATEGORIAS_ICONO.map((c) => c.clave));
    for (const rubro of RUBROS) {
      expect(claves.has(CATEGORIA_DEL_RUBRO[rubro]), rubro).toBe(true);
    }
    expect(categoriaDelRubro("FARMACIA")).toBe("farmacia");
    expect(categoriaDelRubro("SPA")).toBe("belleza");
    expect(categoriaDelRubro("REPUESTOS")).toBe("vehiculos");
    // Rubro desconocido o sin sesión: la primera, la de siempre.
    expect(categoriaDelRubro(undefined)).toBe("polleria");
    expect(categoriaDelRubro("OTRO")).toBe("polleria");
  });

  it("el selector abre en la sección del ícono puesto; si no hay, en la del rubro", () => {
    expect(categoriaInicial("martillo", "RESTAURANTE")).toBe("ferreteria");
    expect(categoriaInicial("medio_pollo_broaster", "FARMACIA")).toBe("polleria");
    expect(categoriaInicial(null, "FARMACIA")).toBe("farmacia");
    expect(categoriaInicial("", "BILLAR")).toBe("licoreria");
    // Un billar que ya eligió un dado ve la sección de ese ícono.
    expect(categoriaInicial("dados", "BILLAR")).toBe("juegos");
    // Llave desconocida (de una versión más nueva) cuenta como sin ícono.
    expect(categoriaInicial("no_existe", "FARMACIA")).toBe("farmacia");
    expect(categoriaInicial(null, undefined)).toBe("polleria");
    expect(categoriaInicial(undefined, "OTRO")).toBe("polleria");
  });

  it("la búsqueda ignora tildes y mayúsculas", () => {
    expect(buscarIconos("cafe").map((i) => i.llave)).toContain("cafe");
    expect(buscarIconos("TERMOMETRO").map((i) => i.llave)).toContain("termometro");
    expect(buscarIconos("broaster")).toHaveLength(4);
    expect(buscarIconos("   ")).toEqual([]);
  });

  // Los cuatro ejemplos que documenta IconosArticulo.kt / ProductoPosAdapter.
  it.each([
    ["Coca-Cola Lata", "CC"],
    ["Agua sin gas 500ml", "AG"],
    ["Pollo Broaster 1/4", "PB"],
    ["Hamburguesa Clásica", "HC"],
  ])("monograma de %s es %s", (nombre, esperado) => {
    expect(inicialesDe(nombre)).toBe(esperado);
  });

  it("una sola palabra usa sus dos primeras letras", () => {
    expect(inicialesDe("Salchipapas")).toBe("SA");
  });

  it("ignora las palabras de relleno y las medidas", () => {
    // "de" y "1L" no aportan al logo del producto.
    expect(inicialesDe("Jugo de Naranja 1L")).toBe("JN");
  });

  it("un nombre sin letras no revienta", () => {
    expect(inicialesDe("///")).toBe("/");
    expect(inicialesDe("")).toBe("?");
  });

  it("el color de categoría no distingue mayúsculas ni tildes", () => {
    expect(colorDeCategoria("Bebidas")).toEqual(colorDeCategoria("bebidas"));
    // La app acepta la categoría escrita con y sin tilde.
    expect(colorDeCategoria("Acompañamientos")).toEqual(colorDeCategoria("acompanamientos"));
  });

  it("una categoría desconocida o ausente cae al color por defecto", () => {
    const defecto = colorDeCategoria(null);
    expect(colorDeCategoria("Ferretería")).toEqual(defecto);
    expect(colorDeCategoria(undefined)).toEqual(defecto);
  });

  it("el por defecto es el verde de siempre, pero se puede teñir con la paleta (B-24)", () => {
    // Sin la variable (restaurante, farmacia) el navegador usa el respaldo.
    expect(colorDeCategoria(null)).toEqual({
      bg: "var(--monograma-bg, #D1FAE5)",
      fg: "var(--monograma-fg, #047857)",
    });
    // Las categorías conocidas no cambian.
    expect(colorDeCategoria("Bebidas")).toEqual({ bg: "#DBEAFE", fg: "#1D4ED8" });
  });
});
