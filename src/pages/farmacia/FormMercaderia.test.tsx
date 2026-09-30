import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, ArticuloMovimiento, Movimiento } from "../../types";

/**
 * Editar un movimiento PENDIENTE no puede costarle a nadie lo que ya cargó.
 *
 * Mientras esté pendiente el inventario no se tocó, así que corregir el almacén
 * o pasar de salida a entrada es tan válido como corregir una cantidad: los
 * renglones se quedan donde están. Vaciarlos era tirar diez líneas de una
 * recepción de droguería sin avisar y sin forma de deshacerlo.
 */

/** Qué compró el negocio. `lotes` es PRO: una farmacia BASICO no lo tiene. */
const plan = vi.hoisted(() => ({ lotes: true }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ incluye: (c: string) => (c === "lotes" ? plan.lotes : true) }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getAlmacenes: vi.fn(),
    getMovimiento: vi.fn(),
    getArticulosMovimiento: vi.fn(),
    lotesDeProducto: vi.fn(async () => []),
    actualizarMovimiento: vi.fn(async () => ({})),
    actualizarDetalleMovimiento: vi.fn(async () => ({})),
    agregarDetalleMovimiento: vi.fn(async () => ({})),
    eliminarDetalleMovimiento: vi.fn(async () => ({})),
    ubicacionesUsadas: vi.fn(async () => ["Estante 3 · fila B", "Vitrina 1"]),
    fijarUbicacionProducto: vi.fn(async () => ({ ubicacion: null })),
    crearMovimiento: vi.fn(async () => ({ id: 999 })),
    proveedores: vi.fn(async () => [
      {
        id: 5,
        nombre: "Droguería INTI",
        nit: "1020304",
        telefono: null,
        contacto: null,
        nota: null,
        activo: true,
        compras: { total: 0, ingresos: 0 },
        ultimaCompra: null,
      },
    ]),
    crearProveedor: vi.fn(async ({ nombre }: { nombre: string }) => ({
      id: 6,
      nombre,
      nit: null,
      telefono: null,
      contacto: null,
      nota: null,
      activo: true,
    })),
    aprobarMovimiento: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import FormMercaderia from "./FormMercaderia";

const DEPOSITO = 1;
const MOSTRADOR = 2;

/** Cuánta amoxicilina hay en cada almacén. El de al lado tiene menos. */
const STOCK: Record<number, number> = { [DEPOSITO]: 100, [MOSTRADOR]: 3 };

function almacen(id: number, nombre: string): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo: "DEPOSITO",
    esPrincipal: id === DEPOSITO,
    direccion: null,
    telefono: null,
  };
}

/** Dónde está la amoxicilina en cada almacén. En el de al lado, en ningún lado. */
const UBICACION: Record<number, string | null> = {
  [DEPOSITO]: "Estante 3 · fila B",
  [MOSTRADOR]: null,
};

function articulo(stock: number, ubicacion: string | null = null): ArticuloMovimiento {
  return {
    ubicacion,
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

const salidaPendiente: Movimiento = {
  id: 950,
  tipo: "SALIDA",
  comprobante: null,
  descripcion: "Vencimiento · prueba de la pantalla nueva",
  estado: "PENDIENTE",
  fecha: "2026-09-15T12:00:00.000Z",
  fechaAprobacion: null,
  origen: "PRODUCTO",
  almacen: { id: DEPOSITO, nombre: "Depósito" },
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
      loteCodigo: "AMX-2601",
      loteVencimiento: "2028-04-30",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  plan.lotes = true;
  vi.mocked(api.getAlmacenes).mockResolvedValue([
    almacen(DEPOSITO, "Depósito"),
    almacen(MOSTRADOR, "Mostrador"),
  ]);
  vi.mocked(api.getMovimiento).mockResolvedValue(salidaPendiente);
  vi.mocked(api.getArticulosMovimiento).mockImplementation(
    async (almacenId?: number) => [
      articulo(STOCK[almacenId ?? DEPOSITO] ?? 0, UBICACION[almacenId ?? DEPOSITO] ?? null),
    ],
  );
});

async function abrirEdicion() {
  render(
    <MemoryRouter initialEntries={["/inventario/movimientos/950/editar"]}>
      <Routes>
        <Route
          path="/inventario/movimientos/:id/editar"
          element={<FormMercaderia tipoInicial="SALIDA" />}
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
}

/** Elegir otro almacén y esperar a que llegue su lista de artículos. */
async function elegirAlmacen(id: number) {
  await act(async () => {
    // Por su nombre: con una entrada, el proveedor también es un combobox.
    fireEvent.change(screen.getByRole("combobox", { name: /^Sucursal/ }), {
      target: { value: String(id) },
    });
  });
}

async function clickEn(nombre: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nombre }));
  });
}

