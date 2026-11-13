import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CampoSugerido from "./CampoSugerido";

/**
 * El combo de la forma farmacéutica y el laboratorio (12-nov). Reemplaza al
 * `<datalist>`, que Chrome dibujaba como una lista negra suelta y que no
 * filtraba sin tildes. Sigue siendo texto libre: lo que no está se escribe.
 */

const FORMAS = ["Comprimido", "Comprimido recubierto", "Cápsula", "Jarabe", "Solución"];

function Probar({ inicial = "", sugerencias = FORMAS }: { inicial?: string; sugerencias?: string[] }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <label htmlFor="forma">Forma</label>
      <CampoSugerido id="forma" valor={valor} onChange={setValor} sugerencias={sugerencias} etiquetaLista="Formas" />
      <output data-testid="valor">{valor}</output>
    </>
  );
}

const campo = () => screen.getByRole("combobox", { name: "Forma" });
const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });
const opciones = () => screen.queryAllByRole("option").map((o) => o.textContent);
const valor = () => screen.getByTestId("valor").textContent;

describe("CampoSugerido: atajos con el trazo de la app, texto libre", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filtra sin tildes ni mayúsculas: «capsula» encuentra «Cápsula»", () => {
    render(<Probar />);
    escribir("CAPSULA");
    expect(opciones()).toEqual(["Cápsula"]);
  });

  it("lo que empieza así va primero, y después lo que lo contiene", () => {
    render(<Probar sugerencias={["Solución inyectable", "Inyectable", "Ampolla"]} />);
    escribir("inyect");
    expect(opciones()).toEqual(["Inyectable", "Solución inyectable"]);
  });

  it("resalta lo que coincide, con la tilde del original", () => {
    render(<Probar />);
    escribir("solucion");
    // `posicionDe` mide sobre el texto original: la marca no se corre.
    expect(screen.getByRole("option").querySelector("strong")?.textContent).toBe("Solución");
  });

  it("no se abre sola al recibir el foco, sí al tocarlo", () => {
    // Como `ElegirArticulo`: el foco llega solo (al abrir el modal) y una
    // lista que aparece ahí tapa el campo donde iba el clic siguiente.
    render(<Probar />);
    fireEvent.focus(campo());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(campo());
    expect(screen.getByRole("listbox", { name: "Formas" })).toBeInTheDocument();
    expect(campo()).toHaveAttribute("aria-expanded", "true");
  });

  it("con las flechas se marca y con Enter se elige", () => {
    render(<Probar />);
    escribir("comp");
    // Al escribir queda marcada la primera; una flecha pasa a la segunda.
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    // El lector de pantalla sigue al marcado sin mover el foco del campo.
    const marcada = screen.getByRole("option", { selected: true });
    expect(marcada).toHaveTextContent("Comprimido recubierto");
    expect(campo()).toHaveAttribute("aria-activedescendant", marcada.id);

    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(valor()).toBe("Comprimido recubierto");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("flecha arriba desde nada marcado va a la última", () => {
    render(<Probar />);
    escribir("comp");
    fireEvent.keyDown(campo(), { key: "ArrowUp" });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Comprimido recubierto");
  });

  it("tocar una opción la elige", () => {
    render(<Probar />);
    escribir("ja");
    fireEvent.click(screen.getByRole("option", { name: "Jarabe" }));
    expect(valor()).toBe("Jarabe");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("al escribir queda marcada la primera opción y Enter la elige", () => {
    // 12-nov: "in" + Enter dejaba un laboratorio "in" con INTI a la vista.
    render(<Probar sugerencias={["INTI", "IFA"]} />);
    escribir("in");
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(valor()).toBe("INTI");
  });

  it("texto libre: lo que no coincide con nada queda como se escribió", () => {
    render(<Probar sugerencias={["Jarabe"]} />);
    escribir("Polvo efervescente");
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(valor()).toBe("Polvo efervescente");
  });

  it("texto libre: Esc cierra la lista y Enter deja lo escrito aunque se parezca a una opción", () => {
    // "Jarabe pediátrico" no tiene por qué volverse "Jarabe pediátrico
    // infantil": la opción marcada se ve, y Esc la descarta.
    render(<Probar sugerencias={["Jarabe", "Jarabe pediátrico infantil"]} />);
    escribir("Jarabe pediátrico");
    fireEvent.keyDown(campo(), { key: "Escape" });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(valor()).toBe("Jarabe pediátrico");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("lo escrito que ya está en la lista con otra escritura toma la de la lista al salir", () => {
    // El datalist dejaba cargar el mismo laboratorio de tres maneras.
    render(<Probar />);
    escribir("capsula");
    fireEvent.blur(campo());
    expect(valor()).toBe("Cápsula");
  });

  it("lo que no está en la lista no se toca al salir", () => {
    render(<Probar />);
    escribir("Polvo para suspensión ");
    fireEvent.blur(campo());
    expect(valor()).toBe("Polvo para suspensión ");
  });

  it("clic afuera (el campo pierde el foco) cierra la lista", () => {
    render(<Probar />);
    escribir("comp");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.blur(campo());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("tocar la lista no le saca el foco al campo", () => {
    // El mousedown se frena: si no, el blur cerraba la lista antes de que el
    // toque llegara a la opción.
    render(<Probar />);
    escribir("comp");
    const evento = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByRole("option", { name: "Comprimido" }).dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });

  it("Escape cierra la lista y no le llega al modal (que cerraría el alta)", () => {
    const alModal = vi.fn();
    document.addEventListener("keydown", alModal);
    try {
      render(<Probar />);
      escribir("comp");
      fireEvent.keyDown(campo(), { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(alModal).not.toHaveBeenCalled();

      // Con la lista ya cerrada, Escape es del modal otra vez.
      fireEvent.keyDown(campo(), { key: "Escape" });
      expect(alModal).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", alModal);
    }
  });

  it("sin nada que coincida no muestra una lista vacía", () => {
    render(<Probar />);
    escribir("zzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(campo()).toHaveAttribute("aria-expanded", "false");
  });

  it("dentro de un diálogo la lista queda en el diálogo (para el lector, por el aria-modal)", () => {
    render(
      <div role="dialog" aria-modal="true" aria-label="Alta">
        <Probar />
      </div>,
    );
    escribir("comp");
    expect(screen.getByRole("dialog").contains(screen.getByRole("listbox"))).toBe(true);
  });
});
