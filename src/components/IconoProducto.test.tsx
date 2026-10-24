import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IconoProducto from "./IconoProducto";

describe("IconoProducto", () => {
  it("con un ícono conocido dibuja la imagen", () => {
    const { container } = render(<IconoProducto nombre="Cuarto de pollo" icono="cuarto_pollo_broaster" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByText("CP")).toBeNull();
  });

  it("sin ícono, las iniciales", () => {
    const { container } = render(<IconoProducto nombre="Cuarto de pollo" icono={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("CP")).toBeInTheDocument();
  });

  it("si la imagen no carga (sin internet), pasa a las iniciales", () => {
    const { container } = render(<IconoProducto nombre="Cuarto de pollo" icono="cuarto_pollo_broaster" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("CP")).toBeInTheDocument();
  });

  it("si después le ponen otro ícono, lo vuelve a intentar", () => {
    const { container, rerender } = render(
      <IconoProducto nombre="Cuarto de pollo" icono="cuarto_pollo_broaster" />,
    );
    fireEvent.error(container.querySelector("img")!);
    rerender(<IconoProducto nombre="Cuarto de pollo" icono="medio_pollo_broaster" />);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