describe("El lote que sale, según el plan", () => {
  it("con `lotes` la salida consulta qué lote se va por FEFO", async () => {
    await abrirEdicion();
    await waitFor(() => expect(api.lotesDeProducto).toHaveBeenCalledWith(7, DEPOSITO));
  });

  it("sin `lotes` no lo pide ni dice que no hay lotes", async () => {
    // El backend responde 403 y el error se leía como "Sin lotes con saldo":
    // una mentira, los lotes existen y la salida igual los descuenta por FEFO.
    plan.lotes = false;
    await abrirEdicion();

    expect(api.lotesDeProducto).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sin lotes con saldo/)).not.toBeInTheDocument();
  });
});

describe("Editar un movimiento pendiente", () => {
  it("cambiar de almacén deja los renglones donde están", async () => {
    await abrirEdicion();

    await elegirAlmacen(MOSTRADOR);

    expect(screen.getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByText("1 línea")).toBeInTheDocument();
    // La cantidad tecleada tampoco se pierde.
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
  });

  it("avisa en el acto si en el almacén nuevo ya no alcanza", async () => {
    await abrirEdicion();

    expect(screen.getByText(/Stock en Depósito: 100/)).toBeInTheDocument();

    await elegirAlmacen(MOSTRADOR);

    // Sin esperar a Guardar: se sacan 12 y en Mostrador quedan 3.
    await waitFor(() =>
      expect(screen.getByText(/Stock en Mostrador: 3 u\..*no alcanza/)).toBeInTheDocument(),
    );
  });

  it("pasar de salida a entrada deja los renglones donde están", async () => {
    await abrirEdicion();

    await clickEn(/Entrada/);

    expect(screen.getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByText("1 línea")).toBeInTheDocument();
    // Y ahora sí pide lote, que es lo único que cambia al recibir.
    expect(screen.getByPlaceholderText("Lote")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("MM/AAAA")).toBeInTheDocument();
  });

  it("cambiar almacén y tipo seguido tampoco los pierde", async () => {
    await abrirEdicion();

    await elegirAlmacen(MOSTRADOR);
    await clickEn(/Entrada/);
    await elegirAlmacen(DEPOSITO);

    expect(screen.getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByText("1 línea")).toBeInTheDocument();
  });
});

/**
 * Ir de "Ingreso de mercadería" a "Salida de mercadería" por el menú.
 *
 * Las dos rutas dibujan el MISMO componente, así que React lo reaprovecha y
 * `tipoInicial` —que sólo alimenta el estado inicial— no se vuelve a mirar.
 * App.tsx le pone una `key` distinta a cada ruta justamente para esto; acá se
 * monta igual que allá.
 *
 * Sin la key el formulario se quedaba en Entrada con la URL de salida: se
 * guardaba una entrada creyendo estar cargando una baja.
 */
