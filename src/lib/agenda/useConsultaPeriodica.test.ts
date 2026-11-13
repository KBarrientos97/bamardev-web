import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useConsultaPeriodica } from "./useConsultaPeriodica";

/**
 * `clave`: de qué son los datos (la sucursal que se mira). Cambiarla descarta
 * de la vista lo de la anterior; un refresco con la misma clave es silencioso.
 */

function pendiente<T>() {
  let soltar!: (v: T) => void;
  const promesa = new Promise<T>((r) => (soltar = r));
  return { promesa, soltar };
}

describe("useConsultaPeriodica con clave", () => {
  it("al cambiar la clave no se ve lo de la anterior hasta que llega lo nuevo", async () => {
    const dos = pendiente<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useConsultaPeriodica(() => (id === 1 ? Promise.resolve("bandeja 1") : dos.promesa), [id], { clave: id }),
      { initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.datos).toBe("bandeja 1"));

    rerender({ id: 2 });
    expect(result.current.datos).toBeNull();
    expect(result.current.cargando).toBe(true);

    await act(async () => dos.soltar("bandeja 2"));
    expect(result.current.datos).toBe("bandeja 2");
    expect(result.current.cargando).toBe(false);
  });

  it("un refresco silencioso con la misma clave conserva lo que hay", async () => {
    const segunda = pendiente<string>();
    let n = 0;
    const { result } = renderHook(() =>
      useConsultaPeriodica(() => (++n === 1 ? Promise.resolve("primera") : segunda.promesa), [], { clave: null }),
    );
    await waitFor(() => expect(result.current.datos).toBe("primera"));

    act(() => {
      void result.current.refrescar();
    });
    expect(result.current.datos).toBe("primera");
    expect(result.current.cargando).toBe(false);

    await act(async () => segunda.soltar("segunda"));
    expect(result.current.datos).toBe("segunda");
  });

  it("sin clave conserva los datos al cambiar las dependencias, como siempre", async () => {
    const dos = pendiente<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useConsultaPeriodica(() => (id === 1 ? Promise.resolve("uno") : dos.promesa), [id]),
      { initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.datos).toBe("uno"));
    rerender({ id: 2 });
    expect(result.current.datos).toBe("uno");
    await act(async () => dos.soltar("dos"));
    expect(result.current.datos).toBe("dos");
  });
});
