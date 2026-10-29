import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../lib/api";
import type { ClienteCredito } from "../../types";
import RutasBillar from "./RutasBillar";
import { leerBillar, recargar } from "./store";

// La primera vez se transforma todo el billar: en una máquina cargada pasa los 5 s.
vi.setConfig({ testTimeout: 60_000 });

/**
 * Cerrar una mesa con la cuenta vieja (prueba profunda, 18-oct). El servidor
 * cobra hasta la hora de la cuenta sólo si es de hace menos de 5 minutos; si
 * no, MESA_CAMBIO y la pantalla recalcula a la hora de ahora. El tiempo siguió
 * corriendo y el saldo puede haber subido: antes subía solo, lo recibido
 * quedaba escrito con el vuelto de la cuenta vieja y el botón seguía prendido.
 *
 * Los casos de la revisión del arreglo (18-oct) van abajo: el mismo total, un
 * rechazo que no es por la hora, lo pagado de más, el QR ya cobrado, otro
 * equipo que carga algo y el fiado.
 */

const request = vi.hoisted(() => vi.fn());
const reloj = vi.hoisted(() => ({ ahora: 0 }));
const sesion = vi.hoisted(() => ({ alias: "billar-cerrar-0" }));
/** Lo que cambia de un caso a otro. */
const caso = vi.hoisted(() => ({
  jugadosMin: 47,
  pagos: [] as unknown[],
  consumoExtra: false,
  demoraTablero: 0,
  promos: [] as unknown[],
  sesionId: 77,
  /** Pausada hace N min (respecto de T0), o null. */
  pausadaHace: null as number | null,
  /** Cuándo se reanudó (ms), o null. */
  reanudadaEn: null as number | null,
  /** La mesa sin cuenta abierta. */
  libre: false,
  cerrar: (_cuerpo: Record<string, unknown>, _vez: number): unknown => {
    throw new Error("sin caso");
  },
}));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: {
    getFormasPago: vi.fn(async () => [
      { id: 1, nombre: "Efectivo" },
      { id: 2, nombre: "QR" },
    ]),
    getClientesCredito: vi.fn(async () => []),
    qrCobro: vi.fn(async () => ({ imagen: null })),
  },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: {
      id: 1,
      sucursalId: null,
      sucursal: null,
      permisos: ["billar.operar", "ventas.vender", "credito.otorgar"],
    },
    negocio: { alias: sesion.alias, nombre: "Billar de prueba", features: [] },
    incluye: () => true,
  }),
}));

const POOL = { id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [] };
const pool = () => ({ ...POOL, promos: caso.promos });
// 22:00 de Bolivia.
const T0 = Date.UTC(2026, 9, 19, 2, 0);
const MIN = 60_000;

function mesaApi() {
  if (caso.libre) return { id: 50, numero: 5, tipo: "pool", estado: "libre", libreDesde: T0 - 60 * MIN };
  const pausa = caso.pausadaHace === null ? null : T0 - caso.pausadaHace * MIN;
  return {
    id: 50,
    numero: 5,
    tipo: "pool",
    estado: "abierta",
    // Con 47 min jugados al entrar al cierre: 45 min, Bs 15. A los 53, Bs 20.
    sesion: {
      id: caso.sesionId,
      version: (caso.consumoExtra ? 2 : 1) + (caso.reanudadaEn ? 1 : 0),
      start: T0 - caso.jugadosMin * MIN,
      abierta: T0 - caso.jugadosMin * MIN,
      pausedAt: pausa !== null && caso.reanudadaEn === null ? pausa : null,
      pausaDesde: pausa !== null && caso.reanudadaEn === null ? pausa : undefined,
      pausedTotal: pausa !== null && caso.reanudadaEn !== null ? (caso.reanudadaEn - pausa) / 1000 : 0,
      pausas: pausa !== null && caso.reanudadaEn !== null ? [{ desde: pausa, hasta: caso.reanudadaEn }] : [],
      prepago: null,
      prev: null,
      tarifa: pool(),
      consumos: caso.consumoExtra
        ? [{ id: 9, productoId: 300, nombre: "Paceña", precio: 10, cant: 1, hora: T0, anulado: false }]
        : [],
      pagos: caso.pagos,
    },
  };
}

