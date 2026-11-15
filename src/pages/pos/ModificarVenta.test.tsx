import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormaPago, Producto, Venta } from "../../types";

/**
 * Modificar una venta ya cobrada (15-nov): el cliente pagó un cuarto broaster
 * y una Coca de 3 litros, y vuelve — "mejor la de 2 litros". La cajera lo
 * cambia en la misma pantalla del Punto de venta y, antes de guardar, ve qué
 * sale, qué entra y la plata. Sin motivo y sin el PIN de un encargado no se
 * guarda nada: es la misma puerta que anular.
 */

// Cada caso dibuja el Punto de venta entero (grilla, carrito, cobro y el
// diálogo): en una máquina cargada pasa los 5 s.
vi.setConfig({ testTimeout: 60_000 });

const sesion = vi.hoisted(() => ({
  /** Quien autoriza con PIN se autoriza a sí mismo (no le pide usuario). */
  permisos: ["ventas.anular", "autorizar.pin"] as string[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "prueba" },
    usuario: { username: "cajera", permisos: sesion.permisos },
    rubro: "RESTAURANTE",
    incluye: () => true,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  api: { modificarVenta: vi.fn() },
}));

// El QR del negocio se baja del servidor: acá basta con el botón de "llegó".
vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ onConfirmar, monto }: { onConfirmar: () => void; monto?: string }) => (
    <button onClick={onConfirmar}>Llegó el QR de {monto}</button>
  ),
}));

import { ApiError, api } from "../../lib/api";
import ModificarVenta from "./ModificarVenta";

const producto = (id: number, nombre: string, precio: number, extra: Partial<Producto> = {}): Producto =>
  ({
    id,
    nombre,
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio,
    costo: 0,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 10,
    componentes: [],
    ...extra,
  }) as Producto;

const CATALOGO = [
  producto(1, "Broaster cuarto", 28, { tipoProducto: "SERVICIO", stockTotal: 0 }),
  producto(2, "Coca Cola 3L", 23, { stockTotal: 9 }),
  producto(3, "Brasa cuarto", 30, { tipoProducto: "SERVICIO", stockTotal: 0 }),
  producto(4, "Coca Cola 2L", 18),
  producto(5, "Arroz (porción)", 6, { tipoProducto: "SERVICIO", stockTotal: 0 }),
];

const FORMAS = [
  { id: 1, nombre: "Efectivo" },
  { id: 2, nombre: "QR" },
] as FormaPago[];

const venta = (extra: Partial<Venta> = {}): Venta =>
  ({
    id: 7,
    comprobante: "V-000007",
    estado: "APROBADO",
    fecha: "2026-11-15T15:56:00Z",
    cajaId: 3,
    total: 51,
    detalles: [
      { productoId: 1, producto: "Broaster cuarto", cantidad: 1, precio: 28, subtotal: 28, nota: null, consumo: "MESA" },
      { productoId: 2, producto: "Coca Cola 3L", cantidad: 1, precio: 23, subtotal: 23, nota: null, consumo: "MESA" },
    ],
    pagos: [{ formaPagoId: 1, formaPago: "Efectivo", monto: 51, recibido: 100, entregado: 49 }],
    tipoPedido: "LOCAL",
    estadoEntrega: null,
    prepagado: true,
    clienteNombre: null,
    clienteDireccion: null,
    clienteTelefono: null,
    tarifaEnvio: 0,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: null,
    ...extra,
  }) as Venta;

const onCancelar = vi.fn();
const onModificada = vi.fn();

