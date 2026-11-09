import { describe, expect, it } from "vitest";
import type { PantallaMenu } from "../../types/menuDigital";
import { armarAnimacion, conAnimacion, escenaDeMuestra, mezclarEdicion, POR_GRUPO, type Escena } from "./animado";
import { categoriasDeBebidas, esBebida } from "./bebidas";
import { ordenar, paginar, type PlatoTv } from "./paginar";

/**
 * Las TVs animadas del menú digital (8-nov): qué es bebida, el orden que elige
 * el dueño y la función que se repite en cada diseño. Lo que se dibuja está en
 * TableroAnimado; acá, las cuentas.
 */

const pantalla = (p: Partial<PantallaMenu> = {}): PantallaMenu => ({
  numero: 1,
  nombre: "TV 1",
  diseno: "destacado",
  tema: "rojo",
  colores: { fondo: "#000000", acento: "#FFFFFF", texto: "#FFFFFF" },
  titulo: "Nuestro menú",
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

const plato = (id: number, nombre: string, categoriaId: number | null, icono: string | null = null): PlatoTv => ({
  id,
  nombre,
  precio: 18,
  categoriaId,
  icono,
  foto: null,
  descripcion: null,
  etiqueta: null,
  destacado: false,
  agotado: false,
});

// La categoría de bebidas tiene el id MÁS BAJO: en el catálogo sale primero.
const CATS = [
  { id: 1, nombre: "Bebidas" },
  { id: 2, nombre: "Platos" },
];
const POLLOS = [plato(10, "Cuarto Brasa", 2), plato(11, "Medio Brasa", 2), plato(12, "Salchipapas", 2)];
const GASEOSAS = Array.from({ length: 10 }, (_, i) => plato(20 + i, `Gaseosa ${i + 1}`, 1, "gaseosa"));
const ids = (e: Escena[]) => e.map((x) => x.clave);

describe("qué es bebida", () => {
  it("por el nombre de la categoría, con o sin acento", () => {
    const r = categoriasDeBebidas(
      [
        { id: 1, nombre: "Bebidas" },
        { id: 2, nombre: "Jugos naturales" },
        { id: 3, nombre: "Cafés y té" },
        { id: 4, nombre: "Platos" },
        { id: 5, nombre: "Postres" },
      ],
      [],
    );
    expect([...r].sort()).toEqual([1, 2, 3]);
  });

  it("un nombre de comida gana aunque nombre una bebida", () => {
    // "Combos con gaseosa" es comida: sacarla con «Sólo comida» dejaba la TV
    // de los pollos sin sus combos.
    expect(categoriasDeBebidas([{ id: 1, nombre: "Combos con gaseosa" }], []).size).toBe(0);
  });

  it("si el nombre no dice nada, por los íconos de la mayoría de sus platos", () => {
    const varios = [plato(1, "Coca", 9, "gaseosa"), plato(2, "Agua", 9, "agua"), plato(3, "Paceña", 9, "cerveza_pacena_botella"), plato(4, "Hielo", 9, "hielo")];
    expect(categoriasDeBebidas([{ id: 9, nombre: "Varios" }], varios).has(9)).toBe(true);
    // Uno solo no alcanza para decidir, y mitad y mitad tampoco.
    expect(categoriasDeBebidas([{ id: 9, nombre: "Varios" }], [plato(1, "Coca", 9, "gaseosa")]).size).toBe(0);
    const mitad = [plato(1, "Coca", 9, "gaseosa"), plato(2, "Pollo", 9, "cuarto_pollo_brasa")];
    expect(categoriasDeBebidas([{ id: 9, nombre: "Varios" }], mitad).size).toBe(0);
  });

  it("un plato sin categoría se decide por su ícono", () => {
    expect(esBebida(plato(1, "Coca", null, "soda"), new Set())).toBe(true);
    expect(esBebida(plato(2, "Pollo", null, "cuarto_pollo_brasa"), new Set())).toBe(false);
  });
});

describe("el orden de los platos en una TV", () => {
  it("adentro de su categoría, el que eligió el dueño; los que no acomodó, después y por nombre", () => {
    const r = ordenar([...POLLOS, plato(13, "Alitas", 2)], CATS, [12, 10]);
    expect(r.map((p) => p.nombre)).toEqual(["Salchipapas", "Cuarto Brasa", "Alitas", "Medio Brasa"]);
  });

  it("sin orden elegido queda como siempre: por nombre", () => {
    expect(ordenar(POLLOS.slice().reverse(), CATS).map((p) => p.id)).toEqual([10, 11, 12]);
  });

  it("los diseños quietos también lo respetan", () => {
    const [pagina] = paginar(pantalla({ diseno: "fotos", orden: [11] }), POLLOS, CATS);
    expect(pagina.diseno === "fotos" && pagina.platos.map((p) => p.id)).toEqual([11, 10, 12]);
  });
});

describe("Presentación", () => {
  const presentacion = (p: Partial<PantallaMenu> = {}) =>
    armarAnimacion(pantalla({ animado: "presentacion", ...p }), [...GASEOSAS, ...POLLOS], CATS).escenas;

  it("arranca con el logo, después los platos de a uno y las bebidas al final, en grupos", () => {
    // Kevin: "primero de elaborado, luego las bebidas". Aunque la categoría de
    // bebidas esté primero en el catálogo.
    const e = presentacion();
    expect(ids(e)).toEqual(["intro", "k-Platos", "p-10", "p-11", "p-12", "k-Bebidas", "g-Bebidas-0", "g-Bebidas-1"]);
    const grupos = e.filter((x) => x.tipo === "grupo");
    expect(grupos.map((g) => g.tipo === "grupo" && g.platos.length)).toEqual([POR_GRUPO, 2]);
  });

  it("sin la presentación con el logo empieza por los platos", () => {
    expect(presentacion({ intro: false })[0].clave).toBe("k-Platos");
  });

  it("cada plato dura lo que eligió el dueño", () => {
    const e = presentacion({ segPlato: 8 });
    expect(e.find((x) => x.tipo === "plato")?.ms).toBe(8000);
  });
});

describe("Carrusel y Mosaico", () => {
  it("con platos y bebidas, las bebidas pasan por la cinta y los platos quedan en grande", () => {
    const a = armarAnimacion(pantalla({ animado: "carrusel" }), [...GASEOSAS, ...POLLOS], CATS);
    expect(a.cinta).toHaveLength(10);
    expect(ids(a.escenas)).toEqual(["intro", "c-10", "c-11", "c-12"]);
    // La lista de al lado marca al protagonista: es la página en la que está.
    const segunda = a.escenas[2];
    expect(segunda.tipo === "carrusel" && segunda.columna.flatMap((b) => b.platos.map((p) => p.id))).toContain(11);
  });

  it("con la cinta de bebidas apagada, van arriba después de los platos", () => {
    const a = armarAnimacion(pantalla({ animado: "carrusel", bebidasEnCinta: false }), [...GASEOSAS, ...POLLOS], CATS);
    expect(a.cinta).toHaveLength(0);
    expect(ids(a.escenas).slice(1, 5)).toEqual(["c-10", "c-11", "c-12", "c-20"]);
  });

  it("una TV de sólo bebidas las muestra arriba: si no, quedaría vacía", () => {
    const a = armarAnimacion(pantalla({ animado: "mosaico" }), GASEOSAS, CATS);
    expect(a.cinta).toHaveLength(0);
    expect(a.escenas.filter((e) => e.tipo === "mosaico").flatMap((e) => (e.tipo === "mosaico" ? e.platos : []))).toHaveLength(10);
  });

  it("Mosaico: páginas de columnas × filas, y el foco alcanza a pasar por todas", () => {
    const a = armarAnimacion(pantalla({ animado: "mosaico", columnas: 4, bebidasEnCinta: false }), [...GASEOSAS, ...POLLOS], CATS);
    const paginas = a.escenas.filter((e) => e.tipo === "mosaico");
    expect(paginas.map((e) => (e.tipo === "mosaico" ? e.platos.length : 0))).toEqual([8, 5]);
    // 8 tarjetas a 1,5 s cada una no entran en los 12 s de la página.
    expect(paginas[0].ms).toBe(12_000);
    expect(armarAnimacion(pantalla({ animado: "mosaico", columnas: 5, rotarSeg: 8 }), [...POLLOS, ...POLLOS.map((p) => ({ ...p, id: p.id + 100 }))], CATS).escenas[1].ms).toBe(9000);
  });

  it("la miniatura muestra platos, no el cartel ni la presentación", () => {
    const e = armarAnimacion(pantalla({ animado: "presentacion" }), POLLOS, CATS).escenas;
    expect(escenaDeMuestra(e)?.clave).toBe("p-10");
  });

  it("sin platos la TV muestra la marca, no una pantalla vacía", () => {
    expect(ids(armarAnimacion(pantalla({ animado: "carrusel", intro: false }), [], CATS).escenas)).toEqual(["intro"]);
  });
});

describe("lo que llega de una versión anterior", () => {
  it("una TV guardada antes de las animaciones se lee quieta y con los de fábrica", () => {
    expect(conAnimacion(pantalla())).toEqual({
      animado: null,
      intro: true,
      textoIntro: "",
      segPlato: 6,
      bebidasEnCinta: true,
      ladoLogo: "derecha",
      orden: [],
    });
  });

  it("la vista previa de Android: si elige otro diseño quieto, la animación se apaga", () => {
    // La app no conoce `animado`: sin esto la TV seguía animada aunque en el
    // celular dijera "Lista", hasta recargar.
    const guardada = pantalla({ animado: "carrusel", diseno: "destacado" });
    expect(mezclarEdicion(guardada, { diseno: "lista" }).animado).toBeNull();
    expect(mezclarEdicion(guardada, { diseno: "destacado", titulo: "Combos" }).animado).toBe("carrusel");
    expect(mezclarEdicion(guardada, { titulo: "Combos" }).animado).toBe("carrusel");
    expect(mezclarEdicion(guardada, null)).toBe(guardada);
  });
});
