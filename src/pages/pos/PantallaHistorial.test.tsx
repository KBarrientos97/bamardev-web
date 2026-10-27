import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, CupoEstado, Venta } from "../../types";
import { cupoEmprendedor } from "../../test/cupoFixtures";

/**
 * El detalle de una venta en "Ventas del turno".
 *
 * En bamardev-restaurant cada renglón dice si fue para la mesa o para llevar,
 * como siempre. En una farmacia no hay mesas: la venta se guarda como de local
 * y cada medicamento salía marcado "Mesa".
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  cupo: null as CupoEstado | null,
  refrescarCupo: vi.fn(async () => {}),
  /** Sin features: la web falla abierto (`tieneFeature`). */
  features: undefined as string[] | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    negocio: { features: sesion.features },
    // Quien autoriza con PIN se autoriza a sí mismo (no le pide usuario).
    usuario: { rol: "ADMIN", permisos: ["ventas.anular", "autorizar.pin"] },
    puede: () => false,
    incluye: () => true,
    cupo: sesion.cupo,
    refrescarCupo: sesion.refrescarCupo,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getVentas: vi.fn(),
    getVenta: vi.fn(),
    getPedidosPendientes: vi.fn(),
    getCreditos: vi.fn(),
    anularVenta: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import PantallaHistorial from "./PantallaHistorial";

const venta = {
  id: 7,
  comprobante: "T-0007",
  estado: "APROBADO",
  fecha: "2026-09-30T19:00:00",
  total: 80,
  items: 2,
  detalles: [
    {
      productoId: 1,
      producto: "Pollo entero",
      cantidad: 1,
      precio: 60,
      subtotal: 60,
      nota: "sin cebolla",
      consumo: "MESA",
    },
    {
      productoId: 2,
      producto: "Gaseosa 2L",
      cantidad: 1,
      precio: 20,
      subtotal: 20,
      nota: null,
      consumo: "LLEVAR",
    },
  ],
  pagos: [{ formaPago: "Efectivo", monto: 80 }],
  formasPago: ["Efectivo"],
  tipoPedido: "LOCAL",
  estadoEntrega: null,
  prepagado: false,
  clienteNombre: null,
  clienteDireccion: null,
  clienteTelefono: null,
  tarifaEnvio: 0,
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
} as unknown as Venta;

beforeEach(() => {
  vi.clearAllMocks();
  sesion.cupo = null;
  sesion.features = undefined;
  vi.mocked(api.getVentas).mockResolvedValue([venta]);
  vi.mocked(api.getVenta).mockResolvedValue(venta);
  vi.mocked(api.getPedidosPendientes).mockResolvedValue([]);
  vi.mocked(api.getCreditos).mockResolvedValue([]);
});

async function abrirDetalle() {
  render(
    <MemoryRouter>
      <PantallaHistorial
        caja={{ id: 1 } as Caja}
        onAtras={() => {}}
        onCierre={() => {}}
        onVerComprobante={() => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /T-0007/ }));
  await screen.findByText("Pollo entero");
}

describe("bamardev-restaurant: cada renglón dice mesa o llevar", () => {
  it("como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirDetalle();
    expect(screen.getByText("Mesa")).toBeInTheDocument();
    expect(screen.getByText("Llevar")).toBeInTheDocument();
    expect(screen.getByText("sin cebolla")).toBeInTheDocument();
  });
});

describe("farmacia: no hay mesas", () => {
  it("los renglones no dicen Mesa ni Llevar, y la nota sigue", async () => {
    sesion.rubro = "FARMACIA";
    await abrirDetalle();
    expect(screen.queryByText("Mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Llevar")).not.toBeInTheDocument();
    expect(screen.getByText("sin cebolla")).toBeInTheDocument();
  });
});

describe("peluquería (QA ronda 1)", () => {
  it("M-09: los renglones no dicen Mesa ni Llevar", async () => {
    sesion.rubro = "PELUQUERIA";
    await abrirDetalle();
    expect(screen.queryByText("Mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Llevar")).not.toBeInTheDocument();
  });

  it("B-21: anular no promete devolver stock de servicios", async () => {
    sesion.rubro = "PELUQUERIA";
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    expect(dialogo).toHaveTextContent("si tenía productos, vuelven al inventario");
    expect(dialogo).not.toHaveTextContent("el stock vuelve al inventario");
  });

  it("restaurante: el texto de siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    expect(screen.getByRole("dialog", { name: "Anular venta" })).toHaveTextContent(
      "La venta queda anulada y el stock vuelve al inventario.",
    );
  });
});

