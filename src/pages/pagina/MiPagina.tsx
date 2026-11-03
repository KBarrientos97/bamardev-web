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
  Modal,
  Select,
  useAviso,
} from "../../components/ui";
import { apiPagina, urlDeImagen } from "../../lib/pagina/apiPagina";
import { ICONO_RESERVAR, iconoDe, nombreTipo, paleta, type Paleta } from "../../lib/pagina/aspecto";
import { cargarFuentesPagina } from "../../lib/pagina/estilos";
import { estiloPagina, tonosPagina } from "../../lib/pagina/estilosPagina";
import { leerColoresDeImagen, muestrasDeColores } from "../../lib/pagina/coloresLogo";
import { prepararImagen } from "../../lib/pagina/imagen";
import { TOPE_CATALOGO } from "../../lib/pagina/catalogo";
import { resumenHorario } from "../../lib/pagina/horario";
import type {
  AjustesPagina,
  CambiosPagina,
  ClaveEstilo,
  EnlaceEditor,
  EnlaceInput,
  EstadoEditor,
  FormatoEnlace,
  FormaBotones,
  ItemCatalogoEditor,
  ProductoFijado,
  SucursalEditor,
  TipoEnlace,
  Tipografia,
} from "../../lib/pagina/tipos";
import { vistaDesdeEditor } from "../../lib/pagina/vista";
import { RUTA_SEDES } from "../../lib/academia/vista";
import { apiAcademiaPublica } from "../../lib/academia/apiPublica";
import type { CursoPublico } from "../../lib/academia/tipos";
import { numeroParaEditar } from "../../lib/pagina/whatsapp";
import { useApi } from "../../lib/useApi";
import CartelQR from "./CartelQR";
import CatalogoEditor from "./CatalogoEditor";
import CatalogoProductosEditor, { SelectorModoCatalogo } from "./CatalogoProductosEditor";
import EditorPedidosRegalos from "./EditorPedidosRegalos";
import { useAuthOpcional } from "../../store/AuthContext";
import { tieneFeature } from "../../lib/permisos";
import EditorEnlace from "./EditorEnlace";
import { EditorAnuncio, FilaEleccion, SelectorColorPagina, SelectorForma, SelectorLetra } from "./EstilosPagina";
import { Trazo } from "./VistaPagina";
import Seccion from "./Seccion";
import SelectorEstilo from "./SelectorEstilo";
import VistaPrevia, { type ModoPrevia } from "./VistaPrevia";

const MAX_DESCRIPCION = 160;

const mensaje = (e: unknown, defecto = "No se pudo guardar") => (e instanceof Error ? e.message : defecto);

