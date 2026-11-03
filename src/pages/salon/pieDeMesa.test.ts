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

  it("que el cliente ya pagó se avisa en verde, no como advertencia", () => {
    // Iba en el mismo ámbar que "falta servir" y se leía como un problema
    // justo cuando la mesa quedó bien.
    expect(pieDeMesa(mesa({ estado: "PAGADA" }), money).tonoBanner).toBe("exito");
    expect(pieDeMesa(mesa({ estado: "CUENTA" }), money).tonoBanner).not.toBe("exito");
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

/**
 * "Cobrar" del mesero (BUG-salon-3 / SAL-02), con las reglas de la app
 * (`pintarCobrarYo`). La web lo dibujaba con sólo mirar que hubiera consumo.
 */
describe("el mesero cobra su mesa", () => {
  /** El mesero 7, con `salon.cobrar_mesero`, y el negocio con mesero_cobra. */
  const yo = { cobraSusMesas: true, usuarioId: 7 };
  const mia = (p: Partial<Mesa> = {}) => mesa({ meseroId: 7, meseroNombre: "Carla", ...p });

  it("su mesa ocupada y todo servido: Cobrar con el consumo, y pasar a caja sigue", () => {
    const pie = pieDeMesa(mia(), money, yo);
    expect(pie.cobrar?.texto).toBe("Cobrar Bs 26.00");
    // Son dos caminos, no un reemplazo.
    expect(pie.secundario?.accion).toBe("cuenta");
  });

  it("su mesa en caja: también la puede cobrar", () => {
    // El cliente le pone la plata en la mano: no tiene sentido mandarlo a caja.
    expect(pieDeMesa(mia({ estado: "CUENTA" }), money, yo).cobrar).toBeDefined();
  });

  it("en una mesa pagada no ofrece cobrar: lo que falta es liberarla", () => {
    // El bug: estaOcupada cuenta la PAGADA y el consumo sigue > 0 hasta
    // liberar, así que TODA mesa pagada mostraba "Cobrar Bs X" como botón
    // principal (el backend: "la mesa ya se cobró") y "Levantar y liberar"
    // quedaba de segundo.
    const pie = pieDeMesa(mia({ estado: "PAGADA", consumo: 52 }), money, yo);
    expect(pie.cobrar).toBeUndefined();
    expect(pie.principal.accion).toBe("liberar");
  });

  it("con platos sin servir no la cobra: sería cobrar algo que el cliente no recibió", () => {
    // Acá el backend no frena: la regla vive sólo en la pantalla.
    const pie = pieDeMesa(mia({ comandas: [comanda()] }), money, yo);
    expect(pie.cobrar).toBeUndefined();
    expect(pie.banner).toContain("Primero llevá a la mesa");
  });

  it("sin nada pedido no hay nada que cobrar", () => {
    expect(pieDeMesa(mia({ comandas: [], consumo: 0 }), money, yo).cobrar).toBeUndefined();
  });

  it("la mesa de otro mesero no se cobra, y se dice por qué", () => {
    // El backend la rechaza: ofrecer un botón que siempre falla es peor que
    // no ofrecerlo, y sin el porqué parecería que la app se rompió.
    const pie = pieDeMesa(mesa({ meseroId: 3, meseroNombre: "Luis" }), money, yo);
    expect(pie.cobrar).toBeUndefined();
    expect(pie.banner).toBe(
      "Esta mesa la atiende Luis. Sólo puede cobrarla quien la atendió, o la caja.",
    );
  });

  it("en caja, la mesa de otro no pisa el aviso de la caja", () => {
    const pie = pieDeMesa(mesa({ estado: "CUENTA", meseroId: 3, meseroNombre: "Luis" }), money, yo);
    expect(pie.cobrar).toBeUndefined();
    expect(pie.banner).toContain("ya está en caja");
  });

  it("sin el permiso salon.cobrar_mesero no se ofrece, aunque el negocio lo habilite", () => {
    const pie = pieDeMesa(mia(), money, { ...yo, cobraSusMesas: false });
    expect(pie.cobrar).toBeUndefined();
    // Ni el porqué: no es algo que esta persona pueda hacer.
    expect(pie.banner).toBeUndefined();
  });

  it("sin mesero_cobra (no llega el contexto) el pie es el de siempre", () => {
    const pie = pieDeMesa(mia(), money);
    expect(pie.cobrar).toBeUndefined();
    expect(pie.banner).toBeUndefined();
  });
});
