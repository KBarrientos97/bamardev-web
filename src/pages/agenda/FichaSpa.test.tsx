import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La ficha del cliente con el spa completo (fase 3): sus paquetes y su ficha
 * de salud con los consentimientos firmados. La salud sólo con el permiso.
 */

const sesion = vi.hoisted(() => ({
  features: ["clientes", "paquetes", "consentimientos"] as string[],
  permisos: ["cliente.ver_ficha", "cliente.ver_salud", "cliente.editar_salud"] as string[],
  rol: "PROFESIONAL",
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 3, rol: sesion.rol, permisos: sesion.permisos },
    negocio: { id: 1, tipoNegocio: "SPA", features: sesion.features },
  }),
}));

vi.mock("../../lib/agenda/apiSpa", () => ({
  apiSpa: {
    paquetesDelCliente: vi.fn(),
    saludDelCliente: vi.fn(),
    guardarFichaSalud: vi.fn(),
    consentimiento: vi.fn(),
  },
}));

import { apiSpa } from "../../lib/agenda/apiSpa";
import FichaSpa from "./FichaSpa";

const montar = async () => {
  render(<FichaSpa clienteId={5} />);
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["clientes", "paquetes", "consentimientos"];
  sesion.permisos = ["cliente.ver_ficha", "cliente.ver_salud", "cliente.editar_salud"];
  sesion.rol = "PROFESIONAL";
  vi.mocked(apiSpa.paquetesDelCliente).mockResolvedValue([
    {
      id: 3,
      nombre: "5 masajes",
      compradoEn: "2026-10-01T15:00:00.000Z",
      venceEn: "2027-01-01T04:00:00.000Z",
      ultimoDia: "2026-12-31",
      estado: "ACTIVO",
      vencido: false,
      ventaId: 40,
      items: [{ servicioId: 100, servicio: "Masaje", sesiones: 5, usadas: 2, restantes: 3 }],
    },
  ]);
  vi.mocked(apiSpa.saludDelCliente).mockResolvedValue({
    ficha: {
      antecedentes: "Hipertensión",
      medicamentos: null,
      contraindicaciones: null,
      embarazo: false,
      observaciones: null,
      actualizadoEn: "2026-10-02T15:00:00.000Z",
    },
    firmados: [
      {
        id: 9,
        servicioId: 100,
        servicio: "Masaje",
        version: 1,
        vigente: false,
        firmante: "Rosa",
        firmadoEn: "2026-10-02T15:00:00.000Z",
        citaId: 1,
      },
    ],
  });
});

describe("ficha del cliente: paquetes y salud", () => {
  it("muestra el saldo de cada paquete", async () => {
    await montar();
    expect(screen.getByText("5 masajes")).toBeTruthy();
    expect(screen.getByText("Masaje: 3 de 5")).toBeTruthy();
    expect(screen.getByText("3 sesiones")).toBeTruthy();
  });

  it("muestra la ficha de salud como dato sensible y avisa el consentimiento viejo", async () => {
    await montar();
    expect(screen.getByText("Dato sensible")).toBeTruthy();
    expect(screen.getByText("Hipertensión")).toBeTruthy();
    expect(screen.getByText(/el texto cambió: firmar de nuevo/)).toBeTruthy();
  });

  it("edita la ficha de salud; vacío es null", async () => {
    vi.mocked(apiSpa.guardarFichaSalud).mockResolvedValue({
      antecedentes: null,
      medicamentos: "Losartán",
      contraindicaciones: null,
      embarazo: null,
      observaciones: null,
      actualizadoEn: "x",
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    const dialogo = screen.getByRole("dialog");
    const [antecedentes, medicamentos] = within(dialogo).getAllByRole("textbox");
    fireEvent.change(antecedentes, { target: { value: "  " } });
    fireEvent.change(medicamentos, { target: { value: "Losartán" } });
    fireEvent.change(within(dialogo).getByLabelText("Embarazo"), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiSpa.guardarFichaSalud).toHaveBeenCalledWith(5, {
      antecedentes: null,
      medicamentos: "Losartán",
      contraindicaciones: null,
      observaciones: null,
      embarazo: null,
    });
  });

  it("S2SEG-18: la recepción ve la ficha de salud pero no la edita", async () => {
    sesion.rol = "CAJERO";
    sesion.permisos = ["cliente.ver_ficha", "cliente.ver_salud"];
    await montar();
    expect(screen.getByText("Hipertensión")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Editar|Completar/ })).toBeNull();
  });

  it("sin permisos en la sesión no se ve ni se edita la salud, sea cual sea el rol", async () => {
    sesion.permisos = undefined as unknown as string[];
    sesion.rol = "ADMIN";
    await montar();
    expect(apiSpa.saludDelCliente).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Editar|Completar/ })).toBeNull();
  });

  it("sin el permiso de salud no la pide; sin las features, nada", async () => {
    sesion.permisos = ["cliente.ver_ficha"];
    await montar();
    expect(apiSpa.saludDelCliente).not.toHaveBeenCalled();
    expect(screen.queryByText("Dato sensible")).toBeNull();
  });

  it("sin las features no pide nada", async () => {
    sesion.features = ["clientes"];
    await montar();
    expect(apiSpa.paquetesDelCliente).not.toHaveBeenCalled();
    expect(apiSpa.saludDelCliente).not.toHaveBeenCalled();
  });

  it("07-oct: con `consentimientos` apagada no hay salud ni firmas, aunque el rol traiga los permisos", async () => {
    // Deuda técnica: el backend apaga la feature en todos los negocios.
    sesion.features = ["clientes", "paquetes"];
    await montar();
    expect(apiSpa.paquetesDelCliente).toHaveBeenCalled();
    expect(apiSpa.saludDelCliente).not.toHaveBeenCalled();
    expect(screen.queryByText("Salud y consentimientos")).toBeNull();
    expect(screen.queryByText("Dato sensible")).toBeNull();
    expect(screen.queryByRole("button", { name: /Completar|Editar/ })).toBeNull();
  });
});
