import { describe, expect, it } from "vitest";
import { CATALOGO, control } from "../../test/nutricionFixtures";
import {
  MENOS,
  avisoImc,
  calcularImc,
  cambio,
  conUnidad,
  edadEn,
  edadEnFecha,
  empiezaConDigito,
  errorDeTope,
  evolucion,
  fmtCambio,
  fmtNumero,
  grado,
  gradoDeTabla,
  gradoDelResumen,
  imcDeLoEscrito,
  leerNumero,
  posicionEnMedidor,
  rangoDe,
  redondear,
  resumenDe,
  sufijoDelDia,
  tablaQueToca,
  tallaConUnidad,
  tallaEnMetros,
  textoAlSalir,
  textoDe,
  textoEdadCorporal,
  textoFaltaTabla,
  ultimoValor,
  valorDe,
  vecesDelDia,
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

  it("lo buscado que empieza con un número va al carnet («1112223 LP» también)", () => {
    expect(empiezaConDigito("1234567")).toBe(true);
    expect(empiezaConDigito(" 1234567 ")).toBe(true);
    expect(empiezaConDigito("1112223 LP")).toBe(true);
    expect(empiezaConDigito("Lucía")).toBe(false);
    expect(empiezaConDigito("Ana 123")).toBe(false);
    expect(empiezaConDigito("")).toBe(false);
  });

  it("la unidad del campo pegada al número se acepta; otra letra, no", () => {
    expect(valorDe("tallaCm", "180cm")).toBe(180);
    expect(valorDe("tallaCm", "180 CM")).toBe(180);
    expect(valorDe("pesoKg", "82,4 kg")).toBe(82.4);
    expect(valorDe("pesoKg", "82,4Kg")).toBe(82.4);
    expect(valorDe("grasaPct", "75 %")).toBe(75);
    expect(valorDe("musculoPct", "30,5%")).toBe(30.5);
    expect(valorDe("cinturaCm", "92 cm")).toBe(92);
    expect(errorDeTope("tallaCm", "180cm")).toBeNull();
    expect(errorDeTope("pesoKg", "82,4 kg")).toBeNull();
    expect(errorDeTope("grasaPct", "75 %")).toBeNull();
    expect(textoAlSalir("pesoKg", "82,4 kg")).toBe("82,4");
    expect(textoAlSalir("tallaCm", "1,80 cm")).toBe("1,80");
    // La unidad de OTRO campo, otra letra o la unidad sola siguen siendo error.
    expect(errorDeTope("tallaCm", "180 kg")).toBe("Escribí sólo el número");
    expect(errorDeTope("pesoKg", "82,4 kgs")).toBe("Escribí sólo el número");
    // La talla acepta las dos, metros y centímetros; otra cosa, no.
    expect(valorDe("tallaCm", "1,73 m")).toBe(173);
    expect(valorDe("tallaCm", "1,73M")).toBe(173);
    expect(valorDe("tallaCm", "173 cm")).toBe(173);
    expect(errorDeTope("tallaCm", "1,73 m")).toBeNull();
    expect(textoAlSalir("tallaCm", "1,73 m")).toBe("1,73");
    expect(errorDeTope("tallaCm", "1,80 mts")).toBe("Escribí sólo el número");
    expect(errorDeTope("tallaCm", "m")).toBe("Escribí sólo el número");
    expect(errorDeTope("pesoKg", "kg")).toBe("Escribí sólo el número");
    expect(errorDeTope("pesoKg", "Peso: 82,4 kg")).toBe("Escribí sólo el número");
    expect(errorDeTope("edadCorporal", "44 años")).toBe("Escribí sólo el número");
    expect(errorDeTope("hijos", "2%")).toBe("Escribí sólo el número");
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

  it("el grado de la tarjeta es el del mismo control que el valor (no «35 %» con «Ideal»)", () => {
    const controles = [
      control({ id: 1, fecha: "2026-09-24", inicial: true, grasaPct: 35, grasaGrado: "SOBRE_PROMEDIO" }),
      control({ id: 2, fecha: "2026-10-24", pesoKg: 78 }),
      // Elegido a mano sin escribir el valor, en un control más nuevo.
      control({ id: 3, fecha: "2026-11-13", grasaGrado: "IDEAL" }),
    ];
    expect(resumenDe(controles, "grasaPct")?.actual).toBe(35);
    expect(gradoDelResumen(controles, "grasaPct", "grasaGrado")).toBe("SOBRE_PROMEDIO");
    // Sin ningún valor escrito, el último grado elegido.
    expect(gradoDelResumen(controles.slice(1), "grasaPct", "grasaGrado")).toBe("IDEAL");
    expect(gradoDelResumen(controles, "musculoPct", "musculoGrado")).toBeNull();
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

  it("con la edad anotada y el día en que se anotó, la misma cuenta del servidor", () => {
    const anotada = (fecha: string, hoy = "2026-11-23") =>
      edadEnFecha({ fechaNacimiento: null, edad: 21, edadDeclarada: 21, edadDeclaradaEn: "2026-11-23" }, fecha, hoy);
    // 21 anotado hoy: ese día 21; ayer, 21; un año justo antes, 20; un día menos que un año antes, 21.
    expect(anotada("2026-11-23")).toBe(21);
    expect(anotada("2026-11-22")).toBe(21);
    expect(anotada("2025-11-23")).toBe(20);
    expect(anotada("2025-11-24")).toBe(21);
    expect(anotada("2024-11-23")).toBe(19);
    // Después del día anotado suma los años cumplidos desde entonces.
    expect(anotada("2027-11-22", "2028-01-01")).toBe(21);
    expect(anotada("2027-11-23", "2028-01-01")).toBe(22);
    // Lo que cambia contra la cuenta vieja (la edad de hoy menos los años desde
    // el control): 21 anotado el 1-mar-2026; hoy, 5-mar-2027, tiene 22.
    const conDia = { fechaNacimiento: null, edad: 22, edadDeclarada: 21, edadDeclaradaEn: "2026-03-01" };
    expect(edadEnFecha(conDia, "2026-03-10", "2027-03-05")).toBe(21);
    expect(edadEnFecha({ fechaNacimiento: null, edad: 22 }, "2026-03-10", "2027-03-05")).toBe(22);
    // Sin el día (una respuesta vieja), la cuenta de antes.
    expect(edadEnFecha({ fechaNacimiento: null, edad: 22, edadDeclarada: 21, edadDeclaradaEn: null }, "2026-03-10", "2027-03-05")).toBe(22);
    // La fecha de nacimiento manda sobre lo anotado.
    expect(edadEnFecha({ fechaNacimiento: "2000-06-01", edad: 26, edadDeclarada: 40, edadDeclaradaEn: "2026-11-23" }, "2026-05-31", "2026-11-23")).toBe(25);
    // Negativa no hay: como el servidor, null.
    expect(edadEnFecha({ fechaNacimiento: null, edad: 1, edadDeclarada: 1, edadDeclaradaEn: "2026-11-23" }, "2024-11-23", "2026-11-23")).toBeNull();
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
    expect(errorDeTope("tallaCm", "58")).toBe("Entre 0,80 y 2,50\u00a0m");
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

  it("la talla escrita en metros se guarda en centímetros: «1,80» es 180 (testing profundo, 23-nov)", () => {
    for (const t of ["1,80", "1.80", "1,8", "1.8"]) {
      expect(errorDeTope("tallaCm", t)).toBeNull();
      expect(valorDe("tallaCm", t)).toBe(180);
    }
    expect(valorDe("tallaCm", "1,755")).toBe(175.5);
    expect(valorDe("tallaCm", "2,5")).toBe(250);
    // Desde 3 ya son centímetros (y fuera del tope); el cero no se agranda.
    const fueraTalla = "Entre 0,80 y 2,50\u00a0m";
    expect(errorDeTope("tallaCm", "3")).toBe(fueraTalla);
    expect(errorDeTope("tallaCm", "18")).toBe(fueraTalla);
    expect(errorDeTope("tallaCm", "0")).toBe(fueraTalla);
    expect(errorDeTope("tallaCm", "0,5")).toBe(fueraTalla);
    // Sólo la talla: un peso de 1,8 sigue siendo un dedazo.
    expect(errorDeTope("pesoKg", "1,8")).toBe("Entre 20 y 400 kg");
    expect(valorDe("pesoKg", "1,8")).toBe(1.8);
  });

  it("al salir del campo: lo que está bien se muestra con coma; lo que está mal queda como se escribió", () => {
    // La talla queda en metros, se haya escrito en metros o en centímetros (QA, 24-nov).
    expect(textoAlSalir("tallaCm", "1,80")).toBe("1,80");
    expect(textoAlSalir("tallaCm", " 180 ")).toBe("1,80");
    expect(textoAlSalir("tallaCm", "173")).toBe("1,73");
    expect(textoAlSalir("tallaCm", "1.73")).toBe("1,73");
    expect(textoAlSalir("tallaCm", "1,8")).toBe("1,80");
    expect(textoAlSalir("tallaCm", "175,5")).toBe("1,755");
    expect(textoAlSalir("tallaCm", "58")).toBe("58");
    expect(textoAlSalir("pesoKg", "82.40")).toBe("82,4");
    // Antes «2,5» hijos se volvía «3» (y 29,5 años, 30) sin decir nada.
    expect(textoAlSalir("hijos", "2,5")).toBe("2,5");
    expect(errorDeTope("hijos", "2,5")).toBe("Sin decimales");
    expect(textoAlSalir("edad", "29,5")).toBe("29,5");
    expect(textoAlSalir("edadCorporal", "44,5")).toBe("44,5");
    expect(textoAlSalir("pesoKg", "1.270")).toBe("1.270");
    expect(textoAlSalir("pesoKg", "abc")).toBe("abc");
    expect(textoAlSalir("pesoKg", "")).toBe("");
  });
});

describe("la talla se muestra en metros, como se dice (QA, 24-nov)", () => {
  it("dos decimales siempre, tres con medio centímetro, y vacío sin dato", () => {
    expect(tallaEnMetros(173)).toBe("1,73");
    expect(tallaEnMetros(180)).toBe("1,80");
    expect(tallaEnMetros(200)).toBe("2,00");
    expect(tallaEnMetros(80)).toBe("0,80");
    expect(tallaEnMetros(175.5)).toBe("1,755");
    expect(tallaEnMetros(158.1)).toBe("1,581");
    expect(tallaEnMetros(null)).toBe("");
    expect(tallaEnMetros(0)).toBe("");
    expect(tallaConUnidad(173)).toBe("1,73\u00a0m");
    expect(tallaConUnidad(null)).toBe("—");
  });

  it("lo que se muestra se vuelve a leer igual: guardar sin tocar la talla no la cambia", () => {
    for (const cm of [80, 99.5, 100, 158, 158.1, 173, 175.5, 199.9, 250]) {
      const texto = textoDe("tallaCm", cm);
      expect(errorDeTope("tallaCm", texto)).toBeNull();
      expect(valorDe("tallaCm", texto)).toBe(cm);
      expect(textoAlSalir("tallaCm", texto)).toBe(texto);
    }
    // Los demás campos siguen como estaban.
    expect(textoDe("cinturaCm", 92)).toBe("92");
    expect(textoDe("pesoKg", 82.4)).toBe("82,4");
  });
});

describe("IMC imposible (QA, 22-nov: 127 kg con 80 cm daba 198,4)", () => {
  it("se avisa fuera de 10 a 80, sin bloquear", () => {
    expect(avisoImc(198.4)).toBe("Revisá la talla y el peso: el IMC da 198,4");
    expect(avisoImc(9.9)).toBe("Revisá la talla y el peso: el IMC da 9,9");
    expect(avisoImc(10)).toBeNull();
    expect(avisoImc(80)).toBeNull();
    expect(avisoImc(39.2)).toBeNull();
    expect(avisoImc(null)).toBeNull();
  });

  it("el IMC de lo escrito: la talla en metros cuenta, y con un dato en error no hay IMC", () => {
    expect(imcDeLoEscrito("127", "80")).toBe(198.4);
    expect(imcDeLoEscrito("127", "1,80")).toBe(39.2);
    expect(imcDeLoEscrito("127", "18")).toBeNull();
    expect(imcDeLoEscrito("12", "180")).toBeNull();
    expect(imcDeLoEscrito("", "180")).toBeNull();
  });
});

describe("dos controles el mismo día", () => {
  it("el segundo lleva «(2)», el tercero «(3)»; el primero, nada", () => {
    expect(vecesDelDia(["2026-10-24", "2026-10-24", "2026-11-01", "2026-10-24"])).toEqual([1, 2, 1, 3]);
    expect(sufijoDelDia(1)).toBe("");
    expect(sufijoDelDia(2)).toBe(" (2)");
    expect(sufijoDelDia(undefined)).toBe("");
  });

  it("en el gráfico, la vez se cuenta entre todos los controles, como en la planilla", () => {
    const controles = [
      control({ id: 1, fecha: "2026-10-24", inicial: true, pesoKg: 78 }),
      control({ id: 2, fecha: "2026-10-24", cinturaCm: 90 }),
      control({ id: 3, fecha: "2026-10-24", pesoKg: 77.5 }),
    ];
    expect(evolucion(controles, "pesoKg")).toEqual([
      { fecha: "2026-10-24", valor: 78, vez: 1 },
      { fecha: "2026-10-24", valor: 77.5, vez: 3 },
    ]);
  });
});
