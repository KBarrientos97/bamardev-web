import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Cargando, ErrorMsg, Input } from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { CambioConfigRecetas, CostoInsumoReceta } from "../../types";
import { SiNo } from "../tickets/piezas";
import TarjetaPlegable from "./TarjetaPlegable";

/**
 * Configuración › Inventario y stock › «Recetas y costo por plato» (27-nov).
 *
 * El interruptor de todo lo de las recetas: cada plato lleva su receta de
 * insumos, el sistema le calcula el costo y la venta descuenta los insumos.
 * Apagado de fábrica y sólo para el restaurante. Prenderlo no cambia ningún
 * artículo por sí solo: un plato pasa a calcular su costo recién cuando se le
 * arma la receta (Inventario › Artículos, tipo «Con receta»). Apagarlo tampoco
 * borra nada: las recetas quedan guardadas y los platos se venden como
 * elaborados de costo a mano.
 *
 * Con las recetas prendidas, cuatro ajustes más: desde qué % de cambio se
 * avisa del costo de un plato, de dónde sale el costo de cada insumo, si el
 * punto de venta pregunta la presa y cuánto descuenta un «puro».
 *
 * Mismo permiso que el resto de la pantalla (`negocio.configurar`). Cada cambio
 * se guarda al tocarlo (el % al salir del campo) y la sesión se entera en el
 * acto (`fijarRecetas`): Insumos, Movimientos y el punto de venta cambian sin
 * volver a entrar.
 */
