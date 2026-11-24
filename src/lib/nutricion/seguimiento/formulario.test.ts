import { describe, expect, it } from "vitest";
import {
  cambioLaMarca,
  cambiosDeSemana,
  cambiosDeTratamiento,
  conPagoDelMes,
  errorDeNumero,
  erroresDeSemana,
  erroresDeTratamiento,
  iniciarAInput,
  semanaAInput,
  semanaCambio,
  semanaConDatos,
  semanaDesde,
  semanaVacia,
  soloLoEscrito,
  tratamientoDesde,
  tratamientoVacio,
} from "./formulario";
import { armarTratamiento, pacientesDePrueba } from "../../../test/seguimientoFixtures";

/**
 * Lo que se escribe en la hoja «Semana N» y en «Iniciar tratamiento», y cómo
 * viaja (CONTRATO-nutricion-seguimiento-23nov §3.3 y §4.2): todo arranca
 * vacío salvo la fecha y el número de la semana; se manda sólo lo escrito.
 */

const HOY = "2026-11-23";

describe("una semana nueva", () => {
  it("arranca vacía: sólo el número de la semana y la fecha de hoy", () => {
    const f = semanaVacia(8, HOY);
    expect(f).toEqual({
      semana: "8",
      fecha: HOY,
      pesoKg: "",
      dosis: "",
      sinDosis: false,
      motivoSinDosis: "",
      observaciones: "",
      pagoMedicamento: "",
      pagoControl: "",
      pagoOtro: "",
      pagoNota: "",
      cambioProducto: false,
      productoNombre: "",
      productoVialMg: "",
      productoVialMl: "",
    });
    expect(semanaConDatos(f)).toBe(false);
  });

  it("viaja sólo lo escrito, con coma o con punto", () => {
    const f = { ...semanaVacia(6, HOY), pesoKg: "121,8", dosis: "17", observaciones: "  Sin náuseas.  ", pagoMedicamento: "480" };
    expect(soloLoEscrito(semanaAInput(f, false))).toEqual({ semana: 6, fecha: HOY, pesoKg: 121.8, dosis: 17, observaciones: "Sin náuseas.", pagoMedicamento: 480 });
    expect(soloLoEscrito(semanaAInput({ ...f, pesoKg: "121.85", dosis: "2.5" }, false))).toMatchObject({ pesoKg: 121.85, dosis: 2.5 });
  });

  it("«No se aplicó» es un dato: se guarda sólo con eso, sin la dosis aunque se haya escrito", () => {
    const f = { ...semanaVacia(6, HOY), sinDosis: true, motivoSinDosis: "Viaje", dosis: "17" };
    expect(semanaConDatos(f)).toBe(true);
    expect(soloLoEscrito(semanaAInput(f, false))).toEqual({ semana: 6, fecha: HOY, sinDosis: true, motivoSinDosis: "Viaje" });
  });

  it("el pago del mes es medicamento o control: «Otro» no cuenta", () => {
    expect(conPagoDelMes({ pagoMedicamento: "480", pagoControl: "" })).toBe(true);
    expect(conPagoDelMes({ pagoMedicamento: "", pagoControl: "150" })).toBe(true);
    expect(conPagoDelMes({ pagoMedicamento: "", pagoControl: "" })).toBe(false);
    expect(conPagoDelMes({ pagoMedicamento: "0", pagoControl: "" })).toBe(false);
  });
});

