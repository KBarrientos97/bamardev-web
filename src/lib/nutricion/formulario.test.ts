import { describe, expect, it } from "vitest";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import {
  cambios,
  cambiosDeControl,
  conLoDelServidor,
  controlAInput,
  controlConDatos,
  controlDesde,
  controlVacio,
  edadDeFicha,
  edadDelControl,
  fichaAInput,
  fichaDesde,
  fichaVacia,
  hayCambios,
  soloConValor,
} from "./formulario";

/**
 * Lo que viaja al backend desde la evaluación (§3.3): vacío = null, sólo lo
 * escrito en el alta, sólo lo cambiado en la edición, y los grados de la
 * tabla no se mandan (los pone el servidor): sólo los elegidos a mano.
 */

describe("la ficha que se manda", () => {
  it("todo vacío viaja como null, nada inventado", () => {
    const i = fichaAInput(fichaVacia());
    expect(i.nombre).toBe("");
    for (const [k, v] of Object.entries(i)) {
      if (k === "nombre" || k === "enfermedades") continue;
      expect(v, k).toBeNull();
    }
    expect(i.enfermedades).toEqual({});
    // En el alta sólo va lo que tiene algo.
    expect(soloConValor({ ...i, nombre: "Lucía Paredes" })).toEqual({ nombre: "Lucía Paredes" });
  });

  it("la edad escrita vale sólo sin fecha de nacimiento", () => {
    const f = { ...fichaVacia(), nombre: "Lucía", edad: "36" };
    expect(fichaAInput(f).edad).toBe(36);
    expect(fichaAInput({ ...f, fechaNacimiento: "1990-05-14" }).edad).toBeNull();
    expect(edadDeFicha({ ...f, fechaNacimiento: "1990-05-14" }, "2026-11-22")).toBe(36);
    expect(edadDeFicha({ edad: "41", fechaNacimiento: "" }, "2026-11-22")).toBe(41);
  });

  it("las enfermedades: sólo las contestadas, la nota vacía es null", () => {
    const f = { ...fichaVacia(), enfermedades: { DIABETES: { tiene: true, nota: " desde 2019 " }, GASTRITIS: { tiene: false, nota: "" } } };
    expect(fichaAInput(f).enfermedades).toEqual({
      DIABETES: { tiene: true, nota: "desde 2019" },
      GASTRITIS: { tiene: false, nota: null },
    });
  });

  it("sin carnet no viaja el expedido", () => {
    expect(fichaAInput({ ...fichaVacia(), ciExpedido: "SC" }).ciExpedido).toBeNull();
    expect(fichaAInput({ ...fichaVacia(), ci: "1234567", ciExpedido: "SC" }).ciExpedido).toBe("SC");
  });
});

