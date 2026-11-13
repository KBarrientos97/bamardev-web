import { describe, expect, it } from "vitest";
import type { Actividad, CajaSupervision, CajeroSupervision, EquipoSupervision, TurnoSupervision, VentaSupervision } from "./api";
import {
  aMs,
  buscarVentas,
  columnasDeKpis,
  conteoDeBloques,
  cuando,
  equipoDeCaja,
  estadoDeCaja,
  estadoDelEquipo,
  estadoDePedido,
  etiquetaDeTurno,
  filtrarActividad,
  grupoDeActividad,
  haceCuanto,
  iconoDeActividad,
  marcaDePedido,
  mediosDeVenta,
  opcionesDeTurno,
  ordenarActividad,
  resumenCajeros,
  situacionDelTurno,
  textoDiferencia,
  textoPorCobrar,
  tonoDeActividad,
} from "./Supervision.datos";

const MIN = 60_000;
const H = 60 * MIN;
const caja = (extra: Partial<CajaSupervision> = {}): CajaSupervision => ({
  id: 1,
  abierta: true,
  cajero: "Rosa Quispe",
  cajeroId: 7,
  desde: 1_000,
  hasta: null,
  inicial: 100,
  ventas: 0,
  vendido: 0,
  anuladas: 0,
  anulado: 0,
  ...extra,
});
const equipo = (extra: Partial<EquipoSupervision> = {}): EquipoSupervision => ({
  ultimoContactoEn: 0,
  pendientes: 0,
  ultimaVentaEn: null,
  ultimaVentaEnEquipoEn: null,
  estado: "EN_LINEA",
  ...extra,
});
const venta = (id: number, comprobante: string | null, quien = "Rosa Quispe", clienteNombre: string | null = null) =>
  ({ id, comprobante, quien, clienteNombre }) as Pick<VentaSupervision, "id" | "comprobante" | "quien" | "clienteNombre">;
const renglon = (id: string, codigo: string, hora = 0): Actividad => ({ id, hora, quien: "Rosa Quispe", texto: id, codigo });

