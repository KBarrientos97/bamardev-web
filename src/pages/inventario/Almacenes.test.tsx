import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, ApunteStock } from "../../types";

/**
 * Cómo se llama esta pantalla según el rubro.
 *
 * En farmacia un almacén es otro local: la pantalla dice "Sucursales", y cada
 * lugar se nombra por su tipo (sucursal o depósito). El restaurante la usa en
 * producción y su app dice "almacén": sus textos quedan exactamente como
 * estaban.
 */

const sesion = vi.hoisted(() => ({
  rubro: "FARMACIA" as string,
  // undefined = sesión sin features: falla abierto, como antes.
  features: undefined as string[] | undefined,
  // Si entra a Configuración › Datos de las sucursales.
  configura: true,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: sesion.rubro, negocio: { features: sesion.features }, puede: () => sesion.configura }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getAlmacenes: vi.fn(),
    getPreciosSucursal: vi.fn(async () => []),
    getProductos: vi.fn(async () => []),
    getBitacoraStock: vi.fn(async () => []),
    actualizarAlmacen: vi.fn(async () => ({})),
    crearAlmacen: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import Almacenes from "./Almacenes";

function almacen(id: number, nombre: string, tipo: Almacen["tipo"]): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo,
    esPrincipal: id === 1,
    direccion: null,
    telefono: null,
    totalArticulos: 0,
    totalUnidades: 0,
    valorTotal: 0,
    articulos: [],
  };
}

const LUGARES = [almacen(1, "Sucursal Centro", "SUCURSAL"), almacen(2, "Depósito central", "DEPOSITO")];

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "FARMACIA";
  sesion.configura = true;
  sesion.features = undefined;
  vi.mocked(api.getAlmacenes).mockResolvedValue(LUGARES);
});

describe("Varios almacenes", () => {
  it("sin la feature se ve el almacén pero no se registra otro, y dice por qué", async () => {
    // Kevin, 15-oct: igual que la app. Antes la pantalla entera desaparecía.
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["inventario"];
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Almacén principal", "SUCURSAL")]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    expect(await screen.findByText("Almacén principal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo" })).not.toBeInTheDocument();
    expect(screen.getByText(/Tu cuenta permite registrar un solo almacén/)).toBeInTheDocument();
  });

  it("con la feature se ofrece Nuevo", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["inventario", "multi_almacen"];
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Almacén principal", "SUCURSAL")]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    await screen.findByText("Almacén principal");
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeInTheDocument();
    expect(screen.queryByText(/Tu cuenta permite registrar/)).not.toBeInTheDocument();
  });
});

async function abrir() {
  render(<Almacenes />, { wrapper: MemoryRouter });
  await screen.findByText("Sucursal Centro");
}

function abrirDetalle(nombre: string) {
  fireEvent.click(screen.getByText(nombre));
  return screen.getByRole("dialog");
}

