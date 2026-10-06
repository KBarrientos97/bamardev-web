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

const ESPERA_MS = 350;

/** Una línea por artículo, como la manda la cotización. */
function clave(detalles: DetalleVentaInput[], cupones: string[], clienteId: number | null) {
  return JSON.stringify([
    detalles.map((d) => [d.productoId, d.cantidad, d.recursoId ?? null]),
    cupones,
    clienteId,
  ]);
}

export function useDescuentos(opc: {
  activo: boolean;
  conCupones: boolean;
  detalles: DetalleVentaInput[];
  almacenId?: number | null;
}): Descuentos {
  const { activo, conCupones, detalles, almacenId } = opc;
  const [cupones, setCupones] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [claveCotizada, setClaveCotizada] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);
  const pedido = useRef(0);

  const actual = useMemo(() => clave(detalles, cupones, clienteId), [detalles, cupones, clienteId]);

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
          })),
          ...(almacenId != null ? { almacenId } : {}),
          ...(cupones.length ? { cupones } : {}),
          ...(clienteId != null ? { clienteId } : {}),
        })
        .then((c) => {
          if (mio !== pedido.current) return;
          setCotizacion(c);
          setClaveCotizada(actual);
          setError("");
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

  const vigente = activo && claveCotizada === actual && !cargando;

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
    (bruto: number) => (activo && vigente && cotizacion ? cotizacion.total : bruto),
    [activo, vigente, cotizacion],
  );

  const extraVenta = useCallback((): Pick<
    VentaInput,
    "cupones" | "descuentosEsperados" | "clienteId"
  > => {
    if (!activo || !vigente || !cotizacion) {
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
  }, [activo, vigente, cotizacion, cupones, clienteId]);

  return {
    activo,
    conCupones: activo && conCupones,
    cupones,
    agregarCupon,
    quitarCupon,
    clienteId,
    setClienteId,
    cotizacion: activo ? cotizacion : null,
    cargando: activo && cargando,
    error: activo ? error : "",
    total,
    extraVenta,
    vigente,
    reiniciar,
    recotizar,
  };
}
