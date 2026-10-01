import { describe, expect, it } from "vitest";
import { conUnidad } from "./medicamento";
import {
  avisoVidaUtil,
  diasHasta,
  isoAMes,
  juntarMotivo,
  mesAIso,
  partirMotivo,
  resumenArticulos,
  tecleoMes,
} from "./mercaderia";

describe("vencimiento en MM/AAAA", () => {
  it("guarda el último día del mes", () => {
    // "Vence 04/2028" quiere decir que se puede vender todo abril.
    expect(mesAIso("04/2028")).toBe("2028-04-30");
    expect(mesAIso("01/2027")).toBe("2027-01-31");
  });

  it("resuelve febrero, también el bisiesto", () => {
    expect(mesAIso("02/2027")).toBe("2027-02-28");
    expect(mesAIso("02/2028")).toBe("2028-02-29");
  });

  it("acepta cómo se escribe de verdad", () => {
    // Un mes sin cero adelante, el año en dos dígitos y el guion del teclado
    // numérico: es lo que sale cuando se carga con la caja en la mano.
    expect(mesAIso("4/2028")).toBe("2028-04-30");
    expect(mesAIso("04/28")).toBe("2028-04-30");
    expect(mesAIso("04-2028")).toBe("2028-04-30");
    expect(mesAIso(" 04 / 2028 ")).toBe("2028-04-30");
  });

  it("rechaza lo que no es un mes", () => {
    expect(mesAIso("13/2028")).toBeNull();
    expect(mesAIso("00/2028")).toBeNull();
    expect(mesAIso("2028-04-30")).toBeNull();
    expect(mesAIso("abril")).toBeNull();
    expect(mesAIso("")).toBeNull();
  });

  it("vuelve a mostrarse como se escribió", () => {
    expect(isoAMes("2028-04-30")).toBe("04/2028");
    expect(isoAMes(null)).toBe("");
    expect(isoAMes("")).toBe("");
  });
});

describe("stock con su unidad", () => {
  it("abrevia la unidad, que es la que más se repite", () => {
    expect(conUnidad(240, "Unidad")).toBe("240 u.");
    expect(conUnidad(0, "Unidad")).toBe("0 u.");
  });

  it("las demás van enteras y en plural", () => {
    // "12 u." al lado de un jarabe no dice si son doce frascos o doce
    // cucharadas, y esa duda se paga al recibir la compra.
    expect(conUnidad(12, "Frasco")).toBe("12 frascos");
    expect(conUnidad(8, "Caja")).toBe("8 cajas");
    expect(conUnidad(5, "Blister")).toBe("5 blisteres");
    expect(conUnidad(3, "Tubo")).toBe("3 tubos");
  });

  it("en singular no pluraliza", () => {
    expect(conUnidad(1, "Frasco")).toBe("1 frasco");
  });

  it("sin unidad cargada no inventa nada", () => {
    expect(conUnidad(7, null)).toBe("7 u.");
    expect(conUnidad(7, "")).toBe("7 u.");
  });
});

describe("la barra se escribe sola", () => {
  it("la pone al tercer número", () => {
    // Se teclea 0-4-2-0-2-8 de corrido, sin saltar a la barra.
    expect(tecleoMes("0")).toBe("0");
    expect(tecleoMes("04")).toBe("04");
    expect(tecleoMes("042")).toBe("04/2");
    expect(tecleoMes("042028")).toBe("04/2028");
  });

  it("respeta la barra que sí se escribió", () => {
    // "4/2028" es abril, no el mes 42: partir por la barra es lo único que
    // distingue los dos casos.
    expect(tecleoMes("4/2028")).toBe("04/2028");
    expect(tecleoMes("04/2028")).toBe("04/2028");
    expect(tecleoMes("12/28")).toBe("12/28");
  });

  it("no vuelve a ponerla mientras se borra", () => {
    // Sin esto el campo no se podría vaciar: cada borrado la reescribía.
    expect(tecleoMes("04/202")).toBe("04/202");
    expect(tecleoMes("04/")).toBe("04/");
    expect(tecleoMes("04")).toBe("04");
    expect(tecleoMes("")).toBe("");
  });

  it("no deja escribir de más ni letras", () => {
    expect(tecleoMes("04/20288")).toBe("04/2028");
    expect(tecleoMes("abr")).toBe("");
    expect(tecleoMes("04/ab28")).toBe("04/28");
  });

  it("lo que sale del tecleo es lo que entiende mesAIso", () => {
    expect(mesAIso(tecleoMes("042028"))).toBe("2028-04-30");
    expect(mesAIso(tecleoMes("4/2028"))).toBe("2028-04-30");
  });
});

