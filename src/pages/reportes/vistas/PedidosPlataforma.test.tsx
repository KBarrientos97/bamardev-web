import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoPlataforma, ReportePedidosPlataforma } from "../../../lib/pedidosPlataforma/tipos";
import { ContextoReporte, type DatosReporte } from "../contexto";
import PedidosPlataforma from "./PedidosPlataforma";
import { diaCorto, textoAnulados, textoDelPeriodo, ultimoDiaDeLaEtiqueta } from "./PedidosPlataforma.datos";

/**
 * Yango / PedidosYa en Reportes (PLAN-PEDIDOS-PLATAFORMA §5): el selector de
 * plataforma y de período (los arma el backend: acá no se calculan fechas), las
 * tarjetas, los desgloses, la lista con los anulados marcados, anular con PIN
 * y el resumen para imprimir.
 */

const reporte = vi.fn();
const anular = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {
    reportePedidosPlataforma: (...a: unknown[]) => reporte(...a),
    anularPedidoPlataforma: (...a: unknown[]) => anular(...a),
  },
  qs: () => "",
  request: vi.fn(async () => null),
}));

const sesion = vi.hoisted(() => ({
  features: ["pedidos_yango", "pedidos_pedidosya"] as string[],
  permisos: ["plataformas.ver", "plataformas.anular", "autorizar.pin"] as string[],
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { nombre: "El Ganadero", features: sesion.features },
    usuario: { id: 7, username: "ana", nombre: "Ana Rojas", permisos: sesion.permisos },
  }),
}));

function pedido(extra: Partial<PedidoPlataforma> = {}): PedidoPlataforma {
  return {
    id: 12,
    clienteRequestId: "uuid-12",
    plataforma: "YANGO",
    codigoExterno: "A-123",
    fecha: "2026-11-16T18:20:00.000Z",
    almacen: { id: 3, nombre: "Las Brisas" },
    usuario: { id: 7, nombre: "Ana Rojas" },
    total: 70,
    sinStock: false,
    anuladoEn: null,
    motivoAnulacion: null,
    detalles: [{ productoId: 5, nombre: "Arroz con leche L", cantidad: 2, precio: 35, subtotal: 70 }],
    ...extra,
  };
}

function respuesta(extra: Partial<ReportePedidosPlataforma> = {}): ReportePedidosPlataforma {
  return {
    plataforma: "YANGO",
    periodo: {
      indice: 0,
      desde: "2026-11-16T04:00:00.000Z",
      hasta: "2026-11-20T04:00:00.000Z",
      pagaEl: "2026-11-20",
      enCurso: true,
      etiqueta: "lun 16 al jue 19 de nov",
    },
    cantidad: 2,
    total: 105,
    anulados: { cantidad: 1, total: 35 },
    porDia: [
      { fecha: "2026-11-16", cantidad: 2, total: 105 },
      { fecha: "2026-11-17", cantidad: 0, total: 0 },
    ],
    porProducto: [{ productoId: 5, nombre: "Arroz con leche L", cantidad: 3, total: 105 }],
    porSucursal: [{ almacenId: 3, nombre: "Las Brisas", cantidad: 2, total: 105 }],
    pedidos: [
      pedido(),
      pedido({
        id: 13,
        codigoExterno: "A-124",
        total: 35,
        sinStock: true,
        detalles: [{ productoId: 5, nombre: "Arroz con leche L", cantidad: 1, precio: 35, subtotal: 35 }],
      }),
      pedido({
        id: 14,
        codigoExterno: "A-125",
        total: 35,
        anuladoEn: "2026-11-16T19:00:00.000Z",
        motivoAnulacion: "Error al cargar",
      }),
    ],
    ...extra,
  };
}

/**
 * El papel de imprimir también está en el DOM (oculto en pantalla) y repite los
 * textos: estas consultas miran sólo lo que se ve.
 */
const SIN_PAPEL = { ignore: ".resumen-plataforma *, script, style" };
const verTexto = (t: string | RegExp) => screen.getByText(t, SIN_PAPEL);
const verTextos = (t: string | RegExp) => screen.getAllByText(t, SIN_PAPEL);