describe("instituto (D5): la caja no trata la cuota como un producto", () => {
  const deCuotas = {
    ...venta,
    detalles: [{ productoId: 9, producto: "Barbería", cantidad: 1, precio: 750, subtotal: 750, nota: null, consumo: "LLEVAR", cuotaId: 11 }],
    cuotas: [
      {
        cuotaId: 11,
        concepto: "Cuota 1/3",
        numero: 1,
        totalCuotas: 3,
        carrera: "Barbería",
        materias: [{ id: 5, orden: 2, nombre: "Degradados" }],
        alumno: "Camila",
        cobrado: 750,
        pagado: 750,
        saldo: 0,
        estado: "PAGADA",
        saldoCurso: 1500,
        proximaCuota: null,
      },
    ],
  } as unknown as Venta;

  async function anular() {
    sesion.rubro = "ACADEMIA";
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Anular venta" }));
    });
    return screen.getByRole("dialog", { name: "Anular venta" });
  }

  function abrir(v: Venta) {
    vi.mocked(api.getVentas).mockResolvedValue([v]);
    vi.mocked(api.getVenta).mockResolvedValue(v);
    render(
      <MemoryRouter>
        <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
      </MemoryRouter>,
    );
    return screen.findByRole("button", { name: /T-0007/ });
  }

  it("una venta con cuotas dice «Cuota 1/3 · Barbería» y que la cuota vuelve a quedar pendiente", async () => {
    sesion.rubro = "ACADEMIA";
    fireEvent.click(await abrir(deCuotas));
    expect(await screen.findByText(/Cuota 1\/3 · Barbería/)).toBeInTheDocument();
    // D6: los módulos con su nombre, de las materias de la cuota (sin pedir el grupo).
    expect(screen.getByText("M2 Degradados")).toBeInTheDocument();
    const dialogo = await anular();
    expect(dialogo).toHaveTextContent("la cuota vuelve a quedar pendiente");
    expect(dialogo).not.toHaveTextContent("stock");
  });

  it("mientras el detalle no cargó, en un instituto no promete devolver stock", async () => {
    sesion.rubro = "ACADEMIA";
    vi.mocked(api.getVentas).mockResolvedValue([venta]);
    // El detalle nunca llega: no se sabe qué cobró.
    vi.mocked(api.getVenta).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /T-0007/ }));
    const dialogo = await anular();
    expect(dialogo).toHaveTextContent("si cobró cuotas, vuelven a quedar pendientes");
    expect(dialogo).not.toHaveTextContent("stock");
  });

  it("con el detalle leído y sin cuotas, la venta es de productos y vale el texto de siempre", async () => {
    sesion.rubro = "ACADEMIA";
    fireEvent.click(await abrir(venta));
    await screen.findByText("Pollo entero");
    const dialogo = await anular();
    expect(dialogo).toHaveTextContent("el stock vuelve al inventario");
    expect(dialogo).not.toHaveTextContent("si cobró cuotas");
  });
});

