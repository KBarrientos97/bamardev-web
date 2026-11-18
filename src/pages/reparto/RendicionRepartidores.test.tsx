import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Repartidores» (18-nov, CONTRATO-delivery-full §9): una tarjeta por
 * repartidor con lo que llevó y la plata. Con el control prendido, la cajera
 * tilda lo que recibe (todo tildado de entrada), confirma y vuelve a pedirse
 * la rendición; apagado, sólo se informa.
 */

vi.mock("../../lib/api", () => ({
  api: { rendicionReparto: vi.fn(), recibirRendicionReparto: vi.fn() },
}));

import { api } from "../../lib/api";
import { horaSinCortes } from "../../lib/repartoRendicion";
import RendicionRepartidores from "./RendicionRepartidores";

const PEDRO = {
  repartidorId: 129,
  nombre: "Pedro Rojas",
  entregados: 3,
  enCamino: 1,
  cobradoEfectivo: 250,
  cobradoQr: 80,
  envios: 21,
  pendiente: 190.1,
  recibido: 60,
  entregas: [
    { id: 55, ventaId: 900, comprobante: "V-000900", cliente: "Carla Mamani", entregadoEn: "2026-11-18T01:15:00.000Z", total: 130, efectivo: 130, qr: 0, envio: 7, estado: "PENDIENTE", recibidaEn: null, recibidaPorNombre: null },
    { id: 56, ventaId: 901, comprobante: "V-000901", cliente: "Juan Pérez", entregadoEn: "2026-11-18T01:40:00.000Z", total: 60.1, efectivo: 60.1, qr: 0, envio: 7, estado: "PENDIENTE", recibidaEn: null, recibidaPorNombre: null },
    { id: 40, ventaId: 880, comprobante: "V-000880", cliente: "Ana Vargas", entregadoEn: "2026-11-18T00:10:00.000Z", total: 60, efectivo: 60, qr: 0, envio: 7, estado: "RECIBIDA", recibidaEn: "2026-11-18T00:30:00.000Z", recibidaPorNombre: "Caja Uno" },
    { id: null, ventaId: 902, comprobante: "V-000902", cliente: "Luz Rocha", entregadoEn: null, total: 80, efectivo: 0, qr: 0, envio: 0, estado: null, recibidaEn: null, recibidaPorNombre: null },
  ],
  productos: {
    unidades: 9,
    categorias: [
      { nombre: "Pollos", unidades: 5, items: [{ nombre: "Brasa entero", cantidad: 2 }, { nombre: "Brasa cuarto", cantidad: 3 }] },
      { nombre: "Bebidas", unidades: 3, items: [{ nombre: "Gaseosa 2L", cantidad: 3 }] },
      { nombre: "Porciones", unidades: 1, items: [{ nombre: "Arroz (porción)", cantidad: 1 }] },
    ],
  },
};

const LUIS = {
  ...PEDRO,
  repartidorId: 130,
  nombre: "Luis Vaca",
  entregados: 1,
  enCamino: 0,
  cobradoEfectivo: 45,
  cobradoQr: 0,
  envios: 0,
  pendiente: 45,
  recibido: 0,
  entregas: [{ ...PEDRO.entregas[0], id: 70, ventaId: 950, comprobante: "V-000950", cliente: "Rosa Paz", total: 45, efectivo: 45 }],
  productos: { unidades: 1, categorias: [{ nombre: "Pollos", unidades: 1, items: [{ nombre: "Brasa cuarto", cantidad: 1 }] }] },
};

const ACTIVA = { activa: true, desde: "2026-11-18T10:00:00.000Z", pendiente: 235.1, recibido: 60, repartidores: [PEDRO, LUIS] };

const onRecibido = vi.fn();

async function abrir(datos: unknown = ACTIVA) {
  vi.mocked(api.rendicionReparto).mockResolvedValue(datos);
  render(<RendicionRepartidores almacenId={4} onClose={() => {}} onRecibido={onRecibido} />);
  await act(async () => {});
  return screen.getByRole("dialog", { name: "Repartidores" });
}

