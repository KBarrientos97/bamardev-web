import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Modal } from "./ui";
import VisorFotos from "./VisorFotos";

/**
 * L4 (28-oct) · el visor de fotos: pantalla completa, X, Esc y tocar afuera
 * cierran; flechas y deslizar pasan; zoom y giro; y su Esc no cierra el
 * panel o el modal de abajo.
 */

const FOTOS = [
  { url: "blob:cara", titulo: "Foto del estudiante" },
  { url: "blob:anverso", titulo: "Carnet (anverso)" },
  { url: "blob:reverso", titulo: "Carnet (reverso)" },
];

// jsdom no trae PointerEvent: sin él, `clientX` no llega al gesto de deslizar.
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    class PunteroDePrueba extends MouseEvent {
      pointerId: number;
      constructor(tipo: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(tipo, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PunteroDePrueba;
  }
});

const visor = () => screen.getByRole("dialog", { name: /· Ana Quispe/ });
const imagen = () => screen.getByRole("img");

describe("VisorFotos", () => {
  it("abre en la foto tocada, a pantalla completa y por encima de los modales", () => {
    render(<VisorFotos fotos={FOTOS} inicial={1} titulo="Ana Quispe" onCerrar={vi.fn()} />);
    expect(visor()).toHaveAttribute("aria-modal", "true");
    expect(visor()).toHaveClass("fixed", "inset-0", "z-[60]");
    expect(imagen()).toHaveAttribute("src", "blob:anverso");
    expect(visor()).toHaveTextContent("2 de 3");
  });

  it("las flechas del teclado y los botones pasan de foto, y dan la vuelta", () => {
    render(<VisorFotos fotos={FOTOS} titulo="Ana Quispe" onCerrar={vi.fn()} />);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(imagen()).toHaveAttribute("src", "blob:anverso");
    fireEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(imagen()).toHaveAttribute("src", "blob:reverso");
    fireEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(imagen()).toHaveAttribute("src", "blob:cara");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(imagen()).toHaveAttribute("src", "blob:reverso");
  });

  it("deslizar a la izquierda pasa a la siguiente; un toque corto no", () => {
    render(<VisorFotos fotos={FOTOS} titulo="Ana Quispe" onCerrar={vi.fn()} />);
    const escenario = screen.getByTestId("visor-escenario");
    fireEvent.pointerDown(escenario, { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(escenario, { clientX: 290, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(escenario, { clientX: 290, clientY: 200, pointerId: 1 });
    expect(imagen()).toHaveAttribute("src", "blob:cara");
    fireEvent.pointerDown(escenario, { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(escenario, { clientX: 200, clientY: 205, pointerId: 1 });
    fireEvent.pointerUp(escenario, { clientX: 180, clientY: 205, pointerId: 1 });
    expect(imagen()).toHaveAttribute("src", "blob:anverso");
  });

  it("acerca con doble clic, con los botones y con la rueda; gira de a 90°", () => {
    render(<VisorFotos fotos={FOTOS} titulo="Ana Quispe" onCerrar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Alejar" })).toBeDisabled();
    fireEvent.doubleClick(imagen());
    expect(imagen().style.transform).toContain("scale(2.5)");
    fireEvent.doubleClick(imagen());
    expect(imagen().style.transform).toContain("scale(1)");
    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    expect(imagen().style.transform).toContain("scale(1.25)");
    fireEvent.wheel(screen.getByTestId("visor-escenario"), { deltaY: -100 });
    expect(imagen().style.transform).toContain("scale(1.5625)");
    fireEvent.click(screen.getByRole("button", { name: "Girar" }));
    expect(imagen().style.transform).toContain("rotate(90deg)");
    fireEvent.click(screen.getByRole("button", { name: "Girar" }));
    expect(imagen().style.transform).toContain("rotate(180deg)");
    // La foto siguiente arranca entera y derecha.
    fireEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(imagen().style.transform).toContain("scale(1)");
    expect(imagen().style.transform).toContain("rotate(0deg)");
  });

  it("la X y tocar afuera cierran; tocar la foto no", () => {
    const cerrar = vi.fn();
    render(<VisorFotos fotos={FOTOS} titulo="Ana Quispe" onCerrar={cerrar} />);
    fireEvent.click(imagen());
    expect(cerrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(cerrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("visor-escenario"));
    expect(cerrar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(cerrar).toHaveBeenCalledTimes(2);
  });

  it("Esc cierra el visor y no el modal de abajo", () => {
    const cerrarModal = vi.fn();
    function Pantalla() {
      const [abierto, setAbierto] = useState(true);
      return (
        <Modal abierto titulo="Ficha" onClose={cerrarModal}>
          {abierto && <VisorFotos fotos={FOTOS} titulo="Ana Quispe" onCerrar={() => setAbierto(false)} />}
        </Modal>
      );
    }
    render(<Pantalla />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /· Ana Quispe/ })).not.toBeInTheDocument();
    expect(cerrarModal).not.toHaveBeenCalled();
    // Sin el visor, Esc vuelve a ser del modal.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cerrarModal).toHaveBeenCalledTimes(1);
  });

  it("una foto que no cargó lo dice, sin imagen rota", () => {
    render(<VisorFotos fotos={[{ url: null, titulo: "Foto del estudiante" }]} titulo="Ana Quispe" onCerrar={vi.fn()} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Esta foto no se pudo cargar.")).toBeInTheDocument();
    // Con una sola foto no hay flechas.
    expect(screen.queryByRole("button", { name: "Foto siguiente" })).not.toBeInTheDocument();
  });
});