describe("la edición manda sólo lo que cambió", () => {
  it("lo borrado va como null y lo igual no va", () => {
    const antes = fichaAInput({ ...fichaVacia(), nombre: "Lucía", tallaCm: "158", telefono: "70000000" });
    const ahora = fichaAInput({ ...fichaVacia(), nombre: "Lucía", tallaCm: "158,0", telefono: "" });
    expect(cambios(antes, ahora)).toEqual({ telefono: null });
  });

  it("las enfermedades van enteras si cambió una", () => {
    const base = { ...fichaVacia(), nombre: "Lucía", enfermedades: { DIABETES: { tiene: true, nota: "" } } };
    const antes = fichaAInput(base);
    const ahora = fichaAInput({ ...base, enfermedades: { ...base.enfermedades, GASTRITIS: { tiene: false, nota: "" } } });
    expect(cambios(antes, ahora)).toEqual({
      enfermedades: { DIABETES: { tiene: true, nota: null }, GASTRITIS: { tiene: false, nota: null } },
    });
  });

  it("al editar, la edad que se muestra es la de hoy (guardarla no corre un año)", () => {
    const f = fichaDesde(paciente({ fechaNacimiento: null, edad: 37, edadDeclarada: 36 }));
    expect(f.edad).toBe("37");
    expect(fichaDesde(paciente()).edad).toBe("");
    // La talla del formulario, en metros (se guarda 158 cm).
    expect(fichaDesde(paciente()).tallaCm).toBe("1,58");
  });

  it("la tabla de un control usa la edad del servidor: la anotada con su día, o la escrita hoy si se cambió", () => {
    // 21 anotado el 1-mar-2026; hoy (5-mar-2027) tiene 22. El control del 10-mar-2026: 21.
    const f = fichaDesde(paciente({ fechaNacimiento: null, edad: 22, edadDeclarada: 21, edadDeclaradaEn: "2026-03-01" }));
    expect(f.edad).toBe("22");
    expect(f.edadAnotada).toEqual({ edad: 21, en: "2026-03-01" });
    expect(edadDelControl(f, "2026-03-10", "2027-03-05")).toBe(21);
    // Si la doctora escribe otra edad, el servidor la anota hoy: 30 hoy → 29 un año antes.
    expect(edadDelControl({ ...f, edad: "30" }, "2026-03-05", "2027-03-05")).toBe(29);
    expect(edadDelControl({ ...f, edad: "30" }, "2026-03-10", "2027-03-05")).toBe(30);
    // Sin lo anotado (un alta nueva), la escrita vale hoy.
    expect(edadDelControl({ ...fichaVacia(), edad: "40" }, "2026-11-22", "2026-11-23")).toBe(40);
    expect(edadDelControl({ ...fichaVacia(), edad: "40" }, "2025-11-23", "2026-11-23")).toBe(39);
    // Con fecha de nacimiento no hay nada anotado.
    expect(fichaDesde(paciente()).edadAnotada).toBeNull();
  });

  it("los campos con atajos se guardan con la escritura de siempre: nunca «Sí:» ni «Sí:  » (25-nov)", () => {
    const i = fichaAInput({
      ...fichaVacia(),
      nombre: "Lucía",
      cirugias: "Sí:  ",
      ultimosAnalisis: "no los trajo, la semana que viene ",
      conductaSueno: "Regular: se despierta a las 3 ",
      actividadFisica: "No",
      consumoAgua: " 2 litros ",
    });
    expect(i).toMatchObject({
      cirugias: "Sí",
      ultimosAnalisis: "No los trajo: la semana que viene",
      conductaSueno: "Regular: se despierta a las 3",
      actividadFisica: "No",
      consumoAgua: "2 L",
    });
    // Un atajo con la nota en blanco, o sólo espacios, es el atajo solo; nada es null.
    expect(fichaAInput({ ...fichaVacia(), cirugias: "No: " }).cirugias).toBe("No");
    expect(fichaAInput({ ...fichaVacia(), cirugias: "   " }).cirugias).toBeNull();
    // Los demás textos, como siempre (sin atajos): «Conducta alimentaria» no se lee como «No».
    expect(fichaAInput({ ...fichaVacia(), conductaAlimentaria: "no, come bien " }).conductaAlimentaria).toBe("no, come bien");
  });

  it("una ficha recién traída del servidor con «no» en cirugías no tiene cambios", () => {
    const guardada = fichaDesde(paciente({ cirugias: "no", consumoAgua: "2 l", conductaSueno: "bien, 8 horas" }));
    const enPantalla = { ...guardada };
    expect(hayCambios(fichaAInput(guardada), fichaAInput(enPantalla))).toBe(false);
    // Tocar «No» en la pantalla (deja «No») tampoco es un cambio; agregar una nota, sí.
    expect(hayCambios(fichaAInput(guardada), fichaAInput({ ...guardada, cirugias: "No" }))).toBe(false);
    expect(cambios(fichaAInput(guardada), fichaAInput({ ...guardada, cirugias: "No: nunca" }))).toEqual({ cirugias: "No: nunca" });
  });

  it("después de guardar, el carnet y la expedición quedan como los devolvió el servidor", () => {
    const escrita = { ...fichaVacia(), nombre: "Lucía", ci: "8958703 SC", ciExpedido: "" };
    const guardada = conLoDelServidor(escrita, paciente({ ci: "8958703", ciExpedido: "SC" }));
    expect(guardada.ci).toBe("8958703");
    expect(guardada.ciExpedido).toBe("SC");
    expect(guardada.nombre).toBe("Lucía");
    // Sin carnet, sin expedición.
    expect(conLoDelServidor(escrita, paciente({ ci: null, ciExpedido: "SC" }))).toMatchObject({ ci: "", ciExpedido: "" });
  });
});

