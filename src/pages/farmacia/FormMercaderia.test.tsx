import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Almacen,
  ArticuloMovimiento,
  LoteConSaldo,
  Movimiento,
  Producto,
} from "../../types";

/**
 * Editar un movimiento PENDIENTE no puede costarle a nadie lo que ya cargó.
 *
 * Mientras esté pendiente el inventario no se tocó, así que corregir el almacén
 * o pasar de salida a entrada es tan válido como corregir una cantidad: los
 * renglones se quedan donde están. Vaciarlos era tirar diez líneas de una
 * recepción de droguería sin avisar y sin forma de deshacerlo.
 */

/**
 * Qué compró el negocio. `lotes` es PRO: una farmacia BASICO no lo tiene.
 * `dobleControl` es el extra `aprobacion_inventario`, que no trae ningún plan:
 * la farmacia de QA no lo tiene, y sin él guardar aprobaba solo.
 */
const plan = vi.hoisted(() => ({ lotes: true, dobleControl: false }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    incluye: (c: string) =>
      c === "lotes" ? plan.lotes : c === "aprobacion_inventario" ? plan.dobleControl : true,
  }),
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
    buscarProductos: vi.fn(async () => ({ items: [], total: 0, limite: 20, offset: 0 })),
  },
}));

/**
 * Si se usa el buscador de verdad. Casi todos los tests no lo necesitan: pega
 * al servidor y acá alcanza con elegir el primero que todavía no esté en la
 * lista. Los del ingreso rápido (B10) sí, porque lo que prueban es el Enter y
 * que el diálogo siga abierto.
 */
const buscador = vi.hoisted(() => ({ real: false }));

vi.mock("./BuscadorArticulo", async (importOriginal) => {
  const real = await importOriginal<typeof import("./BuscadorArticulo")>();
  return {
    default: (props: Parameters<typeof real.default>[0]) => {
      if (buscador.real) return <real.default {...props} />;
      const { articulos, yaElegidos, onElegir } = props;
      const a = articulos.find((x) => !yaElegidos.includes(x.id)) ?? articulos[0];
      return (
        <button onClick={() => onElegir(a, { nombre: a.nombre } as Producto)}>elegir el siguiente</button>
      );
    },
  };
});

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

