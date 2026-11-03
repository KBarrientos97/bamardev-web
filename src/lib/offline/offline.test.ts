import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NEGOCIO_KEY, USER_KEY } from "../api";
import type { FormaPago, Producto, Venta, VentaInput } from "../../types";
import { almacenEnMemoria } from "./almacen";
import {
  cargarCola,
  decidir,
  encolar,
  hayRespuesta,
  pendientesDeHoy,
  porSubir,
  sincronizar,
  usarAlmacenCola,
  type CuerpoEncolado,
} from "./cola";
import { conCopia, descontarDeLaCopia, leerCopia, SIN_COPIA, usarAlmacenCopias } from "./copias";
import { fijarVentaSinInternet, modoOfflineDe } from "./modo";
import { cuerpoEncolado, reciboLocal, venderOEncolar } from "./ventas";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36";

const productos = [
  { id: 1, nombre: "Pollo entero", precio: 80, tipoProducto: "ALMACENABLE", stockTotal: 10 },
  { id: 2, nombre: "Gaseosa", precio: 10, tipoProducto: "ALMACENABLE", stockTotal: 5 },
  { id: 3, nombre: "Combo", precio: 50, tipoProducto: "COMPUESTO", stockTotal: 0 },
] as unknown as Producto[];
const formasPago: FormaPago[] = [
  { id: 1, nombre: "Efectivo" },
  { id: 2, nombre: "QR" },
];

function venta(extra: Partial<VentaInput> = {}): VentaInput & { clienteRequestId: string } {
  return {
    clienteRequestId: `req-${Math.random().toString(36).slice(2)}`,
    detalles: [
      { productoId: 1, cantidad: 1, precio: 80, consumo: "MESA" },
      { productoId: 2, cantidad: 2, precio: 10, consumo: "LLEVAR" },
    ],
    pagos: [{ formaPagoId: 1, monto: 100, recibido: 150 }],
    tipoPedido: "LOCAL",
    ...extra,
  };
}

function sesion(negocio = 7, usuario = 3) {
  localStorage.setItem(USER_KEY, JSON.stringify({ id: usuario, username: "caja" }));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify({ id: negocio, nombre: "Pollos" }));
}

const sinRed = () => new ApiError("Sin internet. Revisá la conexión del local.", 0);

beforeEach(() => {
  usarAlmacenCola(almacenEnMemoria());
  usarAlmacenCopias(almacenEnMemoria());
  sesion();
  hayRespuesta();
});

afterEach(() => {
  fijarVentaSinInternet(null);
  localStorage.clear();
  vi.useRealTimers();
});

describe("modo offline: sólo la app instalada del iPhone", () => {
  const base = {
    hostname: "app.bamardev.com",
    pathname: "/pos",
    maxTouchPoints: 5,
    coincide: () => false,
    standaloneIOS: undefined as boolean | undefined,
    forzado: false,
  };

  it("iPhone abierto desde el ícono de inicio: sí", () => {
    expect(modoOfflineDe({ ...base, userAgent: IPHONE, standaloneIOS: true })).toBe(true);
  });

  it("iPad (se presenta como Mac con pantalla táctil) instalado: sí", () => {
    expect(modoOfflineDe({ ...base, userAgent: MAC, standaloneIOS: true })).toBe(true);
  });

  it("iPhone en Safari sin instalar: no (es la web normal)", () => {
    expect(modoOfflineDe({ ...base, userAgent: IPHONE })).toBe(false);
  });

  it("Android instalado: no (para eso está el APK)", () => {
    expect(
      modoOfflineDe({ ...base, userAgent: ANDROID, coincide: (q) => q.includes("standalone") }),
    ).toBe(false);
  });

  it("una Mac de verdad (sin pantalla táctil): no", () => {
    expect(modoOfflineDe({ ...base, userAgent: MAC, maxTouchPoints: 0, standaloneIOS: true })).toBe(false);
  });

  it("la página pública de un negocio nunca, ni forzado", () => {
    expect(
      modoOfflineDe({ ...base, userAgent: IPHONE, standaloneIOS: true, pathname: "/p/pollos", forzado: true }),
    ).toBe(false);
  });

  it("forzado para probar en QA o en desarrollo", () => {
    expect(modoOfflineDe({ ...base, userAgent: ANDROID, forzado: true })).toBe(true);
  });
});

