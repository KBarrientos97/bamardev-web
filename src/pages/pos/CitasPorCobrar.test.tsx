import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cita } from "../../test/agendaFixtures";
import CitasPorCobrar from "./CitasPorCobrar";

/** Belleza: las citas terminadas que esperan cobro en el POS. */
describe("Citas por cobrar", () => {
  const props = {
    cargando: false,
    error: "",
    onReintentar: vi.fn(),
    onAtras: vi.fn(),
    cobrandoId: null,
  };

  it("lista cada cita con servicio, profesional y total, y la cobra", () => {
    const onCobrar = vi.fn();
    const c = cita({ id: 4, estado: "POR_COBRAR" });
    render(<CitasPorCobrar {...props} citas={[c]} onCobrar={onCobrar} />);
    expect(screen.getByText("1 cita esperando")).toBeInTheDocument();
    expect(screen.getByText("Corte dama · Carla R.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar la cita de Rosa Mamani" }));
    expect(onCobrar).toHaveBeenCalledWith(c);
  });

  it("mientras carga una al carrito, no deja tocar otra", () => {
    render(
      <CitasPorCobrar {...props} cobrandoId={4} citas={[cita({ id: 4 }), cita({ id: 5 })]} onCobrar={vi.fn()} />,
    );
    for (const b of screen.getAllByRole("button", { name: /Cobrar la cita/ })) expect(b).toBeDisabled();
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("sin citas lo dice", () => {
    render(<CitasPorCobrar {...props} citas={[]} onCobrar={vi.fn()} />);
    expect(screen.getByText("No hay citas terminadas sin cobrar.")).toBeInTheDocument();
  });
});
