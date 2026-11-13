import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Modal, Vacio } from "../../components/ui";
import { esCero } from "../../lib/dinero";
import { fmtFechaHora, fmtMoney } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import { ProductosDelArqueo } from "./ProductosDelArqueo";
import { cruzaMedianoche } from "./vistas/Cierres.datos";

/** Una fila de `GET reportes/cierres` (historial). */
export interface CierreFila {
  id: number;
  fecha: string;
  fechaApertura?: string | null;
  fechaCierre?: string | null;
  cajero: string;
  duracion: string;
  totalDia: number;
  apertura: number;
  efectivo: number;
  qr: number;
  esperado: number;
  conteo: number;
}

/**
 * Cierres de caja con su arqueo, como en la app (Cierres → detalle de arqueo).
 *
 * La web los mostraba como una tabla plana: no se podía abrir un turno ni ver
 * qué se vendió en él, que es lo primero que se pregunta ante una diferencia.
 * La diferencia va con color y con nombre (cuadró / sobrante / faltante) en
 * vez de un número con signo que hay que interpretar.
 *
 * Recibe el `historial` que ya trajo el reporte: no se pide dos veces.
 */
export function CierresVista({ historial }: { historial: CierreFila[] }) {
  const [abierto, setAbierto] = useState<CierreFila | null>(null);

  if (historial.length === 0) {
    return <Vacio icono="lock" titulo="Sin cierres" texto="No se cerró ninguna caja en este período." />;
  }

  return (
    <>
      <ul className="card divide-y divide-borde-soft">
        {historial.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => setAbierto(c)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-texto">
                  {c.fecha} · {c.cajero}
                </p>
                <p className="truncate text-xs text-texto-3">
                  Vendido {fmtMoney(c.totalDia)}
                  {c.duracion ? ` · ${c.duracion}` : ""}
                </p>
              </div>
              <Diferencia esperado={c.esperado} conteo={c.conteo} />
              <Icon name="chevronRight" size={16} />
            </button>
          </li>
        ))}
      </ul>

      {abierto && <ArqueoDetalle cierre={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

/** Cuadró = verde, sobrante = azul, faltante = rojo. Mismos colores que la app. */
function Diferencia({ esperado, conteo }: { esperado: number; conteo: number }) {
  const dif = conteo - esperado;
  if (esCero(dif)) {
    return (
      <span className="rounded-lg bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
        Cuadró
      </span>
    );
  }
  return dif > 0 ? (
    <span className="rounded-lg bg-info-bg px-2 py-0.5 text-xs font-bold text-info-text">
      Sobrante {fmtMoney(dif)}
    </span>
  ) : (
    <span className="rounded-lg bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger-text">
      Faltante {fmtMoney(-dif)}
    </span>
  );
}

/**
 * El arqueo de un turno, con "Productos vendidos". Exportado porque lo usa
 * también el reporte nuevo de Cierres de caja (`vistas/Cierres.tsx`): es el
 * mismo arqueo, no una copia que se desincronice.
 */
export function ArqueoDetalle({ cierre: c, sede, onCerrar }: { cierre: CierreFila; sede?: string | null; onCerrar: () => void }) {
  const [viendoProductos, setViendoProductos] = useState(false);
  const { rubro } = useAuth();
  // Como la app: cuánto duró y si pasó de un día al otro. El listado fecha el
  // turno por una sola punta, y mirándolo una semana después no se sabía de
  // qué jornada era el que abrió al mediodía y cerró a las 3.
  const enRestaurante = rubro === "RESTAURANTE";
  // «Centro» sólo para la organización con cierres de 2+ locales (lo decide quien lo abre):
  // un PDF suelto tiene que decir de qué local es la caja.
  const subtitulo = [c.fecha, c.cajero, sede].filter(Boolean).join(" · ");
  return (
    <Modal
      abierto
      titulo="Arqueo del turno"
      subtitulo={subtitulo}
      onClose={onCerrar}
      ancho="max-w-md"
      acciones={
        <Boton variante="ghost" icono="fileText" onClick={() => setViendoProductos(true)}>
          Productos vendidos
        </Boton>
      }
    >
      <div className="space-y-4">
        {/* Las dos puntas del turno: uno que abre al mediodía y cierra a las 3
            queda fechado en el día siguiente, y con una sola fecha no se sabe
            de qué jornada era. */}
        {(c.fechaApertura || c.fechaCierre) && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-muted p-3">
              <dt className="text-[11px] font-semibold uppercase text-texto-4">Abrió</dt>
              <dd className="font-bold text-texto">{fmtFechaHora(c.fechaApertura)}</dd>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <dt className="text-[11px] font-semibold uppercase text-texto-4">Cerró</dt>
              <dd className="font-bold text-texto">{fmtFechaHora(c.fechaCierre)}</dd>
            </div>
          </dl>
        )}
        {enRestaurante && c.duracion && <p className="text-xs text-texto-3">Duración: {c.duracion}</p>}
        {enRestaurante && cruzaMedianoche(c) && (
          <p className="text-xs text-texto-3">Este turno cruzó la medianoche: abrió un día y cerró al siguiente.</p>
        )}

        <dl className="space-y-1.5 text-sm">
          <Fila etiqueta="Total vendido" valor={c.totalDia} />
          <Fila etiqueta="Fondo de apertura" valor={c.apertura} />
          <Fila etiqueta="Ventas en efectivo" valor={c.efectivo} />
          <Fila etiqueta="Ventas por QR y otros (no van al cajón)" valor={c.qr} apagado />
          <div className="border-t border-borde pt-1.5">
            <Fila etiqueta="Efectivo esperado" valor={c.esperado} fuerte />
          </div>
          <Fila etiqueta="Efectivo contado" valor={c.conteo} fuerte />
        </dl>

        <div className="flex justify-center">
          <Diferencia esperado={c.esperado} conteo={c.conteo} />
        </div>
      </div>

      {viendoProductos && (
        <ProductosDelArqueo
          cajaId={c.id}
          subtitulo={subtitulo}
          onClose={() => setViendoProductos(false)}
        />
      )}
    </Modal>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
  apagado,
}: {
  etiqueta: string;
  valor: number;
  fuerte?: boolean;
  apagado?: boolean;
}) {
  return (
    <div className={`flex justify-between ${apagado ? "text-texto-4" : "text-texto-2"}`}>
      <dt className={fuerte ? "font-bold text-texto" : ""}>{etiqueta}</dt>
      <dd className={fuerte ? "font-extrabold text-texto" : "font-semibold"}>{fmtMoney(valor)}</dd>
    </div>
  );
}
