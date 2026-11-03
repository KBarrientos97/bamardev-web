import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, ResumenCaja } from "../../types";

/**
 * El cierre de caja en un salón de belleza (QA ronda 1, 06-oct): qué citas
 * quedaron para revisar y por qué (B-28), y sin palabras de restaurante
 * (B-21). Y el del restaurante igualado con la app (28-oct): lo vendido para
 * el cajero, las filas del cajón que suman el esperado, la confirmación antes
 * de cerrar y el comprobante completo.
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
      usuario: { rol: "ADMIN", nombre: "Ana Quispe", username: "ana", ...permisosDe("ADMIN") },
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: { resumenCaja: vi.fn(), reporteCierreProductos: vi.fn(), cerrarCaja: vi.fn() },
}));

import { api } from "../../lib/api";
import PantallaCierre, { CierreOk } from "./PantallaCierre";
import { cuandoCita } from "../../lib/agenda/horaAgenda";
import { fmtHora } from "../../lib/format";

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
    // El signo menos puede venir como "−" (la fila de la cena: «−Bs 20,00») o como "-".
    const txt = (dt.nextElementSibling?.textContent ?? "").replace(/−/g, "-").replace(/[^\d,-]/g, "").replace(",", ".");
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

describe("billar (24-oct): la cena del personal que registró el administrador", () => {
  it("sale en su fila con quién la registró, y las filas siguen sumando el esperado", async () => {
    sesion.rubro = "BILLAR";
    // Fondo 50 + efectivo 115 − cena 20 = 145 (en vez de los 165 de antes).
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        montoApertura: 50,
        efectivo: 115,
        egresos: 20,
        cenasSalidas: 20,
        cenasDevueltas: 0,
        cenasRegistros: [{ id: 5, monto: 20, fecha: "2026-10-23T21:32:00.000Z", quien: "Miguel", anulada: false }],
        saldoEsperado: 145,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas.map(([e]) => e)).toEqual(["Fondo de apertura", "Ventas en efectivo", "Cena"]);
    expect(Math.round(filas.reduce((s, [, m]) => s + m, 0) * 100) / 100).toBe(145);
    expect(screen.getByText(/Lo registró Miguel/)).toBeInTheDocument();
    // La cena no se cuenta dos veces: ni como "egresos de efectivo".
    expect(screen.queryByText("Egresos de efectivo")).not.toBeInTheDocument();
    expect(screen.queryByText("Otros egresos de efectivo")).not.toBeInTheDocument();
  });

  it("billar: no dice «Recibido… cambio entregado» bajo las ventas en efectivo (la cajera cuenta el cajón)", async () => {
    sesion.rubro = "BILLAR";
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({ montoApertura: 50, efectivo: 130, cambioEntregado: 70, saldoEsperado: 180 }),
    );
    await montar();
    expect(filasDeCaja().map(([e]) => e)).toEqual(["Fondo de apertura", "Ventas en efectivo"]);
    expect(screen.queryByText(/cambio entregado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recibido/)).not.toBeInTheDocument();
  });

  it("billar: la cajera (sin reportes) ve lo vendido del turno, que ya viene con el arqueo", async () => {
    sesion.rubro = "BILLAR";
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        productos: {
          unidades: 4,
          total: 60,
          lineas: 1,
          categorias: [
            {
              nombre: "Cervezas",
              unidades: 4,
              total: 60,
              items: [{ nombre: "Paceña 620 ml", cantidad: 4, precio: 15, total: 60 }],
            },
          ],
        },
      }),
    );
    await montar();
    // Con el rótulo del billar: «mostrador» es palabra de restaurante.
    fireEvent.click(screen.getByText("Ver lo vendido"));
    expect(await screen.findByText("Productos vendidos")).toBeInTheDocument();
    expect(screen.getByText("Paceña 620 ml")).toBeInTheDocument();
    expect(screen.getByText("Cervezas")).toBeInTheDocument();
    // La cantidad sin ceros y la plata con centavos (Kevin, 25-oct): "4 u × Bs 15,00".
    expect(screen.getByText("4 u × Bs 15,00")).toBeInTheDocument();
    expect(screen.getByText("4 unidades · 1 producto")).toBeInTheDocument();
    // Sin pedirlo a los reportes, que la cajera no puede ver.
    expect(api.reporteCierreProductos).not.toHaveBeenCalled();
  });

  it("restaurante: el modal de lo vendido, con la cantidad sin ceros y la plata con centavos", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    vi.mocked(api.reporteCierreProductos).mockResolvedValue({
      unidades: 4,
      total: 60,
      lineas: 1,
      categorias: [
        { nombre: "Cervezas", unidades: 4, total: 60, items: [{ nombre: "Paceña 620 ml", cantidad: 4, precio: 15, total: 60 }] },
      ],
    });
    await montar();
    fireEvent.click(screen.getByText("Ver qué salió del mostrador"));
    expect(await screen.findByText("Productos vendidos")).toBeInTheDocument();
    // Toda la web (Kevin, 25-oct): "4,00" se leía como plata.
    expect(await screen.findByText("4 u × Bs 15,00")).toBeInTheDocument();
  });

  it("billar: sin lo vendido en el arqueo (un servidor anterior) la cajera no ve el botón", async () => {
    sesion.rubro = "BILLAR";
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.queryByText("Ver lo vendido")).not.toBeInTheDocument();
  });

  it("un retiro común va aparte de la cena, como «egresos»", async () => {
    sesion.rubro = "BILLAR";
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        montoApertura: 50,
        efectivo: 115,
        egresos: 25,
        cenasSalidas: 20,
        cenasRegistros: [{ id: 5, monto: 20, fecha: "2026-10-23T21:32:00.000Z", quien: "Miguel", anulada: false }],
        saldoEsperado: 140,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas).toContainEqual(["Egresos de efectivo", -5]);
    expect(filas).toContainEqual(["Cena", -20]);
    expect(filas.reduce((s, [, m]) => s + m, 0)).toBe(140);
  });

  it("una cena anulada vuelve al esperado y no deja ninguna fila", async () => {
    sesion.rubro = "BILLAR";
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        montoApertura: 50,
        efectivo: 115,
        egresos: 20,
        ingresos: 20,
        cenasSalidas: 20,
        cenasDevueltas: 20,
        cenasRegistros: [{ id: 5, monto: 20, fecha: "2026-10-23T21:32:00.000Z", quien: "Miguel", anulada: true }],
        saldoEsperado: 165,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas.map(([e]) => e)).toEqual(["Fondo de apertura", "Ventas en efectivo"]);
    expect(filas.reduce((s, [, m]) => s + m, 0)).toBe(165);
  });

  it("un cierre sin cenas sale como siempre", async () => {
    sesion.rubro = "BILLAR";
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ montoApertura: 50, efectivo: 115, saldoEsperado: 165 }));
    await montar();
    expect(filasDeCaja().map(([e]) => e)).toEqual(["Fondo de apertura", "Ventas en efectivo"]);
    expect(screen.queryByText("Cena")).not.toBeInTheDocument();
  });
});

describe("billar (25-oct): lo que el administrador registró con motivo en la caja de la cajera", () => {
  const registro = (id: number, codigo: "GASTO" | "RETIRO" | "SENCILLO", tipo: "INGRESO" | "EGRESO", monto: number, descripcion: string) => ({
    id,
    codigo,
    tipo,
    monto,
    descripcion,
    fecha: "2026-10-25T23:00:00.000Z",
    quien: "Miguel",
    anulado: null,
  });

  it("cada movimiento sale en su renglón con quién lo registró, y las filas suman el esperado", async () => {
    sesion.rubro = "BILLAR";
    // Fondo 50 + efectivo 500 − hielo 30 − retiro 300 + sencillo 100 = 320.
    // Antes la cajera veía un "Egresos de efectivo −330" suelto, sin saber qué fue.
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        montoApertura: 50,
        efectivo: 500,
        egresos: 330,
        ingresos: 100,
        efectivoRegistros: [
          registro(3, "GASTO", "EGRESO", 30, "Hielo"),
          registro(4, "RETIRO", "EGRESO", 300, "Retiro"),
          registro(5, "SENCILLO", "INGRESO", 100, "Sencillo"),
        ],
        saldoEsperado: 320,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas.map(([e]) => e)).toEqual(["Fondo de apertura", "Ventas en efectivo", "Gasto · Hielo", "Retiro", "Sencillo"]);
    expect(Math.round(filas.reduce((s, [, m]) => s + m, 0) * 100) / 100).toBe(320);
    expect(screen.getAllByText(/Lo registró Miguel/)).toHaveLength(3);
    expect(screen.queryByText("Egresos de efectivo")).not.toBeInTheDocument();
  });

  it("al cerrar manda el esperado que vio; si el administrador lo cambió, no cierra: trae el nuevo y lo dice", async () => {
    sesion.rubro = "BILLAR";
    vi.mocked(api.resumenCaja)
      .mockResolvedValueOnce(resumen({ montoApertura: 50, efectivo: 115, saldoEsperado: 165 }))
      .mockResolvedValueOnce(resumen({ montoApertura: 50, efectivo: 115, egresos: 20, saldoEsperado: 145 }));
    vi.mocked(api.cerrarCaja).mockRejectedValue(
      Object.assign(new Error("El efectivo que debería haber en la caja cambió mientras contabas: ahora es Bs 145,00."), {
        codigo: "ESPERADO_CAMBIO",
      }),
    );
    const alCerrar = vi.fn();
    render(
      <PantallaCierre
        caja={{ id: 1, fechaApertura: "2026-10-25T20:00:00.000Z", montoApertura: 50 } as Caja}
        onAtras={() => {}}
        onCerrada={alCerrar}
      />,
    );
    await act(async () => {});
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "165" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    });
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 165, esperadoVisto: 165 });
    expect(alCerrar).not.toHaveBeenCalled();
    expect(screen.getByText(/cambió mientras contabas/)).toBeInTheDocument();
    // Se volvió a pedir el arqueo: ahora la diferencia es contra el esperado nuevo.
    expect(api.resumenCaja).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Sobrante")).toBeInTheDocument();
  });

  it("restaurante: cierra sin mandar el esperado (después de confirmar, CAJA-12)", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    vi.mocked(api.cerrarCaja).mockResolvedValue({ id: 1 } as Caja);
    await montar();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "430" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar caja" }));
    });
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 430 });
  });
});

/** Todas las filas del primer bloque de "Movimiento del turno", como [etiqueta, texto del monto]. */
function filasDelTurno(): [string, string][] {
  const dl = screen.getByText("Movimiento del turno").nextElementSibling as HTMLElement;
  return Array.from(dl.querySelectorAll("dt")).map((dt) => [
    dt.textContent ?? "",
    (dt.nextElementSibling?.textContent ?? "").replace(/\s/g, " "),
  ]);
}

