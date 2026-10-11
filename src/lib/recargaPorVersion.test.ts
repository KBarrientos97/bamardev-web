import { describe, expect, it, vi } from "vitest";
import { debeRecargar, instalarRecargaPorVersion, VENTANA_MS } from "./recargaPorVersion";

function armar(reloj: () => number, guardado: Record<string, string> = {}) {
  const target = new EventTarget();
  const reload = vi.fn();
  const storage = {
    getItem: (k: string) => guardado[k] ?? null,
    setItem: (k: string, v: string) => {
      guardado[k] = v;
    },
  };
  instalarRecargaPorVersion(
    Object.assign(target, { location: { reload } }) as unknown as Parameters<typeof instalarRecargaPorVersion>[0],
    storage,
    reloj,
  );
  const fallar = () => {
    const e = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { reload, fallar };
}

describe("recarga cuando falta un pedazo de otra versión", () => {
  it("la primera falla recarga y frena el error", () => {
    const { reload, fallar } = armar(() => 1_000_000);
    const e = fallar();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("si vuelve a fallar enseguida no entra en bucle: deja ver el error", () => {
    let ahora = 1_000_000;
    const guardado: Record<string, string> = {};
    armar(() => ahora, guardado).fallar();
    ahora += 3_000;
    const segunda = armar(() => ahora, guardado);
    const e = segunda.fallar();
    expect(segunda.reload).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("pasada la ventana, otro deploy vuelve a recargar", () => {
    expect(debeRecargar(100_000, 100_000 - VENTANA_MS - 1)).toBe(true);
    expect(debeRecargar(100_000, 100_000 - 1_000)).toBe(false);
    expect(debeRecargar(100_000, null)).toBe(true);
    expect(debeRecargar(100_000, Number.NaN)).toBe(true);
  });
});
