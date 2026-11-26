import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { controlVacio, fichaVacia, type FormControl, type FormFicha } from "../../lib/nutricion/formulario";
import type { Sexo } from "../../lib/nutricion/tipos";
import { EtapaMedidas } from "./EtapaMedidas";
import type { CampoForm } from "./EtapasEvaluacion";
import type { Cinta } from "./FiguraCuerpo";

/**
 * La etapa 2 de la evaluación, «Medidas» (25-nov): los campos en el orden del
 * cuerpo (Pecho, Cintura, Cadera), la figura como diagrama vivo (cinta vacía,
 * cargada o activa; con rótulos, el valor escrito) y tocar una cinta lleva a
 * su campo. La pantalla dibuja dos figuras (la sola del teléfono y la de
 * rótulos del escenario ancho; el CSS muestra una): acá están las dos.
 */

/** La etapa con su estado, como la arma `Evaluacion.tsx`. */
function Medidas({ sexo = "F", errores = {} }: { sexo?: Sexo | ""; errores?: Partial<Record<CampoForm, string>> }) {
  const [ficha, setFicha] = useState<FormFicha>({ ...fichaVacia(), sexo });
  const [control, setControl] = useState<FormControl>(controlVacio("2026-11-25"));
  const [cinta, setCinta] = useState<Cinta | null>(null);
  return (
    <EtapaMedidas
      ficha={ficha}
      control={control}
      catalogo={null}
      cambiarFicha={(campo, valor) => setFicha((f) => ({ ...f, [campo]: valor }))}
      cambiarEnfermedad={() => {}}
      cambiarControl={(campo, valor) => setControl((c) => ({ ...c, [campo]: valor }))}
      elegirGrado={() => {}}
      error={(campo) => errores[campo] ?? null}
      tocar={() => {}}
      irAFicha={() => {}}
      cinta={cinta}
      onCinta={setCinta}
    />
  );
}

const figura = (variante: "sola" | "con-rotulos") => document.querySelector<SVGSVGElement>(`svg[data-figura="${variante}"]`)!;
const cintaEn = (variante: "sola" | "con-rotulos", cinta: Cinta) => figura(variante).querySelector<SVGGElement>(`[data-cinta="${cinta}"]`)!;
const estados = (variante: "sola" | "con-rotulos") =>
  Object.fromEntries(Array.from(figura(variante).querySelectorAll<SVGGElement>("[data-cinta]")).map((g) => [g.dataset.cinta, g.dataset.estado]));
const valorDelRotulo = (cinta: Cinta) => figura("con-rotulos").querySelector(`[data-rotulo="${cinta}"] [data-valor]`)?.textContent;
const campo = (cinta: Cinta) => document.getElementById(`ev-${cinta}`) as HTMLInputElement;