describe("qué hacer con el error de un envío (igual que Android)", () => {
  it.each([
    [sinRed(), "reintentarYParar"],
    [new ApiError("App vieja", 426), "reintentarYParar"],
    [new ApiError("Sin cupo", 403, { codigo: "CUPO_AGOTADO" }), "reintentar"],
    [new ApiError("Sesión", 401), "reintentarYParar"],
    [new ApiError("Prohibido", 403), "reintentarYParar"],
    [new ApiError("Timeout", 408), "reintentarYParar"],
    [new ApiError("Muchas", 429), "reintentarYParar"],
    [new ApiError("Caído", 503), "reintentarYParar"],
    [new ApiError("Producto no existe", 400), "rechazada"],
    [new ApiError("No encontrado", 404), "rechazada"],
    [new ApiError("Conflicto", 409), "rechazada"],
    [new ApiError("Inválida", 422), "rechazada"],
    [new Error("raro"), "reintentarYParar"],
  ] as const)("%s → %s", (e, esperado) => {
    expect(decidir(e)).toBe(esperado);
  });
});

describe("la venta como viaja en la cola", () => {
  it("lleva fechaCliente y encolada; el fiado va encolado y sin el PIN", () => {
    const c = cuerpoEncolado(
      venta({
        credito: {
          clienteNombre: "Juan",
          fechaCompromiso: "2026-10-20T00:00:00-04:00",
          autorizadorUsername: "jefe",
          autorizadorPin: "1234",
        },
      }),
      new Date("2026-10-13T15:00:00Z"),
    );
    expect(c.fechaCliente).toBe("2026-10-13T15:00:00.000Z");
    expect(c.encolada).toBe(true);
    expect(c.credito).toMatchObject({ clienteNombre: "Juan", encolado: true });
    expect(c.credito?.autorizadorPin).toBeUndefined();
    expect(c.credito?.autorizadorUsername).toBeUndefined();
  });

  it("el ticket local: nombres del catálogo, total del carrito, cambio y sin número", () => {
    const r = reciboLocal(cuerpoEncolado(venta()), { productos, formasPago, cajero: "Ana" });
    expect(r.pendienteSync).toBe(true);
    expect(r.comprobante).toBe("PENDIENTE");
    expect(r.total).toBe(100);
    expect(r.cambio).toBe(50);
    expect(r.cajero).toBe("Ana");
    expect(r.detalles?.map((d) => d.producto)).toEqual(["Pollo entero", "Gaseosa"]);
    expect(r.pagos?.[0]).toMatchObject({ formaPago: "Efectivo", monto: 100, recibido: 150 });
  });

  it("el ticket de un fiado muestra adelanto y saldo", () => {
    const r = reciboLocal(
      cuerpoEncolado(
        venta({
          pagos: [{ formaPagoId: 1, monto: 30 }],
          credito: { clienteId: 9, fechaCompromiso: "2026-10-20T00:00:00-04:00" },
        }),
      ),
      { productos, formasPago, clientes: [{ id: 9, nombre: "Doña Rosa" } as never] },
    );
    expect(r.credito).toMatchObject({ clienteNombre: "Doña Rosa", adelanto: 30, saldo: 70 });
  });
});

