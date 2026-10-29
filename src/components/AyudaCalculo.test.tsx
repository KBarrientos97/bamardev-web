import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AyudaCalculo } from "./AyudaCalculo";

/** "Cómo se calcula" (L5, 28-oct): un solo botón para todos los reportes. */
describe("AyudaCalculo", () => {
  const ayuda = {
    queMuestra: "Cuánto se cobró en clases.",
    deDonde: "Suma las cuotas cobradas en el período.",
    incluye: ["Los abonos."],
    noIncluye: ["Las poleras."],
  };

  it("abre el diálogo con qué muestra, de dónde sale y qué incluye o no; se cierra con Entendido", () => {
    render(<AyudaCalculo titulo="Cobrado por clases" ayuda={ayuda} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cómo se calcula: Cobrado por clases" }));
    const dialogo = screen.getByRole("dialog", { name: "Cómo se calcula" });
    expect(within(dialogo).getByText("Cobrado por clases")).toBeInTheDocument();
    expect(within(dialogo).getByText("Cuánto se cobró en clases.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Suma las cuotas cobradas en el período.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Los abonos.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Las poleras.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin listas no dibuja Incluye ni No incluye; compacto es sólo el ícono, con el nombre accesible", () => {
    render(<AyudaCalculo titulo="Morosidad" ayuda={{ queMuestra: "Quién debe hoy.", deDonde: "El semáforo del docente." }} compacto />);
    const boton = screen.getByRole("button", { name: "Cómo se calcula: Morosidad" });
    expect(boton).not.toHaveTextContent("Cómo se calcula");
    fireEvent.click(boton);
    expect(screen.queryByText("Incluye")).not.toBeInTheDocument();
    expect(screen.queryByText("No incluye")).not.toBeInTheDocument();
  });
});
