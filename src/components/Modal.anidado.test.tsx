import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { Modal } from "./ui";

/**
 * Un modal abierto desde adentro de otro (Reportes › Arqueo del turno ›
 * Productos vendidos, 11-nov). Se dibujaba dentro del panel del primero y ese
 * panel lo recortaba: en la compu salía angosto y sin título, en el celular
 * una hoja sin cabecera. Ahora todo modal va al <body>, donde el marco es la
 * pantalla.
 */

function DosModales() {
  const [segundo, setSegundo] = useState(false);
  return (
    <Modal abierto titulo="Arqueo del turno" onClose={() => {}}>
      <button type="button" onClick={() => setSegundo(true)}>
        Productos vendidos
      </button>
      {segundo && (
        <Modal abierto titulo="Productos vendidos" onClose={() => setSegundo(false)}>
          <p>Cuarto de pollo</p>
        </Modal>
      )}
    </Modal>
  );
}

describe("un modal abierto desde otro modal", () => {
  it("no queda dentro del panel del primero: los dos cuelgan del cuerpo de la página", () => {
    const { container } = render(<DosModales />);
    fireEvent.click(screen.getByText("Productos vendidos"));
    const arqueo = screen.getByRole("dialog", { name: "Arqueo del turno" });
    const productos = screen.getByRole("dialog", { name: "Productos vendidos" });
    expect(arqueo).not.toContainElement(productos);
    expect(productos).toHaveTextContent("Cuarto de pollo");
    // Ninguno vive donde se escribió: el marco de un `fixed` es la pantalla.
    expect(container).not.toContainElement(arqueo);
    expect(container).not.toContainElement(productos);
  });

  it("cerrar el segundo deja el primero en su lugar", () => {
    render(<DosModales />);
    fireEvent.click(screen.getByText("Productos vendidos"));
    fireEvent.click(screen.getAllByLabelText("Cerrar")[1]);
    expect(screen.queryByRole("dialog", { name: "Productos vendidos" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Arqueo del turno" })).toBeInTheDocument();
  });

  it("cerrado, no deja nada en el cuerpo de la página", () => {
    const { unmount } = render(
      <Modal abierto titulo="Uno" onClose={() => {}}>
        <p>hola</p>
      </Modal>,
    );
    unmount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
