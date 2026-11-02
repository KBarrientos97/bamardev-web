import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  RAMAS,
  buscar,
  deRama,
  enlaceWhatsapp,
  partesConNegrita,
  respuestasVisibles,
  type Bloque,
  type Rama,
  type Respuesta,
} from "../../lib/ayuda/ayuda";
import { RESPUESTAS } from "../../lib/ayuda/respuestas";
import { etiquetaRol } from "../../lib/permisos";
import { ayudaDeReporte } from "../../pages/reportes/ayuda";
import { gruposVisibles } from "../../pages/reportes/catalogo";
import { useAuth } from "../../store/AuthContext";
import { Icon } from "../Icon";
import { Boton, Modal } from "../ui";

/**
 * El panel de la Ayuda (IDEAS/11 §0): un menú de botones —la mayoría llega a
 * su respuesta en dos o tres toques, sin saber cómo preguntar— con un buscador
 * arriba para el que prefiere escribir. Lo que no está, a WhatsApp con el
 * mensaje ya armado.
 *
 * La rama Reportes no se escribe a mano: sale del catálogo de Reportes y de su
 * "Cómo se calcula" (`reportes/ayuda.ts`), que un test obliga a mantener. Así
 * explica todos los reportes de todos los rubros desde el primer día.
 */

type Vista =
  | { tipo: "inicio" }
  | { tipo: "rama"; rama: Rama }
  | { tipo: "respuesta"; id: string }
  | { tipo: "reportes" }
  | { tipo: "reporte"; id: string; titulo: string };

const INICIO: Vista = { tipo: "inicio" };

