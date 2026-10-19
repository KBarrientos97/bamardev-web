import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FotoAlumno } from "../../lib/academia/tipos";

/**
 * Observar una sola foto (QA ronda 2, N-4; contrato #33): el diálogo deja
 * elegir cuál o cuáles hay que cambiar y manda `tipos`; las demás quedan
 * revisadas sin observación.
 */

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { fotoComoUrl: vi.fn(), revisarFotos: vi.fn(), subirFoto: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import FotosAlumno from "./FotosAlumno";

const FOTOS: FotoAlumno[] = (["FOTO", "CI_ANVERSO", "CI_REVERSO"] as const).map((tipo) => ({
  tipo,
  subidaEn: "2026-10-17T14:00:00.000Z",
  revisadaEn: null,
  revisadaPor: null,
  observacion: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.fotoComoUrl).mockResolvedValue("blob:x");
  vi.mocked(apiAcademia.revisarFotos).mockResolvedValue({});
});

async function abrirObservar() {
  const onCambio = vi.fn();
  render(<FotosAlumno alumnoId={208} fotos={FOTOS} veImagenes reemplaza onCambio={onCambio} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Observar" }));
  return { dialogo: screen.getByRole("dialog", { name: "Observar las fotos" }), onCambio };
}

describe("FotosAlumno · Observar", () => {
  it("observa sólo la foto marcada y manda `tipos`", async () => {
    const { dialogo, onCambio } = await abrirObservar();
    const casillas = within(dialogo).getAllByRole("checkbox");
    expect(casillas).toHaveLength(3);
    casillas.forEach((c) => expect(c).not.toBeChecked());
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Carnet, atrás" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "La foto no se ve bien" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Observar" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(208, { ok: false, observacion: "La foto no se ve bien", tipos: ["CI_REVERSO"] });
    expect(onCambio).toHaveBeenCalled();
  });

  it("sin ninguna marcada no manda nada y lo dice", async () => {
    const { dialogo } = await abrirObservar();
    fireEvent.click(within(dialogo).getByRole("button", { name: "El carnet no coincide" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Observar" }));
    });
    expect(apiAcademia.revisarFotos).not.toHaveBeenCalled();
    expect(within(dialogo).getByText("Marcá qué foto hay que cambiar.")).toBeInTheDocument();
  });

  it("sin motivo lo pide hablando de la ficha, no de \"la cita\" de la agenda", async () => {
    const { dialogo } = await abrirObservar();
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Foto del estudiante" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Observar" }));
    });
    expect(within(dialogo).getByText("Elegí el motivo: queda anotado en la ficha.")).toBeInTheDocument();
    expect(apiAcademia.revisarFotos).not.toHaveBeenCalled();
  });

  it("varias marcadas van en el orden de siempre", async () => {
    const { dialogo } = await abrirObservar();
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Carnet, atrás" }));
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Foto del estudiante" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "El carnet no coincide" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Observar" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(208, { ok: false, observacion: "El carnet no coincide", tipos: ["FOTO", "CI_REVERSO"] });
  });
});