describe("los topes (§3.3)", () => {
  const cargadas = [0, 1, 2, 3, 4, 5, 6, 7];

  it("la semana: número entero, de 1 en adelante, y no repetida", () => {
    const e = (semana: string) => erroresDeSemana({ ...semanaVacia(8, HOY), semana }, { inicial: false, semanasCargadas: cargadas, hoy: HOY }).semana;
    expect(e("8")).toBeNull();
    expect(e("7")).toBe("Ya hay un registro de la semana 7.");
    expect(e("0")).toBe("Entre 1 y 520");
    expect(e("2,5")).toBe("Sin decimales");
    expect(e("")).toBe("Escribí el número de la semana");
    // En el inicial no se mira el número.
    expect(erroresDeSemana({ ...semanaVacia(0, HOY), semana: "0" }, { inicial: true, semanasCargadas: [], hoy: HOY }).semana).toBeUndefined();
  });

  it("la fecha no puede ser futura; el peso, entre 20 y 400 kg", () => {
    const e = erroresDeSemana({ ...semanaVacia(8, HOY), fecha: "2026-11-24", pesoKg: "12" }, { inicial: false, semanasCargadas: cargadas, hoy: HOY });
    expect(e.fecha).toBe("No puede ser después de hoy");
    expect(e.pesoKg?.replace(/ /g, " ")).toBe("Entre 20 y 400 kg");
  });

  it("la dosis mayor que 0 y hasta 1000 (3 decimales); con «No se aplicó» no se mira", () => {
    expect(errorDeNumero("dosis", "0")).toBe("Mayor que 0 y hasta 1000");
    expect(errorDeNumero("dosis", "1001")).toBe("Mayor que 0 y hasta 1000");
    expect(errorDeNumero("dosis", "2,125")).toBeNull();
    expect(errorDeNumero("dosis", "2,1255")).toBe("Hasta 3 decimales");
    expect(errorDeNumero("dosis", "abc")).toBe("Escribí sólo el número");
    const e = erroresDeSemana({ ...semanaVacia(8, HOY), dosis: "0", sinDosis: true }, { inicial: false, semanasCargadas: [], hoy: HOY });
    expect(e.dosis).toBeNull();
  });

  it("cada pago de 0 a 100.000, con hasta 2 decimales («Bs» pegado vale)", () => {
    expect(errorDeNumero("pago", "480")).toBeNull();
    expect(errorDeNumero("pago", "Bs 480")).toBeNull();
    expect(errorDeNumero("pago", "480 Bs")).toBeNull();
    expect(errorDeNumero("pago", "100001")).toBe("Entre Bs 0 y Bs 100.000");
    expect(errorDeNumero("pago", "10,555")).toBe("Hasta 2 decimales");
    expect(errorDeNumero("pago", "0")).toBeNull();
  });

  it("el vial: mayor que 0, hasta 1000 mg y 100 ml; las dos o ninguna", () => {
    expect(errorDeNumero("vialMg", "0")).toBe("Mayor que 0 y hasta 1000 mg");
    expect(errorDeNumero("vialMl", "0,5")).toBeNull();
    expect(erroresDeTratamiento({ ...tratamientoVacio(), nombre: "Tirzepatida", unidadDosis: "UI", vialMg: "15" }).vial).toBe("Completá los dos: los mg y los ml del vial");
    expect(erroresDeTratamiento({ ...tratamientoVacio(), nombre: "Tirzepatida", unidadDosis: "UI", vialMg: "15", vialMl: "0,5" }).vial).toBeNull();
  });

  it("el tratamiento pide el nombre (2 a 80) y en qué se anota la dosis", () => {
    const e = erroresDeTratamiento(tratamientoVacio());
    expect(e.nombre).toBe("Escribí el tratamiento");
    expect(e.unidadDosis).toBe("Elegí en qué anotás la dosis");
    expect(erroresDeTratamiento({ ...tratamientoVacio(), nombre: "T" }).nombre).toBe("Al menos 2 letras");
  });
});

