import { describe, expect, it } from "vitest";
import { normalizar } from "../../lib/texto";
import {
  DROGAS_BASE,
  FORMAS_BASE,
  comoEnLaLista,
  filtrarSugerencias,
  juntarSugerencias,
  limpiarRegistro,
  partirPrincipios,
  registroConForma,
  unirPrincipios,
} from "./fichaFarmaceutica";

describe("principios activos: una columna de texto, varias drogas", () => {
  it("se guardan con coma y espacio: «Diclofenaco, Paracetamol»", () => {
    expect(unirPrincipios(["Diclofenaco", "Paracetamol"])).toBe("Diclofenaco, Paracetamol");
  });

  it("al editar se parten por coma, punto y coma y «+», sin espacios de más", () => {
    // El "+" es como venían del Excel y de la carga a mano de antes.
    expect(partirPrincipios("Paracetamol + Cafeína;  Codeína ,")).toEqual([
      "Paracetamol",
      "Cafeína",
      "Codeína",
    ]);
  });

  it("vacío o nulo es ninguna, y una repetida queda una vez", () => {
    expect(partirPrincipios(null)).toEqual([]);
    expect(partirPrincipios("  ")).toEqual([]);
    expect(partirPrincipios("Losartán, losartan")).toEqual(["Losartán"]);
  });

  it("lo que se guarda y se vuelve a partir da lo mismo", () => {
    const drogas = ["Amoxicilina", "Ácido clavulánico"];
    expect(partirPrincipios(unirPrincipios(drogas))).toEqual(drogas);
  });
});

describe("las listas base", () => {
  it("no repiten nada, ni con otra escritura", () => {
    for (const lista of [DROGAS_BASE, FORMAS_BASE]) {
      const claves = lista.map((x) => normalizar(x));
      expect(new Set(claves).size).toBe(lista.length);
    }
  });

  it("traen lo de todos los días, bien escrito", () => {
    for (const d of ["Paracetamol", "Ibuprofeno", "Losartán", "Clonazepam", "Ácido acetilsalicílico"]) {
      expect(DROGAS_BASE).toContain(d);
    }
    expect(DROGAS_BASE.length).toBeGreaterThanOrEqual(100);
    expect(FORMAS_BASE).toContain("Cápsula");
  });

  it("ninguna droga lleva el separador adentro (se partiría en dos al editar)", () => {
    expect(DROGAS_BASE.filter((d) => /[,;+]/.test(d))).toEqual([]);
  });
});

describe("juntar sugerencias", () => {
  it("lo del negocio primero y la base al final, sin repetir", () => {
    expect(juntarSugerencias([["Jarabe"], ["Gotas", "jarabe"]], ["Cápsula", "Gotas"])).toEqual([
      "Jarabe",
      "Gotas",
      "Cápsula",
    ]);
  });

  it("la escritura la gana la base: «capsula» guardado se sugiere «Cápsula»", () => {
    expect(juntarSugerencias([["capsula"]], ["Cápsula"])).toEqual(["Cápsula"]);
  });

  it("lo que llega roto del servidor o del almacenamiento no rompe nada", () => {
    const roto = [null, undefined, "BAGÓ", "  ", 7 as unknown as string];
    expect(juntarSugerencias([roto, undefined, null, "INTI" as unknown as string[]])).toEqual(["BAGÓ"]);
  });
});

describe("filtrar y asentar lo tecleado", () => {
  it("sin tildes, lo que empieza así primero, y sin lo ya elegido", () => {
    const lista = ["Ácido fólico", "Fluconazol", "Folato", "Paracetamol"];
    expect(filtrarSugerencias(lista, "fol")).toEqual(["Folato", "Ácido fólico"]);
    expect(filtrarSugerencias(lista, "fol", { excluir: ["folato"] })).toEqual(["Ácido fólico"]);
  });

  it("sin texto ofrece todo, hasta el tope", () => {
    expect(filtrarSugerencias(["A", "B", "C"], "", { tope: 2 })).toEqual(["A", "B"]);
  });

  it("lo que coincide entero toma la escritura de la lista; lo demás queda como está", () => {
    expect(comoEnLaLista(" losartan ", ["Losartán"])).toBe("Losartán");
    expect(comoEnLaLista("Losartán potásico", ["Losartán"])).toBe("Losartán potásico");
  });
});

describe("registro sanitario de AGEMED", () => {
  it("se pasa a mayúsculas y sin espacios alrededor del guion y la barra", () => {
    expect(limpiarRegistro("  nn - 12345 / 2024 ")).toBe("NN-12345/2024");
  });

  it("nacional e importado tienen la forma; un número suelto no", () => {
    expect(registroConForma("NN-12345/2024")).toBe(true);
    expect(registroConForma("ii-12345/24")).toBe(true);
    // El que cargó Kevin al probar el alta (12-nov).
    expect(registroConForma("65165156165")).toBe(false);
  });

  it("un cosmético (NSO) no tiene la forma: se avisa, pero no es un error", () => {
    // `registroConForma` sólo decide el aviso ámbar; el formulario guarda igual.
    expect(registroConForma("NSOC12345-19CO")).toBe(false);
  });
});
