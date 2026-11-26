import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Paginacion } from "../../components/Paginacion";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { useTextoDemorado } from "../../lib/academia/useBusquedaEstudiante";
import { apiNutricion } from "../../lib/nutricion/api";
import { conAlt, escribiendo, hayDialogoAbierto, useTeclas } from "../../lib/nutricion/atajos";
import { cambio, conUnidad, empiezaConDigito, fechaLarga, fmtCambio, grado } from "../../lib/nutricion/calculo";
import type { PacienteFila } from "../../lib/nutricion/tipos";
import { useCatalogo } from "../../lib/nutricion/useCatalogo";
import { usePaginado } from "../../lib/paginado";
import { editaNutricion } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import { EncabezadoPagina, LISTA, PaginaAcademia as Pagina, TABLA, Tarjeta } from "../academia/piezas";
import { BuscadorPacientes, ChipGrado, Tecla } from "./piezas";

/**
 * Evaluación · la lista de pacientes (CONTRATO-nutricion-evaluacion-22nov
 * §4.1). En la PC el buscador arranca con el foco (con el dedo, no: `foco.ts`):
 * se escribe el carnet o el nombre y busca solo. `/` o `Ctrl+K` vuelven al
 * buscador, `↑` `↓` recorren y `Enter` abre. «Nuevo paciente» con `Alt+N`. El
 * que se atendió recién queda arriba.
 */