describe("el control que se manda", () => {
  it("vacío salvo la fecha no tiene datos (el backend diría CONTROL_VACIO)", () => {
    expect(controlConDatos(controlVacio("2026-11-22"))).toBe(false);
    expect(controlConDatos({ ...controlVacio("2026-11-22"), nota: "Vino sin ayuno" })).toBe(true);
    expect(controlConDatos({ ...controlVacio("2026-11-22"), grados: { imc: null, grasa: "ALTO", musculo: null, visceral: null } })).toBe(true);
  });

  it("los números con coma, redondeados, y el IMC nunca viaja", () => {
    const i = controlAInput({ ...controlVacio("2026-11-22"), pesoKg: "82,4", grasaVisceral: "9,5" });
    expect(i).toMatchObject({ fecha: "2026-11-22", pesoKg: 82.4, grasaVisceral: 9.5, cinturaCm: null, grasaGrado: null });
    expect("imc" in i).toBe(false);
    expect(soloConValor(i)).toEqual({ fecha: "2026-11-22", pesoKg: 82.4, grasaVisceral: 9.5 });
  });

  it("al corregir: el grado que coincide con la tabla queda de la tabla; uno distinto, elegido a mano", () => {
    const c = control({
      id: 77,
      fecha: "2026-11-22",
      inicial: true,
      pesoKg: 82.4,
      imc: 33,
      imcGrado: "OBESIDAD_1",
      grasaPct: 41.2,
      grasaGrado: "SOBRE_PROMEDIO",
      musculoPct: 24,
      musculoGrado: "NORMAL",
      visceralGrado: "ALTO",
    });
    const f = controlDesde(c, { catalogo: CATALOGO, sexo: "F", edad: 36 });
    expect(f.pesoKg).toBe("82,4");
    expect(f.grados).toEqual({ imc: null, grasa: null, musculo: "NORMAL", visceral: "ALTO" });
    // Sin tocar nada, no hay nada que mandar.
    expect(cambiosDeControl(f, { ...f })).toEqual({});
    // Volver a la de la tabla manda null: el servidor la recalcula.
    expect(cambiosDeControl(f, { ...f, grados: { ...f.grados, musculo: null } })).toEqual({ musculoGrado: null });
  });

  it("si cambia un valor, su grado viaja: el elegido a mano no se pierde (§3.4)", () => {
    const f = { ...controlVacio("2026-11-22"), musculoPct: "24", grasaPct: "41,2", pesoKg: "82,4", grados: { imc: null, grasa: null, musculo: "NORMAL", visceral: null } };
    expect(cambiosDeControl(f, { ...f, musculoPct: "24,5" })).toEqual({ musculoPct: 24.5, musculoGrado: "NORMAL" });
    // Sin elegido a mano viaja null: que el servidor ponga el de la tabla.
    expect(cambiosDeControl(f, { ...f, grasaPct: "40" })).toEqual({ grasaPct: 40, grasaGrado: null });
    // El del IMC sale del peso.
    expect(cambiosDeControl(f, { ...f, pesoKg: "81" })).toEqual({ pesoKg: 81, imcGrado: null });
  });

  it("la tabla para saber si un grado fue a mano es la de la edad del día de ese control", () => {
    // Mujer que hoy tiene 41 y el día del control tenía 40: un 33,5 % de grasa es
    // «Sobre el promedio» a los 40 (desde 32,7) y «Promedio» a los 41 (hasta 34,3).
    const c = control({ id: 5, fecha: "2026-10-01", grasaPct: 33.5, grasaGrado: "SOBRE_PROMEDIO" });
    const conFecha = controlDesde(c, { catalogo: CATALOGO, sexo: "F", edad: 41, fechaNacimiento: "1985-11-01" }, "2026-11-22");
    expect(conFecha.grados.grasa).toBeNull();
    // Con la edad de hoy habría parecido elegido a mano.
    const conHoy = controlDesde({ ...c, fecha: "2026-11-22" }, { catalogo: CATALOGO, sexo: "F", edad: 41, fechaNacimiento: "1985-11-01" }, "2026-11-22");
    expect(conHoy.grados.grasa).toBe("SOBRE_PROMEDIO");
  });
});
