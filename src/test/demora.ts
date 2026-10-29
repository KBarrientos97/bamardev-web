import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * La demora del buscador de estudiante (300 ms) sin esperar de verdad: los tests
 * que la atraviesan simulan sólo `setTimeout`/`clearTimeout` y la avanzan a mano
 * (ronda 2, T7). Sólo esos dos: si se simulan también `setImmediate` y compañía,
 * React no avanza; y `findBy*`/`waitFor` no sirven con el reloj simulado (se
 * pasa a `getBy*` después de avanzar).
 */
export const relojDeLaDemora = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

/** Avanza la demora y deja que se asienten las respuestas que vinieron después. */
export async function esperarDemora(ms = 350) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {});
}
