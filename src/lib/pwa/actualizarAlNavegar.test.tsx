import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recarga, useActualizarAlNavegar, useRecargarSiQuedoVieja } from "./actualizarAlNavegar";
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

  it("atascada y sin internet: no limpia ni recarga (dejaría la app inservible); con red, al cambiar de pantalla sí", () => {
    const limpia = vi.spyOn(recarga, "limpiandoTodo").mockImplementation(async () => {});
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    montar();
    act(() => reiniciarEstadoPwa({ atascada: true }));
    act(() => ir("/reportes"));
    expect(limpia).not.toHaveBeenCalled();
    expect(recargo).not.toHaveBeenCalled();

    enLinea.mockReturnValue(true);
    act(() => ir("/pos"));
    expect(limpia).toHaveBeenCalledOnce();
  });
});

describe("useRecargarSiQuedoVieja (la pantalla de sin secciones)", () => {
  const PUBLICADA = "2026-10-30T03:33:09Z+eb64e5a";
  const VIEJA = "2026-10-27T20:30:00Z+74a1117";
  function SinSecciones({ servidor, version }: { servidor: () => Promise<string | null>; version: string }) {
    useRecargarSiQuedoVieja(servidor, version);
    return null;
  }
  let limpia: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sessionStorage.clear();
    limpia = vi.spyOn(recarga, "limpiandoTodo").mockImplementation(async () => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("con otra versión publicada recarga limpiando lo guardado, una sola vez por versión", async () => {
    // El caso del 31-oct: la app del 27 mandaba el acceso de despacho a "sin secciones".
    const servidor = vi.fn(async () => PUBLICADA);
    const primera = render(<SinSecciones servidor={servidor} version={VIEJA} />);
    await waitFor(() => expect(limpia).toHaveBeenCalledOnce());
    primera.unmount();

    // Si después de recargar sigue sin coincidir, no entra en un bucle.
    render(<SinSecciones servidor={servidor} version={VIEJA} />);
    await waitFor(() => expect(servidor).toHaveBeenCalledTimes(2));
    expect(limpia).toHaveBeenCalledOnce();
  });

  it("con la misma versión no recarga", async () => {
    const servidor = vi.fn(async () => PUBLICADA);
    render(<SinSecciones servidor={servidor} version={PUBLICADA} />);
    await waitFor(() => expect(servidor).toHaveBeenCalledOnce());
    expect(limpia).not.toHaveBeenCalled();
  });

  it("sin internet o sin respuesta del servidor no recarga", async () => {
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const otra = vi.fn(async () => PUBLICADA);
    render(<SinSecciones servidor={otra} version={VIEJA} />);
    await waitFor(() => expect(otra).toHaveBeenCalledOnce());

    enLinea.mockReturnValue(true);
    const nada = vi.fn(async () => null);
    render(<SinSecciones servidor={nada} version={VIEJA} />);
    await waitFor(() => expect(nada).toHaveBeenCalledOnce());
    expect(limpia).not.toHaveBeenCalled();
  });

  it("en desarrollo (sin versión) ni pregunta", () => {
    const servidor = vi.fn(async () => PUBLICADA);
    render(<SinSecciones servidor={servidor} version="dev" />);
    expect(servidor).not.toHaveBeenCalled();
  });
});