/** Un turno de restaurante con todo: QR, cambio, abonos, fiado, movimientos y un mesero con plata. */
const TURNO_COMPLETO: Partial<ResumenCaja> = {
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
};

describe("CAJA-6: en el restaurante las filas del cajón suman el esperado", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("el caso de la verificación: fondo 100, 50 en efectivo pagados con 100 y 30 por QR dan 150", async () => {
    // El formato de antes se leía "100 + 80 − 50 = 130": "Ventas (2)" con el
    // QR adentro y un "Cambio entregado" que restaba sin entrar en la cuenta.
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        cantidadVentas: 2,
        totalVentas: 80,
        porFormaPago: [
          { nombre: "Efectivo", monto: 50 },
          { nombre: "QR", monto: 30 },
        ],
        efectivo: 50,
        cambioEntregado: 50,
        saldoEsperado: 150,
      }),
    );
    await montar();
    const filas = filasDeCaja();
    expect(filas.map(([e]) => e)).toEqual(["Fondo de apertura", "Ventas en efectivo"]);
    expect(filas.reduce((s, [, m]) => s + m, 0)).toBe(150);
    // El cambio se cuenta, sin restarlo otra vez; el QR, arriba y aparte.
    expect(screen.getByText(/Recibido Bs.100,00 · cambio entregado Bs.50,00/)).toBeInTheDocument();
    expect(screen.queryByText("Cambio entregado")).not.toBeInTheDocument();
    expect(filasDelTurno().map(([e]) => e)).toEqual(["Ventas (2)", "Efectivo", "QR"]);
  });

  it("con abonos, movimientos y la plata del mesero, cada fila del cajón suma (o resta) y dan el esperado", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen(TURNO_COMPLETO));
    await montar();
    const filas = filasDeCaja();
    expect(filas).toEqual([
      ["Fondo de apertura", 100],
      ["Ventas en efectivo", 330],
      ["Abonos de créditos (efectivo)", 15],
      ["Ingresos de efectivo", 50],
      ["Egresos de efectivo", -30],
      ["En poder de meseros", -25],
    ]);
    expect(filas.reduce((s, [, m]) => s + m, 0)).toBe(440);
    // Lo que no es efectivo queda arriba, como informativo.
    expect(filasDelTurno().map(([e]) => e)).toEqual([
      "Ventas (3)",
      "Efectivo",
      "QR",
      "Abonos por QR (no es efectivo)",
      "Fiado otorgado (no es efectivo)",
      "Ventas anuladas",
    ]);
    // A quién pedirle la plata del delantal, como antes.
    expect(screen.getByText(/Ana Bs.25,00/)).toBeInTheDocument();
  });
});

