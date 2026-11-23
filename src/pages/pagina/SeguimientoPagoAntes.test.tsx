import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Seguimiento } from "../../lib/pedidosWeb/tipos";
import SeguimientoPedido, { REFRESCO_ESPERANDO_PAGO_MS, restante } from "./SeguimientoPedido";

/**
 * El seguimiento cuando el cliente paga por QR ANTES (PLAN-PEDIDOS-QR): el QR
 * con el monto de los productos, «Descargar QR», la cuenta regresiva, la
 * consulta cada 4 s mientras espera, y lo que dice después (pagado, vencido
 * sin pagar, rechazado ya pagado).
 */

vi.mock("./MapaSeguimiento", () => ({ default: () => <div data-testid="mapa" /> }));

const TOKEN = "Ab3_x-9QkLm2Ab3_x-9QkLm2Ab3_x-9QkLm2";

const BASE: Seguimiento = {
  numero: 7,
  tipo: "DELIVERY",
  estado: "ESPERANDO_PAGO",
  motivoRechazo: null,
  creadoEn: "2026-11-13T20:00:00.000Z",
  aceptadoEn: null,
  salioEn: null,
  entregadoEn: null,
  lineas: [{ titulo: "Arroz con leche grande", cantidad: 2, precio: 50, subtotal: 100 }],
  subtotal: 100,
  envio: 9,
  total: 109,
  formaPago: "QR",
  pagaCon: null,
  cambio: null,
  direccion: "Calle Los Tajibos 23",
  referencia: null,
  destino: { latitud: -17.76, longitud: -63.18 },
  sucursal: { nombre: "Las Brisas", latitud: -17.7496, longitud: -63.1748 },
  repartidor: null,
  posicion: null,
  whatsappLocal: "https://wa.me/59170123456",
  pago: { pendiente: true, monto: 100, qrUrl: `/publico/pedidos/elganadero/${TOKEN}/qr` },
  prepago: { modo: "AUTOMATICO", monto: 100, pagado: false, venceEn: new Date(Date.now() + 14 * 60_000).toISOString() },
};

function servidor(inicial: Partial<Seguimiento>) {
  let actual = inicial;
  const f = vi.fn(async (url: string) => {
    if (url === "/api/publico/pagina/elganadero") {
      return new Response(JSON.stringify({ subdominio: "elganadero", nombre: "El Ganadero", color: { clave: "NARANJA", hex: "#B4501A" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ...BASE, ...actual }), { status: 200 });
  });
  vi.stubGlobal("fetch", f);
  return {
    cambiar: (c: Partial<Seguimiento>) => {
      actual = c;
    },
    consultas: () => f.mock.calls.filter(([u]) => String(u).endsWith(TOKEN)).length,
  };
}

async function montar() {
  render(
    <MemoryRouter initialEntries={[`/p/elganadero/pedido/${TOKEN}`]}>
      <Routes>
        <Route path="/p/:subdominio/pedido/:token" element={<SeguimientoPedido />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pagar por QR antes", () => {
  it("esperando el pago: el QR con el monto de los productos, Descargar QR y la cuenta regresiva", async () => {
    servidor({});
    await montar();
    expect(await screen.findByText(/Pagá Bs 100 con el QR/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR para pagar tu pedido" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar QR" })).toHaveAttribute("download");
    expect(screen.getByText(/Apenas pagues, tu pedido llega al local/)).toBeInTheDocument();
    expect(screen.getByText("El envío lo pagás al recibir.")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/Tenés 1[34]:\d\d para pagar/);
    // El primer paso es «Pago» y es el actual.
    expect(screen.getByText("Pago", { selector: "span" }).closest("li")).toHaveAttribute("aria-current", "step");
    // Mientras espera el pago se puede cancelar.
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeInTheDocument();
  });

  it("con el QR fijo dice que el local confirma el pago", async () => {
    servidor({ prepago: { ...BASE.prepago!, modo: "FIJO" } });
    await montar();
    expect(await screen.findByText(/Cuando el local vea tu pago, recibe tu pedido/)).toBeInTheDocument();
  });

  it("pregunta cada 4 s mientras espera y, al pagar, dice que el local ya lo tiene", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const s = servidor({});
    await montar();
    expect(await screen.findByText(/Pagá Bs 100/)).toBeInTheDocument();
    const antes = s.consultas();
    s.cambiar({ estado: "RECIBIDO", pago: null, prepago: { ...BASE.prepago!, pagado: true } });
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_ESPERANDO_PAGO_MS);
    });
    expect(s.consultas()).toBeGreaterThan(antes);
    expect(await screen.findByText(/¡Pago recibido! El local ya tiene tu pedido/)).toBeInTheDocument();
    expect(screen.getByText(/Pagaste Bs 100 con QR\. El envío \(Bs 9\) lo pagás al recibir\./)).toBeInTheDocument();
    // Pagado, ya no se cancela por acá.
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
  });

  it("vencido sin pagar: «No se completó el pago» y que no se cobró nada", async () => {
    servidor({ estado: "VENCIDO", pago: null });
    await montar();
    expect(await screen.findByText("No se completó el pago")).toBeInTheDocument();
    expect(screen.getByText(/no se cobró nada/)).toBeInTheDocument();
  });

  it("rechazado ya pagado: el local le devuelve la plata", async () => {
    servidor({ estado: "RECHAZADO", pago: null, motivoRechazo: "Se terminó el arroz", prepago: { ...BASE.prepago!, pagado: true } });
    await montar();
    expect(await screen.findByText(/Ya habías pagado Bs 100: el local te lo devuelve/)).toBeInTheDocument();
  });
});

describe("restante", () => {
  it("minutos y segundos hasta el vencimiento; null si ya pasó", () => {
    const ahora = Date.parse("2026-11-21T10:00:00Z");
    expect(restante("2026-11-21T10:14:59Z", ahora)).toBe("14:59");
    expect(restante("2026-11-21T10:00:01Z", ahora)).toBe("0:01");
    expect(restante("2026-11-21T09:59:59Z", ahora)).toBeNull();
    expect(restante(undefined, ahora)).toBeNull();
  });
});
