import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuscadorPacientes } from "./piezas";

/**
 * El buscador de Evaluación y Seguimiento (Kevin, 26-nov: «cada vez que
 * ingreso se abre el teclado… si desea buscar, que presione el buscador»).
 * En la PC el foco va solo al entrar, como siempre; con el dedo, no.
 */

/** El teléfono o la tablet: pantalla sólo táctil, sin mouse. */
const conDedo = () =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(hover: none) and (pointer: coarse)", media: q, addEventListener() {}, removeEventListener() {} }));

afterEach(() => vi.unstubAllGlobals());

function Buscador() {
  const [q, setQ] = useState("");
  return <BuscadorPacientes valor={q} onCambiar={setQ} />;
}
// El rótulo envuelve también la tecla «/» (o la ✕): el nombre empieza así.
const campo = () => screen.getByRole("textbox", { name: /^Buscar por carnet o nombre/ });

describe("BuscadorPacientes y el foco", () => {
  it("en la PC (sin `matchMedia`) toma el foco al entrar", () => {
    render(<Buscador />);
    expect(campo()).toHaveFocus();
  });

  it("con el dedo NO toma el foco al entrar (el teclado no sube solo)", () => {
    conDedo();
    render(<Buscador />);
    expect(campo()).not.toHaveFocus();
  });

  it("con el dedo, la ✕ devuelve el foco al campo: ya se estaba escribiendo ahí", () => {
    conDedo();
    render(<Buscador />);
    fireEvent.change(campo(), { target: { value: "Lucía" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(campo()).toHaveValue("");
    expect(campo()).toHaveFocus();
  });
});
