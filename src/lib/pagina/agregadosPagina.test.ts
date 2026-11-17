import { describe, expect, it } from "vitest";
import { catalogoDePagina, itemLlevaAgregados, textoIncluyeDeItem, vistaDeLinea } from "./agregadosPagina";
import { agregarLinea, ajustarASucursal, cambiarAgregados, cambiarCantidad, claveLinea, mensajePedido, subtotalLinea, totalPedido } from "./pedido";
import type { AgregadosPublicos, ItemCatalogoPublico } from "./tipos";

/**
 * Los toppings de la página del cliente (PLAN-AGREGADOS §8.3): el JSON público
 * se traduce al catálogo del POS y el carrito usa la misma regla de precio.
 */

const item = (id: number, titulo: string, precio: number): ItemCatalogoPublico => ({
  id,
  titulo,
  descripcion: null,
  precio,
  precioDesde: false,
  fotoUrl: null,
});

const NUTELLA_M = item(84, "Nutella M", 20);
const NUTELLA_C = item(83, "Nutella C", 10);
const SIN_TOPPINGS = item(99, "Agua", 5);

const AGREGADOS: AgregadosPublicos = {
  grupos: [
    {
      id: 1,
      nombre: "Toppings",
      incluidos: 2,
      precioExtra: null,
      maximo: null,
      opciones: [
        { productoId: 201, nombre: "Oreo", precio: 5, icono: null },
        { productoId: 202, nombre: "Chubi", precio: 5, icono: null },
        { productoId: 203, nombre: "Coco", precio: 2, icono: null },
      ],
    },
  ],
  items: [
    { itemId: 84, grupos: [{ grupoId: 1, incluidos: 2 }] },
    // El tamaño C trae uno solo (se configura por tamaño, PLAN-AGREGADOS §6 #2).
    { itemId: 83, grupos: [{ grupoId: 1, incluidos: 1 }] },
  ],
};

const cat = () => catalogoDePagina(AGREGADOS, 0)!.catalogo;

describe("«Incluye N toppings» de la tarjeta", () => {
  it("dice cuántos incluye cada tamaño y nada en lo que no lleva toppings", () => {
    expect(textoIncluyeDeItem(AGREGADOS, 84)).toBe("Incluye 2 toppings");
    // Con 1 incluido se singulariza: no «Incluye 1 toppings».
    expect(textoIncluyeDeItem(AGREGADOS, 83)).toBe("Incluye 1 topping");
    expect(textoIncluyeDeItem(AGREGADOS, 99)).toBeNull();
    expect(textoIncluyeDeItem(null, 84)).toBeNull();
    expect(itemLlevaAgregados(AGREGADOS, 84)).toBe(true);
    expect(itemLlevaAgregados(AGREGADOS, 99)).toBe(false);
    expect(itemLlevaAgregados(undefined, 84)).toBe(false);
  });
});

describe("el catálogo de toppings de la página", () => {
  it("sin grupos o sin ítems no hay catálogo", () => {
    expect(catalogoDePagina(null, 0)).toBeNull();
    expect(catalogoDePagina({ grupos: [], items: [] }, 0)).toBeNull();
  });

  it("toma los precios de la sucursal elegida y marca lo que ese local no ofrece", () => {
    const dos: AgregadosPublicos = {
      ...AGREGADOS,
      grupos: [
        {
          ...AGREGADOS.grupos[0],
          opciones: [
            { productoId: 201, nombre: "Oreo", precio: 5, enSucursal: [{ precio: 5, disponible: true }, { precio: 6, disponible: true }] },
            { productoId: 202, nombre: "Chubi", precio: 5, enSucursal: [{ precio: 5, disponible: true }, { precio: 5, disponible: false }] },
          ],
        },
      ],
    };
    const norte = catalogoDePagina(dos, 0)!;
    expect(norte.catalogo.grupos[0].opciones.map((o) => o.precio)).toEqual([5, 5]);
    expect(norte.noOfrecidas.size).toBe(0);
    const sur = catalogoDePagina(dos, 1)!;
    expect(sur.catalogo.grupos[0].opciones.map((o) => o.precio)).toEqual([6, 5]);
    expect([...sur.noOfrecidas]).toEqual([202]);
    // Un índice que no existe (la página cambió) cae en la primera.
    expect(catalogoDePagina(dos, 9)!.catalogo.grupos[0].opciones[0].precio).toBe(5);
  });
});