describe("corregir una semana", () => {
  const lucia = pacientesDePrueba(HOY).find((p) => p.paciente.id === 12)!;
  const t = armarTratamiento(lucia.tratamientos[0]);
  const s5 = t.registros.find((r) => r.semana === 5)!;
  const s6 = t.registros.find((r) => r.semana === 6)!;

  it("abre con lo guardado, y sin tocar nada no hay cambios", () => {
    const f = semanaDesde(s5);
    expect(f).toMatchObject({ semana: "5", pesoKg: "123,4", dosis: "17", pagoMedicamento: "" });
    expect(semanaCambio(f, { ...f })).toBe(false);
    expect(cambiosDeSemana(f, { ...f }, false)).toEqual({});
  });

  it("manda sólo lo que cambió; `null` borra el dato", () => {
    const f = semanaDesde(s5);
    expect(cambiosDeSemana(f, { ...f, pagoMedicamento: "480", pagoControl: "150" }, false)).toEqual({ pagoMedicamento: 480, pagoControl: 150 });
    expect(cambiosDeSemana(f, { ...f, observaciones: "" }, false)).toEqual({ observaciones: null });
    expect(cambiosDeSemana(f, { ...f, semana: "8" }, false)).toEqual({ semana: 8 });
    expect(cambiosDeSemana(f, { ...f, dosis: "25" }, false)).toEqual({ dosis: 25 });
  });

  it("marcar y desmarcar «No se aplicó»", () => {
    const f5 = semanaDesde(s5);
    expect(cambiosDeSemana(f5, { ...f5, sinDosis: true, motivoSinDosis: "Salud" }, false)).toEqual({ sinDosis: true, motivoSinDosis: "Salud" });
    const f6 = semanaDesde(s6);
    expect(f6).toMatchObject({ sinDosis: true, motivoSinDosis: "Viaje", dosis: "" });
    expect(cambiosDeSemana(f6, { ...f6, sinDosis: false, dosis: "17" }, false)).toEqual({ sinDosis: false, dosis: 17 });
    expect(cambiosDeSemana(f6, { ...f6, motivoSinDosis: "No vino" }, false)).toEqual({ motivoSinDosis: "No vino" });
  });

  it("el inicial no manda el número de la semana", () => {
    const f0 = semanaDesde(t.registros[0]);
    expect(cambiosDeSemana(f0, { ...f0, pesoKg: "128" }, true)).toEqual({ pesoKg: 128 });
  });
});

describe("el cambio de producto de una semana (§7.1)", () => {
  const conMarca = armarTratamiento({
    ...pacientesDePrueba(HOY).find((p) => p.paciente.id === 12)!.tratamientos[0],
    semanas: pacientesDePrueba(HOY)
      .find((p) => p.paciente.id === 12)!
      .tratamientos[0].semanas.map((s) => (s.semana === 7 ? { ...s, producto: { nombre: "Tirze", vialMg: 10, vialMl: 0.5 } } : s)),
  });
  const s7 = conMarca.registros.find((r) => r.semana === 7)!;

  it("la clave `producto` viaja SÓLO con una marca (un backend anterior la rechaza)", () => {
    const comun = { ...semanaVacia(8, HOY), pesoKg: "124" };
    expect(soloLoEscrito(semanaAInput(comun, false))).toEqual({ semana: 8, fecha: HOY, pesoKg: 124 });
    expect("producto" in semanaAInput(comun, false)).toBe(false);
    const marca = { ...comun, cambioProducto: true, productoNombre: " Tirze ", productoVialMg: "10", productoVialMl: "0,5" };
    expect(soloLoEscrito(semanaAInput(marca, false))).toEqual({ semana: 8, fecha: HOY, pesoKg: 124, producto: { nombre: "Tirze", vialMg: 10, vialMl: 0.5 } });
    // Sin vial, sólo el nombre; y nunca en el inicial.
    expect(semanaAInput({ ...marca, productoVialMg: "", productoVialMl: "" }, false).producto).toEqual({ nombre: "Tirze" });
    expect("producto" in semanaAInput(marca, true)).toBe(false);
    // Una semana con sólo la marca no está vacía.
    expect(semanaConDatos({ ...semanaVacia(8, HOY), cambioProducto: true, productoNombre: "Tirze" })).toBe(true);
    expect(semanaConDatos({ ...semanaVacia(8, HOY), cambioProducto: true })).toBe(false);
  });

  it("los datos de la marca: el producto (2 a 80) y el vial, los dos o ninguno", () => {
    const f = { ...semanaVacia(8, HOY), cambioProducto: true };
    const e = erroresDeSemana(f, { inicial: false, semanasCargadas: [], hoy: HOY });
    expect(e.productoNombre).toBe("Escribí el producto nuevo");
    expect(erroresDeSemana({ ...f, productoNombre: "Tirze", productoVialMg: "10" }, { inicial: false, semanasCargadas: [], hoy: HOY }).productoVial).toBe(
      "Completá los dos: los mg y los ml del vial",
    );
    expect(erroresDeSemana({ ...f, productoNombre: "Tirze", productoVialMg: "0", productoVialMl: "0,5" }, { inicial: false, semanasCargadas: [], hoy: HOY }).productoVialMg).toBeTruthy();
    // Sin la marca puesta, nada de eso se mira.
    expect(erroresDeSemana({ ...f, cambioProducto: false }, { inicial: false, semanasCargadas: [], hoy: HOY }).productoNombre).toBeUndefined();
  });

  it("corregir: abre con la marca; corregirla manda la nueva; quitarla manda `null`; sin tocarla no viaja", () => {
    const f = semanaDesde(s7);
    expect(f).toMatchObject({ cambioProducto: true, productoNombre: "Tirze", productoVialMg: "10", productoVialMl: "0,5" });
    expect(cambiosDeSemana(f, { ...f, observaciones: "Otra" }, false)).toEqual({ observaciones: "Otra" });
    expect(cambiosDeSemana(f, { ...f, productoVialMg: "15" }, false)).toEqual({ producto: { nombre: "Tirze", vialMg: 15, vialMl: 0.5 } });
    expect(cambiosDeSemana(f, { ...f, cambioProducto: false }, false)).toEqual({ producto: null });
    expect(cambioLaMarca(f, { ...f, cambioProducto: false })).toBe(true);
    expect(cambioLaMarca(f, { ...f, pesoKg: "1" })).toBe(false);
    // Una semana sin marca: ponérsela.
    const s5 = semanaDesde(conMarca.registros.find((r) => r.semana === 5)!);
    expect(s5.cambioProducto).toBe(false);
    expect(cambiosDeSemana(s5, { ...s5, cambioProducto: true, productoNombre: "Tirze" }, false)).toEqual({ producto: { nombre: "Tirze" } });
  });

  it("editar el tratamiento con cambios de producto: el nombre y el vial son los del inicio", () => {
    expect(conMarca.nombre).toBe("Tirze");
    expect(tratamientoDesde(conMarca)).toEqual({ nombre: "Tirzepatida", vialMg: "15", vialMl: "0,5", unidadDosis: "UI" });
    // Un backend sin marcas: el del tratamiento.
    expect(tratamientoDesde({ ...conMarca, productoInicial: undefined, cambiosDeProducto: undefined })).toMatchObject({ nombre: "Tirze", vialMg: "10" });
  });
});