describe("evaluación, etapa 2 (Medidas)", () => {
  it("los campos van como el cuerpo: la fecha y después Pecho, Cintura, Cadera (también al tabular)", () => {
    render(<Medidas />);
    const ids = Array.from(document.querySelectorAll("input")).map((e) => e.id);
    expect(ids).toEqual(["ev-fecha", "ev-pecho", "ev-cintura", "ev-cadera"]);
    // Nadie fuerza otro orden de tabulación.
    expect(document.querySelector("[tabindex]")).toBeNull();
    // Las etiquetas, en el mismo orden.
    expect(screen.getByLabelText("Pecho")).toBe(campo("pecho"));
    expect(screen.getByLabelText("Cintura")).toBe(campo("cintura"));
    expect(screen.getByLabelText("Cadera")).toBe(campo("cadera"));
  });

  it("todo abre vacío: las tres cintas vacías y los rótulos con «—»", () => {
    render(<Medidas />);
    for (const c of ["pecho", "cintura", "cadera"] as const) expect(campo(c)).toHaveValue("");
    expect(estados("sola")).toEqual({ pecho: "vacia", cintura: "vacia", cadera: "vacia" });
    expect(estados("con-rotulos")).toEqual({ pecho: "vacia", cintura: "vacia", cadera: "vacia" });
    expect(valorDelRotulo("pecho")).toBe("—");
    // La figura del teléfono no lleva rótulos.
    expect(figura("sola").querySelector("[data-rotulo]")).toBeNull();
  });

  it("con el foco en un campo, su cinta queda activa (resaltada); al salir, ya no", () => {
    render(<Medidas />);
    act(() => campo("cintura").focus());
    for (const v of ["sola", "con-rotulos"] as const) {
      expect(cintaEn(v, "cintura")).toHaveAttribute("data-resaltada", "true");
      expect(estados(v)).toEqual({ pecho: "vacia", cintura: "activa", cadera: "vacia" });
    }
    act(() => campo("cintura").blur());
    expect(document.querySelector("[data-resaltada]")).toBeNull();
  });

  it("un valor escrito deja la cinta «cargada» y el rótulo dice el número tal como se escribió", () => {
    render(<Medidas />);
    act(() => campo("pecho").focus());
    fireEvent.change(campo("pecho"), { target: { value: "92" } });
    // Mientras se escribe, la cinta sigue activa y el rótulo ya muestra el número.
    expect(estados("con-rotulos").pecho).toBe("activa");
    expect(valorDelRotulo("pecho")).toBe("92 cm");
    act(() => campo("pecho").blur());
    expect(estados("sola")).toEqual({ pecho: "cargada", cintura: "vacia", cadera: "vacia" });
    expect(estados("con-rotulos")).toEqual({ pecho: "cargada", cintura: "vacia", cadera: "vacia" });
    expect(valorDelRotulo("pecho")).toBe("92 cm");

    // Con coma, como queda al salir del campo.
    fireEvent.change(campo("cintura"), { target: { value: "74.50" } });
    fireEvent.blur(campo("cintura"));
    expect(campo("cintura")).toHaveValue("74,5");
    expect(valorDelRotulo("cintura")).toBe("74,5 cm");
    expect(estados("con-rotulos").cintura).toBe("cargada");
  });

  it("tocar una cinta, o su rótulo, lleva el foco a su campo (y la marca activa)", () => {
    render(<Medidas />);
    const [franjaCinta, franjaRotulo] = Array.from(cintaEn("con-rotulos", "cadera").querySelectorAll("rect"));
    fireEvent.click(franjaCinta);
    expect(document.activeElement).toBe(campo("cadera"));
    expect(estados("con-rotulos").cadera).toBe("activa");

    fireEvent.click(cintaEn("sola", "pecho").querySelector("rect")!);
    expect(document.activeElement).toBe(campo("pecho"));
    expect(estados("sola")).toEqual({ pecho: "activa", cintura: "vacia", cadera: "vacia" });

    fireEvent.click(franjaRotulo);
    expect(document.activeElement).toBe(campo("cadera"));
  });

  it("tocar la figura no le saca el foco al campo antes de tiempo (pasa derecho al de la cinta)", () => {
    render(<Medidas />);
    act(() => campo("pecho").focus());
    // `fireEvent` devuelve false cuando la figura frenó lo que hace el navegador al apretar (sacar el foco).
    expect(fireEvent.mouseDown(cintaEn("con-rotulos", "cintura").querySelector("rect")!)).toBe(false);
  });

  it("la figura es decorativa: escondida para el lector de pantalla y sin paradas de tabulación", () => {
    render(<Medidas />);
    for (const v of ["sola", "con-rotulos"] as const) {
      expect(figura(v)).toHaveAttribute("aria-hidden", "true");
      expect(figura(v).querySelector("a, button, [tabindex]")).toBeNull();
    }
  });

  it("en el hombre, los rótulos de cintura y cadera (cintas a 39 de distancia) no se pisan", () => {
    render(<Medidas sexo="M" />);
    const altura = (c: Cinta) => Number(figura("con-rotulos").querySelector(`[data-rotulo="${c}"] [data-valor]`)!.getAttribute("y"));
    // El valor ocupa unos 14 de alto y el nombre de arriba otros 10: entre rótulos, al menos 46.
    expect(altura("cadera") - altura("cintura")).toBeGreaterThanOrEqual(46);
    expect(altura("cintura") - altura("pecho")).toBeGreaterThanOrEqual(46);
  });

  it("un valor larguísimo no se sale del rótulo: se corta", () => {
    render(<Medidas />);
    fireEvent.change(campo("cadera"), { target: { value: "1234567890" } });
    expect(valorDelRotulo("cadera")).toBe("12345… cm");
  });

  it("el error del campo se muestra como siempre y la figura sigue ahí", () => {
    render(<Medidas errores={{ cinturaCm: "Entre 30 y 250 cm" }} />);
    expect(screen.getByText("Entre 30 y 250 cm")).toBeInTheDocument();
    expect(campo("cintura")).toHaveAttribute("aria-invalid", "true");
    expect(figura("con-rotulos")).toBeInTheDocument();
  });

  it("sin sexo elegido, se elige ahí mismo (Mujer / Hombre) y aparece la figura", () => {
    render(<Medidas sexo="" />);
    expect(document.querySelector("svg[data-figura]")).toBeNull();
    const grupo = screen.getByRole("radiogroup", { name: "Sexo del paciente" });
    expect(grupo).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Hombre" }));
    expect(figura("con-rotulos")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
