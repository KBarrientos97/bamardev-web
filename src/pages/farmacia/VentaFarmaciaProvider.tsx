import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { DetalleVentaInput, Producto, RecetaVenta } from "../../types";
import { idsGuardados, useCarrito } from "../pos/useCarrito";
import DialogoReceta from "./DialogoReceta";
import { conUnidad, pideConfirmacion } from "./medicamento";
import { ContextoVentaFarmacia, type VentaFarmacia } from "./ventaFarmacia";

/** Lo que dura el aviso de "agregado", como en la maqueta. */
const AVISO_MS = 2200;

/**
 * Dónde viven las recetas de la venta en curso: junto al carrito, en la
 * sesión del navegador, para que un F5 no obligue a pedirle el papel de nuevo
 * al cliente.
 */
const CLAVE_RECETAS = "bamar.recetas.LOCAL";

function leerRecetas(): Map<number, RecetaVenta> {
  try {
    const crudo = sessionStorage.getItem(CLAVE_RECETAS);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? new Map(datos as [number, RecetaVenta][]) : new Map();
  } catch {
    return new Map();
  }
}

/**
 * La venta de la farmacia, por encima de todas las pantallas.
 *
 * Tres cosas viven acá y no en el POS:
 *
 *  · **el carrito**, para que ir a Buscar medicamento y volver no lo borre, y
 *    para que un F5 tampoco. Se guarda en la sesión del navegador igual que el
 *    de siempre (ids y cantidades) y al volver se piden esos artículos al
 *    servidor, con el precio y el stock de hoy;
 *  · **la receta de los controlados**: se agregue desde el POS, desde Buscar
 *    o desde la ficha, un controlado frena igual y pide los datos que van al
 *    libro. Viajan con la venta (`aDetalles`) y el servidor los asienta;
 *  · **el botón "Ver venta"**, que sigue a quien atiende por cualquier pantalla
 *    mientras haya algo cargado, y el aviso de "agregado a la venta".
 */