function mostrar(sucursalId?: number) {
  const datos: DatosReporte = {
    periodo: { preset: "hoy", desde: "2026-11-15", hasta: "2026-11-15" },
    comparacion: { desde: "2026-11-14", hasta: "2026-11-14", contra: "ayer", leyenda: "Ayer" },
    rango: { desde: "2026-11-15", hasta: "2026-11-15", ...(sucursalId ? { sucursalId } : {}) },
    rangoAnterior: { desde: "2026-11-14", hasta: "2026-11-14" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <PedidosPlataforma />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reporte.mockReset();
  anular.mockReset();
  sesion.features = ["pedidos_yango", "pedidos_pedidosya"];
  sesion.permisos = ["plataformas.ver", "plataformas.anular", "autorizar.pin"];
  reporte.mockResolvedValue(respuesta());
  window.print = vi.fn();
});

describe("el reporte del período", () => {
  it("pide el período en curso de la primera plataforma y muestra tarjetas, período y cuándo paga", async () => {
    mostrar();
    expect(await screen.findByText("lun 16 al jue 19 de nov")).toBeInTheDocument();
    expect(reporte).toHaveBeenCalledWith({ plataforma: "YANGO", periodo: 0, almacenId: null });
    // «En curso: cierra el {día}, paga el {día}»
    expect(verTexto(/En curso: cierra el jue 19, paga el .*20\/11/)).toBeInTheDocument();
    expect(verTextos("Pedidos").length).toBeGreaterThan(0);
    expect(verTexto("Total")).toBeInTheDocument();
    expect(verTextos(/Bs.105,00/).length).toBeGreaterThan(0);
    expect(verTexto(/1 anulado · Bs.35,00 no suma/)).toBeInTheDocument();
  });

  it("muestra todos los días del período (también los de cero), por producto y los pedidos con su N°", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    expect(verTexto(/lun 16\/11/)).toBeInTheDocument();
    expect(verTexto(/mar 17\/11/)).toBeInTheDocument();
    expect(verTextos("Arroz con leche L").length).toBeGreaterThan(0);
    expect(screen.getByText("N° A-123")).toBeInTheDocument();
    expect(screen.getByText("N° A-124")).toBeInTheDocument();
  });

  it("un pedido anulado va marcado, con su motivo, y sin botón para anularlo otra vez", async () => {
    mostrar();
    await screen.findByText("N° A-125");
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(verTexto("Anulado: Error al cargar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular el pedido A-125" })).not.toBeInTheDocument();
    // También dice qué llevaba (tachado): los demás pedidos muestran sus líneas.
    const lineas = screen.getAllByText("2× Arroz con leche L", SIN_PAPEL);
    expect(lineas.some((e) => e.classList.contains("line-through"))).toBe(true);
    expect(screen.getByRole("button", { name: "Anular el pedido A-123" })).toBeInTheDocument();
  });

  it("el que salió sin stock lo dice discretamente en su fila", async () => {
    mostrar();
    await screen.findByText("N° A-124");
    expect(screen.getAllByText("sin stock")).toHaveLength(1);
  });

  it("por sucursal sólo aparece con más de un local en el período", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    expect(screen.queryByText("Por sucursal")).not.toBeInTheDocument();
  });

  it("con varias sucursales las muestra, y el filtro del reporte viaja como almacenId", async () => {
    reporte.mockResolvedValue(
      respuesta({
        porSucursal: [
          { almacenId: 3, nombre: "Las Brisas", cantidad: 1, total: 70 },
          { almacenId: 4, nombre: "Centro", cantidad: 1, total: 35 },
        ],
      }),
    );
    mostrar(3);
    await screen.findByText("Por sucursal");
    expect(screen.getByText("Centro")).toBeInTheDocument();
    expect(reporte).toHaveBeenCalledWith({ plataforma: "YANGO", periodo: 0, almacenId: 3 });
  });

  it("un período sin pedidos lo dice en vez de dejar la pantalla en blanco", async () => {
    reporte.mockResolvedValue(
      respuesta({ cantidad: 0, total: 0, anulados: { cantidad: 0, total: 0 }, porProducto: [], pedidos: [] }),
    );
    mostrar();
    expect(await screen.findByText("No hay pedidos de Yango en este período.")).toBeInTheDocument();
  });

  it("un error del servidor se dice, con Reintentar", async () => {
    reporte.mockRejectedValueOnce(new Error("No se pudo armar el reporte"));
    mostrar();
    expect(await screen.findByText("No se pudo armar el reporte")).toBeInTheDocument();
    reporte.mockResolvedValue(respuesta());
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByText("lun 16 al jue 19 de nov")).toBeInTheDocument();
  });
});