const tarjeta = (nombre: string) => within(screen.getByRole("listitem", { name: nombre }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("con «Controlar la plata de los repartidores» prendido", () => {
  it("cada tarjeta: pedidos, lo que llevó, lo cobrado y lo que le falta entregar", async () => {
    const modal = await abrir();
    expect(modal).toHaveTextContent("Lo que llevó cada uno y la plata que tiene que entregar.");
    expect(api.rendicionReparto).toHaveBeenCalledWith({ almacenId: 4 });
    const t = tarjeta("Pedro Rojas");
    expect(t.getByText("3 entregados · 1 en camino")).toBeInTheDocument();
    expect(t.getByRole("button", { name: /Llevó: Pollos 5 · Bebidas 3 · Porciones 1/ })).toBeInTheDocument();
    expect(t.getByText("Cobró en efectivo").nextElementSibling).toHaveTextContent("Bs 250,00");
    expect(t.getByText("Cobró por QR").parentElement).toHaveTextContent(/ya está en la cuenta\s*Bs 80,00/);
    expect(t.getByText("Envíos").parentElement).toHaveTextContent(/son del repartidor\s*Bs 21,00/);
    expect(t.getByText("Ya entregó a la caja").nextElementSibling).toHaveTextContent("Bs 60,00");
    expect(t.getByText("Le falta entregar").nextElementSibling).toHaveTextContent("Bs 190,10");
    // Sin la nota del control apagado.
    expect(modal).not.toHaveTextContent(/prendé «Controlar la plata/);
  });

  it("«Llevó» se despliega al detalle por producto", async () => {
    await abrir();
    const t = tarjeta("Pedro Rojas");
    fireEvent.click(t.getByRole("button", { name: /Llevó:/ }));
    const detalle = within(screen.getByRole("list", { name: "Llevó, por producto" }));
    expect(detalle.getByText("Brasa cuarto").nextElementSibling).toHaveTextContent("3");
    expect(detalle.getByText("Arroz (porción)")).toBeInTheDocument();
  });

  it("sólo las entregas sin recibir llevan casilla, todas tildadas de entrada, y el botón suma al centavo", async () => {
    await abrir();
    const t = tarjeta("Pedro Rojas");
    const casillas = t.getAllByRole("checkbox");
    expect(casillas).toHaveLength(2);
    expect(casillas.every((c) => (c as HTMLInputElement).checked)).toBe(true);
    const casilla = t.getByRole("checkbox", { name: /^V-000900 · Carla Mamani · .* Bs 130,00$/ });
    expect(casilla).toBeChecked();
    // La hora entera, con espacios duros: a 390 px no se parte «a.» / «m.» (QA 18-nov).
    expect(casilla.closest("label")!.textContent).toContain(horaSinCortes("2026-11-18T01:15:00.000Z"));
    // 130 + 60,10, sin cola de decimales.
    expect(t.getByRole("button", { name: "Recibí Bs 190,10" })).toBeEnabled();
  });

  it("destildar resta; «ninguna» deja el botón sin nada; «Marcar todas» vuelve, y no toca al otro repartidor", async () => {
    await abrir();
    const t = tarjeta("Pedro Rojas");
    fireEvent.click(t.getByRole("checkbox", { name: /V-000901/ }));
    expect(t.getByRole("button", { name: "Recibí Bs 130,00" })).toBeInTheDocument();
    fireEvent.click(t.getByRole("button", { name: "ninguna" }));
    expect(t.getByRole("button", { name: "Elegí qué recibiste" })).toBeDisabled();
    fireEvent.click(t.getByRole("button", { name: "Marcar todas" }));
    expect(t.getByRole("button", { name: "Recibí Bs 190,10" })).toBeInTheDocument();
    // Luis no cambió, y con una sola entrega no hay «Marcar todas / ninguna».
    const l = tarjeta("Luis Vaca");
    expect(l.getByRole("button", { name: "Recibí Bs 45,00" })).toBeInTheDocument();
    expect(l.queryByRole("button", { name: "Marcar todas" })).not.toBeInTheDocument();
  });

  it("pide confirmación; «Volver» no recibe nada", async () => {
    await abrir();
    fireEvent.click(tarjeta("Pedro Rojas").getByRole("button", { name: "Recibí Bs 190,10" }));
    const confirmacion = screen.getByRole("dialog", { name: "¿Recibiste Bs 190,10 de Pedro Rojas?" });
    expect(confirmacion).toHaveTextContent(
      "Las 2 entregas quedan como recibidas: esa plata pasa al cajón y deja de figurar en poder del repartidor.",
    );
    fireEvent.click(within(confirmacion).getByRole("button", { name: "Volver" }));
    expect(screen.queryByRole("dialog", { name: /¿Recibiste/ })).not.toBeInTheDocument();
    expect(api.recibirRendicionReparto).not.toHaveBeenCalled();
  });

  it("«Recibí» manda sólo las tildadas, vuelve a pedir la rendición y avisa al cierre con la nueva", async () => {
    await abrir();
    const t = tarjeta("Pedro Rojas");
    fireEvent.click(t.getByRole("checkbox", { name: /V-000901/ }));
    vi.mocked(api.recibirRendicionReparto).mockResolvedValue({ recibidas: 1, monto: 130 });
    const despues = {
      ...ACTIVA,
      pendiente: 105.1,
      repartidores: [
        { ...PEDRO, pendiente: 60.1, recibido: 190, entregas: PEDRO.entregas.map((e) => (e.id === 55 ? { ...e, estado: "RECIBIDA" } : e)) },
        LUIS,
      ],
    };
    vi.mocked(api.rendicionReparto).mockResolvedValue(despues);
    fireEvent.click(t.getByRole("button", { name: "Recibí Bs 130,00" }));
    const confirmacion = screen.getByRole("dialog", { name: "¿Recibiste Bs 130,00 de Pedro Rojas?" });
    await act(async () => {
      fireEvent.click(within(confirmacion).getByRole("button", { name: "Recibí" }));
    });
    expect(api.recibirRendicionReparto).toHaveBeenCalledWith([55]);
    expect(api.rendicionReparto).toHaveBeenCalledTimes(2);
    expect(onRecibido).toHaveBeenCalledTimes(1);
    expect(onRecibido.mock.calls[0][0]).toMatchObject({ pendiente: 105.1 });
    // La tarjeta con los números del servidor. QA 18-nov, bug 3: lo que queda
    // vuelve a estar tildado (quedaba destildado con «Elegí qué recibiste»).
    const t2 = tarjeta("Pedro Rojas");
    expect(t2.getByText("Le falta entregar").nextElementSibling).toHaveTextContent("Bs 60,10");
    expect(t2.getAllByRole("checkbox")).toHaveLength(1);
    expect(t2.getByRole("checkbox", { name: /V-000901/ })).toBeChecked();
    expect(t2.getByRole("button", { name: "Recibí Bs 60,10" })).toBeEnabled();
    expect(screen.queryByRole("dialog", { name: /¿Recibiste/ })).not.toBeInTheDocument();
  });

  it("si el recibo falla, lo destildado sigue destildado (no se pierde lo que eligió)", async () => {
    await abrir();
    const t = tarjeta("Pedro Rojas");
    fireEvent.click(t.getByRole("checkbox", { name: /V-000901/ }));
    vi.mocked(api.recibirRendicionReparto).mockRejectedValue(new Error("Sin conexión"));
    fireEvent.click(t.getByRole("button", { name: "Recibí Bs 130,00" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: /¿Recibiste/ })).getByRole("button", { name: "Recibí" }));
    });
    expect(tarjeta("Pedro Rojas").getByRole("checkbox", { name: /V-000901/ })).not.toBeChecked();
    expect(tarjeta("Pedro Rojas").getByRole("button", { name: "Recibí Bs 130,00" })).toBeInTheDocument();
  });

  it("si el servidor rechaza (no podés recibir tu propia plata), lo dice en la tarjeta y no avisa al cierre", async () => {
    await abrir();
    vi.mocked(api.recibirRendicionReparto).mockRejectedValue(new Error("No podés recibir tu propia plata"));
    fireEvent.click(tarjeta("Luis Vaca").getByRole("button", { name: "Recibí Bs 45,00" }));
    expect(screen.getByRole("dialog", { name: /¿Recibiste/ })).toHaveTextContent("La entrega queda como recibida: esa plata");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: /¿Recibiste/ })).getByRole("button", { name: "Recibí" }));
    });
    expect(tarjeta("Luis Vaca").getByText("No podés recibir tu propia plata")).toBeInTheDocument();
    expect(onRecibido).not.toHaveBeenCalled();
  });
});