describe("el vaso con toppings en el carrito", () => {
  const dosIncluidos = [
    { grupoId: 1, productoId: 201, cantidad: 1 },
    { grupoId: 1, productoId: 202, cantidad: 1 },
  ];

  it("los dos primeros son gratis y el tercero se cobra a su precio", () => {
    const v = vistaDeLinea([...dosIncluidos, { grupoId: 1, productoId: 203, cantidad: 1 }], 84, cat());
    expect(v.extra).toBe(2);
    expect(v.hijas.map((h) => [h.nombre, h.incluido, h.subtotal])).toEqual([
      ["Oreo", true, 0],
      ["Chubi", true, 0],
      ["Coco", false, 2],
    ]);
  });

  it("la línea suma los extras al total: Nutella M Bs 20 + Coco Bs 2", () => {
    const l = agregarLinea([], NUTELLA_M, { elegidos: [...dosIncluidos, { grupoId: 1, productoId: 203, cantidad: 1 }], catalogo: cat() });
    expect(l).toHaveLength(1);
    expect(l[0].extra).toBe(2);
    expect(subtotalLinea(l[0])).toBe(22);
    expect(totalPedido(l)).toEqual({ total: 22, aConfirmar: false });
  });

  it("dos vasos con toppings distintos son dos líneas; con los mismos, una con cantidad 2", () => {
    const t1 = { elegidos: dosIncluidos, catalogo: cat() };
    const t2 = { elegidos: [{ grupoId: 1, productoId: 203, cantidad: 2 }], catalogo: cat() };
    let l = agregarLinea([], NUTELLA_M, t1);
    l = agregarLinea(l, NUTELLA_M, t2);
    expect(l).toHaveLength(2);
    l = agregarLinea(l, NUTELLA_M, t1);
    expect(l).toHaveLength(2);
    expect(l[0].cantidad).toBe(2);
    // Un vaso sin toppings es otra línea más, con la clave de siempre (el id).
    l = agregarLinea(l, NUTELLA_M);
    expect(l).toHaveLength(3);
    expect(claveLinea(l[2])).toBe("84");
    expect(new Set(l.map(claveLinea)).size).toBe(3);
  });

  it("subir y bajar la cantidad afecta sólo a esa línea; quitar la última la saca", () => {
    const t1 = { elegidos: dosIncluidos, catalogo: cat() };
    let l = agregarLinea([], NUTELLA_M, t1);
    l = agregarLinea(l, NUTELLA_M);
    const clave = claveLinea(l[0]);
    l = cambiarCantidad(l, clave, 1);
    expect(l.map((x) => x.cantidad)).toEqual([2, 1]);
    l = cambiarCantidad(cambiarCantidad(l, clave, -1), clave, -1);
    expect(l.map((x) => x.titulo)).toEqual(["Nutella M"]);
    expect(l[0].agregados).toBeUndefined();
  });

  it("editar los toppings recalcula; si queda igual a otra línea, se juntan", () => {
    const t1 = { elegidos: dosIncluidos, catalogo: cat() };
    let l = agregarLinea([], NUTELLA_M, t1);
    l = agregarLinea(l, NUTELLA_M, { elegidos: [{ grupoId: 1, productoId: 203, cantidad: 3 }], catalogo: cat() });
    // La segunda línea: 3 Coco = 2 incluidos + 1 extra (Bs 2).
    expect(l[1].extra).toBe(2);
    const cambiada = cambiarAgregados(l, claveLinea(l[1]), t1);
    expect(cambiada).toHaveLength(1);
    expect(cambiada[0].cantidad).toBe(2);
    // Sin ningún topping: vuelve a ser el vaso pelado.
    const pelado = cambiarAgregados(l, claveLinea(l[0]), { elegidos: [], catalogo: cat() });
    expect(claveLinea(pelado[0])).toBe("84");
    expect(pelado[0].hijas).toBeUndefined();
  });

  it("cambiar de sucursal recalcula los extras con los precios del otro local", () => {
    const dos: AgregadosPublicos = {
      ...AGREGADOS,
      grupos: [
        {
          ...AGREGADOS.grupos[0],
          opciones: [
            { productoId: 201, nombre: "Oreo", precio: 5, enSucursal: [{ precio: 5, disponible: true }, { precio: 8, disponible: true }] },
            { productoId: 202, nombre: "Chubi", precio: 5, enSucursal: [{ precio: 5, disponible: true }, { precio: 5, disponible: true }] },
            { productoId: 203, nombre: "Coco", precio: 2, enSucursal: [{ precio: 2, disponible: true }, { precio: 3, disponible: true }] },
          ],
        },
      ],
    };
    const elegidos = [
      { grupoId: 1, productoId: 201, cantidad: 1 },
      { grupoId: 1, productoId: 202, cantidad: 1 },
      { grupoId: 1, productoId: 203, cantidad: 1 },
    ];
    const l = agregarLinea([], NUTELLA_M, { elegidos, catalogo: catalogoDePagina(dos, 0)!.catalogo });
    expect(l[0].extra).toBe(2);
    const sur = ajustarASucursal(l, [{ ...NUTELLA_M, precio: 22 }], [NUTELLA_M], catalogoDePagina(dos, 1)!.catalogo);
    expect(sur[0].precio).toBe(22);
    expect(sur[0].extra).toBe(3);
    expect(subtotalLinea(sur[0])).toBe(25);
  });

  it("el tamaño C incluye uno solo: el segundo ya es extra", () => {
    const l = agregarLinea([], NUTELLA_C, { elegidos: dosIncluidos, catalogo: cat() });
    expect(l[0].extra).toBe(5);
    expect(subtotalLinea(l[0])).toBe(15);
  });

  it("el mensaje de WhatsApp pone los toppings debajo del vaso", () => {
    const l = agregarLinea([], NUTELLA_M, { elegidos: [...dosIncluidos, { grupoId: 1, productoId: 203, cantidad: 1 }], catalogo: cat() });
    const texto = mensajePedido("El Ganadero", [...l, ...agregarLinea([], SIN_TOPPINGS)], { nombre: "", entrega: "RETIRO", direccion: "", nota: "" });
    expect(texto).toContain("• 1 × Nutella M (Bs 22) = Bs 22\n   + Oreo, Chubi, Coco (extra)");
    expect(texto).toContain("Total: Bs 27");
  });
});
