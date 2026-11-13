import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, ResumenCaja } from "../../types";

/**
 * El cierre lo confirma el servidor (12-nov, como Android): la pantalla le
 * declara la clave de cada venta que este equipo registró en la caja (y cuántas
 * le quedan sin subir), y si el servidor frena con 409 VENTAS_SIN_CONFIRMAR el
 * cajero lee por qué y la caja sigue abierta. Ver lib/offline/turno.ts.
 */

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      rubro: "PELUQUERIA",
      incluye: () => true,
      puede: () => true,
      negocio: { sucursalesActivas: undefined },
      usuario: { rol: "ADMIN", nombre: "Ana Quispe", username: "ana", ...permisosDe("ADMIN") },
    }),
  };
});

// El módulo real menos `api`: las claves de la sesión (USER_KEY, NEGOCIO_KEY)
// las lee el manifiesto para saber de quién es.
vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { resumenCaja: vi.fn(), reporteCierreProductos: vi.fn(), cerrarCaja: vi.fn() } };
});

import { ApiError, NEGOCIO_KEY, USER_KEY, api } from "../../lib/api";
import { almacenEnMemoria } from "../../lib/offline/almacen";
import { usarAlmacenCola } from "../../lib/offline/cola";
import { anotarVentaDelTurno, manifiestoDelTurno, usarAlmacenTurno } from "../../lib/offline/turno";
import PantallaCierre from "./PantallaCierre";

const resumen: ResumenCaja = {
  cajaId: 1,
  estado: "ABIERTA",
  montoApertura: 100,
  cantidadVentas: 2,
  totalVentas: 330,
  anuladas: 0,
  porFormaPago: [{ nombre: "Efectivo", monto: 330 }],
  efectivo: 330,
  cambioEntregado: 0,
  ingresos: 0,
  egresos: 0,
  movimientos: [],
  creditoOtorgado: 0,
  abonosCredito: 0,
  abonosEfectivo: 0,
  abonosPorFormaPago: [],
  saldoEsperado: 430,
};

const onCerrada = vi.fn();

async function montarYContar(contado: string) {
  render(
    <PantallaCierre
      caja={{ id: 1, fechaApertura: "2026-11-12T12:00:00.000Z", montoApertura: 100 } as Caja}
      onAtras={() => {}}
      onCerrada={onCerrada}
    />,
  );
  await act(async () => {});
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: contado } });
}

async function cerrar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  usarAlmacenCola(almacenEnMemoria());
  usarAlmacenTurno(almacenEnMemoria());
  localStorage.setItem(USER_KEY, JSON.stringify({ id: 3, username: "ana" }));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify({ id: 7, nombre: "Prueba" }));
  vi.mocked(api.resumenCaja).mockResolvedValue(resumen);
  // Dos ventas cobradas en este equipo durante el turno.
  await anotarVentaDelTurno(1, "v-1");
  await anotarVentaDelTurno(1, "v-2");
});

describe("el cierre confirmado por el servidor (12-nov)", () => {
  it("al cerrar declara las claves de las ventas del turno (sin cola, nada pendiente) y después las olvida", async () => {
    vi.mocked(api.cerrarCaja).mockResolvedValue({ id: 1 } as Caja);
    await montarYContar("430");
    await cerrar();
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 430, ventasDelEquipo: ["v-1", "v-2"] });
    expect(onCerrada).toHaveBeenCalled();
    expect(await manifiestoDelTurno(1)).toBeNull();
  });

  it("un 409 VENTAS_SIN_CONFIRMAR deja el motivo del servidor a la vista, la caja sigue abierta y el manifiesto también", async () => {
    vi.mocked(api.cerrarCaja).mockRejectedValue(
      new ApiError(
        "El servidor todavía no tiene 1 venta de este equipo. Conectate y sincronizá antes de cerrar la caja: si se cierra ahora, esa plata queda fuera del arqueo.",
        409,
        { codigo: "VENTAS_SIN_CONFIRMAR", faltantes: ["v-2"], cantidad: 1 },
      ),
    );
    await montarYContar("430");
    await cerrar();
    expect(screen.getByText(/El servidor todavía no tiene 1 venta de este equipo/)).toBeInTheDocument();
    expect(onCerrada).not.toHaveBeenCalled();
    expect((await manifiestoDelTurno(1))?.claves).toEqual(["v-1", "v-2"]);
  });
});