export default function TarjetaRecetas() {
  const { fijarRecetas } = useAuth();
  const estado = useApi(() => api.configRecetas(), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const idAviso = useId();

  const datos = estado.datos;
  // El campo sigue a lo guardado: llega con el valor del negocio (de fábrica, 2).
  useEffect(() => {
    if (datos) setAviso(String(datos.avisoPct));
  }, [datos]);

  const cambiar = async (cambio: CambioConfigRecetas) => {
    setProcesando(true);
    setError("");
    try {
      const nueva = await api.cambiarConfigRecetas(cambio);
      estado.setDatos(nueva);
      // La sesión se entera ahora: Insumos, Movimientos y el POS cambian sin volver a entrar.
      fijarRecetas?.({ activas: nueva.activas, elegirPresa: nueva.elegirPresa, puroDoble: nueva.puroDoble });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el ajuste");
      // El campo vuelve a lo guardado: no se queda un número que no se guardó.
      if (datos) setAviso(String(datos.avisoPct));
    } finally {
      setProcesando(false);
    }
  };

  const guardarAviso = () => {
    if (!datos) return;
    // Vacío no es un cambio: vuelve a lo guardado sin decir nada.
    if (!aviso.trim()) {
      setAviso(String(datos.avisoPct));
      return;
    }
    const n = parsearMonto(aviso);
    if (n === null || n < 0 || n > 100) {
      setError("El aviso va de 0 a 100 %.");
      setAviso(String(datos.avisoPct));
      return;
    }
    // Decimal(5,2) en el backend: 2,555 se guarda 2,56.
    const pct = Math.round(n * 100) / 100;
    if (pct === datos.avisoPct) {
      setAviso(String(datos.avisoPct));
      return;
    }
    void cambiar({ avisoPct: pct });
  };

  // Un backend anterior no tiene el ajuste (404): la pantalla queda como antes,
  // sin una tarjeta en rojo que no se puede arreglar desde acá.
  if ((estado.falla as { status?: number } | null)?.status === 404) return null;

  return (
    <TarjetaPlegable
      titulo="Recetas y costo por plato"
      estado={datos ? (datos.activas ? { texto: "Prendido", tono: "verde" } : { texto: "Apagado", tono: "gris" }) : undefined}
    >
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : !datos.sePuede && !datos.activas ? (
        // Hoy esta pantalla es sólo del restaurante; si un día se abre en otro rubro, dice por qué.
        <p className="text-sm text-texto-2">Las recetas por plato son sólo para restaurantes.</p>
      ) : (
        <>
          <ErrorMsg>{error}</ErrorMsg>
          <div className={procesando ? "pointer-events-none opacity-60" : undefined}>
            <SiNo
              activo={datos.activas}
              onCambiar={(v) => void cambiar({ activas: v })}
              etiqueta="Recetas y costo por plato"
              detalle="Cada plato lleva su receta de insumos: el sistema le calcula el costo y la venta descuenta los insumos. Los artículos que ya tenés siguen igual hasta que les armes la receta."
            />
          </div>

          {datos.activas && (
            <div
              role="group"
              aria-label="Cómo funcionan las recetas"
              className={`mt-3 space-y-4 rounded-xl border border-borde-soft bg-muted px-3.5 py-3 ${procesando ? "pointer-events-none opacity-60" : ""}`}
            >
              <div>
                <label htmlFor={idAviso} className="block text-sm font-semibold text-texto">
                  Avisarme cuando el costo de un plato cambie
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    id={idAviso}
                    type="number"
                    inputMode="decimal"
                    value={aviso}
                    onChange={(e) => setAviso(e.target.value)}
                    onBlur={guardarAviso}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="w-24 text-right"
                  />
                  <span className="text-sm text-texto-2">% o más</span>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-texto">El costo de cada insumo es</p>
                <Opciones<CostoInsumoReceta>
                  etiqueta="El costo de cada insumo es"
                  valor={datos.costoInsumo}
                  onCambiar={(v) => {
                    if (v !== datos.costoInsumo) void cambiar({ costoInsumo: v });
                  }}
                  opciones={[
                    { valor: "ULTIMA", texto: "La última compra" },
                    { valor: "PROMEDIO3", texto: "El promedio de las últimas 3" },
                  ]}
                />
              </div>

              <SiNo
                activo={datos.elegirPresa}
                onCambiar={(v) => void cambiar({ elegirPresa: v })}
                etiqueta="Elegir la presa al vender"
                detalle="Al tocar un plato de 1 o 2 presas, el punto de venta pregunta cuál salió (un toque más). Apagado, el plato se agrega directo."
              />

              <div>
                <p className="text-sm font-semibold text-texto">Cuando el cliente pide «puro» (pura papa, puro arroz)</p>
                <Opciones<"DOBLE" | "MISMA">
                  etiqueta="Cuando el cliente pide «puro»"
                  valor={datos.puroDoble ? "DOBLE" : "MISMA"}
                  onCambiar={(v) => {
                    if ((v === "DOBLE") !== datos.puroDoble) void cambiar({ puroDoble: v === "DOBLE" });
                  }}
                  opciones={[
                    { valor: "DOBLE", texto: "Descuenta doble porción" },
                    { valor: "MISMA", texto: "Descuenta la misma porción" },
                  ]}
                />
              </div>
            </div>
          )}

          {datos.activas && (
            <p className="mt-2 text-[13px] text-texto-2">
              Las recetas se arman en{" "}
              <Link to="/inventario/productos" className="font-semibold text-primary-700 hover:underline">
                Inventario › Artículos
              </Link>
              , con el tipo «Con receta». Apagarlas no borra nada: quedan guardadas.
            </p>
          )}
        </>
      )}
    </TarjetaPlegable>
  );
}

/**
 * Dos opciones, una elegida: el mismo aspecto que `Segmentado` de Tickets, pero
 * apiladas en el teléfono (los textos son largos: lado a lado no entraban en
 * 360 px sin partirse) y con botones de 44 px de alto para el dedo.
 */
function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambiar: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="mt-1.5 grid gap-1 rounded-xl bg-white p-1 sm:inline-grid sm:auto-cols-fr sm:grid-flow-col"
    >
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={`min-h-11 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
            o.valor === valor ? "bg-primary-50 text-primary-700 shadow-sm" : "text-texto-3 hover:text-texto"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
