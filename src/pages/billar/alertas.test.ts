import { beforeEach, describe, expect, it } from "vitest";
import { marcarAvisado, olvidarAvisos, yaAvisado } from "./alertas";

const CLAVE = "bamardev.billar.avisados";

describe("avisos: una vez por umbral, aunque haya dos pestañas", () => {
  beforeEach(() => localStorage.clear());

  it("lo que avisó otra pestaña no se vuelve a avisar", () => {
    // Revisión del 16-oct: con el tablero en una pestaña y el POS en otra,
    // cada una avisaba por su cuenta y el zumbido y la voz salían dos veces.
    expect(yaAvisado("s1", 5, 60)).toBe(false);
    localStorage.setItem(CLAVE, JSON.stringify(["s1:5:60"])); // la otra pestaña
    expect(yaAvisado("s1", 5, 60)).toBe(true);
  });

  it("al guardar no pisa lo que anotó la otra pestaña", () => {
    localStorage.setItem(CLAVE, JSON.stringify(["s2:10:60"])); // la otra pestaña
    marcarAvisado("s3", 5, [10, 5, 1], 60);
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? "[]") as string[];
    // El de 5 min y los de arriba (después de avisar 5 no se avisa 10).
    expect(guardado).toEqual(expect.arrayContaining(["s2:10:60", "s3:10:60", "s3:5:60"]));
  });

  it("olvidar una sesión no la revive con lo guardado", () => {
    marcarAvisado("s4", 10, [10, 5, 1], 60);
    olvidarAvisos("s4");
    expect(yaAvisado("s4", 10, 60)).toBe(false);
  });
});