export default function Pacientes() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const edita = editaNutricion(usuario);
  const [params] = useSearchParams();
  const archivados = params.get("archivados") === "1";
  const [q, setQ] = useState("");
  const buscado = useTextoDemorado(q);
  const catalogo = useCatalogo();
  const lista = usePaginado<PacienteFila>(
    (pg) =>
      apiNutricion
        .pacientes({ q: buscado || undefined, archivados, ...pg })
        .then((r) => ({ items: r.items, total: r.total, page: r.pagina, pageSize: r.porPagina })),
    [buscado, archivados],
  );
  const buscador = useRef<HTMLInputElement>(null);
  // La fila marcada con las flechas. Con algo escrito arranca en la primera:
  // `Enter` abre lo que se buscó sin tocar nada más.
  const [marcada, setMarcada] = useState<number | null>(null);
  useEffect(() => setMarcada(buscado && lista.items.length ? 0 : null), [buscado, lista.items]);

  const abrir = (p: PacienteFila) => navigate(`/evaluacion/${p.id}`);
  const nuevo = (texto = "") => {
    const t = texto.trim();
    // Lo que empieza con un número es un carnet («1112223 LP»): va al Carnet, no al Nombre.
    const qs = !t ? "" : empiezaConDigito(t) ? `?ci=${encodeURIComponent(t)}` : `?nombre=${encodeURIComponent(t)}`;
    navigate(`/evaluacion/nuevo${qs}`);
  };

  useTeclas((e) => {
    if (hayDialogoAbierto()) return;
    if (edita && conAlt(e, "n")) {
      e.preventDefault();
      nuevo();
      return;
    }
    const enBuscador = e.target === buscador.current;
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      buscador.current?.focus();
      buscador.current?.select();
      return;
    }
    if (e.key === "/" && !escribiendo(e.target)) {
      e.preventDefault();
      buscador.current?.focus();
      buscador.current?.select();
      return;
    }
    // Las flechas y Enter: desde el buscador o sin estar escribiendo en otro lado.
    if (!enBuscador && escribiendo(e.target)) return;
    const n = lista.items.length;
    // Nadie con ese nombre: `Enter` en el buscador abre el alta con lo escrito.
    if (!n) {
      if (e.key === "Enter" && enBuscador && edita && !archivados && buscado && !lista.cargando && q.trim() === buscado) {
        e.preventDefault();
        nuevo(buscado);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcada((m) => (m == null ? 0 : Math.min(n - 1, m + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcada((m) => (m == null ? n - 1 : Math.max(0, m - 1)));
    } else if (e.key === "Enter" && marcada != null && (enBuscador || !(e.target as HTMLElement)?.closest?.("a,button"))) {
      e.preventDefault();
      abrir(lista.items[marcada]);
    }
  });

  // La fila marcada siempre a la vista.
  useEffect(() => {
    if (marcada == null) return;
    document.querySelector(`[data-fila-paciente="${marcada}"]`)?.scrollIntoView({ block: "nearest" });
  }, [marcada]);

  const sinResultados = !lista.cargando && !lista.error && lista.items.length === 0;
  const total = lista.total;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={archivados ? "Pacientes archivados" : "Evaluación"}
        bajada={archivados ? "No salen en la lista; sus evaluaciones siguen guardadas." : "Pacientes, su evaluación y sus controles"}
        volver={archivados ? { a: "/evaluacion", texto: "Pacientes" } : undefined}
        acciones={
          edita && !archivados ? (
            <Boton icono="plus" onClick={() => nuevo()} title="Nuevo paciente (Alt+N)">
              Nuevo paciente
              <Tecla sobreColor>Alt+N</Tecla>
            </Boton>
          ) : undefined
        }
      />

      {/* El buscador grande, con el foco puesto al entrar en la PC. */}
      <BuscadorPacientes ref={buscador} valor={q} onCambiar={setQ} />

      <Tarjeta
        etiqueta={archivados ? "Pacientes archivados" : "Lista de pacientes"}
        sinRelleno
        titulo={
          buscado ? (
            <>
              Resultados <span className="font-normal text-texto-3">para «{buscado}»</span>
            </>
          ) : archivados ? (
            "Archivados"
          ) : (
            "Pacientes"
          )
        }
        contador={lista.cargando && !lista.items.length ? undefined : total}
        acciones={
          <Link
            to={archivados ? "/evaluacion" : "/evaluacion?archivados=1"}
            onClick={() => setQ("")}
            className="text-[13px] font-semibold text-texto-3 underline-offset-2 hover:text-primary-700 hover:underline"
          >
            {archivados ? "Ver los activos" : "Ver archivados"}
          </Link>
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
            titulo={`No hay nadie con «${buscado}»`}
            texto={archivados ? "Probá en la lista de los activos." : "Revisá cómo se escribe, o registralo ahora."}
            accion={
              edita && !archivados ? (
                <Boton icono="plus" onClick={() => nuevo(buscado)}>
                  Crear paciente «{buscado}»
                </Boton>
              ) : undefined
            }
          />
        ) : sinResultados ? (
          archivados ? (
            <Vacio icono="archive" titulo="No hay pacientes archivados" />
          ) : (
            <Vacio
              icono="evaluacion"
              titulo="Todavía no hay pacientes"
              texto="Cada paciente tiene su ficha de evaluación inicial y sus controles con fecha."
              accion={
                edita ? (
                  <Boton icono="plus" onClick={() => nuevo()}>
                    Registrar el primer paciente
                  </Boton>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <ListaPacientes
              filas={lista.items}
              marcada={marcada}
              onAbrir={abrir}
              nombreGrado={(g) => grado(catalogo.datos, "imc", g)}
            />
            <div className="border-t border-borde-soft px-4 py-3 empty:hidden sm:px-5">
              <Paginacion {...lista.paginacion} />
            </div>
          </>
        )}
      </Tarjeta>
    </Pagina>
  );
}

/** «82,4 kg · −3,7 kg»: el peso de hoy y lo que cambió desde el primer control. */
function PesoConCambio({ p }: { p: PacienteFila }) {
  if (p.pesoActual == null) return <span className="text-texto-4">—</span>;
  const d = cambio(p.pesoActual, p.pesoInicial);
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="font-semibold text-texto">{conUnidad(p.pesoActual, "kg", 2)}</span>
      {d != null && d !== 0 && <span className="text-texto-3"> · {fmtCambio(d)}&nbsp;kg</span>}
    </span>
  );
}

const edadTexto = (p: PacienteFila) => (p.edad != null ? `${p.edad} años` : "—");

function ListaPacientes({
  filas,
  marcada,
  onAbrir,
  nombreGrado,
}: {
  filas: PacienteFila[];
  marcada: number | null;
  onAbrir: (p: PacienteFila) => void;
  nombreGrado: (g: string | null) => ReturnType<typeof grado>;
}) {
  return (
    <>
      <div className={`hidden md:block ${TABLA.envoltura}`}>
        <table className={TABLA.tabla}>
          <thead>
            <tr className={TABLA.encabezado}>
              <th scope="col" className={TABLA.th}>
                Paciente
              </th>
              <th scope="col" className={TABLA.th}>
                Carnet
              </th>
              <th scope="col" className={TABLA.th}>
                Edad
              </th>
              <th scope="col" className={TABLA.th}>
                Último control
              </th>
              <th scope="col" className={TABLA.th}>
                Peso
              </th>
              <th scope="col" className={TABLA.th}>
                IMC
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p, i) => {
              const g = nombreGrado(p.imcGrado);
              return (
                <tr
                  key={p.id}
                  data-fila-paciente={i}
                  aria-selected={i === marcada}
                  onClick={() => onAbrir(p)}
                  className={`${TABLA.fila} cursor-pointer ${i === marcada ? "bg-primary-50 hover:bg-primary-50" : ""}`}
                >
                  <td className={`${TABLA.td} max-w-[320px]`}>
                    {/* El enlace es el camino del teclado y del lector de pantalla. */}
                    <Link
                      to={`/evaluacion/${p.id}`}
                      className="block break-words font-semibold text-texto hover:text-primary-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.nombre}
                    </Link>
                    {p.controles > 0 && (
                      <span className="text-[12px] text-texto-3">
                        {p.controles} {p.controles === 1 ? "control" : "controles"}
                      </span>
                    )}
                  </td>
                  <td className={`${TABLA.td} whitespace-nowrap tabular-nums text-texto-2`}>{p.ci || "—"}</td>
                  <td className={`${TABLA.td} whitespace-nowrap text-texto-2`}>{edadTexto(p)}</td>
                  <td className={`${TABLA.td} whitespace-nowrap tabular-nums text-texto-2`}>{p.ultimoControl ? fechaLarga(p.ultimoControl) : "—"}</td>
                  <td className={TABLA.td}>
                    <PesoConCambio p={p} />
                  </td>
                  <td className={TABLA.td}>
                    {p.imc != null || g ? (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {p.imc != null && <span className="tabular-nums text-texto-2">{conUnidad(p.imc, "")}</span>}
                        <ChipGrado rango={g} />
                      </span>
                    ) : (
                      <span className="text-texto-4">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className={`${LISTA.lista} md:hidden`}>
        {filas.map((p, i) => {
          const g = nombreGrado(p.imcGrado);
          return (
            <li key={p.id} data-fila-paciente={i}>
              <button
                type="button"
                onClick={() => onAbrir(p)}
                className={`flex w-full items-center gap-3 text-left ${LISTA.itemHover} ${i === marcada ? "bg-primary-50" : ""}`}
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block break-words text-[15px] font-semibold leading-snug text-texto">{p.nombre}</span>
                  <span className="block text-[13px] text-texto-3">
                    {[p.ci ? `CI ${p.ci}` : null, p.edad != null ? edadTexto(p) : null, p.ultimoControl ? `último ${fechaLarga(p.ultimoControl)}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Sin controles"}
                  </span>
                  {(p.pesoActual != null || g) && (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      {p.pesoActual != null && <PesoConCambio p={p} />}
                      <ChipGrado rango={g} />
                    </span>
                  )}
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-3">
                  <Icon name="chevronRight" size={16} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
