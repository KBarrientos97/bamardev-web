import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { NOMBRE_FOTO, prepararFoto } from "../../lib/academia/fotos";
import { fechaCorta } from "../../lib/academia/formato";
import { TIPOS_FOTO, type FotoAlumno, type TipoFoto } from "../../lib/academia/tipos";
import PedirMotivo from "../agenda/PedirMotivo";

const MOTIVOS_OBSERVACION = ["La foto no se ve bien", "El carnet no coincide", "Falta un lado del carnet", "Otro"] as const;

/**
 * Las fotos y el carnet en la ficha (E6, D7). La imagen sólo la ve quien
 * tiene `academia.fotos` (el administrador): se baja con la sesión y se
 * muestra como blob, nunca con un enlace público. Los demás ven que están, con
 * un candado. El administrador las marca revisadas u observadas; quien
 * inscribe puede reemplazar una (y vuelve a quedar por revisar).
 */
export default function FotosAlumno({
  alumnoId,
  fotos,
  veImagenes,
  reemplaza,
  onCambio,
}: {
  alumnoId: number;
  fotos: FotoAlumno[];
  veImagenes: boolean;
  reemplaza: boolean;
  onCambio: () => void;
}) {
  const [urls, setUrls] = useState<Partial<Record<TipoFoto, string>>>({});
  const [ampliada, setAmpliada] = useState<TipoFoto | null>(null);
  const [observando, setObservando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const firma = fotos.map((f) => `${f.tipo}:${f.subidaEn}`).join("|");

  // Las imágenes se piden sólo con permiso; se liberan al irse o al cambiar.
  useEffect(() => {
    if (!veImagenes) return;
    let vigente = true;
    const creadas: string[] = [];
    void Promise.all(
      fotos.map(async (f) => {
        try {
          const url = await apiAcademia.fotoComoUrl(alumnoId, f.tipo);
          creadas.push(url);
          if (vigente) setUrls((u) => ({ ...u, [f.tipo]: url }));
        } catch {
          /* queda el marco sin imagen */
        }
      }),
    );
    return () => {
      vigente = false;
      creadas.forEach((u) => URL.revokeObjectURL?.(u));
    };
    // `firma` resume las fotos: una nueva subida vuelve a pedirlas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId, veImagenes, firma]);

  const porTipo = new Map(fotos.map((f) => [f.tipo, f]));
  const completas = TIPOS_FOTO.every((t) => porTipo.has(t));
  // Observar también deja `revisadaEn` (con su observación): una revisada con
  // observación está observada, no aprobada. Antes se leía "Revisadas por…"
  // y recepción nunca se enteraba (QA ronda 2, B-06). Al cambiar la foto se
  // borra la marca de revisada y vuelve a quedar por revisar.
  const observadas = fotos.filter(esObservada);
  const revisada = completas && observadas.length === 0 && fotos.every((f) => f.revisadaEn) ? fotos[0] : null;
  const motivo = observadas[0]?.observacion ?? "";

  async function hacer(fn: () => Promise<unknown>) {
    setOcupado(true);
    setError("");
    try {
      await fn();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-labelledby="t-fotos" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-fotos" className="text-base font-bold text-texto">
          Fotos y carnet
        </h2>
        <span className="flex items-center gap-1.5 text-[13px] text-texto-3">
          {!completas ? (
            <span className="font-semibold text-danger-text">Faltan {3 - TIPOS_FOTO.filter((t) => porTipo.has(t)).length}</span>
          ) : revisada ? (
            <>
              <Icon name="check" size={14} /> Revisadas{revisada.revisadaPor ? ` por ${revisada.revisadaPor}` : ""}
              {revisada.revisadaEn ? ` el ${fechaCorta(revisada.revisadaEn)}` : ""}
            </>
          ) : observadas.length ? (
            <span className="font-semibold text-danger-text">
              {observadas.length === 1 ? "Observada" : "Observadas"}: {motivo}
            </span>
          ) : (
            <span className="text-warning-text">Por revisar</span>
          )}
        </span>
      </div>

      {observadas.length > 0 && reemplaza && (
        <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">
          <b>Falta corregir:</b> {motivo}. Tocá <b>Cambiar</b> en {observadas.length === 1 ? "la foto marcada" : "las fotos marcadas"} y
          sacala de nuevo.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {TIPOS_FOTO.map((tipo) => (
          <Figura
            key={tipo}
            tipo={tipo}
            foto={porTipo.get(tipo) ?? null}
            url={urls[tipo] ?? null}
            veImagenes={veImagenes}
            reemplaza={reemplaza && !ocupado}
            onAmpliar={() => setAmpliada(tipo)}
            onReemplazar={(archivo) =>
              void hacer(async () => {
                const blob = await prepararFoto(archivo);
                await apiAcademia.subirFoto(alumnoId, tipo, blob);
              })
            }
          />
        ))}
      </div>

      {!veImagenes ? (
        <p className="flex items-center gap-1.5 text-[13px] text-texto-3">
          <Icon name="lock" size={13} /> Sólo el administrador ve las fotos
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {completas && !revisada && (
            <Boton variante="soft" disabled={ocupado} onClick={() => void hacer(() => apiAcademia.revisarFotos(alumnoId, { ok: true }))}>
              Marcar revisadas
            </Boton>
          )}
          {fotos.length > 0 && (
            <Boton variante="ghost" disabled={ocupado} onClick={() => setObservando(true)}>
              Observar
            </Boton>
          )}
          <span className="text-[12px] text-texto-4">Tocá una foto para verla completa. Se guardan privadas, sin enlace público.</span>
        </div>
      )}
      <ErrorMsg>{error}</ErrorMsg>

      {ampliada && urls[ampliada] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={NOMBRE_FOTO[ampliada]}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setAmpliada(null)}
        >
          <img src={urls[ampliada]} alt={NOMBRE_FOTO[ampliada]} className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
      {observando && (
        <PedirMotivo
          titulo="Observar las fotos"
          texto="Queda anotado en la ficha: recepción ve el motivo y cambia la foto, que vuelve a quedar por revisar."
          motivos={MOTIVOS_OBSERVACION}
          etiquetaOk="Observar"
          onCancelar={() => setObservando(false)}
          onConfirmar={async (observacion) => {
            setObservando(false);
            await hacer(() => apiAcademia.revisarFotos(alumnoId, { ok: false, observacion }));
          }}
        />
      )}
    </section>
  );
}

function Figura({
  tipo,
  foto,
  url,
  veImagenes,
  reemplaza,
  onAmpliar,
  onReemplazar,
}: {
  tipo: TipoFoto;
  foto: FotoAlumno | null;
  url: string | null;
  veImagenes: boolean;
  reemplaza: boolean;
  onAmpliar: () => void;
  onReemplazar: (archivo: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const titulo = NOMBRE_FOTO[tipo];
  const observada = !!foto && esObservada(foto);
  return (
    <figure className="min-w-0">
      <div
        className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border ${
          observada ? "border-2 border-warning-text bg-warning-bg/40" : foto ? "border-primary-100 bg-primary-50" : "border-dashed border-danger bg-danger-bg/30"
        }`}
      >
        {url ? (
          <button type="button" onClick={onAmpliar} aria-label={`Ver ${titulo}`} className="h-full w-full">
            <img src={url} alt={titulo} className="h-full w-full object-cover" />
          </button>
        ) : foto ? (
          <span className="flex flex-col items-center gap-1 text-primary-700">
            <Icon name={veImagenes ? "camara" : "lock"} size={20} />
            {!veImagenes && <span className="sr-only">Foto cargada, sólo la ve el administrador</span>}
          </span>
        ) : (
          <span className="text-xs font-semibold text-danger-text">Falta</span>
        )}
      </div>
      <figcaption className="mt-1 flex items-center justify-between gap-1 text-[12px] text-texto-3">
        <span className="min-w-0 truncate">
          {titulo}
          {observada && <span className="block font-semibold text-warning-text">Observada</span>}
        </span>
        {reemplaza && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              capture={tipo === "FOTO" ? "user" : "environment"}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              data-testid={`reemplazar-${tipo}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onReemplazar(f);
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-label={`${foto ? "Cambiar" : "Cargar"} ${titulo.toLowerCase()}`}
              className={`shrink-0 font-semibold ${
                observada ? "rounded-full bg-primary-boton px-2.5 py-1 text-white hover:bg-primary-boton-hover" : "text-primary-700 hover:underline"
              }`}
            >
              {foto ? "Cambiar" : "Cargar"}
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** Revisada con observación y sin cambiar desde entonces (cambiarla borra la marca de revisada). */
function esObservada(f: FotoAlumno): boolean {
  if (f.estado) return f.estado === "OBSERVADA";
  return !!f.observacion && !!f.revisadaEn;
}