describe("cobrar: con señal, sin señal y en la web normal", () => {
  const datos = { productos, formasPago, cajero: "Ana" };

  it("en la web normal es el crearVenta de siempre, y un corte es un error", async () => {
    fijarVentaSinInternet(false);
    const enviar = vi.fn().mockRejectedValue(sinRed());
    await expect(venderOEncolar(venta(), enviar, datos)).rejects.toThrow("Sin internet");
    expect(await cargarCola()).toHaveLength(0);
  });

  it("en el iPhone con señal va al servidor", async () => {
    fijarVentaSinInternet(true);
    const servidor = { id: 55, comprobante: "V-55", total: 100 } as Venta;
    const enviar = vi.fn().mockResolvedValue(servidor);
    const r = await venderOEncolar(venta(), enviar, datos);
    expect(r).toEqual({ venta: servidor, encolada: false });
    expect(await cargarCola()).toHaveLength(0);
  });

  it("en el iPhone sin red encola con el MISMO clienteRequestId y devuelve el ticket local", async () => {
    fijarVentaSinInternet(true);
    const enviar = vi.fn().mockRejectedValue(sinRed());
    const v = venta();
    const r = await venderOEncolar(v, enviar, datos);
    expect(r.encolada).toBe(true);
    expect(r.venta.pendienteSync).toBe(true);
    const cola = await cargarCola();
    expect(cola).toHaveLength(1);
    expect(cola[0].id).toBe(v.clienteRequestId);
    expect(cola[0].cuerpo).toMatchObject({ clienteRequestId: v.clienteRequestId, encolada: true });
  });

  it("después de un corte, el siguiente cobro va directo a la cola (3 min)", async () => {
    fijarVentaSinInternet(true);
    const enviar = vi.fn().mockRejectedValue(sinRed());
    await venderOEncolar(venta(), enviar, datos);
    await venderOEncolar(venta(), enviar, datos);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await cargarCola()).toHaveLength(2);
  });

  it("una respuesta del servidor (400, 403 de cupo, 500) NO se encola", async () => {
    fijarVentaSinInternet(true);
    for (const e of [
      new ApiError("Stock insuficiente", 400),
      new ApiError("Sin cupo", 403, { codigo: "CUPO_AGOTADO" }),
      new ApiError("Error", 500),
    ]) {
      await expect(venderOEncolar(venta(), vi.fn().mockRejectedValue(e), datos)).rejects.toBe(e);
    }
    expect(await cargarCola()).toHaveLength(0);
  });

  it("reintentar el mismo cobro sin señal no lo encola dos veces", async () => {
    fijarVentaSinInternet(true);
    const v = venta();
    await venderOEncolar(v, vi.fn().mockRejectedValue(sinRed()), datos);
    await venderOEncolar(v, vi.fn(), datos);
    expect(await cargarCola()).toHaveLength(1);
  });
});

function encolada(id: string, fecha: string, extra: Partial<VentaInput> = {}): CuerpoEncolado {
  return { ...venta(extra), clienteRequestId: id, fechaCliente: fecha, encolada: true };
}
const recibo = { total: 100 } as Venta;

