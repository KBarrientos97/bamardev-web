import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PanelLateral from "./PanelLateral";

/**
 * Ronda 1 (W4, W5): con un panel encima de otro Escape cierra sólo el de
 * arriba, y en el celular un panel con formulario no se cierra al tocar afuera.
 */

afterEach(() => vi.unstubAllGlobals());

describe("PanelLateral · Escape en escritorio (W5)", () => {
  function Dos({ alCerrarA, alCerrarB }: { alCerrarA: () => void; alCerrarB: () => void }) {
    const [b, setB] = useState(false);
    return (
      <>
        <PanelLateral abierto titulo="Sede" onClose={alCerrarA}>
          <button onClick={() => setB(true)}>abrir aula</button>
        </PanelLateral>
        {b && (
          <PanelLateral abierto titulo="Aula" onClose={alCerrarB}>
            <p>formulario</p>
          </PanelLateral>
        )}
      </>
    );
  }

  it("con dos paneles apilados, Escape cierra el de arriba y no el de abajo", () => {
    const a = vi.fn();
    const b = vi.fn();
    render(<Dos alCerrarA={a} alCerrarB={b} />);
    fireEvent.click(screen.getByRole("button", { name: "abrir aula" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it("ronda 2 · B2: si el de abajo se vuelve a dibujar con un callback en línea, Escape sigue cerrando el de arriba", () => {
    const a = vi.fn();
    const b = vi.fn();
    // La sede tiene su propio estado (un aviso que vence, una respuesta que llega) y se redibuja
    // sola, con una función nueva en cada vuelta; el aula, que está encima, no se entera.
    function Sede({ alAbrirAula }: { alAbrirAula: () => void }) {
      const [vuelta, setVuelta] = useState(0);
      return (
        <PanelLateral abierto titulo="Sede" onClose={() => a(vuelta)}>
          <button onClick={alAbrirAula}>abrir aula</button>
          <button onClick={() => setVuelta((v) => v + 1)}>re-render sede</button>
        </PanelLateral>
      );
    }
    function Pantalla() {
      const [aula, setAula] = useState(false);
      return (
        <>
          <Sede alAbrirAula={() => setAula(true)} />
          {aula && (
            <PanelLateral abierto titulo="Aula" onClose={b}>
              <p>formulario</p>
            </PanelLateral>
          )}
        </>
      );
    }
    render(<Pantalla />);
    fireEvent.click(screen.getByRole("button", { name: "abrir aula" }));
    fireEvent.click(screen.getByRole("button", { name: "re-render sede" }));
    fireEvent.keyDown(document, { key: "Escape" });
    // Cierra el aula (la de arriba), y la sede sigue abierta con lo tipeado.
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it("un panel solo se sigue cerrando con Escape", () => {
    const a = vi.fn();
    render(<Dos alCerrarA={a} alCerrarB={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe("PanelLateral · toque afuera en el celular (W4)", () => {
  const celular = () => vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("767"), addEventListener: () => {}, removeEventListener: () => {} }));

  it("con formulario (cerrarAlClicAfuera=false) no se cierra al tocar el velo", () => {
    celular();
    const cerrar = vi.fn();
    render(
      <PanelLateral abierto titulo="Nueva sede" onClose={cerrar} cerrarAlClicAfuera={false}>
        <input aria-label="Nombre" />
      </PanelLateral>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(cerrar).not.toHaveBeenCalled();
  });

  it("sin la opción, tocar el velo lo cierra como siempre", () => {
    celular();
    const cerrar = vi.fn();
    render(
      <PanelLateral abierto titulo="Detalle" onClose={cerrar}>
        <p>algo</p>
      </PanelLateral>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});

describe("PanelLateral · foco en escritorio (ronda 2, B8)", () => {
  function ConFila({ conCampo = false }: { conCampo?: boolean }) {
    const [abierto, setAbierto] = useState(false);
    return (
      <>
        <button onClick={() => setAbierto(true)}>fila</button>
        <PanelLateral abierto={abierto} titulo="Detalle" onClose={() => setAbierto(false)}>
          {conCampo ? <input aria-label="Nombre" autoFocus /> : <p>algo</p>}
        </PanelLateral>
      </>
    );
  }

  it("al abrirse recibe el foco y al cerrarse se lo devuelve a lo que lo abrió", () => {
    render(<ConFila />);
    const fila = screen.getByRole("button", { name: "fila" });
    fila.focus();
    fireEvent.click(fila);
    expect(screen.getByRole("complementary", { name: "Detalle" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(fila).toHaveFocus();
  });

  it("si adentro hay un campo con autoFocus, no se lo quita", () => {
    render(<ConFila conCampo />);
    fireEvent.click(screen.getByRole("button", { name: "fila" }));
    expect(screen.getByLabelText("Nombre")).toHaveFocus();
  });
});

