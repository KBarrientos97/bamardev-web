import { useEffect, useMemo, useState } from "react";
import { Cargando, ErrorMsg, Input } from "../../components/ui";
import { api } from "../../lib/api";
import { configPosDe, ordenarCategorias } from "../../lib/configPos";
import { NOMBRE_CONTEO_POR_DEFECTO } from "../../lib/conteo";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { ConfigConteo } from "../../types";
import { SiNo } from "../tickets/piezas";
import TarjetaPlegable from "./TarjetaPlegable";

/** Cuánto entra en «¿Qué se cuenta?»: el mismo tope que el backend. */
const MAX_NOMBRE = 30;

/**
 * Configuración › Inventario y stock › «Conteo por categoría» (17-nov).
 *
 * Un negocio que vende por tamaño (las categorías C, M, L y XL, y cada una es
 * un vaso de ese tamaño) necesita llevar la cuenta de los vasos como un stock
 * por sucursal. Se pensó general (vasos, cajas de pizza, envases): el admin
 * elige QUÉ se cuenta (un nombre) y CUÁLES categorías cuentan.
 *
 * Apagado de fábrica: la caja abre y cierra como siempre. Prenderlo no cambia
 * ninguna venta; sólo suma el conteo en la apertura, el cierre y la
 * Supervisión. Apagarlo no borra lo contado: las categorías y el historial
 * quedan para cuando se vuelva a prender.
 *
 * El interruptor no deja prender sin ninguna categoría marcada (el backend
 * respondería 400): en ese caso muestra las categorías y dice qué falta, en
 * vez de un interruptor que no hace nada. Mismo permiso que el resto de la
 * pantalla (`negocio.configurar`).
 */
