import { useState } from "react";
import { Link } from "react-router-dom";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { SiNo, Tarjeta } from "../tickets/piezas";

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
 * Mismo permiso que el ajuste del stock de al lado (`negocio.configurar`).
 */
export default function TarjetaAgregados() {
  const { fijarUsaAgregados } = useAuth();
  const estado = useApi(() => api.configAgregados(), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = async (usa: boolean) => {
    setProcesando(true);
    setError("");
    try {
      const nuevo = await api.cambiarUsaAgregados(usa);
      estado.setDatos(nuevo);
      // La sesión se entera ahora: el menú y el POS cambian sin volver a entrar.
      fijarUsaAgregados?.(nuevo.usaAgregados);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el ajuste");
    } finally {
      setProcesando(false);
    }
  };

  const datos = estado.datos;
  return (
    <Tarjeta titulo="Agregados (toppings, extras)">
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
              onCambiar={(usa) => void cambiar(usa)}
              etiqueta="Productos con agregados (toppings, extras)"
              detalle={
                datos.usaAgregados
                  ? "Prendido: un producto puede traer toppings incluidos y cobrar los extras. Se arman en Inventario › Agregados."
                  : "Apagado: el punto de venta vende cada producto tal cual. Prendelo si tu carta lleva toppings o extras."
              }
            />
          </div>
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
    </Tarjeta>
  );
}
