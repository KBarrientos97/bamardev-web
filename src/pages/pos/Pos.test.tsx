import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarritoCita } from "../../lib/agenda/tiposAgenda";
import type { Producto } from "../../types";
import type { Carrito } from "./useCarrito";

/**
 * El POS entero, con la venta y el cobro de mentira: lo que se prueba acá es
 * lo que decide el propio POS (QA ronda 1 de la agenda, 06-oct).
 *
 *   • M-11: lo del salón y del reparto se pide sólo con su feature. Omar las
 *     tiene y hace los mismos pedidos de siempre.
 *   • A-02: cobrar una cita con una venta que no la cubre pide confirmación.
 *   • A-03: un servicio de la cita que ya no está en el catálogo se carga igual.
 *   • N2-13 (07-oct): venta directa con profesional, sólo con agenda.
 */

const sesion = vi.hoisted(() => ({
  features: [] as string[],
  conAgenda: false,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { id: 1, nombre: "Prueba", features: sesion.features },
    usuario: { id: 1, username: "caja", rol: "CAJERO" },
    rubro: sesion.conAgenda ? "PELUQUERIA" : "RESTAURANTE",
    incluye: () => true,
    puede: (s: string) => (s === "hoy" ? sesion.conAgenda : true),
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    cajaActual: vi.fn(async () => ({
      caja: {
        id: 1,
        almacenId: 1,
        almacen: null,
        fechaApertura: "2026-10-06T12:00:00.000Z",
        montoApertura: 0,
      },
    })),
    getProductos: vi.fn(async () => []),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => []),
    getRepartidores: vi.fn(async () => []),
    mesasPorCobrar: vi.fn(async () => []),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(),
  },
}));

vi.mock("../../lib/agenda/apiConfigAgenda", () => ({
  apiConfigAgenda: { recursos: vi.fn(async () => []) },
}));

vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: {
    hoy: vi.fn(async () => ({ citas: [] })),
    carrito: vi.fn(),
  },
  mensajeDe: (_e: unknown, d: string) => d,
}));

