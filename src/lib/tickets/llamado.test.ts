import { describe, expect, it } from "vitest";
import { cronometro, demora, listos, preparando } from "../../pages/tickets/useTableroTickets";
import type { TicketPedido } from "../../types/tickets";
import { esClaro, minutosDesde, numeroTicket, paletaTv, textoVoz } from "./llamado";
import { llamadosNuevos, VIGENCIA_MS } from "./llamadosNuevos";

describe("cómo se canta el número", () => {
  it("con cuatro cifras, y pasado 9999 sigue creciendo", () => {
    expect(numeroTicket(72)).toBe("0072");
    expect(numeroTicket(12345)).toBe("12345");
  });

  it("la voz lo dice dígito por dígito, como está impreso", () => {
    // "setenta y dos" no se parece a lo que el cliente tiene en la mano.
    expect(textoVoz(72, "TICKET", "Su pedido está listo")).toBe(
      "Ticket, cero, cero, siete, dos. Su pedido está listo.",
    );
  });

  it("sin etiqueta ni frase dice sólo el número", () => {
    expect(textoVoz(5, "  ", "")).toBe("cero, cero, cero, cinco.");
  });

  it("no duplica el punto ni los signos de la frase", () => {
    expect(textoVoz(1, "Pedido", "¡Ya está listo!")).toBe("Pedido, cero, cero, cero, uno. ¡Ya está listo.");
  });
});

describe("los colores de la TV", () => {
  it("el número va negro sobre el amarillo y blanco sobre el rojo", () => {
    expect(paletaTv({ tema: "rojo", colores: { fondo: "#000000", acento: "#000000", texto: "#000000" } }).sobreAcento).toBe(
      "#141414",
    );
    expect(paletaTv({ tema: "crema", colores: { fondo: "#000000", acento: "#000000", texto: "#000000" } }).sobreAcento).toBe(
      "#FFFFFF",
    );
  });

  it("el tema personalizado usa los tres colores elegidos", () => {
    const p = paletaTv({ tema: "personalizado", colores: { fondo: "#123456", acento: "#FF8800", texto: "#EEEEEE" } });
    expect(p.fondo).toBe("#123456");
    expect(p.acento).toBe("#FF8800");
    expect(p.texto).toBe("#EEEEEE");
  });

  it("reconoce un fondo claro", () => {
    expect(esClaro("#FFF4E0")).toBe(true);
    expect(esClaro("#A30000")).toBe(false);
    expect(esClaro("cualquiera")).toBe(false);
  });

  it("los minutos de espera no salen negativos con el reloj corrido", () => {
    expect(minutosDesde(1_000_000, 1_000_000 + 125_000)).toBe(2);
    expect(minutosDesde(2_000_000, 1_000_000)).toBe(0);
  });
});

describe("qué llamados suenan en la TV", () => {
  const ahora = 10_000_000;

  it("lo que ya estaba llamado al prender la TV no suena", () => {
    // Prenderla a media tarde no puede cantar diez números viejos seguidos.
    const vistos = new Map<number, number>();
    expect(llamadosNuevos([{ numero: 3, llamadoEn: ahora - 1000 }], vistos, ahora, true)).toEqual([]);
    expect(vistos.get(3)).toBe(ahora - 1000);
  });

  it("un llamado nuevo suena una vez, y otra vez si se lo vuelve a llamar", () => {
    const vistos = new Map<number, number>([[3, ahora - 5000]]);
    expect(llamadosNuevos([{ numero: 3, llamadoEn: ahora - 1000 }], vistos, ahora, false)).toEqual([3]);
    expect(llamadosNuevos([{ numero: 3, llamadoEn: ahora - 1000 }], vistos, ahora, false)).toEqual([]);
    expect(llamadosNuevos([{ numero: 3, llamadoEn: ahora }], vistos, ahora, false)).toEqual([3]);
  });

  it("dos llamados en la misma vuelta suenan en el orden en que se hicieron", () => {
    const vistos = new Map<number, number>();
    const r = llamadosNuevos(
      [
        { numero: 9, llamadoEn: ahora - 1000 },
        { numero: 8, llamadoEn: ahora - 3000 },
      ],
      vistos,
      ahora,
      false,
    );
    expect(r).toEqual([8, 9]);
  });

  it("un llamado de hace rato que llega tarde (la TV sin conexión) no suena", () => {
    const vistos = new Map<number, number>();
    expect(llamadosNuevos([{ numero: 4, llamadoEn: ahora - VIGENCIA_MS - 1 }], vistos, ahora, false)).toEqual([]);
  });
});

describe("el tablero de despacho", () => {
  const t = (p: Partial<TicketPedido>): TicketPedido => ({
    id: 1,
    numero: 1,
    estado: "PREPARANDO",
    creadoEn: "2026-10-29T18:00:00Z",
    listoEn: null,
    llamadoEn: null,
    llamados: 0,
    entregadoEn: null,
    comprobante: null,
    items: [],
    ...p,
  });

  it("el que más espera va primero; el último llamado, arriba de los listos", () => {
    const lista = [
      t({ id: 1, numero: 5, creadoEn: "2026-10-29T18:10:00Z" }),
      t({ id: 2, numero: 4, creadoEn: "2026-10-29T18:05:00Z" }),
      t({ id: 3, numero: 2, estado: "LISTO", llamadoEn: "2026-10-29T18:01:00Z" }),
      t({ id: 4, numero: 3, estado: "LISTO", llamadoEn: "2026-10-29T18:09:00Z" }),
    ];
    expect(preparando(lista).map((x) => x.numero)).toEqual([4, 5]);
    expect(listos(lista).map((x) => x.numero)).toEqual([3, 2]);
  });

  it("ámbar a los 8 minutos y rojo a los 15", () => {
    expect(demora(7)).toBe("normal");
    expect(demora(8)).toBe("tarde");
    expect(demora(15)).toBe("muy_tarde");
  });

  it("el cronómetro cuenta minutos y segundos, también pasada la hora", () => {
    const desde = "2026-10-29T18:00:00Z";
    expect(cronometro(desde, Date.parse(desde) + 187_000)).toBe("03:07");
    expect(cronometro(desde, Date.parse(desde) + 62 * 60_000 + 10_000)).toBe("62:10");
  });
});