async function montar(v: Venta = venta()) {
  render(
    <MemoryRouter>
      <ModificarVenta
        venta={v}
        productos={CATALOGO}
        categorias={[]}
        formasPago={FORMAS}
        sucursalId={1}
        onCancelar={onCancelar}
        onModificada={onModificada}
      />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** La tarjeta de un producto en la grilla. */
const tarjeta = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("li") as HTMLElement;
/** Toca la tarjeta: lo agrega al pedido. */
const agregar = (nombre: string) => fireEvent.click(within(tarjeta(nombre)).getAllByRole("button")[0]);
/** El "−" (o el tacho) de la tarjeta: lo saca del pedido. */
const quitar = (nombre: string) =>
  fireEvent.click(within(tarjeta(nombre)).getByRole("button", { name: /Quitar del pedido|Uno menos/ }));
/** La Coca de 3 litros por la de 2: el cambio del mostrador. */
const cambiarLaCoca = () => {
  quitar("Coca Cola 3L");
  agregar("Coca Cola 2L");
};
const dialogo = () => screen.getByRole("dialog", { name: "Confirmar el cambio" });
const elegirMotivo = (motivo = "El cliente cambió de idea") =>
  fireEvent.click(within(dialogo()).getByRole("button", { name: motivo }));
const teclearPin = (pin = "4321") =>
  fireEvent.change(within(dialogo()).getByLabelText("PIN de autorización"), { target: { value: pin } });
const guardar = async () => {
  fireEvent.click(within(dialogo()).getByRole("button", { name: "Guardar cambio" }));
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["ventas.anular", "autorizar.pin"];
  sessionStorage.clear();
  vi.mocked(api.modificarVenta).mockResolvedValue(venta({ total: 46, vecesModificada: 1 }));
});

describe("Modificar una venta", () => {
  it("abre con el pedido ya cargado y no deja guardar si no se cambió nada", async () => {
    await montar();
    expect(screen.getByText("Modificando la venta V-000007")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Cambio de V-000007/ })).toBeInTheDocument();
    // Lo que ya pagó, a la vista desde el principio.
    expect(screen.getByText("Ya pagó").nextElementSibling).toHaveTextContent("Bs 51,00");
    expect(screen.getByText("Sin diferencia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambio" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Todavía no cambiaste nada de la venta.");
  });

  it("no toca la venta a medio armar del mostrador", async () => {
    // El carrito del POS se guarda en la pestaña: el del cambio vive aparte.
    sessionStorage.setItem("bamar.carrito.LOCAL", '[{"id":5,"cantidad":2,"enMesa":2,"nota":""}]');
    await montar();
    cambiarLaCoca();
    await act(async () => {});
    expect(sessionStorage.getItem("bamar.carrito.LOCAL")).toBe('[{"id":5,"cantidad":2,"enMesa":2,"nota":""}]');
  });

  it("al cambiar la gaseosa muestra el total nuevo y cuánto hay que devolver", async () => {
    await montar();
    cambiarLaCoca();
    expect(screen.getByText("Total nuevo").nextElementSibling).toHaveTextContent("Bs 46,00");
    expect(screen.getByText("A devolver al cliente").nextElementSibling).toHaveTextContent("Bs 5,00");
    expect(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" })).toBeEnabled();
  });

  it("lo que ya estaba en la venta se puede volver a poner aunque no quede stock: sus unidades ya salieron", async () => {
    await montar(
      venta({
        detalles: [
          { productoId: 2, producto: "Coca Cola 3L", cantidad: 9, precio: 23, subtotal: 207, nota: null, consumo: "MESA" },
        ],
        total: 207,
      }),
    );
    // En el estante quedan 9 y la venta ya lleva 9: el tope es 18, no 9.
    expect(within(tarjeta("Coca Cola 3L")).getByText("18 disp.")).toBeInTheDocument();
    expect(within(tarjeta("Coca Cola 3L")).getByRole("button", { name: "Uno más" })).toBeEnabled();
  });

  it("confirma con motivo y PIN: manda cómo queda la venta, la versión, el total que se vio y por dónde se devuelve", async () => {
    await montar();
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" }));

    // Antes de guardar: qué sale, qué entra y la plata, con todas las letras.
    const d = dialogo();
    expect(within(d).getByText("V-000007 · de Bs 51,00 a Bs 46,00")).toBeInTheDocument();
    expect(within(d).getByText("Sale del pedido").parentElement).toHaveTextContent("1× Coca Cola 3L");
    expect(within(d).getByText("Entra al pedido").parentElement).toHaveTextContent("1× Coca Cola 2L");
    expect(within(d).getByText("Devolvele Bs 5,00 al cliente")).toBeInTheDocument();
    expect(within(d).getByText(/En efectivo: sale de la caja/)).toBeInTheDocument();
    // Quien autoriza con PIN no teclea su usuario.
    expect(within(d).queryByLabelText(/Usuario que autoriza/)).not.toBeInTheDocument();

    elegirMotivo();
    teclearPin();
    await guardar();

    expect(api.modificarVenta).toHaveBeenCalledTimes(1);
    const [id, cuerpo] = vi.mocked(api.modificarVenta).mock.calls[0];
    expect(id).toBe(7);
    expect(cuerpo).toEqual({
      detalles: [
        { productoId: 1, cantidad: 1, precio: 28, consumo: "MESA" },
        { productoId: 4, cantidad: 1, precio: 18, consumo: "MESA" },
      ],
      version: 0,
      totalEsperado: 46,
      motivo: "El cliente cambió de idea",
      autorizadorPin: "4321",
      devolucionFormaPagoId: 1,
      clienteRequestId: expect.any(String),
    });
    expect(onModificada).toHaveBeenCalledWith(expect.objectContaining({ total: 46, vecesModificada: 1 }), {
      diferencia: -5,
      devolucion: { formaPagoId: 1, nombre: "Efectivo", saleDelCajon: true },
    });
  });

  it("sin motivo o sin PIN no manda nada, y dice qué falta", async () => {
    await montar();
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" }));

    await guardar();
    expect(within(dialogo()).getByText("Elegí el motivo: queda guardado con el cambio.")).toBeInTheDocument();
    elegirMotivo("Otro");
    await guardar();
    expect(within(dialogo()).getByText("Contá en pocas palabras por qué se cambia.")).toBeInTheDocument();
    fireEvent.change(within(dialogo()).getByLabelText("Detalle del motivo"), { target: { value: "se equivocó de gaseosa" } });
    await guardar();
    expect(within(dialogo()).getByText("El PIN tiene entre 4 y 6 dígitos.")).toBeInTheDocument();
    expect(api.modificarVenta).not.toHaveBeenCalled();

    teclearPin();
    await guardar();
    expect(vi.mocked(api.modificarVenta).mock.calls[0][1].motivo).toBe("se equivocó de gaseosa");
  });

  it("la cajera sin PIN propio necesita el usuario de un encargado", async () => {
    sesion.permisos = ["ventas.anular"];
    await montar();
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" }));
    elegirMotivo();
    teclearPin("5678");
    await guardar();
    expect(within(dialogo()).getByText("Poné el usuario del encargado que autoriza.")).toBeInTheDocument();
    expect(api.modificarVenta).not.toHaveBeenCalled();

    fireEvent.change(within(dialogo()).getByLabelText(/Usuario que autoriza/), { target: { value: " encargada " } });
    await guardar();
    expect(vi.mocked(api.modificarVenta).mock.calls[0][1]).toMatchObject({
      autorizadorUsername: "encargada",
      autorizadorPin: "5678",
    });
  });

  it("si el cliente paga de más, primero se cobra la diferencia y después se pide el PIN", async () => {
    vi.mocked(api.modificarVenta).mockResolvedValue(venta({ total: 57, vecesModificada: 1 }));
    await montar();
    agregar("Arroz (porción)");
    expect(screen.getByText("A cobrar de diferencia").nextElementSibling).toHaveTextContent("Bs 6,00");
    fireEvent.click(screen.getByRole("button", { name: "Cobrar Bs 6,00 de diferencia" }));

    // El cobro de siempre, por la diferencia y diciendo de qué venta es.
    expect(screen.getByRole("heading", { name: "Cobrar la diferencia" })).toBeInTheDocument();
    expect(screen.getByText("V-000007 · pagó Bs 51,00, ahora es Bs 57,00")).toBeInTheDocument();
    // Paga con un billete de 10: el vuelto lo dice el cobro.
    fireEvent.click(screen.getByRole("button", { name: "Bs 10,00" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cobro · Bs 6,00" }));

    expect(within(dialogo()).getByText("El cliente paga Bs 6,00 más")).toBeInTheDocument();
    expect(within(dialogo()).getByText(/Efectivo: Bs 6,00 \(recibís Bs 10,00, vuelto Bs 4,00\)/)).toBeInTheDocument();
    elegirMotivo();
    teclearPin();
    await guardar();

    const cuerpo = vi.mocked(api.modificarVenta).mock.calls[0][1];
    expect(cuerpo.pagos).toEqual([{ formaPagoId: 1, monto: 6, recibido: 10 }]);
    expect(cuerpo).not.toHaveProperty("devolucionFormaPagoId");
    expect(cuerpo.totalEsperado).toBe(57);
    expect(onModificada).toHaveBeenCalledWith(expect.anything(), { diferencia: 6, devolucion: null });
  });

  it("una venta cobrada por QR: se devuelve en efectivo o, si se elige, por QR", async () => {
    await montar(venta({ pagos: [{ formaPagoId: 2, formaPago: "QR", monto: 51 }] }));
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" }));
    // Lo que pasa en el mostrador va primero: en efectivo.
    expect(within(dialogo()).getByRole("button", { name: "En efectivo" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Por QR" }));
    expect(within(dialogo()).getByText(/No sale de la caja/)).toBeInTheDocument();
    elegirMotivo();
    teclearPin();
    await guardar();
    expect(vi.mocked(api.modificarVenta).mock.calls[0][1].devolucionFormaPagoId).toBe(2);
  });

  it("un cambio parejo no pide plata: lo dice y guarda", async () => {
    vi.mocked(api.modificarVenta).mockResolvedValue(venta({ vecesModificada: 1 }));
    await montar(
      venta({
        detalles: [
          { productoId: 1, producto: "Broaster cuarto", cantidad: 1, precio: 28, subtotal: 28, nota: null, consumo: "MESA" },
        ],
        total: 28,
        pagos: [{ formaPagoId: 1, formaPago: "Efectivo", monto: 28 }],
      }),
    );
    // El cuarto, pero para llevar: cambia la comanda, no la plata.
    fireEvent.click(screen.getByRole("button", { name: "Mesa" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));
    expect(within(dialogo()).getByText(/Los mismos productos/)).toBeInTheDocument();
    expect(within(dialogo()).getByText(/Sin diferencia de plata/)).toBeInTheDocument();
    elegirMotivo();
    teclearPin();
    await guardar();
    const cuerpo = vi.mocked(api.modificarVenta).mock.calls[0][1];
    expect(cuerpo.detalles).toEqual([{ productoId: 1, cantidad: 1, precio: 28, consumo: "LLEVAR" }]);
    expect(cuerpo).not.toHaveProperty("pagos");
    expect(cuerpo).not.toHaveProperty("devolucionFormaPagoId");
  });

  it("el PIN mal: se dice y se puede corregir, con la misma clave del intento", async () => {
    vi.mocked(api.modificarVenta)
      .mockRejectedValueOnce(new ApiError("Usuario o PIN incorrecto", 403))
      .mockResolvedValueOnce(venta({ total: 46, vecesModificada: 1 }));
    await montar();
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" }));
    elegirMotivo();
    teclearPin("0000");
    await guardar();
    expect(within(dialogo()).getByText("Usuario o PIN incorrecto")).toBeInTheDocument();
    expect(onModificada).not.toHaveBeenCalled();
    teclearPin("4321");
    await guardar();
    const [primero, segundo] = vi.mocked(api.modificarVenta).mock.calls;
    // El mismo cambio reintentado es el mismo pedido: no se aplica dos veces.
    expect(segundo[1].clienteRequestId).toBe(primero[1].clienteRequestId);
    expect(onModificada).toHaveBeenCalledTimes(1);
  });

  it("si la venta cambió en otra pantalla, no se reintenta: se vuelve a la lista", async () => {
    vi.mocked(api.modificarVenta).mockRejectedValue(
      new ApiError("Esta venta cambió en otra pantalla mientras la modificabas. Volvé a abrirla para ver cómo quedó.", 409, {
        codigo: "VENTA_CAMBIO",
      }),
    );
    await montar();
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Devolver Bs 5,00 · Continuar" }));
    elegirMotivo();
    teclearPin();
    await guardar();
    expect(within(dialogo()).getByText(/cambió en otra pantalla/)).toBeInTheDocument();
    expect(within(dialogo()).queryByRole("button", { name: "Guardar cambio" })).not.toBeInTheDocument();
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Volver a las ventas del turno" }));
    expect(onCancelar).toHaveBeenCalled();
  });

  it("dejar la venta sin productos no es modificarla: no hay cómo guardar y se dice que eso es anular", async () => {
    await montar();
    quitar("Coca Cola 3L");
    quitar("Broaster cuarto");
    expect(screen.getByText(/Para sacarle todo, anulala/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar cambio|Devolver/ })).not.toBeInTheDocument();
  });

  it("Cancelar vuelve sin tocar nada", async () => {
    await montar();
    cambiarLaCoca();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalled();
    expect(api.modificarVenta).not.toHaveBeenCalled();
  });
});