describe("farmacia (y los demás rubros) sigue con el cierre de siempre", () => {
  it("mismo orden, mismas filas y mismos rótulos de siempre", async () => {
    sesion.rubro = "FARMACIA";
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen(TURNO_COMPLETO));
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
    // Por `aria-label`: con el arqueo entero en pantalla, `getByRole` tarda
    // casi un segundo cada vez y el test rozaba los 5 s.
    fireEvent.click(screen.getByLabelText("Agregar un Bs 200,00"));
    fireEvent.click(screen.getByLabelText("Agregar un Bs 0,50"));
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

/** Lo vendido en el turno, como lo trae el arqueo. */
const VENDIDO = {
  unidades: 4,
  total: 60,
  lineas: 1,
  categorias: [
    {
      nombre: "Pollos",
      unidades: 4,
      total: 60,
      items: [{ nombre: "Cuarto de pollo", cantidad: 4, precio: 15, total: 60 }],
    },
  ],
};

describe("CAJA-1: el cajero del restaurante ve lo vendido del turno al cerrar", () => {
  it("sin Reportes, lo ve igual: sale del arqueo, con cuántos productos y unidades antes de abrirlo", async () => {
    // El bug: el botón pedía `reportes` y el modal lo pedía a Reportes, que la
    // plantilla CAJERO no tiene. El pedido de Omar del 1-sep, que la app ya cumple.
    sesion.rubro = "RESTAURANTE";
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ productos: VENDIDO }));
    await montar();
    // Por el texto y no por el rol: el botón vive dentro de la etiqueta del
    // campo "Efectivo contado", que le da el nombre accesible.
    const boton = screen.getByText("1 producto · 4 unidades").closest("button")!;
    expect(boton).toHaveTextContent("Ver qué salió del mostrador");
    fireEvent.click(boton);
    expect(await screen.findByText("Productos vendidos")).toBeInTheDocument();
    expect(screen.getByText("Cuarto de pollo")).toBeInTheDocument();
    expect(screen.getByText("4 u × Bs 15,00")).toBeInTheDocument();
    expect(api.reporteCierreProductos).not.toHaveBeenCalled();
  });

  it("con un servidor que no manda lo vendido en el arqueo, el cajero sin Reportes no ve el botón", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.queryByText(/Ver qué salió del mostrador/)).not.toBeInTheDocument();
  });

  it("belleza sigue igual: la recepción sin Reportes no lo ve aunque el arqueo lo traiga (QA DIA-10)", async () => {
    sesion.rubro = "PELUQUERIA";
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ productos: VENDIDO }));
    await montar();
    expect(screen.queryByText("Ver lo vendido")).not.toBeInTheDocument();
  });

  it("el billar sigue igual: «Ver lo vendido», sin la línea de cuántos", async () => {
    sesion.rubro = "BILLAR";
    sesion.reportes = false;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ productos: VENDIDO }));
    await montar();
    expect(screen.getByText("Ver lo vendido").closest("button")).not.toHaveTextContent("unidades");
  });
});

