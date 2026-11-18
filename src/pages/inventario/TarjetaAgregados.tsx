import { useState } from "react";
import { Link } from "react-router-dom";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import type { CambioConfigAgregados } from "../../lib/agregados/tipos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { SiNo } from "../tickets/piezas";
import TarjetaPlegable from "./TarjetaPlegable";

/**
 * Configuración › Inventario y stock › «Productos con agregados» (PLAN-AGREGADOS
 * §7.6): el interruptor que enciende toppings y extras para el negocio.
 *
 * Es un ajuste del dueño y no una feature del panel porque la mayoría de los
 * negocios no los usan: apagado (de fábrica) no aparece Inventario → «Agregados»
 * ni el POS cambia en nada. Prenderlo no cambia ninguna venta por sí solo: hasta
 * armar un grupo y asignarlo a un producto, todo se vende como siempre. Apagarlo
 * tampoco borra nada: los grupos quedan guardados.
 *
 * Con él prendido, dos casillas dicen DÓNDE se usan los toppings (PLAN-AGREGADOS
 * §8.1): la página del cliente y/o el punto de venta. Así la caja puede seguir
 * vendiendo rápido, como antes, y los toppings se eligen en la página.
 *
 * Mismo permiso que el ajuste del stock de al lado (`negocio.configurar`).
 */
export default function TarjetaAgregados() {
  const { fijarUsaAgregados } = useAuth();
  const estado = useApi(() => api.configAgregados(), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = async (cambio: CambioConfigAgregados) => {
    setProcesando(true);
    setError("");
    try {
      const nuevo = await api.cambiarConfigAgregados(cambio);
      estado.setDatos(nuevo);
      // La sesión se entera ahora: el menú, el POS y la página cambian sin volver a entrar.
      fijarUsaAgregados?.(nuevo.usaAgregados, { enPos: nuevo.enPos ?? false, enPagina: nuevo.enPagina ?? false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el ajuste");
    } finally {
      setProcesando(false);
    }
  };

  /**
   * Prenderlo por primera vez deja sólo la página del cliente (§8.1): la caja
   * sigue vendiendo como siempre hasta que el dueño la sume. Si ya había elegido
   * dónde, se respeta.
   */
  const alternar = (usa: boolean) => {
    const d = estado.datos;
    const primeraVez = usa && !!d && !d.enPagina && !d.enPos;
    void cambiar({ usaAgregados: usa, ...(primeraVez ? { enPagina: true } : {}) });
  };

  const datos = estado.datos;
  return (
    <TarjetaPlegable
      titulo="Agregados (toppings, extras)"
      estado={datos ? (datos.usaAgregados ? { texto: "Prendido", tono: "verde" } : { texto: "Apagado", tono: "gris" }) : undefined}
    >
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : (
        <>
          <ErrorMsg>{error}</ErrorMsg>
          <div className={procesando ? "pointer-events-none opacity-60" : undefined}>
            <SiNo
              activo={datos.usaAgregados}
              onCambiar={alternar}
              etiqueta="Productos con agregados (toppings, extras)"
              detalle={
                datos.usaAgregados
                  ? "Prendido: un producto puede traer toppings incluidos y cobrar los extras. Se arman en Inventario › Agregados."
                  : "Apagado: el punto de venta vende cada producto tal cual. Prendelo si tu carta lleva toppings o extras."
              }
            />
          </div>
          {datos.usaAgregados && (
            <div
              role="group"
              aria-label="Dónde se usan los toppings"
              className={`mt-3 space-y-3 rounded-xl border border-borde-soft bg-muted px-3.5 py-3 ${procesando ? "pointer-events-none opacity-60" : ""}`}
            >
              <Casilla
                marcada={datos.enPagina === true}
                onCambiar={(v) => void cambiar({ enPagina: v })}
                etiqueta="En la página del cliente"
                detalle="Elige sus toppings al pedir."
              />
              <Casilla
                marcada={datos.enPos === true}
                onCambiar={(v) => void cambiar({ enPos: v })}
                etiqueta="En el punto de venta"
                detalle="La hoja de toppings al vender."
                ayuda="Apagado, la caja vende como siempre: los toppings sueltos y el vaso directo."
              />
            </div>
          )}
          {datos.usaAgregados && (
            <p className="mt-2 text-[13px] text-texto-2">
              Apagarlo no borra nada: los grupos quedan guardados y los toppings vuelven a salir como productos sueltos.{" "}
              <Link to="/inventario/agregados" className="font-semibold text-primary-700 hover:underline">
                Armar los grupos
              </Link>
            </p>
          )}
        </>
      )}
    </TarjetaPlegable>
  );
}

function Casilla({
  marcada,
  onCambiar,
  etiqueta,
  detalle,
  ayuda,
}: {
  marcada: boolean;
  onCambiar: (v: boolean) => void;
  etiqueta: string;
  detalle: string;
  ayuda?: string;
}) {
  return (
    <div>
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(e) => onCambiar(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-borde accent-primary"
        />
        <span className="text-sm text-texto-2">
          <span className="font-semibold text-texto">{etiqueta}:</span> {detalle}
        </span>
      </label>
      {ayuda && <p className="ml-[26px] mt-1 text-[12px] text-texto-3">{ayuda}</p>}
    </div>
  );
}
