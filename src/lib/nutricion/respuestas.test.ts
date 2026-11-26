import { describe, expect, it } from "vitest";
import { ATAJOS, CAMPOS_CON_ATAJOS, componerRespuesta, leerRespuesta, normalizarRespuesta } from "./respuestas";

/**
 * Las respuestas con atajos de la ficha (25-nov): el dato es UN texto; el
 * atajo y la nota se arman y se leen con estas reglas.
 */

const SI_NO = ATAJOS.cirugias;

describe("componer", () => {
  it("sólo el atajo, atajo y nota, sólo la nota, nada", () => {
    expect(componerRespuesta("No", "")).toBe("No");
    expect(componerRespuesta("No", "nunca")).toBe("No: nunca");
    expect(componerRespuesta(null, "Apendicitis 2015")).toBe("Apendicitis 2015");
    expect(componerRespuesta(null, "")).toBe("");
  });

  it("no recorta nada mientras se escribe", () => {
    expect(componerRespuesta("Sí", " ")).toBe("Sí:  ");
    expect(componerRespuesta("Sí", "cesárea ")).toBe("Sí: cesárea ");
    expect(componerRespuesta(null, "dos ")).toBe("dos ");
  });
});

describe("leer", () => {
  it("el texto ES el atajo, sin mayúsculas ni tildes", () => {
    for (const t of ["Sí", "si", "SI", "Si", "sí", "SÍ"]) expect(leerRespuesta(t, SI_NO)).toEqual({ opcion: "Sí", nota: "" });
    expect(leerRespuesta("no", SI_NO)).toEqual({ opcion: "No", nota: "" });
    expect(leerRespuesta("2 l", ATAJOS.consumoAgua)).toEqual({ opcion: "2 L", nota: "" });
  });

  it("el atajo y la nota, con cualquier separador", () => {
    expect(leerRespuesta("No: nunca", SI_NO)).toEqual({ opcion: "No", nota: "nunca" });
    expect(leerRespuesta("No, nunca", SI_NO)).toEqual({ opcion: "No", nota: "nunca" });
    expect(leerRespuesta("No; nunca", SI_NO)).toEqual({ opcion: "No", nota: "nunca" });
    expect(leerRespuesta("No. Nunca", SI_NO)).toEqual({ opcion: "No", nota: "Nunca" });
    expect(leerRespuesta("No - nunca", SI_NO)).toEqual({ opcion: "No", nota: "nunca" });
    expect(leerRespuesta("No — nunca", SI_NO)).toEqual({ opcion: "No", nota: "nunca" });
    expect(leerRespuesta("si , cesárea (2019)", SI_NO)).toEqual({ opcion: "Sí", nota: "cesárea (2019)" });
    expect(leerRespuesta("Sí:", SI_NO)).toEqual({ opcion: "Sí", nota: "" });
  });

  it("sin separador no es el atajo: todo queda como nota", () => {
    expect(leerRespuesta("Apendicitis 2015", SI_NO)).toEqual({ opcion: null, nota: "Apendicitis 2015" });
    expect(leerRespuesta("Nos operaron", SI_NO)).toEqual({ opcion: null, nota: "Nos operaron" });
    expect(leerRespuesta("No-fumador", SI_NO)).toEqual({ opcion: null, nota: "No-fumador" });
    expect(leerRespuesta("2 litros", ATAJOS.consumoAgua)).toEqual({ opcion: null, nota: "2 litros" });
    expect(leerRespuesta("1 L y medio", ATAJOS.consumoAgua)).toEqual({ opcion: null, nota: "1 L y medio" });
    expect(leerRespuesta("Sin", SI_NO)).toEqual({ opcion: null, nota: "Sin" });
  });

  it("vacío o sin dato: nada elegido", () => {
    expect(leerRespuesta("", SI_NO)).toEqual({ opcion: null, nota: "" });
    expect(leerRespuesta(null, SI_NO)).toEqual({ opcion: null, nota: "" });
    expect(leerRespuesta(undefined, SI_NO)).toEqual({ opcion: null, nota: "" });
  });

  it("prueba del más largo al más corto: «No los trajo» no es «No»", () => {
    const lista = ["No", "No los trajo"];
    expect(leerRespuesta("No los trajo", lista)).toEqual({ opcion: "No los trajo", nota: "" });
    expect(leerRespuesta("no los trajo: la semana que viene", lista)).toEqual({ opcion: "No los trajo", nota: "la semana que viene" });
    expect(leerRespuesta("No los trajo", SI_NO)).toEqual({ opcion: null, nota: "No los trajo" });
    expect(leerRespuesta("con alteraciones, colesterol alto", ATAJOS.ultimosAnalisis)).toEqual({ opcion: "Con alteraciones", nota: "colesterol alto" });
  });

  it("la forma de siempre se lee quitando sólo «: »: los espacios que se van tecleando no se pierden", () => {
    expect(leerRespuesta("Sí:  ", SI_NO)).toEqual({ opcion: "Sí", nota: " " });
    expect(leerRespuesta("Sí: cesárea ", SI_NO)).toEqual({ opcion: "Sí", nota: "cesárea " });
    expect(leerRespuesta("dos ", SI_NO)).toEqual({ opcion: null, nota: "dos " });
  });

  it("ida y vuelta: leer lo compuesto da lo mismo, con cualquier nota", () => {
    const notas = ["", " ", "  ", "cesárea", "cesárea ", " cesárea", "a: b", "\n2019", "cesárea\n(2019)"];
    for (const campo of CAMPOS_CON_ATAJOS) {
      for (const opcion of ATAJOS[campo]) {
        for (const nota of notas) expect(leerRespuesta(componerRespuesta(opcion, nota), ATAJOS[campo])).toEqual({ opcion, nota });
      }
    }
  });
});

describe("normalizar (al guardar)", () => {
  it("el atajo con su escritura de siempre y la nota recortada", () => {
    expect(normalizarRespuesta("si", SI_NO)).toBe("Sí");
    expect(normalizarRespuesta("Sí:", SI_NO)).toBe("Sí");
    expect(normalizarRespuesta("Sí:  ", SI_NO)).toBe("Sí");
    expect(normalizarRespuesta("no , nunca ", SI_NO)).toBe("No: nunca");
    expect(normalizarRespuesta("  No", SI_NO)).toBe("No");
    expect(normalizarRespuesta("Sí: cesárea (2019) ", SI_NO)).toBe("Sí: cesárea (2019)");
    expect(normalizarRespuesta(" Apendicitis 2015 ", SI_NO)).toBe("Apendicitis 2015");
    expect(normalizarRespuesta("   ", SI_NO)).toBe("");
    expect(normalizarRespuesta(null, SI_NO)).toBe("");
  });

  it("normalizar lo normalizado no cambia nada", () => {
    const textos = ["si", "SI, cesárea", "No:  ", " no - nunca ", "Apendicitis 2015", "2 litros", "2 l", "1 L y medio", "Sí:", "", "  ", "Nos operaron"];
    for (const campo of CAMPOS_CON_ATAJOS) {
      for (const t of textos) {
        const una = normalizarRespuesta(t, ATAJOS[campo]);
        expect(normalizarRespuesta(una, ATAJOS[campo])).toBe(una);
      }
    }
  });
});
