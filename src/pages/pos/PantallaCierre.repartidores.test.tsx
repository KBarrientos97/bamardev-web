import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, ResumenCaja } from "../../types";

/**
 * El cierre con el delivery propio (18-nov, CONTRATO-delivery-full §9): la
 * plata que los repartidores cobraron y la caja no recibió va en su fila del
 * cajón («En poder de repartidores»), las filas siguen sumando el esperado, el
 * botón «Repartidores» abre el cuadre y, al recibir, el arqueo se recalcula.
 * Con el control apagado (o un backend anterior), el cierre es el de siempre.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string,
  features: ["pos", "caja", "delivery"] as string[] | undefined,
}));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      rubro: sesion.rubro,
      incluye: () => true,
      puede: () => true,
      negocio: { nombre: "Negocio de prueba", features: sesion.features },
      usuario: { id: 1, rol: "CAJERO", nombre: "Caja Uno", username: "caja", ...permisosDe("CAJERO") },
    }),
  };
});

vi.mock("../../lib/menuDigital/useReciboNegocio", () => ({ useReciboNegocio: () => null }));

vi.mock("../../lib/api", () => ({
  api: {
    resumenCaja: vi.fn(),
    reporteCierreProductos: vi.fn(),
    cerrarCaja: vi.fn(),
    rendicionReparto: vi.fn(),
    recibirRendicionReparto: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import PantallaCierre from "./PantallaCierre";

/**
 * Fondo 100 + 380 en efectivo + 15 de abonos + 50 de ingresos − 30 de egresos
 * − 25 del mesero − 130 del repartidor = 360. Lo que el backend calcula.
 */
function resumen(extra: Partial<ResumenCaja> = {}): ResumenCaja {
  return {
    cajaId: 1,
    estado: "ABIERTA",
    montoApertura: 100,
    cantidadVentas: 4,
    totalVentas: 380,
    anuladas: 0,
    porFormaPago: [{ nombre: "Efectivo", monto: 380 }],
    efectivo: 380,
    cambioEntregado: 0,
    ingresos: 50,
    egresos: 30,
    movimientos: [],
    creditoOtorgado: 0,
    abonosCredito: 15,
    abonosEfectivo: 15,
    abonosPorFormaPago: [{ nombre: "Efectivo", monto: 15 }],
    enPoderDeMeseros: 25,
    meserosPendientes: [{ meseroId: 3, nombre: "Ana", monto: 25 }],
    enPoderDeRepartidores: 130,
    repartidoresPendientes: [{ repartidorId: 129, nombre: "Pedro Rojas", monto: 130, entregas: 2 }],
    saldoEsperado: 360,
    ...extra,
  };
}

/** La rendición del día: Pedro con dos entregas en efectivo sin recibir (70 + 60). */
const RENDICION = {
  activa: true,
  desde: "2026-11-18T10:00:00.000Z",
  pendiente: 130,
  recibido: 0,
  repartidores: [
    {
      repartidorId: 129,
      nombre: "Pedro Rojas",
      entregados: 2,
      enCamino: 0,
      cobradoEfectivo: 130,
      cobradoQr: 0,
      envios: 14,
      pendiente: 130,
      recibido: 0,
      entregas: [
        { id: 55, ventaId: 900, comprobante: "V-000900", cliente: "Carla Mamani", entregadoEn: "2026-11-18T23:15:00.000Z", total: 70, efectivo: 70, qr: 0, envio: 7, estado: "PENDIENTE", recibidaEn: null, recibidaPorNombre: null },
        { id: 56, ventaId: 901, comprobante: "V-000901", cliente: "Juan Pérez", entregadoEn: "2026-11-18T23:40:00.000Z", total: 60, efectivo: 60, qr: 0, envio: 7, estado: "PENDIENTE", recibidaEn: null, recibidaPorNombre: null },
      ],
      productos: { unidades: 3, categorias: [{ nombre: "Pollos", unidades: 2, items: [{ nombre: "Brasa entero", cantidad: 2 }] }, { nombre: "Bebidas", unidades: 1, items: [{ nombre: "Gaseosa 2L", cantidad: 1 }] }] },
    },
  ],
};

