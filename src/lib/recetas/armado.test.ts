import { describe, expect, it } from "vitest";
import type { Producto, RecetaPlatoPos } from "../../types";
import {
  alternarGuarnicion,
  armadoDeMarcas,
  disponiblesDelPlato,
  elegirPuro,
  firmaDeArmado,
  marcasDelArmado,
  nombrePuro,
  normalizarArmado,
  opcionesDePresa,
  pideLaPresa,
  recetaDelPlato,
  textoDeGuarnicion,
  textoDelArmado,
  textoDePiezas,
  textoVaCompleta,
  tieneQueElegir,
} from "./armado";

/**
 * El armado del plato con receta (CONTRATO-recetas-plato §4.1 y §4.2). Los
 * textos son los del contrato, letra por letra: el backend arma el mismo
 * `armadoTexto` y el recibo de la venta ya subida tiene que decir lo mismo que
 * el carrito y que el ticket de la cola sin señal.
 */

/** El cuarto de pollo: 2 presas del pollo en 8 y tres guarniciones que pueden ir «puro», más una que no. */
const cuarto: RecetaPlatoPos = {
  presas: 2,
  partes: "POLLO_8",
  guarnicion: [
    { insumoId: 7, nombre: "Arroz", puro: true },
    { insumoId: 8, nombre: "Papa", puro: true },
    { insumoId: 9, nombre: "Fideo", puro: true },
    { insumoId: 10, nombre: "Plátano", puro: false },
  ],
  alcanza: 120,
};
const economico: RecetaPlatoPos = { ...cuarto, presas: 1 };
const medio: RecetaPlatoPos = { ...cuarto, presas: 4 };
const entero: RecetaPlatoPos = { ...cuarto, presas: 8 };

describe("textoDePiezas · las presas, en el orden pecho, ala, pierna, contra", () => {
  it("las del cuarto: «Pecho y ala», «Pierna y contra», «Ala y contra», «2 piernas»", () => {
    expect(textoDePiezas({ piezas: { ala: 1, pecho: 1 } }, cuarto)).toBe("Pecho y ala");
    expect(textoDePiezas({ piezas: { pierna: 1, contra: 1 } }, cuarto)).toBe("Pierna y contra");
    expect(textoDePiezas({ piezas: { contra: 1, ala: 1 } }, cuarto)).toBe("Ala y contra");
    expect(textoDePiezas({ piezas: { pierna: 2 } }, cuarto)).toBe("2 piernas");
  });

  it("una sola presa: su nombre con mayúscula", () => {
    expect(textoDePiezas({ piezas: { pecho: 1 } }, economico)).toBe("Pecho");
    expect(textoDePiezas({ piezas: { contra: 1 } }, economico)).toBe("Contra");
  });

  it("tres o más: con comas y la última con «y»", () => {
    expect(textoDePiezas({ piezas: { ala: 2, pierna: 1, contra: 1 } }, medio)).toBe("2 alas, pierna y contra");
  });

  it("las de siempre repartidas parejo (medio, entero) no dicen nada", () => {
    expect(textoDePiezas({ piezas: { ala: 1, pecho: 1, pierna: 1, contra: 1 } }, medio)).toBeNull();
    expect(textoDePiezas({ piezas: { ala: 2, pecho: 2, pierna: 2, contra: 2 } }, entero)).toBeNull();
  });

  it("si no calzan con el plato (otra cantidad, no es el pollo en 8) no dicen nada: el backend las ignora", () => {
    expect(textoDePiezas({ piezas: { ala: 1, pecho: 1, pierna: 1 } }, cuarto)).toBeNull();
    expect(textoDePiezas({ piezas: { ala: 1, pecho: 1 } }, { ...cuarto, partes: null })).toBeNull();
    expect(textoDePiezas({ piezas: { ala: 1, pecho: 1 } }, null)).toBeNull();
    expect(textoDePiezas(undefined, cuarto)).toBeNull();
  });
});

