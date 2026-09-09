import { describe, expect, it } from "vitest";
import type { Comanda, Mesa } from "../../types/salon";
import { pieDeMesa } from "./pieDeMesa";

const money = (n: number) => `Bs ${n.toFixed(2)}`;

function comanda(p: Partial<Comanda> = {}): Comanda {
  return {
    id: 1,
    estado: "ENVIADA",
    enviadaEn: "2026-09-08T20:00:00.000Z",
    items: [
      { id: 1, productoId: 1, nombre: "Brasa", cantidad: 1, precio: 26 },
    ],
    ...p,
  };
}

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "OCUPADA",
    comensales: 2,
    consumo: 26,
    propina: 0,
    comandas: [comanda({ estado: "SERVIDA" })],
    ...p,
  };
}

describe("el pie de la hoja de mesa", () => {
  it("ocupada y todo servido: se puede pasar la cuenta a caja", () => {
    const pie = pieDeMesa(mesa(), money);
    expect(pie.principal.texto).toBe("Agregar pedido");
    expect(pie.secundario?.accion).toBe("cuenta");
    expect(pie.secundario?.deshabilitado).toBeFalsy();
    expect(pie.banner).toBeUndefined();
  });

  it("con pedidos sin llevar, la cuenta queda apagada y el banner lo explica", () => {
    // La cuenta se estaría cerrando con comida en camino.
    const pie = pieDeMesa(mesa({ comandas: [comanda()] }), money);
    expect(pie.secundario?.accion).toBe("cuenta");
    expect(pie.secundario?.deshabilitado).toBe(true);
    expect(pie.banner).toContain("Primero llevá a la mesa el pedido que falta");
  });

  it("el banner cuenta cuántos pedidos faltan", () => {
    const dos = mesa({ comandas: [comanda({ id: 1 }), comanda({ id: 2 })] });
    expect(pieDeMesa(dos, money).banner).toContain("los 2 pedidos que faltan");
  });

  it("ocupada sin nada pedido: se libera, no se manda a caja", () => {
    // Sin esta salida la mesa quedaba ocupada para siempre: "Pedir la cuenta"
    // apagado era el único botón, y la caja no cobra Bs 0.
    const pie = pieDeMesa(mesa({ comandas: [] }), money);
    expect(pie.secundario?.accion).toBe("liberar");
    expect(pie.secundario?.texto).toBe("Liberar la mesa · nadie pidió nada");
  });

  it("si le anularon todo, tampoco hay cuenta que mandar", () => {
    // Lo anulado viaja en `anulados`, no dentro de `items`: la comanda queda
    // ENVIADA y con la lista de productos vacía.
    const anulada = comanda({
      items: [],
      anulados: [
        { id: 1, productoId: 1, nombre: "Brasa", cantidad: 1, precio: 26, motivo: "El cliente lo canceló" },
      ],
    });
    const pie = pieDeMesa(mesa({ comandas: [anulada] }), money);
    expect(pie.secundario?.accion).toBe("liberar");
  });

  it("por cobrar: la pelota está en caja, no hay nada que apurar", () => {
    const pie = pieDeMesa(mesa({ estado: "CUENTA" }), money);
    expect(pie.banner).toContain("ya está en caja");
    // Pero todavía se puede pedir algo más: el café último no obliga a abrir
    // otra mesa.
    expect(pie.principal.accion).toBe("agregar");
    expect(pie.secundario).toBeUndefined();
  });

  it("pagada: lo único que falta es levantarla", () => {
    const pie = pieDeMesa(mesa({ estado: "PAGADA", consumo: 52 }), money);
    expect(pie.principal.accion).toBe("liberar");
    expect(pie.banner).toBe("El cliente ya pagó Bs 52.00");
    expect(pie.secundario).toBeUndefined();
  });

  it("reservada: sentar a los que llegaron, o tocar la reserva", () => {
    const pie = pieDeMesa(mesa({ estado: "RESERVADA" }), money);
    expect(pie.principal.accion).toBe("abrir");
    expect(pie.secundario?.accion).toBe("reserva_cambiar");
    expect(pie.terciario?.accion).toBe("reserva_anular");
  });

  it("libre: sólo sentar gente", () => {
    const pie = pieDeMesa(mesa({ estado: "LIBRE", comandas: [] }), money);
    expect(pie.principal.accion).toBe("abrir");
    expect(pie.secundario).toBeUndefined();
    expect(pie.terciario).toBeUndefined();
  });

  it("nunca ofrece liberar una mesa que todavía no cobraron", () => {
    // Es la regla que evita que alguien suelte una mesa con consumo sin pagar.
    const conConsumo = pieDeMesa(mesa(), money);
    expect([conConsumo.principal.accion, conConsumo.secundario?.accion]).not.toContain(
      "liberar",
    );
  });
});
