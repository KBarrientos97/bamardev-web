import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, ArticuloMovimiento, LoteConSaldo, Movimiento } from "../../types";

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