async function montar() {
  render(
    <PantallaCierre
      caja={{ id: 1, almacenId: 4, fechaApertura: "2026-11-18T12:00:00.000Z", montoApertura: 100 } as Caja}
      onAtras={() => {}}
      onCerrada={() => {}}
    />,
  );
  await act(async () => {});
}

/** Las filas del cajón como [etiqueta, monto], leídas de la pantalla (con miles y el signo). */
function filasDeCaja(): [string, number][] {
  const dl = screen.getByText("Efectivo en caja").nextElementSibling as HTMLElement;
  return Array.from(dl.querySelectorAll("dt")).map((dt) => {
    const txt = (dt.nextElementSibling?.textContent ?? "")
      .replace(/−/g, "-")
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return [dt.textContent ?? "", Number(txt)];
  });
}

const suma = (filas: [string, number][]) => Math.round(filas.reduce((s, [, m]) => s + m, 0) * 100) / 100;

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "RESTAURANTE";
  sesion.features = ["pos", "caja", "delivery"];
  vi.mocked(api.rendicionReparto).mockResolvedValue(RENDICION);
});

describe("la fila «En poder de repartidores» y la cuenta del cajón", () => {
  it("restaurante: va debajo de la de meseros, en negativo, y las filas suman el esperado", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    const filas = filasDeCaja();
    expect(filas).toEqual([
      ["Fondo de apertura", 100],
      ["Ventas en efectivo", 380],
      ["Abonos de fiado en efectivo", 15],
      ["Ingresos de efectivo", 50],
      ["Egresos de efectivo", -30],
      ["En poder de meseros", -25],
      ["En poder de repartidores", -130],
    ]);
    expect(suma(filas)).toBe(360);
    expect(screen.getByText("Efectivo esperado en caja").nextElementSibling).toHaveTextContent("Bs 360,00");
    // A quién pedírsela, con el enlace para recibirla.
    const detalle = screen.getByText(/Pedro Rojas Bs.130,00/);
    expect(within(detalle).getByRole("button", { name: "Recibir" })).toBeInTheDocument();
  });

  it("con varios repartidores los nombra a todos, y la cuenta sigue cerrando con miles", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        efectivo: 2380,
        porFormaPago: [{ nombre: "Efectivo", monto: 2380 }],
        totalVentas: 2380,
        enPoderDeRepartidores: 1250.5,
        repartidoresPendientes: [
          { repartidorId: 129, nombre: "Pedro Rojas", monto: 1190.5, entregas: 9 },
          { repartidorId: 130, nombre: "Luis Vaca", monto: 60, entregas: 1 },
        ],
        saldoEsperado: 1239.5,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas).toContainEqual(["En poder de repartidores", -1250.5]);
    expect(suma(filas)).toBe(1239.5);
    expect(screen.getByText(/Pedro Rojas Bs.1\.190,50 · Luis Vaca Bs.60,00/)).toBeInTheDocument();
  });

  it("otro rubro en dos bloques (belleza) y el formato de siempre (farmacia): también suman", async () => {
    for (const rubro of ["PELUQUERIA", "FARMACIA"]) {
      sesion.rubro = rubro;
      vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ abonosEfectivo: 0, abonosCredito: 0, abonosPorFormaPago: [], saldoEsperado: 345 }));
      const { unmount } = render(
        <PantallaCierre caja={{ id: 1, fechaApertura: "2026-11-18T12:00:00.000Z", montoApertura: 100 } as Caja} onAtras={() => {}} onCerrada={() => {}} />,
      );
      await act(async () => {});
      expect(screen.getByText("En poder de repartidores").nextElementSibling).toHaveTextContent("Bs -130,00");
      if (rubro === "PELUQUERIA") expect(suma(filasDeCaja())).toBe(345);
      unmount();
    }
  });

  it("un backend anterior (sin los campos) o el control apagado (0): el cajón de siempre, sin la fila", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({ enPoderDeRepartidores: undefined, repartidoresPendientes: undefined, saldoEsperado: 490 }),
    );
    await montar();
    expect(screen.queryByText("En poder de repartidores")).not.toBeInTheDocument();
    expect(suma(filasDeCaja())).toBe(490);
  });
});