// La venta: muestra el carrito (y lo que va arriba) y deja quitar una
// línea o ir a cobrar.
vi.mock("./PantallaVenta", () => ({
  default: (props: { carrito: Carrito; onCobrar: () => void; cabecera?: ReactNode }) => (
    <div>
      {props.cabecera}
      <ul>
        {props.carrito.lineas.map((l) => (
          <li key={l.producto.id}>
            {l.producto.nombre} x{l.cantidad} a {l.producto.precio}
            <button onClick={() => props.carrito.quitar(l.producto.id)}>
              quitar {l.producto.nombre}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={props.onCobrar}>ir a cobrar</button>
    </div>
  ),
}));

// El cobro: paga justo el total, y dice a quién le ofrece propina.
vi.mock("./PantallaCobro", () => ({
  default: (props: {
    total: number;
    profesionales?: { id: number; nombre: string }[];
    onConfirmar: (p: unknown[]) => void;
  }) => (
    <div>
      <p>propina para: {(props.profesionales ?? []).map((p) => p.nombre).join(", ") || "nadie"}</p>
      <button onClick={() => props.onConfirmar([{ formaPagoId: 1, monto: props.total }])}>
        pagar {props.total}
      </button>
    </div>
  ),
}));

vi.mock("./PantallaRecibo", () => ({ default: () => <p>recibo</p> }));

import { api } from "../../lib/api";
import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { apiConfigAgenda } from "../../lib/agenda/apiConfigAgenda";
import type { Recurso } from "../../lib/agenda/tiposConfigAgenda";
import Pos from "./Pos";

async function montar(ruta = "/pos") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Pos />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sesion.features = [];
  sesion.conAgenda = false;
});

describe("M-11: lo del salón y del reparto, sólo con su feature", () => {
  it("restaurante con salón y delivery: los mismos pedidos de siempre", async () => {
    sesion.features = ["pos", "caja", "salon", "delivery"];
    await montar();
    expect(api.mesasPorCobrar).toHaveBeenCalled();
    expect(api.entregasMesero).toHaveBeenCalled();
    expect(api.getRepartidores).toHaveBeenCalled();
  });

  it("un salón de belleza sin salon ni delivery no los pide", async () => {
    sesion.features = ["pos", "caja", "agenda"];
    await montar();
    expect(api.mesasPorCobrar).not.toHaveBeenCalled();
    expect(api.entregasMesero).not.toHaveBeenCalled();
    expect(api.getRepartidores).not.toHaveBeenCalled();
  });

  it("con salón pero sin delivery pide sólo lo del salón", async () => {
    sesion.features = ["pos", "salon"];
    await montar();
    expect(api.mesasPorCobrar).toHaveBeenCalled();
    expect(api.getRepartidores).not.toHaveBeenCalled();
  });
});

describe("cobrar una cita", () => {
  const servicio = (id: number, nombre: string, precio: number): Producto =>
    ({
      id,
      nombre,
      precio,
      tipoProducto: "SERVICIO",
      stockTotal: 0,
      habilitado: true,
      componentes: [],
    }) as unknown as Producto;

  const cita: CarritoCita = {
    citaId: 13,
    codigo: "K7M2QX",
    estado: "POR_COBRAR",
    ventaId: null,
    cobroRevisar: false,
    sucursalId: 1,
    cliente: { id: 5, nombre: "Rosa Mamani" },
    lineas: [
      { productoId: 189, descripcion: "Corte de dama", cantidad: 1, precio: 80, recursoId: 3, recurso: "Carla" },
      { productoId: 190, descripcion: "Tinte raíz", cantidad: 1, precio: 150, recursoId: 4, recurso: "Sofía" },
    ],
    total: 230,
  };

  beforeEach(() => {
    sesion.features = ["pos", "caja", "agenda"];
    sesion.conAgenda = true;
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 50 } as never);
    vi.mocked(apiAgenda.carrito).mockResolvedValue(cita);
  });

  it("A-02: si la venta cubre la cita, cobra sin preguntar", async () => {
    vi.mocked(api.getProductos).mockResolvedValue([
      servicio(189, "Corte de dama", 80),
      servicio(190, "Tinte raíz", 150),
    ]);
    await montar("/pos?cita=13");
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 230" }));
    });
    expect(screen.queryByText("La venta no cubre la cita")).not.toBeInTheDocument();
    expect(api.crearVenta).toHaveBeenCalledWith(expect.objectContaining({ citaId: 13 }));
  });

  it("A-02: sin un servicio, pide confirmación y Cancelar no cobra", async () => {
    vi.mocked(api.getProductos).mockResolvedValue([
      servicio(189, "Corte de dama", 80),
      servicio(190, "Tinte raíz", 150),
    ]);
    await montar("/pos?cita=13");
    fireEvent.click(screen.getByRole("button", { name: "quitar Tinte raíz" }));
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    fireEvent.click(screen.getByRole("button", { name: "pagar 80" }));

    expect(screen.getByText("La venta no cubre la cita")).toBeInTheDocument();
    expect(screen.getByText(/faltan: Tinte raíz · cobrás .*80.* de .*230/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.crearVenta).not.toHaveBeenCalled();

    // Y "Cobrar igual" la manda con la cita.
    fireEvent.click(screen.getByRole("button", { name: "pagar 80" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cobrar igual" }));
    });
    expect(api.crearVenta).toHaveBeenCalledWith(expect.objectContaining({ citaId: 13 }));
  });

  it("sin promociones, el carrito cobra el precio propio del profesional que trae la cita", async () => {
    // Sofía cobra el tinte a 180 (su precio propio, fase 2); el de lista es
    // 150. El backend cobra 180: si el carrito mostraba 150, los pagos no
    // sumaban y la venta rebotaba (sin `promociones` no hay cotización).
    vi.mocked(api.getProductos).mockResolvedValue([
      servicio(189, "Corte de dama", 80),
      servicio(190, "Tinte raíz", 150),
    ]);
    vi.mocked(apiAgenda.carrito).mockResolvedValue({
      ...cita,
      lineas: cita.lineas.map((l) => (l.productoId === 190 ? { ...l, precio: 180 } : l)),
      total: 260,
    });
    await montar("/pos?cita=13");
    expect(screen.getByText(/Tinte raíz x1 a 180/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 260" }));
    });
    // La cubre: no pregunta, y cada servicio va con su profesional.
    expect(screen.queryByText("La venta no cubre la cita")).not.toBeInTheDocument();
    expect(api.crearVenta).toHaveBeenCalledWith(
      expect.objectContaining({
        citaId: 13,
        detalles: [
          expect.objectContaining({ productoId: 189, recursoId: 3 }),
          expect.objectContaining({ productoId: 190, precio: 180, recursoId: 4 }),
        ],
      }),
    );
  });

  it("A-03: el servicio desactivado se carga igual, con el precio de la cita", async () => {
    // El catálogo ya no trae el Tinte (lo desactivaron después de agendar).
    vi.mocked(api.getProductos).mockResolvedValue([servicio(189, "Corte de dama", 80)]);
    await montar("/pos?cita=13");
    expect(screen.getByText(/Tinte raíz x1/)).toBeInTheDocument();
    expect(screen.queryByText(/No están en el catálogo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 230" }));
    });
    expect(api.crearVenta).toHaveBeenCalledWith(
      expect.objectContaining({
        citaId: 13,
        detalles: expect.arrayContaining([expect.objectContaining({ productoId: 190, precio: 150 })]),
      }),
    );
  });
});

