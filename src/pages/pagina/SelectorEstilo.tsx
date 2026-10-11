import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Boton, Modal } from "../../components/ui";
import { cargarFuentesEstilos } from "../../lib/pagina/estilos";
import { ESTILOS_PAGINA, estiloPagina, estiloRecomendado } from "../../lib/pagina/estilosPagina";
import type { ClaveEstilo, PaginaPublica } from "../../lib/pagina/tipos";
import { FilaEleccion } from "./EstilosPagina";
import VistaPagina from "./VistaPagina";

/**
 * El estilo de la página en "Mi página" (IDEAS/5 §4.6, aprobado el 09-oct):
 * una fila con la miniatura de la página como está y "Cambiar"; el popup
 * muestra los 9 estilos armados con los datos del propio negocio (su logo, su
 * nombre, su color, su portada) y marca el que se le sugiere a su rubro (y a
 * si tiene catálogo: a un restaurante con platos le va Carta).
 * Tocar una miniatura la marca; "Usar este estilo" la confirma y va al
 * borrador, como todo lo de la apariencia.
 */

/** El ancho al que se dibuja la página de una miniatura (el del celular del editor). */
const ANCHO_PAGINA = 320;

function useAncho(inicial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho > 0 ? ancho : inicial] as const;
}

/**
 * El catálogo de una miniatura: sin fotos (no se cargan por cada miniatura).
 * Donde el catálogo es el armado (la lista de Carta, los bloques de Mosaico)
 * van los primeros ítems con su inicial en vez de la foto: sin ellos la
 * miniatura no mostraría qué es el estilo. En el resto, nada.
 */
function catalogoDeMiniatura(pagina: PaginaPublica): PaginaPublica["catalogo"] {
  const cat = pagina.catalogo;
  if (!cat || estiloPagina(pagina.estilo).catalogo.presentacion === "carrusel") return null;
  return { ...cat, items: cat.items.slice(0, 3).map((it) => ({ ...it, fotoUrl: null })) };
}

/**
 * La página de verdad (VistaPagina en modo celular), achicada, quieta y fuera
 * del árbol de accesibilidad: es un dibujo, el nombre lo dice el botón que la
 * contiene.
 */
export function MiniaturaPagina({
  pagina,
  alto,
  ancho,
}: {
  pagina: PaginaPublica;
  /** Fijo, o proporcional al ancho (como una pantalla de celular): "1.45x". */
  alto: number | `${number}x`;
  ancho?: number;
}) {
  const [ref, medido] = useAncho(ancho ?? 150);
  const lado = ancho ?? medido;
  const escala = lado / ANCHO_PAGINA;
  const altoFinal = typeof alto === "number" ? alto : Math.round(lado * parseFloat(alto));
  return (
    <div
      ref={ref}
      aria-hidden="true"
      inert
      style={{
        width: ancho ?? "100%",
        height: altoFinal,
        overflow: "hidden",
        position: "relative",
        pointerEvents: "none",
        borderRadius: 8,
        background: "#ffffff",
      }}
    >
      <div style={{ width: ANCHO_PAGINA, transform: `scale(${escala})`, transformOrigin: "top left" }}>
        <VistaPagina pagina={{ ...pagina, catalogo: catalogoDeMiniatura(pagina) }} urlReservar="#" modo="movil" miniatura />
      </div>
    </div>
  );
}

export default function SelectorEstilo({
  vista,
  rubro,
  onElegir,
}: {
  /** La página como se está editando (con el estilo del borrador). */
  vista: PaginaPublica;
  /** El rubro del negocio (`TipoNegocio`), para marcar el sugerido. */
  rubro: string;
  onElegir: (clave: ClaveEstilo) => void;
}) {
  const actual = estiloPagina(vista.estilo);
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState<ClaveEstilo>(actual.clave);
  const sugerido = estiloRecomendado(rubro, (vista.catalogo?.items.length ?? 0) > 0);
  const elegido = estiloPagina(marcado);

  // Las letras de las 9 miniaturas, recién al abrir (como "Más letras").
  useEffect(() => {
    if (abierto) cargarFuentesEstilos(ESTILOS_PAGINA.map((e) => e.letra));
  }, [abierto]);

  const abrir = () => {
    setMarcado(actual.clave);
    setAbierto(true);
  };

  return (
    <>
      <FilaEleccion
        etiqueta="Estilo"
        resumen={actual.nombre}
        muestra={
          <span className="block overflow-hidden rounded-md" style={{ boxShadow: "0 0 0 1px #E5E7EB" }}>
            <MiniaturaPagina pagina={vista} ancho={44} alto={60} />
          </span>
        }
        onAbrir={abrir}
      />
      <Modal
        abierto={abierto}
        titulo="Estilo de tu página"
        subtitulo="Las miniaturas usan tus datos: tu logo, tu nombre, tu color y tu portada."
        onClose={() => setAbierto(false)}
        ancho="max-w-4xl"
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton
              onClick={() => {
                setAbierto(false);
                if (marcado !== actual.clave) onElegir(marcado);
              }}
            >
              Usar este estilo
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Estilos de la página" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ESTILOS_PAGINA.map((e) => {
              const esMarcado = e.clave === marcado;
              const recomendado = e.clave === sugerido;
              // Cada miniatura con la letra y los botones que trae el estilo:
              // es como va a quedar al elegirlo.
              const pagina: PaginaPublica = { ...vista, estilo: e.clave, tipografia: e.letra, formaBotones: e.forma };
              return (
                <button
                  key={e.clave}
                  type="button"
                  role="radio"
                  aria-checked={esMarcado}
                  aria-label={`${e.nombre}${recomendado ? " (recomendado para tu rubro)" : ""}`}
                  onClick={() => setMarcado(e.clave)}
                  className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted p-1.5 text-left"
                  style={{
                    border: esMarcado ? "2px solid #1F2937" : "2px solid transparent",
                  }}
                >
                  <MiniaturaPagina pagina={pagina} alto="1.45x" />
                  <span className="flex flex-wrap items-center gap-1.5 px-1">
                    <strong className="text-[13.5px] text-texto">{e.nombre}</strong>
                    {recomendado && (
                      <span className="rounded-full border border-emerald-700 px-2 py-px text-[11px] font-semibold text-emerald-800">
                        Recomendado
                      </span>
                    )}
                  </span>
                  <span className="px-1 pb-1 text-[12px] leading-snug text-texto-3">{e.linea}</span>
                </button>
              );
            })}
          </div>
          {elegido.pideFoto && !vista.portadaUrl && (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Vitrina luce con una foto de portada.</strong> Sin foto, arriba va un bloque de tu color. Podés subirla
              en «Foto de portada».
            </p>
          )}
          {elegido.pideCatalogo && !vista.catalogo?.items.length && (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Carta luce con tu catálogo.</strong> Sin productos se ven tus botones y tus sucursales. Podés cargarlos
              en «Catálogo».
            </p>
          )}
          <p className="rounded-xl bg-muted p-3 text-[13px] text-texto-2">
            Al cambiar de estilo se conserva tu color. La letra y los botones pasan a los que mejor van con el estilo; si
            preferís los tuyos, después podés volver a ellos con «Mantener los míos».
          </p>
        </div>
      </Modal>
    </>
  );
}
