import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El cobro en la misma pantalla (Configuración › Punto de venta › «En la
 * misma pantalla», 16-nov), con el POS de verdad: la venta, el carrito y el
 * cobro reales; lo de mentira es el servidor. El medio de pago, el efectivo y
 * «Confirmar cobro» van en el carrito, al lado de los productos, y se cobra
 * con el MISMO `cobrar` de la pantalla aparte (el cupo, la idempotencia y el
 * recibo después).
 *
 * Sólo vale en pantalla ancha (el carrito es una columna fija) y en la venta
 * de mostrador; en lo demás, el «Cobrar» de siempre. Mesa o para llevar queda
 * como hoy: los botones «Todo en mesa / Todo para llevar» y el chip de cada
 * línea, nada nuevo.
 */

// Cada caso monta el POS entero (venta, carrito y cobro reales): solo tarda
// 1-2 s, pero con la PC cargada por la suite completa pasaba los 5 s de tope y
// fallaba sin que nada estuviera roto.
vi.setConfig({ testTimeout: 20_000 });

const sesion = vi.hoisted(() => ({
  pos: { cobro: "EN_VENTA" } as Record<string, unknown> | undefined,
  features: ["pos", "caja", "pago_qr_mixto", "mesa_llevar"] as string[],
  ancho: 1366,
  cupo: undefined as import("../../types").CupoEstado | undefined,
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Prueba", alias: "prueba", tipoNegocio: "RESTAURANTE", features: sesion.features, pos: sesion.pos },
      usuario: { id: 1, username: "caja", rol: "CAJERO", ...permisosDe("CAJERO") },
      rubro: "RESTAURANTE",
      incluye: (f: string) => sesion.features.includes(f),
      puede: (s: string) => s === "creditos",
      cupo: sesion.cupo,
      licencia: null,
      actualizarCupo: vi.fn(),
      refrescarCupo: sesion.refrescarCupo,
    }),
  };
});

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    cajaActual: vi.fn(async () => ({
      caja: { id: 1, almacenId: 1, almacen: null, fechaApertura: "2026-11-16T12:00:00.000Z", montoApertura: 0 },
    })),
    getProductos: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => [
      { id: 10, nombre: "Efectivo" },
      { id: 11, nombre: "QR" },
    ]),
    getRepartidores: vi.fn(async () => []),
    mesasPorCobrar: vi.fn(async () => []),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(),
    productosPausados: vi.fn(async () => ({ sucursal: { id: 1, nombre: "Centro" }, pausados: [] })),
  },
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(), comprarCreditos: vi.fn(), compraCreditos: vi.fn(), monedero: vi.fn() },
}));
vi.mock("../../lib/agenda/apiConfigAgenda", () => ({ apiConfigAgenda: { recursos: vi.fn(async () => []) } }));
vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { hoy: vi.fn(async () => ({ citas: [] })), carrito: vi.fn() },
  mensajeDe: (_e: unknown, d: string) => d,
}));
vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { contador: vi.fn(async () => ({ nuevos: 0, masViejoEn: null })) },
}));
vi.mock("./PantallaHistorial", () => ({ default: () => <p>ventas del turno</p> }));
vi.mock("./PantallaCierre", () => ({ default: () => <p>cierre de caja</p>, CierreOk: () => null }));
vi.mock("./PantallaRecibo", () => ({
  default: (p: { onNuevaVenta: () => void }) => (
    <div>
      <p>recibo</p>
      <button onClick={p.onNuevaVenta}>nueva venta</button>
    </div>
  ),
}));
vi.mock("./PantallaCredito", () => ({
  default: (p: { total: number; onAtras: () => void }) => (
    <div>
      <p>fiado de {p.total}</p>
      <button onClick={p.onAtras}>volver del fiado</button>
    </div>
  ),
}));
// El QR del negocio: lo que importa es si quedó confirmado.
vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ confirmado, onConfirmar }: { confirmado: boolean; onConfirmar: () => void }) =>
    confirmado ? <p>QR confirmado</p> : <button onClick={onConfirmar}>Ya llegó el QR</button>,
}));

import { api } from "../../lib/api";
import { HojaCupoHost } from "../../components/ComprarCreditos";
import { fechaNegocio } from "../../lib/agenda/horaAgenda";
import { cupoEmprendedor } from "../../test/cupoFixtures";
import Pos from "./Pos";

const producto = (id: number, nombre: string, precio: number): Producto =>
  ({
    id,
    nombre,
    precio,
    tipoProducto: "ALMACENABLE",
    stockTotal: 20,
    stockMinimo: 2,
    habilitado: true,
    icono: null,
    categoria: null,
    componentes: [],
  }) as unknown as Producto;

