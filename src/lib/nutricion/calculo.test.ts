import { describe, expect, it } from "vitest";
import { CATALOGO, control } from "../../test/nutricionFixtures";
import {
  MENOS,
  calcularImc,
  cambio,
  conUnidad,
  edadEn,
  edadEnFecha,
  errorDeTope,
  esSoloDigitos,
  fmtCambio,
  fmtNumero,
  grado,
  gradoDeTabla,
  leerNumero,
  posicionEnMedidor,
  rangoDe,
  redondear,
  resumenDe,
  tablaQueToca,
  textoEdadCorporal,
  textoFaltaTabla,
  ultimoValor,
  valorDe,
} from "./calculo";

/**
 * Las cuentas de la evaluación (CONTRATO-nutricion-evaluacion-22nov §3.1 y
 * §4): leer y mostrar los números, el IMC, la edad, qué tabla toca y en qué
 * grado cae cada valor, y los cambios entre controles. Las tablas son las de
 * fábrica del contrato (en la app llegan del backend).
 */

describe("los números aceptan coma o punto y se muestran con coma", () => {
  it("lee «72,5», «72.5», «72» y lo que se está escribiendo («72,», «,5»)", () => {
    expect(leerNumero("72,5")).toBe(72.5);
    expect(leerNumero("72.5")).toBe(72.5);
    expect(leerNumero(" 72 ")).toBe(72);
    expect(leerNumero("72,")).toBe(72);
    expect(leerNumero(",5")).toBe(0.5);
  });

  it("lo que no es un número es null, no cero", () => {
    for (const t of ["", "   ", "abc", "7a", "1.234,5", "-3", "72,5,1"]) expect(leerNumero(t), t).toBeNull();
    expect(leerNumero(null)).toBeNull();
  });

  it("sin ceros de más: «158 cm», no «158,0»", () => {
    expect(fmtNumero(158)).toBe("158");
    expect(fmtNumero(100, 0)).toBe("100");
    expect(fmtNumero(120)).toBe("120");
    expect(fmtNumero(82.4)).toBe("82,4");
    expect(fmtNumero(82.45, 2)).toBe("82,45");
    expect(fmtNumero(82.4, 2)).toBe("82,4");
    // El resto de una cuenta no se ve.
    expect(fmtNumero(33.0000001)).toBe("33");
    expect(fmtNumero(null)).toBe("");
    expect(conUnidad(82.4, "kg")).toBe("82,4 kg");
    expect(conUnidad(null, "kg")).toBe("—");
  });

  it("los negativos con el signo menos de verdad", () => {
    expect(fmtNumero(-3.7)).toBe(`${MENOS}3,7`);
    expect(fmtNumero(-0.01)).toBe("0");
  });

  it("valorDe redondea a lo que se guarda: el peso a 2 decimales, el resto a 1", () => {
    expect(valorDe("pesoKg", "82,456")).toBe(82.46);
    expect(valorDe("tallaCm", "158,04")).toBe(158);
    expect(valorDe("cinturaCm", "98,75")).toBe(98.8);
    expect(valorDe("pesoKg", "")).toBeNull();
  });

  it("el medio sube, como en el servidor (18,45 → 18,5), aunque en binario no sea exacto", () => {
    expect(redondear(18.45, 1)).toBe(18.5);
    expect(redondear(1.005, 2)).toBe(1.01);
    expect(redondear(82.445, 2)).toBe(82.45);
    expect(redondear(-3.65, 1)).toBe(-3.7);
    expect(redondear(2.220446049250313e-16, 2)).toBe(0);
    expect(fmtNumero(18.45)).toBe("18,5");
    expect(valorDe("grasaPct", "32,65")).toBe(32.7);
  });

  it("el buscador distingue un carnet de un nombre", () => {
    expect(esSoloDigitos("1234567")).toBe(true);
    expect(esSoloDigitos(" 1234567 ")).toBe(true);
    expect(esSoloDigitos("Lucía")).toBe(false);
    expect(esSoloDigitos("1234567 SC")).toBe(false);
  });
});

