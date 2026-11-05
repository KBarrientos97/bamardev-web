import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPromociones } from "../../lib/promociones/apiPromociones";
import type { Cotizacion } from "../../lib/promociones/tipos";
import type { DetalleVentaInput, VentaInput } from "../../types";

/**
 * Cupones y promociones en el POS (PLAN-CRM-Y-PROMOCIONES §6.1).
 *
 * El POS no calcula descuentos: le pregunta al backend (`/ventas/cotizar`)
 * cada vez que cambia el carrito o los cupones, muestra lo que vuelve y, al
 * cobrar, manda lo mismo que vio (`descuentosEsperados`). Si algo cambió en
 * el medio, el backend responde 409 y el cajero vuelve a ver el total.
 *
 * Apagado (negocio sin `promociones`) no hace nada: ni un pedido, y la venta
 * sale sin los campos nuevos, como siempre.
 */
export interface Descuentos {
  activo: boolean;
  conCupones: boolean;
  cupones: string[];
  agregarCupon: (codigo: string) => void;
  quitarCupon: (codigo: string) => void;
  clienteId: number | null;
  setClienteId: (id: number | null) => void;
  cotizacion: Cotizacion | null;
  cargando: boolean;
  error: string;
  /** El total que se cobra: el neto si hay cotización vigente. */
  total: (bruto: number) => number;
  /** Lo que se suma al cuerpo de POST /ventas. Vacío si está apagado. */
  extraVenta: () => Pick<VentaInput, "cupones" | "descuentosEsperados" | "clienteId">;
  /** ¿La cotización corresponde al carrito de ahora? Sin eso no se cobra. */
  vigente: boolean;
  reiniciar: () => void;
  recotizar: () => void;
}

const ESPERA_MS = 250;

/**
 * Los locales (por almacén: cada uno es de un solo negocio) donde la última
 * cotización no encontró ningún descuento. Ahí el carrito no espera al
 * servidor: Kevin (3-nov) veía "Calculando descuentos…" y "Cobrar" apagado
 * con cada plato que tocaba, en un negocio sin una sola promoción.
 *
 * Vive fuera del hook para que la venta siguiente, o volver al POS, no
 * tengan que aprenderlo otra vez.
 */
const sinDescuentos = new Set<string>();

/** Para los tests: arrancar sin saber nada de ningún local. */
export function olvidarLocalesSinDescuentos() {
  sinDescuentos.clear();
}

/** Una línea por artículo, como la manda la cotización. */
function clave(detalles: DetalleVentaInput[], cupones: string[], clienteId: number | null, citaId: number | null) {
  return JSON.stringify([
    detalles.map((d) => [d.productoId, d.cantidad, d.recursoId ?? null, !!d.usarPaquete]),
    cupones,
    clienteId,
    citaId,
  ]);
}