const POLLO = producto(1, "Pollo entero", 35);
const COCA = producto(2, "Coca 2 L", 12);

async function montar() {
  render(
    <MemoryRouter initialEntries={["/pos"]}>
      <Pos />
      <HojaCupoHost />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

const tocar = (nombre: string) => fireEvent.click(screen.getByRole("heading", { name: nombre }));
const carrito = () => screen.getByRole("complementary");
const confirmar = () => within(carrito()).getByRole("button", { name: /Confirmar cobro/ });
const recibido = () => within(carrito()).getByLabelText("Efectivo recibido") as HTMLInputElement;
/** El cuerpo de la venta que se mandó. */
const venta = (i = 0) =>
  vi.mocked(api.crearVenta).mock.calls[i][0] as {
    detalles: object[];
    pagos: object[];
    tipoPedido: string;
    clienteRequestId: string;
  };

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sesion.pos = { cobro: "EN_VENTA" };
  sesion.features = ["pos", "caja", "pago_qr_mixto", "mesa_llevar"];
  sesion.ancho = 1366;
  sesion.cupo = undefined;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: sesion.ancho >= Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? Infinity),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.mocked(api.getProductos).mockResolvedValue([POLLO, COCA]);
  vi.mocked(api.crearVenta).mockResolvedValue({ id: 7, comprobante: "V-000007", total: 35 } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cobrar en la misma pantalla, en efectivo", () => {
  it("de punta a punta: el producto, lo recibido, el cambio y la venta con sus pagos", async () => {
    await montar();
    // Con el carrito vacío, el vacío de siempre, sin cobro.
    expect(within(carrito()).getByText("Carrito vacío")).toBeInTheDocument();
    expect(within(carrito()).queryByLabelText("Efectivo recibido")).not.toBeInTheDocument();

    tocar("Pollo entero");
    // Ni «Cobrar» ni pantalla aparte: el cobro está en el carrito.
    expect(within(carrito()).queryByRole("button", { name: /^Cobrar / })).not.toBeInTheDocument();
    expect(confirmar()).toHaveTextContent("Confirmar cobro · Bs 35,00");
    // Sin robarle el foco al buscador.
    expect(document.activeElement).not.toBe(recibido());

    fireEvent.change(recibido(), { target: { value: "50" } });
    expect(within(carrito()).getByText("Cambio")).toBeInTheDocument();
    expect(within(carrito()).getByText("Bs 15,00")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).toHaveBeenCalledTimes(1);
    expect(venta().detalles).toEqual([{ productoId: 1, cantidad: 1, precio: 35, consumo: "MESA" }]);
    expect(venta().pagos).toEqual([{ formaPagoId: 10, monto: 35, recibido: 50 }]);
    expect(venta().tipoPedido).toBe("LOCAL");
    expect(venta().clienteRequestId).toEqual(expect.any(String));
    // Después, el recibo de siempre; «Nueva venta» vuelve con todo limpio.
    expect(screen.getByText("recibo")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "nueva venta" }));
    });
    expect(within(carrito()).getByText("Carrito vacío")).toBeInTheDocument();
    tocar("Coca 2 L");
    expect(recibido().value).toBe("");
    expect(confirmar()).toHaveTextContent("Bs 12,00");
  });

  it("lo recibido que no alcanza no se manda", async () => {
    await montar();
    tocar("Pollo entero");
    fireEvent.change(recibido(), { target: { value: "20" } });
    expect(within(carrito()).getByText("Falta")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).not.toHaveBeenCalled();
    expect(within(carrito()).getByText("Lo recibido no alcanza para cubrir el total.")).toBeInTheDocument();
  });

  it("si el servidor rechaza, el error se ve en el carrito y se puede reintentar", async () => {
    vi.mocked(api.crearVenta).mockRejectedValueOnce(new Error("Stock insuficiente de Pollo entero"));
    await montar();
    tocar("Pollo entero");
    fireEvent.change(recibido(), { target: { value: "35" } });
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(within(carrito()).getByText("Stock insuficiente de Pollo entero")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).toHaveBeenCalledTimes(2);
    // El reintento es el mismo cobro: la misma identidad, no una venta nueva.
    expect(venta(1).clienteRequestId).toBe(venta(0).clienteRequestId);
    expect(screen.getByText("recibo")).toBeInTheDocument();
  });

  it("el error del servidor se borra cuando la cajera cambia el pedido, no antes", async () => {
    vi.mocked(api.crearVenta).mockRejectedValueOnce(new Error("Stock insuficiente de Pollo entero"));
    await montar();
    tocar("Pollo entero");
    tocar("Pollo entero");
    fireEvent.change(recibido(), { target: { value: "100" } });
    await act(async () => {
      fireEvent.click(confirmar());
    });
    const error = "Stock insuficiente de Pollo entero";
    expect(within(carrito()).getByText(error)).toBeInTheDocument();
    // Teclear otro efectivo no cambia el pedido: el aviso queda.
    fireEvent.change(recibido(), { target: { value: "80" } });
    expect(within(carrito()).getByText(error)).toBeInTheDocument();
    // Saca un pollo: el pedido es otro y el aviso viejo se va.
    await act(async () => {
      fireEvent.click(within(carrito()).getByRole("button", { name: "Quitar una unidad" }));
    });
    expect(within(carrito()).queryByText(error)).not.toBeInTheDocument();
    expect(confirmar()).toHaveTextContent("Bs 35,00");
  });

  it("cambiar el pedido no borra lo tecleado en el efectivo", async () => {
    await montar();
    tocar("Pollo entero");
    fireEvent.change(recibido(), { target: { value: "100" } });
    tocar("Coca 2 L");
    expect(recibido().value).toBe("100");
    expect(confirmar()).toHaveTextContent("Bs 47,00");
  });
});