describe("Cambiar de pantalla desde el menú", () => {
  function comoEnApp() {
    return render(
      <MemoryRouter initialEntries={["/inventario/movimientos/ingreso"]}>
        <nav>
          <Link to="/inventario/movimientos/salida">Salida de mercadería</Link>
          <Link to="/inventario/movimientos/ingreso">Ingreso de mercadería</Link>
        </nav>
        <Routes>
          <Route
            path="/inventario/movimientos/ingreso"
            element={<FormMercaderia key="ingreso" tipoInicial="ENTRADA" />}
          />
          <Route
            path="/inventario/movimientos/salida"
            element={<FormMercaderia key="salida" tipoInicial="SALIDA" />}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("de Ingreso a Salida el formulario pasa a salida", async () => {
    comoEnApp();
    expect(await screen.findByRole("button", { name: "Guardar entrada" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Salida de mercadería"));
    });

    expect(screen.getByRole("button", { name: "Guardar salida" })).toBeInTheDocument();
    // Y con la salida aparece lo suyo: por qué sale la mercadería.
    expect(screen.getByText("Motivo")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Proveedor" })).not.toBeInTheDocument();
  });

  it("y de Salida a Ingreso, de vuelta", async () => {
    comoEnApp();
    await act(async () => {
      fireEvent.click(screen.getByText("Salida de mercadería"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Ingreso de mercadería"));
    });

    expect(screen.getByRole("button", { name: "Guardar entrada" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Proveedor" })).toBeInTheDocument();
  });
});

/**
 * La otra punta de "Dar de baja" en Vencimientos: el formulario abre con todo
 * puesto pero sin guardar nada. La baja la firma una persona, que de paso
 * puede corregir la cantidad si en el estante hay menos de lo que dice el
 * sistema.
 */
describe("Salida precargada desde Vencimientos", () => {
  it("abre con el almacén, el motivo y el renglón puestos", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/inventario/movimientos/salida",
            state: {
              productoId: 7,
              almacenId: MOSTRADOR,
              cantidad: 20,
              motivo: "Vencimiento",
            },
          },
        ]}
      >
        <Routes>
          <Route
            path="/inventario/movimientos/salida"
            element={<FormMercaderia key="salida" tipoInicial="SALIDA" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue(String(MOSTRADOR));
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    // El motivo queda elegido: es lo que después arma el número de mermas.
    expect(screen.getByRole("button", { name: "Vencimiento" })).toHaveClass("bg-danger");
  });

  it("sin precarga el formulario arranca vacío, como siempre", async () => {
    render(
      <MemoryRouter initialEntries={["/inventario/movimientos/salida"]}>
        <Routes>
          <Route
            path="/inventario/movimientos/salida"
            element={<FormMercaderia key="salida" tipoInicial="SALIDA" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("0 líneas")).toBeInTheDocument();
  });
});

/**
 * Al recibir mercadería se sabe en qué estante queda: se puede anotar ahí
 * mismo. Es opcional, y es del artículo en la sucursal, no del movimiento.
 */
describe("La ubicación al recibir", () => {
  async function abrirComoEntrada() {
    await abrirEdicion();
    await clickEn(/Entrada/);
  }

  async function cambiarUbicacion(texto: string) {
    await clickEn(/Estante 3 · fila B|Ubicación \(opcional\)/);
    const campo = screen.getByLabelText("Ubicación en la sucursal");
    await act(async () => {
      fireEvent.change(campo, { target: { value: texto } });
      fireEvent.blur(campo);
    });
  }

  const guardarCambios = () => clickEn(/Guardar cambios/);

  it("muestra la que ya tiene y, sin tocarla, no la vuelve a guardar", async () => {
    await abrirComoEntrada();
    expect(screen.getByText("Estante 3 · fila B")).toBeInTheDocument();

    await guardarCambios();
    expect(api.actualizarMovimiento).toHaveBeenCalled();
    expect(api.fijarUbicacionProducto).not.toHaveBeenCalled();
  });

  it("cambiarla la guarda ANTES que el movimiento", async () => {
    await abrirComoEntrada();
    await cambiarUbicacion("  Vitrina 1 ");
    expect(screen.getByText("· nueva")).toBeInTheDocument();

    await guardarCambios();
    expect(api.fijarUbicacionProducto).toHaveBeenCalledWith(7, DEPOSITO, "Vitrina 1");
    // Si fallara, todavía no se habría tocado el movimiento: reintentar no
    // duplica nada.
    expect(vi.mocked(api.fijarUbicacionProducto).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.actualizarMovimiento).mock.invocationCallOrder[0],
    );
  });

  it("si no se pudo guardar, el movimiento tampoco se guarda y lo dice", async () => {
    vi.mocked(api.fijarUbicacionProducto).mockRejectedValueOnce(new Error("sin conexión"));
    await abrirComoEntrada();
    await cambiarUbicacion("Vitrina 1");

    await guardarCambios();
    expect(api.actualizarMovimiento).not.toHaveBeenCalled();
    expect(screen.getByText(/No se pudo guardar la ubicación de "Amoxicilina 500 mg"/)).toBeInTheDocument();
  });

  it("cambiar de sucursal no borra la que se escribió; la no tocada muestra la de la otra", async () => {
    await abrirComoEntrada();
    await elegirAlmacen(MOSTRADOR);
    // En Mostrador no tiene: se ofrece cargarla.
    await waitFor(() => expect(screen.getByText("Ubicación (opcional)")).toBeInTheDocument());

    await cambiarUbicacion("Cajón 12");
    await elegirAlmacen(DEPOSITO);
    expect(screen.getByText("Cajón 12")).toBeInTheDocument();
  });

  it("una salida no pregunta dónde se guarda", async () => {
    await abrirEdicion();
    expect(screen.queryByText(/Ubicación \(opcional\)|Estante 3/)).not.toBeInTheDocument();
  });
});

/**
 * El proveedor se elige de la lista, o se crea ahí mismo. Lo tecleado y no
 * elegido no se guarda como texto suelto: es lo que partía las compras de un
 * proveedor en tres nombres.
 */
describe("El proveedor del ingreso", () => {
  async function abrirComoEntrada() {
    await abrirEdicion();
    await clickEn(/Entrada/);
  }

  async function teclear(texto: string) {
    const campo = screen.getByRole("combobox", { name: "Proveedor" });
    await act(async () => {
      fireEvent.focus(campo);
      fireEvent.change(campo, { target: { value: texto } });
    });
  }

  async function tocarOpcion(nombre: RegExp) {
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("button", { name: nombre }));
    });
  }

  const guardarCambios = () => clickEn(/Guardar cambios/);

  it("se elige de la lista, sin importar tildes, y viaja con el ingreso", async () => {
    await abrirComoEntrada();
    await teclear("drogueria");
    await tocarOpcion(/Droguería INTI/);
    expect(screen.getByRole("button", { name: "Cambiar el proveedor Droguería INTI" })).toBeInTheDocument();

    await guardarCambios();
    expect(api.actualizarMovimiento).toHaveBeenCalledWith(
      950,
      expect.objectContaining({ proveedorId: 5, descripcion: "Droguería INTI" }),
    );
  });

  it("lo tecleado y no elegido no se guarda: pide elegirlo o crearlo", async () => {
    await abrirComoEntrada();
    await teclear("Droguería Nueva");
    await guardarCambios();
    expect(screen.getByText(/Elegí el proveedor de la lista o crealo/)).toBeInTheDocument();
    expect(api.actualizarMovimiento).not.toHaveBeenCalled();
  });

  it("si no está, se crea ahí mismo y queda elegido", async () => {
    await abrirComoEntrada();
    await teclear("  Droguería Nueva ");
    await tocarOpcion(/Crear «Droguería Nueva»/);
    expect(api.crearProveedor).toHaveBeenCalledWith({ nombre: "Droguería Nueva" });
    expect(screen.getByRole("button", { name: "Cambiar el proveedor Droguería Nueva" })).toBeInTheDocument();
  });

  it("si ya existe con otra tilde o mayúscula, no ofrece crearlo de nuevo", async () => {
    await abrirComoEntrada();
    await teclear("DROGUERIA INTI");
    expect(screen.queryByRole("button", { name: /Crear/ })).not.toBeInTheDocument();
  });

  it("un ingreso de antes de la lista muestra su proveedor escrito, para elegirlo", async () => {
    vi.mocked(api.getMovimiento).mockResolvedValue({
      ...salidaPendiente,
      tipo: "ENTRADA",
      descripcion: "INTI",
      proveedor: null,
    });
    render(
      <MemoryRouter initialEntries={["/inventario/movimientos/950/editar"]}>
        <Routes>
          <Route
            path="/inventario/movimientos/:id/editar"
            element={<FormMercaderia tipoInicial="ENTRADA" />}
          />
        </Routes>
      </MemoryRouter>,
    );
    // Primero llega el ingreso; recién ahí el campo tiene su proveedor.
    expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Proveedor" })).toHaveValue("INTI");
  });

  it("una salida no lleva proveedor", async () => {
    await abrirEdicion();
    await guardarCambios();
    expect(api.actualizarMovimiento).toHaveBeenCalledWith(
      950,
      expect.objectContaining({ proveedorId: null }),
    );
  });
});