describe("Supervisión del local: el estado del equipo", () => {
  const ahora = new Date(2026, 10, 12, 14, 10).getTime();

  it("sin equipo no se afirma nada: la caja puede ser de la web, que no late", () => {
    expect(estadoDelEquipo(undefined, ahora)).toBeNull();
    expect(estadoDelEquipo(null, ahora)).toBeNull();
  });

  it("en línea: verde y hace cuánto latió", () => {
    expect(estadoDelEquipo(equipo({ ultimoContactoEn: ahora - 20_000 }), ahora)).toEqual({ tono: "verde", texto: "En línea · hace 20 s" });
  });

  it("sin señal: ámbar, desde qué hora, lo que quedó sin subir y la última venta que llegó", () => {
    const e = equipo({
      estado: "SIN_SENAL",
      ultimoContactoEn: new Date(2026, 10, 12, 14, 3).getTime(),
      pendientes: 3,
      ultimaVentaEn: new Date(2026, 10, 12, 14, 1).getTime(),
    });
    expect(estadoDelEquipo(e, ahora)).toEqual({
      tono: "ambar",
      texto: "Sin señal desde 14:03 · 3 ventas sin subir en el equipo · última venta sincronizada 14:01",
    });
    // Sin pendientes ni venta, sólo desde cuándo.
    expect(estadoDelEquipo(equipo({ estado: "SIN_SENAL", ultimoContactoEn: new Date(2026, 10, 12, 14, 3).getTime() }), ahora)?.texto).toBe(
      "Sin señal desde 14:03",
    );
    expect(estadoDelEquipo(equipo({ estado: "SIN_SENAL", ultimoContactoEn: ahora - 5 * MIN, pendientes: 1 }), ahora)?.texto).toMatch(
      /· 1 venta sin subir en el equipo$/,
    );
  });

  it("sin señal y con ventas sin subir, dice hasta cuándo siguió vendiendo el equipo", () => {
    const e = equipo({
      estado: "SIN_SENAL",
      ultimoContactoEn: new Date(2026, 10, 12, 14, 3).getTime(),
      pendientes: 3,
      ultimaVentaEn: new Date(2026, 10, 12, 14, 1).getTime(),
      ultimaVentaEnEquipoEn: new Date(2026, 10, 12, 14, 8).getTime(),
    });
    expect(estadoDelEquipo(e, ahora)?.texto).toBe(
      "Sin señal desde 14:03 · 3 ventas sin subir en el equipo · última venta en el equipo 14:08, sin subir · última venta sincronizada 14:01",
    );
    // Sin pendientes no hay nada sin subir que fechar.
    expect(estadoDelEquipo({ ...e, pendientes: 0 }, ahora)?.texto).toBe("Sin señal desde 14:03 · última venta sincronizada 14:01");
    // Sin el campo (un backend anterior), como antes.
    expect(estadoDelEquipo({ ...e, ultimaVentaEnEquipoEn: null }, ahora)?.texto).not.toMatch(/en el equipo 14:08/);
  });

  it("en línea con ventas trabadas en el equipo también lo dice", () => {
    expect(estadoDelEquipo(equipo({ ultimoContactoEn: ahora - 30_000, pendientes: 2 }), ahora)?.texto).toBe(
      "En línea · hace 30 s · 2 ventas sin subir en el equipo",
    );
  });

  it("«en línea» no se sostiene pasados los 2 minutos sin contacto, aunque lo haya dicho el servidor", () => {
    // A propósito: si esta pantalla se quedó sin conexión, el último dato
    // decía EN_LINEA y se seguía pintando verde con un "hace 6 min": un dato
    // viejo presentado como de ahora (punto 5 del pedido del 12-nov).
    const viejo = equipo({ ultimoContactoEn: ahora - 6 * MIN });
    expect(estadoDelEquipo(viejo, ahora)?.tono).toBe("ambar");
    expect(estadoDelEquipo(viejo, ahora)?.texto).toMatch(/^Sin señal desde 14:04/);
    // Justo en el umbral todavía está en línea.
    expect(estadoDelEquipo(equipo({ ultimoContactoEn: ahora - 2 * MIN }), ahora)?.tono).toBe("verde");
  });

  it("un estado que no se reconoce no se pinta ni verde ni ámbar", () => {
    // El tipo dice EN_LINEA | SIN_SENAL, pero un backend más nuevo puede sumar otro.
    expect(estadoDelEquipo(equipo({ estado: "OTRO" as EquipoSupervision["estado"], ultimoContactoEn: ahora }), ahora)).toBeNull();
  });

  it("las horas se leen en milisegundos (y en ISO si alguna se colara); una que no se entiende no pinta nada", () => {
    const iso = new Date(ahora - 10_000).toISOString();
    expect(aMs(ahora - 10_000)).toBe(ahora - 10_000);
    expect(aMs(iso)).toBe(ahora - 10_000);
    expect(aMs("cualquier cosa")).toBeNull();
    expect(estadoDelEquipo(equipo({ ultimoContactoEn: Number.NaN }), ahora)).toBeNull();
  });

  it("una caja cerrada no muestra el equipo: sería el del turno que ya terminó", () => {
    const e = equipo({ estado: "SIN_SENAL", ultimoContactoEn: ahora - H });
    expect(equipoDeCaja(caja({ abierta: false, equipo: e }), ahora)).toBeNull();
    expect(equipoDeCaja(caja({ equipo: e }), ahora)?.tono).toBe("ambar");
    expect(equipoDeCaja(caja(), ahora)).toBeNull();
  });
});

