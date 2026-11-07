import { useMemo, useState } from "react";
import { Buscador, EncabezadoPagina } from "../components/filtros";
import { Icon } from "../components/Icon";
import { Modal, Vacio } from "../components/ui";
import {
  buscarTutoriales,
  enYoutubeDe,
  miniaturaDe,
  porSeccion,
  reproductorDe,
  TUTORIALES,
  tutorialesDelRubro,
  type Tutorial,
} from "../lib/tutoriales";
import { useAuth } from "../store/AuthContext";

/**
 * Tutoriales (pedido del dueño, 07-nov): los videos de cómo se usa el sistema,
 * en orden y con buscador. Se llega desde "Más opciones", al pie del menú, y
 * la ve cualquiera con sesión: aprender a usar la pantalla no depende de un
 * permiso. Los de un rubro sólo los ve ese rubro (ver `lib/tutoriales`).
 *
 * El video se reproduce acá adentro: mandar a YouTube saca a la recepcionista
 * de la app, y en la app instalada del celular volver no siempre es obvio.
 */
export default function Tutoriales() {
  const { rubro } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [viendo, setViendo] = useState<Tutorial | null>(null);

  const delRubro = useMemo(() => tutorialesDelRubro(rubro, TUTORIALES), [rubro]);
  const secciones = useMemo(() => porSeccion(buscarTutoriales(delRubro, busqueda)), [delRubro, busqueda]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 lg:p-6">
      <EncabezadoPagina titulo="Tutoriales" subtitulo="Videos cortos para aprender a usar el sistema, en orden" />

      {delRubro.length === 0 ? (
        <div className="card">
          <Vacio
            icono="video"
            titulo="Todavía no hay tutoriales"
            texto="Estamos grabando los videos para tu negocio. Cuando estén listos van a aparecer acá."
          />
        </div>
      ) : (
        <>
          {/* El buscador recién tiene sentido con varios videos, pero se deja
              siempre: así no cambia de lugar cuando se suman. */}
          <div className="flex max-w-md">
            <Buscador
              valor={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar un tutorial…"
              etiqueta="Buscar tutoriales"
            />
          </div>

          {secciones.length === 0 ? (
            <div className="card">
              <Vacio
                icono="search"
                titulo="No encontramos tutoriales"
                texto={`Ningún video habla de «${busqueda.trim()}». Probá con otra palabra.`}
                accion={
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    className="rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted"
                  >
                    Ver todos los tutoriales
                  </button>
                }
              />
            </div>
          ) : (
            secciones.map((s, i) => (
              <section key={s.seccion} aria-labelledby={`tutoriales-${i}`} className="space-y-2.5">
                <h2 id={`tutoriales-${i}`} className="text-[11px] font-bold uppercase tracking-wider text-texto-3">
                  {s.seccion}
                </h2>
                {/* `grid-cols-1` y no la columna automática: con ella la miniatura
                    (480 px de ancho propio) estiraba la columna y en el
                    celular la tarjeta se salía de la pantalla. */}
                <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {s.tutoriales.map((t, n) => (
                    <li key={t.id}>
                      <TarjetaTutorial tutorial={t} numero={n + 1} onVer={() => setViendo(t)} />
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </>
      )}

      {viendo && <Reproductor tutorial={viendo} onClose={() => setViendo(null)} />}
    </div>
  );
}

/**
 * Un video: la vista previa de YouTube, el número (el orden importa: "Empezar
 * el turno" va antes que "Cerrar la caja"), el título y la descripción. Toda
 * la tarjeta es el botón: en el celular es más fácil acertarle.
 */
function TarjetaTutorial({ tutorial: t, numero, onVer }: { tutorial: Tutorial; numero: number; onVer: () => void }) {
  return (
    <button
      type="button"
      onClick={onVer}
      aria-label={`Ver «${t.titulo}»`}
      className="card group flex h-full w-full flex-col overflow-hidden text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* El fondo gris queda si la miniatura no carga (sin internet): se ve
          el botón de reproducir igual, no un ícono de imagen rota. */}
      <span className="relative block aspect-video w-full overflow-hidden bg-muted">
        <img
          src={miniaturaDe(t.id)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/10 transition-colors group-hover:bg-slate-900/25">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-primary-700 shadow-lg">
            <Icon name="play" size={24} className="ml-1 fill-current" />
          </span>
        </span>
        <span className="absolute left-2.5 top-2.5 rounded-lg bg-slate-900/75 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
          {numero}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 px-4 py-3">
        <span className="text-[15px] font-bold leading-snug text-texto">{t.titulo}</span>
        <span className="text-[13px] leading-relaxed text-texto-3">{t.descripcion}</span>
      </span>
    </button>
  );
}

/** El video dentro de la app, con la salida a YouTube por si se quiere aparte. */
function Reproductor({ tutorial: t, onClose }: { tutorial: Tutorial; onClose: () => void }) {
  return (
    <Modal abierto titulo={t.titulo} onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-3">
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
          {/* `strict-origin-when-cross-origin`: el reproductor de YouTube
              necesita saber desde qué sitio se lo embebe, y sin referer
              muestra un error en vez del video. Sólo viaja el origen. */}
          <iframe
            src={reproductorDe(t.id)}
            title={t.titulo}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <p className="text-sm leading-relaxed text-texto-2">{t.descripcion}</p>
        <a
          href={enYoutubeDe(t.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
        >
          Ver en YouTube
          <Icon name="arrowUpRight" size={15} />
        </a>
      </div>
    </Modal>
  );
}