export default function VentaFarmaciaProvider({ children }: { children: ReactNode }) {
  const { puede } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Los artículos que había en la venta antes del F5, pedidos de a uno: son
  // pocos, y así vuelven con el precio de la sucursal y el stock de ahora.
  const [guardados, setGuardados] = useState<Producto[]>([]);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const ids = idsGuardados("LOCAL");
    if (ids.length === 0) {
      setListo(true);
      return;
    }
    let vivo = true;
    void (async () => {
      // Con el precio y el stock de la sucursal de la CAJA, como los da la
      // grilla. Al cajero el servidor ya le da la suya; al dueño, que no tiene
      // sucursal, sin esto le volvían el precio de lista y el stock del
      // negocio entero: podía escribir más de lo que hay en el mostrador, y un
      // precio distinto en la sucursal hacía fallar el cobro.
      const caja = await api.cajaActual().catch(() => null);
      const sucursalId = caja?.caja?.almacenId ?? null;
      const r = await Promise.allSettled(ids.map((id) => api.getProducto(id, sucursalId)));
      if (!vivo) return;
      // Lo que ya no existe (o no se pudo leer) simplemente no vuelve.
      setGuardados(r.flatMap((x) => (x.status === "fulfilled" ? [x.value] : [])));
      setListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const carritoBase = useCarrito("LOCAL", guardados, listo);
  const { agregar: sumarAlCarrito, setCantidad, lineas } = carritoBase;

  // La receta de cada renglón que la exige, por producto.
  const [recetas, setRecetas] = useState<Map<number, RecetaVenta>>(leerRecetas);
  useEffect(() => {
    try {
      if (recetas.size === 0) sessionStorage.removeItem(CLAVE_RECETAS);
      else sessionStorage.setItem(CLAVE_RECETAS, JSON.stringify([...recetas]));
    } catch {
      /* sin storage se sigue: es una comodidad */
    }
  }, [recetas]);

  // Un renglón que sale de la venta (o la venta que se cobró y se vació) se
  // lleva su receta: si no, el próximo cliente que compre lo mismo heredaría
  // el paciente del anterior. Se compara con los renglones de ANTES y no con
  // un carrito vacío: mientras se rehidrata tras un F5 el carrito arranca
  // vacío, y eso no es sacar nada.
  const idsAntes = useRef<number[]>([]);
  useEffect(() => {
    const ahora = new Set(lineas.map((l) => l.producto.id));
    const salieron = idsAntes.current.filter((id) => !ahora.has(id));
    idsAntes.current = [...ahora];
    if (salieron.length === 0) return;
    setRecetas((prev) => {
      const sigue = new Map(prev);
      for (const id of salieron) sigue.delete(id);
      return sigue;
    });
  }, [lineas]);

  // El carrito que ven las pantallas: el mismo, pero cada renglón viaja con
  // su receta. Así el POS cobra igual que siempre y la venta llega completa.
  const carrito = useMemo(
    () => ({
      ...carritoBase,
      aDetalles: (): DetalleVentaInput[] =>
        carritoBase.aDetalles().map((d) => {
          const receta = recetas.get(d.productoId);
          return receta ? { ...d, receta } : d;
        }),
    }),
    [carritoBase, recetas],
  );

  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<number | undefined>(undefined);
  const avisar = useCallback((texto: string) => {
    setAviso(texto);
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAviso(null), AVISO_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  /** El controlado cuya receta se está pidiendo, y si es para agregarlo. */
  const [pidiendoReceta, setPidiendoReceta] = useState<{
    producto: Producto;
    agregando: boolean;
  } | null>(null);
  /** La última receta cargada: suele ser el mismo papel para el siguiente. */
  const ultimaReceta = useRef<RecetaVenta | null>(null);

  const sumar = useCallback(
    (p: Producto) => {
      // `useCarrito` no suma más de lo que hay y no dice nada; acá se dice,
      // porque un "agregado" que no se agregó es peor que ningún aviso.
      const ya = lineas.find((l) => l.producto.id === p.id)?.cantidad ?? 0;
      if (p.tipoProducto === "ALMACENABLE" && ya + 1 > p.stockTotal) {
        avisar(
          p.stockTotal <= 0
            ? `${p.nombre}: agotado`
            : `${p.nombre}: no hay más, quedan ${conUnidad(p.stockTotal, p.unidadMedida?.nombre)}`,
        );
        return;
      }
      sumarAlCarrito(p);
      avisar(`${p.nombre} agregado a la venta`);
    },
    [lineas, sumarAlCarrito, avisar],
  );

  const agregar = useCallback(
    (p: Producto) => {
      if (p.disponible === false) {
        avisar(`${p.nombre} no se vende en esta sucursal`);
        return;
      }
      // Un controlado o una receta valorada no se despachan y ya: la farmacia
      // se queda con el papel y lo asienta en el libro. Se pide al agregarlo,
      // con el papel en la mano; una unidad más del mismo renglón ya lo tiene.
      const conReceta = recetas.has(p.id) && lineas.some((l) => l.producto.id === p.id);
      if (pideConfirmacion(p) && !conReceta) {
        setPidiendoReceta({ producto: p, agregando: true });
        return;
      }
      sumar(p);
    },
    [sumar, avisar, recetas, lineas],
  );

  const pedirReceta = useCallback((p: Producto) => {
    setPidiendoReceta({ producto: p, agregando: false });
  }, []);

  const fijarCantidad = useCallback(
    (p: Producto, cantidad: number) => {
      // Igual que al sumar: si se pide más de lo que hay, queda en lo que hay
      // y se dice. Escribir 300 y ver 140 sin explicación parece un error.
      if (p.tipoProducto === "ALMACENABLE" && cantidad > p.stockTotal) {
        avisar(
          `${p.nombre}: no hay tanto, quedan ${conUnidad(p.stockTotal, p.unidadMedida?.nombre)}`,
        );
      }
      setCantidad(p.id, cantidad);
    },
    [setCantidad, avisar],
  );

  const valor = useMemo<VentaFarmacia>(
    () => ({ carrito, agregar, fijarCantidad, recetas, pedirReceta }),
    [carrito, agregar, fijarCantidad, recetas, pedirReceta],
  );

  // En el POS el carrito ya está a la vista (o su píldora, en el teléfono).
  const verBoton = lineas.length > 0 && pathname !== "/pos" && puede("pos");

  return (
    <ContextoVentaFarmacia.Provider value={valor}>
      {children}

      {verBoton && (
        <button
          onClick={() => navigate("/pos")}
          className="fixed bottom-4 right-4 z-30 flex h-12 items-center gap-2.5 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-xl shadow-primary/30 transition hover:bg-primary-600 sm:bottom-6 sm:right-6 sm:h-14 sm:px-6 sm:text-base"
        >
          <Icon name="cart" size={20} />
          Ver venta · {fmtNum(carrito.unidades)} u. · {fmtMoney(carrito.total)}
        </button>
      )}

      {/* Arriba del botón en el teléfono, para no taparlo; centrado abajo en
          una pantalla grande, como en la maqueta. */}
      {aviso && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex justify-center sm:bottom-24 lg:bottom-6"
        >
          <p className="max-w-md rounded-xl bg-primary-700 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
            {aviso}
          </p>
        </div>
      )}

      {pidiendoReceta && (
        <DialogoReceta
          producto={pidiendoReceta.producto}
          agregando={pidiendoReceta.agregando}
          inicial={
            recetas.get(pidiendoReceta.producto.id) ??
            // De la receta anterior se copia el papel, no el número: cada
            // receta valorada es un formulario distinto.
            (ultimaReceta.current
              ? { ...ultimaReceta.current, recetaNumero: "" }
              : null)
          }
          onCancelar={() => setPidiendoReceta(null)}
          onGuardar={(r) => {
            const { producto, agregando } = pidiendoReceta;
            setRecetas((prev) => new Map(prev).set(producto.id, r));
            ultimaReceta.current = r;
            if (agregando) sumar(producto);
            setPidiendoReceta(null);
          }}
        />
      )}
    </ContextoVentaFarmacia.Provider>
  );
}