describe("Supervisión del local: los cajeros", () => {
  const ahora = new Date(2026, 10, 12, 15, 0).getTime();
  const cajero = (extra: Partial<CajeroSupervision>): CajeroSupervision => ({
    id: 1,
    nombre: "Rosa Quispe",
    rol: "Cajero",
    cajaId: null,
    abiertaDesde: null,
    ultimaActividadEn: null,
    ventas: 0,
    vendido: 0,
    ...extra,
  });

  it("los de caja abierta arriba, y por nombre: la lista no salta de lugar con cada venta", () => {
    const filas = resumenCajeros(
      {
        cajas: [caja({ id: 5, desde: ahora - 3 * H, inicial: 150 })],
        cajeros: [
          cajero({ id: 1, nombre: "Zulema", ultimaActividadEn: ahora - MIN }),
          cajero({ id: 2, nombre: "Ana", ultimaActividadEn: ahora - 2 * H }),
          cajero({ id: 3, nombre: "Rosa Quispe", cajaId: 5, abiertaDesde: ahora - 3 * H, ventas: 4, vendido: 120 }),
        ],
      },
      ahora,
    );
    expect(filas.map((f) => f.nombre)).toEqual(["Rosa Quispe", "Ana", "Zulema"]);
    expect(filas[0]).toMatchObject({ abierta: true, olvidada: false, inicial: 150, ventas: 4, vendido: 120, linea: "Caja abierta desde 12:00 · lleva 3 h" });
    expect(filas[1]).toMatchObject({ abierta: false, inicial: null, linea: "Sin caja abierta · última actividad 13:00" });
    expect(resumenCajeros({ cajas: [], cajeros: [cajero({})] }, ahora)[0].linea).toBe("Sin caja abierta · sin actividad registrada");
  });

  it("el equipo se muestra sólo con caja abierta; sin caja sería el de su turno anterior", () => {
    const e = equipo({ estado: "SIN_SENAL", ultimoContactoEn: ahora - H });
    const filas = resumenCajeros(
      {
        cajas: [caja({ id: 5, desde: ahora - 3 * H })],
        cajeros: [cajero({ id: 1, nombre: "Ana", cajaId: 5, abiertaDesde: ahora - 3 * H, equipo: e }), cajero({ id: 2, nombre: "Beto", equipo: e })],
      },
      ahora,
    );
    expect(filas[0].equipo?.texto).toMatch(/^Sin señal desde 14:00/);
    expect(filas[1].equipo).toBeNull();
    // Sin equipo en el cajero, vale el de su caja.
    const deLaCaja = resumenCajeros({ cajas: [caja({ id: 5, desde: ahora - H, equipo: e })], cajeros: [cajero({ cajaId: 5, abiertaDesde: ahora - H })] }, ahora);
    expect(deLaCaja[0].equipo?.tono).toBe("ambar");
  });

  it("una caja abierta de ayer y con más de 20 horas se marca olvidada", () => {
    const filas = resumenCajeros({ cajas: [], cajeros: [cajero({ cajaId: 9, abiertaDesde: ahora - 26 * H })] }, ahora);
    expect(filas[0].olvidada).toBe(true);
    // El turno de mediodía a la madrugada no es una caja olvidada.
    const madrugada = new Date(2026, 10, 13, 2, 30).getTime();
    expect(resumenCajeros({ cajas: [], cajeros: [cajero({ cajaId: 9, abiertaDesde: new Date(2026, 10, 12, 12, 0).getTime() })] }, madrugada)[0].olvidada).toBe(false);
  });
});

describe("Supervisión del local: buscar una venta", () => {
  const ventas = [
    venta(12, "V-000012", "Rosa Quispe"),
    venta(112, "V-000112", "José Pérez"),
    venta(120, "V-000120", "Rosa Quispe", "Juan Mamani"),
    venta(7, null, "Ana"),
  ];
  const ids = (texto: string) => buscarVentas(ventas, texto).map((v) => v.id);

  it("vacío no filtra", () => {
    expect(ids("")).toEqual([12, 112, 120, 7]);
    expect(ids("   ")).toEqual([12, 112, 120, 7]);
  });

  it("por comprobante, con o sin los ceros y sin importar mayúsculas", () => {
    expect(ids("V-000012")).toEqual([12]);
    expect(ids("v-000012")).toEqual([12]);
    expect(ids("v-12")).toEqual([12]);
    expect(ids("V12")).toEqual([12]);
    // Un pedazo del comprobante también sirve.
    expect(ids("v-0001")).toEqual([112, 120]);
  });

  it("«#12» es el id y sólo ése", () => {
    expect(ids("#12")).toEqual([12]);
    expect(ids("#7")).toEqual([7]);
    expect(ids("# 120")).toEqual([120]);
  });

  it("un número solo es el id o el número del comprobante, exactos: «12» no trae la 112 ni la 120", () => {
    // A propósito: por substring "12" traía las tres y la que el cajero
    // dictaba por teléfono quedaba perdida entre las otras.
    expect(ids("12")).toEqual([12]);
    expect(ids("7")).toEqual([7]);
    expect(ids("999")).toEqual([]);
  });

  it("por el nombre del cajero o del cliente, sin mayúsculas ni tildes", () => {
    expect(ids("rosa")).toEqual([12, 120]);
    expect(ids("PEREZ")).toEqual([112]);
    expect(ids("josé")).toEqual([112]);
    expect(ids("mamani")).toEqual([120]);
  });
});