describe("anular una venta cobrada por QR (los dos rubros)", () => {
  // El bug: lo cobrado por QR no se podía anular. Anular no es devolver la
  // plata, es el asiento: bloquearlo dejaba el stock (y en farmacia el libro de
  // controlados) mintiendo, mientras el cliente igual se iba con su plata.
  const mixta = {
    ...venta,
    pagos: [
      { formaPago: "Efectivo", monto: 30 },
      { formaPago: "QR", monto: 50 },
    ],
    formasPago: ["Efectivo", "QR"],
  } as unknown as Venta;

  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.getVentas).mockResolvedValue([mixta]);
    vi.mocked(api.getVenta).mockResolvedValue(mixta);
    vi.mocked(api.anularVenta).mockResolvedValue({ ...mixta, estado: "ANULADO" } as Venta);
  });

  it("se ofrece anular, y el diálogo dice por dónde vuelve cada parte de la plata", async () => {
    await abrirDetalle();
    expect(screen.queryByText("Esta venta no se puede anular")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    expect(dialogo).toHaveTextContent(/Bs 50,00 por QR: devolvelos por QR o transferencia/);
    expect(dialogo).toHaveTextContent("No salen de la caja");
    expect(dialogo).toHaveTextContent(/Bs 30,00 en efectivo: salen de la caja/);
  });

  it("pide el motivo antes de anular, y lo manda con el PIN", async () => {
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), {
      target: { value: "1234" },
    });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(dialogo).toHaveTextContent("Elegí el motivo");
    expect(api.anularVenta).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolución del cliente" }));
    fireEvent.change(within(dialogo).getByLabelText("Detalle del motivo"), {
      target: { value: "no era el que quería" },
    });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(api.anularVenta).toHaveBeenCalledWith(7, {
      autorizadorPin: "1234",
      motivo: "Devolución del cliente · no era el que quería",
    });
  });

  it("una venta anulada dice el motivo", async () => {
    const anulada = {
      ...mixta,
      estado: "ANULADO",
      motivoAnulacion: "Error al cobrar",
      anulacionAutorizadaPor: "Regente",
    } as unknown as Venta;
    vi.mocked(api.getVentas).mockResolvedValue([anulada]);
    vi.mocked(api.getVenta).mockResolvedValue(anulada);
    await abrirDetalle();
    expect(screen.getByText("Motivo: Error al cobrar")).toBeInTheDocument();
    expect(screen.getByText("Autorizó: Regente")).toBeInTheDocument();
  });
});

describe("QA PER-08: el recibo de una venta de mostrador se vuelve a dar", () => {
  it("una venta cobrada en el local ofrece el comprobante y lo abre con la venta completa", async () => {
    const onVerComprobante = vi.fn();
    render(
      <MemoryRouter>
        <PantallaHistorial
          caja={{ id: 1 } as Caja}
          onAtras={() => {}}
          onCierre={() => {}}
          onVerComprobante={onVerComprobante}
        />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /T-0007/ }));
    await screen.findByText("Pollo entero");
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante" }));
    expect(onVerComprobante).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("una anulada no", async () => {
    const anulada = { ...venta, estado: "ANULADO" } as Venta;
    vi.mocked(api.getVentas).mockResolvedValue([anulada]);
    vi.mocked(api.getVenta).mockResolvedValue(anulada);
    await abrirDetalle();
    expect(screen.queryByRole("button", { name: "Ver comprobante" })).not.toBeInTheDocument();
  });
});

describe("QA DIA-15: un fiado no figura como una venta pagada en efectivo", () => {
  const listar = async () => {
    render(
      <MemoryRouter>
        <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
      </MemoryRouter>,
    );
    return (await screen.findByRole("button", { name: /T-0007/ })).textContent;
  };
  const credito = { montoTotal: 70, adelanto: 20, saldo: 50 } as Venta["credito"];

  it("con adelanto dice cuánto se pagó y cuánto quedó fiado", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([{ ...venta, total: 70, credito }]);
    expect(await listar()).toMatch(/Efectivo Bs.20,00 · Fiado Bs.50,00/);
  });

  it("sin adelanto, «Fiado/Crédito»", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([
      { ...venta, formasPago: [], pagos: [], credito: { ...credito!, adelanto: 0 } },
    ]);
    expect(await listar()).toMatch(/Fiado\/Crédito/);
  });

  it("una venta pagada, como siempre", async () => {
    const texto = await listar();
    expect(texto).toMatch(/· Efectivo/);
    expect(texto).not.toMatch(/Fiado/);
  });
});

