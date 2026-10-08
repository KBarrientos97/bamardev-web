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
import { iconoDe, nombreTipo, paleta } from "../../lib/pagina/aspecto";
import { cargarFuentesPagina } from "../../lib/pagina/estilos";
import { prepararImagen } from "../../lib/pagina/imagen";
import type {
  AjustesPagina,
  CambiosPagina,
  EnlaceEditor,
  EnlaceInput,
  EstadoEditor,
  FormatoEnlace,
  SucursalEditor,
  TipoEnlace,
} from "../../lib/pagina/tipos";
import { vistaDesdeEditor } from "../../lib/pagina/vista";
import { useApi } from "../../lib/useApi";
import CartelQR from "./CartelQR";
import EditorEnlace from "./EditorEnlace";
import { EditorAnuncio, SelectorForma, SelectorLetra } from "./EstilosPagina";
import { Trazo } from "./VistaPagina";
import VistaPrevia, { type ModoPrevia } from "./VistaPrevia";

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

/** Lo que el dueño escribió en una sucursal y todavía no se guardó. */
type BorradorSucursal = { horarioTexto: string; mapsUrl: string };

/**
 * Una sucursal en la página: si sale (se guarda al toque, como los enlaces),
 * su horario y su mapa. Esos dos van al borrador y se guardan con "Guardar
 * cambios": antes tenían un botón propio y el dueño, con razón, apretaba el
 * de abajo y el mapa se perdía sin aviso.
 */
function FilaSucursal({
  s,
  borrador,
  acento,
  onCambio,
  onGuardada,
  onError,
}: {
  s: SucursalEditor;
  borrador: BorradorSucursal | undefined;
  acento: string;
  onCambio: (b: BorradorSucursal) => void;
  onGuardada: (s: SucursalEditor) => void;
  onError: (m: string) => void;
}) {
  const horario = borrador?.horarioTexto ?? s.horarioTexto ?? "";
  const mapa = borrador?.mapsUrl ?? s.mapsUrl ?? "";
  const [guardando, setGuardando] = useState(false);
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
            <Input
              aria-label={`Horario de ${s.nombre}`}
              value={horario}
              onChange={(e) => onCambio({ horarioTexto: e.target.value, mapsUrl: mapa })}
              maxLength={120}
            />
          </Campo>
          <Campo
            label="Enlace de Google Maps (opcional)"
            hint={
              s.direccion
                ? "Sin enlace, «Cómo llegar» busca la dirección."
                : "Sin enlace ni dirección cargada, la página no muestra «Cómo llegar»."
            }
          >
            <Input
              aria-label={`Mapa de ${s.nombre}`}
              value={mapa}
              onChange={(e) => onCambio({ horarioTexto: horario, mapsUrl: e.target.value })}
              placeholder="https://maps.app.goo.gl/…"
            />
          </Campo>
        </div>
      )}
    </div>
  );
}

type OpcionPrincipal = "RESERVAR" | "WHATSAPP" | "OTRO" | "NINGUNO";

/**
 * El botón grande de arriba, que es opcional: no todos los negocios reservan
 * (una pollería quiere su WhatsApp o su menú). Por debajo sigue siendo lo de
 * siempre —`mostrarReservar` y el enlace destacado—; esto sólo lo presenta
 * como una elección, y si el WhatsApp o el botón todavía no existen, los crea.
 */
