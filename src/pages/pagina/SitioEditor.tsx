import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Badge, Boton, Campo, Confirmar, Input, Modal } from "../../components/ui";
import { apiPagina, urlDeImagen } from "../../lib/pagina/apiPagina";
import { prepararImagen } from "../../lib/pagina/imagen";
import {
  nombreBloque,
  PLANTILLAS_SITIO,
  progresoSitio,
  tieneCorchetes,
  videoDe,
} from "../../lib/pagina/sitio";
import type {
  Bloque,
  DatosPorBloque,
  EstadoEditor,
  EstadoSitio,
  LimitesSitio,
  PlantillaSitio,
  Sitio,
  TipoBloque,
} from "../../lib/pagina/tipos";
import Seccion from "./Seccion";

/**
 * "Sitio web" en Mi página (PLAN-PAGINA-PRO §5 y M1; diseño `Editor` del
 * lienzo «Sitio Pro por rubro»). Sin editor libre (IDEAS/5): se elige la
 * plantilla y cada bloque se prende, se ordena y se llena con lo justo.
 *
 * Todo va al borrador como el resto del editor: los cambios del sitio los
 * junta MiPagina (`onCambiar`) y los manda con el autoguardado; elegir
 * plantilla, volver a la página simple y las fotos van al toque, después de
 * mandar lo pendiente (si no, el envío de atrás pisaría lo que respondió el
 * servidor).
 */

const mensaje = (e: unknown, defecto = "No se pudo guardar") => (e instanceof Error ? e.message : defecto);

/** El backend rechaza la subida de más de 2 MB (la foto ya va achicada). */
const TOPE_SUBIDA = 2 * 1024 * 1024;

const AREA =
  "w-full resize-y rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100";

/** Los bloques que se llenan acá (el destacado se publica desde la caja). */
const EDITABLES = new Set<TipoBloque>(["PORTADA", "CATALOGO", "QUIENES", "GALERIA", "UBICACION", "PREGUNTAS", "RESENAS", "VIDEO"]);

export interface PropsSitioEditor {
  estado: EstadoSitio;
  /** El sitio con lo que todavía no llegó al borrador. */
  sitio: Sitio | null;
  onCambiar: (sitio: Sitio) => void;
  /** Lo que respondió el servidor (el estado entero del editor). */
  onEstado: (estado: EstadoEditor) => void;
  /** Manda lo pendiente antes de una acción que va al toque. */
  antes: () => Promise<void>;
  onError: (m: string) => void;
  onAviso: (m: string) => void;
}

/** La línea de cada bloque en la lista: qué tiene o qué le falta. */
function notaDe(b: Bloque, limites: LimitesSitio): { texto: string; falta: boolean } {
  switch (b.tipo) {
    case "PORTADA":
      return b.datos.fotos.length
        ? { texto: `${b.datos.fotos.length === 1 ? "1 foto" : `Carrusel de ${b.datos.fotos.length} fotos`}`, falta: false }
        : { texto: "Sin fotos: va la portada de tu página", falta: true };
    case "DESTACADO":
      return { texto: "Se publica desde la caja, el día que haya", falta: false };
    case "CATALOGO":
      return { texto: "Sale de tu catálogo de Mi página", falta: false };
    case "QUIENES":
      return b.datos.texto?.trim()
        ? { texto: `Tu historia${b.datos.datos.length ? ` y ${b.datos.datos.length} ${b.datos.datos.length === 1 ? "dato" : "datos"}` : ""}`, falta: false }
        : { texto: "Falta tu historia", falta: true };
    case "GALERIA":
      return { texto: `${b.datos.fotos.length} de ${limites.fotosGaleria} fotos`, falta: b.datos.fotos.length === 0 };
    case "UBICACION":
      return { texto: "El mapa y el horario de tus sucursales", falta: false };
    case "PREGUNTAS": {
      const revisar = b.datos.items.filter((x) => tieneCorchetes(x.pregunta) || tieneCorchetes(x.respuesta)).length;
      const n = b.datos.items.length;
      return revisar
        ? { texto: `${n} ${n === 1 ? "pregunta" : "preguntas"}, ${revisar} para revisar`, falta: true }
        : { texto: n ? `${n} ${n === 1 ? "pregunta" : "preguntas"}` : "Sin preguntas", falta: n === 0 };
    }
    case "RESENAS":
      return b.datos.googleUrl ? { texto: "Botón «Dejá tu reseña en Google»", falta: false } : { texto: "Falta el enlace de tu ficha de Google", falta: true };
    case "VIDEO": {
      const v = b.datos.url ? videoDe(b.datos.url) : null;
      return v ? { texto: `Video de ${v.red}`, falta: false } : { texto: "Falta el enlace del video", falta: true };
    }
  }
}