describe("el selector de período (← y →)", () => {
  it("← pide el período anterior y → vuelve; no se pasa del actual", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    const siguiente = screen.getByRole("button", { name: "Período siguiente" });
    expect(siguiente).toBeDisabled();
    reporte.mockResolvedValue(
      respuesta({
        periodo: {
          indice: -1,
          desde: "x",
          hasta: "y",
          pagaEl: "2026-11-17",
          enCurso: false,
          etiqueta: "vie 7 al dom 9 de nov",
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Período anterior" }));
    expect(await screen.findByText("vie 7 al dom 9 de nov")).toBeInTheDocument();
    expect(reporte).toHaveBeenLastCalledWith({ plataforma: "YANGO", periodo: -1, almacenId: null });
    // Un período cerrado dice cuándo pagó, no «en curso».
    expect(screen.queryByText(/En curso/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pago: .*17\/11/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Período siguiente" }));
    await waitFor(() => expect(reporte).toHaveBeenLastCalledWith({ plataforma: "YANGO", periodo: 0, almacenId: null }));
  });

  it("no deja ir más atrás de -60", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    const anterior = screen.getByRole("button", { name: "Período anterior" });
    for (let i = 0; i < 60; i++) fireEvent.click(anterior);
    await waitFor(() => expect(reporte).toHaveBeenLastCalledWith({ plataforma: "YANGO", periodo: -60, almacenId: null }));
    expect(anterior).toBeDisabled();
  });
});

describe("el selector de plataforma", () => {
  it("con las dos prendidas deja elegir, y al cambiar vuelve al período en curso", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    fireEvent.click(screen.getByRole("button", { name: "Período anterior" }));
    await waitFor(() => expect(reporte).toHaveBeenLastCalledWith({ plataforma: "YANGO", periodo: -1, almacenId: null }));
    fireEvent.click(screen.getByRole("tab", { name: "PedidosYa" }));
    await waitFor(() =>
      expect(reporte).toHaveBeenLastCalledWith({ plataforma: "PEDIDOS_YA", periodo: 0, almacenId: null }),
    );
  });

  it("al cambiar de plataforma no queda a la vista lo de la anterior mientras llega lo nuevo", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    reporte.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole("tab", { name: "PedidosYa" }));
    await waitFor(() => expect(reporte).toHaveBeenLastCalledWith({ plataforma: "PEDIDOS_YA", periodo: 0, almacenId: null }));
    expect(screen.queryByText("N° A-123")).not.toBeInTheDocument();
  });

  it("con una sola prendida no hay selector", async () => {
    sesion.features = ["pedidos_pedidosya"];
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(reporte).toHaveBeenCalledWith({ plataforma: "PEDIDOS_YA", periodo: 0, almacenId: null });
  });

  it("sin ninguna feature no pide nada", () => {
    sesion.features = [];
    mostrar();
    expect(screen.getByText(/no tiene pedidos de Yango ni de PedidosYa/)).toBeInTheDocument();
    expect(reporte).not.toHaveBeenCalled();
  });
});

describe("anular un pedido (con PIN)", () => {
  async function abrirAnular() {
    mostrar();
    await screen.findByText("N° A-123");
    fireEvent.click(screen.getByRole("button", { name: "Anular el pedido A-123" }));
    return screen.getByRole("dialog", { name: "Anular pedido de Yango" });
  }

  it("sin plataformas.anular no hay botón", async () => {
    sesion.permisos = ["plataformas.ver"];
    mostrar();
    await screen.findByText("N° A-123");
    expect(screen.queryByRole("button", { name: /Anular el pedido/ })).not.toBeInTheDocument();
  });

  it("pide motivo y PIN antes de mandar nada", async () => {
    const dialogo = await abrirAnular();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    expect(within(dialogo).getByText(/Elegí el motivo/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByText("Error al cargar"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    expect(within(dialogo).getByText(/El PIN tiene entre 4 y 6 dígitos/)).toBeInTheDocument();
    expect(anular).not.toHaveBeenCalled();
  });

  it("anula con el motivo y el PIN propios (quien autoriza con PIN se autoriza a sí mismo), recarga y avisa", async () => {
    anular.mockResolvedValue(pedido({ anuladoEn: "2026-11-16T20:00:00.000Z" }));
    const dialogo = await abrirAnular();
    expect(within(dialogo).queryByLabelText(/Usuario que autoriza/)).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByText("Error al cargar"));
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(anular).toHaveBeenCalledWith(12, { motivo: "Error al cargar", autorizadorPin: "1234" });
    expect(reporte).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Pedido A-123 anulado/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin autorizar.pin pide el usuario del encargado y lo manda", async () => {
    sesion.permisos = ["plataformas.ver", "plataformas.anular"];
    anular.mockResolvedValue(pedido({ anuladoEn: "2026-11-16T20:00:00.000Z" }));
    const dialogo = await abrirAnular();
    fireEvent.click(within(dialogo).getByText("Otro"));
    fireEvent.change(within(dialogo).getByLabelText("Detalle del motivo"), { target: { value: "Lo pidieron dos veces" } });
    fireEvent.change(within(dialogo).getByLabelText(/Usuario que autoriza/), { target: { value: "gerardo" } });
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), { target: { value: "4321" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(anular).toHaveBeenCalledWith(12, {
      motivo: "Lo pidieron dos veces",
      autorizadorUsername: "gerardo",
      autorizadorPin: "4321",
    });
  });

  it("un PIN incorrecto (el servidor dice que no) se ve en el diálogo y no recarga", async () => {
    anular.mockRejectedValue(new Error("PIN incorrecto"));
    const dialogo = await abrirAnular();
    fireEvent.click(within(dialogo).getByText("Error al cargar"));
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), { target: { value: "0000" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(within(dialogo).getByText("PIN incorrecto")).toBeInTheDocument();
    expect(reporte).toHaveBeenCalledTimes(1);
  });
});

describe("imprimir el resumen del período", () => {
  it("arma el papel con el período, el total y la lista con el N° y manda a imprimir", async () => {
    mostrar();
    await screen.findByText("lun 16 al jue 19 de nov");
    fireEvent.click(screen.getByRole("button", { name: /Imprimir resumen/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    // El papel está en el DOM aunque oculto en pantalla (es lo único que sale al imprimir).
    const papel = document.querySelector(".resumen-plataforma") as HTMLElement;
    expect(papel).not.toBeNull();
    expect(papel.textContent).toContain("Pedidos de Yango");
    expect(papel.textContent).toContain("lun 16 al jue 19 de nov");
    expect(papel.textContent).toContain("El Ganadero");
    expect(papel.textContent).toContain("Total del período");
    expect(papel.textContent).toContain("A-125");
    expect(papel.textContent).toContain("Anulado: Error al cargar");
    expect(papel.textContent).toContain("No incluye 1 pedido anulado");
  });
});

describe("los textos del período (el backend arma las fechas)", () => {
  it("el último día sale de la etiqueta que armó el backend", () => {
    expect(ultimoDiaDeLaEtiqueta("lun 16 al jue 19 de nov")).toBe("jue 19");
    expect(ultimoDiaDeLaEtiqueta("jue 13 al mié 19 de nov")).toBe("mié 19");
    expect(ultimoDiaDeLaEtiqueta("algo raro")).toBeNull();
  });

  it("en curso dice cierra y paga; cerrado, sólo el pago", () => {
    const p = { indice: 0, desde: "", hasta: "", pagaEl: "2026-11-20", enCurso: true, etiqueta: "lun 16 al jue 19 de nov" };
    expect(textoDelPeriodo(p)).toMatch(/^En curso: cierra el jue 19, paga el .*20\/11$/);
    expect(textoDelPeriodo({ ...p, enCurso: false })).toMatch(/^Pago: .*20\/11$/);
    expect(textoDelPeriodo({ ...p, etiqueta: "algo raro" })).toMatch(/^En curso: paga el .*20\/11$/);
  });

  it("un yyyy-MM-dd no se corre un día por la zona horaria", () => {
    expect(diaCorto("2026-11-16")).toMatch(/16\/11/);
  });

  it("los anulados, en singular y plural", () => {
    expect(textoAnulados({ cantidad: 0, total: 0 })).toBeNull();
    expect(textoAnulados({ cantidad: 1, total: 35 })).toMatch(/^1 anulado · Bs.35,00 no suma$/);
    expect(textoAnulados({ cantidad: 2, total: 70 })).toMatch(/^2 anulados · Bs.70,00 no suman$/);
  });
});