function BotonPrincipal({
  reservaOnline,
  ajustes,
  enlaces,
  acento,
  opcionUi,
  setOpcionUi,
  cambiar,
  onCrear,
}: {
  reservaOnline: boolean;
  ajustes: AjustesPagina;
  enlaces: EnlaceEditor[];
  acento: string;
  /** La elección que todavía no tiene enlace (WhatsApp sin cargar, botón por crear). */
  opcionUi: OpcionPrincipal | null;
  setOpcionUi: (o: OpcionPrincipal | null) => void;
  cambiar: (c: CambiosPagina) => void;
  onCrear: (tipo: TipoEnlace) => void;
}) {
  const destacado = enlaces.find((x) => x.id === ajustes.enlaceDestacadoId) ?? null;
  const whatsapps = enlaces.filter((x) => x.tipo === "WHATSAPP");
  const otros = enlaces.filter((x) => x.tipo !== "WHATSAPP");
  const derivada: OpcionPrincipal =
    reservaOnline && ajustes.mostrarReservar
      ? "RESERVAR"
      : destacado
        ? destacado.tipo === "WHATSAPP"
          ? "WHATSAPP"
          : "OTRO"
        : "NINGUNO";
  const opcion = opcionUi ?? derivada;

  const elegir = (o: OpcionPrincipal) => {
    setOpcionUi(null);
    if (o === "RESERVAR") return cambiar({ mostrarReservar: true });
    if (o === "NINGUNO") return cambiar({ mostrarReservar: false, enlaceDestacadoId: null });
    const candidatos = o === "WHATSAPP" ? whatsapps : otros;
    const actual = candidatos.find((x) => x.id === destacado?.id);
    if (candidatos.length === 0) {
      // Todavía no hay a qué apuntar: queda elegido y se ofrece crearlo.
      setOpcionUi(o);
      return cambiar({ mostrarReservar: false, enlaceDestacadoId: null });
    }
    cambiar({ mostrarReservar: false, enlaceDestacadoId: (actual ?? candidatos[0]).id });
  };

  const opciones: { valor: OpcionPrincipal; titulo: string; detalle: string }[] = [
    ...(reservaOnline
      ? [{ valor: "RESERVAR" as const, titulo: "Reservar turno", detalle: "Lleva a tu reserva online." }]
      : []),
    { valor: "WHATSAPP", titulo: "WhatsApp", detalle: "Te escriben directo a tu número." },
    { valor: "OTRO", titulo: "Otro botón", detalle: "Tu menú, un formulario, una red: el texto y el enlace que quieras." },
    {
      valor: "NINGUNO",
      titulo: "Sin botón principal",
      detalle: reservaOnline ? "La reserva online sigue andando con su enlace." : "Sólo tus redes y tus botones.",
    },
  ];

  const selectorDe = (lista: EnlaceEditor[], etiqueta: string) => (
    <Select
      aria-label={etiqueta}
      value={String(ajustes.enlaceDestacadoId ?? "")}
      onChange={(ev) => cambiar({ mostrarReservar: false, enlaceDestacadoId: Number(ev.target.value) })}
    >
      {lista.map((x) => (
        <option key={x.id} value={x.id}>
          {x.etiqueta}
        </option>
      ))}
    </Select>
  );

  return (
    <fieldset className="space-y-2">
      <legend className="block text-[13px] font-semibold text-texto-2">Botón principal</legend>
      <p className="text-xs text-texto-3">El botón grande, arriba de todo. Es opcional.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => {
          const elegida = opcion === o.valor;
          return (
            <label
              key={o.valor}
              className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3"
              style={{ borderColor: elegida ? acento : "#E5E7EB", boxShadow: elegida ? `0 0 0 1px ${acento}` : undefined }}
            >
              <input
                type="radio"
                name="boton-principal"
                className="mt-0.5 h-[18px] w-[18px] shrink-0"
                style={{ accentColor: acento }}
                checked={elegida}
                onChange={() => elegir(o.valor)}
              />
              <span className="flex min-w-0 flex-col">
                <strong className="text-sm text-texto">{o.titulo}</strong>
                <span className="text-xs text-texto-3">{o.detalle}</span>
              </span>
            </label>
          );
        })}
      </div>
      {opcion === "WHATSAPP" &&
        (whatsapps.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
            <span className="text-sm text-texto-2">Todavía no cargaste tu WhatsApp.</span>
            <Boton icono="plus" onClick={() => onCrear("WHATSAPP")}>
              Agregar mi WhatsApp
            </Boton>
          </div>
        ) : (
          whatsapps.length > 1 && selectorDe(whatsapps, "Qué WhatsApp")
        ))}
      {opcion === "OTRO" && (
        <div className="flex flex-wrap items-center gap-2">
          {otros.length > 0 && <div className="min-w-0 flex-[1_1_220px]">{selectorDe(otros, "Qué botón")}</div>}
          <Boton variante={otros.length > 0 ? "ghost" : "primary"} icono="plus" onClick={() => onCrear("BOTON")}>
            Crear botón personalizado
          </Boton>
        </div>
      )}
    </fieldset>
  );
}

