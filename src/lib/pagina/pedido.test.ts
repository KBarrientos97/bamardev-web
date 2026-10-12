import { describe, expect, it } from "vitest";
import { agregarLinea, cambiarCantidad, cantidadTotal, mensajePedido, totalPedido } from "./pedido";
import type { ItemCatalogoPublico } from "./tipos";

const item = (id: number, titulo: string, precio: number | null, precioDesde = false): ItemCatalogoPublico => ({
  id,
  titulo,
  descripcion: null,
  precio,
  precioDesde,
  fotoUrl: null,
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
