import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * Los botones de Yango y PedidosYa junto a «Cobrar» en el carrito
 * (PLAN-PEDIDOS-PLATAFORMA §5). Qué plataformas se ofrecen lo decide el POS
 * (features y permiso); acá se prueba cómo se dibujan y qué disparan.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "elganadero" },
    usuario: { username: "ana" },
    rubro: "RESTAURANTE",
    incluye: () => false,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({ api: {} }));

import PantallaVenta from "./PantallaVenta";
import type { Carrito } from "./useCarrito";

const ARROZ = {
  id: 5,
  nombre: "Arroz con leche L",
  precio: 35,
  tipoProducto: "ALMACENABLE",
  stockTotal: 10,
  habilitado: true,
  componentes: [],
} as unknown as Producto;

function carritoCon(productos: Producto[]): Carrito {
  const lineas = productos.map((producto) => ({ producto, cantidad: 2, enMesa: 0, nota: "" }));
  return {
    lineas,
    unidades: lineas.length * 2,
    subtotal: 70,
    total: 70,
    agregar: vi.fn(),
    setCantidad: vi.fn(),
    setAgregados: vi.fn(),
    setNota: vi.fn(),
    setEnMesa: vi.fn(),
    setConsumo: vi.fn(),
    setConsumoTodo: vi.fn(),
    quitar: vi.fn(),
    vaciar: vi.fn(),
    aDetalles: vi.fn(() => []),
  };
}

const onCobrar = vi.fn();
const onElegir = vi.fn();

async function montar(
  extra: Partial<React.ComponentProps<typeof PantallaVenta>> = {},
  productos = [ARROZ],
) {
  render(
    <MemoryRouter>
      <PantallaVenta
        productos={[ARROZ]}
        categorias={[]}
        carrito={carritoCon(productos)}
        onCobrar={onCobrar}
        {...extra}
      />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("botones de Yango y PedidosYa en el carrito", () => {
  it("un botón por plataforma, junto a Cobrar; cada uno avisa cuál se tocó", async () => {
    await montar({ plataformas: { disponibles: ["YANGO", "PEDIDOS_YA"], onElegir } });
    expect(screen.getByRole("button", { name: /Cobrar/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yango" }));
    expect(onElegir).toHaveBeenLastCalledWith("YANGO");
    fireEvent.click(screen.getByRole("button", { name: "PedidosYa" }));
    expect(onElegir).toHaveBeenLastCalledWith("PEDIDOS_YA");
    // No cobran nada: «Cobrar» no se dispara.
    expect(onCobrar).not.toHaveBeenCalled();
  });

  it("sólo la plataforma prendida", async () => {
    await montar({ plataformas: { disponibles: ["PEDIDOS_YA"], onElegir } });
    expect(screen.queryByRole("button", { name: "Yango" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PedidosYa" })).toBeInTheDocument();
  });

  it("sin plataformas (casi todos los negocios) el carrito es el de siempre", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: "Yango" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PedidosYa" })).not.toBeInTheDocument();
    await montar({ plataformas: { disponibles: [], onElegir } });
    expect(screen.queryByRole("button", { name: "Yango" })).not.toBeInTheDocument();
  });

  it("con el carrito vacío no hay a quién cobrarle ni pedido que registrar", async () => {
    await montar({ plataformas: { disponibles: ["YANGO"], onElegir } }, []);
    expect(screen.queryByRole("button", { name: "Yango" })).not.toBeInTheDocument();
  });

  it("se apagan junto con Cobrar cuando falta algo para vender (un paquete sin cliente)", async () => {
    await montar({
      plataformas: { disponibles: ["YANGO"], onElegir },
      bloqueoCobro: "Elegí a nombre de quién queda el paquete (arriba) para cobrar.",
    });
    expect(screen.getByRole("button", { name: "Yango" })).toBeDisabled();
  });
});
