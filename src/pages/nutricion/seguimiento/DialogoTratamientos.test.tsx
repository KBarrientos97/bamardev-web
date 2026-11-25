import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import type { ProductoSeguimiento } from "../../../lib/nutricion/seguimiento/tipos";
import { olvidarCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { historialDePrueba } from "../../../test/historial";
import DialogoAjustesSeguimiento from "./AjustesSeguimiento";
import DialogoTratamientos from "./DialogoTratamientos";

/**
 * «Tratamientos» (CONTRATO-nutricion-seguimiento-23nov §9.2): la lista de
 * botones que salen al iniciar un tratamiento. Agregar, repetido, ocultar y
 * mostrar, quitar con su pregunta, volver a como venía, el renglón del vial a
 * medio llenar, `Esc` y el atrás de a una capa, y un backend anterior (404).
 */

vi.mock("../../../lib/nutricion/seguimiento/api", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/seguimiento/api")>()),
  apiSeguimiento: {
    productos: vi.fn(),
    agregarProducto: vi.fn(),
    cambiarProducto: vi.fn(),
    cambiarDeFabrica: vi.fn(),
    quitarProducto: vi.fn(),
    cambiarAjustes: vi.fn(),
  },
}));

vi.mock("../../../lib/nutricion/seguimiento/useCatalogoSeguimiento", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/seguimiento/useCatalogoSeguimiento")>()),
  olvidarCatalogoSeguimiento: vi.fn(),
}));

const deFabrica = (nombre: string, extra: Partial<ProductoSeguimiento> = {}): ProductoSeguimiento => ({
  id: null,
  nombre,
  deFabrica: true,
  cambiado: false,
  oculto: false,
  pasosMg: [],
  presentaciones: [],
  ...extra,
});
const propio = (id: number, nombre: string, extra: Partial<ProductoSeguimiento> = {}): ProductoSeguimiento => ({
  id,
  nombre,
  deFabrica: false,
  cambiado: false,
  oculto: false,
  pasosMg: [],
  presentaciones: [],
  ...extra,
});

/** La Tirzepatida con el vial del negocio (fila 7), la Retatrutida y el Glow de fábrica, y uno propio oculto. */
const LISTA: ProductoSeguimiento[] = [
  deFabrica("Tirzepatida", {
    id: 7,
    cambiado: true,
    pasosMg: [2.5, 5, 7.5, 10, 12.5, 15],
    presentaciones: [
      { mg: 15, ml: 0.5 },
      { mg: 10, ml: 0.5 },
    ],
  }),
  deFabrica("Retatrutida"),
  deFabrica("Glow"),
  propio(9, "Péptido de prueba", { oculto: true }),
];
const conLista = (productos: ProductoSeguimiento[]) => ({ productos });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiSeguimiento.productos).mockResolvedValue(conLista(LISTA));
});

async function abrir(abrirEn?: "lista" | "agregar") {
  const onCerrar = vi.fn();
  render(
    <MemoryRouter>
      <DialogoTratamientos abrirEn={abrirEn} onCerrar={onCerrar} />
    </MemoryRouter>,
  );
  // Que llegue la lista (o el 404) adentro de `act`.
  await act(async () => {});
  return { onCerrar };
}
const ventana = (nombre = "Tratamientos") => screen.getByRole("dialog", { name: nombre });
const renglon = (nombre: string) => screen.getByRole("group", { name: nombre });
const boton = (nombre: string | RegExp, dentro: HTMLElement = document.body) => within(dentro).getByRole("button", { name: nombre });
/** Los espacios duros («15 mg») como cualquier espacio. */
const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");
const esc = () => fireEvent.keyDown(document, { key: "Escape" });