describe("la nota escrita y sin confirmar", () => {
  it("se escribe «sin ají», sin salir del campo se confirma el cobro, y la nota viaja", async () => {
    await montar();
    tocar("Pollo entero");
    fireEvent.click(within(carrito()).getByRole("button", { name: "Nota" }));
    fireEvent.change(within(carrito()).getByLabelText("Nota de Pollo entero"), { target: { value: "sin ají " } });
    fireEvent.change(recibido(), { target: { value: "35" } });
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).toHaveBeenCalledTimes(1);
    expect(venta().detalles).toEqual([{ productoId: 1, cantidad: 1, precio: 35, consumo: "MESA", nota: "sin ají" }]);
  });
});

describe("por QR", () => {
  it("los dos pasos de siempre: sin confirmar que llegó, no cobra", async () => {
    await montar();
    tocar("Pollo entero");
    fireEvent.click(within(carrito()).getByRole("button", { name: "QR" }));
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).not.toHaveBeenCalled();
    expect(within(carrito()).getByText("Confirmá que el pago por QR llegó antes de cobrar.")).toBeInTheDocument();
    fireEvent.click(within(carrito()).getByRole("button", { name: "Ya llegó el QR" }));
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(venta().pagos).toEqual([{ formaPagoId: 11, monto: 35 }]);
  });

  it("el QR confirmado se desmarca si cambia el total: nadie vio entrar el monto nuevo", async () => {
    await montar();
    tocar("Pollo entero");
    fireEvent.click(within(carrito()).getByRole("button", { name: "QR" }));
    fireEvent.click(within(carrito()).getByRole("button", { name: "Ya llegó el QR" }));
    expect(within(carrito()).getByText("QR confirmado")).toBeInTheDocument();

    // Se suma una gaseosa después de confirmar: Bs 35 → Bs 47.
    tocar("Coca 2 L");
    expect(within(carrito()).queryByText("QR confirmado")).not.toBeInTheDocument();
    // Sigue en QR (el método no se pierde) y vuelve a pedir la confirmación.
    expect(within(carrito()).getByRole("button", { name: "Ya llegó el QR" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).not.toHaveBeenCalled();

    fireEvent.click(within(carrito()).getByRole("button", { name: "Ya llegó el QR" }));
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(venta().pagos).toEqual([{ formaPagoId: 11, monto: 47 }]);
  });

  it("también si se quita algo", async () => {
    await montar();
    tocar("Pollo entero");
    tocar("Coca 2 L");
    fireEvent.click(within(carrito()).getByRole("button", { name: "QR" }));
    fireEvent.click(within(carrito()).getByRole("button", { name: "Ya llegó el QR" }));
    // El «−» de la tarjeta de la gaseosa, en su última unidad, la saca.
    const coca = screen.getByRole("heading", { name: "Coca 2 L" }).closest("li")!;
    fireEvent.click(within(coca).getByRole("button", { name: "Quitar del pedido" }));
    expect(within(carrito()).getByRole("button", { name: "Ya llegó el QR" })).toBeInTheDocument();
  });
});

describe("el fiado", () => {
  it("con el permiso, «Vender a crédito (fiado)» abre el fiado de siempre y su «atrás» vuelve a la venta", async () => {
    sesion.features = [...sesion.features, "fiado"];
    await montar();
    tocar("Pollo entero");
    fireEvent.click(within(carrito()).getByRole("button", { name: "Vender a crédito (fiado)" }));
    expect(screen.getByText("fiado de 35")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "volver del fiado" }));
    });
    // A la venta, con el pedido armado; no a una pantalla de cobro.
    expect(screen.queryByRole("heading", { name: "Cobrar" })).not.toBeInTheDocument();
    expect(confirmar()).toHaveTextContent("Bs 35,00");
  });

  it("sin la feature no se ofrece", async () => {
    await montar();
    tocar("Pollo entero");
    expect(within(carrito()).queryByRole("button", { name: "Vender a crédito (fiado)" })).not.toBeInTheDocument();
  });
});