describe("farmacia: almacén es sucursal", () => {
  it("la pantalla se llama Sucursales", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Sucursales" })).toBeInTheDocument();
    expect(screen.queryByText(/almac[eé]n/i)).not.toBeInTheDocument();
  });

  it("el detalle nombra a la sucursal como sucursal", async () => {
    await abrir();
    const detalle = abrirDetalle("Sucursal Centro");
    expect(detalle).toHaveAccessibleName("Detalle de la sucursal");
    expect(within(detalle).getByText("Sucursal vacía")).toBeInTheDocument();
    expect(within(detalle).getByText("Todavía no entró stock a esta sucursal.")).toBeInTheDocument();
  });

  it("y al depósito como depósito: guarda pero no vende", async () => {
    await abrir();
    const detalle = abrirDetalle("Depósito central");
    expect(detalle).toHaveAccessibleName("Detalle del depósito");
    expect(within(detalle).getByText("Depósito vacío")).toBeInTheDocument();

    fireEvent.click(within(detalle).getByRole("button", { name: "Eliminar" }));
    expect(screen.getByRole("dialog", { name: "Eliminar depósito" })).toBeInTheDocument();
  });

  it("el alta sigue al tipo elegido", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(screen.getByRole("dialog", { name: "Nueva sucursal" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Depósito" }));
    expect(screen.getByRole("dialog", { name: "Nuevo depósito" })).toBeInTheDocument();
  });

  it("sin ninguna, invita a crear la primera sucursal", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    expect(await screen.findByText("Todavía no hay sucursales")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva sucursal" })).toBeInTheDocument();
  });

  it("lo guardado sigue nombrando productos e insumos: sólo el restaurante cambió", async () => {
    await abrir();
    const detalle = abrirDetalle("Sucursal Centro");
    expect(within(detalle).getByText("— productos e insumos con stock")).toBeInTheDocument();
  });
});

describe("restaurante: los textos de siempre", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("la pantalla sigue llamándose Almacenes", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Almacenes" })).toBeInTheDocument();
  });

  it("lo guardado son productos: los insumos ya no se cuentan en el almacén (28-oct)", async () => {
    // El stock de un insumo del restaurante no baja nunca (vender un plato no
    // lo descuenta) y el backend ya no lo manda acá: el texto no los nombra.
    await abrir();
    const detalle = abrirDetalle("Sucursal Centro");
    expect(within(detalle).getByText("— productos con stock")).toBeInTheDocument();
    expect(within(detalle).queryByText(/insumos/)).not.toBeInTheDocument();
  });

  it("el detalle y el borrado dicen almacén, sea sucursal o depósito", async () => {
    await abrir();
    const detalle = abrirDetalle("Depósito central");
    expect(detalle).toHaveAccessibleName("Detalle del almacén");
    expect(within(detalle).getByText("Almacén vacío")).toBeInTheDocument();
    expect(
      within(detalle).getByText("Todavía no entró stock a esta ubicación."),
    ).toBeInTheDocument();

    fireEvent.click(within(detalle).getByRole("button", { name: "Eliminar" }));
    expect(screen.getByRole("dialog", { name: "Eliminar almacén" })).toBeInTheDocument();
  });

  it("el alta dice Nuevo almacén con cualquier tipo", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(screen.getByRole("dialog", { name: "Nuevo almacén" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Depósito" }));
    expect(screen.getByRole("dialog", { name: "Nuevo almacén" })).toBeInTheDocument();
  });

  it("sin ninguno, el vacío de siempre", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    expect(await screen.findByText("Todavía no hay almacenes")).toBeInTheDocument();
    expect(screen.getByText("Creá la primera ubicación donde guardás el stock.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo almacén" })).toBeInTheDocument();
  });

  it("la bitácora no dice el saldo de un insumo; el de un producto, sí (28-oct)", async () => {
    // El saldo de un insumo del restaurante es la suma de todas sus compras:
    // "Aceite · Entrada +20 · queda 340" se leía como lo que había en la
    // cocina, debajo de "productos con stock", que ya los deja afuera.
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Almacén principal", "SUCURSAL")]);
    vi.mocked(api.getBitacoraStock).mockResolvedValue([
      apunte(1, "Aceite", 20, 340, true),
      apunte(2, "Coca Cola 2L", -2, 10, false),
    ]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    await screen.findByText("Almacén principal");
    const detalle = abrirDetalle("Almacén principal");

    // El apunte del insumo sigue: dice qué entró. Sólo se va el saldo.
    const aceite = (await within(detalle).findByText("Aceite")).closest("li")!;
    expect(within(aceite).getByText("+20")).toBeInTheDocument();
    expect(within(aceite).queryByText(/^queda/)).not.toBeInTheDocument();
    expect(within(detalle).queryByText("queda 340")).not.toBeInTheDocument();

    const coca = within(detalle).getByText("Coca Cola 2L").closest("li")!;
    expect(within(coca).getByText("queda 10")).toBeInTheDocument();
  });

  it("con un backend que no dice cuál es insumo, la bitácora va sin el saldo de ninguno", async () => {
    // Antes del 28-oct el backend no manda `esInsumo`: mostrar el saldo de
    // todos dejaría ver el de los insumos, que es lo que se esconde.
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Almacén principal", "SUCURSAL")]);
    vi.mocked(api.getBitacoraStock).mockResolvedValue([apunte(1, "Aceite", 20, 340), apunte(2, "Coca Cola 2L", -2, 10)]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    await screen.findByText("Almacén principal");
    const detalle = abrirDetalle("Almacén principal");

    expect(await within(detalle).findByText("+20")).toBeInTheDocument();
    expect(within(detalle).getByText("Coca Cola 2L")).toBeInTheDocument();
    expect(within(detalle).queryByText(/^queda/)).not.toBeInTheDocument();
  });
});

describe("los demás rubros: el saldo de los insumos se sigue viendo", () => {
  // En un salón el insumo se gasta con cada servicio y su stock sí baja:
  // esconderlo ahí sería esconder un dato real.
  beforeEach(() => {
    sesion.rubro = "PELUQUERIA";
  });

  it("la bitácora dice el saldo del insumo", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Almacén principal", "SUCURSAL")]);
    vi.mocked(api.getBitacoraStock).mockResolvedValue([apunte(1, "Tinte rubio", -1, 6, true)]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    await screen.findByText("Almacén principal");
    const detalle = abrirDetalle("Almacén principal");

    expect(await within(detalle).findByText("queda 6")).toBeInTheDocument();
    expect(within(detalle).getByText("— productos e insumos con stock")).toBeInTheDocument();
  });

  // Estaba con el restaurante: ahí el saldo de un insumo ya no se muestra
  // (28-oct), y lo que se cuida acá es cómo se escriben las cantidades.
  it("las cantidades van sin ,00 y la fracción del insumo no se redondea", async () => {
    // Kevin, 25-oct: "12,00 Unidad" no. Y la bitácora redondeaba: 2,5 kg salía
    // "+3", y un saldo de −0,0004, "queda -0".
    vi.mocked(api.getAlmacenes).mockResolvedValue([
      {
        ...almacen(1, "Almacén principal", "SUCURSAL"),
        totalArticulos: 2,
        totalUnidades: 14.5,
        articulos: [
          { id: 1, nombre: "Coca Cola 2L", unidad: "Unidad", stock: 12, costo: 9 },
          { id: 2, nombre: "Harina", unidad: "kg", stock: 2.5, costo: 6 },
        ],
      },
    ]);
    vi.mocked(api.getBitacoraStock).mockResolvedValue([apunte(1, "Harina", 2.5, 2.5), apunte(2, "Aceite", -0.5, -0.0004)]);
    render(<Almacenes />, { wrapper: MemoryRouter });
    await screen.findByText("Almacén principal");
    const detalle = abrirDetalle("Almacén principal");

    expect(within(detalle).getByText("12 Unidad")).toBeInTheDocument();
    expect(within(detalle).getByText("2,5 kg")).toBeInTheDocument();
    expect(within(detalle).getByText("14,5")).toBeInTheDocument();
    expect(await within(detalle).findByText("+2,5")).toBeInTheDocument();
    expect(within(detalle).getByText("queda 2,5")).toBeInTheDocument();
    expect(within(detalle).getByText("-0,5")).toBeInTheDocument();
    expect(within(detalle).getByText("queda 0")).toBeInTheDocument();
  });
});

/** Sin `esInsumo`, el apunte tiene la forma de un backend anterior al 28-oct. */
function apunte(id: number, producto: string, cantidad: number, saldoDespues: number, esInsumo?: boolean): ApunteStock {
  return {
    id,
    cantidad,
    saldoDespues,
    motivo: cantidad > 0 ? "ENTRADA" : "SALIDA",
    fecha: "2026-10-25T12:00:00.000Z",
    producto: esInsumo === undefined ? { id, nombre: producto } : { id, nombre: producto, esInsumo },
    almacen: { id: 1, nombre: "Almacén principal" },
    usuario: null,
    referenciaTipo: null,
    referenciaId: null,
  };
}

describe("lo que ve el cliente: en la ficha única de Sucursales (02-nov)", () => {
  it("editar una sucursal lleva a Configuración › Sucursales; Almacenes ya no pide dirección, teléfono, mapa ni horario", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["inventario"];
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Sucursal Centro", "SUCURSAL")]);
    render(
      <MemoryRouter>
        <Almacenes />
      </MemoryRouter>,
    );
    await screen.findByText("Sucursal Centro");
    const detalle = abrirDetalle("Sucursal Centro");
    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("link", { name: "Configuración › Datos de las sucursales" })).toHaveAttribute(
      "href",
      "/configuracion/sucursales",
    );
    expect(screen.queryByRole("group", { name: /Ubicación en el mapa/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Dirección")).not.toBeInTheDocument();
    expect(screen.queryByText("Teléfono")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    // No se mandan: un PATCH sin ellos no pisa lo cargado en la ficha.
    const enviado = vi.mocked(api.actualizarAlmacen).mock.calls[0][1];
    for (const campo of ["direccion", "telefono", "latitud", "horarioSemanal"]) expect(enviado).not.toHaveProperty(campo);
  });

  it("un depósito sí carga su dirección acá (no atiende público ni sale en la ficha)", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["inventario", "multi_almacen"];
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Sucursal Centro", "SUCURSAL")]);
    render(
      <MemoryRouter>
        <Almacenes />
      </MemoryRouter>,
    );
    await screen.findByText("Sucursal Centro");
    fireEvent.click(screen.getByRole("button", { name: /^Nuevo/ }));
    // Sucursal nueva: avisa dónde se completan sus datos.
    expect(screen.getByText(/Después de crearla: la dirección, el teléfono/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Depósito" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Galpón" } });
    fireEvent.change(screen.getByLabelText(/^Dirección/), { target: { value: "Parque industrial" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(api.crearAlmacen).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Galpón", tipo: "DEPOSITO", direccion: "Parque industrial" }),
    );
  });

  it("quien no entra a la Configuración ve dónde se cargan, sin el enlace", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["inventario"];
    sesion.configura = false;
    vi.mocked(api.getAlmacenes).mockResolvedValue([almacen(1, "Sucursal Centro", "SUCURSAL")]);
    render(
      <MemoryRouter>
        <Almacenes />
      </MemoryRouter>,
    );
    await screen.findByText("Sucursal Centro");
    fireEvent.click(within(abrirDetalle("Sucursal Centro")).getByRole("button", { name: "Editar" }));
    expect(screen.getByText(/lo hace el dueño/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Datos de las sucursales/ })).not.toBeInTheDocument();
  });
});
