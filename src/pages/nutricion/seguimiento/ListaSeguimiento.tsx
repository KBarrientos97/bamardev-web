import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Paginacion } from "../../../components/Paginacion";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../../components/ui";
import { useTextoDemorado } from "../../../lib/academia/useBusquedaEstudiante";
import { escribiendo, hayDialogoAbierto, useTeclas } from "../../../lib/nutricion/atajos";
import { conUnidad } from "../../../lib/nutricion/calculo";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import { haceDias, nombreSemana, textoDosis, textoKg } from "../../../lib/nutricion/seguimiento/formato";
import type { FilaSeguimiento } from "../../../lib/nutricion/seguimiento/tipos";
import { useCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { usePaginado } from "../../../lib/paginado";
import { editaNutricion, RUTA_EVALUACION, RUTA_SEGUIMIENTO } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { BotonIcono, ChipsFiltro, EncabezadoPagina, LISTA, PaginaAcademia as Pagina, TABLA, Tarjeta } from "../../academia/piezas";
import { BuscadorPacientes } from "../piezas";
import DialogoAjustesSeguimiento from "./AjustesSeguimiento";
import { ChipPago, ConPuntos } from "./piezas";

type Filtro = "en_tratamiento" | "todos";

/**
 * Seguimiento · buscar al paciente (CONTRATO-nutricion-seguimiento-23nov
 * §4.1). El buscador arranca con el foco: se escribe el carnet o el nombre y
 * busca solo (la misma búsqueda de la Evaluación). Sin texto, los pacientes en
 * tratamiento, el de actividad más reciente arriba. `/` o `Ctrl+K` vuelven al
 * buscador, `↑` `↓` recorren y `Enter` abre (con un solo resultado, directo).
 * Los avisos de pago y el botón «Pagos pendientes», sólo con los avisos prendidos.
 */
export default function ListaSeguimiento() {
  const navigate = useNavigate();
  const { usuario, puede } = useAuth();
  const registraPacientes = editaNutricion(usuario) && puede("nutricion");
  const [q, setQ] = useState("");
  const buscado = useTextoDemorado(q);
  const [filtro, setFiltro] = useState<Filtro>("en_tratamiento");
  const soloEnTratamiento = !buscado && filtro === "en_tratamiento";
  const catalogo = useCatalogoSeguimiento();
  const ajustes = catalogo.datos?.ajustes;
  const avisar = !!ajustes?.avisarPagos;
  const lista = usePaginado<FilaSeguimiento>(
    (pg) =>
      apiSeguimiento
        .pacientes({ q: buscado || undefined, soloEnTratamiento, ...pg })
        .then((r) => ({ items: r.items, total: r.total, page: r.pagina, pageSize: r.porPagina })),
    [buscado, soloEnTratamiento],
  );
  const pagos = useApi(() => (avisar ? apiSeguimiento.pagosPendientes() : Promise.resolve(null)), [avisar]);
  const deben = pagos.datos?.avisarPagos ? pagos.datos.deben.length : 0;
  const [ajustando, setAjustando] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);
  const [marcada, setMarcada] = useState<number | null>(null);
  useEffect(() => setMarcada(buscado && lista.items.length ? 0 : null), [buscado, lista.items]);

  const abrir = (p: FilaSeguimiento) => navigate(`${RUTA_SEGUIMIENTO}/${p.id}`);

  useTeclas((e) => {
    if (hayDialogoAbierto()) return;
    const enBuscador = e.target === buscador.current;
    if (((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !escribiendo(e.target))) {
      e.preventDefault();
      buscador.current?.focus();
      buscador.current?.select();
      return;
    }
    if (!enBuscador && escribiendo(e.target)) return;
    const n = lista.items.length;
    if (!n) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcada((m) => (m == null ? 0 : Math.min(n - 1, m + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcada((m) => (m == null ? n - 1 : Math.max(0, m - 1)));
    } else if (e.key === "Enter" && (enBuscador || !(e.target as HTMLElement)?.closest?.("a,button"))) {
      // Con un solo resultado, `Enter` lo abre aunque no se haya marcado.
      const i = marcada ?? (n === 1 && buscado ? 0 : null);
      if (i == null) return;
      e.preventDefault();
      abrir(lista.items[i]);
    }
  });

  useEffect(() => {
    if (marcada == null) return;
    document.querySelector(`[data-fila-seguimiento="${marcada}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [marcada]);

  const sinResultados = !lista.cargando && !lista.error && lista.items.length === 0;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Seguimiento"
        bajada="El tratamiento de cada paciente, semana a semana"
        acciones={
          ajustes ? (
            <>
              {avisar && (
                <Link
                  to={`${RUTA_SEGUIMIENTO}/pagos`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted sm:min-h-[42px]"
                >
                  <Icon name="coins" size={16} />
                  Pagos pendientes
                  {deben > 0 && (
                    <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold tabular-nums text-white" aria-label={`${deben} deben`}>
                      {deben}
                    </span>
                  )}
                </Link>
              )}
              {ajustes.puedeCambiarlos && <BotonIcono icono="settings" etiqueta="Ajustes del seguimiento" onClick={() => setAjustando(true)} className="sm:h-[42px] sm:w-[42px]" />}
            </>
          ) : undefined
        }
      />

      <BuscadorPacientes ref={buscador} valor={q} onCambiar={setQ} />

      <Tarjeta
        etiqueta="Pacientes del seguimiento"
        sinRelleno
        titulo={
          buscado ? (
            <>
              Resultados <span className="font-normal text-texto-3">para «{buscado}»</span>
            </>
          ) : filtro === "en_tratamiento" ? (
            "En tratamiento"
          ) : (
            "Todos los pacientes"
          )
        }
        contador={lista.cargando && !lista.items.length ? undefined : lista.total}
        barra={
          buscado ? undefined : (
            <div className="py-3 [&_button]:min-h-11 lg:[&_button]:min-h-9">
              <ChipsFiltro<Filtro>
                etiqueta="Qué pacientes ver"
                valor={filtro}
                onChange={setFiltro}
                opciones={[
                  { clave: "en_tratamiento", label: "En tratamiento" },
                  { clave: "todos", label: "Todos" },
                ]}
              />
            </div>
          )
        }
      >
        {lista.error && !lista.items.length ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          </div>
        ) : lista.cargando && !lista.items.length ? (
          <Cargando />
        ) : sinResultados && buscado ? (
          <Vacio
            icono="search"
            titulo={`No hay ningún paciente con «${buscado}».`}
            texto="Los pacientes se registran primero en Evaluación."
            accion={
              registraPacientes ? (
                <Boton icono="evaluacion" onClick={() => navigate(RUTA_EVALUACION)}>
                  Ir a Evaluación
                </Boton>
              ) : undefined
            }
          />
        ) : sinResultados && soloEnTratamiento ? (
          <Vacio icono="seguimiento" titulo="Todavía no hay pacientes en tratamiento." texto="Buscá al paciente por su carnet o su nombre para iniciar el suyo." />
        ) : sinResultados ? (
          <Vacio
            icono="users"
            titulo="Todavía no hay pacientes."
            texto="Los pacientes se registran primero en Evaluación."
            accion={
              registraPacientes ? (
                <Boton icono="evaluacion" onClick={() => navigate(RUTA_EVALUACION)}>
                  Ir a Evaluación
                </Boton>
              ) : undefined
            }
          />
        ) : (
          <>
            <Filas filas={lista.items} marcada={marcada} avisar={avisar} onAbrir={abrir} />
            <div className="border-t border-borde-soft px-4 py-3 empty:hidden sm:px-5">
              <Paginacion {...lista.paginacion} />
            </div>
          </>
        )}
      </Tarjeta>

      {ajustando && ajustes && (
        <DialogoAjustesSeguimiento
          ajustes={ajustes}
          onCerrar={() => setAjustando(false)}
          onGuardado={() => {
            setAjustando(false);
            catalogo.recargar();
            lista.recargar();
            pagos.recargar();
          }}
        />
      )}
    </Pagina>
  );
}

/**
 * «Tirzepatida · Semana 6 · 17 UI»; sin tratamiento, «Sin tratamiento» (y los
 * anteriores, si tiene). Cada parte entera: si no entra, baja la parte, no
 * media («Semana» arriba y «6» abajo), sin el «·» colgando (`ConPuntos`): a
 * 768 quedaba «Tirzepatida · Semana 13 ·» y abajo «10 mg» solo.
 */
function TextoTratamiento({ p }: { p: FilaSeguimiento }) {
  const t = p.tratamiento;
  const partes = !t
    ? ["Sin tratamiento", ...(p.anteriores ? [`${p.anteriores} ${p.anteriores === 1 ? "anterior" : "anteriores"}`] : [])]
    : [t.nombre, nombreSemana(t.semana), ...(t.dosisActual ? [textoDosis(t.dosisActual).anotado] : [])];
  return <ConPuntos partes={partes} />;
}

/** «121,8 kg · bajó 7,2 kg» (con palabras, no sólo con la flecha y el color). */
function Peso({ p }: { p: FilaSeguimiento }) {
  const t = p.tratamiento;
  if (!t || t.pesoActual == null) return <span className="text-texto-4">—</span>;
  const kg = textoKg(t.kgBajados);
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="font-semibold text-texto">{conUnidad(t.pesoActual, "kg", 2)}</span>
      {kg && kg.tono !== "igual" && (
        <span className={kg.tono === "subio" ? "text-danger-text" : "text-primary-700"}> · {kg.texto.toLowerCase()}&nbsp;kg</span>
      )}
    </span>
  );
}

function Avisos({ p, avisar }: { p: FilaSeguimiento; avisar: boolean }) {
  if (!avisar || !p.tratamiento) return null;
  return <ChipPago debe={p.tratamiento.pagosPendientes} tocaPago={p.tratamiento.proximoPago} />;
}

function Filas({ filas, marcada, avisar, onAbrir }: { filas: FilaSeguimiento[]; marcada: number | null; avisar: boolean; onAbrir: (p: FilaSeguimiento) => void }) {
  return (
    <>
      <div className={`hidden md:block ${TABLA.envoltura}`}>
        <table className={TABLA.tabla}>
          <thead>
            <tr className={TABLA.encabezado}>
              <th scope="col" className={TABLA.th}>
                Paciente
              </th>
              <th scope="col" className={`${TABLA.th} hidden xl:table-cell`}>
                Carnet
              </th>
              <th scope="col" className={TABLA.th}>
                Tratamiento
              </th>
              <th scope="col" className={TABLA.th}>
                Peso
              </th>
              <th scope="col" className={`${TABLA.th} whitespace-nowrap`}>
                Última visita
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p, i) => (
              <tr
                key={p.id}
                data-fila-seguimiento={i}
                aria-selected={i === marcada}
                onClick={() => onAbrir(p)}
                className={`${TABLA.fila} cursor-pointer ${i === marcada ? "bg-primary-50 hover:bg-primary-50" : ""}`}
              >
                <td className={`${TABLA.td} max-w-[300px]`}>
                  {/* Un ancho mínimo para el nombre: a 1024 con el menú abierto, un tratamiento largo
                      («Semaglutida magistral · …») le comía el lugar y «Paciente de prueba / 40» se partía. */}
                  <Link
                    to={`${RUTA_SEGUIMIENTO}/${p.id}`}
                    className="block min-w-[11rem] break-words font-semibold text-texto hover:text-primary-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.nombre}
                  </Link>
                  {/* En la tablet el carnet va debajo del nombre: la columna del tratamiento necesita el lugar. */}
                  {p.ci && <span className="block text-[12px] tabular-nums text-texto-3 xl:hidden">CI {p.ci}</span>}
                  <Avisos p={p} avisar={avisar} />
                </td>
                <td className={`${TABLA.td} hidden whitespace-nowrap tabular-nums text-texto-2 xl:table-cell`}>{p.ci || "—"}</td>
                <td className={`${TABLA.td} text-texto-2 ${p.tratamiento ? "" : "text-texto-4"}`}>
                  <TextoTratamiento p={p} />
                </td>
                <td className={TABLA.td}>
                  <Peso p={p} />
                </td>
                <td className={`${TABLA.td} whitespace-nowrap text-texto-2`}>{p.tratamiento?.ultimaFecha ? haceDias(p.tratamiento.ultimaFecha) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={`${LISTA.lista} md:hidden`}>
        {filas.map((p, i) => (
          <li key={p.id} data-fila-seguimiento={i}>
            <button
              type="button"
              onClick={() => onAbrir(p)}
              className={`flex w-full items-center gap-3 text-left ${LISTA.itemHover} ${i === marcada ? "bg-primary-50" : ""}`}
            >
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-[15px] font-semibold leading-snug text-texto">{p.nombre}</span>
                  <Avisos p={p} avisar={avisar} />
                </span>
                <span className="block text-[13px] text-texto-3">
                  {[p.ci ? `CI ${p.ci}` : null, p.tratamiento?.ultimaFecha ? haceDias(p.tratamiento.ultimaFecha) : null].filter(Boolean).join(" · ") || "Sin carnet"}
                </span>
                <span className={`block text-[13px] ${p.tratamiento ? "text-texto-2" : "text-texto-4"}`}>
                  <TextoTratamiento p={p} />
                </span>
                {p.tratamiento?.pesoActual != null && (
                  <span className="block text-[13px]">
                    <Peso p={p} />
                  </span>
                )}
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-3">
                <Icon name="chevronRight" size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