describe("Supervisión del local: el turno", () => {
  const ahora = new Date(2026, 10, 12, 15, 0).getTime();
  const turno = (cajaId: number | null, defectoId: number | null): TurnoSupervision => ({
    cajaId,
    defectoId,
    desde: 0,
    hasta: null,
    ventas: 0,
    vendido: 0,
    anuladas: 0,
    anulado: 0,
    fiado: 0,
    descuentos: 0,
    porMedio: { efectivo: { monto: 0, cobros: 0 }, qr: { monto: 0, cobros: 0 }, otros: [], mixtas: 0 },
    pedidos: { enCamino: 0, porCobrar: 0, porCobrarTotal: 0 },
  });
  const abierta = caja({ id: 1, desde: ahora - 3 * H });
  const cerrada = caja({ id: 2, abierta: false, desde: ahora - 30 * H, hasta: ahora - 18 * H });
  const olvidada = caja({ id: 3, desde: ahora - 30 * H });

  it("la caja que trabaja ahora es el turno en curso; cerrada, cómo terminó; de antes y abierta, olvidada; sin caja, hoy", () => {
    expect(situacionDelTurno({ cajas: [], turno: turno(null, null) }, ahora)).toEqual({ situacion: "sinCaja" });
    expect(situacionDelTurno({ cajas: [abierta], turno: turno(1, 1) }, ahora)).toEqual({ situacion: "enCurso", caja: abierta });
    expect(situacionDelTurno({ cajas: [cerrada], turno: turno(2, 2) }, ahora)).toEqual({ situacion: "cerrado", caja: cerrada });
    expect(situacionDelTurno({ cajas: [olvidada], turno: turno(3, 3) }, ahora)).toEqual({ situacion: "olvidada", caja: olvidada });
    expect(situacionDelTurno({ cajas: [abierta, cerrada], turno: turno(2, 1) }, ahora)).toEqual({ situacion: "elegido", caja: cerrada });
  });

  it("las opciones de turno: quién, cuándo y qué es, de la más nueva a la más vieja", () => {
    const api = { cajas: [cerrada, olvidada, abierta], turno: turno(1, 1) };
    expect(opcionesDeTurno(api, ahora).map((o) => o.id)).toEqual([1, 2, 3]);
    expect(etiquetaDeTurno(abierta, api, ahora)).toBe("Turno en curso · Rosa Quispe · desde Jueves 12/11 12:00");
    expect(etiquetaDeTurno(olvidada, api, ahora)).toMatch(/^Quedó abierta · Rosa Quispe · desde Miércoles 11\/11 09:00$/);
    expect(etiquetaDeTurno(cerrada, { turno: turno(2, 2) }, ahora)).toMatch(/^Último turno · /);
  });

  it("el turno de mediodía a la madrugada no se da por olvidado; a la mañana siguiente, sí", () => {
    // A propósito, 20 h y no las 12 de la farmacia: el restaurante abre a las
    // 12:00 y cierra a las 03:00, y con 12 h a la medianoche ya salía "¿se
    // olvidaron de cerrarla?" sobre el turno que estaba trabajando.
    const mediodia = new Date(2026, 10, 12, 12, 0).getTime();
    expect(estadoDeCaja(caja({ desde: mediodia }), new Date(2026, 10, 13, 0, 30).getTime())).toBe("abierta");
    expect(estadoDeCaja(caja({ desde: mediodia }), new Date(2026, 10, 13, 2, 30).getTime())).toBe("abierta");
    expect(estadoDeCaja(caja({ desde: mediodia }), new Date(2026, 10, 13, 9, 0).getTime())).toBe("vieja");
  });

  it("el arqueo: medio centavo no es un faltante, y el monto no se parte del «Bs»", () => {
    expect(textoDiferencia(-0.004)).toBe("cuadró");
    expect(textoDiferencia(-12.5)).toBe("faltan Bs\u00a012,50");
  });

  it("cuándo y hace cuánto", () => {
    expect(cuando(new Date(2026, 10, 11, 22, 10).getTime(), ahora)).toBe("ayer 22:10");
    expect(haceCuanto(3_200)).toBe("hace 3 s");
    expect(haceCuanto(65 * MIN)).toBe("hace 1 h 5 min");
  });
});

