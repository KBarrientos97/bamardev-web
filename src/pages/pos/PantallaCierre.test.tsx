import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, ResumenCaja } from "../../types";

/**
 * El cierre de caja en un salón de belleza (QA ronda 1, 06-oct): qué citas
 * quedaron para revisar y por qué (B-28), y sin palabras de restaurante
 * (B-21). Un restaurante ve lo de siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "PELUQUERIA" as string, reportes: true }));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      rubro: sesion.rubro,
      incluye: () => true,
      puede: (s: string) => (s === "reportes" ? sesion.reportes : true),
      usuario: { rol: "ADMIN", ...permisosDe("ADMIN") },
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: { resumenCaja: vi.fn(), reporteCierreProductos: vi.fn(), cerrarCaja: vi.fn() },
}));

import { api } from "../../lib/api";
import PantallaCierre from "./PantallaCierre";
import { cuandoCita } from "../../lib/agenda/horaAgenda";

function resumen(extra: Partial<ResumenCaja> = {}): ResumenCaja {
  return {
    cajaId: 1,
    estado: "ABIERTA",
    montoApertura: 100,
    cantidadVentas: 3,
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
    ...extra,
  };
}

async function montar() {
  render(
    <PantallaCierre
      caja={{ id: 1, fechaApertura: "2026-10-06T12:00:00.000Z", montoApertura: 100 } as Caja}
      onAtras={() => {}}
      onCerrada={() => {}}
    />,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "PELUQUERIA";
  sesion.reportes = true;
});

describe("B-28: las citas para revisar, con nombre y motivo", () => {
  it("lista cuáles y dice el motivo en palabras", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        citasCobroRevisar: 3,
        citasRevisar: [
          { id: 13, codigo: "K7M2QX", cliente: "Ana Pisa", motivo: "COBRO_INCOMPLETO" },
          { id: 14, codigo: "P3R8TZ", cliente: "Rosa Mamani", motivo: "YA_COBRADA" },
          { id: 15, codigo: "Q1W2E3", cliente: "Luz Vaca", motivo: "CITA_CERRADA" },
        ],
      }),
    );
    await montar();
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("3 cobros de citas para revisar:");
    expect(aviso).toHaveTextContent("Ana Pisa (K7M2QX) · cobrada por menos de lo agendado");
    expect(aviso).toHaveTextContent("Rosa Mamani (P3R8TZ) · cobrada dos veces");
    expect(aviso).toHaveTextContent("Luz Vaca (Q1W2E3) · cobrada estando cerrada");
  });

  it("dice cuál por la hora de la cita (B-28: «1 cita se cobró de más» sin decir cuál)", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        citasCobroRevisar: 1,
        citasRevisar: [
          // 10:30 en La Paz de un día que no es hoy.
          { id: 16, codigo: "Z9Y8X7", cliente: "Eva Rojas", inicio: "2026-10-05T14:30:00.000Z", motivo: "YA_COBRADA" },
        ],
      }),
    );
    await montar();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Eva Rojas (Z9Y8X7) · cita del 05/10 a las 10:30 · cobrada dos veces",
    );
  });

  it("la hora de una cita de hoy va sin fecha", () => {
    expect(cuandoCita("2026-10-07T13:00:00.000Z", "2026-10-07")).toBe("cita de las 09:00");
    expect(cuandoCita(null)).toBe("");
  });

  it("un backend que sólo manda el conteo sigue diciendo lo de antes", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ citasCobroRevisar: 1 }));
    await montar();
    expect(screen.getByRole("alert")).toHaveTextContent("1 cita se cobró de más");
  });
});

describe("B-21: sin palabras de restaurante en un salón", () => {
  it("peluquería: «Ver lo vendido»", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.getByText("Ver lo vendido")).toBeInTheDocument();
    expect(screen.queryByText("Ver qué salió del mostrador")).not.toBeInTheDocument();
  });

  it("restaurante: como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.getByText("Ver qué salió del mostrador")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/** Las filas del bloque "Efectivo en caja", como [etiqueta, monto]. */
