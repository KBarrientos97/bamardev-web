import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useApi } from "./useApi";

/**
 * `useApi` conserva lo cargado mientras vuelve a pedir; con `clave`, lo que es
 * de OTRA clave (otra sucursal) se descarta de la vista en el acto.
 */

/** Una respuesta que se suelta a mano. */
function pendiente<T>() {
  let soltar!: (v: T) => void;
  const promesa = new Promise<T>((r) => (soltar = r));
  return { promesa, soltar };
}

describe("useApi con clave", () => {
  it("al cambiar la clave, los datos de la anterior no se ven hasta que llega la respuesta nueva", async () => {
    const respuestas: Record<number, ReturnType<typeof pendiente<string>>> = {
      1: pendiente<string>(),
      2: pendiente<string>(),
    };
    const { result, rerender } = renderHook(
      ({ id }) => useApi(() => respuestas[id].promesa, [id], { clave: id }),
      { initialProps: { id: 1 } },
    );
    await act(async () => respuestas[1].soltar("mesas del local 1"));
    expect(result.current.datos).toBe("mesas del local 1");

    rerender({ id: 2 });
    // Ya en el primer render con la clave nueva: nada ajeno a la vista y "cargando".
    expect(result.current.datos).toBeNull();
    expect(result.current.cargando).toBe(true);

    await act(async () => respuestas[2].soltar("mesas del local 2"));
    expect(result.current.datos).toBe("mesas del local 2");
    expect(result.current.cargando).toBe(false);
  });

  it("recargar con la misma clave conserva lo cargado hasta que llega lo nuevo", async () => {
    let n = 0;
    const segunda = pendiente<string>();
    const { result } = renderHook(() =>
      useApi(() => (++n === 1 ? Promise.resolve("primera") : segunda.promesa), [], { clave: 7 }),
    );
    await waitFor(() => expect(result.current.datos).toBe("primera"));

    act(() => result.current.recargar());
    expect(result.current.datos).toBe("primera");
    expect(result.current.cargando).toBe(true);

    await act(async () => segunda.soltar("segunda"));
    expect(result.current.datos).toBe("segunda");
  });

  it("una respuesta lenta de la clave anterior no pisa a la nueva", async () => {
    const lenta = pendiente<string>();
    const rapida = pendiente<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useApi(() => (id === 1 ? lenta.promesa : rapida.promesa), [id], { clave: id }),
      { initialProps: { id: 1 } },
    );
    rerender({ id: 2 });
    await act(async () => rapida.soltar("del 2"));
    await act(async () => lenta.soltar("del 1"));
    expect(result.current.datos).toBe("del 2");
  });

  it("la clave null (todas) es una clave más", async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number | null }) => useApi(() => Promise.resolve(`local ${id}`), [id], { clave: id }),
      { initialProps: { id: null as number | null } },
    );
    await waitFor(() => expect(result.current.datos).toBe("local null"));
    rerender({ id: 3 });
    expect(result.current.datos).toBeNull();
    await waitFor(() => expect(result.current.datos).toBe("local 3"));
  });

  it("sin clave se comporta como siempre: conserva los datos al cambiar las dependencias", async () => {
    const segunda = pendiente<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useApi(() => (id === 1 ? Promise.resolve("uno") : segunda.promesa), [id]),
      { initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.datos).toBe("uno"));
    rerender({ id: 2 });
    expect(result.current.datos).toBe("uno");
    await act(async () => segunda.soltar("dos"));
    expect(result.current.datos).toBe("dos");
  });
});
