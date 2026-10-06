import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Select,
  useAviso,
} from "../../components/ui";
import { apiPagina, urlDeImagen } from "../../lib/pagina/apiPagina";
import {
  cargarFuentesPagina,
  FUENTE_TITULO,
  iconoDe,
  NOMBRE_FORMA,
  NOMBRE_TIPOGRAFIA,
  nombreTipo,
  paleta,
  RADIO_BOTON,
} from "../../lib/pagina/aspecto";
import { prepararImagen } from "../../lib/pagina/imagen";
import type {
  AjustesPagina,
  CambiosPagina,
  EnlaceEditor,
  EnlaceInput,
  EstadoEditor,
  FormaBotones,
  FormatoEnlace,
  SucursalEditor,
  TipoEnlace,
  Tipografia,
} from "../../lib/pagina/tipos";
import { vistaDesdeEditor } from "../../lib/pagina/vista";
import { useApi } from "../../lib/useApi";
import CartelQR from "./CartelQR";
import EditorEnlace from "./EditorEnlace";
import VistaPagina, { Trazo } from "./VistaPagina";

const MAX_DESCRIPCION = 160;

const mensaje = (e: unknown, defecto = "No se pudo guardar") => (e instanceof Error ? e.message : defecto);

function Seccion({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-texto">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** Logo o portada: elegir, achicar en el navegador, subir, quitar. */
function Imagen({
  tipo,
  url,
  acento,
  iniciales,
  onCambio,
  onError,
}: {
  tipo: "logo" | "portada";
  url: string | null;
  acento: string;
  iniciales: string;
  onCambio: () => void;
  onError: (m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const src = urlDeImagen(url);
  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    onError("");
    try {
      const blob = await prepararImagen(archivo, tipo);
      await apiPagina.subirImagen(tipo, blob);
      onCambio();
    } catch (e) {
      onError(mensaje(e, "No se pudo subir la imagen"));
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };
  const quitar = async () => {
    try {
      await apiPagina.borrarImagen(tipo);
      onCambio();
    } catch (e) {
      onError(mensaje(e));
    }
  };
  const esLogo = tipo === "logo";
  return (
    <div className="space-y-2">
      <span className="block text-[13px] font-semibold text-texto-2">{esLogo ? "Logo" : "Foto de portada"}</span>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3">
        {src ? (
          <img
            src={src}
            alt={esLogo ? "Logo actual" : "Portada actual"}
            className={esLogo ? "h-14 w-14 shrink-0 rounded-full object-cover" : "h-14 w-24 shrink-0 rounded-lg object-cover"}
          />
        ) : (
          <div
            className={`flex shrink-0 items-center justify-center text-sm font-bold text-white ${esLogo ? "h-14 w-14 rounded-full" : "h-14 w-24 rounded-lg"}`}
            style={{ background: esLogo ? acento : paleta(acento).barra }}
          >
            {esLogo ? iniciales : ""}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => input.current?.click()} disabled={subiendo}>
              {subiendo ? "Subiendo…" : src ? (esLogo ? "Cambiar logo" : "Cambiar foto") : esLogo ? "Subir logo" : "Subir foto"}
            </Boton>
            {src && (
              <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={quitar} disabled={subiendo}>
                Quitar
              </Boton>
            )}
          </div>
          <span className="text-[11px] text-texto-4">
            {esLogo ? "PNG, JPG o WebP. Se recorta redondo." : "Horizontal. Sin foto, se usa el color."}
          </span>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={esLogo ? "Elegir logo" : "Elegir portada"}
          onChange={(e) => void elegir(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

/** Una sucursal en la página: si sale, su horario y su mapa. */
function FilaSucursal({
  s,
  acento,
  onGuardada,
  onError,
}: {
  s: SucursalEditor;
  acento: string;
  onGuardada: (s: SucursalEditor) => void;
  onError: (m: string) => void;
}) {
  const [horario, setHorario] = useState(s.horarioTexto ?? "");
  const [mapa, setMapa] = useState(s.mapsUrl ?? "");
  const [guardando, setGuardando] = useState(false);
  const sucio = horario !== (s.horarioTexto ?? "") || mapa !== (s.mapsUrl ?? "");
  const guardar = async (cambios: Partial<SucursalEditor>) => {
    setGuardando(true);
    onError("");
    try {
      onGuardada(await apiPagina.sucursal(s.id, cambios));
    } catch (e) {
      onError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-borde-soft p-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-[18px] w-[18px]"
          style={{ accentColor: acento }}
          checked={s.publicarEnPagina}
          disabled={guardando}
          onChange={(e) => void guardar({ publicarEnPagina: e.target.checked })}
        />
        <span className="flex min-w-0 flex-col">
          <strong className="text-sm text-texto">{s.nombre}</strong>
          <span className="text-xs text-texto-3">
            {s.direccion || "Sin dirección cargada"}
            {s.telefono ? ` · ${s.telefono}` : ""}
          </span>
        </span>
      </label>
      {s.publicarEnPagina && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo label="Horario" hint="Como lo dirías: «Lun a sáb 9:00 – 20:00»">
            <Input aria-label={`Horario de ${s.nombre}`} value={horario} onChange={(e) => setHorario(e.target.value)} maxLength={120} />
          </Campo>
          <Campo label="Enlace de Google Maps (opcional)" hint="Sin enlace, «Cómo llegar» busca la dirección.">
            <Input
              aria-label={`Mapa de ${s.nombre}`}
              value={mapa}
              onChange={(e) => setMapa(e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
            />
          </Campo>
          {sucio && (
            <div className="sm:col-span-2">
              <Boton
                variante="soft"
                disabled={guardando}
                onClick={() => void guardar({ horarioTexto: horario.trim() || null, mapsUrl: mapa.trim() || null })}
              >
                Guardar sucursal
              </Boton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Mi página" (lienzo MiPagina, B2): el editor de la página pública del
 * negocio, con la vista previa en vivo al lado. Sólo el ADMIN y con la
 * feature `pagina_publica` (permisos.ts y el backend).
 *
 * La apariencia y la presentación se juntan en un borrador y se guardan con
 * "Guardar cambios"; los enlaces, las sucursales y las imágenes se guardan al
 * toque (cada uno es una acción completa).
 */
export default function MiPagina() {
  const carga = useApi(() => apiPagina.estado(), []);
  const [borrador, setBorrador] = useState<CambiosPagina>({});
  const [aviso, setAviso] = useAviso();
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editor, setEditor] = useState<{
    abierto: boolean;
    enlace: EnlaceEditor | null;
    tipo?: TipoEnlace;
    formato?: FormatoEnlace;
  }>({ abierto: false, enlace: null });
  const [aBorrar, setABorrar] = useState<EnlaceEditor | null>(null);
  const [cartel, setCartel] = useState(false);
  const [previaCelular, setPreviaCelular] = useState(false);
  const arrastrado = useRef<number | null>(null);

  useEffect(cargarFuentesPagina, []);

  // Con cambios sin guardar, el navegador pregunta antes de cerrar o recargar:
  // la apariencia se arma de a poco y perderla entera por un F5 desanima.
  const haySinGuardar = Object.keys(borrador).length > 0;
  useEffect(() => {
    if (!haySinGuardar) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [haySinGuardar]);

  const e = carga.datos;
  if (!e) {
    if (carga.error) {
      return (
        <div className="mx-auto max-w-3xl p-4 sm:p-5">
          <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
        </div>
      );
    }
    return <Cargando />;
  }

  const ajustes: AjustesPagina = { ...e.pagina, ...borrador };
  const editado: EstadoEditor = { ...e, pagina: ajustes };
  const vista = vistaDesdeEditor(editado);
  const c = paleta(vista.color.hex);
  const sucio = Object.keys(borrador).length > 0;
  const cambiar = (cambios: CambiosPagina) => setBorrador((b) => ({ ...b, ...cambios }));
  const enlaces = [...e.enlaces].sort((a, b) => a.orden - b.orden || a.id - b.id);

  const guardar = async (extra: CambiosPagina = {}, texto = "Cambios guardados") => {
    setGuardando(true);
    setError("");
    try {
      const nuevo = await apiPagina.guardar({ ...borrador, ...extra });
      carga.setDatos(nuevo);
      setBorrador({});
      setAviso(texto);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  const guardarEnlace = async (input: EnlaceInput) => {
    if (editor.enlace) await apiPagina.editarEnlace(editor.enlace.id, input);
    else await apiPagina.crearEnlace(input);
    carga.recargar();
    setAviso(editor.enlace ? "Enlace actualizado" : "Enlace agregado");
  };

  const reordenar = async (ids: number[]) => {
    setError("");
    try {
      carga.setDatos(await apiPagina.ordenar(ids));
    } catch (err) {
      setError(mensaje(err));
    }
  };
  const mover = (id: number, delta: number) => {
    const ids = enlaces.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reordenar(ids);
  };
  const soltarSobre = (destino: number) => {
    const origen = arrastrado.current;
    arrastrado.current = null;
    if (origen == null || origen === destino) return;
    const ids = enlaces.map((x) => x.id).filter((id) => id !== origen);
    ids.splice(ids.indexOf(destino), 0, origen);
    void reordenar(ids);
  };

  const alternarVisible = async (x: EnlaceEditor) => {
    try {
      await apiPagina.editarEnlace(x.id, { visible: !x.visible });
      carga.recargar();
    } catch (err) {
      setError(mensaje(err));
    }
  };

  const copiar = async (texto: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(ok);
    } catch {
      setError("No se pudo copiar. Copialo a mano: " + texto);
    }
  };

  const compartir = async () => {
    setError("");
    try {
      const corto = await apiPagina.enlaceCorto("COMPARTIR");
      if (typeof navigator.share === "function") {
        await navigator.share({ title: e.negocio.nombre, url: corto.url }).catch(() => undefined);
      } else {
        await copiar(corto.url, "Enlace corto copiado");
      }
    } catch (err) {
      setError(mensaje(err));
    }
  };

  const sinDireccion = !e.subdominio;
  const estadoBadge = ajustes.bloqueada ? (
    <Badge tono="rojo">Despublicada por BamarDev</Badge>
  ) : e.pagina.publicada ? (
    <Badge tono="verde">Publicada</Badge>
  ) : (
    <Badge tono="gris">Sin publicar</Badge>
  );

  const previa = (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[13px] text-texto-3">Así se ve en un celular</span>
      <div className="h-[600px] w-[300px] overflow-hidden rounded-[36px] border-[10px] border-slate-800 bg-[#F6F7F9] shadow-xl">
        <div className="h-full overflow-y-auto">
          {/* Con el enlace de Privacidad del pie, como la página de verdad (B24). */}
          <VistaPagina pagina={vista} urlReservar="#" urlPrivacidad="#" enMarco />
        </div>
      </div>
      {/* A la dirección que se comparte (`link…/<sub>` cuando el backend
          la tiene configurada); si no vino, a la de siempre dentro de la app. */}
      {e.subdominio && e.pagina.publicada && (
        <a
          href={e.urlPublica ?? `/p/${e.subdominio}`}
          target="_blank"
          rel="noopener"
          className="text-sm font-semibold"
          style={{ color: c.oscuro }}
        >
          Ver la página completa
        </a>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Mi página"
        subtitulo="La que pegás en la bio de Instagram, TikTok y en tu estado de WhatsApp."
        accion={
          <div className="flex flex-wrap items-center gap-2">
            {estadoBadge}
            {!ajustes.bloqueada &&
              (e.pagina.publicada ? (
                <Boton variante="ghost" disabled={guardando} onClick={() => void guardar({ publicada: false }, "Tu página ya no está publicada")}>
                  Despublicar
                </Boton>
              ) : (
                <Boton disabled={guardando || sinDireccion} onClick={() => void guardar({ publicada: true }, "¡Tu página está publicada!")}>
                  Publicar
                </Boton>
              ))}
          </div>
        }
      />

      {ajustes.bloqueada && (
        <ErrorMsg>
          BamarDev despublicó tu página{e.pagina.motivoBloqueo ? `: ${e.pagina.motivoBloqueo}` : ""}. Podés seguir
          editándola; escribinos para revisarla y volver a publicarla.
        </ErrorMsg>
      )}
      {sinDireccion && (
        <ErrorMsg>Tu negocio todavía no tiene dirección pública. Pedísela a BamarDev para poder publicar.</ErrorMsg>
      )}
      <ErrorMsg>{error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_520px] space-y-4">
          {e.urlPublica && (
            <Seccion titulo="Tu dirección">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex min-h-11 min-w-0 flex-[1_1_240px] items-center break-all rounded-xl border border-borde bg-muted px-3.5 text-[15px] font-semibold">
                  {e.urlPublica.replace(/^https?:\/\//, "")}
                </span>
                <Boton variante="soft" onClick={() => void copiar(e.urlPublica!, "Dirección copiada")}>
                  Copiar
                </Boton>
                <Boton variante="ghost" onClick={() => void compartir()}>
                  Compartir
                </Boton>
                <Boton icono="qr" onClick={() => setCartel(true)}>
                  Descargar cartel QR
                </Boton>
              </div>
              <p className="text-xs text-texto-3">
                La dirección la configura BamarDev. Escribinos si querés cambiarla.
                {e.enlacesCortos && (
                  <>
                    {" "}
                    <Link to="/mis-enlaces" className="font-semibold text-primary-700">
                      Ver mis enlaces cortos
                    </Link>
                  </>
                )}
              </p>
            </Seccion>
          )}

          <Seccion titulo="Apariencia">
            <div className="grid gap-3 sm:grid-cols-2">
              <Imagen
                tipo="logo"
                url={e.imagenes.logo}
                acento={vista.color.hex}
                iniciales={e.negocio.iniciales}
                onCambio={() => {
                  carga.recargar();
                  setAviso("Logo actualizado");
                }}
                onError={setError}
              />
              <Imagen
                tipo="portada"
                url={e.imagenes.portada}
                acento={vista.color.hex}
                iniciales=""
                onCambio={() => {
                  carga.recargar();
                  setAviso("Portada actualizada");
                }}
                onError={setError}
              />
            </div>

            <div className="space-y-2">
              <span className="block text-[13px] font-semibold text-texto-2">Color de la página</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de la página">
                {e.muestras.map((m) => (
                  <button
                    key={m.clave}
                    type="button"
                    role="radio"
                    aria-checked={ajustes.colorClave === m.clave}
                    aria-label={`Color ${m.nombre}`}
                    title={m.nombre}
                    onClick={() => cambiar({ colorClave: m.clave })}
                    className="h-10 w-10 rounded-full"
                    style={{
                      background: m.hex,
                      border: `3px solid ${ajustes.colorClave === m.clave ? "#1F2937" : "#ffffff"}`,
                      boxShadow: "0 0 0 1px #E5E7EB",
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-texto-3">Todos los colores están probados para que el texto se lea bien.</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="block text-[13px] font-semibold text-texto-2">Forma de los botones</span>
                <div className="flex gap-1.5">
                  {(Object.keys(NOMBRE_FORMA) as FormaBotones[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={ajustes.formaBotones === f}
                      onClick={() => cambiar({ formaBotones: f })}
                      className="h-10 flex-1 text-[13px]"
                      style={{
                        borderRadius: RADIO_BOTON[f],
                        border: ajustes.formaBotones === f ? `2px solid ${c.acento}` : "1px solid #E5E7EB",
                        background: ajustes.formaBotones === f ? c.tinte : "#ffffff",
                        color: ajustes.formaBotones === f ? c.oscuro : "#374151",
                        fontWeight: ajustes.formaBotones === f ? 600 : 400,
                      }}
                    >
                      {NOMBRE_FORMA[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="block text-[13px] font-semibold text-texto-2">Letra del nombre</span>
                <div className="flex gap-1.5">
                  {(Object.keys(NOMBRE_TIPOGRAFIA) as Tipografia[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={ajustes.tipografia === t}
                      onClick={() => cambiar({ tipografia: t })}
                      className="h-10 flex-1 rounded-[10px] text-sm"
                      style={{
                        fontFamily: FUENTE_TITULO[t],
                        textTransform: t === "FUERTE" ? "uppercase" : undefined,
                        border: ajustes.tipografia === t ? `2px solid ${c.acento}` : "1px solid #E5E7EB",
                        background: ajustes.tipografia === t ? c.tinte : "#ffffff",
                        color: ajustes.tipografia === t ? c.oscuro : "#374151",
                        fontWeight: ajustes.tipografia === t ? 700 : 400,
                      }}
                    >
                      {NOMBRE_TIPOGRAFIA[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[3fr_1fr]">
              <Campo label="Anuncio destacado (opcional)" hint="Una franja arriba de los botones. Se quita sola el día que elijas.">
                <Input
                  aria-label="Anuncio destacado"
                  value={ajustes.anuncioTexto ?? ""}
                  onChange={(ev) => cambiar({ anuncioTexto: ev.target.value })}
                  placeholder="Este sábado: 20 % en color con tu reserva"
                  maxLength={120}
                />
              </Campo>
              <Campo label="Se quita solo el">
                <Input
                  aria-label="Se quita solo el"
                  type="date"
                  value={ajustes.anuncioHasta ?? ""}
                  onChange={(ev) => cambiar({ anuncioHasta: ev.target.value || null })}
                />
              </Campo>
            </div>
            {ajustes.anuncioTexto?.trim() && (
              <Campo label="Enlace del anuncio (opcional)">
                <Input
                  aria-label="Enlace del anuncio"
                  value={ajustes.anuncioUrl ?? ""}
                  onChange={(ev) => cambiar({ anuncioUrl: ev.target.value || null })}
                  placeholder="https://…"
                />
              </Campo>
            )}
          </Seccion>

          <Seccion titulo="Presentación">
            <Campo label="Descripción corta" hint={`${(ajustes.descripcion ?? "").length} de ${MAX_DESCRIPCION} caracteres`}>
              <textarea
                aria-label="Descripción corta"
                rows={2}
                maxLength={MAX_DESCRIPCION}
                value={ajustes.descripcion ?? ""}
                onChange={(ev) => cambiar({ descripcion: ev.target.value })}
                className="w-full resize-y rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                placeholder="Qué hacés, en una línea. Ej.: Pollo a la brasa y broaster desde 2009."
              />
            </Campo>
            <Campo
              label="Botón principal"
              hint={e.reservaOnline ? "Con la reserva online, «Reservar turno» va arriba de todo." : "El botón grande de arriba."}
            >
              <Select
                aria-label="Botón principal"
                value={
                  e.reservaOnline && ajustes.mostrarReservar ? "RESERVAR" : String(ajustes.enlaceDestacadoId ?? "")
                }
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === "RESERVAR") cambiar({ mostrarReservar: true });
                  else cambiar({ mostrarReservar: false, enlaceDestacadoId: v ? Number(v) : null });
                }}
              >
                {e.reservaOnline && <option value="RESERVAR">Reservar turno (reserva online)</option>}
                <option value="">Ninguno</option>
                {enlaces.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.etiqueta}
                  </option>
                ))}
              </Select>
            </Campo>
          </Seccion>

          <Seccion
            titulo="Redes y botones"
            extra={
              <div className="flex gap-2">
                <Boton
                  variante="ghost"
                  icono="plus"
                  onClick={() => setEditor({ abierto: true, enlace: null, tipo: "WHATSAPP", formato: "ICONO" })}
                >
                  Red social
                </Boton>
                <Boton icono="plus" onClick={() => setEditor({ abierto: true, enlace: null, tipo: "BOTON", formato: "BOTON" })}>
                  Botón
                </Boton>
              </div>
            }
          >
            {enlaces.length === 0 ? (
              <p className="text-sm text-texto-3">
                Todavía no hay enlaces. Empezá por tu WhatsApp, tu Facebook y tu Instagram: es lo que más se usa.
              </p>
            ) : (
              <ul className="space-y-2" aria-label="Enlaces de la página">
                {enlaces.map((x, i) => (
                  <li
                    key={x.id}
                    draggable
                    onDragStart={() => (arrastrado.current = x.id)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => soltarSobre(x.id)}
                    className={`flex items-center gap-2 rounded-xl border border-borde-soft p-2 ${x.visible ? "" : "opacity-60"}`}
                  >
                    <span className="hidden cursor-grab px-1 text-texto-4 sm:block" aria-hidden="true">
                      ⠿
                    </span>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Subir ${x.etiqueta}`}
                        disabled={i === 0}
                        onClick={() => mover(x.id, -1)}
                        className="rounded p-0.5 text-texto-3 hover:bg-muted disabled:opacity-30"
                      >
                        <Icon name="chevronDown" size={14} className="rotate-180" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${x.etiqueta}`}
                        disabled={i === enlaces.length - 1}
                        onClick={() => mover(x.id, 1)}
                        className="rounded p-0.5 text-texto-3 hover:bg-muted disabled:opacity-30"
                      >
                        <Icon name="chevronDown" size={14} />
                      </button>
                    </div>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: c.tinte }}
                    >
                      <Trazo d={iconoDe(x.tipo, x.icono)} color={c.oscuro} size={17} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <strong className="truncate text-sm text-texto">
                        {x.etiqueta}
                        {x.id === ajustes.enlaceDestacadoId && !(e.reservaOnline && ajustes.mostrarReservar) && (
                          <span className="ml-1.5 text-[11px] font-semibold" style={{ color: c.oscuro }}>
                            · principal
                          </span>
                        )}
                      </strong>
                      <span className="truncate text-xs text-texto-3">
                        {x.formato === "BOTON" ? "Botón" : "Ícono"} · {nombreTipo(x.tipo)} · {x.url}
                      </span>
                    </div>
                    <span className="hidden min-w-16 text-right text-xs text-texto-3 sm:block">
                      {x.clics} {x.clics === 1 ? "clic" : "clics"}
                    </span>
                    <label className="flex items-center gap-1.5 text-[13px] text-texto-2">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px]"
                        style={{ accentColor: c.acento }}
                        checked={x.visible}
                        onChange={() => void alternarVisible(x)}
                        aria-label={`Mostrar ${x.etiqueta}`}
                      />
                      <span className="hidden sm:inline">Visible</span>
                    </label>
                    <button
                      type="button"
                      aria-label={`Editar ${x.etiqueta}`}
                      onClick={() => setEditor({ abierto: true, enlace: x })}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white hover:bg-muted"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar ${x.etiqueta}`}
                      onClick={() => setABorrar(x)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white text-danger-text hover:bg-muted"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo="Sucursales en la página">
            <p className="-mt-2 text-[13px] text-texto-3">La dirección y el teléfono salen de tus sucursales.</p>
            {e.sucursales.length === 0 ? (
              <p className="text-sm text-texto-3">No hay sucursales activas.</p>
            ) : (
              <div className="space-y-2">
                {e.sucursales.map((s) => (
                  <FilaSucursal
                    key={`${s.id}-${s.publicarEnPagina}-${s.horarioTexto}-${s.mapsUrl}`}
                    s={s}
                    acento={c.acento}
                    onError={setError}
                    onGuardada={(nueva) => {
                      carga.setDatos({ ...e, sucursales: e.sucursales.map((x) => (x.id === nueva.id ? nueva : x)) });
                      setAviso("Sucursal actualizada");
                    }}
                  />
                ))}
              </div>
            )}
          </Seccion>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-borde bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Boton variante="ghost" className="lg:hidden" onClick={() => setPreviaCelular((v) => !v)}>
              {previaCelular ? "Ocultar vista previa" : "Ver vista previa"}
            </Boton>
            <Boton variante="ghost" disabled={!sucio || guardando} onClick={() => setBorrador({})}>
              Descartar
            </Boton>
            <Boton disabled={!sucio || guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </div>
          {previaCelular && <div className="lg:hidden">{previa}</div>}
        </div>

        <aside className="sticky top-4 hidden flex-[1_1_300px] lg:block">{previa}</aside>
      </div>

      <EditorEnlace
        abierto={editor.abierto}
        enlace={editor.enlace}
        tipoInicial={editor.tipo}
        formatoInicial={editor.formato}
        onClose={() => setEditor({ abierto: false, enlace: null })}
        onGuardar={guardarEnlace}
      />
      <Confirmar
        abierto={aBorrar !== null}
        titulo="Quitar enlace"
        texto={`¿Quitar «${aBorrar?.etiqueta ?? ""}» de tu página? Se pierden sus clics.`}
        etiquetaOk="Quitar"
        peligroso
        onCancel={() => setABorrar(null)}
        onOk={async () => {
          const x = aBorrar;
          setABorrar(null);
          if (!x) return;
          try {
            await apiPagina.borrarEnlace(x.id);
            carga.recargar();
            setAviso("Enlace quitado");
          } catch (err) {
            setError(mensaje(err));
          }
        }}
      />
      <CartelQR
        abierto={cartel}
        onClose={() => setCartel(false)}
        datos={{
          nombre: e.negocio.nombre,
          iniciales: e.negocio.iniciales,
          logoUrl: e.imagenes.logo,
          colorHex: vista.color.hex,
          reservar: vista.reservar,
        }}
      />
    </div>
  );
}