function filasDeCaja(): [string, number][] {
  const titulo = screen.getByText("Efectivo en caja");
  const dl = titulo.nextElementSibling as HTMLElement;
  return Array.from(dl.querySelectorAll("dt")).map((dt) => {
    const txt = (dt.nextElementSibling?.textContent ?? "").replace(/[^\d,-]/g, "").replace(",", ".");
    return [dt.textContent ?? "", Number(txt)];
  });
}

describe("QA VER-01 / DIA-11: las filas del cajón suman el esperado", () => {
  it("salón: el cambio no resta otra vez y las propinas tienen su fila", async () => {
    // El caso de DIA-11: fondo 100, efectivo 245 (recibido 275, cambio 30),
    // propinas en efectivo 23, entregadas 5, QR 12 aparte. Esperado 363.
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        totalVentas: 566,
        porFormaPago: [
          { nombre: "Efectivo", monto: 245 },
          { nombre: "QR", monto: 271 },
        ],
        creditoOtorgado: 50,
        efectivo: 245,
        cambioEntregado: 30,
        ingresos: 23,
        egresos: 5,
        propinasEfectivo: 23,
        propinasSalidas: 5,
        propinasOtras: 12,
        saldoEsperado: 363,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas.map(([e]) => e)).toEqual([
      "Fondo de apertura",
      "Ventas en efectivo",
      "Propinas en efectivo",
      "Propinas entregadas",
    ]);
    expect(Math.round(filas.reduce((s, [, m]) => s + m, 0) * 100) / 100).toBe(363);
    expect(screen.getByText(/Recibido Bs.275,00 · cambio entregado Bs.30,00/)).toBeInTheDocument();
    expect(screen.getByText("Propinas por QR (no pasan por la caja)")).toBeInTheDocument();
    expect(screen.queryByText("Ingresos de efectivo")).not.toBeInTheDocument();
    expect(screen.queryByText("Cambio entregado")).not.toBeInTheDocument();
  });

  it("con un ingreso manual además de las propinas, va como «otros»", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({ ingresos: 33, propinasEfectivo: 23, saldoEsperado: 463 }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas).toContainEqual(["Otros ingresos de efectivo", 10]);
    expect(filas.reduce((s, [, m]) => s + m, 0)).toBe(463);
  });
});

describe("fuera del salón (Omar) el cierre se dibuja como antes", () => {
  /** Todas las filas del bloque "Movimiento del turno", como [etiqueta, texto del monto]. */
  function filasDelTurno(): [string, string][] {
    const dl = screen.getByText("Movimiento del turno").nextElementSibling as HTMLElement;
    return Array.from(dl.querySelectorAll("dt")).map((dt) => [
      dt.textContent ?? "",
      (dt.nextElementSibling?.textContent ?? "").replace(/\s/g, " "),
    ]);
  }

  it("restaurante: mismo orden, mismas filas y mismos rótulos de siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        porFormaPago: [
          { nombre: "Efectivo", monto: 330 },
          { nombre: "QR", monto: 70 },
        ],
        totalVentas: 400,
        efectivo: 330,
        cambioEntregado: 20,
        ingresos: 50,
        egresos: 30,
        abonosEfectivo: 15,
        abonosPorFormaPago: [{ nombre: "QR", monto: 10 }],
        creditoOtorgado: 40,
        anuladas: 1,
        enPoderDeMeseros: 25,
        meserosPendientes: [{ meseroId: 3, nombre: "Ana", monto: 25 }],
        saldoEsperado: 440,
      }),
    );
    await montar();
    expect(filasDelTurno().map(([e]) => e)).toEqual([
      "Fondo de apertura",
      "Ventas (3)",
      "Efectivo",
      "QR",
      "Cambio entregado",
      "Ingresos de efectivo",
      "Egresos de efectivo",
      "Abonos de créditos (efectivo)",
      "En poder de meseros",
      "Abonos por QR (no es efectivo)",
      "Fiado otorgado (no es efectivo)",
      "Ventas anuladas",
    ]);
    expect(filasDelTurno()[4][1]).toMatch(/-.*20,00/);
    // Nada del diseño del salón.
    expect(screen.queryByText("Efectivo en caja")).not.toBeInTheDocument();
    expect(screen.queryByText("Ventas en efectivo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Recibido/)).not.toBeInTheDocument();
  });

  it("aunque el backend mande campos de propinas, fuera del salón no se usan", async () => {
    sesion.rubro = "FARMACIA";
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({ ingresos: 50, propinasEfectivo: 0, propinasSalidas: 0, propinasOtras: 0 }),
    );
    await montar();
    expect(filasDelTurno().map(([e]) => e)).toEqual([
      "Fondo de apertura",
      "Ventas (3)",
      "Efectivo",
      "Ingresos de efectivo",
    ]);
  });
});