/** Logo o portada: elegir, achicar en el navegador, subir, quitar. */
function Imagen({
  tipo,
  url,
  acento,
  iniciales,
  onCambio,
  onError,
  onArchivo,
}: {
  tipo: "logo" | "portada";
  url: string | null;
  acento: string;
  iniciales: string;
  onCambio: () => void;
  onError: (m: string) => void;
  /** El archivo recién elegido, antes de subirlo (para leerle los colores al logo). */
  onArchivo?: (archivo: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const src = urlDeImagen(url);
  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    onArchivo?.(archivo);
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

/**
 * Lo que el dueño escribió en una sucursal y todavía no se guardó: sólo su
 * WhatsApp. La dirección, la ubicación y el horario son de su ficha
 * (Configuración › Sucursales, 02-nov).
 */
type BorradorSucursal = { whatsapp: string };

/** Lo guardado de una sucursal, como borrador (para comparar y para seguir editando). */
const borradorDe = (s: SucursalEditor): BorradorSucursal => ({ whatsapp: numeroParaEditar(s.whatsapp) });

/** Lo escrito, como lo guarda el backend (vacío = null). */
const limpio = (b: BorradorSucursal) => ({ whatsapp: b.whatsapp.trim() || null });

/** Lo que se manda de una sucursal: el WhatsApp sólo si cambió (13-oct). */
const cuerpoSucursal = (s: SucursalEditor | undefined, b: BorradorSucursal) => {
  const { whatsapp } = limpio(b);
  return (whatsapp ?? "") === numeroParaEditar(s?.whatsapp) ? {} : { whatsapp };
};

/**
 * Un estado que vuelve de guardar la página o de ordenar los enlaces trae el
 * catálogo; si un backend anterior no lo manda, queda el que había.
 */
const conCatalogo = (nuevo: EstadoEditor, antes: EstadoEditor | null): EstadoEditor => ({
  ...nuevo,
  catalogo: nuevo.catalogo ?? antes?.catalogo,
  topeCatalogo: nuevo.topeCatalogo ?? antes?.topeCatalogo,
  productosCatalogo: nuevo.productosCatalogo ?? antes?.productosCatalogo,
  productosVendibles: nuevo.productosVendibles ?? antes?.productosVendibles,
  topeProductos: nuevo.topeProductos ?? antes?.topeProductos,
});

/**
 * Una sucursal en la página: si sale (va al borrador al toque, como los
 * enlaces) y su WhatsApp propio. La dirección, la ubicación y el horario se
 * ven resumidos y se editan en su ficha (Configuración › Sucursales): son de
 * la sucursal, no de la página (decisión del dueño, 02-nov).
 */
function FilaSucursal({
  s,
  borrador,
  c,
  academia,
  onCambio,
  onGuardada,
  onError,
}: {
  s: SucursalEditor;
  borrador: BorradorSucursal | undefined;
  c: Paleta;
  /** La academia no tiene la ficha de Configuración: sus datos se cargan en Sedes. */
  academia: boolean;
  onCambio: (b: BorradorSucursal) => void;
  onGuardada: (s: SucursalEditor) => void;
  onError: (m: string) => void;
}) {
  const actual = borrador ?? borradorDe(s);
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
  const horario = resumenHorario(s.horarioSemanal) ?? (s.horarioTexto?.trim() || null);
  const conUbicacion = s.latitud != null && s.longitud != null;
  return (
    <div className="space-y-3 rounded-xl border border-borde-soft p-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-[18px] w-[18px]"
          style={{ accentColor: c.acento }}
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
        <>
          <ul className="space-y-0.5 text-xs text-texto-3" aria-label={`Ficha de ${s.nombre}`}>
            <li>Horario: {horario ?? "sin cargar"}</li>
            <li>Ubicación en el mapa: {conUbicacion ? "marcada" : "sin marcar"}</li>
            <li>
              <Link to={academia ? RUTA_SEDES : "/configuracion/sucursales"} className="font-semibold" style={{ color: c.oscuro }}>
                Editar dirección, horario y ubicación
              </Link>
            </li>
          </ul>
          {/* 13-oct: opcional. Con dos o más números distintos, la página pregunta a cuál escribir. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Campo label="WhatsApp de esta sucursal (opcional)" hint="Vacío: usa el WhatsApp de tu página.">
              <Input
                aria-label={`WhatsApp de ${s.nombre}`}
                value={actual.whatsapp}
                onChange={(e) => onCambio({ ...actual, whatsapp: e.target.value })}
                inputMode="tel"
                placeholder="70123456"
                maxLength={40}
              />
            </Campo>
          </div>
        </>
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
 * A la vista, sólo lo elegido; las opciones, en un popup (como la apariencia).
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
  const [abierto, setAbierto] = useState(false);

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

  const resumen =
    opcion === "RESERVAR"
      ? "Reservar turno"
      : opcion === "WHATSAPP"
        ? destacado
          ? `WhatsApp · ${destacado.etiqueta}`
          : "WhatsApp (falta cargar tu número)"
        : opcion === "OTRO"
          ? (destacado?.etiqueta ?? "Otro botón (falta crearlo)")
          : "Sin botón principal";
  const icono =
    opcion === "RESERVAR" ? ICONO_RESERVAR : destacado ? iconoDe(destacado.tipo, destacado.icono) : null;
  const crear = (tipo: TipoEnlace) => {
    setAbierto(false);
    onCrear(tipo);
  };

  return (
    <>
      <FilaEleccion
        etiqueta="Botón principal"
        resumen={resumen}
        muestra={
          icono ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: acento }}>
              <Trazo d={icono} color="#ffffff" size={18} />
            </span>
          ) : (
            <span className="block h-9 w-9 rounded-lg border-2 border-dashed border-slate-300" />
          )
        }
        onAbrir={() => setAbierto(true)}
      />
      <Modal
        abierto={abierto}
        titulo="Botón principal"
        subtitulo="El botón grande, arriba de todo. Es opcional."
        onClose={() => setAbierto(false)}
        ancho="max-w-2xl"
        acciones={<Boton onClick={() => setAbierto(false)}>Listo</Boton>}
      >
        <fieldset className="space-y-3">
          <legend className="sr-only">Botón principal</legend>
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
                <Boton icono="plus" onClick={() => crear("WHATSAPP")}>
                  Agregar mi WhatsApp
                </Boton>
              </div>
            ) : (
              whatsapps.length > 1 && selectorDe(whatsapps, "Qué WhatsApp")
            ))}
          {opcion === "OTRO" && (
            <div className="flex flex-wrap items-center gap-2">
              {otros.length > 0 && <div className="min-w-0 flex-[1_1_220px]">{selectorDe(otros, "Qué botón")}</div>}
              <Boton variante={otros.length > 0 ? "ghost" : "primary"} icono="plus" onClick={() => crear("BOTON")}>
                Crear botón personalizado
              </Boton>
            </div>
          )}
        </fieldset>
      </Modal>
    </>
  );
}

/**
 * "Mi página" (lienzo MiPagina, B2): el editor de la página pública del
 * negocio, con la vista previa en vivo al lado. Sólo el ADMIN y con la
 * feature `pagina_publica` (permisos.ts y el backend).
 *
 * Todo lo que el dueño toca va al BORRADOR del servidor (PLAN-PAGINA-WEB
 * §4.2, decisión del 02-nov): lo que se escribe, solo, un rato después de
 * dejar de escribir; los enlaces, las imágenes y si una sucursal sale, al
 * toque. La página pública no cambia hasta "Publicar cambios" (o "Guardar
 * cambios" mientras la página no está publicada). Antes unas cosas salían al
 * toque y otras con el botón, y el dueño no sabía qué ya se veía.
 *
 * El catálogo es la excepción que queda: cada ítem se guarda al toque, como
 * antes (sus fotos pasan a borrador en la fase siguiente).
 */
export default function MiPagina() {
  const carga = useApi(() => apiPagina.estado(), []);
  // Opcional: los tests montan el editor sin sesión (sin features = falla abierto).
  const negocioSesion = useAuthOpcional()?.negocio;
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
  // La letra y la forma que tenía antes de cambiar de estilo: "Mantener los míos".
  const [avisoEstilo, setAvisoEstilo] = useState<{ tipografia: Tipografia; formaBotones: FormaBotones } | null>(null);
  // Los colores del logo (hex), para la fila "De tu logo" del popup de color.
  const [coloresLogo, setColoresLogo] = useState<string[]>([]);
  // Academias (P1): los cursos publicados, para que la vista previa muestre
  // la sección como la va a ver el público. Sólo con la preinscripción online.
  const conCursos = !!negocioSesion?.features?.includes("preinscripcion_online");
  const [cursosPrevia, setCursosPrevia] = useState<CursoPublico[] | null>(null);
  const subdominioGuardado = carga.datos?.subdominio ?? null;
  useEffect(() => {
    if (!conCursos || !subdominioGuardado) return;
    let vigente = true;
    apiAcademiaPublica
      .cursos(subdominioGuardado)
      .then((c) => vigente && setCursosPrevia(c))
      .catch(() => vigente && setCursosPrevia(null));
    return () => {
      vigente = false;
    };
  }, [conCursos, subdominioGuardado]);
  const arrastrado = useRef<number | null>(null);
  // Lo último que se cargó o se cambió: el catálogo se actualiza después de
  // cada respuesta y, entre una y otra, el render todavía no pasó.
  const ultimo = useRef<EstadoEditor | null>(null);
  ultimo.current = carga.datos;

  // Roboto; la letra del nombre la carga su selector (sólo las que se ven).
  useEffect(() => cargarFuentesPagina(), []);
  // La letra del texto del estilo que se está viendo en la vista previa.
  const estiloVisto = borrador.estiloClave ?? carga.datos?.pagina.estiloClave;
  useEffect(() => cargarFuentesPagina(undefined, estiloVisto), [estiloVisto]);

  // Los colores del logo ya subido. Se lee del API con CORS (ver
  // coloresLogo.ts); si el navegador no deja leerlo, la fila no aparece y
  // vuelve a aparecer al elegir un logo nuevo (que se lee del archivo local).
  const logoGuardado = carga.datos?.imagenes.logo ?? null;
  useEffect(() => {
    if (!logoGuardado) return;
    let vigente = true;
    const url = urlDeImagen(logoGuardado);
    if (url) void leerColoresDeImagen(url).then((c) => vigente && c.length > 0 && setColoresLogo(c));
    return () => {
      vigente = false;
    };
  }, [logoGuardado]);

  // Lo escrito que todavía no llegó al borrador del servidor. Con eso, el
  // navegador pregunta antes de cerrar o recargar.
  const haySinGuardar = Object.keys(borrador).length > 0 || Object.keys(borradorSucursales).length > 0;
  useEffect(() => {
    if (!haySinGuardar) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [haySinGuardar]);

  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const pendiente = useRef({ borrador, borradorSucursales });
  pendiente.current = { borrador, borradorSucursales };
  const montado = useRef(true);

  /**
   * Manda lo pendiente al borrador. Lo que se siguió escribiendo mientras la
   * respuesta viajaba queda en pantalla y sale en la próxima vuelta.
   */
  const enviar = async () => {
    const { borrador: cambios, borradorSucursales: sucursales } = pendiente.current;
    const conAjustes = Object.keys(cambios).length > 0;
    if (!conAjustes && Object.keys(sucursales).length === 0) return;
    let actual = ultimo.current;
    if (!actual) return;
    const vivo = () => montado.current;
    if (vivo()) setGuardandoBorrador(true);
    try {
      // Primero las sucursales: si un mapa no es de Google Maps, el error
      // dice cuál y el resto de lo escrito sigue en pantalla.
      for (const [id, b] of Object.entries(sucursales)) {
        const s = actual.sucursales.find((x) => x.id === Number(id));
        let nueva: SucursalEditor;
        try {
          nueva = await apiPagina.sucursal(Number(id), cuerpoSucursal(s, b));
        } catch (err) {
          throw new Error(`${s?.nombre ?? "Sucursal"}: ${mensaje(err)}`);
        }
        actual = { ...actual, sucursales: actual.sucursales.map((x) => (x.id === nueva.id ? { ...x, ...nueva } : x)) };
        ultimo.current = actual;
        if (vivo()) {
          carga.setDatos(actual);
          setBorradorSucursales((todos) => {
            if (todos[Number(id)] !== b) return todos;
            const resto = { ...todos };
            delete resto[Number(id)];
            return resto;
          });
        }
      }
      // El estado que vuelve dice si quedó algo sin publicar (`borrador.hay`).
      const nuevo = conCatalogo(conAjustes ? await apiPagina.guardar(cambios) : await apiPagina.estado(), actual);
      ultimo.current = nuevo;
      if (vivo()) {
        carga.setDatos(nuevo);
        if (conAjustes)
          setBorrador((b) => {
            const resto: Record<string, unknown> = { ...b };
            for (const [k, v] of Object.entries(cambios)) if (resto[k] === v) delete resto[k];
            return resto as CambiosPagina;
          });
      }
    } finally {
      if (vivo()) setGuardandoBorrador(false);
    }
  };
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  // De a uno: dos envíos juntos mandarían lo mismo dos veces.
  const cola = useRef<Promise<void>>(Promise.resolve());
  const encolar = useRef(() => {
    const turno = cola.current.then(() => enviarRef.current());
    cola.current = turno.catch(() => undefined);
    return turno;
  }).current;

  useEffect(() => {
    if (!haySinGuardar) return;
    const t = setTimeout(() => {
      encolar().catch((err: unknown) => montado.current && setError(mensaje(err)));
    }, 800);
    return () => clearTimeout(t);
  }, [borrador, borradorSucursales, haySinGuardar, encolar]);

  // Al irse a otra pantalla, lo que faltaba se manda igual.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      encolar().catch(() => undefined);
    };
  }, [encolar]);

  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [personalizar, setPersonalizar] = useState(false);

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
  // La vista previa muestra el horario y el mapa que se están escribiendo.
  const sucursalesEditadas = e.sucursales.map((s) =>
    borradorSucursales[s.id] ? { ...s, ...limpio(borradorSucursales[s.id]) } : s,
  );
  const editado: EstadoEditor = { ...e, pagina: ajustes, sucursales: sucursalesEditadas };
  const vista = {
    ...vistaDesdeEditor(editado),
    // La sección Cursos sale con el interruptor prendido (lo decide el backend
    // en la página de verdad; acá se adelanta).
    cursos: conCursos && ajustes.mostrarCursos ? cursosPrevia : null,
  };
  const c = paleta(vista.color.hex);
  const estilo = estiloPagina(ajustes.estiloClave);
  const tonos = tonosPagina(estilo.clave, c, !!e.imagenes.portada);
  const fondoEstilo = { superficie: tonos.superficie, fondo: tonos.fondo };
  const hayBorrador = haySinGuardar || !!e.borrador?.hay;
  // Mientras la página no está publicada, pasar el borrador a la página es
  // sólo guardar: el botón lo dice así.
  const accionGuardar = e.pagina.publicada ? "Publicar cambios" : "Guardar cambios";
  const cambiar = (cambios: CambiosPagina) => setBorrador((b) => ({ ...b, ...cambios }));
  // Como `cambiar`, pero lo que vuelve a quedar como está guardado sale del
  // borrador: "Mantener los míos" no manda la letra y la forma de siempre.
  const cambiarLimpio = (cambios: CambiosPagina) =>
    setBorrador((b) => {
      const nuevo: Record<string, unknown> = { ...b, ...cambios };
      const guardado: Record<string, unknown> = { ...e.pagina, estiloClave: e.pagina.estiloClave ?? "CLASICO" };
      for (const k of Object.keys(cambios)) if (nuevo[k] === guardado[k]) delete nuevo[k];
      return nuevo as CambiosPagina;
    });

  // Decisión del 09-oct: al cambiar de estilo se conserva el color y la letra
  // y los botones pasan a los recomendados, con "Mantener los míos".
  const elegirEstilo = (clave: ClaveEstilo) => {
    const nuevo = estiloPagina(clave);
    const antes = { tipografia: ajustes.tipografia, formaBotones: ajustes.formaBotones };
    cambiarLimpio({ estiloClave: clave, tipografia: nuevo.letra, formaBotones: nuevo.forma });
    setAvisoEstilo(antes.tipografia !== nuevo.letra || antes.formaBotones !== nuevo.forma ? antes : null);
  };
  const mantenerLosMios = () => {
    if (avisoEstilo) cambiarLimpio(avisoEstilo);
    setAvisoEstilo(null);
  };
  const enlaces = [...e.enlaces].sort((a, b) => a.orden - b.orden || a.id - b.id);

  const actualizarCatalogo = (cambio: (actuales: ItemCatalogoEditor[]) => ItemCatalogoEditor[]) => {
    const d = ultimo.current;
    if (!d) return;
    const nuevo = { ...d, catalogo: cambio(d.catalogo ?? []) };
    ultimo.current = nuevo;
    carga.setDatos(nuevo);
  };
  const actualizarProductos = (lista: ProductoFijado[]) => {
    const d = ultimo.current;
    if (!d) return;
    const nuevo = { ...d, productosCatalogo: lista };
    ultimo.current = nuevo;
    carga.setDatos(nuevo);
  };
  // El catálogo es uno u otro (13-oct): armado a mano o "Mis productos". El
  // modo va al borrador, como el título, y sale a la página al publicar.
  // Sin productos a la venta ni siquiera se pregunta (salvo que ya estuviera
  // en "Mis productos", para poder volver).
  const modoCatalogo = ajustes.catalogoModo ?? "MANUAL";
  const hayProductos = (e.productosVendibles ?? 0) > 0;
  const selectorModo =
    hayProductos || modoCatalogo === "PRODUCTOS" ? (
      <SelectorModoCatalogo
        modo={modoCatalogo}
        onModo={(m) => cambiarLimpio({ catalogoModo: m })}
        hayProductos={hayProductos}
        c={c}
      />
    ) : null;

  const cambiarSucursal = (s: SucursalEditor, b: BorradorSucursal) =>
    setBorradorSucursales((todos) => {
      const resto = { ...todos };
      const guardado = borradorDe(s);
      if (b.whatsapp.trim() === guardado.whatsapp)
        delete resto[s.id];
      else resto[s.id] = b;
      return resto;
    });

  /**
   * Lo pendiente al borrador y el borrador a la página. Con `publicarPagina`
   * además la publica (la primera vez, desde "Publicar").
   */
  const publicar = async (publicarPagina = false) => {
    setGuardando(true);
    setError("");
    try {
      await encolar();
      const nuevo = await apiPagina.publicarCambios(publicarPagina);
      carga.setDatos(conCatalogo(nuevo, ultimo.current));
      setAvisoEstilo(null);
      setAviso(
        publicarPagina ? "¡Tu página está publicada!" : e.pagina.publicada ? "Cambios publicados" : "Cambios guardados",
      );
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  const despublicar = async () => {
    setGuardando(true);
    setError("");
    try {
      carga.setDatos(conCatalogo(await apiPagina.publicacion(false), ultimo.current));
      setAviso("Tu página ya no está publicada");
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  /** Vuelve a lo publicado: lo escrito en pantalla y el borrador del servidor. */
  const descartar = async () => {
    setConfirmarDescarte(false);
    setBorrador({});
    setBorradorSucursales({});
    pendiente.current = { borrador: {}, borradorSucursales: {} };
    setOpcionPrincipal(null);
    setAvisoEstilo(null);
    if (!e.borrador?.hay) return;
    setGuardando(true);
    setError("");
    try {
      await cola.current;
      carga.setDatos(conCatalogo(await apiPagina.descartarBorrador(), ultimo.current));
      setAviso("Volviste a lo publicado");
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
      carga.setDatos(conCatalogo(await apiPagina.ordenar(ids), ultimo.current));
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
  const estadoBorrador = guardandoBorrador
    ? "Guardando…"
    : hayBorrador
      ? e.pagina.publicada
        ? "Tenés cambios sin publicar. Se guardan solos; tu página no cambia hasta que los publiques."
        : "Tus cambios se guardan solos."
      : e.pagina.publicada
        ? "Todo publicado."
        : "";

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
            {e.pagina.publicada && hayBorrador && <Badge tono="amarillo">Cambios sin publicar</Badge>}
            {!ajustes.bloqueada &&
              (e.pagina.publicada ? (
                <Boton variante="ghost" disabled={guardando} onClick={() => void despublicar()}>
                  Despublicar
                </Boton>
              ) : (
                <Boton disabled={guardando || sinDireccion} onClick={() => void publicar(true)}>
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
            {/* El estilo va primero: decide todo lo demás de una vez. */}
            <div className="space-y-2">
              <SelectorEstilo vista={vista} rubro={e.negocio.rubro} onElegir={elegirEstilo} />
              {avisoEstilo && (
                <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2.5 text-[13px] text-texto-2">
                  <span className="min-w-0 flex-[1_1_240px]">Usamos la letra y los botones que mejor van con este estilo.</span>
                  <button type="button" className="font-semibold underline" style={{ color: c.oscuro }} onClick={mantenerLosMios}>
                    Mantener los míos
                  </button>
                </div>
              )}
              {estilo.pideFoto && !e.imagenes.portada && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  Vitrina luce con una foto de portada. Sin foto, arriba va un bloque de tu color.
                </p>
              )}
              {estilo.pideCatalogo && !vista.catalogo && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  Carta luce con tu catálogo. Sin productos se ven tus botones y tus sucursales.
                </p>
              )}
            </div>

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
                onArchivo={(archivo) => void leerColoresDeImagen(archivo).then((c) => c.length > 0 && setColoresLogo(c))}
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

            {/* Cada elección muestra sólo lo elegido; las opciones, en su popup. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectorColorPagina
                valor={ajustes.colorClave}
                muestras={e.muestras}
                recomendados={estilo.colores}
                deTuLogo={muestrasDeColores(coloresLogo, e.muestras)}
                forma={ajustes.formaBotones}
                fondo={fondoEstilo}
                onCambio={(clave) => cambiar({ colorClave: clave })}
              />
            </div>

            {/* PLAN-PAGINA-WEB §4.1: el estilo ya trae la letra y los botones que
                le van; cambiarlos es ajuste fino y queda plegado. */}
            <button
              type="button"
              aria-expanded={personalizar}
              onClick={() => setPersonalizar((v) => !v)}
              className="flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: c.oscuro }}
            >
              <Icon name="chevronDown" size={14} className={personalizar ? "rotate-180" : ""} />
              {personalizar ? "Menos opciones" : "Personalizar más: letra y forma de los botones"}
            </button>
            {personalizar && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectorForma
                  valor={ajustes.formaBotones}
                  c={c}
                  recomendadas={estilo.formas}
                  fondo={fondoEstilo}
                  onCambio={(f) => cambiar({ formaBotones: f })}
                />
                <SelectorLetra
                  valor={ajustes.tipografia}
                  nombre={e.negocio.nombre}
                  c={c}
                  recomendadas={estilo.letras}
                  onCambio={(t) => cambiar({ tipografia: t })}
                />
              </div>
            )}

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
              <EditorAnuncio ajustes={ajustes} c={c} pagina={fondoEstilo} cambiar={cambiar} />
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

          {modoCatalogo === "PRODUCTOS" ? (
            <CatalogoProductosEditor
              fijados={e.productosCatalogo ?? []}
              tope={e.topeProductos ?? TOPE_CATALOGO}
              titulo={ajustes.catalogoTitulo ?? ""}
              onTitulo={(t) => cambiar({ catalogoTitulo: t.trim() ? t : null })}
              onFijados={actualizarProductos}
              selector={selectorModo}
              c={c}
              onAviso={setAviso}
            />
          ) : (
            <CatalogoEditor
              items={e.catalogo ?? []}
              tope={e.topeCatalogo ?? TOPE_CATALOGO}
              titulo={ajustes.catalogoTitulo ?? ""}
              // Vacío vuelve a "Catálogo": el backend lo guarda como null.
              onTitulo={(t) => cambiar({ catalogoTitulo: t.trim() ? t : null })}
              onItems={actualizarCatalogo}
              selector={selectorModo}
              c={c}
              onAviso={setAviso}
            />
          )}

          {conCursos && (
            <Seccion titulo="Cursos">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={!!ajustes.mostrarCursos}
                  onChange={(ev) => cambiar({ mostrarCursos: ev.target.checked })}
                />
                <span>
                  <strong className="block text-sm text-texto">Mostrar cursos</strong>
                  <span className="text-[13px] text-texto-3">
                    Las carreras publicadas con sus próximos inicios y el botón «Preinscribirme». Se eligen en
                    Configuración › Carreras y planes.
                  </span>
                </span>
              </label>
            </Seccion>
          )}

          <EditorPedidosRegalos
            guardado={e.pagina.regalos}
            pedidosGuardado={e.pagina.pedidosWhatsapp}
            borrador={borrador}
            cambiar={cambiar}
            negocio={e.negocio.nombre}
            rubro={e.negocio.rubro}
            color={vista.color.hex}
            fotoUrl={urlDeImagen(vista.portadaUrl ?? vista.logoUrl)}
            conGiftCards={tieneFeature(negocioSesion?.features, "gift_cards")}
            conPedidos={tieneFeature(negocioSesion?.features, "pedidos_whatsapp")}
            conWhatsapp={enlaces.some((x) => x.tipo === "WHATSAPP")}
          />

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
              La dirección, el horario y la ubicación salen de la ficha de cada sucursal. Acá elegís qué se muestra.
            </p>
            {/* PLAN-PAGINA-WEB §3.1: el mapa es para todos (02-nov); esto sólo lo oculta. */}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-[18px] w-[18px]"
                style={{ accentColor: c.acento }}
                checked={ajustes.mostrarHorario !== false}
                onChange={(ev) => cambiar({ mostrarHorario: ev.target.checked })}
              />
              <span className="flex min-w-0 flex-col">
                <strong className="text-sm text-texto">Mostrar el horario</strong>
                <span className="text-xs text-texto-3">
                  El de cada sucursal, con «Abierto ahora» o «Cerrado» según la hora.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-[18px] w-[18px]"
                style={{ accentColor: c.acento }}
                checked={ajustes.mostrarMapa !== false}
                onChange={(ev) => cambiar({ mostrarMapa: ev.target.checked })}
              />
              <span className="flex min-w-0 flex-col">
                <strong className="text-sm text-texto">Mostrar un mapa con tus sucursales</strong>
                <span className="text-xs text-texto-3">
                  Cada sucursal con su ubicación marcada sale con su pin, y «Cómo llegar» abre la ruta exacta.
                </span>
              </span>
            </label>
            {e.sucursales.length === 0 ? (
              <p className="text-sm text-texto-3">No hay sucursales activas.</p>
            ) : (
              <div className="space-y-2">
                {e.sucursales.map((s) => (
                  <FilaSucursal
                    key={s.id}
                    s={s}
                    borrador={borradorSucursales[s.id]}
                    c={c}
                    academia={e.negocio.rubro === "ACADEMIA"}
                    onCambio={(b) => cambiarSucursal(s, b)}
                    onError={setError}
                    onGuardada={(nueva) => {
                      carga.setDatos({ ...e, sucursales: e.sucursales.map((x) => (x.id === nueva.id ? nueva : x)) });
                      // Para que `borrador.hay` diga la verdad.
                      carga.recargar();
                    }}
                  />
                ))}
              </div>
            )}
          </Seccion>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-borde bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            {estadoBorrador && (
              <span role="status" className="mr-auto min-w-0 flex-[1_1_220px] text-[13px] text-texto-3">
                {estadoBorrador}
              </span>
            )}
            {!previaAncha && (
              <Boton variante="ghost" className="lg:hidden" onClick={() => setPreviaCelular((v) => !v)}>
                {previaCelular ? "Ocultar vista previa" : "Ver vista previa"}
              </Boton>
            )}
            <Boton
              variante="ghost"
              disabled={!hayBorrador || guardando}
              onClick={() => (e.borrador?.hay ? setConfirmarDescarte(true) : void descartar())}
            >
              Descartar
            </Boton>
            <Boton disabled={!hayBorrador || guardando} onClick={() => void publicar()}>
              {guardando ? (e.pagina.publicada ? "Publicando…" : "Guardando…") : accionGuardar}
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
        abierto={confirmarDescarte}
        titulo="Descartar los cambios"
        texto="¿Volver a lo que está publicado? Se pierde todo lo que cambiaste desde la última vez que publicaste."
        etiquetaOk="Descartar"
        peligroso
        onCancel={() => setConfirmarDescarte(false)}
        onOk={() => void descartar()}
      />
      <Confirmar
        abierto={aBorrar !== null}
        titulo="Quitar enlace"
        texto={`¿Quitar «${aBorrar?.etiqueta ?? ""}» de tu página? Se quita al publicar y se pierden sus clics.`}
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