export function useDescuentos(opc: {
  activo: boolean;
  conCupones: boolean;
  detalles: DetalleVentaInput[];
  almacenId?: number | null;
  /** La cita que se cobra, si es eso: la cotización valida el profesional como la venta. */
  citaId?: number | null;
}): Descuentos {
  const { activo, conCupones, detalles, almacenId } = opc;
  const citaId = opc.citaId ?? null;
  const [cupones, setCupones] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [claveCotizada, setClaveCotizada] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);
  const pedido = useRef(0);
  const local = String(almacenId ?? "");
  const [localSinDescuentos, setLocalSinDescuentos] = useState(() => sinDescuentos.has(local));
  useEffect(() => setLocalSinDescuentos(sinDescuentos.has(local)), [local]);

  const actual = useMemo(
    () => clave(detalles, cupones, clienteId, citaId),
    [detalles, cupones, clienteId, citaId],
  );

  useEffect(() => {
    if (!activo) return;
    if (detalles.length === 0) {
      setCotizacion(null);
      setClaveCotizada(actual);
      setError("");
      return;
    }
    const mio = ++pedido.current;
    setCargando(true);
    const t = setTimeout(() => {
      apiPromociones
        .cotizar({
          // El profesional va para que la cotización use su precio propio
          // (agenda, fase 2), el mismo que va a cobrar la venta.
          detalles: detalles.map((d) => ({
            productoId: d.productoId,
            cantidad: d.cantidad,
            ...(d.recursoId != null ? { recursoId: d.recursoId } : {}),
            // Una sesión de paquete en la venta directa (QA DIA-08): va a 0
            // y no entra al motor, igual que en la venta.
            ...(d.usarPaquete ? { usarPaquete: true } : {}),
          })),
          ...(almacenId != null ? { almacenId } : {}),
          ...(cupones.length ? { cupones } : {}),
          ...(clienteId != null ? { clienteId } : {}),
          ...(citaId != null ? { citaId } : {}),
        })
        .then((c) => {
          if (mio !== pedido.current) return;
          setCotizacion(c);
          setClaveCotizada(actual);
          setError("");
          // Sólo se aprende con un carrito pelado: sin cupones ni cliente, que
          // pueden ser la razón de que no haya salido nada.
          if (c.aplicadas.length > 0) {
            sinDescuentos.delete(local);
            setLocalSinDescuentos(false);
          } else if (cupones.length === 0 && clienteId == null && citaId == null) {
            sinDescuentos.add(local);
            setLocalSinDescuentos(true);
          }
        })
        .catch((e: unknown) => {
          if (mio !== pedido.current) return;
          // Sin cotización la venta sale sin descuento, como hoy: el cajero
          // lo ve y puede reintentar.
          setCotizacion(null);
          setClaveCotizada(null);
          setError(e instanceof Error ? e.message : "No se pudieron calcular los descuentos");
        })
        .finally(() => {
          if (mio === pedido.current) setCargando(false);
        });
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // `detalles` cambia de identidad en cada render: manda la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, actual, almacenId, vuelta]);

  /** La cotización que hay es la de este carrito. */
  const cotizada = activo && claveCotizada === actual && !cargando;
  /**
   * En un local sin descuentos el carrito no espera: el total es el de
   * siempre y se puede cobrar mientras la cotización corre de fondo. Sigue
   * siendo seguro: la venta va con "no espero ningún descuento" y, si en el
   * medio apareció una promoción, el backend la frena con un 409 y la
   * cotización nueva (`exigirLoEsperado`), igual que si cambiara cualquiera.
   */
  const optimista =
    activo && !cotizada && localSinDescuentos && cupones.length === 0 && clienteId == null && citaId == null;
  const vigente = cotizada || optimista;

  const agregarCupon = useCallback((codigo: string) => {
    const limpio = codigo.toUpperCase().replace(/[\s-]+/g, "").trim();
    if (!limpio) return;
    setCupones((prev) => (prev.includes(limpio) || prev.length >= 3 ? prev : [...prev, limpio]));
  }, []);
  const quitarCupon = useCallback((codigo: string) => {
    setCupones((prev) => prev.filter((c) => c !== codigo));
  }, []);
  const reiniciar = useCallback(() => {
    setCupones([]);
    setClienteId(null);
    setCotizacion(null);
    setClaveCotizada(null);
    setError("");
  }, []);
  const recotizar = useCallback(() => setVuelta((v) => v + 1), []);

  const total = useCallback(
    // Con la cotización de otro carrito (el de antes del último toque) va el
    // bruto: su neto sería de otra cuenta.
    (bruto: number) => (cotizada && cotizacion ? cotizacion.total : bruto),
    [cotizada, cotizacion],
  );

  const extraVenta = useCallback((): Pick<
    VentaInput,
    "cupones" | "descuentosEsperados" | "clienteId"
  > => {
    if (!cotizada || !cotizacion) {
      // `[]` y no nada: así el backend corre el motor y confirma que no hay
      // descuento. Sin el campo, la venta saldría sin preguntar.
      if (optimista) return { descuentosEsperados: [] };
      return clienteId != null && activo ? { clienteId } : {};
    }
    // Sólo los cupones que se aplicaron: uno descartado (vencido, bajo el
    // mínimo) haría rechazar la venta entera.
    const aplicados = new Set(cotizacion.aplicadas.map((a) => a.codigo).filter(Boolean));
    const validos = cupones.filter((c) => aplicados.has(c));
    return {
      descuentosEsperados: cotizacion.descuentosEsperados,
      ...(validos.length ? { cupones: validos } : {}),
      ...(clienteId != null ? { clienteId } : {}),
    };
  }, [activo, cotizada, optimista, cotizacion, cupones, clienteId]);

  return {
    activo,
    conCupones: activo && conCupones,
    cupones,
    agregarCupon,
    quitarCupon,
    clienteId,
    setClienteId,
    cotizacion: activo ? cotizacion : null,
    // La cotización de fondo no se anuncia ni frena "Cobrar"; si falla, la
    // venta igual la confirma el backend.
    cargando: activo && cargando && !optimista,
    error: activo && !optimista ? error : "",
    total,
    extraVenta,
    vigente,
    reiniciar,
    recotizar,
  };
}