describe("motivo de una salida", () => {
  it("guarda el motivo solo cuando no hay nota", () => {
    expect(juntarMotivo("Vencimiento", "")).toBe("Vencimiento");
    expect(juntarMotivo("Vencimiento", "   ")).toBe("Vencimiento");
  });

  it("le pega la nota detrás", () => {
    expect(juntarMotivo("Producto dañado", "caja mojada en depósito")).toBe(
      "Producto dañado · caja mojada en depósito",
    );
  });

  it("vuelve a separarse igual", () => {
    expect(partirMotivo("Vencimiento")).toEqual({ motivo: "Vencimiento", nota: "" });
    expect(partirMotivo("Producto dañado · caja mojada")).toEqual({
      motivo: "Producto dañado",
      nota: "caja mojada",
    });
  });

  it("un movimiento viejo cae entero en la nota", () => {
    // Los que ya están cargados —o los que llegan desde la app Android— no
    // conocen esta lista. Inventarles un motivo sería peor que dejarlos sin
    // clasificar.
    expect(partirMotivo("baja por vencimiento")).toEqual({
      motivo: "",
      nota: "baja por vencimiento",
    });
    expect(partirMotivo(null)).toEqual({ motivo: "", nota: "" });
  });

  it("no confunde un motivo con otro que empieza igual", () => {
    // Sin el separador, "Robo / pérdida de la vitrina" no es el motivo "Robo".
    expect(partirMotivo("Vencimiento de la promoción")).toEqual({
      motivo: "",
      nota: "Vencimiento de la promoción",
    });
  });
});

describe("vida útil al recibir", () => {
  /** 15 de septiembre de 2026, mediodía. */
  const hoy = new Date("2026-09-15T12:00:00").getTime();

  it("avisa cuando entra con menos de 90 días", () => {
    expect(avisoVidaUtil("2026-10-31", hoy)).toBe(
      "Ojo: entra con 46 días de vida útil (menos de 90).",
    );
  });

  it("avisa si ya venció", () => {
    expect(avisoVidaUtil("2026-08-31", hoy)).toBe("Ojo: ese lote ya está vencido.");
  });

  it("no molesta con un lote sano", () => {
    expect(avisoVidaUtil("2028-04-30", hoy)).toBeNull();
    expect(avisoVidaUtil(null, hoy)).toBeNull();
    expect(avisoVidaUtil("", hoy)).toBeNull();
  });

  it("cuenta los días que faltan", () => {
    expect(diasHasta("2026-09-15", hoy)).toBe(0);
    expect(diasHasta("2026-09-16", hoy)).toBe(1);
    expect(diasHasta("2026-09-14", hoy)).toBe(-1);
    expect(diasHasta(null, hoy)).toBeNull();
  });
});

describe("qué se movió, en la tarjeta del registro", () => {
  it("nombra el primero y cuenta el resto", () => {
    expect(resumenArticulos(["Amoxicilina 500 mg", "Paracetamol 500 mg", "Ibuprofeno 400 mg"], 3)).toBe(
      "Amoxicilina 500 mg y 2 más",
    );
    expect(resumenArticulos(["Amoxicilina 500 mg", "Paracetamol 500 mg"], 2)).toBe(
      "Amoxicilina 500 mg y 1 más",
    );
  });

  it("con uno solo, sólo el nombre", () => {
    expect(resumenArticulos(["Amoxicilina 500 mg"], 1)).toBe("Amoxicilina 500 mg");
  });

  it("el mismo artículo en dos renglones sigue siendo uno", () => {
    // El servidor ya los manda sin repetir; `items` cuenta renglones.
    expect(resumenArticulos(["Amoxicilina 500 mg"], 2)).toBe("Amoxicilina 500 mg");
  });

  it("sin nombres del servidor vuelve al conteo de siempre", () => {
    expect(resumenArticulos(undefined, 3)).toBe("3 artículos");
    expect(resumenArticulos([], 1)).toBe("1 artículo");
    expect(resumenArticulos(undefined, 0)).toBe("0 artículos");
  });
});
