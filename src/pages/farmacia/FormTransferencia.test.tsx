import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Almacen,
  ArticuloMovimiento,
  LoteConSaldo,
  Movimiento,
  Producto,
} from "../../types";

/**
 * Transferir mercadería de una sucursal a otra (farmacia).
 *
 * El motor —servidor— ya mueve el stock y el lote; esta pantalla tiene que
 * mandarle una TRANSFERENCIA bien armada: dos sucursales distintas, lo que hay
 * en el origen, y avisar antes de mandar algo vencido.
 */

const sesion = vi.hoisted(() => ({
  lotes: true,
  dobleControl: false,
  sucursalId: null as number | null,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    incluye: (c: string) =>
      c === "lotes" ? sesion.lotes : c === "aprobacion_inventario" ? sesion.dobleControl : true,
    usuario: { sucursalId: sesion.sucursalId },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getAlmacenes: vi.fn(),
    getMovimiento: vi.fn(),
    getArticulosMovimiento: vi.fn(),
    lotesDeProducto: vi.fn(),
    crearMovimiento: vi.fn(async () => ({ id: 999 })),
    aprobarMovimiento: vi.fn(async () => ({})),
    actualizarMovimiento: vi.fn(async () => ({})),
    actualizarDetalleMovimiento: vi.fn(async () => ({})),
    agregarDetalleMovimiento: vi.fn(async () => ({})),
    eliminarDetalleMovimiento: vi.fn(async () => ({})),
  },
}));

// El buscador de verdad pega al servidor: acá alcanza con elegir el primero.
vi.mock("./BuscadorArticulo", () => ({
  default: ({
    articulos,
    onElegir,
  }: {
    articulos: ArticuloMovimiento[];
    onElegir: (a: ArticuloMovimiento, p: Producto) => void;
  }) => (
    <button onClick={() => onElegir(articulos[0], { nombre: articulos[0].nombre } as Producto)}>
      elegir amoxicilina
    </button>
  ),
}));

import { api } from "../../lib/api";
import FormTransferencia from "./FormTransferencia";

const CENTRO = 1;
const EQUIPETROL = 2;
const NORTE = 3;

function almacen(id: number, nombre: string, extra: Partial<Almacen> = {}): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo: "SUCURSAL",
    esPrincipal: id === CENTRO,
    direccion: null,
    telefono: null,
    ...extra,
  };
}

/** Cuánta amoxicilina hay en cada sucursal. */
const STOCK: Record<number, number> = { [CENTRO]: 100, [EQUIPETROL]: 3, [NORTE]: 0 };

function amoxicilina(stock: number): ArticuloMovimiento {
  return {
    id: 7,
    nombre: "Amoxicilina 500 mg",
    esInsumo: false,
    costo: 5,
    precio: 12,
    stock,
    unidad: "unidad",
    manejaLote: true,
  };
}

function lote(
  loteId: number,
  codigo: string,
  vencimiento: string,
  cantidad: number,
  vencido = false,
): LoteConSaldo {
  return {
    loteId,
    codigo,
    vencimiento,
    diasRestantes: vencido ? -30 : 600,
    tramo: vencido ? "VENCIDO" : null,
    cantidad,
    costoUnitario: 5,
    almacen: { id: CENTRO, nombre: "Centro" },
  };
}

/** En Centro quedaron 2 vencidas sin dar de baja: salen primero por FEFO. */
const LOTES_CENTRO = [
  lote(1, "AMX-VIEJO", "2026-08-31", 2, true),
  lote(2, "AMX-2801", "2028-01-31", 98),
];

function transferencia(extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id: 950,
    tipo: "TRANSFERENCIA",
    comprobante: null,
    descripcion: "Reposición",
    estado: "PENDIENTE",
    fecha: "2026-10-01T12:00:00.000Z",
    fechaAprobacion: null,
    origen: "PRODUCTO",
    almacen: { id: CENTRO, nombre: "Centro" },
    almacenDestino: { id: EQUIPETROL, nombre: "Equipetrol" },
    items: 1,
    monto: 60,
    detalles: [
      {
        id: 301,
        productoId: 7,
        producto: "Amoxicilina 500 mg",
        cantidad: 12,
        costo: 5,
        descripcion: null,
      },
    ],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.lotes = true;
  sesion.dobleControl = false;
  sesion.sucursalId = null;
  vi.mocked(api.getAlmacenes).mockResolvedValue([
    almacen(CENTRO, "Centro"),
    almacen(EQUIPETROL, "Equipetrol"),
  ]);
  vi.mocked(api.getMovimiento).mockResolvedValue(transferencia());
  vi.mocked(api.getArticulosMovimiento).mockImplementation(async (almacenId?: number) => [
    amoxicilina(STOCK[almacenId ?? CENTRO] ?? 0),
  ]);
  vi.mocked(api.lotesDeProducto).mockResolvedValue(LOTES_CENTRO);
});

