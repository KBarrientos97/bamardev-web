import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { ReporteMovimientosCaja } from "../../../types";
import { ContextoReporte, type DatosReporte } from "../contexto";
import MovimientosCaja from "./MovimientosCaja";

/**
 * Movimientos de caja con los motivos del billar (25-oct): cada fila nombra su
 * motivo y dice si resta de la ganancia, arriba va cuánto quedó de cada uno y
 * abajo, plegados, los anulados. Los demás rubros (y un backend anterior, sin
 * los campos nuevos) ven exactamente la pantalla de siempre.
 */

const reporteCaja = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: { reporteCaja: (...a: unknown[]) => reporteCaja(...a) },
  qs: () => "",
  request: vi.fn(async () => null),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { features: [] } }),
}));

const RANGO = { desde: "2026-10-01", hasta: "2026-10-25" };

type Fila = ReporteMovimientosCaja["items"][number];

function fila(p: Partial<Fila>): Fila {
  return { id: 1, clase: "INGRESO", fecha: "2026-10-24T22:00:00.000Z", concepto: "Sencillo", detalle: null, usuario: "Ana", turnoId: 9, monto: 50, ...p };
}

function respuesta(items: Fila[], extra: Partial<ReporteMovimientosCaja> = {}): ReporteMovimientosCaja {
  const entradas = items.filter((m) => m.clase !== "EGRESO").reduce((a, m) => a + m.monto, 0);
  const salidas = items.filter((m) => m.clase === "EGRESO").reduce((a, m) => a + m.monto, 0);
  return {
    totales: { entradas, salidas, neto: entradas - salidas, movimientos: items.length, cobrosCredito: 0 },
    items,
    pagina: { page: 1, limite: 50, total: items.length, totalPaginas: 1 },
    ...extra,
  };
}

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", ...RANGO },
    comparacion: { desde: "2026-09-06", hasta: "2026-09-30", contra: "el período anterior", leyenda: "Período anterior" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-09-06", hasta: "2026-09-30" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <MovimientosCaja />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

const ANULADA: NonNullable<ReporteMovimientosCaja["anulados"]>[number] = {
  id: 812,
  clase: "EGRESO",
  fecha: "2026-10-24T23:50:00.000Z",
  concepto: "Cena",
  usuario: "Kevin",
  turnoId: 9,
  monto: 20,
  origen: "CENA",
  anuladoPor: "Miguel",
  anuladoEn: "2026-10-25T00:10:00.000Z",
};

beforeEach(() => reporteCaja.mockReset());

describe("Movimientos de caja: los demás rubros quedan como siempre", () => {
  it("sin motivos no hay chips, ni tarjeta por motivo, ni anulados", async () => {
    reporteCaja.mockResolvedValue(
      respuesta([fila({ id: 1, concepto: "Sencillo" }), fila({ id: 2, clase: "EGRESO", concepto: "Pago al gasista", monto: 30 })], {
        anulados: [],
        porMotivo: [],
      }),
    );
    mostrar();

    expect(await screen.findByText("Pago al gasista")).toBeInTheDocument();
    expect(screen.getByText("Sencillo")).toBeInTheDocument();
    expect(screen.queryByText("Resta de la ganancia")).not.toBeInTheDocument();
    expect(screen.queryByText("No cambia la ganancia")).not.toBeInTheDocument();
    expect(screen.queryByText("Por motivo")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Anulados/)).not.toBeInTheDocument();
  });

  it("con un backend anterior, sin los campos nuevos, también", async () => {
    reporteCaja.mockResolvedValue(respuesta([fila({ concepto: "Propina de Ana", origen: "PROPINA" })]));
    mostrar();

    expect(await screen.findByText("Propina de Ana")).toBeInTheDocument();
    expect(screen.queryByText("No cambia la ganancia")).not.toBeInTheDocument();
    expect(screen.queryByText("Por motivo")).not.toBeInTheDocument();
  });
});