describe("textoDeGuarnicion · lo que se quitó y el «puro»", () => {
  it("sólo lo quitado: «Sin fideo», «Sin arroz ni fideo», «Sin arroz, papa ni fideo»", () => {
    expect(textoDeGuarnicion({ sin: [9] }, cuarto)).toBe("Sin fideo");
    expect(textoDeGuarnicion({ sin: [9, 7] }, cuarto)).toBe("Sin arroz ni fideo");
    expect(textoDeGuarnicion({ sin: [7, 8, 9] }, cuarto)).toBe("Sin arroz, papa ni fideo");
  });

  it("«Pura» si el nombre termina en «a», «Puro» si no", () => {
    expect(textoDeGuarnicion({ puro: 8 }, cuarto)).toBe("Pura papa");
    expect(textoDeGuarnicion({ puro: 7 }, cuarto)).toBe("Puro arroz");
    expect(textoDeGuarnicion({ puro: 9 }, cuarto)).toBe("Puro fideo");
    expect(nombrePuro("Yuca")).toBe("Pura yuca");
  });

  it("con «puro» y además sin una que no puede ir puro: «Pura papa, sin plátano»", () => {
    expect(textoDeGuarnicion({ puro: 8, sin: [10] }, cuarto)).toBe("Pura papa, sin plátano");
    // Las otras que pueden ir puro ya salen por el «puro»: no se repiten.
    expect(textoDeGuarnicion({ puro: 8, sin: [7, 9, 10] }, cuarto)).toBe("Pura papa, sin plátano");
    expect(textoDeGuarnicion({ puro: 8, sin: [7, 9] }, cuarto)).toBe("Pura papa");
  });

  it("un «puro» que no se puede pedir así se ignora", () => {
    expect(textoDeGuarnicion({ puro: 10 }, cuarto)).toBeNull();
    expect(textoDeGuarnicion({ puro: 99 }, cuarto)).toBeNull();
    expect(textoDeGuarnicion({ sin: [99] }, cuarto)).toBeNull();
  });

  it("completa, nada; y la franja verde de la hoja la nombra entera", () => {
    expect(textoDeGuarnicion(undefined, cuarto)).toBeNull();
    expect(textoVaCompleta(cuarto)).toBe("Va completa: arroz, papa, fideo y plátano.");
    expect(textoVaCompleta({ ...cuarto, guarnicion: cuarto.guarnicion.slice(0, 1) })).toBe("Va completa: arroz.");
  });
});

describe("textoDelArmado · el `armadoTexto` de la línea", () => {
  it("las dos partes con « · »", () => {
    expect(textoDelArmado({ piezas: { pierna: 1, contra: 1 }, sin: [9] }, cuarto)).toBe("Pierna y contra · Sin fideo");
    expect(textoDelArmado({ piezas: { ala: 1, pecho: 1 }, puro: 8, sin: [10] }, cuarto)).toBe(
      "Pecho y ala · Pura papa, sin plátano",
    );
  });

  it("una sola, o ninguna (null)", () => {
    expect(textoDelArmado({ piezas: { pecho: 1, ala: 1 } }, cuarto)).toBe("Pecho y ala");
    expect(textoDelArmado({ sin: [9] }, cuarto)).toBe("Sin fideo");
    expect(textoDelArmado({}, cuarto)).toBeNull();
    expect(textoDelArmado(undefined, cuarto)).toBeNull();
  });
});

describe("normalizarArmado y firmaDeArmado", () => {
  it("vacío o con basura es el plato de siempre", () => {
    expect(normalizarArmado(undefined)).toBeUndefined();
    expect(normalizarArmado({})).toBeUndefined();
    expect(normalizarArmado({ piezas: { ala: 0 }, sin: [] })).toBeUndefined();
    expect(normalizarArmado("hola")).toBeUndefined();
    expect(normalizarArmado({ piezas: { ala: 1.5, cogote: 1, pecho: 9 }, sin: ["7", -1], puro: 0 })).toBeUndefined();
  });

  it("las presas en orden fijo, lo quitado sin repetir y ordenado, y el «puro» fuera de lo quitado", () => {
    expect(normalizarArmado({ piezas: { contra: 1, ala: 1, pecho: 0 }, sin: [9, 7, 9, 8], puro: 8 })).toEqual({
      piezas: { ala: 1, contra: 1 },
      sin: [7, 9],
      puro: 8,
    });
    expect(Object.keys(normalizarArmado({ piezas: { contra: 1, ala: 1 } })!.piezas!)).toEqual(["ala", "contra"]);
  });

  it("la firma no depende del orden en que se marcó", () => {
    const a = firmaDeArmado({ piezas: { pecho: 1, ala: 1 }, sin: [9, 7] });
    const b = firmaDeArmado({ piezas: { ala: 1, pecho: 1 }, sin: [7, 9] });
    expect(a).toBe(b);
    expect(a).not.toBe("");
    expect(firmaDeArmado({ piezas: { pierna: 1, contra: 1 } })).not.toBe(a);
    expect(firmaDeArmado(undefined)).toBe("");
    expect(firmaDeArmado({})).toBe("");
  });
});

