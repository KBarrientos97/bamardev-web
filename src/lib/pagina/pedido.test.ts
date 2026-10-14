import { describe, expect, it } from "vitest";
import { agregarLinea, ajustarASucursal, cambiarCantidad, cantidadTotal, mensajePedido, totalPedido } from "./pedido";
import { catalogoEnSucursal } from "./catalogo";
import type { ItemCatalogoPublico } from "./tipos";

const item = (id: number, titulo: string, precio: number | null, precioDesde = false): ItemCatalogoPublico => ({
  id,
  titulo,
  descripcion: null,
  precio,
  precioDesde,
  fotoUrl: null,
});

describe("pedido por WhatsApp con sucursal elegida (13-oct)", () => {
  const conSucursales = {
    titulo: "Catálogo",
    sucursales: ["Norte", "Sur"],
    items: [
      { ...item(1, "Pollo", 100), icono: null, categoria: null, enSucursal: [{ precio: 100, disponible: true }, { precio: 110, disponible: true }] },
      { ...item(2, "Soda", 15), icono: null, categoria: null, enSucursal: [{ precio: 15, disponible: true }, { precio: 15, disponible: false }] },
    ],
  };

  it("el catálogo de una sucursal: su precio y sólo lo que ahí se ofrece", () => {
    expect(catalogoEnSucursal(conSucursales, 0).items.map((i) => [i.titulo, i.precio])).toEqual([
      ["Pollo", 100],
      ["Soda", 15],
    ]);
    expect(catalogoEnSucursal(conSucursales, 1).items.map((i) => [i.titulo, i.precio])).toEqual([["Pollo", 110]]);
    // Un índice que no existe (la página cambió): la primera.
    expect(catalogoEnSucursal(conSucursales, 7).items).toHaveLength(2);
    // Sin sucursales (la galería), tal cual.
    const galeria = { titulo: "Catálogo", items: [item(9, "Foto", 50)] };
    expect(catalogoEnSucursal(galeria, 1)).toBe(galeria);
  });

  it("al cambiar de sucursal el pedido toma sus precios y suelta lo que ahí no hay", () => {
    let l = agregarLinea([], catalogoEnSucursal(conSucursales, 0).items[0]);
    l = agregarLinea(l, catalogoEnSucursal(conSucursales, 0).items[1]);
    // Una línea de otra visita (no está en el catálogo de hoy) se respeta.
    l = [...l, { id: 99, titulo: "Viejo", precio: 5, desde: false, cantidad: 1 }];
    const sur = ajustarASucursal(l, catalogoEnSucursal(conSucursales, 1).items, conSucursales.items);
    expect(sur.map((x) => [x.titulo, x.precio])).toEqual([
      ["Pollo", 110],
      ["Viejo", 5],
    ]);
  });

  it("el mensaje dice de qué sucursal son los precios", () => {
    const l = agregarLinea([], item(1, "Pollo", 110));
    const texto = mensajePedido("Pollos Don Omar", l, { nombre: "", entrega: "RETIRO", direccion: "", nota: "" }, "Sur");
    expect(texto).toContain("Sucursal: Sur");
    expect(mensajePedido("X", l, { nombre: "", entrega: "RETIRO", direccion: "", nota: "" })).not.toContain("Sucursal");
  });
});

describe("pedido por WhatsApp", () => {
  it("suma, cambia cantidades y quita en cero", () => {
    let l = agregarLinea([], item(1, "Fresa con crema grande", 15));
    l = agregarLinea(l, item(1, "Fresa con crema grande", 15));
    l = agregarLinea(l, item(2, "Waffle", 20));
    expect(cantidadTotal(l)).toBe(3);
    l = cambiarCantidad(l, 2, -1);
    expect(l.map((x) => x.id)).toEqual([1]);
  });

  it("el total marca 'a confirmar' si algo no tiene precio o es 'desde'", () => {
    expect(totalPedido([{ id: 1, titulo: "A", precio: 15, desde: false, cantidad: 2 }])).toEqual({ total: 30, aConfirmar: false });
    expect(
      totalPedido([
        { id: 1, titulo: "A", precio: 15, desde: false, cantidad: 2 },
        { id: 2, titulo: "B", precio: null, desde: false, cantidad: 1 },
      ]),
    ).toEqual({ total: 30, aConfirmar: true });
  });

  it("arma un mensaje claro para quien atiende", () => {
    const l = [
      { id: 1, titulo: "Fresa con crema grande", precio: 15, desde: false, cantidad: 2 },
      { id: 2, titulo: "Torta por porción", precio: null, desde: false, cantidad: 1 },
    ];
    const m = mensajePedido("Fresas Doña Rosa", l, { nombre: "Ana", entrega: "DELIVERY", direccion: "Av. Busch 123", nota: "extra crema" });
    expect(m).toBe(
      [
        "Hola Fresas Doña Rosa, quiero hacer este pedido:",
        "",
        "• 2 × Fresa con crema grande (Bs 15) = Bs 30",
        "• 1 × Torta por porción (precio a consultar)",
        "",
        "Total: Bs 30 + lo que confirmen",
        "Delivery a: Av. Busch 123",
        "A nombre de: Ana",
        "Nota: extra crema",
      ].join("\n"),
    );
  });
});