function Interruptor({ prendido, etiqueta, onCambio }: { prendido: boolean; etiqueta: string; onCambio: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      aria-label={etiqueta}
      onClick={onCambio}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors ${prendido ? "bg-emerald-700" : "bg-slate-300"}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left]"
        style={{ left: prendido ? 24 : 4 }}
      />
    </button>
  );
}

/** Las fotos subidas para elegir: una (quiénes somos) o varias, hasta `max`. */
function ElegirFotos({
  estado,
  elegidas,
  max,
  onElegidas,
  subir,
  subiendo,
}: {
  estado: EstadoSitio;
  elegidas: string[];
  max: number;
  onElegidas: (fotos: string[]) => void;
  subir: (archivos: FileList | null) => Promise<string[]>;
  subiendo: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const una = max === 1;
  const alternar = (foto: string) => {
    if (elegidas.includes(foto)) onElegidas(elegidas.filter((f) => f !== foto));
    else if (una) onElegidas([foto]);
    else if (elegidas.length < max) onElegidas([...elegidas, foto]);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-texto-2">
          {una ? "Foto" : `Fotos: ${elegidas.length} de ${max}`}
        </span>
        <Boton variante="ghost" icono="camara" className="!px-3 !py-1.5 text-[13px]" disabled={subiendo} onClick={() => input.current?.click()}>
          {subiendo ? "Subiendo…" : "Subir fotos"}
        </Boton>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple={!una}
          className="hidden"
          aria-label="Elegir fotos para subir"
          onChange={async (ev) => {
            const nuevas = await subir(ev.target.files);
            ev.target.value = "";
            if (!nuevas.length) return;
            if (una) onElegidas([nuevas[0]]);
            else onElegidas([...elegidas, ...nuevas.filter((f) => !elegidas.includes(f))].slice(0, max));
          }}
        />
      </div>
      {estado.fotos.length === 0 ? (
        <p className="text-[13px] text-texto-3">Todavía no subiste fotos. Las que subas quedan para usarlas en cualquier bloque.</p>
      ) : (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Fotos subidas">
          {estado.fotos.map((f, i) => {
            const n = elegidas.indexOf(f.foto);
            const lleno = !una && n < 0 && elegidas.length >= max;
            return (
              <li key={f.foto}>
                <button
                  type="button"
                  aria-pressed={n >= 0}
                  aria-label={`Foto ${i + 1}${n >= 0 && !una ? `, elegida en el lugar ${n + 1}` : ""}`}
                  disabled={lleno}
                  onClick={() => alternar(f.foto)}
                  className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-muted disabled:opacity-40 ${
                    n >= 0 ? "border-emerald-700" : "border-transparent"
                  }`}
                >
                  {f.url && <img src={urlDeImagen(f.url) ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  {n >= 0 && (
                    <span className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-700 px-1 text-xs font-bold text-white">
                      {una ? <Icon name="check" size={14} /> : n + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** El formulario de un bloque. Trabaja sobre una copia: «Listo» la pasa al sitio. */
function FormularioBloque({
  bloque,
  estado,
  onDatos,
  subir,
  subiendo,
}: {
  bloque: Bloque;
  estado: EstadoSitio;
  onDatos: (datos: Bloque["datos"]) => void;
  subir: (archivos: FileList | null) => Promise<string[]>;
  subiendo: boolean;
}) {
  const L = estado.limites;
  const titulo = (valor: string | null, set: (v: string | null) => void, ejemplo: string) => (
    <Campo label="Título" hint={`${(valor ?? "").length} de ${L.titulo}`}>
      <Input aria-label="Título" maxLength={L.titulo} value={valor ?? ""} placeholder={ejemplo} onChange={(ev) => set(ev.target.value || null)} />
    </Campo>
  );
  const fotos = (elegidas: string[], max: number, set: (f: string[]) => void) => (
    <ElegirFotos estado={estado} elegidas={elegidas} max={max} onElegidas={set} subir={subir} subiendo={subiendo} />
  );

  switch (bloque.tipo) {
    case "PORTADA": {
      const d = bloque.datos;
      const set = (c: Partial<DatosPorBloque["PORTADA"]>) => onDatos({ ...d, ...c });
      return (
        <div className="space-y-4">
          {titulo(d.titulo, (v) => set({ titulo: v }), "Ej.: Pollo a la leña desde 2009")}
          <Campo label="Bajada" hint={`${(d.subtitulo ?? "").length} de ${L.subtitulo}. Vacía = la descripción de tu página.`}>
            <textarea
              aria-label="Bajada"
              rows={2}
              maxLength={L.subtitulo}
              value={d.subtitulo ?? ""}
              onChange={(ev) => set({ subtitulo: ev.target.value || null })}
              className={AREA}
              placeholder="Qué ofrecés y por qué venir. Ej.: Retirá sin fila o pedí a domicilio."
            />
          </Campo>
          {fotos(d.fotos, L.fotosPortada, (f) => set({ fotos: f }))}
          <p className="text-xs text-texto-3">Con más de una foto, pasan solas y despacio. Sin fotos, va la portada de tu página.</p>
        </div>
      );
    }
    case "QUIENES": {
      const d = bloque.datos;
      const set = (c: Partial<DatosPorBloque["QUIENES"]>) => onDatos({ ...d, ...c });
      const año = new Date().getFullYear();
      return (
        <div className="space-y-4">
          {titulo(d.titulo, (v) => set({ titulo: v }), "Quiénes somos")}
          <Campo label="Tu historia" hint={`${(d.texto ?? "").length} de ${L.texto}. Un renglón vacío separa los párrafos.`}>
            <textarea
              aria-label="Tu historia"
              rows={5}
              maxLength={L.texto}
              value={d.texto ?? ""}
              onChange={(ev) => set({ texto: ev.target.value || null })}
              className={AREA}
              placeholder="Cómo empezaron, qué los hace distintos, quién atiende."
            />
          </Campo>
          <Campo label="Desde qué año" hint={`Entre 1900 y ${año}. Vacío = no se muestra.`}>
            <Input
              aria-label="Desde qué año"
              inputMode="numeric"
              maxLength={4}
              value={d.desde ?? ""}
              onChange={(ev) => {
                const v = ev.target.value.replace(/\D/g, "");
                set({ desde: v ? Number(v) : null });
              }}
            />
          </Campo>
          <div className="space-y-2">
            <span className="block text-[13px] font-semibold text-texto-2">Datos destacados ({d.datos.length} de {L.datos})</span>
            {d.datos.map((x, i) => (
              <div key={i} className="flex items-end gap-2">
                <Campo label={`Dato ${i + 1}`}>
                  <Input
                    aria-label={`Valor del dato ${i + 1}`}
                    maxLength={L.datoValor}
                    value={x.valor}
                    placeholder="3"
                    onChange={(ev) => set({ datos: d.datos.map((y, j) => (j === i ? { ...y, valor: ev.target.value } : y)) })}
                  />
                </Campo>
                <div className="min-w-0 flex-1">
                  <Campo label="Qué es">
                    <Input
                      aria-label={`Qué es el dato ${i + 1}`}
                      maxLength={L.datoEtiqueta}
                      value={x.etiqueta}
                      placeholder="sucursales"
                      onChange={(ev) => set({ datos: d.datos.map((y, j) => (j === i ? { ...y, etiqueta: ev.target.value } : y)) })}
                    />
                  </Campo>
                </div>
                <button
                  type="button"
                  aria-label={`Quitar el dato ${i + 1}`}
                  onClick={() => set({ datos: d.datos.filter((_, j) => j !== i) })}
                  className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-danger-text hover:bg-muted"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            {d.datos.length < L.datos && (
              <Boton variante="ghost" icono="plus" className="!px-3 !py-1.5 text-[13px]" onClick={() => set({ datos: [...d.datos, { valor: "", etiqueta: "" }] })}>
                Agregar un dato
              </Boton>
            )}
          </div>
          {fotos(d.foto ? [d.foto] : [], 1, (f) => set({ foto: f[0] ?? null }))}
        </div>
      );
    }
    case "GALERIA": {
      const d = bloque.datos;
      const set = (c: Partial<DatosPorBloque["GALERIA"]>) => onDatos({ ...d, ...c });
      const leyendaDe = new Map(d.fotos.map((f) => [f.foto, f.leyenda]));
      const urlDe = new Map(estado.fotos.map((f) => [f.foto, f.url]));
      return (
        <div className="space-y-4">
          {titulo(d.titulo, (v) => set({ titulo: v }), "Galería")}
          {fotos(
            d.fotos.map((f) => f.foto),
            L.fotosGaleria,
            (lista) => set({ fotos: lista.map((foto) => ({ foto, leyenda: leyendaDe.get(foto) ?? null })) }),
          )}
          {d.fotos.length > 0 && (
            <div className="space-y-2">
              <span className="block text-[13px] font-semibold text-texto-2">Leyendas (opcionales)</span>
              {d.fotos.map((f, i) => (
                <div key={f.foto} className="flex items-center gap-2">
                  {urlDe.get(f.foto) && (
                    <img src={urlDeImagen(urlDe.get(f.foto) ?? null) ?? undefined} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  )}
                  <Input
                    aria-label={`Leyenda de la foto ${i + 1}`}
                    maxLength={L.leyenda}
                    value={f.leyenda ?? ""}
                    placeholder="Ej.: El salón"
                    onChange={(ev) =>
                      set({ fotos: d.fotos.map((y) => (y.foto === f.foto ? { ...y, leyenda: ev.target.value || null } : y)) })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "PREGUNTAS": {
      const d = bloque.datos;
      const set = (c: Partial<DatosPorBloque["PREGUNTAS"]>) => onDatos({ ...d, ...c });
      const item = (i: number, c: Partial<{ pregunta: string; respuesta: string }>) =>
        set({ items: d.items.map((y, j) => (j === i ? { ...y, ...c } : y)) });
      return (
        <div className="space-y-4">
          {titulo(d.titulo, (v) => set({ titulo: v }), "Preguntas")}
          {d.items.map((x, i) => {
            const revisar = tieneCorchetes(x.pregunta) || tieneCorchetes(x.respuesta);
            return (
              <fieldset key={i} className={`space-y-2 rounded-xl border p-3 ${revisar ? "border-amber-400 bg-amber-50" : "border-borde-soft"}`}>
                <legend className="px-1 text-[13px] font-semibold text-texto-2">Pregunta {i + 1}</legend>
                {revisar && (
                  <p role="note" className="text-[13px] font-semibold text-amber-800">
                    Revisala: completá lo que está entre [corchetes] con lo de tu negocio.
                  </p>
                )}
                <Input aria-label={`Pregunta ${i + 1}`} maxLength={L.pregunta} value={x.pregunta} onChange={(ev) => item(i, { pregunta: ev.target.value })} />
                <textarea
                  aria-label={`Respuesta ${i + 1}`}
                  rows={2}
                  maxLength={L.respuesta}
                  value={x.respuesta}
                  onChange={(ev) => item(i, { respuesta: ev.target.value })}
                  className={AREA}
                />
                <div className="flex justify-end">
                  <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => set({ items: d.items.filter((_, j) => j !== i) })}>
                    Quitar
                  </Boton>
                </div>
              </fieldset>
            );
          })}
          {d.items.length < L.preguntas && (
            <Boton variante="ghost" icono="plus" onClick={() => set({ items: [...d.items, { pregunta: "", respuesta: "" }] })}>
              Agregar una pregunta
            </Boton>
          )}
        </div>
      );
    }
    case "RESENAS":
      return (
        <Campo label="Enlace de tu ficha de Google" hint="En Google Maps, abrí tu negocio › «Pedir reseñas» › copiar el enlace (empieza con https://g.page/ o https://maps.app.goo.gl/).">
          <Input
            aria-label="Enlace de tu ficha de Google"
            inputMode="url"
            value={bloque.datos.googleUrl ?? ""}
            placeholder="https://g.page/r/…/review"
            onChange={(ev) => onDatos({ googleUrl: ev.target.value.trim() || null })}
          />
        </Campo>
      );
    case "VIDEO": {
      const d = bloque.datos;
      const v = d.url ? videoDe(d.url) : null;
      return (
        <div className="space-y-4">
          {titulo(d.titulo, (t) => onDatos({ ...d, titulo: t }), "Ej.: Así preparamos el pollo")}
          <Campo
            label="Enlace del video"
            hint={d.url && !v ? "Tiene que ser un enlace https de YouTube, TikTok o Facebook." : "De YouTube, TikTok o Facebook. Se carga recién cuando lo tocan."}
          >
            <Input
              aria-label="Enlace del video"
              inputMode="url"
              value={d.url ?? ""}
              placeholder="https://youtu.be/…"
              onChange={(ev) => onDatos({ ...d, url: ev.target.value.trim() || null })}
            />
          </Campo>
        </div>
      );
    }
    case "CATALOGO":
      return (
        <div className="space-y-3">
          {titulo(bloque.datos.titulo, (t) => onDatos({ titulo: t }), "La carta")}
          <p className="text-[13px] text-texto-3">Los productos, fotos y precios salen de la sección Catálogo de esta página.</p>
        </div>
      );
    case "UBICACION":
      return (
        <div className="space-y-3">
          {titulo(bloque.datos.titulo, (t) => onDatos({ titulo: t }), "Dónde estamos")}
          <p className="text-[13px] text-texto-3">El mapa, la dirección y el horario salen de la ficha de cada sucursal.</p>
        </div>
      );
    case "DESTACADO":
      return null;
  }
}

/** Antes de guardar: lo que el backend rechazaría, dicho como lo entiende el dueño. */
function problemaDe(b: Bloque): string | null {
  if (b.tipo === "QUIENES" && b.datos.desde !== null) {
    const año = new Date().getFullYear();
    if (b.datos.desde < 1900 || b.datos.desde > año) return `El año tiene que estar entre 1900 y ${año}.`;
  }
  if (b.tipo === "VIDEO" && b.datos.url && !videoDe(b.datos.url)) {
    return "El video tiene que ser un enlace https de YouTube, TikTok o Facebook.";
  }
  if (b.tipo === "RESENAS" && b.datos.googleUrl && !/^https:\/\//i.test(b.datos.googleUrl)) {
    return "El enlace de Google tiene que empezar con https://";
  }
  return null;
}

/** Lo que se guarda: sin renglones a medio llenar (el backend también los descarta). */
function limpiar(b: Bloque): Bloque {
  if (b.tipo === "QUIENES") return { ...b, datos: { ...b.datos, datos: b.datos.datos.filter((x) => x.valor.trim() && x.etiqueta.trim()) } };
  if (b.tipo === "PREGUNTAS") {
    return { ...b, datos: { ...b.datos, items: b.datos.items.filter((x) => x.pregunta.trim() && x.respuesta.trim()) } };
  }
  return b;
}

export default function SitioEditor({ estado, sitio, onCambiar, onEstado, antes, onError, onAviso }: PropsSitioEditor) {
  const [ocupado, setOcupado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [editando, setEditando] = useState<Bloque | null>(null);
  const [problema, setProblema] = useState("");
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [aBorrar, setABorrar] = useState<string | null>(null);
  const inputFotos = useRef<HTMLInputElement>(null);

  /** Una acción que va al toque: primero lo pendiente, después ella. */
  const alToque = async (accion: () => Promise<EstadoEditor>, ok?: string) => {
    setOcupado(true);
    onError("");
    try {
      await antes();
      onEstado(await accion());
      if (ok) onAviso(ok);
    } catch (e) {
      onError(mensaje(e));
    } finally {
      setOcupado(false);
    }
  };

  /** Achica cada foto en el navegador y la sube; devuelve las que quedaron. */
  const subir = async (archivos: FileList | null): Promise<string[]> => {
    const lista = Array.from(archivos ?? []);
    if (!lista.length) return [];
    const libres = estado.limites.fotos - estado.fotos.length;
    if (libres <= 0) {
      onError(`Ya tenés ${estado.limites.fotos} fotos: borrá alguna que no uses para subir otra.`);
      return [];
    }
    setSubiendo(true);
    onError("");
    const subidas: string[] = [];
    try {
      for (const archivo of lista.slice(0, libres)) {
        const blob = await prepararImagen(archivo, "portada");
        if (blob.size > TOPE_SUBIDA) throw new Error("La foto pesa más de 2 MB aun achicada. Probá con otra.");
        const r = await apiPagina.subirFotoSitio(blob);
        subidas.push(r.foto);
        onEstado(r.estado);
      }
      if (lista.length > libres) onError(`Se subieron ${libres}: llegaste al tope de ${estado.limites.fotos} fotos.`);
    } catch (e) {
      onError(mensaje(e, "No se pudo subir la foto"));
    } finally {
      setSubiendo(false);
    }
    return subidas;
  };

  if (!estado.disponible) return null;

  // ── Sin sitio todavía: elegir plantilla ──
  if (!sitio) {
    const plantillas = PLANTILLAS_SITIO.filter((p) => estado.plantillas.includes(p.clave));
    return (
      <Seccion titulo="Sitio web">
        <p className="-mt-2 text-sm text-texto-2">
          Tu plan incluye un sitio armado por bloques: portada con fotos, tu catálogo, quiénes son, galería, preguntas y
          cómo llegar. Elegí la plantilla y sale llena con lo que ya cargaste.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {plantillas.map((p) => {
            const sugerida = p.clave === estado.plantillaSugerida;
            return (
              <button
                key={p.clave}
                type="button"
                disabled={ocupado}
                onClick={() => void alToque(() => apiPagina.elegirPlantillaSitio(p.clave), "Tu sitio está armado en borrador")}
                className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left hover:bg-muted disabled:opacity-60 ${
                  sugerida ? "border-2 border-emerald-700" : "border-borde"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[15px] text-texto">{p.nombre}</strong>
                  {sugerida && <Badge tono="verde">Sugerida</Badge>}
                </span>
                <span className="text-[13px] text-texto-3">{p.detalle}</span>
              </button>
            );
          })}
        </div>
      </Seccion>
    );
  }

  // ── Con sitio ──
  const progreso = progresoSitio(sitio);
  const bloques = sitio.bloques;
  const cambiarBloque = (i: number, nuevo: Bloque) => onCambiar({ ...sitio, bloques: bloques.map((b, j) => (j === i ? nuevo : b)) });
  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= bloques.length) return;
    const lista = [...bloques];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    onCambiar({ ...sitio, bloques: lista });
  };
  const abrir = (tipo: TipoBloque) => {
    const b = bloques.find((x) => x.tipo === tipo);
    if (b && EDITABLES.has(b.tipo)) {
      setProblema("");
      setEditando(b);
    }
  };
  const listo = () => {
    if (!editando) return;
    const p = problemaDe(editando);
    if (p) {
      setProblema(p);
      return;
    }
    const i = bloques.findIndex((b) => b.tipo === editando.tipo);
    if (i >= 0) cambiarBloque(i, limpiar(editando));
    setEditando(null);
  };
  const usadas = new Set(estado.fotosPublicadas);

  return (
    <Seccion
      titulo="Sitio web"
      extra={
        <div className="flex flex-wrap gap-2" role="group" aria-label="Plantilla">
          {PLANTILLAS_SITIO.filter((p) => estado.plantillas.includes(p.clave)).map((p) => (
            <button
              key={p.clave}
              type="button"
              aria-pressed={sitio.plantilla === p.clave}
              disabled={ocupado}
              onClick={() =>
                sitio.plantilla !== p.clave &&
                void alToque(() => apiPagina.elegirPlantillaSitio(p.clave as PlantillaSitio), `Plantilla ${p.nombre}`)
              }
              className={`min-h-9 rounded-[10px] border px-3 text-[13px] font-semibold ${
                sitio.plantilla === p.clave ? "border-slate-800 bg-slate-800 text-white" : "border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-2 rounded-xl bg-muted p-3">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm text-texto">Tu sitio está al {progreso.porcentaje} %</strong>
        </div>
        <div
          role="progressbar"
          aria-label="Cuánto del sitio está completo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progreso.porcentaje}
          className="h-2.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div className="h-full rounded-full bg-emerald-700" style={{ width: `${progreso.porcentaje}%` }} />
        </div>
        {progreso.faltan.length > 0 && (
          <ul className="space-y-1 text-[13px]" aria-label="Lo que falta">
            {progreso.faltan.map((f) => (
              <li key={f.tipo}>
                <button type="button" onClick={() => abrir(f.tipo)} className="text-left font-semibold text-amber-800 underline-offset-2 hover:underline">
                  {f.texto}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[13px] text-texto-3">
        El color, la letra del nombre y el logo salen de Apariencia. Cada bloque se prende o se apaga, y con las flechas
        cambiás el orden.
      </p>
      <ol className="space-y-2" aria-label="Bloques del sitio">
        {bloques.map((b, i) => {
          const nombre = nombreBloque(b.tipo, sitio.plantilla);
          const nota = notaDe(b, estado.limites);
          return (
            <li key={b.tipo} className={`flex items-center gap-2 rounded-xl border border-borde-soft p-2 ${b.visible ? "" : "opacity-70"}`}>
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`Subir ${nombre}`}
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                  className="rounded p-1 text-texto-3 hover:bg-muted disabled:opacity-30"
                >
                  <Icon name="chevronDown" size={14} className="rotate-180" />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${nombre}`}
                  disabled={i === bloques.length - 1}
                  onClick={() => mover(i, 1)}
                  className="rounded p-1 text-texto-3 hover:bg-muted disabled:opacity-30"
                >
                  <Icon name="chevronDown" size={14} />
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-sm text-texto">{nombre}</strong>
                <span className={`text-xs ${nota.falta && b.visible ? "font-semibold text-amber-800" : "text-texto-3"}`}>{nota.texto}</span>
              </div>
              {EDITABLES.has(b.tipo) && (
                <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" aria-label={`Editar ${nombre}`} onClick={() => abrir(b.tipo)}>
                  Editar
                </Boton>
              )}
              <Interruptor prendido={b.visible} etiqueta={`Mostrar ${nombre}`} onCambio={() => cambiarBloque(i, { ...b, visible: !b.visible } as Bloque)} />
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm text-texto">
            Tus fotos ({estado.fotos.length} de {estado.limites.fotos})
          </strong>
          <Boton variante="ghost" icono="camara" disabled={subiendo} onClick={() => inputFotos.current?.click()}>
            {subiendo ? "Subiendo…" : "Subir fotos"}
          </Boton>
          <input
            ref={inputFotos}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Subir fotos al sitio"
            onChange={async (ev) => {
              await subir(ev.target.files);
              ev.target.value = "";
            }}
          />
        </div>
        {estado.fotos.length === 0 ? (
          <p className="text-[13px] text-texto-3">Subí fotos de tu local, tus productos o tus trabajos y elegilas en la portada o la galería.</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Fotos del sitio">
            {estado.fotos.map((f, i) => {
              const publicada = usadas.has(f.foto);
              return (
                <li key={f.foto} className="relative">
                  <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                    {f.url && <img src={urlDeImagen(f.url) ?? undefined} alt={`Foto ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <button
                    type="button"
                    aria-label={publicada ? `La foto ${i + 1} está en tu sitio publicado` : `Borrar la foto ${i + 1}`}
                    title={publicada ? "Está en tu sitio publicado: sacala de los bloques y publicá para poder borrarla." : "Borrar"}
                    disabled={publicada || ocupado}
                    onClick={() => setABorrar(f.foto)}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-danger-text shadow disabled:text-texto-4"
                  >
                    <Icon name={publicada ? "lock" : "trash"} size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-end">
        <Boton variante="ghost" disabled={ocupado} onClick={() => setConfirmarQuitar(true)}>
          Volver a la página simple
        </Boton>
      </div>

      <Modal
        abierto={editando !== null}
        titulo={editando ? nombreBloque(editando.tipo, sitio.plantilla) : ""}
        onClose={() => setEditando(null)}
        cerrarAlClicAfuera={false}
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton onClick={listo}>Listo</Boton>
          </>
        }
      >
        {editando && (
          <div className="space-y-3">
            {problema && (
              <p role="alert" className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text">
                {problema}
              </p>
            )}
            <FormularioBloque
              bloque={editando}
              estado={estado}
              onDatos={(datos) => setEditando({ ...editando, datos } as Bloque)}
              subir={subir}
              subiendo={subiendo}
            />
          </div>
        )}
      </Modal>
      <Confirmar
        abierto={confirmarQuitar}
        titulo="Volver a la página simple"
        texto="Tu página vuelve a verse como antes del sitio cuando publiques. Lo que cargaste en los bloques se pierde; las fotos quedan."
        etiquetaOk="Volver a la página simple"
        peligroso
        onCancel={() => setConfirmarQuitar(false)}
        onOk={() => {
          setConfirmarQuitar(false);
          void alToque(() => apiPagina.quitarSitio(), "Al publicar, tu página vuelve a la de siempre");
        }}
      />
      <Confirmar
        abierto={aBorrar !== null}
        titulo="Borrar la foto"
        texto="¿Borrar esta foto? Sale también de los bloques que la usan."
        etiquetaOk="Borrar"
        peligroso
        onCancel={() => setABorrar(null)}
        onOk={() => {
          const foto = aBorrar;
          setABorrar(null);
          if (foto) void alToque(() => apiPagina.borrarFotoSitio(foto), "Foto borrada");
        }}
      />
    </Seccion>
  );
}