describe("recetaDelPlato, la presa y «N disp.»", () => {
  const plato = (over: Partial<Producto>) => ({ conReceta: true, receta: cuarto, ...over }) as Producto;

  it("sólo el plato con receta que trae su receta", () => {
    expect(recetaDelPlato(plato({}))).toEqual(cuarto);
    expect(recetaDelPlato(plato({ conReceta: false }))).toBeNull();
    expect(recetaDelPlato(plato({ conReceta: undefined }))).toBeNull();
    expect(recetaDelPlato(plato({ receta: undefined }))).toBeNull();
    expect(recetaDelPlato(null)).toBeNull();
  });

  it("se queda con lo que sirve: números que llegan como texto, partes desconocidas, guarniciones rotas", () => {
    const cruda = {
      presas: "2.000",
      partes: "OTRA",
      guarnicion: [{ insumoId: 7, nombre: " Arroz " }, { insumoId: "8", nombre: "Papa" }, null],
      alcanza: "15",
    } as unknown as RecetaPlatoPos;
    expect(recetaDelPlato(plato({ receta: cruda }))).toEqual({
      presas: 2,
      partes: null,
      guarnicion: [{ insumoId: 7, nombre: "Arroz", puro: false }],
      alcanza: 15,
    });
  });

  it("pregunta la presa sólo en el pollo en 8 de 1 o 2 presas y con el ajuste prendido", () => {
    const si = { elegirPresa: true };
    expect(pideLaPresa(cuarto, si)).toBe(true);
    expect(pideLaPresa(economico, si)).toBe(true);
    expect(pideLaPresa(medio, si)).toBe(false);
    expect(pideLaPresa({ ...cuarto, partes: null }, si)).toBe(false);
    expect(pideLaPresa(cuarto, { elegirPresa: false })).toBe(false);
    expect(pideLaPresa(cuarto, null)).toBe(false);
    expect(pideLaPresa(null, si)).toBe(false);
  });

  it("hay algo para cambiar con guarnición, o con la presa para elegir", () => {
    expect(tieneQueElegir(medio, { elegirPresa: false })).toBe(true);
    expect(tieneQueElegir({ ...cuarto, guarnicion: [] }, { elegirPresa: true })).toBe(true);
    expect(tieneQueElegir({ ...cuarto, guarnicion: [] }, { elegirPresa: false })).toBe(false);
    expect(tieneQueElegir(null, { elegirPresa: true })).toBe(false);
  });

  it("«N disp.» sólo con 20 o menos, y nunca por debajo de 0", () => {
    expect(disponiblesDelPlato(cuarto)).toBeNull();
    expect(disponiblesDelPlato({ ...cuarto, alcanza: 21 })).toBeNull();
    expect(disponiblesDelPlato({ ...cuarto, alcanza: 20 })).toBe(20);
    expect(disponiblesDelPlato({ ...cuarto, alcanza: 0 })).toBe(0);
    expect(disponiblesDelPlato({ ...cuarto, alcanza: -3 })).toBe(0);
    expect(disponiblesDelPlato({ ...cuarto, alcanza: null })).toBeNull();
  });

  it("las presas de la hoja: cuatro con una, «Ala» y «Pierna» con dos, ninguna con más", () => {
    expect(opcionesDePresa(1).map((o) => o.nombre)).toEqual(["Ala", "Pecho", "Pierna", "Contra"]);
    expect(opcionesDePresa(2)).toEqual([
      { nombre: "Ala", detalle: "pecho y ala", piezas: { ala: 1, pecho: 1 } },
      { nombre: "Pierna", detalle: "pierna y contra", piezas: { pierna: 1, contra: 1 } },
    ]);
    expect(opcionesDePresa(4)).toEqual([]);
  });
});

describe("lo marcado en la hoja", () => {
  const vacia = marcasDelArmado(undefined, cuarto);
  const [arroz, papa, fideo, platano] = cuarto.guarnicion;

  it("arranca completa y sin presa", () => {
    expect(vacia).toEqual({ fuera: [], puro: null, piezas: null });
    expect(armadoDeMarcas(vacia, cuarto)).toBeUndefined();
  });

  it("quitar y volver a poner", () => {
    const sinFideo = alternarGuarnicion(vacia, fideo);
    expect(armadoDeMarcas(sinFideo, cuarto)).toEqual({ sin: [9] });
    expect(armadoDeMarcas(alternarGuarnicion(sinFideo, fideo), cuarto)).toBeUndefined();
  });

  it("«Pura papa» saca las otras que pueden ir puro; tocarla otra vez vuelve a completa", () => {
    const pura = elegirPuro(vacia, papa, cuarto);
    expect(pura.fuera.sort()).toEqual([7, 9]);
    // Viaja sólo el «puro»: las otras las saca el backend.
    expect(armadoDeMarcas(pura, cuarto)).toEqual({ puro: 8 });
    expect(armadoDeMarcas(alternarGuarnicion(pura, platano), cuarto)).toEqual({ sin: [10], puro: 8 });
    expect(elegirPuro(pura, papa, cuarto)).toEqual(vacia);
  });

  it("volver a poner una que podía ir puro saca el «puro»; quitar la que iba puro, también", () => {
    const pura = elegirPuro(vacia, papa, cuarto);
    expect(armadoDeMarcas(alternarGuarnicion(pura, arroz), cuarto)).toEqual({ sin: [9] });
    expect(armadoDeMarcas(alternarGuarnicion(pura, papa), cuarto)).toEqual({ sin: [7, 8, 9] });
  });

  it("la línea que se edita vuelve a la hoja como estaba", () => {
    const m = marcasDelArmado({ piezas: { pierna: 1, contra: 1 }, puro: 8, sin: [10] }, cuarto);
    expect(m.puro).toBe(8);
    expect(m.fuera.sort()).toEqual([10, 7, 9].sort());
    expect(m.piezas).toEqual({ pierna: 1, contra: 1 });
    expect(armadoDeMarcas(m, cuarto)).toEqual({ piezas: { pierna: 1, contra: 1 }, sin: [10], puro: 8 });
    // Lo que ya no está en la receta no vuelve.
    expect(marcasDelArmado({ sin: [99], puro: 98 }, cuarto)).toEqual(vacia);
  });
});
