import { afterEach, describe, expect, it, vi } from "vitest";
import { cronometro, demora, listos, preparando } from "../../pages/tickets/useTableroTickets";
import type { TicketPedido } from "../../types/tickets";
import { elegirVoz, esClaro, minutosDesde, numeroTicket, paletaTv, textoVoz, tipoDeVoz } from "./llamado";
import { llamadosNuevos, VIGENCIA_MS } from "./llamadosNuevos";

describe("cómo se canta el número", () => {
  it("con tres cifras, y pasado 999 sigue creciendo", () => {
    expect(numeroTicket(1)).toBe("001");
    expect(numeroTicket(72)).toBe("072");
    expect(numeroTicket(1234)).toBe("1234");
  });

  it("la voz dice el número entero, sin los ceros de adelante", () => {
    // Kevin, 1-nov: "cero, cero, siete, dos" sonaba robótico. La voz lee
    // "72" como "setenta y dos" y el "50" como "cincuenta".
    expect(textoVoz(72, "TICKET", "Su pedido está listo")).toBe("Ticket 72. Su pedido está listo.");
    expect(textoVoz(50, "TICKET", "")).toBe("Ticket 50.");
  });

  it("sin etiqueta ni frase dice sólo el número", () => {
    expect(textoVoz(5, "  ", "")).toBe("5.");
  });

  it("no duplica el punto ni los signos de la frase", () => {
    expect(textoVoz(1, "Pedido", "¡Ya está listo!")).toBe("Pedido 1. ¡Ya está listo.");
  });
});

describe("qué voz dice el número", () => {
  const voces = [
    { name: "Microsoft Raul - Spanish (Mexico)", lang: "es-MX", localService: true },
    { name: "Microsoft Sabina - Spanish (Mexico)", lang: "es-MX", localService: true },
    { name: "Microsoft Sofia Online (Natural) - Spanish (Bolivia)", lang: "es-BO", localService: false },
    { name: "Microsoft Marcelo Online (Natural) - Spanish (Bolivia)", lang: "es-BO", localService: false },
    { name: "Google US English", lang: "en-US", localService: false },
  ];

  it("de mujer o de hombre según lo que eligió el dueño, y la más natural", () => {
    expect(elegirVoz(voces, "mujer")).toEqual({ voz: voces[2], tono: 1 });
    expect(elegirVoz(voces, "hombre")).toEqual({ voz: voces[3], tono: 1 });
  });

  it("sin voz de hombre, usa la que hay y le baja el tono", () => {
    // Un televisor suele traer una sola voz, de mujer: el dueño que eligió
    // hombre igual tiene que notar la diferencia.
    const r = elegirVoz([voces[1]], "hombre");
    expect(r.voz).toBe(voces[1]);
    expect(r.tono).toBeLessThan(1);
  });

  it("una voz que no dice de quién es se toma sin correrla para una mujer", () => {
    const sinNombre = [{ name: "es-BO-language", lang: "es-BO" }];
    expect(elegirVoz(sinNombre, "mujer").tono).toBe(1);
    expect(elegirVoz(sinNombre, "hombre").tono).toBeLessThan(1);
  });

  it("sin ninguna voz en español no elige ninguna", () => {
    expect(elegirVoz([voces[4]], "mujer").voz).toBeNull();
  });

  it("reconoce de quién es por el nombre, también los códigos de Google", () => {
    expect(tipoDeVoz("Google español")).toBe("mujer");
    expect(tipoDeVoz("es-us-x-esd-local")).toBe("hombre");
    expect(tipoDeVoz("Female Spanish")).toBe("mujer");
    expect(tipoDeVoz("es-MX-language")).toBeNull();
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

describe("el sonido de la TV", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("si el navegador ya deja sonar, no pide el toque", async () => {
    // La app instalada o Chrome con el permiso: el cartel de "tocá la
    // pantalla" salía igual y el primer llamado no sonaba (QA 29-oct).
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        resume() {
          return Promise.resolve();
        }
      },
    );
    const { audioYaPermitido } = await import("./llamado");
    expect(await audioYaPermitido()).toBe(true);
  });

  it("sin permiso lo sigue pidiendo, aunque resume() quede esperando el gesto", async () => {
    // Sin un toque, Chrome deja la promesa de resume() colgada para siempre:
    // si se la esperara, la TV no terminaría nunca de arrancar.
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "suspended";
        resume() {
          return new Promise(() => {});
        }
      },
    );
    const { audioYaPermitido } = await import("./llamado");
    expect(await audioYaPermitido()).toBe(false);
  });
});