describe("mesa o para llevar: como hoy", () => {
  it("«Todo en mesa / Todo para llevar» arriba de las líneas, sólo con líneas; el chip de cada línea; el cobro abajo", async () => {
    await montar();
    expect(within(carrito()).queryByRole("button", { name: "Todo en mesa" })).not.toBeInTheDocument();
    tocar("Pollo entero");
    const panel = carrito();
    const enOrden = [
      within(panel).getByRole("button", { name: "Todo en mesa" }),
      within(panel).getByRole("button", { name: "Todo para llevar" }),
      within(panel).getByText("Pollo entero"),
      within(panel).getByText("Total"),
      within(panel).getByRole("button", { name: /^Efectivo/ }),
      recibido(),
      confirmar(),
    ];
    for (let i = 1; i < enOrden.length; i++) {
      expect(enOrden[i - 1].compareDocumentPosition(enOrden[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // El chip de la línea, y «Todo para llevar» la cambia (lo de siempre).
    expect(within(panel).getByRole("button", { name: "Mesa" })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Todo para llevar" }));
    expect(within(panel).getByRole("button", { name: "Llevar" })).toBeInTheDocument();
    fireEvent.change(recibido(), { target: { value: "35" } });
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(venta().detalles).toEqual([{ productoId: 1, cantidad: 1, precio: 35, consumo: "LLEVAR" }]);
  });

  it("y nada de mesa ni llevar en un plan sin la capacidad", async () => {
    sesion.features = ["pos", "caja", "pago_qr_mixto"];
    await montar();
    tocar("Pollo entero");
    expect(within(carrito()).queryByRole("button", { name: /Todo en mesa|Todo para llevar|^Mesa$/ })).not.toBeInTheDocument();
  });
});

describe("el cupo del plan (Emprendedor)", () => {
  it("sin lugar ni créditos, Confirmar no manda la venta y abre la hoja; el pedido sigue armado", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 50, saldo: 0 });
    await montar();
    tocar("Pollo entero");
    fireEvent.change(recibido(), { target: { value: "35" } });
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(api.crearVenta).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Llegaste a tus 50 ventas de hoy" })).toBeInTheDocument();
    expect(confirmar()).toHaveTextContent("Bs 35,00");
  });
});

describe("dónde no se usa: el «Cobrar» de siempre", () => {
  it("con la pantalla de menos de 1024 px", async () => {
    sesion.ancho = 900;
    await montar();
    tocar("Pollo entero");
    expect(screen.queryByLabelText("Efectivo recibido")).not.toBeInTheDocument();
    fireEvent.click(within(carrito()).getByRole("button", { name: "Cobrar Bs 35,00" }));
    expect(screen.getByRole("heading", { name: "Cobrar" })).toBeInTheDocument();
  });

  it("con el ajuste en «En pantalla aparte», o sin el dato", async () => {
    for (const pos of [{ cobro: "APARTE" }, undefined]) {
      sesion.pos = pos;
      const { unmount } = render(
        <MemoryRouter initialEntries={["/pos"]}>
          <Pos />
        </MemoryRouter>,
      );
      await act(async () => {});
      await act(async () => {});
      tocar("Pollo entero");
      expect(within(carrito()).getByRole("button", { name: "Cobrar Bs 35,00" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Efectivo recibido")).not.toBeInTheDocument();
      unmount();
      sessionStorage.clear();
    }
  });

  it("si la ventana se achica en medio de la venta, vuelve el «Cobrar» con el pedido intacto", async () => {
    const oyentes = new Set<() => void>();
    vi.stubGlobal("matchMedia", (q: string) => ({
      get matches() {
        return sesion.ancho >= Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? Infinity);
      },
      addEventListener: (_e: string, f: () => void) => oyentes.add(f),
      removeEventListener: (_e: string, f: () => void) => oyentes.delete(f),
    }));
    await montar();
    tocar("Pollo entero");
    expect(confirmar()).toBeInTheDocument();
    sesion.ancho = 900;
    act(() => oyentes.forEach((f) => f()));
    expect(within(carrito()).getByRole("button", { name: "Cobrar Bs 35,00" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Efectivo recibido")).not.toBeInTheDocument();
  });
});