describe("QA 18-nov, bug 1: «Tiene que entregar» / «Le falta entregar» es el `aEntregar` del backend", () => {
  /** V-000903 lo cobró la cajera con «Cobrar y entregar»: su plata ya está en la caja. */
  const COBRADO_POR_CAJA = {
    id: null, ventaId: 903, comprobante: "V-000903", cliente: "Ana Torrez", entregadoEn: "2026-11-18T07:20:00.000Z",
    total: 33, efectivo: 0, qr: 0, envio: 7, estado: null, recibidaEn: null, recibidaPorNombre: null, cobroLaCaja: true,
  };

  it("apagado: lo que él tiene (sin lo que cobró la caja ni lo ya recibido), no todo lo cobrado", async () => {
    await abrir({
      ...ACTIVA,
      activa: false,
      repartidores: [
        {
          ...PEDRO,
          cobradoEfectivo: 257,
          pendiente: 0,
          recibido: 0,
          aEntregar: 76,
          entregas: [...PEDRO.entregas.map((e) => ({ ...e, id: null, estado: null })), COBRADO_POR_CAJA],
        },
      ],
    });
    const t = tarjeta("Pedro Rojas");
    expect(t.getByText("Tiene que entregar").nextElementSibling).toHaveTextContent("Bs 76,00");
    // El pedido de la caja se ve, con su aclaración y sin casilla.
    const deLaCaja = t.getByText(/V-000903 · Ana Torrez/).closest("li") as HTMLElement;
    expect(deLaCaja).toHaveTextContent("Cobró la caja");
    expect(deLaCaja).toHaveTextContent("Bs 33,00");
    expect(t.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("prendido: el mismo número; el pedido que cobró la caja nunca lleva casilla, aunque viniera PENDIENTE", async () => {
    await abrir({
      ...ACTIVA,
      repartidores: [{ ...PEDRO, pendiente: 190.1, aEntregar: 190.1, entregas: [...PEDRO.entregas, { ...COBRADO_POR_CAJA, id: 77, estado: "PENDIENTE" }] }],
    });
    const t = tarjeta("Pedro Rojas");
    expect(t.getByText("Le falta entregar").nextElementSibling).toHaveTextContent("Bs 190,10");
    expect(t.getAllByRole("checkbox")).toHaveLength(2);
    expect(t.queryByRole("checkbox", { name: /V-000903/ })).not.toBeInTheDocument();
    expect(t.getByText(/V-000903 · Ana Torrez/).closest("li")).toHaveTextContent("Cobró la caja");
    expect(t.getByRole("button", { name: "Recibí Bs 190,10" })).toBeInTheDocument();
  });

  it("un backend anterior (sin `aEntregar`): apagado, lo cobrado en efectivo, como antes", async () => {
    await abrir({ ...ACTIVA, activa: false, repartidores: [{ ...PEDRO, pendiente: 0, recibido: 0 }] });
    expect(tarjeta("Pedro Rojas").getByText("Tiene que entregar").nextElementSibling).toHaveTextContent("Bs 250,00");
  });
});

describe("la plata que recibe otra caja", () => {
  /** Pedro: 130 que recibe esta caja y 60,10 que cuenta el arqueo de la caja de Ana. */
  const CON_OTRA_CAJA = {
    ...ACTIVA,
    repartidores: [
      {
        ...PEDRO,
        entregas: PEDRO.entregas.map((e) => (e.id === 56 ? { ...e, puedeRecibir: false, cajaDe: "Ana Quispe" } : { ...e, puedeRecibir: true })),
      },
    ],
  };

  it("va sin casilla, dice qué caja la recibe y no suma en «Recibí»; «Le falta entregar» sigue con todo", async () => {
    await abrir(CON_OTRA_CAJA);
    const t = tarjeta("Pedro Rojas");
    expect(t.getAllByRole("checkbox")).toHaveLength(1);
    expect(t.queryByRole("checkbox", { name: /V-000901/ })).not.toBeInTheDocument();
    const deOtra = t.getByText(/V-000901 · Juan Pérez/).closest("li") as HTMLElement;
    expect(deOtra).toHaveTextContent("La recibe la caja de Ana Quispe");
    expect(deOtra).toHaveTextContent("Bs 60,10");
    expect(t.getByText("Le falta entregar").nextElementSibling).toHaveTextContent("Bs 190,10");
    // Con una sola tildable no hay «Marcar todas / ninguna».
    expect(t.queryByRole("button", { name: "Marcar todas" })).not.toBeInTheDocument();
    vi.mocked(api.recibirRendicionReparto).mockResolvedValue({ recibidas: 1, monto: 130 });
    fireEvent.click(t.getByRole("button", { name: "Recibí Bs 130,00" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "¿Recibiste Bs 130,00 de Pedro Rojas?" })).getByRole("button", { name: "Recibí" }));
    });
    expect(api.recibirRendicionReparto).toHaveBeenCalledWith([55]);
  });

  it("si todo lo pendiente es de otra caja, no hay botón ni casillas (sin nombre: «La recibe otra caja»)", async () => {
    await abrir({
      ...ACTIVA,
      repartidores: [{ ...PEDRO, entregas: PEDRO.entregas.map((e) => (e.estado === "PENDIENTE" ? { ...e, puedeRecibir: false, cajaDe: null } : e)) }],
    });
    const t = tarjeta("Pedro Rojas");
    expect(t.queryAllByRole("checkbox")).toHaveLength(0);
    expect(t.queryByRole("button", { name: /^Recibí|Elegí qué recibiste/ })).not.toBeInTheDocument();
    expect(t.getAllByText("La recibe otra caja")).toHaveLength(2);
    expect(t.getByText("Le falta entregar").nextElementSibling).toHaveTextContent("Bs 190,10");
  });

  it("un 403 del servidor (una fila de otra caja) se muestra con su mensaje, tal cual", async () => {
    await abrir();
    vi.mocked(api.recibirRendicionReparto).mockRejectedValue(
      Object.assign(new Error("Esa plata la recibe la caja de Ana Quispe."), { status: 403 }),
    );
    fireEvent.click(tarjeta("Pedro Rojas").getByRole("button", { name: "Recibí Bs 190,10" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: /¿Recibiste/ })).getByRole("button", { name: "Recibí" }));
    });
    expect(tarjeta("Pedro Rojas").getByText("Esa plata la recibe la caja de Ana Quispe.")).toBeInTheDocument();
    expect(onRecibido).not.toHaveBeenCalled();
  });
});