describe("sincronizar la cola", () => {
  it("sube en el orden en que se cobró y las borra", async () => {
    await encolar(encolada("b", "2026-10-13T15:05:00.000Z"), recibo);
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    const enviados: string[] = [];
    const alSubir = vi.fn();
    const r = await sincronizar(async (c) => {
      enviados.push(c.clienteRequestId);
      return { id: 1, consumo: undefined } as Venta;
    }, alSubir);
    expect(enviados).toEqual(["a", "b"]);
    expect(r).toEqual({ subidas: 2, rechazadas: 0, quedan: 0 });
    expect(alSubir).toHaveBeenCalledTimes(2);
    expect(await cargarCola()).toHaveLength(0);
  });

  it("sin red se corta la vuelta y todo queda para después", async () => {
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    await encolar(encolada("b", "2026-10-13T15:05:00.000Z"), recibo);
    const enviar = vi.fn().mockRejectedValue(sinRed());
    const r = await sincronizar(enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ subidas: 0, rechazadas: 0, quedan: 2 });
    const cola = await cargarCola();
    expect(cola.map((v) => v.estado)).toEqual(["ERROR", "PENDIENTE"]);
    expect(cola[0].intentos).toBe(1);
  });

  it("un 400 la marca RECHAZADA y sigue con las demás", async () => {
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    await encolar(encolada("b", "2026-10-13T15:05:00.000Z"), recibo);
    const enviar = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("El producto 1 no existe", 400))
      .mockResolvedValueOnce({ id: 2 } as Venta);
    const r = await sincronizar(enviar);
    expect(r).toEqual({ subidas: 1, rechazadas: 1, quedan: 0 });
    const cola = await cargarCola();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ id: "a", estado: "RECHAZADA", ultimoError: "El producto 1 no existe" });
    // Una rechazada no se vuelve a mandar.
    const otra = vi.fn();
    await sincronizar(otra);
    expect(otra).not.toHaveBeenCalled();
  });

  it("sin cupo queda en ERROR (nunca rechazada) y sigue", async () => {
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    await sincronizar(vi.fn().mockRejectedValue(new ApiError("Sin cupo", 403, { codigo: "CUPO_AGOTADO" })));
    expect((await cargarCola())[0].estado).toBe("ERROR");
  });

  it("dos vueltas a la vez son una sola (no se manda dos veces)", async () => {
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    const enviar = vi.fn().mockResolvedValue({ id: 1 } as Venta);
    await Promise.all([sincronizar(enviar), sincronizar(enviar)]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("la cola es de quien la cobró: otro usuario no la ve ni la sube", async () => {
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    sesion(7, 4);
    const enviar = vi.fn();
    await sincronizar(enviar);
    expect(enviar).not.toHaveBeenCalled();
    expect(await cargarCola()).toHaveLength(0);
    sesion(7, 3);
    expect(await cargarCola()).toHaveLength(1);
  });
});

describe("cupo del Emprendedor: las encoladas de hoy ocupan lugar", () => {
  it("cuenta las de hoy que no cobran cita y no están rechazadas", async () => {
    await encolar(encolada("a", "2026-10-13T15:00:00.000Z"), recibo);
    await encolar(encolada("b", "2026-10-13T16:00:00.000Z", { citaId: 4 }), recibo);
    await encolar(encolada("c", "2026-10-12T15:00:00.000Z"), recibo);
    const cola = await cargarCola();
    expect(pendientesDeHoy(cola, "2026-10-13")).toBe(1);
    expect(porSubir(cola)).toHaveLength(3);
  });
});

describe("copia para abrir el POS sin señal", () => {
  it("en el iPhone guarda la respuesta y sin red la devuelve", async () => {
    fijarVentaSinInternet(true);
    expect(await conCopia("formas_pago", async () => formasPago)).toEqual(formasPago);
    await expect(conCopia("formas_pago", () => Promise.reject(sinRed()))).resolves.toEqual(formasPago);
  });

  it("sin red y sin copia avisa que hay que conectarse una vez", async () => {
    fijarVentaSinInternet(true);
    await expect(conCopia("categorias", () => Promise.reject(sinRed()))).rejects.toThrow(SIN_COPIA);
  });

  it("una respuesta del servidor no se tapa con la copia", async () => {
    fijarVentaSinInternet(true);
    await conCopia("caja", async () => ({ caja: null }));
    const e = new ApiError("Prohibido", 403);
    await expect(conCopia("caja", () => Promise.reject(e))).rejects.toBe(e);
  });

  it("en la web normal no guarda nada", async () => {
    fijarVentaSinInternet(false);
    await conCopia("formas_pago", async () => formasPago);
    expect(await leerCopia("formas_pago")).toBeUndefined();
  });

  it("vender sin señal baja el stock de la copia, el del combo también", async () => {
    // El combo tiene su propio stock (25-ago) y el backend lo descuenta al
    // vender. Antes la copia sólo bajaba el almacenable: sin señal, el combo
    // seguía ofreciendo los que ya se habían vendido (POS-2).
    const catalogo = [
      { id: 1, nombre: "Pollo entero", precio: 80, tipoProducto: "ALMACENABLE", stockTotal: 10 },
      { id: 3, nombre: "Combo familiar", precio: 50, tipoProducto: "COMPUESTO", stockTotal: 4 },
      { id: 4, nombre: "Sopa del día", precio: 15, tipoProducto: "SERVICIO", stockTotal: 0 },
    ] as unknown as Producto[];
    fijarVentaSinInternet(true);
    await conCopia("productos:1", async () => catalogo);
    await descontarDeLaCopia("productos:1", [
      { productoId: 1, cantidad: 3 },
      { productoId: 3, cantidad: 1 },
      { productoId: 1, cantidad: 1 },
      { productoId: 4, cantidad: 2 },
    ]);
    const copia = (await leerCopia<Producto[]>("productos:1"))!;
    expect(copia.find((p) => p.id === 1)?.stockTotal).toBe(6);
    expect(copia.find((p) => p.id === 3)?.stockTotal).toBe(3);
    // Guarda: el elaborado no lleva stock y no se toca.
    expect(copia.find((p) => p.id === 4)?.stockTotal).toBe(0);
  });
});