export default function TarjetaConteo() {
  const { negocio, fijarConteo } = useAuth();
  const estado = useApi(() => api.configConteo(), []);
  const categorias = useApi(() => api.getCategorias(false), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  // Quiso prender sin tener categorías: se muestran para que marque alguna.
  const [preparando, setPreparando] = useState(false);
  const [nombre, setNombre] = useState("");

  const datos = estado.datos;
  // El campo se llena una vez que llega lo guardado: «Unidades» es lo que se
  // lee sin nombre, no algo que el admin escribió, así que va de placeholder.
  useEffect(() => {
    if (datos) setNombre(datos.nombre === NOMBRE_CONTEO_POR_DEFECTO ? "" : datos.nombre);
  }, [datos]);

  const ordenPos = configPosDe(negocio).ordenCategorias;
  // El orden del POS: el que el dueño ya eligió para las columnas; sin elegir,
  // el que manda el backend (las tallas primero y de menor a mayor: C, M, L,
  // XL). NO alfabético: daría C, L, M, XL, y este orden es el que se guarda y se
  // lee en la apertura, el cierre y la Supervisión.
  const lista = useMemo(() => {
    const ventas = (categorias.datos ?? []).filter((c) => c.activo && !c.esInsumo);
    return ordenarCategorias(ventas, ordenPos);
  }, [categorias.datos, ordenPos]);

  const cambiar = async (cambio: { activo?: boolean; nombre?: string | null; categoriaIds?: number[] }) => {
    setProcesando(true);
    setError("");
    try {
      const nuevo = await api.cambiarConfigConteo(cambio);
      estado.setDatos(nuevo);
      // La sesión se entera ahora: la apertura y el cierre cambian sin volver a entrar.
      fijarConteo?.(nuevo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el ajuste");
      // El campo vuelve a lo guardado: no se queda un nombre que no se guardó.
      if (datos) setNombre(datos.nombre === NOMBRE_CONTEO_POR_DEFECTO ? "" : datos.nombre);
    } finally {
      setProcesando(false);
    }
  };

  const marcadas = new Set((datos?.categorias ?? []).map((c) => c.id));

  const alternar = (prender: boolean) => {
    if (prender && marcadas.size === 0) {
      // No se manda: el backend daría 400. Se muestran las categorías y el aviso de qué falta.
      setPreparando(true);
      return;
    }
    void cambiar({ activo: prender });
  };

  const marcar = (id: number, marcar: boolean) => {
    // En el orden de la lista, no en el que se fueron marcando: así se leen en
    // la apertura y en el cierre, siempre igual.
    const ids = lista.filter((c) => (c.id === id ? marcar : marcadas.has(c.id))).map((c) => c.id);
    // Desmarcar la última con el conteo prendido lo apaga: prendido sin
    // categorías es un estado que el backend no acepta.
    // Las casillas se quedan a la vista (con el aviso de que falta marcar una):
    // sin esto desaparecían en el mismo toque y, para volver a marcar, había que
    // tocar un interruptor que no prendía.
    if (ids.length === 0) setPreparando(true);
    void cambiar(ids.length === 0 && datos?.activo ? { activo: false, categoriaIds: ids } : { categoriaIds: ids });
  };

  const guardarNombre = () => {
    if (!datos) return;
    const limpio = nombre.trim();
    const actual = datos.nombre === NOMBRE_CONTEO_POR_DEFECTO ? "" : datos.nombre;
    if (limpio === actual) {
      setNombre(limpio);
      return;
    }
    void cambiar({ nombre: limpio || null });
  };

  const estadoCabecera = datos
    ? datos.activo
      ? { texto: `Prendido · ${datos.nombre}`, tono: "verde" as const }
      : { texto: "Apagado", tono: "gris" as const }
    : undefined;

  const verCampos = !!datos && (datos.activo || marcadas.size > 0 || preparando);

  return (
    <TarjetaPlegable titulo="Conteo por categoría" estado={estadoCabecera}>
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : (
        <>
          <ErrorMsg>{error}</ErrorMsg>
          <div className={procesando ? "pointer-events-none opacity-60" : undefined}>
            <SiNo
              activo={datos.activo}
              onCambiar={alternar}
              etiqueta="Contar por categoría en la caja"
              detalle={detalle(datos)}
            />
          </div>

          {verCampos && (
            <div className={`mt-3 space-y-4 ${procesando ? "pointer-events-none opacity-60" : ""}`}>
              <div>
                <label htmlFor="conteo-nombre" className="mb-1.5 block text-[13px] font-semibold text-texto-2">
                  ¿Qué se cuenta?
                </label>
                <Input
                  id="conteo-nombre"
                  value={nombre}
                  maxLength={MAX_NOMBRE}
                  placeholder="Ej.: Vasos"
                  onChange={(e) => setNombre(e.target.value)}
                  onBlur={guardarNombre}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <p className="mt-1 text-xs text-texto-4">Así se lee en la apertura, el cierre y la Supervisión.</p>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">Categorías que se cuentan</legend>
                {categorias.error ? (
                  <ErrorMsg onReintentar={categorias.recargar}>{categorias.error}</ErrorMsg>
                ) : !categorias.datos ? (
                  <Cargando />
                ) : lista.length === 0 ? (
                  <p className="text-[13px] text-texto-3">Todavía no hay categorías de venta. Se crean en Inventario › Categorías.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-borde-soft bg-muted px-3.5 py-3 sm:grid-cols-3">
                    {lista.map((c) => (
                      <label key={c.id} className="flex min-w-0 items-center gap-2.5 text-sm text-texto">
                        <input
                          type="checkbox"
                          checked={marcadas.has(c.id)}
                          onChange={(e) => marcar(c.id, e.target.checked)}
                          className="h-4 w-4 shrink-0 rounded border-borde accent-primary"
                        />
                        <span className="min-w-0 truncate font-medium">{c.nombre}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-texto-4">
                  Cada producto vendido de una categoría marcada descuenta uno por unidad. Los toppings incluidos no
                  descuentan.
                </p>
                {marcadas.size === 0 && (
                  <p role="note" className="mt-2 text-[13px] font-semibold text-warning-text">
                    Marcá al menos una categoría: sin eso no se cuenta nada.
                  </p>
                )}
              </fieldset>
            </div>
          )}
        </>
      )}
    </TarjetaPlegable>
  );
}

function detalle(d: ConfigConteo): string {
  return d.activo
    ? "Prendido: al abrir la caja se carga cuántos hay de cada categoría marcada, cada venta descuenta y al cerrar se ve cuánto queda. En Supervisión ves lo que queda en cada local y lo podés reponer."
    : "Apagado: la caja abre y cierra como siempre. Sirve para llevar la cuenta de vasos, cajas o envases por tamaño.";
}