describe("el tratamiento", () => {
  it("iniciar: el tratamiento con el vial y, si hay, lo escrito del inicial (sin «No se aplicó»)", () => {
    const t = { nombre: " Tirzepatida ", vialMg: "15", vialMl: "0,5", unidadDosis: "UI" as const };
    const ini = { ...semanaVacia(0, HOY), pesoKg: "129", dosis: "8", pagoMedicamento: "480", pagoControl: "150" };
    expect(iniciarAInput(t, ini)).toEqual({
      nombre: "Tirzepatida",
      unidadDosis: "UI",
      vialMg: 15,
      vialMl: 0.5,
      inicial: { fecha: HOY, pesoKg: 129, dosis: 8, pagoMedicamento: 480, pagoControl: 150 },
    });
    // Sin vial ni nada escrito: el inicial va sólo con la fecha.
    expect(iniciarAInput({ ...t, vialMg: "", vialMl: "" }, semanaVacia(0, HOY))).toEqual({ nombre: "Tirzepatida", unidadDosis: "UI", inicial: { fecha: HOY } });
  });

  it("editar: sólo lo que cambió; quitar el vial manda las dos en null", () => {
    const antes = tratamientoDesde({ nombre: "Tirzepatida", unidadDosis: "UI", presentacion: { mg: 15, ml: 0.5, mgPorMl: 30, mgPorUi: 0.3 } });
    expect(antes).toEqual({ nombre: "Tirzepatida", vialMg: "15", vialMl: "0,5", unidadDosis: "UI" });
    expect(cambiosDeTratamiento(antes, { ...antes })).toEqual({});
    expect(cambiosDeTratamiento(antes, { ...antes, unidadDosis: "mg" })).toEqual({ unidadDosis: "mg" });
    expect(cambiosDeTratamiento(antes, { ...antes, vialMg: "", vialMl: "" })).toEqual({ vialMg: null, vialMl: null });
    expect(cambiosDeTratamiento(antes, { ...antes, vialMg: "10" })).toEqual({ vialMg: 10, vialMl: 0.5 });
  });
});