describe("la lista", () => {
  it("un renglón por tratamiento: el nombre, sus viales o «Sin vial cargado», «Oculto», y las acciones de cada uno", async () => {
    await abrir();
    expect(ventana()).toBeInTheDocument();
    expect(screen.getByText("Son los botones que salen al iniciar un tratamiento. El nombre igual se puede escribir a mano.")).toBeInTheDocument();
    const tirze = await screen.findByRole("group", { name: "Tirzepatida" });
    expect(within(tirze).getAllByText(/^Vial de/).map((e) => sinNb(e.textContent))).toEqual(["Vial de 15 mg en 0,5 ml", "Vial de 10 mg en 0,5 ml"]);
    // De fábrica: no se quita; cambiado, vuelve a como venía.
    expect(boton("Editar", tirze)).toBeInTheDocument();
    expect(boton("Ocultar", tirze)).toBeInTheDocument();
    expect(boton("Volver a como venía", tirze)).toBeInTheDocument();
    expect(within(tirze).queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    // De fábrica sin tocar: ni quitar ni volver.
    const glow = renglon("Glow");
    expect(within(glow).getByText("Sin vial cargado")).toBeInTheDocument();
    expect(within(glow).getAllByRole("button").map((b) => b.textContent)).toEqual(["Editar", "Ocultar"]);
    // Uno propio, oculto.
    const peptido = renglon("Péptido de prueba");
    expect(within(peptido).getByText("Oculto")).toBeInTheDocument();
    expect(within(peptido).getAllByRole("button").map((b) => b.textContent)).toEqual(["Editar", "Mostrar", "Quitar"]);
  });

  it("ocultar y mostrar: uno de fábrica sin tocar va por su nombre; con su fila, por el id", async () => {
    const oculta = deFabrica("Retatrutida", { id: 11, cambiado: true, oculto: true });
    vi.mocked(apiSeguimiento.cambiarDeFabrica).mockResolvedValue(conLista([LISTA[0], oculta, LISTA[2], LISTA[3]]));
    vi.mocked(apiSeguimiento.cambiarProducto).mockResolvedValue(conLista([LISTA[0], { ...oculta, oculto: false }, LISTA[2], LISTA[3]]));
    await abrir();
    fireEvent.click(boton("Ocultar", await screen.findByRole("group", { name: "Retatrutida" })));
    await waitFor(() => expect(within(renglon("Retatrutida")).getByText("Oculto")).toBeInTheDocument());
    expect(apiSeguimiento.cambiarDeFabrica).toHaveBeenCalledWith("Retatrutida", { oculto: true });
    expect(boton("Volver a como venía", renglon("Retatrutida"))).toBeInTheDocument();
    // Cada escritura olvida el catálogo guardado: los botones de las hojas cambiaron.
    expect(olvidarCatalogoSeguimiento).toHaveBeenCalled();
    fireEvent.click(boton("Mostrar", renglon("Retatrutida")));
    await waitFor(() => expect(within(renglon("Retatrutida")).queryByText("Oculto")).not.toBeInTheDocument());
    expect(apiSeguimiento.cambiarProducto).toHaveBeenCalledWith(11, { oculto: false });
  });

  it("quitar uno propio pregunta antes; «Cancelar» no lo quita", async () => {
    vi.mocked(apiSeguimiento.quitarProducto).mockResolvedValue(conLista(LISTA.slice(0, 3)));
    const { onCerrar } = await abrir();
    fireEvent.click(boton("Quitar", await screen.findByRole("group", { name: "Péptido de prueba" })));
    const pregunta = screen.getByRole("dialog", { name: "¿Quitar “Péptido de prueba” de la lista?" });
    expect(within(pregunta).getByText("Los tratamientos ya iniciados no cambian.")).toBeInTheDocument();
    fireEvent.click(boton("Cancelar", pregunta));
    expect(screen.queryByRole("dialog", { name: /^¿Quitar/ })).not.toBeInTheDocument();
    expect(apiSeguimiento.quitarProducto).not.toHaveBeenCalled();
    fireEvent.click(boton("Quitar", renglon("Péptido de prueba")));
    fireEvent.click(boton("Quitar", screen.getByRole("dialog", { name: /^¿Quitar/ })));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Péptido de prueba" })).not.toBeInTheDocument());
    expect(apiSeguimiento.quitarProducto).toHaveBeenCalledWith(9);
    expect(screen.queryByRole("dialog", { name: /^¿Quitar/ })).not.toBeInTheDocument();
    // Al cerrar, la lista nueva para que los botones de atrás se vuelvan a leer.
    fireEvent.click(boton("Listo", ventana()));
    expect(onCerrar).toHaveBeenCalledWith(LISTA.slice(0, 3));
  });

  it("volver a como venía: borra la fila del de fábrica, sin preguntar", async () => {
    vi.mocked(apiSeguimiento.quitarProducto).mockResolvedValue(
      conLista([deFabrica("Tirzepatida", { pasosMg: LISTA[0].pasosMg, presentaciones: [{ mg: 15, ml: 0.5 }] }), ...LISTA.slice(1)]),
    );
    await abrir();
    fireEvent.click(boton("Volver a como venía", await screen.findByRole("group", { name: "Tirzepatida" })));
    await waitFor(() => expect(within(renglon("Tirzepatida")).queryByRole("button", { name: "Volver a como venía" })).not.toBeInTheDocument());
    expect(apiSeguimiento.quitarProducto).toHaveBeenCalledWith(7);
    expect(screen.queryByRole("dialog", { name: /^¿Quitar/ })).not.toBeInTheDocument();
    expect(within(renglon("Tirzepatida")).getAllByText(/^Vial de/)).toHaveLength(1);
  });

  it("sin cambiar nada, cerrar entrega null (los botones de atrás no se tocan)", async () => {
    const { onCerrar } = await abrir();
    await screen.findByRole("group", { name: "Glow" });
    fireEvent.click(boton("Listo", ventana()));
    expect(onCerrar).toHaveBeenCalledWith(null);
  });
});

describe("agregar y editar", () => {
  it("«Agregar tratamiento» abre vacío con el foco en el nombre; al guardar vuelve a la lista con el nuevo", async () => {
    const nuevo = propio(12, "Péptido nuevo", { presentaciones: [{ mg: 70, ml: 3 }] });
    vi.mocked(apiSeguimiento.agregarProducto).mockResolvedValue(conLista([...LISTA, nuevo]));
    const { onCerrar } = await abrir();
    await screen.findByRole("group", { name: "Glow" });
    fireEvent.click(boton("Agregar tratamiento"));
    const form = ventana("Agregar tratamiento");
    const nombre = within(form).getByLabelText("Nombre");
    expect(nombre).toHaveValue("");
    expect(nombre).toHaveFocus();
    expect(within(form).getByLabelText("Miligramos de la presentación 1")).toHaveValue("");
    expect(within(form).getByLabelText("Mililitros de la presentación 1")).toHaveValue("");
    expect(within(form).getByText("Sirve para pasar la dosis de mg a UI y a ml. Si no la sabés, dejala vacía.")).toBeInTheDocument();
    fireEvent.change(nombre, { target: { value: "  Péptido   nuevo " } });
    fireEvent.change(within(form).getByLabelText("Miligramos de la presentación 1"), { target: { value: "70" } });
    fireEvent.change(within(form).getByLabelText("Mililitros de la presentación 1"), { target: { value: "3" } });
    fireEvent.click(boton("Agregar", form));
    expect(await screen.findByRole("group", { name: "Péptido nuevo" })).toBeInTheDocument();
    expect(apiSeguimiento.agregarProducto).toHaveBeenCalledWith({ nombre: "Péptido nuevo", presentaciones: [{ mg: 70, ml: 3 }] });
    expect(ventana()).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
    fireEvent.click(boton("Listo", ventana()));
    expect(onCerrar).toHaveBeenCalledWith([...LISTA, nuevo]);
  });

  it("repetido (409): «Ya está en la lista.» junto al formulario, que conserva lo escrito", async () => {
    // El contrato lo escribe con `code`: se reconoce igual, y el texto es el de la web.
    vi.mocked(apiSeguimiento.agregarProducto).mockRejectedValue(new ApiError("Conflict", 409, { code: "PRODUCTO_REPETIDO" }));
    const { onCerrar } = await abrir("agregar");
    const form = ventana("Agregar tratamiento");
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "glow" } });
    fireEvent.click(boton("Agregar", form));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Ya está en la lista.");
    expect(within(form).getByLabelText("Nombre")).toHaveValue("glow");
    expect(apiSeguimiento.agregarProducto).toHaveBeenCalledWith({ nombre: "glow" });
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("un renglón del vial a medio llenar (mg sin ml) marca el error y no manda nada; hasta 6 presentaciones", async () => {
    await abrir("agregar");
    const form = ventana("Agregar tratamiento");
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Péptido nuevo" } });
    fireEvent.change(within(form).getByLabelText("Miligramos de la presentación 1"), { target: { value: "15" } });
    fireEvent.click(boton("Agregar", form));
    expect(within(form).getByText("Completá los dos: los mg y los ml del vial")).toBeInTheDocument();
    expect(within(form).getByLabelText("Mililitros de la presentación 1")).toHaveAttribute("aria-invalid", "true");
    expect(within(form).getByLabelText("Miligramos de la presentación 1")).not.toHaveAttribute("aria-invalid");
    expect(apiSeguimiento.agregarProducto).not.toHaveBeenCalled();
    // Los renglones nuevos abren vacíos; al sexto, no se ofrece otro.
    for (let i = 0; i < 5; i++) fireEvent.click(boton("Agregar otra presentación", form));
    expect(within(form).getByLabelText("Miligramos de la presentación 6")).toHaveValue("");
    expect(within(form).queryByRole("button", { name: "Agregar otra presentación" })).not.toBeInTheDocument();
    expect(within(form).getByText("Hasta 6 presentaciones.")).toBeInTheDocument();
    // Quitar uno.
    fireEvent.click(boton("Quitar la presentación 6", form));
    expect(within(form).queryByLabelText("Miligramos de la presentación 6")).not.toBeInTheDocument();
  });

  it("editar uno de fábrica: el nombre no se edita; el vial va por su nombre (sin fila) y sin cambios no manda nada", async () => {
    vi.mocked(apiSeguimiento.cambiarDeFabrica).mockResolvedValue(conLista([LISTA[0], LISTA[1], deFabrica("Glow", { id: 13, cambiado: true, presentaciones: [{ mg: 70, ml: 3 }] }), LISTA[3]]));
    await abrir();
    fireEvent.click(boton("Editar", await screen.findByRole("group", { name: "Glow" })));
    let form = ventana("Editar tratamiento");
    expect(within(form).queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(within(form).getByText("Viene con el sistema: el nombre no se cambia.")).toBeInTheDocument();
    // Sin tocar nada: vuelve a la lista sin escribir.
    fireEvent.click(boton("Guardar", form));
    expect(ventana()).toBeInTheDocument();
    expect(apiSeguimiento.cambiarDeFabrica).not.toHaveBeenCalled();
    fireEvent.click(boton("Editar", renglon("Glow")));
    form = ventana("Editar tratamiento");
    expect(within(form).getByLabelText("Miligramos de la presentación 1")).toHaveFocus();
    fireEvent.change(within(form).getByLabelText("Miligramos de la presentación 1"), { target: { value: "70" } });
    fireEvent.change(within(form).getByLabelText("Mililitros de la presentación 1"), { target: { value: "3" } });
    fireEvent.click(boton("Guardar", form));
    await waitFor(() => expect(sinNb(within(renglon("Glow")).getByText(/^Vial de/).textContent)).toBe("Vial de 70 mg en 3 ml"));
    expect(apiSeguimiento.cambiarDeFabrica).toHaveBeenCalledWith("Glow", { presentaciones: [{ mg: 70, ml: 3 }] });
  });

  it("editar uno propio: el nombre y los viales como están; cambia el nombre por su id", async () => {
    vi.mocked(apiSeguimiento.cambiarProducto).mockResolvedValue(conLista([...LISTA.slice(0, 3), propio(9, "Péptido B", { oculto: true })]));
    await abrir();
    fireEvent.click(boton("Editar", await screen.findByRole("group", { name: "Péptido de prueba" })));
    const form = ventana("Editar tratamiento");
    expect(within(form).getByLabelText("Nombre")).toHaveValue("Péptido de prueba");
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Péptido B" } });
    fireEvent.click(boton("Guardar", form));
    expect(await screen.findByRole("group", { name: "Péptido B" })).toBeInTheDocument();
    expect(apiSeguimiento.cambiarProducto).toHaveBeenCalledWith(9, { nombre: "Péptido B" });
  });

  it("abierta desde «+ Agregar»: directo en el formulario; guardar cierra la ventana y entrega la lista; cancelar, null", async () => {
    const nuevo = propio(12, "Péptido nuevo");
    vi.mocked(apiSeguimiento.agregarProducto).mockResolvedValue(conLista([...LISTA, nuevo]));
    const { onCerrar } = await abrir("agregar");
    const form = ventana("Agregar tratamiento");
    expect(within(form).getByLabelText("Nombre")).toHaveFocus();
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Péptido nuevo" } });
    // `Enter` en el último campo guarda.
    fireEvent.keyDown(within(form).getByLabelText("Mililitros de la presentación 1"), { key: "Enter" });
    await waitFor(() => expect(onCerrar).toHaveBeenCalledWith([...LISTA, nuevo]));
    expect(apiSeguimiento.agregarProducto).toHaveBeenCalledWith({ nombre: "Péptido nuevo" });
  });

  it("abierta desde «+ Agregar», «Cancelar» la cierra sin cambios", async () => {
    const { onCerrar } = await abrir("agregar");
    fireEvent.change(within(ventana("Agregar tratamiento")).getByLabelText("Nombre"), { target: { value: "A medio escribir" } });
    fireEvent.click(boton("Cancelar", ventana("Agregar tratamiento")));
    expect(onCerrar).toHaveBeenCalledWith(null);
  });
});

describe("`Esc` y el atrás cierran sólo lo de más arriba", () => {
  it("`Esc`: la pregunta, después el formulario (vuelve a la lista), después la ventana", async () => {
    const { onCerrar } = await abrir();
    fireEvent.click(boton("Quitar", await screen.findByRole("group", { name: "Péptido de prueba" })));
    esc();
    expect(screen.queryByRole("dialog", { name: /^¿Quitar/ })).not.toBeInTheDocument();
    expect(ventana()).toBeInTheDocument();
    fireEvent.click(boton("Agregar tratamiento"));
    esc();
    expect(ventana()).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
    esc();
    expect(onCerrar).toHaveBeenCalledWith(null);
  });

  describe("el atrás del navegador", () => {
    let h: ReturnType<typeof historialDePrueba>;
    beforeEach(() => {
      h = historialDePrueba(5);
    });
    afterEach(() => h.limpiar());

    it("en el formulario vuelve a la lista; en la lista cierra la ventana; la página no se va", async () => {
      const { onCerrar } = await abrir();
      await screen.findByRole("group", { name: "Glow" });
      fireEvent.click(boton("Agregar tratamiento"));
      expect(ventana("Agregar tratamiento")).toBeInTheDocument();
      h.viajar(4);
      expect(h.go).toHaveBeenCalledWith(1);
      h.viajar(5);
      expect(ventana()).toBeInTheDocument();
      h.viajar(4);
      h.viajar(5);
      expect(onCerrar).toHaveBeenCalledWith(null);
      expect(h.router).not.toHaveBeenCalled();
    });
  });
});

describe("con un backend anterior (sin la ruta de la lista: 404)", () => {
  it("lo dice y se cierra sola", async () => {
    vi.mocked(apiSeguimiento.productos).mockRejectedValue(new ApiError("Cannot GET /api/nutricion/seguimiento/productos", 404));
    const { onCerrar } = await abrir("agregar");
    expect(await screen.findByText("Todavía no está disponible.")).toBeInTheDocument();
    await waitFor(() => expect(onCerrar).toHaveBeenCalledWith(null), { timeout: 4000 });
  });
});

describe("«Ajustes del seguimiento»: el bloque «Tratamientos»", () => {
  const AJUSTES = { avisarPagos: true, pagoCadaSemanas: 5 };

  it("los nombres en un renglón y «Cambiar la lista», que ocupa su lugar; al volver, los nombres nuevos y lo de los pagos intacto", async () => {
    const onListaCambiada = vi.fn();
    vi.mocked(apiSeguimiento.cambiarDeFabrica).mockResolvedValue(conLista([LISTA[0], deFabrica("Retatrutida", { id: 11, cambiado: true, oculto: true }), LISTA[2], LISTA[3]]));
    render(
      <MemoryRouter>
        <DialogoAjustesSeguimiento
          ajustes={AJUSTES}
          tratamientos={[{ nombre: "Tirzepatida" }, { nombre: "Retatrutida" }, { nombre: "Glow" }]}
          onCerrar={vi.fn()}
          onGuardado={vi.fn()}
          onListaCambiada={onListaCambiada}
        />
      </MemoryRouter>,
    );
    const ajustes = ventana("Ajustes del seguimiento");
    expect(sinNb(within(ajustes).getByText("Tratamientos").nextElementSibling!.textContent)).toBe("Tirzepatida · Retatrutida · Glow");
    fireEvent.click(within(ajustes).getByRole("switch", { name: /Avisar los pagos/ }));
    fireEvent.click(boton("Cambiar la lista", ajustes));
    // Nunca dos hojas apiladas: la de Ajustes deja el lugar.
    expect(screen.queryByRole("dialog", { name: "Ajustes del seguimiento" })).not.toBeInTheDocument();
    fireEvent.click(boton("Ocultar", await screen.findByRole("group", { name: "Retatrutida" })));
    await waitFor(() => expect(within(renglon("Retatrutida")).getByText("Oculto")).toBeInTheDocument());
    fireEvent.click(boton("Listo", ventana()));
    const otraVez = ventana("Ajustes del seguimiento");
    // Sin la oculta (y sin la propia, que ya estaba oculta).
    expect(sinNb(within(otraVez).getByText("Tratamientos").nextElementSibling!.textContent)).toBe("Tirzepatida · Glow");
    expect(within(otraVez).getByRole("switch", { name: /Avisar los pagos/ })).toHaveAttribute("aria-checked", "false");
    expect(onListaCambiada).toHaveBeenCalledTimes(1);
  });

  it("con un backend anterior, la ventana lo dice y se vuelve a Ajustes", async () => {
    vi.mocked(apiSeguimiento.productos).mockRejectedValue(new ApiError("Not Found", 404));
    render(
      <MemoryRouter>
        <DialogoAjustesSeguimiento ajustes={AJUSTES} tratamientos={[{ nombre: "Tirzepatida" }, { nombre: "Retatrutida" }]} onCerrar={vi.fn()} onGuardado={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(boton("Cambiar la lista", ventana("Ajustes del seguimiento")));
    expect(await screen.findByText("Todavía no está disponible.")).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Ajustes del seguimiento" }, { timeout: 4000 })).toBeInTheDocument();
  });
});
