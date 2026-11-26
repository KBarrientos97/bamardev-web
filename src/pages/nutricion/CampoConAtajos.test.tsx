import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ATAJOS } from "../../lib/nutricion/respuestas";
import CampoConAtajos from "./CampoConAtajos";

/**
 * Un campo de la ficha con atajos (25-nov): el texto es uno solo; los
 * botones y la nota lo arman. Nada viene elegido, la nota está siempre y
 * mientras se escribe no se recorta ni se reinterpreta nada.
 */

/** El campo con su estado, como lo tiene la evaluación; `alCambiar` ve cada texto que sale. */
function Campo({ inicial = "", alCambiar = () => {}, multilinea = false }: { inicial?: string; alCambiar?: (t: string) => void; multilinea?: boolean }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <CampoConAtajos
        id="ev-cirugias"
        label="Cirugías"
        opciones={ATAJOS.cirugias}
        multilinea={multilinea}
        placeholder="¿Cuál y cuándo?"
        valor={valor}
        onCambiar={(t) => {
          setValor(t);
          alCambiar(t);
        }}
      />
      <output data-testid="texto">{valor}</output>
      {/* Lo que llega de afuera: abrir otro paciente. */}
      <button type="button" onClick={() => setValor("no, nunca")}>
        Cargar otro
      </button>
    </>
  );
}

const grupo = () => screen.getByRole("group", { name: "Cirugías: respuesta rápida" });
const atajo = (nombre: string) => within(grupo()).getByRole("button", { name: nombre });
const nota = () => screen.getByLabelText("Cirugías");
const texto = () => screen.getByTestId("texto").textContent;

describe("campo con atajos", () => {
  it("abre vacío: ningún atajo elegido y la nota habilitada", () => {
    render(<Campo />);
    for (const b of within(grupo()).getAllByRole("button")) {
      expect(b).toHaveAttribute("type", "button");
      expect(b).toHaveAttribute("aria-pressed", "false");
    }
    expect(nota()).toHaveValue("");
    expect(nota()).toBeEnabled();
    expect(nota()).toHaveAttribute("placeholder", "¿Cuál y cuándo?");
    expect(nota()).toHaveAttribute("maxLength", "1950");
  });

  it("tocar un atajo lo elige; otro lo cambia; el elegido otra vez lo apaga", () => {
    const alCambiar = vi.fn();
    render(<Campo alCambiar={alCambiar} />);
    fireEvent.click(atajo("Sí"));
    expect(atajo("Sí")).toHaveAttribute("aria-pressed", "true");
    expect(texto()).toBe("Sí");
    fireEvent.click(atajo("No"));
    expect(atajo("Sí")).toHaveAttribute("aria-pressed", "false");
    expect(atajo("No")).toHaveAttribute("aria-pressed", "true");
    expect(texto()).toBe("No");
    fireEvent.click(atajo("No"));
    expect(atajo("No")).toHaveAttribute("aria-pressed", "false");
    expect(texto()).toBe("");
    expect(alCambiar.mock.calls.map((c) => c[0])).toEqual(["Sí", "No", ""]);
  });

  it("el atajo y la nota hacen un texto; apagar el atajo deja la nota", () => {
    render(<Campo multilinea />);
    expect(nota().tagName).toBe("TEXTAREA");
    fireEvent.click(atajo("Sí"));
    fireEvent.change(nota(), { target: { value: "cesárea (2019)" } });
    expect(texto()).toBe("Sí: cesárea (2019)");
    fireEvent.click(atajo("Sí"));
    expect(texto()).toBe("cesárea (2019)");
    expect(nota()).toHaveValue("cesárea (2019)");
  });

  it("mientras se escribe no se recorta nada: el espacio al final de una palabra se queda", () => {
    render(<Campo />);
    fireEvent.click(atajo("Sí"));
    fireEvent.change(nota(), { target: { value: "cesárea " } });
    expect(nota()).toHaveValue("cesárea ");
    expect(texto()).toBe("Sí: cesárea ");
    fireEvent.change(nota(), { target: { value: " " } });
    expect(nota()).toHaveValue(" ");
  });

  it("escribir «No» en la nota sin atajo no enciende el botón a mitad de palabra", () => {
    render(<Campo />);
    fireEvent.change(nota(), { target: { value: "No" } });
    expect(atajo("No")).toHaveAttribute("aria-pressed", "false");
    expect(nota()).toHaveValue("No");
    fireEvent.change(nota(), { target: { value: "No, nunca" } });
    expect(nota()).toHaveValue("No, nunca");
    expect(texto()).toBe("No, nunca");
  });

  it("un texto guardado se lee con su atajo; uno viejo sin atajo queda todo como nota", () => {
    const { unmount } = render(<Campo inicial="Sí: cesárea (2019)" />);
    expect(atajo("Sí")).toHaveAttribute("aria-pressed", "true");
    expect(nota()).toHaveValue("cesárea (2019)");
    unmount();
    render(<Campo inicial="Apendicitis 2015" />);
    expect(atajo("Sí")).toHaveAttribute("aria-pressed", "false");
    expect(atajo("No")).toHaveAttribute("aria-pressed", "false");
    expect(nota()).toHaveValue("Apendicitis 2015");
  });

  it("lo que llega de afuera se vuelve a leer", () => {
    render(<Campo inicial="Sí" />);
    fireEvent.click(screen.getByRole("button", { name: "Cargar otro" }));
    expect(atajo("No")).toHaveAttribute("aria-pressed", "true");
    expect(atajo("Sí")).toHaveAttribute("aria-pressed", "false");
    expect(nota()).toHaveValue("nunca");
  });

  it("tocar un atajo no le saca el foco a la nota", () => {
    render(<Campo />);
    nota().focus();
    fireEvent.click(atajo("Sí"));
    expect(nota()).toHaveFocus();
  });
});