describe("CAJA-12: en el restaurante se confirma antes de cerrar la caja", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.cerrarCaja).mockResolvedValue({ id: 1 } as Caja);
  });

  it("dice lo contado contra lo esperado y recién cierra con «Sí, cerrar caja»", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "428" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Cerrar la caja?" });
    expect(dialogo).toHaveTextContent(
      /Contaste Bs.428,00 y el sistema espera Bs.430,00: faltan Bs.2,00\. Después de cerrar no se pueden registrar más ventas/,
    );
    expect(api.cerrarCaja).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, cerrar caja" }));
    });
    expect(api.cerrarCaja).toHaveBeenCalledWith(1, { montoCierre: 428 });
  });

  it("«Cancelar» vuelve al conteo sin cerrar", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "430" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    expect(screen.getByRole("dialog", { name: "¿Cerrar la caja?" })).toHaveTextContent("la caja cuadra");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "¿Cerrar la caja?" })).not.toBeInTheDocument();
    expect(api.cerrarCaja).not.toHaveBeenCalled();
  });

  it("sin contar, no pregunta: pide el conteo", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    expect(screen.queryByRole("dialog", { name: "¿Cerrar la caja?" })).not.toBeInTheDocument();
    expect(screen.getByText("Contá el efectivo que hay en la caja.")).toBeInTheDocument();
  });

  it.each(["BILLAR", "PELUQUERIA", "FARMACIA"])("%s cierra con un toque, como siempre", async (rubro) => {
    sesion.rubro = rubro;
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "430" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    });
    expect(screen.queryByRole("dialog", { name: "¿Cerrar la caja?" })).not.toBeInTheDocument();
    expect(api.cerrarCaja).toHaveBeenCalledTimes(1);
  });
});

