import { describe, expect, it } from "vitest";
import {
  buscarTutoriales,
  enYoutubeDe,
  miniaturaDe,
  porSeccion,
  reproductorDe,
  SECCION_GENERAL,
  TUTORIALES,
  tutorialesDelRubro,
  type Tutorial,
} from "./tutoriales";

const general: Tutorial = { id: "gen1", orden: 1, titulo: "Cómo vender", descripcion: "El cobro en efectivo." };
const acad2: Tutorial = {
  id: "aca2",
  orden: 2,
  seccion: "Recepción de la academia",
  rubros: ["ACADEMIA"],
  titulo: "Cobrar una cuota",
  descripcion: "Buscar al estudiante y registrar el pago.",
};
const acad1: Tutorial = { ...acad2, id: "aca1", orden: 1, titulo: "Abrir la caja", descripcion: "El cambio con el que arrancás." };

describe("tutorialesDelRubro", () => {
  it("un video con rubros sólo lo ve ese rubro; uno sin rubros, todos", () => {
    const lista = [general, acad2];
    expect(tutorialesDelRubro("ACADEMIA", lista)).toEqual([general, acad2]);
    expect(tutorialesDelRubro("RESTAURANTE", lista)).toEqual([general]);
    // Una sesión vieja sin rubro no ve los de nadie en particular.
    expect(tutorialesDelRubro(undefined, lista)).toEqual([general]);
  });

  it("el primer video, el de la recepción, es de la academia", () => {
    expect(tutorialesDelRubro("ACADEMIA").map((t) => t.id)).toContain("a2jPyD45a7U");
    expect(tutorialesDelRubro("PELUQUERIA").map((t) => t.id)).not.toContain("a2jPyD45a7U");
  });
});

describe("buscarTutoriales", () => {
  const lista = [general, acad1, acad2];

  it("busca en el título y en la descripción, sin tildes ni mayúsculas", () => {
    expect(buscarTutoriales(lista, "COMO VENDER")).toEqual([general]);
    expect(buscarTutoriales(lista, "arrancas")).toEqual([acad1]);
    expect(buscarTutoriales(lista, "estudiante")).toEqual([acad2]);
  });

  it("vacío o con espacios devuelve todo; sin coincidencias, nada", () => {
    expect(buscarTutoriales(lista, "   ")).toEqual(lista);
    expect(buscarTutoriales(lista, "inventario")).toEqual([]);
  });
});

describe("porSeccion", () => {
  it("agrupa y ordena por `orden`, no por el lugar en el arreglo", () => {
    expect(porSeccion([general, acad2, acad1])).toEqual([
      { seccion: SECCION_GENERAL, tutoriales: [general] },
      { seccion: "Recepción de la academia", tutoriales: [acad1, acad2] },
    ]);
  });
});

describe("los datos", () => {
  it("cada video tiene id de YouTube, título y descripción, sin ids repetidos", () => {
    for (const t of TUTORIALES) {
      expect(t.id).toMatch(/^[\w-]{11}$/);
      expect(t.titulo.trim()).not.toBe("");
      expect(t.descripcion.trim()).not.toBe("");
    }
    expect(new Set(TUTORIALES.map((t) => t.id)).size).toBe(TUTORIALES.length);
  });

  it("las direcciones: miniatura, reproductor sin cookies y el enlace a YouTube", () => {
    expect(miniaturaDe("a2jPyD45a7U")).toBe("https://i.ytimg.com/vi/a2jPyD45a7U/hqdefault.jpg");
    expect(reproductorDe("a2jPyD45a7U")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/a2jPyD45a7U\?/);
    expect(enYoutubeDe("a2jPyD45a7U")).toBe("https://www.youtube.com/watch?v=a2jPyD45a7U");
  });
});