function lote(codigo: string, vencimiento: string, cantidad: number): LoteConSaldo {
  return {
    loteId: codigo.length,
    codigo,
    vencimiento,
    diasRestantes: null,
    tramo: null,
    cantidad,
    costoUnitario: 5,
    almacen: { id: DEPOSITO, nombre: "Depósito" },
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
  plan.dobleControl = false;
  buscador.real = false;
  vi.mocked(api.getAlmacenes).mockResolvedValue([
    almacen(DEPOSITO, "Depósito"),
    almacen(MOSTRADOR, "Mostrador"),
  ]);
  vi.mocked(api.getMovimiento).mockResolvedValue(salidaPendiente);
  // `clearAllMocks` no borra lo que un test le hizo devolver: sin esto los
  // lotes de un test aparecían en los siguientes.
  vi.mocked(api.lotesDeProducto).mockResolvedValue([]);
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

describe("Recibir sin `lotes` en el plan (16-oct)", () => {
  // Un renglón sin lote de un medicamento que maneja lote (nació así cuando el
  // alta lo prendía por defecto). Sin `lotes` no hay Vencimientos que lo use, y
  // la ficha ya no muestra el interruptor para apagarlo: pedirlo dejaba al
  // negocio tecleando lote y fecha en cada compra, sin salida.
  const sinLote: Movimiento = {
    ...salidaPendiente,
    detalles: [{ ...salidaPendiente.detalles![0], loteCodigo: null, loteVencimiento: null }],
  };

  beforeEach(() => {
    vi.mocked(api.getMovimiento).mockResolvedValue(sinLote);
  });

  it("con `lotes`, un medicamento con lote lo pide al recibir", async () => {
    await abrirEdicion();
    await clickEn(/Entrada/);
    expect(screen.getByPlaceholderText("Lote")).toBeInTheDocument();
  });

  it("sin `lotes` no lo pide, y guarda sin hablar de Vencimientos", async () => {
    plan.lotes = false;
    await abrirEdicion();
    await clickEn(/Entrada/);
    expect(screen.queryByPlaceholderText("Lote")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("MM/AAAA")).not.toBeInTheDocument();

    await clickEn(/Guardar cambios/);
    expect(screen.queryByText(/Falta el lote/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vencimientos/)).not.toBeInTheDocument();
    expect(api.actualizarMovimiento).toHaveBeenCalled();
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
describe("Una transferencia no se edita acá", () => {
  it("abierta por esta dirección se va a su pantalla, sin guardar nada", async () => {
    // Este formulario sólo conoce entrada y salida: la transferencia se habría
    // guardado como una entrada y la mercadería dejaba de viajar.
    vi.mocked(api.getMovimiento).mockResolvedValue({
      ...salidaPendiente,
      tipo: "TRANSFERENCIA",
      almacenDestino: { id: MOSTRADOR, nombre: "Mostrador" },
    });
    render(
      <MemoryRouter initialEntries={["/inventario/movimientos/950/editar"]}>
        <Routes>
          <Route path="/inventario/movimientos/:id/editar" element={<FormMercaderia />} />
          <Route
            path="/inventario/movimientos/transferencia/:id/editar"
            element={<p>pantalla de transferencia</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("pantalla de transferencia")).toBeInTheDocument();
    expect(api.actualizarMovimiento).not.toHaveBeenCalled();
  });
});

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

  it("la baja de un lote elegido manda ESE lote, no el que tomaría el FEFO", async () => {
    // A2: "devolver las 10 del lote X" descontaba antes las 5 del lote Y, ya
    // vencido, que seguían en el estante y salían del semáforo.
    vi.mocked(api.lotesDeProducto).mockResolvedValue([
      lote("AMX-VENCIDO", "2026-09-01", 5),
      lote("AMX-2601", "2026-10-30", 10),
    ]);
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/inventario/movimientos/salida",
            state: {
              productoId: 7,
              almacenId: DEPOSITO,
              cantidad: 10,
              motivo: "Devolución a proveedor",
              loteCodigo: "AMX-2601",
            },
          },
        ]}
      >
        <Routes>
          <Route
            path="/inventario/movimientos/salida"
            element={<FormMercaderia key="salida" tipoInicial="SALIDA" />}
          />
          <Route path="/inventario/movimientos" element={<p>Registro de movimientos</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Se muestra el elegido, no el primero de la lista.
    expect(await screen.findByText("AMX-2601")).toBeInTheDocument();
    expect(screen.queryByText("AMX-VENCIDO")).not.toBeInTheDocument();

    await clickEn(/^Guardar salida$/);
    expect(api.crearMovimiento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "SALIDA",
        detalles: [{ productoId: 7, cantidad: 10, costo: 5, loteCodigo: "AMX-2601" }],
      }),
    );
  });

  it("«que salga el que vence primero» suelta el lote y vuelve al FEFO", async () => {
    vi.mocked(api.lotesDeProducto).mockResolvedValue([lote("AMX-2601", "2026-10-30", 10)]);
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/inventario/movimientos/salida",
            state: {
              productoId: 7,
              almacenId: MOSTRADOR,
              cantidad: 2,
              motivo: "Vencimiento",
              loteCodigo: "AMX-OTRO",
            },
          },
        ]}
      >
        <Routes>
          <Route
            path="/inventario/movimientos/salida"
            element={<FormMercaderia key="salida" tipoInicial="SALIDA" />}
          />
          <Route path="/inventario/movimientos" element={<p>Registro de movimientos</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // El lote no tiene saldo en esta sucursal: se avisa antes de guardar.
    expect(await screen.findByText("Sin saldo en Mostrador")).toBeInTheDocument();
    await clickEn(/Que salga el que vence primero/);
    await clickEn(/^Guardar salida$/);
    expect(api.crearMovimiento).toHaveBeenCalledWith(
      expect.objectContaining({ detalles: [{ productoId: 7, cantidad: 2, costo: 5 }] }),
    );
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

  it("lo escrito para una sucursal se guarda en ESA aunque después se cambie el selector", async () => {
    // El caso de QA: "Cajón C" escrito con Centro, cambio a Equipetrol,
    // guardar → se escribía en Equipetrol, pisando la suya, y Centro quedaba
    // vacío. El test viejo sólo miraba que el texto siguiera en pantalla y
    // pasaba con el error adentro: acá se mira A QUÉ sucursal va.
    await abrirComoEntrada();
    await elegirAlmacen(MOSTRADOR);
    // En Mostrador no tiene: se ofrece cargarla.
    await waitFor(() => expect(screen.getByText("Ubicación (opcional)")).toBeInTheDocument());

    await cambiarUbicacion("Cajón 12");
    await elegirAlmacen(DEPOSITO);
    // El renglón muestra la de Depósito, que nadie tocó, y avisa que lo de
    // Mostrador se guarda allá.
    await waitFor(() => expect(screen.getByText("Estante 3 · fila B")).toBeInTheDocument());
    expect(screen.getByText("Cajón 12").closest("span")).toHaveTextContent(
      "En Mostrador: Cajón 12 · se guarda ahí",
    );

    await guardarCambios();
    expect(api.fijarUbicacionProducto).toHaveBeenCalledTimes(1);
    expect(api.fijarUbicacionProducto).toHaveBeenCalledWith(7, MOSTRADOR, "Cajón 12");
  });

  it("al cambiar de sucursal, la otra muestra la suya y no hereda lo escrito", async () => {
    await abrirComoEntrada();
    await cambiarUbicacion("Vitrina 1");
    await elegirAlmacen(MOSTRADOR);

    await waitFor(() => expect(screen.getByText("Ubicación (opcional)")).toBeInTheDocument());
    expect(screen.queryByText("· nueva")).not.toBeInTheDocument();

    await guardarCambios();
    expect(api.fijarUbicacionProducto).toHaveBeenCalledTimes(1);
    expect(api.fijarUbicacionProducto).toHaveBeenCalledWith(7, DEPOSITO, "Vitrina 1");
  });

  it("«No guardar» descarta lo escrito para la otra sucursal", async () => {
    await abrirComoEntrada();
    await cambiarUbicacion("Vitrina 1");
    await elegirAlmacen(MOSTRADOR);
    await waitFor(() => expect(screen.getByText("Ubicación (opcional)")).toBeInTheDocument());

    await clickEn(/^No guardar$/);
    await guardarCambios();
    expect(api.fijarUbicacionProducto).not.toHaveBeenCalled();
  });

  it("si falla la segunda, dice que la primera ya quedó y la mercadería no", async () => {
    vi.mocked(api.fijarUbicacionProducto)
      .mockResolvedValueOnce({ ubicacion: "Vitrina 1" })
      .mockRejectedValueOnce(new Error("sin conexión"));
    await abrirComoEntrada();
    await cambiarUbicacion("Vitrina 1");
    await elegirAlmacen(MOSTRADOR);
    await waitFor(() => expect(screen.getByText("Ubicación (opcional)")).toBeInTheDocument());
    await cambiarUbicacion("Cajón 12");

    await guardarCambios();
    expect(api.actualizarMovimiento).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'No se pudo guardar la ubicación de "Amoxicilina 500 mg" (sin conexión). La ubicación anterior ya quedó guardada, pero la mercadería todavía no: probá de nuevo.',
      ),
    ).toBeInTheDocument();
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

/**
 * Guardar y aprobar son dos cosas. Guardar deja el movimiento PENDIENTE —no
 * toca el stock y se puede seguir completando, como en la app del
 * restaurante—; "Guardar y aprobar" lo guarda y mueve el stock en el momento.
 * Antes, sin el extra de aprobación en el plan, guardar aprobaba solo y no
 * había forma de dejar una recepción a medias.
 */
describe("Guardar o aprobar", () => {
  async function abrirSalidaNueva() {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/inventario/movimientos/salida",
            state: { productoId: 7, almacenId: DEPOSITO, cantidad: 2, motivo: "Vencimiento" },
          },
        ]}
      >
        <Routes>
          <Route
            path="/inventario/movimientos/salida"
            element={<FormMercaderia key="salida" tipoInicial="SALIDA" />}
          />
          <Route path="/inventario/movimientos/:id/editar" element={<FormMercaderia />} />
          <Route path="/inventario/movimientos" element={<p>Registro de movimientos</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue("2")).toBeInTheDocument());
  }

  const aprobarEnElDialogo = () => clickEn(/^Aprobar$/);

  it("Guardar la deja pendiente: no la aprueba", async () => {
    await abrirSalidaNueva();
    await clickEn(/^Guardar salida$/);

    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
    expect(await screen.findByText("Registro de movimientos")).toBeInTheDocument();
  });

  it("«Guardar y aprobar» pregunta antes y, al confirmar, guarda y aprueba", async () => {
    await abrirSalidaNueva();
    await clickEn(/Guardar y aprobar/);

    expect(screen.getByRole("dialog", { name: "Aprobar la salida" })).toHaveTextContent(
      "se descuenta del stock de Depósito",
    );
    expect(api.crearMovimiento).not.toHaveBeenCalled();

    await aprobarEnElDialogo();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).toHaveBeenCalledWith(999);
    expect(await screen.findByText("Registro de movimientos")).toBeInTheDocument();
  });

  it("si no se pudo aprobar, queda pendiente y reintentar no la duplica", async () => {
    vi.mocked(api.aprobarMovimiento).mockRejectedValueOnce(new Error("No hay stock suficiente"));
    await abrirSalidaNueva();
    await clickEn(/Guardar y aprobar/);
    await aprobarEnElDialogo();

    // Se sigue desde lo guardado: el formulario pasa a editar ese movimiento.
    expect(
      await screen.findByText(
        "Se guardó como pendiente, pero no se pudo aprobar: No hay stock suficiente",
      ),
    ).toBeInTheDocument();
    expect(api.getMovimiento).toHaveBeenCalledWith(999);
    expect(await screen.findByRole("button", { name: /Guardar cambios/ })).toBeInTheDocument();

    await clickEn(/Guardar y aprobar/);
    await aprobarEnElDialogo();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).toHaveBeenCalledTimes(2);
  });

  it("si un paso de la edición falla, reintentar no duplica renglones ni se traba", async () => {
    // M5: el renglón nuevo no guardaba su id y el borrado seguía anotado: el
    // reintento creaba otra vez el que ya había entrado (al aprobar salía
    // doble) y volvía a borrar uno que ya no estaba (404, pantalla trabada).
    vi.mocked(api.getMovimiento).mockResolvedValue({
      ...salidaPendiente,
      detalles: [
        ...salidaPendiente.detalles!,
        {
          id: 302,
          productoId: 9,
          producto: "Loratadina 10 mg",
          cantidad: 1,
          costo: 2,
          descripcion: null,
        },
      ],
    });
    vi.mocked(api.getArticulosMovimiento).mockResolvedValue([
      articulo(100),
      { ...articulo(50), id: 8, nombre: "Ibuprofeno 400 mg", manejaLote: false },
      { ...articulo(50), id: 10, nombre: "Paracetamol 500 mg", manejaLote: false },
    ]);
    vi.mocked(api.agregarDetalleMovimiento)
      .mockResolvedValueOnce({ id: 401 } as never)
      .mockRejectedValueOnce(new Error("Se cortó la conexión"))
      .mockResolvedValueOnce({ id: 402 } as never);
    await abrirEdicion();

    await clickEn(/Quitar Loratadina 10 mg/);
    for (let i = 0; i < 2; i++) {
      await clickEn(/Buscar y agregar producto/);
      await clickEn(/elegir el siguiente/);
    }

    await clickEn(/Guardar cambios/);
    expect(screen.getByText("Se cortó la conexión")).toBeInTheDocument();
    await clickEn(/Guardar cambios/);

    expect(api.eliminarDetalleMovimiento).toHaveBeenCalledTimes(1);
    expect(api.eliminarDetalleMovimiento).toHaveBeenCalledWith(302);
    expect(vi.mocked(api.agregarDetalleMovimiento).mock.calls.map((c) => c[1].productoId)).toEqual([
      8, 10, 10,
    ]);
    expect(api.actualizarDetalleMovimiento).toHaveBeenCalledWith(
      401,
      expect.objectContaining({ cantidad: 1 }),
    );
    expect(screen.queryByText("Se cortó la conexión")).not.toBeInTheDocument();
  });

  it("editando un pendiente, «Guardar y aprobar» guarda los cambios y lo aprueba", async () => {
    await abrirEdicion();
    await clickEn(/Guardar y aprobar/);
    await aprobarEnElDialogo();

    expect(api.actualizarMovimiento).toHaveBeenCalledWith(950, expect.anything());
    expect(api.aprobarMovimiento).toHaveBeenCalledWith(950);
    expect(api.crearMovimiento).not.toHaveBeenCalled();
  });

  it("con el extra de doble control sólo guarda: lo aprueba otra persona", async () => {
    // Quien compró "Aprobar movimientos" sigue como antes: el que carga no aprueba.
    plan.dobleControl = true;
    await abrirSalidaNueva();
    expect(screen.queryByRole("button", { name: /Guardar y aprobar/ })).not.toBeInTheDocument();

    await clickEn(/^Guardar salida$/);
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
  });

  it("si falta algo, avisa y no pregunta", async () => {
    await abrirEdicion();
    await clickEn(/Entrada/);
    const campo = screen.getByRole("combobox", { name: "Proveedor" });
    await act(async () => {
      fireEvent.focus(campo);
      fireEvent.change(campo, { target: { value: "Droguería Nueva" } });
    });
    await clickEn(/Guardar y aprobar/);

    expect(screen.getByText(/Elegí el proveedor de la lista o crealo/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Aprobar/ })).not.toBeInTheDocument();
    expect(api.actualizarMovimiento).not.toHaveBeenCalled();
  });
});

