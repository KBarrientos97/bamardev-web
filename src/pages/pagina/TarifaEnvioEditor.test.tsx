import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { tarifa: vi.fn(), guardarTarifa: vi.fn() },
}));

import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import TarifaEnvioEditor from "./TarifaEnvioEditor";

const tarifa = (n: number) => ({
  tramos: Array.from({ length: n }, (_, i) =>
    i === 0 ? { hastaKm: 1, base: 7 } : i === n - 1 ? { hastaKm: null, porKm: 1 } : { hastaKm: i + 1, porKm: 1 },
  ),
  maxKm: 12,
});

beforeEach(() => vi.clearAllMocks());

describe("el editor de la tarifa de envío", () => {
  it("con 7 tramos todavía deja agregar uno", async () => {
    vi.mocked(apiPedidosWeb.tarifa).mockResolvedValue(tarifa(7));
    render(<TarifaEnvioEditor />);
    expect(await screen.findByRole("button", { name: "Agregar un tramo" })).toBeEnabled();
  });

  it("con 8 tramos (el máximo del backend) el botón se apaga y lo dice (PW-39)", async () => {
    vi.mocked(apiPedidosWeb.tarifa).mockResolvedValue(tarifa(8));
    render(<TarifaEnvioEditor />);
    expect(await screen.findByRole("button", { name: "Máximo 8 tramos" })).toBeDisabled();
  });
});
