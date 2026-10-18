import { describe, expect, it } from "vitest";
import { completarMonto, editarMonto, leerMonto, montoParaEditar } from "./montoTecleado";

/** Lo que queda en el campo tecleando de a una tecla, siempre al final. */
function teclear(teclas: string, desde = ""): string {
  let texto = desde;
  for (const tecla of teclas) {
    const nuevo = texto + tecla;
    texto = editarMonto(texto, nuevo, nuevo.length).texto;
  }
  return texto;
}

describe("se escribe como en Bolivia", () => {
  it("los miles se separan solos mientras se teclea", () => {
    expect(teclear("2258")).toBe("2.258");
    expect(teclear("1000000")).toBe("1.000.000");
    expect(teclear("150")).toBe("150");
  });

  it("225890 sin separadores se ve como 225 mil antes de cerrar", () => {
    // QA de Kevin (17-oct): tecleó 225890 pensando en Bs 2.258,90, el campo lo
    // mostraba tal cual y recién el "sobrante de Bs 223.631,10" lo delataba.
    expect(teclear("225890")).toBe("225.890");
    expect(leerMonto(teclear("225890"))).toBe(225890);
  });

  it("la coma es la de los centavos", () => {
    expect(teclear("2258,90")).toBe("2.258,90");
    expect(leerMonto(teclear("2258,90"))).toBe(2258.9);
    expect(teclear("50,50")).toBe("50,50");
    expect(leerMonto("50,50")).toBe(50.5);
  });

  it("2.258,90 tecleado con su punto de miles se entiende", () => {
    // QA de Kevin (17-oct): el campo pasaba la coma a punto, llegaba "2.258.90",
    // Number() daba NaN y el cierre decía "no puede ser negativo".
    expect(teclear("2.258,90")).toBe("2.258,90");
    expect(leerMonto("2.258,90")).toBe(2258.9);
  });

  it("1.000 son mil, no un boliviano", () => {
    // Number("1.000") da 1: un conteo de mil se registraba como Bs 1, sin aviso.
    expect(teclear("1.000")).toBe("1.000");
    expect(leerMonto("1.000")).toBe(1000);
    expect(leerMonto(teclear("1.000.000"))).toBe(1_000_000);
  });

  it("el punto con una o dos cifras detrás es de centavos", () => {
    // El punto del teclado numérico: un grupo de miles siempre tiene tres cifras.
    expect(leerMonto(teclear("2258.90"))).toBe(2258.9);
    expect(teclear("2.258.90")).toBe("2.258.90");
    expect(leerMonto(teclear("2.258.90"))).toBe(2258.9);
    expect(leerMonto(teclear("50.5"))).toBe(50.5);
  });

  it("una tercera cifra después de la coma, otra coma o un punto después de la coma no entran", () => {
    expect(teclear("50,505")).toBe("50,50");
    expect(teclear("50,5,")).toBe("50,5");
    expect(teclear("50,5.")).toBe("50,5");
  });

  it("letras, espacios y el signo no entran", () => {
    expect(teclear("-50")).toBe("50");
    expect(teclear("Bs 50")).toBe("50");
    expect(teclear("abc")).toBe("");
  });

  it("los ceros de adelante se van, el de los centavos no", () => {
    expect(teclear("007")).toBe("7");
    expect(teclear("0,50")).toBe("0,50");
    expect(leerMonto(teclear("0"))).toBe(0);
  });

  it("una coma suelta todavía no es un monto", () => {
    // Si fuera 0, "Cerrar caja" cerraría con Bs 0 a quien sólo tocó la coma.
    expect(teclear(",")).toBe(",");
    expect(leerMonto(",")).toBeNull();
    expect(leerMonto(teclear(",5"))).toBe(0.5);
    expect(leerMonto("")).toBeNull();
  });
});

describe("corregir lo tecleado", () => {
  it("borrar una cifra de los miles no inventa centavos", () => {
    // "22.589" sin el 5 queda "22.89": ese punto es el de los miles de antes,
    // no 22,89.
    const r = editarMonto("22.589", "22.89", 3);
    expect(r.texto).toBe("2.289");
    expect(leerMonto(r.texto)).toBe(2289);
    expect(r.cursor).toBe(3); // 2.2|89
  });

  it("borrar detrás de un punto de miles borra la cifra de antes", () => {
    // Si se borrara sólo el punto, se volvería a agrupar y el cursor quedaría
    // trabado: cada "borrar" lo hacía reaparecer.
    expect(editarMonto("2.258", "2258", 1)).toEqual({ texto: "258", cursor: 0 });
    expect(editarMonto("1.000.000", "1.000000", 5).texto).toBe("100.000");
  });

  it("borrar la coma junta los centavos con los miles, como una calculadora", () => {
    expect(editarMonto("2.258,90", "2.25890", 5).texto).toBe("225.890");
  });

  it("una cifra en el medio se agrupa de nuevo con el cursor en su lugar", () => {
    const r = editarMonto("2.258", "2.9258", 3);
    expect(r.texto).toBe("29.258");
    expect(r.cursor).toBe(3); // 29.|258: detrás del 9 que se tecleó
  });

  it("lo que no entra deja el cursor donde estaba", () => {
    expect(editarMonto("50,50", "50,505", 6)).toEqual({ texto: "50,50", cursor: 5 });
  });

  it("pegar un monto con Bs y separadores", () => {
    expect(editarMonto("", "Bs 2.258,90", 11).texto).toBe("2.258,90");
  });

  it("pegar encima de otro lo reemplaza y se lee entero", () => {
    expect(editarMonto("2.258", "1.5", 3).texto).toBe("1.5");
    expect(editarMonto("2.258", "1.500", 5).texto).toBe("1.500");
  });
});

describe("al salir del campo queda escrito entero", () => {
  it("con sus dos centavos, para que no haya duda de qué punto es de miles", () => {
    expect(completarMonto("2.258")).toBe("2.258,00");
    expect(completarMonto("2.258.9")).toBe("2.258,90");
    expect(completarMonto("50.5")).toBe("50,50");
    expect(completarMonto(",5")).toBe("0,50");
    expect(completarMonto("0")).toBe("0,00");
  });

  it("sin monto queda vacío", () => {
    expect(completarMonto("")).toBe("");
    expect(completarMonto(",")).toBe("");
  });

  it("completar no cambia lo que vale", () => {
    for (const t of ["2.258", "2.258.90", "50.5", "1.000.000", "225.890", "0,5"]) {
      expect(leerMonto(completarMonto(t))).toBe(leerMonto(t));
    }
  });
});

describe("montoParaEditar", () => {
  it("el total del conteo de billetes se escribe como lo deja el campo", () => {
    expect(montoParaEditar(2258.9)).toBe("2.258,90");
    expect(montoParaEditar(100)).toBe("100,00");
    // Sin residuos de punto flotante en el texto.
    expect(montoParaEditar(0.1 + 0.2)).toBe("0,30");
    expect(leerMonto(montoParaEditar(1234567.89))).toBe(1234567.89);
  });
});