describe("Plan Emprendedor: anular devuelve el lugar del día (D10)", () => {
  async function anularLaVenta() {
    vi.mocked(api.anularVenta).mockResolvedValue({ ...venta, estado: "ANULADO" } as Venta);
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), { target: { value: "1234" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolución del cliente" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(api.anularVenta).toHaveBeenCalled();
  }

  it("con cupo, después de anular se vuelve a pedir el contador (si no, el POS seguía bloqueado)", async () => {
    sesion.cupo = cupoEmprendedor({ ventas: 50, saldo: 0 });
    await anularLaVenta();
    expect(sesion.refrescarCupo).toHaveBeenCalledTimes(1);
  });

  it("sin cupo (Básico, Profesional) no pide nada de más", async () => {
    await anularLaVenta();
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
  });
});

describe("los pedidos por entregar según el plan", () => {
  function abrir() {
    render(
      <MemoryRouter>
        <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
      </MemoryRouter>,
    );
  }

  it("un restaurante Básico (recoger sin delivery) ve sus pedidos para recoger", async () => {
    // 14-oct: sólo se pedían con `delivery`. El pedido para recoger de otro
    // turno no aparecía y quedaba sin cobrar.
    sesion.features = ["pos", "caja", "recoger"];
    const pedido = { ...venta, id: 9, comprobante: "T-0009", tipoPedido: "RECOGER", estadoEntrega: "PENDIENTE", clienteNombre: "Ana" } as Venta;
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([pedido]);
    abrir();
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cobrar y entregar" })).toBeInTheDocument();
  });

  it("sin recoger ni delivery (un salón de belleza) no se piden: sería un 403 (QA M-11)", async () => {
    sesion.features = ["pos", "caja", "agenda"];
    abrir();
    await screen.findByRole("button", { name: /T-0007/ });
    expect(api.getPedidosPendientes).not.toHaveBeenCalled();
  });
});

describe("ventas a revisar (C1)", () => {
  // El backend acepta la venta (ya se cobró, casi siempre sin señal) pero la
  // marca: la marca tiene que verse en la lista y en el detalle, con el porqué.
  const marcada = {
    ...venta,
    requiereRevision: true,
    motivosRevision: ["PRECIO_NO_RECONOCIDO", "STOCK_NEGATIVO"],
  } as unknown as Venta;
  const limpia = { ...venta, id: 8, comprobante: "T-0008" } as unknown as Venta;

  function montar() {
    render(
      <MemoryRouter>
        <PantallaHistorial
          caja={{ id: 1 } as Caja}
          onAtras={() => {}}
          onCierre={() => {}}
          onVerComprobante={() => {}}
        />
      </MemoryRouter>,
    );
  }

  it("la lista la marca con el motivo en palabras, y el detalle lo repite", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([marcada]);
    vi.mocked(api.getVenta).mockResolvedValue(marcada);
    await abrirDetalle();
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("A revisar")).toBeInTheDocument();
    expect(within(dialogo).getByText("Precio que nunca existió en el catálogo")).toBeInTheDocument();
    expect(within(dialogo).getByText("Dejó stock negativo")).toBeInTheDocument();
  });

  it("en la fila: la marca y los motivos juntos", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([marcada]);
    montar();
    const fila = await screen.findByRole("button", { name: /T-0007/ });
    expect(fila).toHaveTextContent("A revisar");
    expect(fila).toHaveTextContent("Precio que nunca existió en el catálogo · Dejó stock negativo");
  });

  it("sin el campo (backend anterior) no se marca nada ni aparece el filtro", async () => {
    montar();
    const fila = await screen.findByRole("button", { name: /T-0007/ });
    expect(fila).not.toHaveTextContent("A revisar");
    expect(screen.queryByRole("button", { name: /Sólo a revisar/ })).not.toBeInTheDocument();
  });

  it("el filtro deja sólo las marcadas y el total del turno no cambia", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([marcada, limpia]);
    montar();
    await screen.findByRole("button", { name: /T-0008/ });
    fireEvent.click(screen.getByRole("button", { name: "Sólo a revisar (1)" }));
    expect(screen.getByRole("button", { name: /T-0007/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /T-0008/ })).not.toBeInTheDocument();
    // El resumen de arriba es del turno entero, no de lo filtrado.
    expect(screen.getByText(/2 ventas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(screen.getByRole("button", { name: /T-0008/ })).toBeInTheDocument();
  });

  it("un motivo que la web no conoce se muestra crudo, no se pierde", async () => {
    const rara = { ...marcada, motivosRevision: ["OTRO_MOTIVO_NUEVO"] } as unknown as Venta;
    vi.mocked(api.getVentas).mockResolvedValue([rara]);
    montar();
    expect(await screen.findByRole("button", { name: /T-0007/ })).toHaveTextContent(
      "OTRO_MOTIVO_NUEVO",
    );
  });
});