function abrir(ruta = "/inventario/movimientos/transferencia") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/inventario/movimientos" element={<p>registro de movimientos</p>} />
        <Route
          path="/inventario/movimientos/transferencia"
          element={<FormTransferencia key="nueva" />}
        />
        <Route
          path="/inventario/movimientos/transferencia/:id/editar"
          element={<FormTransferencia key="editar" />}
        />
        <Route
          path="/inventario/movimientos/:id/editar"
          element={<p>pantalla de ingreso y salida</p>}
        />
        <Route path="/inventario/almacenes" element={<p>pantalla de sucursales</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const origen = () => screen.getByRole("combobox", { name: /^Sale de/ });
const destino = () => screen.getByRole("combobox", { name: /^Va a/ });

/** Agrega la amoxicilina y le pone la cantidad. */
async function agregarAmoxicilina(cantidad: string) {
  // Primero que se pida la lista del origen: recién con ella llegada el botón
  // dice "Buscar y agregar" (mientras carga dice "Cargando artículos…").
  await waitFor(() => expect(api.getArticulosMovimiento).toHaveBeenCalledWith(CENTRO));
  fireEvent.click(await screen.findByRole("button", { name: /Buscar y agregar producto/ }));
  fireEvent.click(screen.getByRole("button", { name: "elegir amoxicilina" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Cantidad de Amoxicilina 500 mg" }), {
    target: { value: cantidad },
  });
}

async function clickEn(nombre: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nombre }));
  });
}

describe("De dónde a dónde", () => {
  it("sale de la principal y, con dos sucursales, va a la otra", async () => {
    abrir();
    await waitFor(() => expect(origen()).toHaveValue(String(CENTRO)));
    await waitFor(() => expect(destino()).toHaveValue(String(EQUIPETROL)));
  });

  it("con tres o más, el destino lo elige quien carga", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([
      almacen(CENTRO, "Centro"),
      almacen(EQUIPETROL, "Equipetrol"),
      almacen(NORTE, "Norte"),
    ]);
    abrir();
    await waitFor(() => expect(origen()).toHaveValue(String(CENTRO)));
    expect(destino()).toHaveValue("");
  });

  it("el usuario de una sucursal sólo manda desde la suya", async () => {
    sesion.sucursalId = EQUIPETROL;
    abrir();
    await waitFor(() => expect(origen()).toHaveValue(String(EQUIPETROL)));
    const opciones = within(origen())
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toEqual(["Elegí una", "Equipetrol"]);
  });

  it("un local desactivado no recibe nada: con uno solo activo, no hay a dónde", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([
      almacen(CENTRO, "Centro"),
      almacen(EQUIPETROL, "Equipetrol", { activo: false }),
    ]);
    abrir();
    expect(
      await screen.findByText(/hacen falta al menos dos sucursales activas/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^Sale de/ })).not.toBeInTheDocument();
  });

  it("origen y destino iguales: lo marca en el campo y no guarda", async () => {
    abrir();
    await agregarAmoxicilina("5");
    fireEvent.change(destino(), { target: { value: String(CENTRO) } });

    expect(screen.getByText("Tiene que ser otra: la mercadería sale de Centro.")).toBeInTheDocument();
    await clickEn("Guardar transferencia");
    expect(api.crearMovimiento).not.toHaveBeenCalled();
    expect(
      screen.getByText("Elegí otra sucursal de destino: la mercadería sale de Centro."),
    ).toBeInTheDocument();
  });
});

describe("Qué se manda", () => {
  it("muestra cuánto hay en el origen y no deja mandar más", async () => {
    abrir();
    await agregarAmoxicilina("500");

    expect(screen.getByText(/En Centro: 100 u\. · no alcanza/)).toBeInTheDocument();
    await clickEn("Guardar transferencia");
    expect(api.crearMovimiento).not.toHaveBeenCalled();
    expect(
      screen.getByText('No hay stock suficiente de "Amoxicilina 500 mg" en Centro: quedan 100 u.'),
    ).toBeInTheDocument();
  });

  it("dice qué lote viaja primero y avisa si van unidades vencidas", async () => {
    abrir();
    await agregarAmoxicilina("10");

    await waitFor(() => expect(api.lotesDeProducto).toHaveBeenCalledWith(7, CENTRO));
    expect(await screen.findByText("Lote AMX-VIEJO")).toBeInTheDocument();
    // De las 10, las 2 del lote vencido salen primero por FEFO.
    expect(screen.getByText(/Ojo: viajan 2 u\. vencidas/)).toBeInTheDocument();
  });

  it("sin vencidas en el camino, no hay aviso", async () => {
    vi.mocked(api.lotesDeProducto).mockResolvedValue([lote(2, "AMX-2801", "2028-01-31", 98)]);
    abrir();
    await agregarAmoxicilina("10");
    expect(await screen.findByText("Lote AMX-2801")).toBeInTheDocument();
    expect(screen.queryByText(/vencidas/)).not.toBeInTheDocument();
  });

  it("sin `lotes` en el plan no consulta lotes", async () => {
    sesion.lotes = false;
    abrir();
    await agregarAmoxicilina("10");
    expect(api.lotesDeProducto).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sin lotes con saldo/)).not.toBeInTheDocument();
  });
});