/**
 * Una factura de droguería son 30 u 80 renglones. Antes cada uno costaba siete
 * toques: abrir el buscador, escribir, esperar, tocar el «+», y el diálogo se
 * cerraba; más teclear lote y vencimiento aunque fueran los del renglón de
 * arriba (B10). Y el costo se aceptaba sin mirar: un 56 donde iba 5,6 se
 * descubría en el reporte de ganancia (#10).
 */
describe("Ingreso rápido (B10 y #10)", () => {
  /** Lo que el servidor devuelve al buscar: el mismo artículo que mueve el almacén. */
  function productoBuscado(id: number, nombre: string): Producto {
    return {
      id,
      nombre,
      descripcion: null,
      codBarra: null,
      tipoProducto: "ALMACENABLE",
      precio: 12,
      costo: 5,
      stockMinimo: 5,
      habilitado: true,
      icono: null,
      categoria: null,
      unidadMedida: null,
      stockTotal: 100,
      componentes: [],
      principioActivo: null,
      concentracion: null,
      formaFarmaceutica: null,
      laboratorio: null,
      registroSanitario: null,
      condicionVenta: "LIBRE",
      manejaLote: true,
      controlado: false,
    };
  }

  /** Abre un ingreso nuevo con el buscador DE VERDAD y lo despliega. */
  async function abrirIngresoYBuscador() {
    buscador.real = true;
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [productoBuscado(7, "Amoxicilina 500 mg")],
      total: 1,
      limite: 20,
      offset: 0,
    });
    render(
      <MemoryRouter initialEntries={["/inventario/movimientos/ingreso"]}>
        <Routes>
          <Route
            path="/inventario/movimientos/ingreso"
            element={<FormMercaderia key="ingreso" tipoInicial="ENTRADA" />}
          />
        </Routes>
      </MemoryRouter>,
    );
    // Se habilita cuando llegan la sucursal por defecto y SU lista de artículos.
    // Primero se espera a que esa relista haya arrancado: entre que se elige la
    // sucursal y que `useApi` marca "cargando" hay un render en que el botón ya
    // dice "Buscar y agregar…" y está habilitado, y tocarlo ahí lo encontraba
    // como "Cargando artículos…" al instante siguiente.
    await waitFor(() => expect(api.getArticulosMovimiento).toHaveBeenCalledWith(DEPOSITO));
    const abrir = await screen.findByRole("button", { name: /Buscar y agregar producto/ });
    expect(abrir).toBeEnabled();
    await clickEn(/Buscar y agregar producto/);
    return screen.getByPlaceholderText(/^Buscar por nombre/);
  }

  /** Lo que hace el lector: escribe el código y manda Enter en el acto. */
  async function escanear(campo: HTMLElement, codigo: string) {
    await act(async () => {
      fireEvent.change(campo, { target: { value: codigo } });
      fireEvent.keyDown(campo, { key: "Enter" });
    });
  }

  it("Enter con un solo resultado agrega y el buscador sigue abierto", async () => {
    const campo = await abrirIngresoYBuscador();
    await escanear(campo, "7501");

    // El renglón entró...
    expect(await screen.findByText("1 línea")).toBeInTheDocument();
    // ...y el diálogo sigue ahí, limpio, con el foco y diciendo qué entró.
    expect(screen.getByRole("dialog", { name: "Agregar producto" })).toBeInTheDocument();
    expect(campo).toHaveValue("");
    expect(campo).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Agregado: Amoxicilina 500 mg · 1 renglón",
    );

    // El mismo código otra vez no lo duplica: ya está en la lista, y la lista
    // tampoco lo dejaría agregar con el «+».
    await escanear(campo, "7501");
    expect(screen.getByText("1 línea")).toBeInTheDocument();

    await clickEn(/^Listo$/);
    expect(screen.queryByRole("dialog", { name: "Agregar producto" })).not.toBeInTheDocument();
  });

  it("en la salida el buscador se cierra al elegir, como siempre", async () => {
    // Ahí se dan de baja uno o dos renglones: el diálogo abierto molestaría.
    await abrirEdicion();
    await clickEn(/Buscar y agregar producto/);
    await clickEn(/elegir el siguiente/);
    expect(screen.queryByRole("button", { name: /elegir el siguiente/ })).not.toBeInTheDocument();
  });

  it("Igual que el anterior copia lote y vencimiento", async () => {
    // Dos artículos en el almacén, para que el segundo renglón sea otro.
    vi.mocked(api.getArticulosMovimiento).mockResolvedValue([
      articulo(100, UBICACION[DEPOSITO]),
      { ...articulo(40), id: 8, nombre: "Ibuprofeno 400 mg" },
    ]);
    await abrirEdicion();
    await clickEn(/Entrada/);
    // El primer renglón no tiene de dónde copiar.
    expect(screen.queryByRole("button", { name: "Igual que el anterior" })).not.toBeInTheDocument();

    await clickEn(/Buscar y agregar producto/);
    await clickEn(/elegir el siguiente/);
    expect(await screen.findByText("Ibuprofeno 400 mg")).toBeInTheDocument();

    await clickEn(/^Igual que el anterior$/);
    expect(screen.getAllByDisplayValue("AMX-2601")).toHaveLength(2);
    expect(screen.getAllByDisplayValue("04/2028")).toHaveLength(2);
    // Ya con lote, el botón se va: no pisa lo que se escribió.
    expect(screen.queryByRole("button", { name: "Igual que el anterior" })).not.toBeInTheDocument();
  });

  it("un costo 12 % más caro que la última compra avisa", async () => {
    // El artículo se compró a Bs 5 la última vez (`articulo().costo`).
    await abrirEdicion();
    const costo = screen.getByDisplayValue("5");

    fireEvent.change(costo, { target: { value: "5.6" } });
    expect(screen.getByText("Última compra Bs 5,00 (+12 %)")).toBeInTheDocument();

    // Un 8 % entra en lo normal: no se dice nada.
    fireEvent.change(costo, { target: { value: "5.4" } });
    expect(screen.queryByText(/Última compra/)).not.toBeInTheDocument();

    // Más barato también se avisa: el dedo de más va para los dos lados.
    fireEvent.change(costo, { target: { value: "4" } });
    expect(screen.getByText("Última compra Bs 5,00 (-20 %)")).toBeInTheDocument();

    // Sólo informa: se guarda igual con el costo tecleado.
    await clickEn(/^Guardar cambios$/);
    expect(api.actualizarDetalleMovimiento).toHaveBeenCalledWith(
      301,
      expect.objectContaining({ costo: 4 }),
    );
  });
});

/**
 * La precarga de Vencimientos se consume una sola vez (B8). React Router la
 * guarda en el `history.state`, así que guardar la salida y volver con "Atrás"
 * la volvía a aplicar: el mismo lote y la misma cantidad, listos para darse de
 * baja dos veces.
 */
describe("La precarga de Vencimientos se usa una vez (B8)", () => {
  it("después de leerla, la ruta queda sin state", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/inventario/movimientos/salida",
            state: { productoId: 7, almacenId: MOSTRADOR, cantidad: 20, motivo: "Vencimiento" },
          },
        ]}
      >
        <Routes>
          <Route
            path="/inventario/movimientos/salida"
            element={
              <>
                <FormMercaderia key="salida" tipoInicial="SALIDA" />
                <EspiaDelState />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    // El renglón se cargó igual: la precarga se leyó antes de borrarse.
    expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("sin state"));
  });
});

/** Muestra qué `state` tiene la ruta en este momento. */
function EspiaDelState() {
  const { state } = useLocation();
  return <span data-testid="state">{state ? "con state" : "sin state"}</span>;
}
