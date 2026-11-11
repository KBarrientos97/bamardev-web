import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TirarParaActualizar from "./TirarParaActualizar";

/** Tirar para abajo con el scroll arriba actualiza; un scroll común no (10-nov). */

function montar() {
  const onActualizar = vi.fn();
  render(
    <TirarParaActualizar onActualizar={onActualizar} className="h-40">
      <p>las mesas</p>
    </TirarParaActualizar>,
  );
  const caja = screen.getByText("las mesas").parentElement!;
  return { onActualizar, caja };
}

function tirar(caja: HTMLElement, dy: number) {
  fireEvent.touchStart(caja, { touches: [{ clientX: 100, clientY: 100 }] });
  for (const paso of [10, dy / 2, dy]) fireEvent.touchMove(caja, { touches: [{ clientX: 100, clientY: 100 + paso }] });
  fireEvent.touchEnd(caja, { touches: [] });
}

describe("tirar para actualizar", () => {
  it("tirar lo bastante actualiza y muestra la ruedita", () => {
    const { onActualizar, caja } = montar();
    tirar(caja, 200);
    expect(onActualizar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "Actualizando" })).toBeInTheDocument();
  });

  it("un tirón corto no actualiza", () => {
    const { onActualizar, caja } = montar();
    tirar(caja, 60);
    expect(onActualizar).not.toHaveBeenCalled();
  });

  it("con la lista scrolleada para abajo es un scroll común", () => {
    const { onActualizar, caja } = montar();
    caja.scrollTop = 50;
    tirar(caja, 200);
    expect(onActualizar).not.toHaveBeenCalled();
  });
});