describe("cambios entre controles", () => {
  it("restan sin el ruido de la coma flotante", () => {
    expect(cambio(82.4, 86.1)).toBe(-3.7);
    expect(cambio(79.8, 82.4)).toBe(-2.6);
    expect(cambio(null, 80)).toBeNull();
  });

  it("se muestran con su signo: «−3,7», «+1,2», «0»", () => {
    expect(fmtCambio(-3.7)).toBe(`${MENOS}3,7`);
    expect(fmtCambio(1.2)).toBe("+1,2");
    expect(fmtCambio(0)).toBe("0");
    expect(fmtCambio(0.001)).toBe("0");
    expect(fmtCambio(null)).toBe("");
  });

  it("el resumen de una medida: el último valor, desde el inicio y desde el anterior", () => {
    const controles = [
      control({ id: 1, fecha: "2026-09-22", inicial: true, pesoKg: 86.1 }),
      control({ id: 2, fecha: "2026-10-22", cinturaCm: 98 }),
      control({ id: 3, fecha: "2026-11-01", pesoKg: 83.6 }),
      control({ id: 4, fecha: "2026-11-22", pesoKg: 82.4 }),
    ];
    expect(resumenDe(controles, "pesoKg")).toEqual({ actual: 82.4, fecha: "2026-11-22", desdeInicio: -3.7, desdeAnterior: -1.2 });
    // Un solo valor: no hay contra qué comparar.
    expect(resumenDe(controles, "cinturaCm")).toEqual({ actual: 98, fecha: "2026-10-22", desdeInicio: null, desdeAnterior: null });
    expect(resumenDe(controles, "grasaPct")).toBeNull();
    // «anterior: …» salta los controles que no tienen esa medida.
    expect(ultimoValor(controles, "pesoKg", 3)).toEqual({ valor: 83.6, fecha: "2026-11-01" });
    expect(ultimoValor(controles, "pesoKg", 2)).toEqual({ valor: 86.1, fecha: "2026-09-22" });
    expect(ultimoValor(controles, "pesoKg", 0)).toBeNull();
    expect(ultimoValor(controles, "pesoKg")).toEqual({ valor: 82.4, fecha: "2026-11-22" });
  });
});

describe("IMC", () => {
  it("peso / talla², con un decimal", () => {
    expect(calcularImc(82.4, 158)).toBe(33);
    expect(calcularImc(70, 175)).toBe(22.9);
    expect(calcularImc(79.8, 158)).toBe(32);
  });

  it("sin peso o sin talla no hay IMC", () => {
    expect(calcularImc(null, 158)).toBeNull();
    expect(calcularImc(82.4, null)).toBeNull();
    expect(calcularImc(0, 158)).toBeNull();
  });
});

describe("edad", () => {
  it("los años cumplidos a la fecha", () => {
    expect(edadEn("1990-05-14", "2026-11-22")).toBe(36);
    expect(edadEn("1990-05-14", "2026-05-13")).toBe(35);
    expect(edadEn("1990-05-14", "2026-05-14")).toBe(36);
    expect(edadEn("2000-02-29", "2026-02-28")).toBe(25);
  });

  it("una fecha futura, mal escrita o vacía no da edad", () => {
    expect(edadEn("2030-01-01", "2026-11-22")).toBeNull();
    expect(edadEn("14/05/1990", "2026-11-22")).toBeNull();
    expect(edadEn("", "2026-11-22")).toBeNull();
    expect(edadEn(null, "2026-11-22")).toBeNull();
  });

  it("la edad el día de un control (la que elige la tabla, §3.4), no la de hoy", () => {
    // Con fecha de nacimiento: la cuenta exacta a la fecha del control.
    expect(edadEnFecha({ fechaNacimiento: "1986-12-10", edad: 39 }, "2026-11-22", "2026-12-15")).toBe(39);
    expect(edadEnFecha({ fechaNacimiento: "1986-12-10", edad: 40 }, "2026-12-12", "2026-12-15")).toBe(40);
    // Con la edad anotada (la de hoy): menos los años que pasaron desde el control.
    expect(edadEnFecha({ fechaNacimiento: null, edad: 41 }, "2025-06-01", "2026-11-22")).toBe(40);
    expect(edadEnFecha({ fechaNacimiento: null, edad: 41 }, "2026-11-22", "2026-11-22")).toBe(41);
    expect(edadEnFecha({ fechaNacimiento: null, edad: null }, "2026-11-22", "2026-11-22")).toBeNull();
  });

  it("la edad corporal se compara con la de verdad", () => {
    expect(textoEdadCorporal(52, 36)).toEqual({ texto: "16 años más que su edad", tono: "alerta" });
    expect(textoEdadCorporal(35, 36)).toEqual({ texto: "1 año menos que su edad", tono: "bien" });
    expect(textoEdadCorporal(36, 36)).toEqual({ texto: "Igual a su edad", tono: "bien" });
    expect(textoEdadCorporal(50, null)).toBeNull();
  });
});