describe("Guardar o aprobar", () => {
  it("Guardar crea la transferencia PENDIENTE con las dos sucursales", async () => {
    abrir();
    await agregarAmoxicilina("10");
    fireEvent.change(screen.getByPlaceholderText("Ej: reposición semanal"), {
      target: { value: "  Reposición  " },
    });
    await clickEn("Guardar transferencia");

    await screen.findByText("registro de movimientos");
    expect(api.crearMovimiento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "TRANSFERENCIA",
        almacenId: CENTRO,
        almacenDestinoId: EQUIPETROL,
        descripcion: "Reposición",
        // Sin costo: lo pone el servidor, el del producto.
        detalles: [{ productoId: 7, cantidad: 10 }],
      }),
    );
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
  });

  it("«Guardar y aprobar» pregunta de dónde a dónde y, al confirmar, aprueba", async () => {
    abrir();
    await agregarAmoxicilina("10");
    await clickEn("Guardar y aprobar");

    const pregunta = screen.getByRole("dialog", { name: "Aprobar la transferencia" });
    expect(within(pregunta).getByText(/Sale de Centro y entra en Equipetrol/)).toBeInTheDocument();
    expect(api.crearMovimiento).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(pregunta).getByRole("button", { name: "Aprobar" }));
    });
    await screen.findByText("registro de movimientos");
    expect(api.aprobarMovimiento).toHaveBeenCalledWith(999);
  });

  it("si no se pudo aprobar, queda pendiente y pasa a editarla, sin duplicarla", async () => {
    vi.mocked(api.aprobarMovimiento).mockRejectedValueOnce(new Error("No hay suficiente"));
    vi.mocked(api.getMovimiento).mockResolvedValue(transferencia({ id: 999 }));
    abrir();
    await agregarAmoxicilina("10");
    await clickEn("Guardar y aprobar");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });

    expect(
      await screen.findByText(/Se guardó como pendiente, pero no se pudo aprobar: No hay suficiente/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editar transferencia #999" })).toBeInTheDocument();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
  });

  it("con el extra de doble control sólo guarda: la aprueba otra persona", async () => {
    sesion.dobleControl = true;
    abrir();
    await screen.findByRole("button", { name: /Buscar y agregar producto/ });
    expect(screen.queryByRole("button", { name: "Guardar y aprobar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar transferencia" })).toBeInTheDocument();
  });
});

describe("Editar una transferencia pendiente", () => {
  it("arranca con lo guardado y guarda también las sucursales", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([
      almacen(CENTRO, "Centro"),
      almacen(EQUIPETROL, "Equipetrol"),
      almacen(NORTE, "Norte"),
    ]);
    abrir("/inventario/movimientos/transferencia/950/editar");

    expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(origen()).toHaveValue(String(CENTRO));
    expect(destino()).toHaveValue(String(EQUIPETROL));
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();

    fireEvent.change(destino(), { target: { value: String(NORTE) } });
    await clickEn("Guardar cambios");

    await screen.findByText("registro de movimientos");
    expect(api.actualizarMovimiento).toHaveBeenCalledWith(950, {
      almacenId: CENTRO,
      almacenDestinoId: NORTE,
      descripcion: "Reposición",
    });
    expect(api.actualizarDetalleMovimiento).toHaveBeenCalledWith(301, { cantidad: 12 });
    expect(api.crearMovimiento).not.toHaveBeenCalled();
  });

  it("una aprobada no se edita: se anula", async () => {
    vi.mocked(api.getMovimiento).mockResolvedValue(transferencia({ estado: "APROBADO" }));
    abrir("/inventario/movimientos/transferencia/950/editar");
    expect(await screen.findByText(/ya está aprobado: la mercadería ya se movió/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
  });

  it("una entrada abierta por esta dirección va a su pantalla", async () => {
    vi.mocked(api.getMovimiento).mockResolvedValue(
      transferencia({ tipo: "ENTRADA", almacenDestino: null }),
    );
    abrir("/inventario/movimientos/transferencia/950/editar");
    expect(await screen.findByText("pantalla de ingreso y salida")).toBeInTheDocument();
    expect(api.actualizarMovimiento).not.toHaveBeenCalled();
  });
});