describe("el botón «Repartidores»", () => {
  it("aparece junto a «Productos vendidos» y dice cuánto falta recibir", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(api.rendicionReparto).toHaveBeenCalledWith({ almacenId: 4 });
    const boton = screen.getByRole("button", { name: /^Repartidores/ });
    expect(boton).toHaveTextContent("Falta recibir Bs 130,00");
  });

  it("sin repartos hoy, con un backend anterior (404) o sin la feature, no aparece y nada se rompe", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ enPoderDeRepartidores: 0, repartidoresPendientes: [], saldoEsperado: 490 }));
    vi.mocked(api.rendicionReparto).mockResolvedValue({ activa: false, desde: null, pendiente: 0, recibido: 0, repartidores: [] });
    const { unmount } = render(
      <PantallaCierre caja={{ id: 1, fechaApertura: "2026-11-18T12:00:00.000Z", montoApertura: 100 } as Caja} onAtras={() => {}} onCerrada={() => {}} />,
    );
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /^Repartidores/ })).not.toBeInTheDocument();
    unmount();

    vi.mocked(api.rendicionReparto).mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    await montar();
    expect(screen.queryByRole("button", { name: /^Repartidores/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it("sin la feature `delivery` ni se pregunta", async () => {
    sesion.features = ["pos", "caja", "recoger"];
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ enPoderDeRepartidores: 0, repartidoresPendientes: [], saldoEsperado: 490 }));
    await montar();
    expect(api.rendicionReparto).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Repartidores/ })).not.toBeInTheDocument();
  });

  it("recibir la plata vuelve a calcular el arqueo: la fila se va y el esperado sube", async () => {
    vi.mocked(api.resumenCaja)
      .mockResolvedValueOnce(resumen())
      // Recibidos los 130: dejan de restarse.
      .mockResolvedValueOnce(resumen({ enPoderDeRepartidores: 0, repartidoresPendientes: [], saldoEsperado: 490 }));
    vi.mocked(api.recibirRendicionReparto).mockResolvedValue({ recibidas: 2, monto: 130 });
    await montar();

    fireEvent.click(screen.getByRole("button", { name: "Recibir" }));
    await act(async () => {});
    const modal = screen.getByRole("dialog", { name: "Repartidores" });
    vi.mocked(api.rendicionReparto).mockResolvedValue({
      ...RENDICION,
      pendiente: 0,
      recibido: 130,
      repartidores: [{ ...RENDICION.repartidores[0], pendiente: 0, recibido: 130, entregas: RENDICION.repartidores[0].entregas.map((e) => ({ ...e, estado: "RECIBIDA" })) }],
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Recibí Bs 130,00" }));
    const confirmacion = screen.getByRole("dialog", { name: "¿Recibiste Bs 130,00 de Pedro Rojas?" });
    await act(async () => {
      fireEvent.click(within(confirmacion).getByRole("button", { name: "Recibí" }));
    });

    expect(api.recibirRendicionReparto).toHaveBeenCalledWith([55, 56]);
    expect(api.resumenCaja).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("En poder de repartidores")).not.toBeInTheDocument();
    expect(screen.getByText("Efectivo esperado en caja").nextElementSibling).toHaveTextContent("Bs 490,00");
    // El botón del cierre también se entera: ya no falta nada.
    fireEvent.click(within(screen.getByRole("dialog", { name: "Repartidores" })).getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("button", { name: /^Repartidores/ })).toHaveTextContent("1 repartidor con pedidos hoy");
  });
});

describe("la caja no cierra con plata de repartidores sin recibir", () => {
  it("lo dice antes de preguntar «¿Cerrar la caja?» y no llama al servidor", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "360" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    });
    expect(screen.queryByRole("dialog", { name: "¿Cerrar la caja?" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Hay efectivo de repartidores sin recibir: Pedro Rojas Bs 130,00. Recibilo en «Repartidores» antes de cerrar la caja.",
      ),
    ).toBeInTheDocument();
    expect(api.cerrarCaja).not.toHaveBeenCalled();
  });

  it("sin plata pendiente, el cierre del restaurante pregunta como siempre", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ enPoderDeRepartidores: 0, repartidoresPendientes: [], saldoEsperado: 490 }));
    await montar();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "490" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    expect(screen.getByRole("dialog", { name: "¿Cerrar la caja?" })).toBeInTheDocument();
  });
});