describe("N2-13: venta directa con profesional", () => {
  const servicio = (id: number, nombre: string, precio: number): Producto =>
    ({
      id,
      nombre,
      precio,
      tipoProducto: "SERVICIO",
      stockTotal: 0,
      habilitado: true,
      componentes: [],
    }) as unknown as Producto;

  const profesional = (id: number, nombre: string, propios: Record<number, number> = {}): Recurso =>
    ({
      id,
      tipo: "PROFESIONAL",
      nombre,
      activo: true,
      orden: id,
      sucursalIds: [1],
      servicioIds: [189, 190],
      serviciosPropios: Object.entries(propios).map(([sid, precio]) => ({
        servicioId: Number(sid),
        precio,
        duracionMin: null,
        comisionPct: null,
      })),
    }) as unknown as Recurso;

  /** El carrito que quedó de antes de un F5: así el POS lo rehidrata. */
  const enCarrito = (...ids: number[]) =>
    sessionStorage.setItem(
      "bamar.carrito.LOCAL",
      JSON.stringify(ids.map((id) => ({ id, cantidad: 1, enMesa: 1, nota: "" }))),
    );

  beforeEach(() => {
    vi.mocked(api.getProductos).mockResolvedValue([
      servicio(189, "Corte de dama", 80),
      servicio(190, "Tinte raíz", 150),
    ]);
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 51 } as never);
    vi.mocked(apiConfigAgenda.recursos).mockResolvedValue([
      profesional(3, "Carla", { 190: 180 }),
      profesional(4, "Sofía"),
    ]);
  });

  it("sin agenda (Omar) no pide profesionales, no hay selector y la venta es la de siempre", async () => {
    sesion.features = ["pos", "caja", "salon", "delivery"];
    enCarrito(189);
    await montar();
    expect(apiConfigAgenda.recursos).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Quién atendió?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    expect(screen.getByText("propina para: nadie")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 80" }));
    });
    const cuerpo = vi.mocked(api.crearVenta).mock.calls[0][0] as { detalles: object[] };
    expect(cuerpo.detalles).toEqual([{ productoId: 189, cantidad: 1, precio: 80, consumo: "MESA" }]);
    expect(cuerpo).not.toHaveProperty("citaId");
  });

  it("con agenda: elegir quién atendió cobra su precio, manda recursoId y ofrece su propina", async () => {
    sesion.features = ["pos", "caja", "agenda", "propinas"];
    sesion.conAgenda = true;
    enCarrito(189, 190);
    await montar();
    expect(apiConfigAgenda.recursos).toHaveBeenCalled();
    expect(screen.getByText("¿Quién atendió?")).toBeInTheDocument();
    // Sin elegir, el precio de lista.
    expect(screen.getByText(/Tinte raíz x1 a 150/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Profesional de la venta"), { target: { value: "3" } });
    // Carla cobra el tinte a 180 (su precio propio): el total del cobro es ése.
    expect(screen.getByText(/Tinte raíz x1 a 180/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    expect(screen.getByText("propina para: Carla")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 260" }));
    });
    expect(api.crearVenta).toHaveBeenCalledWith(
      expect.objectContaining({
        detalles: [
          expect.objectContaining({ productoId: 189, precio: 80, recursoId: 3 }),
          expect.objectContaining({ productoId: 190, precio: 180, recursoId: 3 }),
        ],
      }),
    );
    // La venta siguiente arranca sin profesional.
    expect(sessionStorage.getItem("bamar.profesionalVenta")).toBeNull();
  });

  it("por servicio: cada uno con su profesional, y la propina para los dos", async () => {
    sesion.features = ["pos", "caja", "agenda", "propinas"];
    sesion.conAgenda = true;
    enCarrito(189, 190);
    await montar();
    fireEvent.change(screen.getByLabelText("Profesional de la venta"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Por servicio" }));
    fireEvent.change(screen.getByLabelText("Profesional de Corte de dama"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    expect(screen.getByText("propina para: Carla, Sofía")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 260" }));
    });
    const cuerpo = vi.mocked(api.crearVenta).mock.calls[0][0] as {
      detalles: { productoId: number; recursoId?: number }[];
    };
    expect(cuerpo.detalles.map((d) => [d.productoId, d.recursoId])).toEqual([
      [189, 4],
      [190, 3],
    ]);
  });

  it("sin elegir a nadie, con agenda, la venta sale como siempre", async () => {
    sesion.features = ["pos", "caja", "agenda"];
    sesion.conAgenda = true;
    enCarrito(189);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 80" }));
    });
    const cuerpo = vi.mocked(api.crearVenta).mock.calls[0][0] as { detalles: object[] };
    expect(cuerpo.detalles).toEqual([{ productoId: 189, cantidad: 1, precio: 80, consumo: "MESA" }]);
  });
});