function tablero() {
  return {
    ahora: reloj.ahora,
    sucursal: { id: 1, nombre: "Principal" },
    caja: { abierta: true, id: 9, desde: T0 - 3 * 60 * MIN, inicial: 100, sucursalId: null },
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [pool()],
    mesas: [mesaApi()],
  };
}

/** Los cuerpos de cada POST /cerrar, en orden. */
const cobros: Record<string, unknown>[] = [];

async function montar() {
  render(
    <MemoryRouter initialEntries={["/billar/cerrar/5"]}>
      <Routes>
        <Route path="/billar/*" element={<RutasBillar />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findByText("Total a cobrar");
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toca y deja que lleguen la respuesta y la recarga del tablero. */
async function tocar(boton: HTMLElement, ms = 50) {
  await act(async () => {
    fireEvent.click(boton);
  });
  await act(async () => {
    await esperar(ms);
  });
}

/** Se tardó más de 5 minutos en cobrar: el servidor no acepta la hora vieja. */
const cuentaVieja = () => {
  reloj.ahora = T0 + 6 * MIN;
  return new ApiError("La cuenta quedó vieja: volvé a abrir el cierre de la mesa.", 400, { codigo: "MESA_CAMBIO" });
};
const ventaHecha = () => ({
  venta: { id: 1001, comprobante: "V-000123" },
  mesa: { id: 50, numero: 5, tipo: "pool", estado: "libre", libreDesde: reloj.ahora },
});
/** La primera vez la cuenta quedó vieja; después cobra. */
const viejaYDespuesCobra = (_cuerpo: Record<string, unknown>, vez: number) => {
  if (vez === 1) throw cuentaVieja();
  return ventaHecha();
};

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-cerrar-${++vuelta}`;
  reloj.ahora = T0;
  caso.jugadosMin = 47;
  caso.pagos = [];
  caso.consumoExtra = false;
  caso.demoraTablero = 0;
  caso.promos = [];
  caso.sesionId = 77;
  caso.pausadaHace = null;
  caso.reanudadaEn = null;
  caso.libre = false;
  caso.cerrar = viejaYDespuesCobra;
  cobros.length = 0;
  vi.spyOn(Date, "now").mockImplementation(() => reloj.ahora);
  request.mockReset();
  request.mockImplementation(async (url: string, opciones?: { body?: string }) => {
    if (url.startsWith("/billar/tablero")) {
      if (caso.demoraTablero) await esperar(caso.demoraTablero);
      return tablero();
    }
    if (url.endsWith("/reanudar")) {
      caso.reanudadaEn = reloj.ahora;
      return mesaApi();
    }
    if (url.endsWith("/cerrar")) {
      const cuerpo = JSON.parse(opciones?.body ?? "{}") as Record<string, unknown>;
      cobros.push(cuerpo);
      return caso.cerrar(cuerpo, cobros.length);
    }
    return [];
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cerrar mesa con la cuenta vieja", () => {
  it("si el saldo subió, avisa, no deja cobrar y al aceptar borra lo recibido", async () => {
    await montar();
    expect(screen.getByText(/Mesa 5 · Total Bs.15,00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    expect(screen.getByText(/Bs.5,00/)).toBeInTheDocument();

    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));

    // Ahora son 53 min: 1:00, Bs 20. El vuelto de Bs 5 ya no sirve.
    expect(await screen.findByText(/Pasaron 5 minutos/)).toHaveTextContent(/ahora el saldo es Bs.20,00 \(era Bs.15,00\)/);
    expect(screen.getByRole("button", { name: /Cobrar Bs.20,00/ })).toBeDisabled();
    // El "volvé a abrir el cierre" del servidor no se muestra: ya se recalculó.
    expect(screen.queryByText(/volvé a abrir el cierre/)).not.toBeInTheDocument();

    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.20,00/ }), 0);
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
    // Lo recibido se vuelve a escribir contando el efectivo de la cuenta nueva.
    expect((screen.getByLabelText("Efectivo entregado por el cliente") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: /Cobrar Bs.20,00/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: /Cobrar Bs.20,00/ })).toBeEnabled();
  });

  it("con el mismo total no queda nada en rojo, y el reintento va con la hora de ahora y otra clave", async () => {
    // 34 min: 45 min, Bs 15; a los 40 sigue en 45 min.
    caso.jugadosMin = 34;
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/volvé a abrir el cierre/)).not.toBeInTheDocument();
    // Sin esto, el primer toque parecía no hacer nada (revisión del 18-oct).
    expect(screen.getByText(/La cuenta se actualizó a las .+ y el monto es el mismo: tocá «Cobrar» otra vez\./)).toBeInTheDocument();

    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(cobros).toHaveLength(2);
    // La clave es la de la cuenta nueva: la vieja la habría rechazado igual.
    expect(cobros[1].clienteRequestId).not.toBe(cobros[0].clienteRequestId);
    expect(cobros[1].hasta).toBe(new Date(T0 + 6 * MIN).toISOString());
  });

  it("un rechazo con la hora al día y el mismo total deja el mensaje del servidor a la vista", async () => {
    // Revisión del 18-oct: se borraba igual. Con la web calculando distinto
    // que el servidor (una pestaña vieja después de un pase), el cajero
    // tocaba Cobrar y no pasaba nada, sin ningún texto.
    caso.cerrar = () => {
      throw new ApiError("La cuenta de la Mesa 5 cambió mientras cobrabas: ahora son Bs 25,00.", 400, { codigo: "MESA_CAMBIO" });
    };
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    for (let i = 0; i < 2; i++) await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(cobros).toHaveLength(2);
    expect(screen.getByText(/ahora son Bs 25,00\. Si vuelve a pasar con el mismo monto, recargá la página \(F5\)\./)).toBeInTheDocument();
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
  });

  it("con lo pagado de más, si cambia lo que hay que devolver avisa y no deja cerrar hasta aceptarlo", async () => {
    // Revisión del 18-oct: el saldo era 0 antes y después y la devolución
    // pasaba de Bs 15 a Bs 10 sin aviso: el que ya había devuelto 15 dejaba
    // el cajón Bs 5 corto.
    caso.pagos = [{ id: 1, hora: T0 - 40 * MIN, formaPagoId: 1, metodo: "Efectivo", monto: 30, recibido: 30, concepto: "ADELANTO" }];
    await montar();
    expect(screen.getByText(/Pagó Bs.15,00 de más/)).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /^Cerrar mesa$/ }));

    // Con el medio: el adelanto fue en efectivo.
    expect(screen.getByText(/Pasaron 5 minutos/)).toHaveTextContent(
      /ahora hay que devolver Bs.10,00 en efectivo \(era Bs.15,00\)\. Si ya devolviste Bs.15,00, pedile Bs.5,00 al cliente antes de cerrar\./,
    );
    expect(screen.getByRole("button", { name: /^Cerrar mesa$/ })).toBeDisabled();
    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · devolver Bs.10,00/ }), 0);
    expect(screen.getByText(/Pagó Bs.10,00 de más/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cerrar mesa$/ })).toBeEnabled();
  });

  it("con el QR ya confirmado, la cuenta nueva queda en Mixto con lo que ya entró por QR", async () => {
    // Revisión del 18-oct: volvía a Efectivo y el aviso hablaba sólo del
    // vuelto. Lo natural era confirmar un QR de Bs 20 mirando en el banco el
    // de Bs 15, y se registraban Bs 5 que no llegaron.
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /QR/ }));
    await tocar(screen.getByRole("button", { name: /Confirmar pago recibido/ }), 0);
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(screen.getByText(/Pasaron 5 minutos/)).toHaveTextContent(
      /Si ya te pagaron Bs.15,00 por QR, no lo cobres otra vez: al aceptar queda en Mixto, con Bs.15,00 por QR y Bs.5,00 en efectivo\./,
    );

    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.20,00/ }), 0);
    expect(screen.getByRole("radio", { name: /Mixto/ })).toHaveAttribute("aria-checked", "true");
    expect((screen.getByLabelText("En efectivo") as HTMLInputElement).value).toBe("5,00");
    // El QR se vuelve a confirmar: es por los Bs 15 que ya están en el banco.
    await tocar(screen.getByRole("button", { name: /Confirmar pago recibido/ }), 0);
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.20,00/ }));
    expect(cobros).toHaveLength(2);
    expect(cobros[1].pagos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ formaPagoId: 2, monto: 15 }),
        expect.objectContaining({ formaPagoId: 1, monto: 5 }),
      ]),
    );
  });

  it("si otro equipo carga algo después del aviso, la cuenta nueva no deja el rojo de antes", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(screen.getByText(/Pasaron 5 minutos/)).toBeInTheDocument();
    caso.consumoExtra = true;
    await act(async () => {
      await recargar(true);
    });
    expect(screen.getByText(/La cuenta cambió mientras cobrabas \(otro equipo/)).toBeInTheDocument();
    expect(screen.queryByText(/volvé a abrir el cierre/)).not.toBeInTheDocument();

    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.30,00/ }), 0);
    // Revisión del 18-oct: quedaba en rojo debajo de la cuenta nueva.
    expect(screen.queryByText(/volvé a abrir el cierre/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
  });

  it("si la cuenta sube mientras se fía, vuelve al cierre con el aviso", async () => {
    await montar();
    await tocar(screen.getByRole("button", { name: /Pasar saldo a fiado/ }), 0);
    fireEvent.change(screen.getByPlaceholderText("Ej. Kevin Barrientos"), { target: { value: "Juan Pérez" } });
    await tocar(screen.getByRole("button", { name: /Registrar fiado/ }));
    expect(screen.queryByText("Venta a crédito")).not.toBeInTheDocument();
    expect(screen.getByText(/Pasaron 5 minutos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pasar saldo a fiado/ })).toBeDisabled();
  });

  it("en el fiado, si otro equipo cargó algo recién, el primer rechazo ya se ve", async () => {
    // Revisión del 18-oct: el rechazo se borraba antes de que llegara el
    // tablero nuevo, y la pantalla del fiado se quedaba con el saldo viejo y
    // sin ningún mensaje hasta el segundo toque.
    caso.cerrar = () => {
      caso.consumoExtra = true;
      caso.demoraTablero = 300;
      throw new ApiError("La cuenta de la Mesa 5 cambió mientras cobrabas: ahora son Bs 25,00.", 400, { codigo: "MESA_CAMBIO" });
    };
    await montar();
    await tocar(screen.getByRole("button", { name: /Pasar saldo a fiado/ }), 0);
    fireEvent.change(screen.getByPlaceholderText("Ej. Kevin Barrientos"), { target: { value: "Juan Pérez" } });
    await tocar(screen.getByRole("button", { name: /Registrar fiado/ }), 20);
    expect(screen.getByText(/cambió mientras cobrabas: ahora son Bs 25,00/)).toBeInTheDocument();
    // Y cuando llega el tablero nuevo vuelve al cierre, con el aviso de la cuenta nueva.
    await act(async () => {
      await esperar(500);
    });
    expect(screen.queryByText("Venta a crédito")).not.toBeInTheDocument();
    expect(screen.getByText(/La cuenta cambió mientras cobrabas \(otro equipo/)).toBeInTheDocument();
    expect(cobros).toHaveLength(1);
  });

  it("si la cuenta se está por vencer, se recalcula sola antes de que se cuente el vuelto", async () => {
    // Revisión del 18-oct: a los 6 minutos se veían "Cambio Bs 5,00" y Cobrar
    // prendido; el servidor la iba a rechazar y el vuelto ya estaba dado.
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    reloj.ahora = T0 + 4 * MIN + 46_000;
    await act(async () => {
      await esperar(1_200);
    });
    // 51:46 jugados: 1:00, Bs 20.
    expect(screen.getByText(/Pasaron 5 minutos/)).toHaveTextContent(
      /ahora el saldo es Bs.20,00 \(era Bs.15,00\)\. Si ya diste el vuelto, en «Efectivo entregado por el cliente» escribí Bs.15,00/,
    );
    expect(screen.getByRole("button", { name: /Cobrar Bs.20,00/ })).toBeDisabled();
    expect(cobros).toHaveLength(0);
  });

  it("si otro equipo carga algo con el QR ya confirmado, la cuenta nueva queda en Mixto con lo que entró", async () => {
    // Revisión del 18-oct: el aviso de otro equipo decía sólo el saldo nuevo y
    // volvía a Efectivo; con el QR se confirmaba un monto que no llegó.
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /QR/ }));
    await tocar(screen.getByRole("button", { name: /Confirmar pago recibido/ }), 0);
    caso.consumoExtra = true;
    await act(async () => {
      await recargar(true);
    });
    expect(screen.getByText(/La cuenta cambió mientras cobrabas \(otro equipo/)).toHaveTextContent(
      /ahora el saldo es Bs.25,00 \(era Bs.15,00\)\. Si ya te pagaron Bs.15,00 por QR, no lo cobres otra vez: al aceptar queda en Mixto, con Bs.15,00 por QR y Bs.10,00 en efectivo\./,
    );
    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.25,00/ }), 0);
    expect(screen.getByRole("radio", { name: /Mixto/ })).toHaveAttribute("aria-checked", "true");
    expect((screen.getByLabelText("En efectivo") as HTMLInputElement).value).toBe("10,00");
  });

  it("si la cuenta baja por debajo del QR que ya entró, queda todo por QR", async () => {
    // Revisión del 18-oct: volvía a Efectivo y con «Justo» se registraban
    // Bs 10 en efectivo que nunca entraron. Con la mitad desde 1 h, a los
    // 53 min la cuenta pasa de Bs 15 a Bs 10.
    caso.promos = [{ id: "mitad", nombre: "Mitad", desde: 1, pct: 50, activa: true, fijo: false }];
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /QR/ }));
    await tocar(screen.getByRole("button", { name: /Confirmar pago recibido/ }), 0);
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(screen.getByText(/Pasaron 5 minutos/)).toHaveTextContent(
      /Si ya te pagaron Bs.15,00 por QR, eso cubre el saldo: al aceptar queda todo por QR, y los Bs.5,00 que sobran se los devuelve el encargado\./,
    );
    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.10,00/ }), 0);
    expect(screen.getByRole("radio", { name: /QR/ })).toHaveAttribute("aria-checked", "true");
    await tocar(screen.getByRole("button", { name: /Confirmar pago recibido/ }), 0);
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.10,00/ }));
    expect(cobros).toHaveLength(2);
    expect(cobros[1].pagos).toEqual([expect.objectContaining({ formaPagoId: 2, monto: 10 })]);
  });

  it("un error que no es de la mesa queda a la vista aunque haya un aviso", async () => {
    // Revisión del 18-oct: quedaba tapado por el aviso de otro equipo, y
    // "Usar la cuenta nueva" lo borraba.
    caso.cerrar = () => {
      throw new ApiError("La caja se cerró: abrí una caja nueva para cobrar.", 400, { codigo: "CAJA_CERRADA" });
    };
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    caso.consumoExtra = true;
    await act(async () => {
      await recargar(true);
    });
    expect(screen.getByText(/La cuenta cambió mientras cobrabas \(otro equipo/)).toBeInTheDocument();
    expect(screen.getByText(/La caja se cerró/)).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.25,00/ }), 0);
    expect(screen.getByText(/La caja se cerró/)).toBeInTheDocument();
  });

  it("si la cuenta cambia después de un cobro sin respuesta, ese cobro no entró y la pantalla vuelve a cuidarse", async () => {
    // Revisión del 18-oct: seguía el rojo "pudo haber entrado, no le pidas
    // ni le devuelvas nada" junto al aviso que decía lo contrario, y la
    // cuenta ya no se recalculaba sola. Con la mesa cobrada, nadie le podría
    // haber cargado nada.
    caso.cerrar = (_cuerpo, vez) => {
      if (vez === 1) throw new ApiError("No se pudo conectar con el servidor.", 0);
      return ventaHecha();
    };
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(screen.getByText(/El cobro pudo haber entrado/)).toBeInTheDocument();
    caso.consumoExtra = true;
    await act(async () => {
      await recargar(true);
    });
    expect(screen.queryByText(/El cobro pudo haber entrado/)).not.toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Usar la cuenta nueva · Bs.25,00/ }), 0);
    // Y a los 4:46 se recalcula sola otra vez: 51:46 + la Paceña, Bs 30.
    reloj.ahora = T0 + 4 * MIN + 46_000;
    await act(async () => {
      await esperar(1_200);
    });
    expect(screen.getByText(/Pasaron 5 minutos/)).toHaveTextContent(/ahora el saldo es Bs.30,00 \(era Bs.25,00\)/);
  });

  it("un QR a la vista sin confirmar también cuenta: el aviso lo nombra y la cuenta nueva queda en Mixto", async () => {
    // Revisión del 18-oct: el cajero esperaba la transferencia sin tocar
    // «Confirmar»; el cliente ya había pagado Bs 15 y, con la cuenta en Bs 20,
    // se confirmaba un QR de 20.
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /QR/ }));
    reloj.ahora = T0 + 4 * MIN + 46_000;
    await act(async () => {
      await esperar(1_200);
    });
    // Sin confirmar no se sabe si pagó: no decide por el cajero (revisión del
    // 18-oct, cuarta ronda).
    expect(screen.getByText(/Pasaron 5 minutos/)).toHaveTextContent(
      /Si ya te pagaron Bs.15,00 por QR, tocá «Ya pagó el QR»: queda en Mixto, con Bs.15,00 por QR y Bs.5,00 en efectivo\. Si todavía no pagó, tocá «Todavía no pagó»\./,
    );
    await tocar(screen.getByRole("button", { name: "Ya pagó el QR" }), 0);
    expect(screen.getByRole("radio", { name: /Mixto/ })).toHaveAttribute("aria-checked", "true");
    expect((screen.getByLabelText("En efectivo") as HTMLInputElement).value).toBe("5,00");
  });

  it("si todavía no pagó el QR, la cuenta nueva queda para cobrar de cero", async () => {
    // Revisión del 18-oct: dejaba Mixto con Bs 5 en efectivo escritos y, si
    // el cliente pagaba Bs 20 por QR, en el arqueo faltaban Bs 5 de efectivo.
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /QR/ }));
    reloj.ahora = T0 + 4 * MIN + 46_000;
    await act(async () => {
      await esperar(1_200);
    });
    await tocar(screen.getByRole("button", { name: "Todavía no pagó" }), 0);
    expect(screen.getByRole("radio", { name: /Efectivo/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cobrar Bs.20,00/ })).toBeInTheDocument();
  });

  it("reanudar desde el cierre pasa la cuenta a la hora de ahora y no la baja", async () => {
    // Revisión del 18-oct: abierta hace 60 min y pausada hace 11 (49 jugados,
    // Bs 20). Reanudada a los 3 min, a la hora de antes la pausa se descontaba
    // entera: 46 min, Bs 15, y el aviso culpaba a "otro equipo".
    caso.jugadosMin = 60;
    caso.pausadaHace = 11;
    await montar();
    expect(screen.getByText(/Mesa 5 · Total Bs.20,00/)).toBeInTheDocument();
    reloj.ahora = T0 + 3 * MIN;
    await tocar(screen.getByRole("button", { name: /Reanudar la mesa/ }));
    expect(screen.getByText(/Mesa 5 · Total Bs.20,00/)).toBeInTheDocument();
    expect(screen.queryByText(/La cuenta cambió mientras cobrabas/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
  });

  it("después de un cobro sin respuesta no se recalcula sola: el reintento va con la misma clave", async () => {
    // Revisión del 18-oct: sin red, a los 4:46 se recalculaba, cambiaba la
    // clave y el aviso le pedía al cliente Bs 5 más; con la red de vuelta, el
    // reintento ya no encontraba el cobro que había entrado.
    caso.cerrar = (_cuerpo, vez) => {
      if (vez === 1) throw new ApiError("No se pudo conectar con el servidor.", 0);
      return ventaHecha();
    };
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(screen.getByText(/El cobro pudo haber entrado: tocá «Cobrar» otra vez cuando vuelva la conexión/)).toBeInTheDocument();
    reloj.ahora = T0 + 4 * MIN + 46_000;
    await act(async () => {
      await esperar(1_200);
    });
    expect(screen.queryByText(/Pasaron 5 minutos/)).not.toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(cobros).toHaveLength(2);
    expect(cobros[1].clienteRequestId).toBe(cobros[0].clienteRequestId);
    expect(cobros[1].hasta).toBe(cobros[0].hasta);
  });

  it("si otro equipo cobra la mesa y la vuelve a abrir, este cierre no toma la cuenta nueva", async () => {
    // Revisión del 18-oct: adoptaba la sesión nueva sin avisar, con lo
    // recibido de la vieja, y la cerraba.
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    caso.sesionId = 78;
    await act(async () => {
      await recargar(true);
    });
    expect(screen.getByText("La Mesa 5 no está abierta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cobrar/ })).not.toBeInTheDocument();
  });

  it("si al tocar Cobrar la cuenta da lo mismo, se manda con la hora de ahora", async () => {
    // Revisión del 18-oct: el servidor cobra hasta 5 min después de la hora de
    // la cuenta, y contaba desde que se abrió el cierre: con 3 min contando el
    // vuelto, alcanzaban 2 sin conexión para perder el reintento.
    caso.jugadosMin = 34;
    caso.cerrar = () => ventaHecha();
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "20" } });
    reloj.ahora = T0 + 3 * MIN;
    await tocar(screen.getByRole("button", { name: /Cobrar Bs.15,00/ }));
    expect(cobros).toHaveLength(1);
    expect(cobros[0].hasta).toBe(new Date(T0 + 3 * MIN).toISOString());
  });

  it("con la mesa libre al entrar, una cuenta que se abre después no se toma", async () => {
    // Revisión del 18-oct: la adoptaba y la pantalla ofrecía cobrar una mesa
    // recién abierta que nadie había venido a cerrar.
    caso.libre = true;
    render(
      <MemoryRouter initialEntries={["/billar/cerrar/5"]}>
        <Routes>
          <Route path="/billar/*" element={<RutasBillar />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(await screen.findByText("La Mesa 5 no está abierta")).toBeInTheDocument();
    caso.libre = false;
    await act(async () => {
      await recargar(true);
    });
    expect(screen.getByText("La Mesa 5 no está abierta")).toBeInTheDocument();
    expect(screen.queryByText("Total a cobrar")).not.toBeInTheDocument();
  });

  it("si al reanudar la cuenta trae un adelanto que cobró otro equipo, avisa y no deja cobrar con el vuelto viejo", async () => {
    // Revisión del 18-oct (quinta ronda): con el mismo total el aviso se
    // borraba solo y Cobrar quedaba prendido con el Recibido de antes; el
    // cambio pasaba de Bs 30 a Bs 40 sin decir nada.
    caso.jugadosMin = 60;
    caso.pausadaHace = 11;
    await montar();
    fireEvent.change(screen.getByLabelText("Efectivo entregado por el cliente"), { target: { value: "50" } });
    reloj.ahora = T0 + 3 * MIN;
    caso.pagos = [
      { id: 1, hora: T0 + 2 * MIN, formaPagoId: 1, metodo: "Efectivo", monto: 10, recibido: 10, concepto: "ADELANTO" },
    ];
    await tocar(screen.getByRole("button", { name: /Reanudar la mesa/ }));
    expect(screen.getByText(/La cuenta se recalculó a la hora de ahora/)).toHaveTextContent(
      /ahora el saldo es Bs.10,00 \(era Bs.20,00\)/,
    );
    expect(screen.getByRole("button", { name: /Cobrar Bs.10,00/ })).toBeDisabled();
  });

  it("en mixto, antes del efectivo dice dónde va a salir el QR; con el efectivo sale por el resto", async () => {
    // QA del dueño, 19-oct: eligió Mixto y no salía ningún QR ni decía por qué.
    await montar();
    await tocar(screen.getByRole("radio", { name: /Mixto/ }), 0);
    expect(screen.getByText("Escribí cuánto paga en efectivo y acá sale el QR por el resto.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar pago recibido/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("En efectivo"), { target: { value: "5" } });
    expect(screen.queryByText(/acá sale el QR por el resto/)).not.toBeInTheDocument();
    expect(screen.getByText(/Revisá que el pago de Bs.10,00 haya llegado/)).toBeInTheDocument();
  });
});

/**
 * El fiado del cierre es la pantalla de crédito del POS (`PantallaCredito`):
 * lo que cambia ahí le cambia al billar. Estas guardas fijan lo que el billar
 * espera de ella (revisión del 28-oct).
 */
describe("Pasar el saldo a fiado", () => {
  /** Ya fió antes y no tiene límite: el fiado sale sin firma. */
  const JUAN: ClienteCredito = {
    id: 6,
    nombre: "Juan Pérez",
    telefono: null,
    nota: null,
    saldoTotal: 0,
    montoVencido: 0,
    creditosAbiertos: 0,
    vecesFiado: 2,
    limiteCredito: null,
    disponible: null,
  };

  it("con el nombre de un cliente que ya existe, el aviso lo sigue nombrando", async () => {
    // La pantalla del POS reconoce al cliente por lo tecleado y lo manda por su
    // id. Sin el nombre al lado, el aviso de abajo pasaba de "a cuentas por
    // cobrar (Juan Pérez)" a no nombrar a nadie.
    vi.mocked(api.getClientesCredito).mockResolvedValueOnce([JUAN]);
    caso.cerrar = () => ventaHecha();
    await montar();
    await tocar(screen.getByRole("button", { name: /Pasar saldo a fiado/ }), 0);
    fireEvent.change(screen.getByPlaceholderText("Ej. Kevin Barrientos"), { target: { value: "Juan Pérez" } });
    expect(screen.getByText("Ya fió antes con este nombre.")).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Registrar fiado/ }));

    expect(cobros).toHaveLength(1);
    expect(cobros[0].credito).toMatchObject({ clienteId: 6, clienteNombre: "Juan Pérez" });
    expect(leerBillar().toasts.at(-1)).toMatchObject({
      tono: "verde",
      texto: "Bs 15,00 a cuentas por cobrar (Juan Pérez).",
    });
  });

  it("en mixto el campo es el adelanto entero: el efectivo es lo que no va por QR", async () => {
    // El fiado del POS cambió (CRE-2, como Android): antes, en mixto, el campo
    // era sólo la parte en efectivo y el QR se le sumaba; ahora es el adelanto
    // entero. Con Bs 10 de adelanto y Bs 4 por QR entran Bs 6 en efectivo, no
    // Bs 10: si el reparto se corriera sin que nadie lo note, el arqueo del
    // billar esperaría efectivo que no entró al cajón.
    caso.cerrar = () => ventaHecha();
    await montar();
    await tocar(screen.getByRole("button", { name: /Pasar saldo a fiado/ }), 0);
    fireEvent.change(screen.getByPlaceholderText("Ej. Kevin Barrientos"), { target: { value: "Juan Pérez" } });
    fireEvent.change(screen.getByLabelText("Adelanto en Bs"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Mixto" }));
    fireEvent.change(screen.getByLabelText(/^Parte pagada por QR/), { target: { value: "4" } });
    expect(screen.getByText(/^En efectivo:/)).toHaveTextContent("En efectivo: Bs 6,00");
    expect(screen.getByText(/adelanta Bs 10,00/)).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Confirmar pago recibido/ }), 0);
    await tocar(screen.getByRole("button", { name: /Registrar fiado/ }));

    expect(cobros).toHaveLength(1);
    expect(cobros[0].pagos).toEqual([
      { formaPagoId: 1, monto: 6, recibido: 6 },
      { formaPagoId: 2, monto: 4 },
    ]);
    // Lo que queda debiendo es el saldo menos el adelanto entero.
    expect(leerBillar().toasts.at(-1)).toMatchObject({
      tono: "verde",
      texto: "Bs 5,00 a cuentas por cobrar (Juan Pérez).",
    });
  });
});
