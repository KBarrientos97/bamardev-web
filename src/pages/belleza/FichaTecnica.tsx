import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, Confirmar, ErrorMsg, Input, Modal } from "../../components/ui";
import {
  apiExtras,
  type FichaTecnica as Ficha,
  type FichasDeCliente,
  type FormulaColor,
  type FotoFicha,
} from "../../lib/belleza/apiExtras";
import { lineaFormula } from "../../lib/belleza/formato";
import { prepararFoto } from "../../lib/belleza/fotos";
import { fmtFecha } from "../../lib/format";
import { useApi } from "../../lib/useApi";

const mensaje = (e: unknown, porDefecto = "No se pudo guardar") =>
  e instanceof Error ? e.message : porDefecto;

/**
 * Ficha técnica (feature `ficha_tecnica`): por visita, las fórmulas de color
 * y las fotos antes/después. Se ve en la ficha del cliente y en el detalle de
 * la cita (con la historia de color del cliente, para el profesional).
 *
 * Dato sensible: las fotos no tienen ruta pública; se bajan con la sesión y
 * se muestran como blob.
 */
export default function FichaTecnicaSeccion({
  clienteId,
  citaId,
  puedeEditar,
  titulo,
}: {
  clienteId?: number | null;
  citaId?: number;
  puedeEditar: boolean;
  /** El rótulo de la sección (cada pantalla dibuja los suyos). */
  titulo: (accion?: React.ReactNode) => React.ReactNode;
}) {
  const datos = useApi<FichasDeCliente | null>(
    () =>
      citaId != null
        ? apiExtras.fichasDeCita(citaId)
        : clienteId != null
          ? apiExtras.fichasDeCliente(clienteId)
          : Promise.resolve(null),
    [citaId, clienteId],
  );
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<Ficha | null>(null);
  const d = datos.datos;
  const cliente = d?.cliente?.id ?? clienteId ?? null;

  // Una cita sin cliente (walk-in anónimo) no tiene ficha técnica.
  if (citaId != null && d && !d.cliente) return null;

  return (
    <section className="space-y-2" aria-label="Ficha técnica">
      {titulo(
        puedeEditar && cliente != null ? (
          <button
            type="button"
            onClick={() => setNueva(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="plus" size={15} /> Fórmula
          </button>
        ) : undefined,
      )}
      <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      {!d ? (
        datos.cargando && <p className="text-[13px] text-texto-3">Cargando…</p>
      ) : d.fichas.length === 0 ? (
        <p className="text-[13px] text-texto-3">Todavía no hay fórmulas ni fotos.</p>
      ) : (
        <ul className="space-y-2">
          {d.fichas.map((f) => (
            <TarjetaFicha
              key={f.id}
              ficha={f}
              deEstaCita={citaId != null && f.citaId === citaId}
              onEditar={() => setEditando(f)}
              onCambio={datos.recargar}
            />
          ))}
        </ul>
      )}
      {cliente != null && (
        <FormFicha
          abierto={nueva || !!editando}
          ficha={editando}
          clienteId={cliente}
          citaId={citaId}
          onClose={() => {
            setNueva(false);
            setEditando(null);
          }}
          onGuardada={() => {
            setNueva(false);
            setEditando(null);
            datos.recargar();
          }}
        />
      )}
    </section>
  );
}

function TarjetaFicha({
  ficha,
  deEstaCita,
  onEditar,
  onCambio,
}: {
  ficha: Ficha;
  deEstaCita: boolean;
  onEditar: () => void;
  onCambio: () => void;
}) {
  const [subiendo, setSubiendo] = useState<"ANTES" | "DESPUES" | null>(null);
  const [error, setError] = useState("");
  const [borrar, setBorrar] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const momento = useRef<"ANTES" | "DESPUES">("ANTES");

  const elegir = (m: "ANTES" | "DESPUES") => {
    momento.current = m;
    entrada.current?.click();
  };
  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError("");
    setSubiendo(momento.current);
    try {
      await apiExtras.subirFoto(ficha.id, momento.current, await prepararFoto(archivo));
      onCambio();
    } catch (e) {
      setError(mensaje(e, "No se pudo subir la foto"));
    } finally {
      setSubiendo(null);
      if (entrada.current) entrada.current.value = "";
    }
  };

  return (
    <li className={`rounded-xl border p-3 ${deEstaCita ? "border-primary bg-primary-50/40" : "border-borde"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-texto">
            {ficha.servicio || "Visita"}
            {deEstaCita && <span className="ml-1.5 text-[11px] font-semibold text-primary-700">· esta cita</span>}
          </p>
          <p className="text-[12px] text-texto-3">
            {fmtFecha(ficha.fecha)}
            {ficha.recurso ? ` · ${ficha.recurso}` : ""}
          </p>
        </div>
        {ficha.editable && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Editar fórmula"
              onClick={onEditar}
              className="rounded-lg p-1.5 text-texto-3 hover:bg-muted"
            >
              <Icon name="edit" size={15} />
            </button>
            <button
              type="button"
              aria-label="Borrar visita"
              onClick={() => setBorrar(true)}
              className="rounded-lg p-1.5 text-texto-3 hover:bg-muted"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        )}
      </div>
      {ficha.formulas.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] text-texto-2">
          {ficha.formulas.map((f, i) => (
            <li key={i}>{lineaFormula(f)}</li>
          ))}
        </ul>
      )}
      {ficha.nota && <p className="mt-1.5 text-[13px] text-texto-3">{ficha.nota}</p>}
      {ficha.fotos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ficha.fotos.map((f) => (
            <FotoMiniatura key={f.id} foto={f} puedeBorrar={ficha.editable} onBorrada={onCambio} />
          ))}
        </div>
      )}
      {ficha.editable && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Foto"
            onChange={(e) => void subir(e.target.files?.[0])}
          />
          <Boton variante="ghost" onClick={() => elegir("ANTES")} disabled={!!subiendo} className="px-3 py-1.5 text-[13px]">
            <Icon name="camara" size={15} /> {subiendo === "ANTES" ? "Subiendo…" : "Foto antes"}
          </Boton>
          <Boton variante="ghost" onClick={() => elegir("DESPUES")} disabled={!!subiendo} className="px-3 py-1.5 text-[13px]">
            <Icon name="camara" size={15} /> {subiendo === "DESPUES" ? "Subiendo…" : "Foto después"}
          </Boton>
        </div>
      )}
      <ErrorMsg>{error}</ErrorMsg>
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar esta visita?"
        texto="Se borran sus fórmulas y sus fotos."
        etiquetaOk="Borrar"
        peligroso
        onCancel={() => setBorrar(false)}
        onOk={async () => {
          try {
            await apiExtras.borrarFicha(ficha.id);
            onCambio();
          } catch (e) {
            setError(mensaje(e, "No se pudo borrar"));
          } finally {
            setBorrar(false);
          }
        }}
      />
    </li>
  );
}

/** La foto bajada con la sesión (no hay ruta pública), como blob. */
function FotoMiniatura({
  foto,
  puedeBorrar,
  onBorrada,
}: {
  foto: FotoFicha;
  puedeBorrar: boolean;
  onBorrada: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    let vigente = true;
    let creada: string | null = null;
    apiExtras
      .fotoComoUrl(foto.url)
      .then((u) => {
        creada = u;
        if (vigente) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [foto.url]);
  const etiqueta = foto.momento === "ANTES" ? "Antes" : "Después";
  return (
    <>
      <button
        type="button"
        onClick={() => setGrande(true)}
        className="relative h-20 w-20 overflow-hidden rounded-lg border border-borde bg-muted"
        aria-label={`Ver foto ${etiqueta.toLowerCase()}`}
      >
        {url && <img src={url} alt={`Foto ${etiqueta.toLowerCase()}`} className="h-full w-full object-cover" />}
        <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-center text-[10px] font-semibold text-white">
          {etiqueta}
        </span>
      </button>
      <Modal abierto={grande} titulo={`Foto ${etiqueta.toLowerCase()}`} onClose={() => setGrande(false)} ancho="max-w-2xl">
        <div className="space-y-3">
          {url && <img src={url} alt={`Foto ${etiqueta.toLowerCase()}`} className="mx-auto max-h-[70vh] rounded-xl" />}
          {puedeBorrar && (
            <Boton
              variante="ghost"
              onClick={async () => {
                await apiExtras.borrarFoto(foto.id).catch(() => {});
                setGrande(false);
                onBorrada();
              }}
            >
              <Icon name="trash" size={15} /> Borrar foto
            </Boton>
          )}
        </div>
      </Modal>
    </>
  );
}

const VACIA: FormulaColor = { marca: "", tono: "", proporcion: "", oxidante: "" };

function FormFicha({
  abierto,
  ficha,
  clienteId,
  citaId,
  onClose,
  onGuardada,
}: {
  abierto: boolean;
  ficha: Ficha | null;
  clienteId: number;
  citaId?: number;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [servicio, setServicio] = useState("");
  const [formulas, setFormulas] = useState<FormulaColor[]>([VACIA]);
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargadaDe, setCargadaDe] = useState<number | "nueva" | null>(null);

  const clave = abierto ? (ficha?.id ?? "nueva") : null;
  if (clave !== cargadaDe) {
    setCargadaDe(clave);
    setServicio(ficha?.servicio ?? "");
    setFormulas(ficha?.formulas.length ? ficha.formulas : [VACIA]);
    setNota(ficha?.nota ?? "");
    setError("");
  }

  const cambiar = (i: number, campo: keyof FormulaColor, valor: string) =>
    setFormulas((fs) =>
      fs.map((f, n) =>
        n === i
          ? { ...f, [campo]: campo === "tiempoMin" ? (valor ? Number(valor) : undefined) : valor }
          : f,
      ),
    );

  const guardar = async () => {
    setError("");
    setGuardando(true);
    const cuerpo = {
      servicio: servicio.trim() || undefined,
      formulas: formulas.map((f) => ({
        ...f,
        tiempoMin: f.tiempoMin != null && Number.isFinite(f.tiempoMin) ? Math.round(f.tiempoMin) : undefined,
      })),
      nota: nota.trim() || undefined,
    };
    try {
      if (ficha) await apiExtras.editarFicha(ficha.id, cuerpo);
      else await apiExtras.crearFicha({ clienteId, ...(citaId != null ? { citaId } : {}), ...cuerpo });
      onGuardada();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo={ficha ? "Editar fórmula" : "Nueva fórmula"}
      subtitulo="Marca, tono, proporción, oxidante y tiempo, como los anotás siempre."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorMsg>{error}</ErrorMsg>
        <Campo label="Servicio">
          <Input aria-label="Servicio" value={servicio} onChange={(e) => setServicio(e.target.value)} placeholder="Retoque de raíz" maxLength={120} />
        </Campo>
        {formulas.map((f, i) => (
          <fieldset key={i} className="space-y-2 rounded-xl border border-borde p-3">
            <legend className="px-1 text-[12px] font-semibold text-texto-3">Fórmula {i + 1}</legend>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label={`Marca ${i + 1}`} placeholder="Marca" value={f.marca ?? ""} onChange={(e) => cambiar(i, "marca", e.target.value)} maxLength={60} />
              <Input aria-label={`Tono ${i + 1}`} placeholder="Tono (7.1)" value={f.tono ?? ""} onChange={(e) => cambiar(i, "tono", e.target.value)} maxLength={60} />
              <Input aria-label={`Proporción ${i + 1}`} placeholder="Proporción (1:1,5)" value={f.proporcion ?? ""} onChange={(e) => cambiar(i, "proporcion", e.target.value)} maxLength={40} />
              <Input aria-label={`Oxidante ${i + 1}`} placeholder="Oxidante (20 vol)" value={f.oxidante ?? ""} onChange={(e) => cambiar(i, "oxidante", e.target.value)} maxLength={40} />
              <Input
                aria-label={`Tiempo ${i + 1}`}
                type="number"
                inputMode="numeric"
                placeholder="Minutos"
                value={f.tiempoMin != null ? String(f.tiempoMin) : ""}
                onChange={(e) => cambiar(i, "tiempoMin", e.target.value)}
              />
              {formulas.length > 1 && (
                <Boton variante="ghost" onClick={() => setFormulas((fs) => fs.filter((_, n) => n !== i))}>
                  Quitar
                </Boton>
              )}
            </div>
          </fieldset>
        ))}
        {formulas.length < 10 && (
          <Boton variante="soft" icono="plus" onClick={() => setFormulas((fs) => [...fs, VACIA])}>
            Otra fórmula
          </Boton>
        )}
        <Campo label="Nota">
          <Input aria-label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Raíz con 30 % de canas" maxLength={1000} />
        </Campo>
      </div>
    </Modal>
  );
}
