import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CupoEstado } from "../../types";
import { cita } from "../../test/agendaFixtures";
import { CUPO_ILIMITADO, cupoEmprendedor } from "../../test/cupoFixtures";

/**
 * Plan Emprendedor en la cola (§2.3): anotar a alguien no consume; "Atender
 * ahora" sí, porque ahí el walk-in pasa a ser una cita. Sin cupo ni créditos
 * no se llama y se abre la hoja; un Básico atiende como siempre.
 */

const sesion = vi.hoisted(() => ({
  cupo: undefined as CupoEstado | undefined,
  actualizarCupo: vi.fn(),
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    cupo: sesion.cupo,
    actualizarCupo: sesion.actualizarCupo,
    refrescarCupo: sesion.refrescarCupo,
  }),
}));

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: { recursos: vi.fn(async () => []), atenderAhora: vi.fn(), cambiarEstado: vi.fn() },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { fechaNegocio } from "../../lib/agenda/horaAgenda";
import { EVENTO_HOJA_CUPO } from "../../lib/hojaCupo";
import ColaEspera from "./ColaEspera";

const enCola = cita({
  id: 21,
  estado: "EN_COLA",
  inicio: null,
  fin: null,
  lineas: [],
  serviciosPedidos: [{ id: 100, nombre: "Corte dama" }],
  creadaEn: new Date().toISOString(),
});

const pedidos: Event[] = [];
const escuchar = (e: Event) => pedidos.push(e);

beforeEach(() => {
  vi.clearAllMocks();
  sesion.cupo = undefined;
  pedidos.length = 0;
  window.addEventListener(EVENTO_HOJA_CUPO, escuchar);
});

afterEach(() => window.removeEventListener(EVENTO_HOJA_CUPO, escuchar));

async function montar(onCambio = vi.fn()) {
  render(<ColaEspera cola={[enCola]} sucursalId={1} recursos={[]} onCambio={onCambio} />);
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Atender ahora" }));
  });
  return onCambio;
}

describe("Atender ahora con el cupo de citas", () => {
  it("un negocio Básico (ilimitado) atiende como siempre", async () => {
    sesion.cupo = CUPO_ILIMITADO;
    vi.mocked(apiAgenda.atenderAhora).mockResolvedValue({ ...enCola, estado: "EN_ATENCION" });
    const onCambio = await montar();
    expect(apiAgenda.atenderAhora).toHaveBeenCalledWith(21, undefined);
    expect(onCambio).toHaveBeenCalled();
    expect(pedidos).toHaveLength(0);
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
  });

  it("sin cupo y con 1 crédito (una cita usa 2) no llama y abre la hoja", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 50, saldo: 1 });
    const onCambio = await montar();
    expect(apiAgenda.atenderAhora).not.toHaveBeenCalled();
    expect(onCambio).not.toHaveBeenCalled();
    expect((pedidos[0] as CustomEvent).detail).toEqual({ unidad: "CITA", agotado: true });
  });

  it("un 403 CUPO_AGOTADO abre la hoja sin cartel de error y sigue en la cola", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 10, saldo: 0 });
    vi.mocked(apiAgenda.atenderAhora).mockRejectedValue(
      Object.assign(new Error("Llegaste a tus 50 citas de hoy y no te quedan créditos."), {
        status: 403,
        codigo: "CUPO_AGOTADO",
        detalle: { codigo: "CUPO_AGOTADO", unidad: "CITA", cupo: cupoEmprendedor({ citas: 50 }) },
      }),
    );
    const onCambio = await montar();
    expect(apiAgenda.atenderAhora).toHaveBeenCalledTimes(1);
    expect(pedidos).toHaveLength(1);
    expect(screen.queryByText(/no te quedan créditos/)).not.toBeInTheDocument();
    expect(screen.getByText("Rosa Mamani")).toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();
  });
});
