import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../../components/ui";
import { fechaLarga } from "../../../lib/nutricion/calculo";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import { haceDias, textoPendiente, textoUltimoPago } from "../../../lib/nutricion/seguimiento/formato";
import type { PacienteDeLosPagos } from "../../../lib/nutricion/seguimiento/tipos";
import { useCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { RUTA_SEGUIMIENTO } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { BotonIcono, EncabezadoPagina, PaginaAcademia as Pagina, Tarjeta } from "../../academia/piezas";
import DialogoAjustesSeguimiento from "./AjustesSeguimiento";

/**
 * Pagos pendientes (CONTRATO-nutricion-seguimiento-23nov §4.1 bis): quiénes
 * deben el pago de algún mes (primero el que debe desde hace más) y a quiénes
 * les toca pagar en su próxima visita. Es sólo de lectura: el pago se anota en
 * la hoja del paciente, que se abre tocando el renglón. En el celular, tarjetas.
 */
export default function PagosPendientes() {
  const navigate = useNavigate();
  const catalogo = useCatalogoSeguimiento();
  const pagos = useApi(() => apiSeguimiento.pagosPendientes(), []);
  const [ajustando, setAjustando] = useState(false);
  const ajustes = catalogo.datos?.ajustes;
  const abrir = (id: number) => navigate(`${RUTA_SEGUIMIENTO}/${id}`);
  const d = pagos.datos;

  const botonAjustes = ajustes?.puedeCambiarlos ? (
    <BotonIcono icono="settings" etiqueta="Ajustes del seguimiento" onClick={() => setAjustando(true)} className="sm:h-[42px] sm:w-[42px]" />
  ) : undefined;

  return (
    <Pagina>
      <EncabezadoPagina
        volver={{ a: RUTA_SEGUIMIENTO, texto: "Seguimiento" }}
        titulo="Pagos pendientes"
        bajada="Sólo se anotan en la hoja de cada paciente: no entran a la caja."
        acciones={botonAjustes}
      />

      {pagos.error && !d ? (
        <ErrorMsg onReintentar={pagos.recargar}>{pagos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : !d.avisarPagos ? (
        <Tarjeta etiqueta="Avisos de pago">
          <Vacio
            icono="bell"
            titulo="Los avisos de pago están apagados."
            accion={
              ajustes?.puedeCambiarlos ? (
                <Boton icono="settings" variante="ghost" onClick={() => setAjustando(true)}>
                  Ajustes
                </Boton>
              ) : undefined
            }
          />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta titulo="Falta pagar" contador={d.deben.length} sinRelleno>
            {d.deben.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-texto-3 sm:px-5">Nadie debe un pago.</p>
            ) : (
              <ul className="divide-y divide-borde-soft">
                {d.deben.map((x) => (
                  <Renglon
                    key={x.tratamiento.id}
                    paciente={x.paciente}
                    onAbrir={() => abrir(x.paciente.id)}
                    medio={
                      <>
                        <span className="block text-texto-2">
                          {x.tratamiento.nombre} · va en la semana {x.tratamiento.semana}
                        </span>
                        {x.pendientes.map((pp) => (
                          <span key={pp.mes} className="mt-0.5 flex items-start gap-1.5 font-semibold text-danger-text">
                            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                            {textoPendiente(pp)}
                          </span>
                        ))}
                      </>
                    }
                    ultimoPago={textoUltimoPago(x.ultimoPago)}
                    sinPago={!x.ultimoPago}
                  />
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Les toca pagar en su próxima visita" contador={d.proximos.length} sinRelleno>
            {d.proximos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-texto-3 sm:px-5">A nadie le toca pagar en su próxima visita.</p>
            ) : (
              <ul className="divide-y divide-borde-soft">
                {d.proximos.map((x) => (
                  <Renglon
                    key={x.tratamiento.id}
                    paciente={x.paciente}
                    onAbrir={() => abrir(x.paciente.id)}
                    medio={
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-yellow-100 px-2 py-0.5 font-semibold text-yellow-900">
                          Semana {x.proximoPago.semana}
                        </span>
                        {x.tratamiento.ultimaFecha && (
                          <span className="mt-0.5 block text-texto-2">
                            Última visita: {fechaLarga(x.tratamiento.ultimaFecha)} ({haceDias(x.tratamiento.ultimaFecha)})
                          </span>
                        )}
                      </>
                    }
                    ultimoPago={textoUltimoPago(x.ultimoPago)}
                    sinPago={!x.ultimoPago}
                  />
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {ajustando && ajustes && (
        <DialogoAjustesSeguimiento
          ajustes={ajustes}
          onCerrar={() => setAjustando(false)}
          onGuardado={() => {
            setAjustando(false);
            catalogo.recargar();
            pagos.recargar();
          }}
        />
      )}
    </Pagina>
  );
}

/**
 * Un renglón: quién (nombre, carnet y teléfono para llamar), qué debe o qué le
 * toca, y el último pago. En la PC, tres columnas; en el celular, una tarjeta.
 * Tocarlo abre la hoja del paciente (el nombre es el enlace del teclado).
 */
function Renglon({
  paciente,
  medio,
  ultimoPago,
  sinPago,
  onAbrir,
}: {
  paciente: PacienteDeLosPagos;
  medio: ReactNode;
  /** Uno o dos renglones: «El mes 1 pagó Bs 600» y «Último pago: el 21/11/2026» (§8.2). */
  ultimoPago: string[];
  sinPago: boolean;
  onAbrir: () => void;
}) {
  return (
    <li onClick={onAbrir} className="cursor-pointer px-4 py-3 text-[13px] transition-colors hover:bg-muted sm:px-5">
      <div className="grid gap-x-5 gap-y-1.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1fr)] md:items-start">
        <div className="min-w-0">
          <Link
            to={`${RUTA_SEGUIMIENTO}/${paciente.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block break-words text-[15px] font-semibold text-texto hover:text-primary-700"
          >
            {paciente.nombre}
          </Link>
          <span className="flex flex-wrap items-center gap-x-2 text-texto-3">
            {paciente.ci && <span className="tabular-nums">CI {paciente.ci}</span>}
            {paciente.telefono && (
              <a
                href={`tel:${paciente.telefono.replace(/\s+/g, "")}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex min-h-11 items-center gap-1 font-semibold tabular-nums text-primary-700 hover:underline lg:min-h-0"
              >
                <Icon name="phone" size={13} />
                {paciente.telefono}
              </a>
            )}
          </span>
        </div>
        <div className="min-w-0">{medio}</div>
        <div className={`min-w-0 md:text-right ${sinPago ? "font-semibold text-texto-3" : "text-texto-3"}`}>
          {ultimoPago.map((renglon, i) => (
            <span key={i} className={`block ${i === 0 && ultimoPago.length > 1 ? "font-semibold text-texto-2" : ""}`}>
              {renglon}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
