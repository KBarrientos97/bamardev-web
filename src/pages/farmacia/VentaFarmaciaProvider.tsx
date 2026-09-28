import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Confirmar } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { Producto } from "../../types";
import { idsGuardados, useCarrito } from "../pos/useCarrito";
import { CONDICION, conUnidad, pideConfirmacion } from "./medicamento";
import { ContextoVentaFarmacia, type VentaFarmacia } from "./ventaFarmacia";

/** Lo que dura el aviso de "agregado", como en la maqueta. */
const AVISO_MS = 2200;

/**
 * La venta de la farmacia, por encima de todas las pantallas.
 *
 * Tres cosas viven acá y no en el POS:
 *
 *  · **el carrito**, para que ir a Buscar medicamento y volver no lo borre, y
 *    para que un F5 tampoco. Se guarda en la sesión del navegador igual que el
 *    de siempre (ids y cantidades) y al volver se piden esos artículos al
 *    servidor, con el precio y el stock de hoy;
 *  · **la pregunta por la receta**: se agregue desde el POS, desde Buscar o
 *    desde la ficha, un controlado frena igual;
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

  const carrito = useCarrito("LOCAL", guardados, listo);
  const { agregar: sumarAlCarrito, setCantidad, lineas } = carrito;

  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<number | undefined>(undefined);
  const avisar = useCallback((texto: string) => {
    setAviso(texto);
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAviso(null), AVISO_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  const [pidiendoReceta, setPidiendoReceta] = useState<Producto | null>(null);

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
      // se queda con el papel. Que el sistema pare un segundo es lo que lo
      // vuelve un acto deliberado en vez de un clic más.
      if (pideConfirmacion(p)) {
        setPidiendoReceta(p);
        return;
      }
      sumar(p);
    },
    [sumar, avisar],
  );

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
    () => ({ carrito, agregar, fijarCantidad }),
    [carrito, agregar, fijarCantidad],
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

      <Confirmar
        abierto={!!pidiendoReceta}
        titulo={pidiendoReceta?.controlado ? "Medicamento controlado" : "Este necesita receta"}
        texto={
          pidiendoReceta
            ? `${pidiendoReceta.nombre}${
                CONDICION[pidiendoReceta.condicionVenta]
                  ? ` — ${CONDICION[pidiendoReceta.condicionVenta]!.largo}`
                  : ""
              }. Pedí la receta y quedátela: se asienta en el libro.`
            : ""
        }
        etiquetaOk="Tengo la receta"
        onCancel={() => setPidiendoReceta(null)}
        onOk={() => {
          if (pidiendoReceta) sumar(pidiendoReceta);
          setPidiendoReceta(null);
        }}
      />
    </ContextoVentaFarmacia.Provider>
  );
}