describe("Supervisión del local: pedidos y bloques", () => {
  it("un pendiente es «En camino» en un delivery y «Por recoger» en un recoger; lo desconocido, tal cual", () => {
    expect(estadoDePedido("DELIVERY", "PENDIENTE")).toEqual({ texto: "En camino", tono: "azul" });
    expect(estadoDePedido("RECOGER", "PENDIENTE")).toEqual({ texto: "Por recoger", tono: "azul" });
    expect(estadoDePedido("DELIVERY", "RARO")).toEqual({ texto: "RARO", tono: "gris" });
    expect(marcaDePedido("DELIVERY")).toBe("Delivery");
    expect(marcaDePedido("LOCAL")).toBeNull();
  });

  it("el pie de Pedidos en camino es plata (porCobrarTotal), no la cantidad", () => {
    // El bug de la revisión: `porCobrar` del turno es cuántos pedidos, y
    // formateado como plata dos pedidos decían "Bs 2,00 por cobrar".
    expect(textoPorCobrar({ enCamino: 3, porCobrar: 2, porCobrarTotal: 150 })).toMatch(/^Bs\s150,00 por cobrar · 2 pedidos$/);
    expect(textoPorCobrar({ enCamino: 1, porCobrar: 1, porCobrarTotal: 45 })).toMatch(/^Bs\s45,00 por cobrar · 1 pedido$/);
    expect(textoPorCobrar({ enCamino: 2, porCobrar: 0, porCobrarTotal: 0 })).toBe("todos ya pagados");
    expect(textoPorCobrar({ enCamino: 1, porCobrar: 0, porCobrarTotal: 0 })).toBe("ya pagado");
  });

  it("un pedido que se cobra al entregar dice eso, no «Sin pago»", () => {
    // «Sin pago» se leía como una venta rota, y es un delivery que todavía no llegó.
    expect(mediosDeVenta({ pagos: [], fiada: false, porCobrar: true })).toBe("Se cobra al entregar");
    expect(mediosDeVenta({ pagos: [], fiada: false, porCobrar: false })).toBe("Sin pago");
    expect(mediosDeVenta({ pagos: [], fiada: true, porCobrar: false })).toBe("Fiado");
    expect(mediosDeVenta({ pagos: [{ medio: "QR", monto: 10 }], fiada: false, porCobrar: false })).toBe("QR");
  });

  it("los números de arriba nunca dejan una tarjeta huérfana: con cinco, 3 + 2 (o las cinco en una fila ancha)", () => {
    expect(columnasDeKpis(2)).toBe("@4xl:grid-cols-2");
    expect(columnasDeKpis(3)).toBe("@4xl:grid-cols-3");
    expect(columnasDeKpis(4)).toBe("@4xl:grid-cols-4");
    expect(columnasDeKpis(5)).toBe("@4xl:grid-cols-3 @6xl:grid-cols-5");
    expect(columnasDeKpis(5)).not.toMatch(/grid-cols-4/);
  });

  it("cuántos renglones trae cada pestaña", () => {
    expect(conteoDeBloques({ ventas: [{} as never, {} as never], pedidos: [{} as never], efectivo: [] })).toEqual({ ventas: 2, pedidos: 1, efectivo: 0 });
  });
});

describe("Supervisión del local: la actividad", () => {
  it("cada código cae en su filtro; una venta fiada es una venta", () => {
    expect(grupoDeActividad("VENTA")).toBe("ventas");
    expect(grupoDeActividad("CREDITO")).toBe("ventas");
    expect(grupoDeActividad("ANULACION")).toBe("anulaciones");
    expect(grupoDeActividad("PEDIDO")).toBe("pedidos");
    expect(grupoDeActividad("CAJA_ABIERTA")).toBe("caja");
    expect(grupoDeActividad("CAJA_CERRADA")).toBe("caja");
    expect(grupoDeActividad("EFECTIVO")).toBe("efectivo");
  });

  it("un código que no se reconoce queda en Todo y en ningún filtro: no desaparece de la lista", () => {
    const lista = [renglon("a", "VENTA"), renglon("b", "NUEVO_DEL_BACKEND"), renglon("c", "PEDIDO")];
    expect(grupoDeActividad("NUEVO_DEL_BACKEND")).toBeNull();
    expect(filtrarActividad(lista, "todo")).toHaveLength(3);
    expect(filtrarActividad(lista, "ventas").map((a) => a.id)).toEqual(["a"]);
    expect(filtrarActividad(lista, "pedidos").map((a) => a.id)).toEqual(["c"]);
    expect(filtrarActividad(lista, "efectivo")).toEqual([]);
  });

  it("lo más nuevo primero, y a la misma hora en un orden fijo", () => {
    const lista = [renglon("venta-1", "VENTA", 10), renglon("caja-1-cierra", "CAJA_CERRADA", 30), renglon("efectivo-9", "EFECTIVO", 30)];
    expect(ordenarActividad(lista).map((a) => a.id)).toEqual(["caja-1-cierra", "efectivo-9", "venta-1"]);
  });

  it("anulación en rojo, fiado en ámbar, venta en verde, pedido en azul; íconos con respaldo", () => {
    expect(tonoDeActividad("ANULACION")).toBe("rosa");
    expect(tonoDeActividad("CREDITO")).toBe("ambar");
    expect(tonoDeActividad("VENTA")).toBe("verde");
    expect(tonoDeActividad("PEDIDO")).toBe("azul");
    expect(tonoDeActividad("EFECTIVO")).toBe("normal");
    expect(iconoDeActividad("PEDIDO")).toBe("truck");
    expect(iconoDeActividad("LO_QUE_SEA")).toBe("info");
  });
});
