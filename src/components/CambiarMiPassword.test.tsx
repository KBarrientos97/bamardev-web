import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Cambiar mi contraseña" (API-12): cualquiera cambia la suya con
 * `PATCH /usuarios/me/password { actual, nueva }`.
 */

vi.mock("../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/api")>();
  return { ...real, api: { cambiarMiPassword: vi.fn() } };
});

import { api, ApiError } from "../lib/api";
import CambiarMiPassword from "./CambiarMiPassword";

const onClose = vi.fn();

function llenar(actual: string, nueva: string, repetir = nueva) {
  fireEvent.change(screen.getByLabelText("Contraseña actual"), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText(/^Contraseña nueva/), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText("Repetir la nueva"), { target: { value: repetir } });
}

async function guardar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  render(<CambiarMiPassword onClose={onClose} />);
});

describe("cambiar mi contraseña", () => {
  it("manda la actual y la nueva al endpoint propio, y lo confirma", async () => {
    vi.mocked(api.cambiarMiPassword).mockResolvedValue({});
    llenar("vieja123", "nueva456");
    await guardar();
    expect(api.cambiarMiPassword).toHaveBeenCalledWith("vieja123", "nueva456");
    expect(screen.getByText(/Contraseña actualizada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("valida antes de mandar: la actual, el largo, que coincidan y que cambie", async () => {
    const dialogo = screen.getByRole("dialog");
    llenar("", "nueva456");
    await guardar();
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Poné tu contraseña actual.");
    llenar("vieja123", "corta");
    await guardar();
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("al menos 6 caracteres");
    llenar("vieja123", "nueva456", "nueva457");
    await guardar();
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("no coinciden");
    llenar("vieja123", "vieja123");
    await guardar();
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("distinta de la actual");
    expect(api.cambiarMiPassword).not.toHaveBeenCalled();
  });

  it("la actual equivocada (401) se dice claro y no cierra nada", async () => {
    vi.mocked(api.cambiarMiPassword).mockRejectedValue(new ApiError("Unauthorized", 401));
    llenar("mala1234", "nueva456");
    await guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("La contraseña actual no es correcta.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("otro rechazo del backend sale con su mensaje", async () => {
    vi.mocked(api.cambiarMiPassword).mockRejectedValue(new ApiError("La contraseña actual no coincide", 400));
    llenar("mala1234", "nueva456");
    await guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("La contraseña actual no coincide");
  });
});