describe("QA DIA-10: «Ver lo vendido» sólo para quien lo puede ver", () => {
  it("recepción (sin reportes) no ve el botón", async () => {
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.queryByText("Ver lo vendido")).not.toBeInTheDocument();
  });

  it("si el pedido falla, sólo el error: no dice que no se vendió nada", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    vi.mocked(api.reporteCierreProductos).mockRejectedValue(new Error("No tenés permiso para hacer esto"));
    await montar();
    fireEvent.click(screen.getByText("Ver lo vendido"));
    await act(async () => {});
    expect(screen.getByText("No tenés permiso para hacer esto")).toBeInTheDocument();
    expect(screen.queryByText(/no se vendió nada/)).not.toBeInTheDocument();
  });
});

describe("el efectivo contado se escribe como en Bolivia (QA de Kevin, 17-oct)", () => {
  const campo = () => screen.getByPlaceholderText("0,00") as HTMLInputElement;
  /** De a una tecla, como el cajero. */
  function teclear(teclas: string) {
    for (const t of teclas) fireEvent.change(campo(), { target: { value: campo().value + t } });
  }
  const cerrarCaja = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    await act(async () => {});
  };

  beforeEach(() => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ saldoEsperado: 2258.9 }));
    vi.mocked(api.cerrarCaja).mockResolvedValue({ id: 1 } as Caja);
  });

  it("2.258,90 con su punto de miles cuadra con lo esperado", async () => {
    // El campo lo dejaba como "2.258.90", no se podía leer y el cierre decía
    // "El efectivo contado no puede ser negativo".
    await montar();
    teclear("2.258,90");
    expect(campo().value).toBe("2.258,90");
    expect(screen.getByText("La caja cuadra")).toBeInTheDocument();
  });

  it("225890 sin la coma se ve como 225 mil mientras se teclea", async () => {
    await montar();
    teclear("225890");
    expect(campo().value).toBe("225.890");
    expect(screen.getByText("Sobrante")).toBeInTheDocument();
    expect(screen.getByText(/223\.631,10/)).toBeInTheDocument();
  });

  it("con el punto en los centavos cierra por Bs 2.258,90 y queda escrito entero", async () => {
    await montar();
    teclear("2.258.90");
    fireEvent.blur(campo());
    expect(campo().value).toBe("2.258,90");
    await cerrarCaja();
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 2258.9 });
  });

  it("1.000 cierra por mil, no por Bs 1", async () => {
    // Number("1.000") da 1: el arqueo quedaba con un faltante de Bs 999 falso.
    await montar();
    teclear("1.000");
    await cerrarCaja();
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 1000 });
  });

  it("el conteo billete por billete se escribe igual que lo tecleado", async () => {
    await montar();
    fireEvent.click(screen.getByText("Contar billete por billete"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar un Bs 200,00" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar un Bs 0,50" }));
    expect(campo().value).toBe("200,50");
    await cerrarCaja();
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 200.5 });
  });

  it("el aviso de contar el efectivo se va al escribir el monto", async () => {
    await montar();
    await cerrarCaja();
    expect(screen.getByText("Contá el efectivo que hay en la caja.")).toBeInTheDocument();
    teclear("5");
    expect(screen.queryByText("Contá el efectivo que hay en la caja.")).not.toBeInTheDocument();
  });
});