describe("Movimientos de caja de un billar", () => {
  it("cada fila nombra su motivo y dice si resta de la ganancia", async () => {
    reporteCaja.mockResolvedValue(
      respuesta(
        [
          fila({ id: 1, clase: "EGRESO", concepto: "Hielo", origen: "GASTO", monto: 15 }),
          fila({ id: 2, clase: "EGRESO", concepto: "Pago a proveedor", origen: "PROVEEDOR", monto: 800 }),
          fila({ id: 3, clase: "INGRESO", concepto: "Sencillo", origen: "SENCILLO", monto: 200 }),
        ],
        { porMotivo: [], anulados: [] },
      ),
    );
    mostrar();

    const gasto = (await screen.findByText("Gasto · Hielo")).closest("div")!;
    expect(within(gasto).getByText("Resta de la ganancia")).toBeInTheDocument();
    const proveedor = screen.getByText("Pago a proveedor").closest("div")!;
    expect(within(proveedor).getByText("No cambia la ganancia")).toBeInTheDocument();
    expect(screen.getAllByText("No cambia la ganancia")).toHaveLength(2);
  });

  it("la tarjeta por motivo dice cuánto quedó de cada uno, con su signo y si resta", async () => {
    reporteCaja.mockResolvedValue(
      respuesta([fila({ id: 1, clase: "EGRESO", concepto: "Cena", origen: "CENA", monto: 20 })], {
        porMotivo: [
          { codigo: "CENA", monto: 600, cantidad: 30 },
          { codigo: "PROVEEDOR", monto: 800, cantidad: 2 },
        ],
        anulados: [],
      }),
    );
    mostrar();

    const tarjeta = (await screen.findByText("Por motivo")).closest("section")!;
    const cena = within(tarjeta).getByText("Cena").closest("li")!;
    expect(cena).toHaveTextContent(`−${fmtMoney(600)}`);
    expect(cena).toHaveTextContent("30 veces");
    expect(cena).toHaveTextContent("Resta de la ganancia");
    const proveedor = within(tarjeta).getByText("Pago a proveedor").closest("li")!;
    expect(proveedor).toHaveTextContent(`−${fmtMoney(800)}`);
    expect(proveedor).toHaveTextContent("No cambia la ganancia");
  });

  it("los anulados van aparte y plegados, tachados y con quién los anuló", async () => {
    // Antes la cena anulada y su anulación eran dos filas sueltas ("Ingreso ·
    // Cena anulada · #812") que inflaban Entradas y Salidas.
    reporteCaja.mockResolvedValue(
      respuesta([fila({ id: 1, clase: "EGRESO", concepto: "Hielo", origen: "GASTO", monto: 15 })], { porMotivo: [], anulados: [ANULADA] }),
    );
    mostrar();

    const boton = await screen.findByRole("button", { name: /Anulados \(1\)/ });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Anuló Miguel/)).not.toBeInTheDocument();
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Anuló Miguel/)).toBeInTheDocument();
    expect(screen.getByText(/Registró Kevin/)).toBeInTheDocument();
    expect(screen.queryByText(/#812/)).not.toBeInTheDocument();
  });

  it("con sólo anulados el período no se da por vacío: se ve quién registró y quién anuló", async () => {
    reporteCaja.mockResolvedValue(respuesta([], { porMotivo: [], anulados: [ANULADA] }));
    mostrar();

    expect(await screen.findByRole("button", { name: /Anulados \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByText("Sin movimientos de efectivo")).not.toBeInTheDocument();
    expect(screen.getByText(/se anuló: está abajo, en Anulados/)).toBeInTheDocument();
  });

  it("sin nada, ni anulados, sigue diciendo que no hubo movimientos", async () => {
    reporteCaja.mockResolvedValue(respuesta([], { porMotivo: [], anulados: [] }));
    mostrar();

    expect(await screen.findByText("Sin movimientos de efectivo")).toBeInTheDocument();
  });
});
