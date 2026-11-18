import { useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { AvisoOk, Cargando, ErrorMsg, useAviso } from "../../components/ui";
import { api } from "../../lib/api";
import { configuracionEnLista, VOLVER_A_CONFIGURACION } from "../../lib/configuracion";
import { normalizarConfigPos, type ConfigPos } from "../../lib/configPos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { SiNo, Tarjeta } from "../tickets/piezas";

/**
 * Configuración › Caja (17-nov): lo que se cuenta al abrir y al cerrar el turno.
 *
 * Hoy es una sola cosa: si la caja ofrece contar el efectivo billete por
 * billete (`CorteDeCaja`). Un local que cobra casi todo con QR, o que ya sabe
 * cuánto deja en el cajón, no necesita ese acordeón en cada apertura; otro lo
 * necesita en el cierre y no en la apertura. Por eso son dos interruptores.
 * De fábrica los dos están prendidos, como siempre: quien no entra acá no nota
 * nada. Apagarlos no quita el campo del monto: se escribe el total directo.
 *
 * Vive en el mismo permiso y rubro que «Punto de venta» (`config_pos`): es la
 * misma gente y la misma caja, y los ajustes viajan en el mismo
 * `PATCH /pos/config`. Se guarda al tocar.
 */
export default function ConfigCaja() {
  const { rubro, fijarConfigPos } = useAuth();
  const estado = useApi(() => api.configPos().then(normalizarConfigPos), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useAviso(4000);

  const cambiar = async (cambio: Pick<Partial<ConfigPos>, "billetesAlAbrir" | "billetesAlCerrar">) => {
    setProcesando(true);
    setError("");
    try {
      const nuevo = normalizarConfigPos(await api.guardarConfigPos(cambio));
      estado.setDatos(nuevo);
      // La sesión se entera ahora: la apertura y el cierre de este equipo cambian sin volver a entrar.
      fijarConfigPos?.(nuevo);
      setGuardado("Guardado");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo guardar el cambio");
    } finally {
      setProcesando(false);
    }
  };

  const datos = estado.datos;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Caja"
        subtitulo="Lo que se cuenta al abrir y al cerrar el turno."
        // Se llega desde la lista de Configuración: la flecha vuelve ahí.
        volver={configuracionEnLista(rubro) ? VOLVER_A_CONFIGURACION : undefined}
      />
      <AvisoOk>{guardado}</AvisoOk>
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : (
        <Tarjeta titulo="Billetes y monedas">
          <ErrorMsg>{error}</ErrorMsg>
          {/* Un toque a la vez: dos PATCH juntos podían llegar al revés y dejar lo de antes. */}
          <div className={`divide-y divide-borde-soft ${procesando ? "pointer-events-none opacity-60" : ""}`}>
            <SiNo
              activo={datos.billetesAlAbrir}
              onCambiar={(v) => void cambiar({ billetesAlAbrir: v })}
              etiqueta="Contar billetes y monedas al abrir"
              detalle={
                datos.billetesAlAbrir
                  ? "Prendido: al abrir la caja se puede contar el efectivo billete por billete y el total pasa solo al monto."
                  : "Apagado: se escribe el monto de apertura directo."
              }
            />
            <SiNo
              activo={datos.billetesAlCerrar}
              onCambiar={(v) => void cambiar({ billetesAlCerrar: v })}
              etiqueta="Contar billetes y monedas al cerrar"
              detalle={
                datos.billetesAlCerrar
                  ? "Prendido: al cerrar se puede contar el cajón billete por billete."
                  : "Apagado: se escribe lo contado directo."
              }
            />
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