describe("BUG-caja-4: el conteo por billetes se descarta si el monto se corrige a mano", () => {
  const campo = () => screen.getByPlaceholderText("0,00") as HTMLInputElement;

  it("con 340 contados y 350 tecleados, el conteo se va y el siguiente billete arranca de cero", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.click(screen.getByText("Contar billete por billete"));
    // Por `aria-label` y no por rol: con el arqueo entero en pantalla, cada
    // `getByRole` tarda casi un segundo.
    for (const b of ["200,00", "100,00", "20,00", "20,00"]) {
      fireEvent.click(screen.getByLabelText(`Agregar un Bs ${b}`));
    }
    expect(campo().value).toBe("340,00");
    const cabecera = screen.getByText("Contar billete por billete").closest("button")!;
    expect(cabecera).toHaveTextContent("Bs 340,00");

    // Antes la cabecera seguía en Bs 340 con Bs 350 escrito, y un toque más
    // sumaba sobre el conteo viejo y pisaba lo tecleado con 350 = 340 + 10.
    fireEvent.change(campo(), { target: { value: "350" } });
    expect(campo().value).toBe("350");
    expect(cabecera).not.toHaveTextContent("Bs 340,00");
    expect(screen.getByLabelText("Cantidad de Bs 200,00")).toHaveValue(null);

    fireEvent.click(screen.getByLabelText("Agregar un Bs 10,00"));
    expect(campo().value).toBe("10,00");
  });

  it("el conteo que escribe el monto no se descarta a sí mismo", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    fireEvent.click(screen.getByText("Contar billete por billete"));
    fireEvent.click(screen.getByLabelText("Agregar un Bs 100,00"));
    fireEvent.click(screen.getByLabelText("Agregar un Bs 100,00"));
    expect(campo().value).toBe("200,00");
    expect(screen.getByLabelText("Cantidad de Bs 100,00")).toHaveValue(2);
  });
});