describe("qué tabla de grados toca", () => {
  const { tablas } = CATALOGO;

  it("el IMC y la grasa visceral no piden sexo ni edad", () => {
    expect(tablaQueToca(tablas.imc, null, null)).toEqual({ tabla: tablas.imc[0], faltaSexo: false, faltaEdad: false });
    expect(tablaQueToca(tablas.visceral, null, null).tabla).toBe(tablas.visceral[0]);
  });

  it("la grasa y el músculo, por sexo y franja de edad (las edades, inclusive)", () => {
    const franja = (sexo: "F" | "M", edad: number) => {
      const t = tablaQueToca(tablas.grasa, sexo, edad).tabla;
      return t && [t.sexo, t.edadDesde, t.edadHasta];
    };
    expect(franja("F", 18)).toEqual(["F", null, 20]);
    expect(franja("F", 20)).toEqual(["F", null, 20]);
    expect(franja("F", 21)).toEqual(["F", 21, 25]);
    expect(franja("F", 30)).toEqual(["F", 26, 30]);
    expect(franja("F", 36)).toEqual(["F", 36, 40]);
    expect(franja("M", 55)).toEqual(["M", 51, 55]);
    expect(franja("M", 56)).toEqual(["M", 56, null]);
    expect(franja("F", 88)).toEqual(["F", 56, null]);
    const musculo = tablaQueToca(tablas.musculo, "M", 72).tabla;
    expect([musculo?.sexo, musculo?.edadDesde, musculo?.edadHasta]).toEqual(["M", 60, null]);
    // La tabla manda la cantidad de grados: la de grasa tiene 4 zonas.
    expect(tablaQueToca(tablas.grasa, "F", 36).tabla?.rangos.map((r) => r.grado)).toEqual(["DELGADO", "IDEAL", "PROMEDIO", "SOBRE_PROMEDIO"]);
  });

  it("sin sexo o sin edad dice qué falta, en vez de adivinar", () => {
    expect(tablaQueToca(tablas.grasa, null, 30)).toEqual({ tabla: null, faltaSexo: true, faltaEdad: false });
    expect(tablaQueToca(tablas.grasa, "F", null)).toEqual({ tabla: null, faltaSexo: false, faltaEdad: true });
    expect(tablaQueToca(tablas.musculo, null, null)).toEqual({ tabla: null, faltaSexo: true, faltaEdad: true });
    expect(textoFaltaTabla(true, false)).toBe("Falta el sexo para ver la tabla");
    expect(textoFaltaTabla(false, true)).toBe("Falta la edad para ver la tabla");
    expect(textoFaltaTabla(true, true)).toBe("Falta el sexo y la edad para ver la tabla");
  });
});