describe("con el control apagado", () => {
  it("sólo informa: «Tiene que entregar» es todo el efectivo, sin casillas, y la nota va una sola vez al pie", async () => {
    const modal = await abrir({
      ...ACTIVA,
      activa: false,
      pendiente: 0,
      recibido: 0,
      repartidores: [PEDRO, LUIS].map((r) => ({ ...r, pendiente: 0, recibido: 0, entregas: r.entregas.map((e) => ({ ...e, id: null, estado: null })) })),
    });
    const t = tarjeta("Pedro Rojas");
    expect(t.getByText("Tiene que entregar").nextElementSibling).toHaveTextContent("Bs 250,00");
    expect(t.queryByText("Le falta entregar")).not.toBeInTheDocument();
    expect(t.queryByText("Ya entregó a la caja")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Recibí/ })).not.toBeInTheDocument();
    expect(
      within(modal).getAllByText(
        "Para registrar cada entrega de plata, prendé «Controlar la plata de los repartidores» en Configuración › Punto de venta.",
      ),
    ).toHaveLength(1);
  });

  it("un negocio sin QR ni tarifas no ve renglones en cero", async () => {
    await abrir({ ...ACTIVA, activa: false, repartidores: [{ ...LUIS, pendiente: 0, recibido: 0 }] });
    const t = tarjeta("Luis Vaca");
    expect(t.queryByText("Cobró por QR")).not.toBeInTheDocument();
    expect(t.queryByText("Envíos")).not.toBeInTheDocument();
  });
});

describe("vacío y errores", () => {
  it("sin repartos: «Hoy ningún repartidor llevó pedidos.»", async () => {
    const modal = await abrir({ activa: true, desde: null, pendiente: 0, recibido: 0, repartidores: [] });
    expect(modal).toHaveTextContent("Hoy ningún repartidor llevó pedidos.");
  });

  it("si no carga, lo dice con «Reintentar» (nunca «no hay nada»)", async () => {
    vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Sin conexión"));
    render(<RendicionRepartidores onClose={() => {}} onRecibido={onRecibido} />);
    await act(async () => {});
    const modal = screen.getByRole("dialog", { name: "Repartidores" });
    expect(modal).toHaveTextContent("Sin conexión");
    expect(modal).not.toHaveTextContent("Hoy ningún repartidor");
    expect(within(modal).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