/**
 * "Mi página" (lienzo MiPagina, B2): el editor de la página pública del
 * negocio, con la vista previa en vivo al lado. Sólo el ADMIN y con la
 * feature `pagina_publica` (permisos.ts y el backend).
 *
 * La apariencia, la presentación y el horario y el mapa de cada sucursal se
 * juntan en un borrador y se guardan con "Guardar cambios"; los enlaces, si
 * una sucursal sale o no, y las imágenes se guardan al toque (cada uno es una
 * acción completa).
 */
export default function MiPagina() {
  const carga = useApi(() => apiPagina.estado(), []);
  const [borrador, setBorrador] = useState<CambiosPagina>({});
  // Sólo las sucursales cambiadas: una que vuelve a su valor guardado sale.
  const [borradorSucursales, setBorradorSucursales] = useState<Record<number, BorradorSucursal>>({});
  const [aviso, setAviso] = useAviso();
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editor, setEditor] = useState<{
    abierto: boolean;
    enlace: EnlaceEditor | null;
    tipo?: TipoEnlace;
    formato?: FormatoEnlace;
    /** Se crea desde "Botón principal": al guardarlo queda como principal. */
    principal?: boolean;
  }>({ abierto: false, enlace: null });
  const [aBorrar, setABorrar] = useState<EnlaceEditor | null>(null);
  const [cartel, setCartel] = useState(false);
  const [previaCelular, setPreviaCelular] = useState(false);
  const [modoPrevia, setModoPrevia] = useState<ModoPrevia>("movil");
  const [opcionPrincipal, setOpcionPrincipal] = useState<OpcionPrincipal | null>(null);
  const arrastrado = useRef<number | null>(null);

  // Roboto; la letra del nombre la carga su selector (sólo las que se ven).
  useEffect(() => cargarFuentesPagina(), []);

  // Con cambios sin guardar, el navegador pregunta antes de cerrar o recargar:
  // la apariencia se arma de a poco y perderla entera por un F5 desanima.
  const haySinGuardar = Object.keys(borrador).length > 0 || Object.keys(borradorSucursales).length > 0;
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
  const limpio = (b: BorradorSucursal) => ({
    horarioTexto: b.horarioTexto.trim() || null,
    mapsUrl: b.mapsUrl.trim() || null,
  });
  // La vista previa muestra el horario y el mapa que se están escribiendo.
  const sucursalesEditadas = e.sucursales.map((s) =>
    borradorSucursales[s.id] ? { ...s, ...limpio(borradorSucursales[s.id]) } : s,
  );
  const editado: EstadoEditor = { ...e, pagina: ajustes, sucursales: sucursalesEditadas };
  const vista = vistaDesdeEditor(editado);
  const c = paleta(vista.color.hex);
  const sucio = haySinGuardar;
  const cambiar = (cambios: CambiosPagina) => setBorrador((b) => ({ ...b, ...cambios }));
  const enlaces = [...e.enlaces].sort((a, b) => a.orden - b.orden || a.id - b.id);

  const cambiarSucursal = (s: SucursalEditor, b: BorradorSucursal) =>
    setBorradorSucursales((todos) => {
      const resto = { ...todos };
      if (b.horarioTexto === (s.horarioTexto ?? "") && b.mapsUrl === (s.mapsUrl ?? "")) delete resto[s.id];
      else resto[s.id] = b;
      return resto;
    });

  const guardar = async (extra: CambiosPagina = {}, texto = "Cambios guardados") => {
    setGuardando(true);
    setError("");
    try {
      // Primero las sucursales: si un mapa no es de Google Maps, el error
      // dice cuál y el resto de lo escrito sigue en pantalla.
      let sucursales = e.sucursales;
      for (const [id, b] of Object.entries(borradorSucursales)) {
        const s = e.sucursales.find((x) => x.id === Number(id));
        try {
          const nueva = await apiPagina.sucursal(Number(id), limpio(b));
          sucursales = sucursales.map((x) => (x.id === nueva.id ? { ...x, ...nueva } : x));
          setBorradorSucursales((todos) => {
            const resto = { ...todos };
            delete resto[Number(id)];
            return resto;
          });
        } catch (err) {
          carga.setDatos({ ...e, sucursales });
          throw new Error(`${s?.nombre ?? "Sucursal"}: ${mensaje(err)}`);
        }
      }
      const cambios = { ...borrador, ...extra };
      if (Object.keys(cambios).length > 0) {
        carga.setDatos(await apiPagina.guardar(cambios));
        setBorrador({});
      } else {
        carga.setDatos({ ...e, sucursales });
      }
      setAviso(texto);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  const guardarEnlace = async (input: EnlaceInput) => {
    if (editor.enlace) await apiPagina.editarEnlace(editor.enlace.id, input);
    else {
      const nuevo = await apiPagina.crearEnlace(input);
      // Creado desde "Botón principal": queda elegido en el borrador, como
      // cualquier otro cambio de la presentación (se guarda con el resto).
      if (editor.principal) {
        setOpcionPrincipal(null);
        cambiar({ mostrarReservar: false, enlaceDestacadoId: nuevo.id });
      }
    }
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

  // A la dirección que se comparte (`link…/<sub>` cuando el backend la tiene
  // configurada); si no vino, a la de siempre dentro de la app.
  const urlCompleta = e.subdominio ? (e.urlPublica ?? `/p/${e.subdominio}`) : null;
  const previa = (
    <VistaPrevia
      pagina={vista}
      modo={modoPrevia}
      onModo={setModoPrevia}
      direccion={(urlCompleta ?? "").replace(/^https?:\/\//, "")}
      urlCompleta={e.pagina.publicada ? urlCompleta : null}
      colorEnlace={c.oscuro}
    />
  );
  // En computadora la vista previa necesita el ancho entero: va arriba del
  // formulario y no en la columna de al lado.
  const previaAncha = modoPrevia === "escritorio";

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

      {previaAncha && <section className="card p-3 sm:p-4">{previa}</section>}

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

            <SelectorForma valor={ajustes.formaBotones} c={c} onCambio={(f) => cambiar({ formaBotones: f })} />
            <SelectorLetra
              valor={ajustes.tipografia}
              nombre={e.negocio.nombre}
              c={c}
              onCambio={(t) => cambiar({ tipografia: t })}
            />

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
            {ajustes.anuncioTexto?.trim() && (
              <EditorAnuncio ajustes={ajustes} c={c} muestras={e.muestras} cambiar={cambiar} />
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
            <BotonPrincipal
              reservaOnline={e.reservaOnline}
              ajustes={ajustes}
              enlaces={enlaces}
              acento={c.acento}
              opcionUi={opcionPrincipal}
              setOpcionUi={setOpcionPrincipal}
              cambiar={cambiar}
              onCrear={(tipo) => setEditor({ abierto: true, enlace: null, tipo, formato: "BOTON", principal: true })}
            />
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
            <p className="-mt-2 text-[13px] text-texto-3">
              La dirección y el teléfono salen de tus sucursales. El horario y el mapa se guardan con «Guardar cambios».
            </p>
            {e.sucursales.length === 0 ? (
              <p className="text-sm text-texto-3">No hay sucursales activas.</p>
            ) : (
              <div className="space-y-2">
                {e.sucursales.map((s) => (
                  <FilaSucursal
                    key={s.id}
                    s={s}
                    borrador={borradorSucursales[s.id]}
                    acento={c.acento}
                    onCambio={(b) => cambiarSucursal(s, b)}
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
            {!previaAncha && (
              <Boton variante="ghost" className="lg:hidden" onClick={() => setPreviaCelular((v) => !v)}>
                {previaCelular ? "Ocultar vista previa" : "Ver vista previa"}
              </Boton>
            )}
            <Boton
              variante="ghost"
              disabled={!sucio || guardando}
              onClick={() => {
                setBorrador({});
                setBorradorSucursales({});
                setOpcionPrincipal(null);
              }}
            >
              Descartar
            </Boton>
            <Boton disabled={!sucio || guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </div>
          {!previaAncha && previaCelular && <div className="lg:hidden">{previa}</div>}
        </div>

        {!previaAncha && <aside className="sticky top-4 hidden flex-[1_1_300px] lg:block">{previa}</aside>}
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