describe("en qué grado cae un valor (desde <= valor < hasta)", () => {
  const imc = CATALOGO.tablas.imc[0];

  it("IMC: los bordes caen en el grado de arriba", () => {
    expect(rangoDe(imc, 18.4)?.grado).toBe("BAJO_PESO");
    expect(rangoDe(imc, 18.5)?.grado).toBe("NORMAL");
    expect(rangoDe(imc, 24.9)?.grado).toBe("NORMAL");
    expect(rangoDe(imc, 25)?.grado).toBe("SOBREPESO");
    expect(rangoDe(imc, 33)?.grado).toBe("OBESIDAD_1");
    expect(rangoDe(imc, 40)?.grado).toBe("OBESIDAD_3");
    expect(rangoDe(imc, 62)?.grado).toBe("OBESIDAD_3");
  });

  it("sin valor no hay grado", () => {
    expect(rangoDe(imc, null)).toBeNull();
    expect(rangoDe(null, 22)).toBeNull();
  });

  it("% grasa: cada número es el primero de su zona, y el mismo valor es otro grado según el sexo y la edad", () => {
    const g = (sexo: "F" | "M" | null, edad: number, valor: number) => gradoDeTabla(CATALOGO.tablas.grasa, sexo, edad, valor);
    // Mujer de 36 a 40: Ideal desde 22,2 · Promedio desde 27,3 · Sobre desde 32,7.
    expect(g("F", 36, 22.1)).toBe("DELGADO");
    expect(g("F", 36, 22.2)).toBe("IDEAL");
    expect(g("F", 36, 27.2)).toBe("IDEAL");
    expect(g("F", 36, 27.3)).toBe("PROMEDIO");
    expect(g("F", 36, 32.7)).toBe("SOBRE_PROMEDIO");
    expect(g("F", 36, 41.2)).toBe("SOBRE_PROMEDIO");
    // El mismo 33 %: promedio para una mujer de 45, sobre el promedio para un hombre de 36.
    expect(g("F", 45, 33)).toBe("PROMEDIO");
    expect(g("M", 36, 33)).toBe("SOBRE_PROMEDIO");
    expect(g("M", 19, 6.2)).toBe("IDEAL");
    // Sin el sexo, la tabla no se sabe: no hay grado automático.
    expect(g(null, 36, 33)).toBeNull();
  });

  it("% músculo y grasa visceral", () => {
    expect(gradoDeTabla(CATALOGO.tablas.musculo, "F", 36, 24)).toBe("BAJO");
    expect(gradoDeTabla(CATALOGO.tablas.musculo, "F", 36, 30.3)).toBe("NORMAL");
    expect(gradoDeTabla(CATALOGO.tablas.musculo, "F", 36, 30.4)).toBe("ALTO");
    expect(gradoDeTabla(CATALOGO.tablas.visceral, null, null, 9)).toBe("NORMAL");
    expect(gradoDeTabla(CATALOGO.tablas.visceral, null, null, 9.5)).toBe("NORMAL");
    expect(gradoDeTabla(CATALOGO.tablas.visceral, null, null, 10)).toBe("ALTO");
    expect(gradoDeTabla(CATALOGO.tablas.visceral, null, null, 15)).toBe("MUY_ALTO");
  });

  it("el nombre y el color de un grado guardado", () => {
    expect(grado(CATALOGO, "imc", "OBESIDAD_1")).toMatchObject({ nombre: "Obesidad grado 1", tono: "alto" });
    expect(grado(CATALOGO, "grasa", "SOBRE_PROMEDIO")).toMatchObject({ nombre: "Sobre el promedio", tono: "alto" });
    expect(grado(CATALOGO, "musculo", "BAJO")).toMatchObject({ nombre: "Bajo", tono: "alerta" });
    expect(grado(CATALOGO, "imc", "NO_EXISTE")).toBeNull();
    expect(grado(null, "imc", "NORMAL")).toBeNull();
  });
});

describe("la aguja del medidor del IMC", () => {
  const rangos = CATALOGO.tablas.imc[0].rangos;

  it("seis sectores iguales; adentro de cada uno la aguja avanza en proporción", () => {
    expect(posicionEnMedidor(18.5, rangos)).toBeCloseTo(1 / 6);
    expect(posicionEnMedidor(25, rangos)).toBeCloseTo(2 / 6);
    expect(posicionEnMedidor(33, rangos)).toBeCloseTo(3.6 / 6);
    expect(posicionEnMedidor(21.75, rangos)).toBeCloseTo(1.5 / 6);
  });

  it("fuera de la escala queda en la punta, y sin IMC no hay aguja", () => {
    expect(posicionEnMedidor(9, rangos)).toBe(0);
    expect(posicionEnMedidor(62, rangos)).toBe(1);
    expect(posicionEnMedidor(null, rangos)).toBeNull();
    expect(posicionEnMedidor(25, [])).toBeNull();
  });
});

describe("topes de validación (para frenar un dedazo)", () => {
  it("fuera de rango dice entre cuánto y cuánto", () => {
    expect(errorDeTope("pesoKg", "8,2")).toBe("Entre 20 y 400 kg");
    expect(errorDeTope("tallaCm", "1,58")).toBe("Entre 80 y 250 cm");
    expect(errorDeTope("grasaPct", "41,2")).toBeNull();
  });

  it("los enteros no aceptan decimales y la grasa visceral va de 0,5 en 0,5", () => {
    expect(errorDeTope("edadCorporal", "50,5")).toBe("Sin decimales");
    expect(errorDeTope("grasaVisceral", "9,3")).toBe("Va de 0,5 en 0,5");
    expect(errorDeTope("grasaVisceral", "9,5")).toBeNull();
  });

  it("vacío está bien; letras, no", () => {
    expect(errorDeTope("pesoKg", "")).toBeNull();
    expect(errorDeTope("pesoKg", "ochenta")).toBe("Escribí sólo el número");
  });
});