export default function PanelAyuda({ abierto, onClose }: { abierto: boolean; onClose: () => void }) {
  const { rubro, negocio, usuario, puede, incluye } = useAuth();
  const navigate = useNavigate();
  const [pila, setPila] = useState<Vista[]>([INICIO]);
  const [texto, setTexto] = useState("");
  const vista = pila[pila.length - 1];

  const grupos = useMemo(
    () => gruposVisibles({ rubro, features: negocio?.features, permisos: usuario?.permisos, puede, incluye }),
    [rubro, negocio?.features, usuario?.permisos, puede, incluye],
  );
  const visibles = useMemo(() => {
    const reportesVisibles = new Set(grupos.flatMap((g) => g.fichas.map((f) => f.id)));
    return respuestasVisibles(RESPUESTAS, { rubro, puede, reportesVisibles });
  }, [grupos, rubro, puede]);
  const resultados = useMemo(() => buscar(texto, visibles), [texto, visibles]);
  // El Resumen no es una ficha del catálogo: lo ve quien tiene el permiso general.
  const conResumen = puede("reportes");
  const hayReportes = conResumen || grupos.length > 0;

  const ir = (v: Vista) => setPila((p) => [...p, v]);
  const volver = () => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p));
  const cerrar = () => {
    setPila([INICIO]);
    setTexto("");
    onClose();
  };
  const llevar = (ruta: string) => {
    cerrar();
    navigate(ruta);
  };

  const donde = (() => {
    if (vista.tipo === "rama") return RAMAS.find((r) => r.id === vista.rama)?.titulo;
    if (vista.tipo === "respuesta") return RESPUESTAS.find((r) => r.id === vista.id)?.titulo;
    if (vista.tipo === "reportes") return "Reportes";
    if (vista.tipo === "reporte") return `Reportes → ${vista.titulo}`;
    return undefined;
  })();
  const whatsapp = enlaceWhatsapp({
    negocio: negocio?.nombre,
    alias: negocio?.alias,
    rol: usuario ? usuario.rolNombre?.trim() || etiquetaRol(usuario.rol, negocio) : undefined,
    donde,
    busco: vista.tipo === "inicio" && texto.trim() ? texto.trim() : undefined,
  });

  const ramasConContenido = RAMAS.filter((r) => (r.id === "reportes" ? hayReportes : deRama(visibles, r.id).length > 0));

  let contenido: ReactNode;
  if (vista.tipo === "inicio") {
    contenido = (
      <div className="space-y-4">
        <label className="relative block">
          <span className="sr-only">Escribí tu duda</span>
          <Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí tu duda, por ejemplo: me sobró plata"
            className="w-full rounded-xl border border-borde bg-white py-2.5 pl-9 pr-3 text-sm text-texto outline-none focus:border-primary"
          />
        </label>
        {texto.trim() ? (
          resultados.length > 0 ? (
            <ListaRespuestas respuestas={resultados} onElegir={(r) => ir({ tipo: "respuesta", id: r.id })} />
          ) : (
            <p className="text-sm text-texto-2">
              No encontré una respuesta para eso. Probá con otras palabras, buscala en los botones de abajo o
              escribinos por WhatsApp.
            </p>
          )
        ) : null}
        <div>
          <p className="mb-2 text-[13px] font-semibold text-texto-3">¿Sobre qué es tu duda?</p>
          <div className="grid grid-cols-2 gap-2">
            {ramasConContenido.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => ir(r.id === "reportes" ? { tipo: "reportes" } : { tipo: "rama", rama: r.id })}
                className="flex items-center gap-2 rounded-xl border border-borde bg-white px-3 py-3 text-left text-sm font-semibold text-texto transition-colors hover:bg-muted"
              >
                <Icon name={r.icono} size={18} className="shrink-0 text-primary" />
                <span>{r.titulo}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (vista.tipo === "rama") {
    contenido = <ListaRespuestas respuestas={deRama(visibles, vista.rama)} onElegir={(r) => ir({ tipo: "respuesta", id: r.id })} />;
  } else if (vista.tipo === "reportes") {
    const atajos = deRama(visibles, "reportes");
    contenido = (
      <div className="space-y-4">
        {atajos.length > 0 && <ListaRespuestas respuestas={atajos} onElegir={(r) => ir({ tipo: "respuesta", id: r.id })} />}
        <div>
          <p className="mb-2 text-[13px] font-semibold text-texto-3">¿Para qué sirve cada reporte?</p>
          <div className="space-y-3">
            {conResumen && (
              <FilaReporte titulo="Resumen" descripcion="Lo más importante del período" onClick={() => ir({ tipo: "reporte", id: "resumen", titulo: "Resumen" })} />
            )}
            {grupos.map((g) => (
              <div key={g.id}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-texto-3">{g.titulo}</p>
                <div className="space-y-1.5">
                  {g.fichas.map((f) => (
                    <FilaReporte
                      key={f.id}
                      titulo={f.titulo}
                      descripcion={f.descripcion}
                      onClick={() => ir({ tipo: "reporte", id: f.id, titulo: f.titulo })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (vista.tipo === "reporte") {
    const ayuda = ayudaDeReporte(vista.id, rubro);
    contenido = (
      <div className="space-y-3 text-sm text-texto-2">
        <h3 className="text-base font-bold text-texto">{vista.titulo}</h3>
        {ayuda ? (
          <>
            <p>{ayuda.queMuestra}</p>
            <p>{ayuda.deDonde}</p>
            {ayuda.incluye && ayuda.incluye.length > 0 && <Puntos titulo="Incluye" items={ayuda.incluye} />}
            {ayuda.noIncluye && ayuda.noIncluye.length > 0 && <Puntos titulo="No incluye" items={ayuda.noIncluye} />}
          </>
        ) : (
          <p>Este reporte todavía no tiene su explicación.</p>
        )}
        <Boton icono="arrowRight" onClick={() => llevar(vista.id === "resumen" ? "/reportes" : `/reportes/${vista.id}`)}>
          Abrir reporte
        </Boton>
      </div>
    );
  } else {
    const r = RESPUESTAS.find((x) => x.id === vista.id);
    contenido = r ? (
      <DetalleRespuesta
        respuesta={r}
        relacionados={r.relacionados.map((id) => visibles.find((x) => x.id === id)).filter((x): x is Respuesta => !!x)}
        onRelacionado={(x) => ir({ tipo: "respuesta", id: x.id })}
        onLlevar={llevar}
      />
    ) : null;
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Ayuda"
      subtitulo={donde}
      onClose={cerrar}
      ancho="max-w-md"
      acciones={
        <>
          {pila.length > 1 && (
            <button
              type="button"
              onClick={volver}
              className="mr-auto inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-texto-2 hover:bg-white"
            >
              <Icon name="chevronLeft" size={16} />
              Volver
            </button>
          )}
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3.5 py-2 text-sm font-semibold text-texto hover:bg-muted"
          >
            <Icon name="phone" size={16} />
            Escribir a soporte
          </a>
        </>
      }
    >
      {contenido}
    </Modal>
  );
}

function ListaRespuestas({ respuestas, onElegir }: { respuestas: Respuesta[]; onElegir: (r: Respuesta) => void }) {
  return (
    <ul className="space-y-1.5">
      {respuestas.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onElegir(r)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-borde bg-white px-3 py-2.5 text-left text-sm font-semibold text-texto transition-colors hover:bg-muted"
          >
            <span>{r.titulo}</span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-texto-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FilaReporte({ titulo, descripcion, onClick }: { titulo: string; descripcion: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-borde bg-white px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">{titulo}</span>
        <span className="block text-[12px] text-texto-3">{descripcion}</span>
      </span>
      <Icon name="chevronRight" size={16} className="shrink-0 text-texto-3" />
    </button>
  );
}

function Puntos({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <p className="font-semibold text-texto">{titulo}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** El texto con los rótulos de la pantalla en negrita. */
function ConNegritas({ texto }: { texto: string }) {
  return (
    <>
      {partesConNegrita(texto).map((p, i) =>
        p.negrita ? (
          <strong key={i} className="font-semibold text-texto">
            {p.texto}
          </strong>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

function Cuerpo({ bloques }: { bloques: Bloque[] }) {
  return (
    <>
      {bloques.map((b, i) =>
        b.tipo === "texto" ? (
          <p key={i}>
            <ConNegritas texto={b.texto} />
          </p>
        ) : b.tipo === "pasos" ? (
          <ol key={i} className="list-decimal space-y-1.5 pl-5">
            {b.items.map((x, j) => (
              <li key={j}>
                <ConNegritas texto={x} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1.5 pl-5">
            {b.items.map((x, j) => (
              <li key={j}>
                <ConNegritas texto={x} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

function DetalleRespuesta({
  respuesta: r,
  relacionados,
  onRelacionado,
  onLlevar,
}: {
  respuesta: Respuesta;
  relacionados: Respuesta[];
  onRelacionado: (r: Respuesta) => void;
  onLlevar: (ruta: string) => void;
}) {
  return (
    <article className="space-y-3 text-sm leading-relaxed text-texto-2">
      <h3 className="text-base font-bold text-texto">{r.titulo}</h3>
      <Cuerpo bloques={r.cuerpo} />
      {r.importante && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5">
          <strong className="font-semibold text-texto">Importante: </strong>
          <ConNegritas texto={r.importante} />
        </p>
      )}
      {r.siNoAparece && (
        <p>
          <strong className="font-semibold text-texto">Si no te aparece: </strong>
          <ConNegritas texto={r.siNoAparece} />
        </p>
      )}
      {/* Para el dueño que le enseña a la cajera que vende en la app. */}
      {r.celular && (
        <details className="rounded-xl border border-borde px-3.5 py-2.5">
          <summary className="cursor-pointer font-semibold text-texto">En la app del celular</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            {r.celular.map((x, j) => (
              <li key={j}>
                <ConNegritas texto={x} />
              </li>
            ))}
          </ol>
        </details>
      )}
      {r.destino && (
        <Boton icono="arrowRight" onClick={() => onLlevar(r.destino!)}>
          Llevame ahí
        </Boton>
      )}
      {relacionados.length > 0 && (
        <div className="pt-1">
          <p className="mb-1.5 text-[13px] font-semibold text-texto-3">También te puede servir</p>
          <ListaRespuestas respuestas={relacionados} onElegir={onRelacionado} />
        </div>
      )}
    </article>
  );
}
