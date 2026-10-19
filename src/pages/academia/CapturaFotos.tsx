import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { NOMBRE_FOTO, prepararFoto } from "../../lib/academia/fotos";
import { TIPOS_FOTO, type FotosInscripcion, type TipoFoto } from "../../lib/academia/tipos";

/**
 * Las 3 fotos de la inscripción (D7): foto del estudiante y el carnet por los
 * dos lados. Cada una se saca con la cámara del celular (`capture`) o se sube
 * un archivo; antes de guardarla se achica a WebP en el navegador, igual que
 * la ficha técnica de belleza, así no viajan los 4 MB de la cámara ni la
 * ubicación de la foto.
 *
 * Lo usan el mostrador (N5) y la página pública (P2): no depende de la sesión.
 */
export default function CapturaFotos({
  fotos,
  onCambiar,
  yaTiene = [],
  marcadas = [],
  compacto = false,
}: {
  fotos: FotosInscripcion;
  onCambiar: (fotos: FotosInscripcion) => void;
  /** Las que el estudiante ya tiene guardadas: no hace falta sacarlas otra vez. */
  yaTiene?: TipoFoto[];
  /** Las que el backend dijo que faltan (400 FOTOS_REQUERIDAS). */
  marcadas?: TipoFoto[];
  /** Una debajo de la otra (el celular de la página pública). */
  compacto?: boolean;
}) {
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState<TipoFoto | null>(null);

  async function elegir(tipo: TipoFoto, archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setProcesando(tipo);
    try {
      const blob = await prepararFoto(archivo);
      onCambiar({ ...fotos, [tipo]: blob });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto");
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div>
      <div className={compacto ? "space-y-3" : "grid gap-3 sm:grid-cols-3"}>
        {TIPOS_FOTO.map((tipo) => (
          <Foto
            key={tipo}
            tipo={tipo}
            archivo={fotos[tipo]}
            guardada={yaTiene.includes(tipo)}
            marcada={marcadas.includes(tipo)}
            procesando={procesando === tipo}
            compacto={compacto}
            onElegir={(f) => void elegir(tipo, f)}
            onQuitar={() => {
              const copia = { ...fotos };
              delete copia[tipo];
              onCambiar(copia);
            }}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
    </div>
  );
}

function Foto({
  tipo,
  archivo,
  guardada,
  marcada,
  procesando,
  compacto,
  onElegir,
  onQuitar,
}: {
  tipo: TipoFoto;
  archivo?: Blob;
  guardada: boolean;
  marcada: boolean;
  procesando: boolean;
  compacto: boolean;
  onElegir: (f: File | undefined) => void;
  onQuitar: () => void;
}) {
  const camara = useRef<HTMLInputElement>(null);
  const subir = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (archivo && typeof URL.createObjectURL === "function" ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const titulo = NOMBRE_FOTO[tipo];
  const lista = !!archivo || guardada;

  const inputs = (
    <>
      {/* La cámara de atrás para el carnet; la de adelante para la cara. */}
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture={tipo === "FOTO" ? "user" : "environment"}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        data-testid={`camara-${tipo}`}
        onChange={(e) => {
          onElegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={subir}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        data-testid={`subir-${tipo}`}
        onChange={(e) => {
          onElegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );

  return (
    <div className={compacto ? "flex items-center gap-3" : ""}>
      {inputs}
      <div
        className={`flex items-center justify-center overflow-hidden rounded-xl border ${
          compacto ? "h-20 w-24 shrink-0" : "aspect-[4/3] w-full"
        } ${lista ? "border-primary-100 bg-primary-50" : marcada ? "border-dashed border-danger bg-danger-bg/40" : "border-dashed border-borde bg-muted"}`}
      >
        {url ? (
          <img src={url} alt={titulo} className="h-full w-full object-cover" />
        ) : guardada ? (
          <span className="flex flex-col items-center gap-1 text-xs text-primary-700">
            <Icon name="checkCirculo" size={22} /> Ya cargada
          </span>
        ) : procesando ? (
          <span className="text-xs text-texto-3">Preparando…</span>
        ) : (
          !compacto && (
            <span className="flex flex-col items-center gap-2">
              <Icon name="camara" size={24} className="text-texto-4" />
              <span className="flex gap-2">
                <BotonFoto onClick={() => camara.current?.click()} etiqueta={`Tomar foto: ${titulo}`}>
                  Tomar foto
                </BotonFoto>
                <BotonFoto onClick={() => subir.current?.click()} etiqueta={`Subir archivo: ${titulo}`} suave>
                  Subir
                </BotonFoto>
              </span>
            </span>
          )
        )}
        {compacto && !url && !guardada && !procesando && <Icon name="camara" size={22} className="text-texto-4" />}
      </div>
      <div className={`flex items-center justify-between gap-2 ${compacto ? "min-w-0 flex-1 flex-col items-start" : "mt-1.5"}`}>
        <span className="text-[13px] text-texto-2">{titulo}</span>
        {lista ? (
          <button
            type="button"
            onClick={() => (archivo ? onQuitar() : camara.current?.click())}
            aria-label={`Repetir: ${titulo}`}
            className="text-xs font-semibold text-primary-700 hover:underline"
          >
            Repetir
          </button>
        ) : compacto ? (
          <span className="flex gap-2">
            <BotonFoto onClick={() => camara.current?.click()} etiqueta={`Tomar foto: ${titulo}`}>
              Tomar foto
            </BotonFoto>
            <BotonFoto onClick={() => subir.current?.click()} etiqueta={`Subir archivo: ${titulo}`} suave>
              Subir
            </BotonFoto>
          </span>
        ) : (
          <span className={`text-xs ${marcada ? "font-semibold text-danger-text" : "text-warning-text"}`}>Falta</span>
        )}
      </div>
    </div>
  );
}

function BotonFoto({ onClick, etiqueta, suave = false, children }: { onClick: () => void; etiqueta: string; suave?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
        suave ? "border border-borde bg-white text-texto-2 hover:bg-muted" : "bg-primary-boton text-white hover:bg-primary-boton-hover"
      }`}
    >
      {children}
    </button>
  );
}

/** Cuántas de las 3 faltan, contando las nuevas y las ya guardadas. */
export function fotosQueFaltan(fotos: FotosInscripcion, yaTiene: TipoFoto[] = []): TipoFoto[] {
  return TIPOS_FOTO.filter((t) => !fotos[t] && !yaTiene.includes(t));
}
