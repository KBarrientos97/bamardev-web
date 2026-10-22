import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recarga, useActualizarAlNavegar } from "./actualizarAlNavegar";
import { reiniciarEstadoPwa } from "./pwa";

let ir: (a: string) => void = () => {};

function Prueba() {
  useActualizarAlNavegar();
  const navigate = useNavigate();
  ir = navigate;
  return null;
}

const montar = () =>
  render(
    <MemoryRouter initialEntries={["/pos"]}>
      <Prueba />
    </MemoryRouter>,
  );

describe("useActualizarAlNavegar", () => {
  let recargo: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    reiniciarEstadoPwa();
    recargo = vi.spyOn(recarga, "ahora").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sin versión nueva, cambiar de pantalla no recarga", () => {
    montar();
    act(() => ir("/reportes"));
    expect(recargo).not.toHaveBeenCalled();
  });

  it("con versión nueva, no recarga en la pantalla en la que está", () => {
    montar();
    act(() => reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() }));
    expect(recargo).not.toHaveBeenCalled();
  });

  it("con versión nueva, recarga al pasar a otra pantalla", () => {
    montar();
    act(() => reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() }));
    act(() => ir("/reportes"));
    expect(recargo).toHaveBeenCalledOnce();
  });

  it("un cambio sólo de la búsqueda no es cambiar de pantalla", () => {
    montar();
    act(() => reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() }));
    act(() => ir("/pos?creditos=comprar"));
    expect(recargo).not.toHaveBeenCalled();
  });

  it("atascada (el SW no trajo la versión): al cambiar de pantalla limpia lo guardado y recarga", () => {
    const limpia = vi.spyOn(recarga, "limpiandoTodo").mockImplementation(async () => {});
    montar();
    act(() => reiniciarEstadoPwa({ atascada: true }));
    expect(limpia).not.toHaveBeenCalled();
    act(() => ir("/reportes"));
    expect(limpia).toHaveBeenCalledOnce();
    expect(recargo).not.toHaveBeenCalled();
  });
});