/** Una fecha en la hora de este equipo, como la muestra la pantalla. */
const local = (anio: number, mes: number, dia: number, h: number, min: number) =>
  new Date(anio, mes - 1, dia, h, min).toISOString();

/**
 * La hora como la lee Testing Library: `fmtHora` da "12:04 p. m." y el
 * texto de la pantalla se compara con los espacios ya normalizados.
 */
const hora = (iso: string) => fmtHora(iso).replace(/\s+/g, " ");

function cajaCerrada(extra: Partial<Caja> = {}): Caja {
  return {
    id: 1,
    estado: "CERRADA",
    fechaApertura: local(2026, 10, 28, 12, 4),
    fechaCierre: local(2026, 10, 29, 3, 17),
    montoApertura: 100,
    descripcion: null,
    usuarioAperturaId: 7,
    almacenId: 1,
    almacen: "Centro",
    montoCierre: 438,
    montoDiferencia: -2,
    notaCierre: "Faltó cambio",
    ...extra,
  };
}

describe("CAJA-4: el comprobante del cierre", () => {
  const ab = local(2026, 10, 28, 12, 4);
  const ce = local(2026, 10, 29, 3, 17);

  it("restaurante: el turno fechado en las dos puntas cuando cruza la medianoche, con el aviso", () => {
    // "Turno de 12:04 a 03:17" se leía al revés (el error que la app corrigió el 1-sep).
    sesion.rubro = "RESTAURANTE";
    render(<CierreOk caja={cajaCerrada({ resumen: resumen(TURNO_COMPLETO) })} onSalir={() => {}} />);
    expect(screen.getByText(`Turno del 28/10 ${hora(ab)} al 29/10 ${hora(ce)}`)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Este turno cruzó la medianoche: abrió un día y cerró al siguiente.",
    );
    const turno = within(screen.getByRole("region", { name: "Turno" }));
    expect(turno.getByText(`mié 28/10 · ${hora(ab)}`)).toBeInTheDocument();
    expect(turno.getByText(`jue 29/10 · ${hora(ce)}`)).toBeInTheDocument();
    expect(turno.getByText("15 h 13")).toBeInTheDocument();
    expect(turno.getByText("Ana Quispe")).toBeInTheDocument();
  });

  it("restaurante: lo vendido por forma de pago, las filas del cajón que dan el esperado, lo contado y la diferencia", () => {
    sesion.rubro = "RESTAURANTE";
    render(<CierreOk caja={cajaCerrada({ resumen: resumen(TURNO_COMPLETO) })} onSalir={() => {}} />);
    const vendido = within(screen.getByRole("region", { name: "Ventas del turno" }));
    expect(vendido.getByText("Ventas (3)")).toBeInTheDocument();
    expect(vendido.getByText("QR").nextElementSibling).toHaveTextContent("Bs 70,00");
    expect(vendido.getByText("Fiado otorgado (no es efectivo)")).toBeInTheDocument();
    const filas = filasDeCaja();
    expect(filas.reduce((s, [, m]) => s + m, 0)).toBe(440);
    const cajon = within(screen.getByRole("region", { name: "Efectivo en caja" }));
    expect(cajon.getByText("Efectivo esperado en caja").nextElementSibling).toHaveTextContent("Bs 440,00");
    expect(cajon.getByText("Efectivo contado").nextElementSibling).toHaveTextContent("Bs 438,00");
    expect(cajon.getByText("Faltante Bs 2,00")).toBeInTheDocument();
    expect(screen.getByText(/Recibido Bs.350,00 · cambio entregado Bs.20,00/)).toBeInTheDocument();
    expect(screen.getByText("Faltó cambio")).toBeInTheDocument();
  });

  it("un turno del mismo día lleva la fecha una vez y sin aviso", () => {
    sesion.rubro = "RESTAURANTE";
    const cierre = local(2026, 10, 28, 18, 30);
    render(<CierreOk caja={cajaCerrada({ fechaCierre: cierre, resumen: resumen() })} onSalir={() => {}} />);
    expect(screen.getByText(`Turno del 28/10, de ${hora(ab)} a ${hora(cierre)}`)).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("una caja que quedó abierta varios días lo dice", () => {
    sesion.rubro = "RESTAURANTE";
    render(
      <CierreOk caja={cajaCerrada({ fechaCierre: local(2026, 10, 30, 9, 0), resumen: resumen() })} onSalir={() => {}} />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("Esta caja estuvo abierta 3 días: abrió el 28/10 y cerró el 30/10.");
  });

  it("con un servidor que no manda el arqueo al cerrar, queda lo de siempre con el turno fechado", () => {
    sesion.rubro = "RESTAURANTE";
    render(<CierreOk caja={cajaCerrada()} onSalir={() => {}} />);
    expect(screen.getByText(`Turno del 28/10 ${hora(ab)} al 29/10 ${hora(ce)}`)).toBeInTheDocument();
    expect(screen.getByText("Fondo de apertura").nextElementSibling).toHaveTextContent("Bs 100,00");
    expect(screen.getByText("Faltante Bs 2,00")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ventas del turno" })).not.toBeInTheDocument();
  });

  it("billar: sólo suma; lo de siempre sigue (fondo, contado, diferencia y nota) y sin «recibido… cambio»", () => {
    sesion.rubro = "BILLAR";
    render(
      <CierreOk
        caja={cajaCerrada({ resumen: resumen({ montoApertura: 100, efectivo: 130, cambioEntregado: 70, saldoEsperado: 230 }) })}
        onSalir={() => {}}
      />,
    );
    expect(screen.getByText("Fondo de apertura").nextElementSibling).toHaveTextContent("Bs 100,00");
    expect(screen.getByText("Efectivo contado").nextElementSibling).toHaveTextContent("Bs 438,00");
    expect(screen.getByText("Faltante Bs 2,00")).toBeInTheDocument();
    expect(screen.getByText("Faltó cambio")).toBeInTheDocument();
    expect(screen.getByText(`Turno del 28/10 ${hora(ab)} al 29/10 ${hora(ce)}`)).toBeInTheDocument();
    expect(screen.queryByText(/cambio entregado/i)).not.toBeInTheDocument();
  });

  it("farmacia sigue con el comprobante de siempre", () => {
    sesion.rubro = "FARMACIA";
    render(<CierreOk caja={cajaCerrada({ resumen: resumen() })} onSalir={() => {}} />);
    expect(screen.getByText(`Turno de ${hora(ab)} a ${hora(ce)}`)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Turno" })).not.toBeInTheDocument();
    expect(screen.queryByText("Efectivo esperado en caja")).not.toBeInTheDocument();
    expect(screen.getByText("Faltante Bs 2,00")).toBeInTheDocument();
  });
});
