import { describe, expect, it } from "vitest";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import {
  cambios,
  cambiosDeControl,
  controlAInput,
  controlConDatos,
  controlDesde,
  controlVacio,
  edadDeFicha,
  fichaAInput,
  fichaDesde,
  fichaVacia,
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
    expect(fichaDesde(paciente()).tallaCm).toBe("158");
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
