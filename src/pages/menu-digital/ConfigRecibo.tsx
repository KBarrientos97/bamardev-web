import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Confirmar, ErrorMsg } from "../../components/ui";
import { apiMenuDigital, urlApi } from "../../lib/apiMenuDigital";
import { configuracionEnLista, VOLVER_A_CONFIGURACION } from "../../lib/configuracion";
import { fmtFechaHora, fmtMoney } from "../../lib/format";
import { totalEnLetras } from "../../lib/menuDigital/enLetras";
import { estiloLetra } from "../../lib/menuDigital/letraRecibo";
import { usaTickets } from "../../lib/menuDigital/reglasRecibo";
import { olvidarReciboNegocio } from "../../lib/menuDigital/useReciboNegocio";
import { prepararLogo } from "../../lib/pagina/imagen";
import { conMayuscula, marcaConsumo, termino } from "../../lib/rubro";
import { useAuth } from "../../store/AuthContext";
import type { Venta } from "../../types";
import {
  RECIBO_DE_FABRICA,
  type AjustesRecibo,
  type LocalDelRecibo,
  type ModeloConsumo,
  type TamanoLetra,
} from "../../types/menuDigital";
import ComandaCocina from "../pos/ComandaCocina";
import { CabeceraNegocio, HojaAngosta, NumeroDelRecibo, PieDelRecibo, QrRecibo, TotalesRecibo } from "../pos/PiezasRecibo";
import { PestanasTickets, Segmentado, SiNo, Tarjeta } from "../tickets/piezas";

/**
 * Configuración › Ticket y recibo: cómo sale el recibo del cliente y la
 * comanda, y el logo y los datos del negocio que van en el recibo y en las TVs.
 *
 * De base en el restaurante desde el 15-nov (antes, con los extras de
 * pantallas). Sin tickets no hay número ni comanda: la letra de la comanda, su
 * impresión al cobrar y "los dos papeles" no se muestran, porque no harían
 * nada (como la app, `ConfigReciboFragment.conTickets`).
 *
 * La vista previa de la derecha usa las mismas piezas que el recibo de la
 * caja: lo que se diseña acá es lo que sale (sin tickets, el recibo de una
 * venta sin número). Los cambios se guardan solos y la caja los toma en la
 * venta siguiente.
 *
 * 16-nov, para la térmica de 58 mm que no marca grises: «Letra gruesa» (el
 * recibo y la comanda), «Sucursal» (la de la venta, en la cabecera), y «Código
 * de barras» e «Imprimir directo en la terminal», que sólo cambian la app (ver
 * `AjustesRecibo`).
 */
type Pestana = "recibo" | "logo";
type Papel = "recibo" | "comanda";

const OPCIONES_LETRA: { valor: TamanoLetra; texto: string }[] = [
  { valor: "s", texto: "Chica" },
  { valor: "m", texto: "Normal" },
  { valor: "l", texto: "Grande" },
];

export default function ConfigRecibo() {
  const { negocio, rubro } = useAuth();
  const conTickets = usaTickets(negocio?.features, rubro);
  const [pestana, setPestana] = useState<Pestana>("recibo");
  /** El papel de la vista previa: cambiar la letra de uno lo muestra. */
  const [papel, setPapel] = useState<Papel>("recibo");
  const [r, setR] = useState<AjustesRecibo>(RECIBO_DE_FABRICA);
  const [logo, setLogo] = useState<string | null>(null);
  /**
   * La sucursal con la que se dibuja «Sucursal» en la vista previa (16-nov):
   * la de quien entra, o la principal para el dueño (`GET /pantallas/recibo`).
   * Sin ella (un backend anterior, un negocio sin local), no se dibuja.
   */
  const [sucursal, setSucursal] = useState<LocalDelRecibo | null>(null);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState<"" | "guardando" | "guardado" | "error">("");
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actual = useRef(r);
  actual.current = r;
  /** Lo que espera su turno para guardarse, y con qué logo (para la caja). */
  const pendiente = useRef<AjustesRecibo | null>(null);
  const logoActual = useRef(logo);
  logoActual.current = logo;
  /**
   * Si el negocio ya configuró su recibo (lo que dice el backend al cargar, o
   * algo guardado o subido acá). Va en lo que se le pasa a la caja de este
   * equipo: un restaurante sin TVs imprime con el diseño sólo así.
   */
  const configurado = useRef(false);

  const cargar = useCallback(() => {
    setError("");
    apiMenuDigital
      .recibo()
      .then((x) => {
        setR(x.recibo);
        setLogo(x.logo);
        setSucursal(x.sucursal?.nombre?.trim() ? x.sucursal : null);
        configurado.current = x.configurado === true;
        setCargado(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el diseño del recibo"));
  }, []);
  const negocioId = negocio?.id;
  useEffect(() => {
    cargar();
    return () => {
      if (reloj.current) clearTimeout(reloj.current);
      // Se fue de la pantalla antes de que saliera: se manda ya, en vez de
      // perder el último cambio sin aviso.
      const sinGuardar = pendiente.current;
      if (!sinGuardar) return;
      void apiMenuDigital
        .guardarRecibo(sinGuardar)
        .then((ok) => {
          configurado.current = true;
          if (negocioId != null) {
            olvidarReciboNegocio({ recibo: ok, logo: logoActual.current, configurado: true }, negocioId);
          }
        })
        .catch(() => undefined);
    };
  }, [cargar, negocioId]);

  const cambiar = (parcial: Partial<AjustesRecibo>) => {
    // Sin lo guardado todavía, guardar pisaría el diseño con el de fábrica.
    if (!cargado) return;
    const nuevo = { ...actual.current, ...parcial };
    actual.current = nuevo;
    setR(nuevo);
    setGuardado("guardando");
    pendiente.current = nuevo;
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => {
      pendiente.current = null;
      apiMenuDigital
        .guardarRecibo(nuevo)
        .then((guardadoOk) => {
          setGuardado("guardado");
          configurado.current = true;
          // La caja tiene el diseño guardado en memoria: que tome el nuevo.
          if (negocio?.id != null) {
            olvidarReciboNegocio({ recibo: guardadoOk, logo, configurado: true }, negocio.id);
          }
        })
        .catch(() => setGuardado("error"));
    }, 700);
  };

  const alCambiarLogo = (nuevo: string | null) => {
    setLogo(nuevo);
    // Subir el logo también es configurar el recibo (lo mismo que cuenta el backend).
    if (nuevo != null) configurado.current = true;
    if (negocio?.id != null) {
      olvidarReciboNegocio({ recibo: actual.current, logo: nuevo, configurado: configurado.current }, negocio.id);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      {/* El mismo aire que las otras opciones de Configuración (`p-4 sm:p-5`);
          más ancha que ellas porque el editor y la vista previa van lado a lado. */}
      <div className="mx-auto max-w-[1300px] p-4 sm:p-5">
        {/* El encabezado de las otras tres opciones (16-nov): mismo título,
            misma flecha de vuelta a la lista. Las pestañas van a la derecha y,
            si no entran, bajan de renglón. */}
        <EncabezadoPagina
          titulo="Ticket y recibo"
          subtitulo={
            conTickets
              ? "Diseñá tu recibo y la comanda, y elegí el logo que se ve en el recibo y en las pantallas."
              : // Sin tickets no hay comanda: no se la nombra.
                "Diseñá tu recibo y elegí el logo de tu negocio."
          }
          volver={configuracionEnLista(rubro) ? VOLVER_A_CONFIGURACION : undefined}
          accion={
            <PestanasTickets<Pestana>
              opciones={[
                { valor: "recibo", texto: "Ticket y recibo", icono: "printer" },
                { valor: "logo", texto: "Logo y datos", icono: "camara" },
              ]}
              valor={pestana}
              onCambiar={setPestana}
            />
          }
        />
        {error && (
          <div className="mt-4">
            <ErrorMsg onReintentar={cargar}>{error}</ErrorMsg>
          </div>
        )}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-4">
            {pestana === "recibo" ? (
              <AjustesDelRecibo r={r} cambiar={cambiar} guardado={guardado} verPapel={setPapel} conTickets={conTickets} />
            ) : (
              <LogoYDatos r={r} cambiar={cambiar} logo={logo} onLogo={alCambiarLogo} guardado={guardado} />
            )}
          </div>
          <VistaPrevia
            r={r}
            logo={logo}
            negocio={negocio?.nombre ?? "Tu negocio"}
            papel={conTickets ? papel : "recibo"}
            onPapel={setPapel}
            conTickets={conTickets}
            sucursal={sucursal}
          />
        </div>
      </div>
    </div>
  );
}

// ── Ticket y recibo ───────────────────────────────────────────────────────

function AjustesDelRecibo({
  r,
  cambiar,
  guardado,
  verPapel,
  conTickets,
}: {
  r: AjustesRecibo;
  cambiar: (p: Partial<AjustesRecibo>) => void;
  guardado: "" | "guardando" | "guardado" | "error";
  verPapel: (p: Papel) => void;
  /** Si el negocio saca número de pedido: sin él no hay comanda que configurar. */
  conTickets: boolean;
}) {
  const { rubro, vocabulario } = useAuth();
  // «sucursal» en el restaurante; el rubro puede llamarla de otra forma.
  const sucursal = termino(rubro, "sucursal", vocabulario);
  return (
    <>
      <Tarjeta titulo="Papel" accion={<EstadoGuardado estado={guardado} />}>
        <Fila etiqueta="Ancho de la impresora">
          <Segmentado
            etiqueta="Ancho de la impresora"
            valor={r.ancho}
            onCambiar={(v) => cambiar({ ancho: v })}
            opciones={[
              { valor: 58, texto: "58 mm" },
              { valor: 80, texto: "80 mm" },
            ]}
          />
        </Fila>
        {/* Cada papel con su letra (Kevin, 5-nov): el recibo salía más grande
            en el papel que en la pantalla y gastaba rollo. Al cambiar una, la
            vista previa pasa a ese papel, para ver el cambio. */}
        <Fila etiqueta="Letra del recibo" detalle="Más chica, menos papel">
          <Segmentado
            etiqueta="Letra del recibo"
            valor={r.tamanoLetra}
            onCambiar={(v) => {
              cambiar({ tamanoLetra: v });
              verPapel("recibo");
            }}
            opciones={OPCIONES_LETRA}
          />
        </Fila>
        {conTickets && (
          <Fila etiqueta="Letra de la comanda" detalle="La que lee la cocina">
            <Segmentado
              etiqueta="Letra de la comanda"
              valor={r.tamanoLetraComanda}
              onCambiar={(v) => {
                cambiar({ tamanoLetraComanda: v });
                verPapel("comanda");
              }}
              opciones={OPCIONES_LETRA}
            />
          </Fila>
        )}
        {/* Al lado de las letras (16-nov): engruesa todo lo que sale por la
            impresora, el recibo y la comanda; el tamaño lo siguen mandando
            las letras de arriba. */}
        <SiNo
          etiqueta="Letra gruesa"
          detalle="Todo en negrita y bien negro, para impresoras térmicas que no marcan los grises ni la letra fina."
          activo={r.negrita}
          onCambiar={(v) => cambiar({ negrita: v })}
        />
        {/* Cada papel por su lado (Kevin, 29-oct): la caja y la cocina pueden
            tener cada una su impresora. Con los dos, juntos en una impresión
            o uno detrás del otro, para elegir la impresora de cada uno. Sin
            tickets no hay comanda: queda sólo el recibo del cliente. */}
        <div className="mt-1 border-t border-borde pt-3">
          <p className="text-sm font-semibold text-texto">Imprimir solo al cobrar</p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            {conTickets
              ? "Al registrar la venta se abre la impresión sola. Con Chrome en modo kiosco sale directo, sin tocar nada."
              : "Al cobrar se abre la impresión del recibo sola, una vez. Con Chrome en modo kiosco sale directo, sin tocar nada."}
          </p>
          <SiNo
            etiqueta="Recibo del cliente"
            detalle="El papel que se lleva el cliente"
            activo={r.alCobrar.recibo}
            onCambiar={(v) => cambiar({ alCobrar: { ...r.alCobrar, recibo: v } })}
          />
          {conTickets && (
            <SiNo
              etiqueta="Comanda de cocina"
              detalle="El papel con el número y lo que hay que preparar"
              activo={r.alCobrar.comanda}
              onCambiar={(v) => cambiar({ alCobrar: { ...r.alCobrar, comanda: v } })}
            />
          )}
          {conTickets && r.alCobrar.recibo && r.alCobrar.comanda && (
            <Fila
              etiqueta="Los dos papeles"
              detalle={
                r.alCobrar.juntos
                  ? "En una sola impresión, con el corte en el medio: para una sola impresora."
                  : "Primero el recibo y, al cerrarse, la comanda: en cada una se elige su impresora."
              }
            >
              <Segmentado<"juntos" | "separados">
                etiqueta="Los dos papeles"
                valor={r.alCobrar.juntos ? "juntos" : "separados"}
                onCambiar={(v) => cambiar({ alCobrar: { ...r.alCobrar, juntos: v === "juntos" } })}
                opciones={[
                  { valor: "juntos", texto: "Juntos" },
                  { valor: "separados", texto: "Por separado" },
                ]}
              />
            </Fila>
          )}
          {/* Como el código de barras (16-nov): lo usa sólo la app, en las
              terminales con impresora propia. En la web la impresión es la del
              navegador y no cambia con ningún valor; el interruptor está acá
              porque el diseño es uno solo y el dueño lo prende desde la PC. */}
          <SiNo
            etiqueta="Imprimir directo en la terminal"
            detalle="En las terminales de venta con impresora propia, el recibo sale solo al cobrar, sin la vista previa de Android. En otros equipos no cambia nada."
            activo={r.impresionDirecta}
            onCambiar={(v) => cambiar({ impresionDirecta: v })}
          />
        </div>
      </Tarjeta>
      <Tarjeta titulo="Encabezado">
        <SiNo
          etiqueta="Mostrar logo"
          detalle="Se imprime en blanco y negro"
          activo={r.logo}
          onCambiar={(v) => cambiar({ logo: v })}
        />
        <Fila etiqueta="Tamaño del logo">
          <Segmentado
            etiqueta="Tamaño del logo"
            valor={r.tamanoLogo}
            onCambiar={(v) => {
              cambiar({ tamanoLogo: v });
              verPapel("recibo");
            }}
            opciones={[
              { valor: "s", texto: "Chico" },
              { valor: "m", texto: "Medio" },
              { valor: "l", texto: "Grande" },
            ]}
          />
        </Fila>
        <SiNo
          etiqueta="Nombre en texto bajo el logo"
          detalle="Apagalo si tu logo ya dice el nombre"
          activo={r.nombre}
          onCambiar={(v) => cambiar({ nombre: v })}
        />
        {/* La sucursal de la venta debajo del nombre (16-nov), con la palabra
            del rubro. Prendida sale también con un solo local. */}
        <SiNo
          etiqueta={conMayuscula(sucursal)}
          detalle={`El nombre y la dirección de la ${sucursal} donde se vendió, debajo del nombre del negocio.`}
          activo={r.sucursal}
          onCambiar={(v) => {
            cambiar({ sucursal: v });
            verPapel("recibo");
          }}
        />
        <p className="mt-1 text-[12px] text-texto-3">El lema, la dirección, el teléfono y el NIT se cargan en «Logo y datos».</p>
      </Tarjeta>
      <Tarjeta titulo="Contenido">
        {/* Sólo donde hay mesa y llevar: en una farmacia no cambiaría nada, y
            un control que no hace nada es peor que no tenerlo. */}
        {marcaConsumo(rubro) && (
          <Fila
            etiqueta="Mesa y para llevar"
            detalle={
              r.modeloConsumo === "letras"
                ? "Una sola lista, con M (mesa) o LL (llevar) en cada producto."
                : "Los productos separados en EN MESA y PARA LLEVAR."
            }
          >
            <Segmentado<ModeloConsumo>
              etiqueta="Mesa y para llevar"
              valor={r.modeloConsumo}
              onCambiar={(v) => {
                cambiar({ modeloConsumo: v });
                verPapel("recibo");
              }}
              opciones={[
                { valor: "separado", texto: "Separado" },
                { valor: "letras", texto: "M y LL" },
              ]}
            />
          </Fila>
        )}
        <SiNo etiqueta="Cajero" activo={r.cajero} onCambiar={(v) => cambiar({ cajero: v })} />
        <SiNo etiqueta="Subtotal" activo={r.subtotal} onCambiar={(v) => cambiar({ subtotal: v })} />
        <SiNo etiqueta="Total" activo={r.total} onCambiar={(v) => cambiar({ total: v })} />
        <SiNo
          etiqueta="Total en letras"
          detalle={`«${totalEnLetras(123)}»`}
          activo={r.totalEnLetras}
          onCambiar={(v) => cambiar({ totalEnLetras: v })}
        />
        <SiNo etiqueta="Método de pago y cambio" activo={r.pagoYCambio} onCambiar={(v) => cambiar({ pagoYCambio: v })} />
        {/* Sólo con número de pedido: sin tickets no sale en ningún papel, y
            un control que no hace nada no se muestra (QA del 16-nov). */}
        {conTickets && (
          <Fila etiqueta="Tiempo estimado de entrega" detalle="Va en los pedidos con número. 0 = no se imprime.">
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={240}
                value={r.minutosEstimados}
                onChange={(e) => cambiar({ minutosEstimados: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
                className="w-20 rounded-xl border border-borde bg-white px-3 py-2 text-right text-sm text-texto outline-none focus:border-primary"
              />
              <span className="text-sm text-texto-3">min</span>
            </span>
          </Fila>
        )}
      </Tarjeta>
      <Tarjeta titulo="Código QR">
        <SiNo
          etiqueta="Mostrar un QR en el recibo"
          detalle="A tu página, Instagram o WhatsApp: el cliente lo escanea y te encuentra"
          activo={r.qr.mostrar}
          onCambiar={(v) => cambiar({ qr: { ...r.qr, mostrar: v } })}
        />
        {r.qr.mostrar && (
          <div className="mt-2 space-y-2.5">
            <Texto etiqueta="Enlace del QR" valor={r.qr.enlace} largo={300} ejemplo="instagram.com/tunegocio" onCambiar={(v) => cambiar({ qr: { ...r.qr, enlace: v } })} />
            <Texto etiqueta="Título" valor={r.qr.titulo} largo={40} onCambiar={(v) => cambiar({ qr: { ...r.qr, titulo: v } })} />
            <Texto etiqueta="Texto" valor={r.qr.texto} largo={100} ejemplo="Seguinos y enterate de las promos" onCambiar={(v) => cambiar({ qr: { ...r.qr, texto: v } })} />
          </div>
        )}
      </Tarjeta>
      <Tarjeta titulo="Pie del ticket">
        <SiNo etiqueta="Mensaje principal" activo={r.mostrarMensaje} onCambiar={(v) => cambiar({ mostrarMensaje: v })} />
        {r.mostrarMensaje && (
          <div className="mt-2">
            <Texto etiqueta="Mensaje" valor={r.mensaje} largo={80} onCambiar={(v) => cambiar({ mensaje: v })} />
          </div>
        )}
        {/* El código de barras (16-nov) lo imprime sólo la app: el papel de la
            web nunca lo tuvo, y ni el recibo ni esta vista previa cambian con
            él. El interruptor está igual acá porque el diseño es uno solo y el
            dueño lo apaga desde la PC para sus terminales; por eso la ayuda
            dice dónde se ve. */}
        <SiNo
          etiqueta="Código de barras"
          detalle="El código con el número de la venta, al pie del recibo que imprime la app (celular o terminal de ventas)."
          activo={r.codigoBarras}
          onCambiar={(v) => cambiar({ codigoBarras: v })}
        />
      </Tarjeta>
    </>
  );
}

// ── Logo y datos ──────────────────────────────────────────────────────────

function LogoYDatos({
  r,
  cambiar,
  logo,
  onLogo,
  guardado,
}: {
  r: AjustesRecibo;
  cambiar: (p: Partial<AjustesRecibo>) => void;
  logo: string | null;
  onLogo: (l: string | null) => void;
  guardado: "" | "guardando" | "guardado" | "error";
}) {
  const { negocio } = useAuth();
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [quitar, setQuitar] = useState(false);
  const [encima, setEncima] = useState(false);
  // El archivo que se acaba de subir, para volver a subirlo con o sin fondo
  // sin pedirle al dueño que lo busque otra vez.
  const [ultimo, setUltimo] = useState<File | null>(null);
  const [fondo, setFondo] = useState<"quitado" | "con-fondo" | null>(null);

  const subir = async (f: File | undefined, sacarFondo = true) => {
    if (!f) return;
    setSubiendo(true);
    setError("");
    try {
      const preparado = await prepararLogo(f, sacarFondo);
      const r = await apiMenuDigital.subirLogo(preparado.blob);
      onLogo(r.logo);
      setUltimo(f);
      setFondo(!sacarFondo ? "con-fondo" : preparado.fondoQuitado ? "quitado" : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };
  const sacar = async () => {
    try {
      await apiMenuDigital.quitarLogo();
      onLogo(null);
      setQuitar(false);
      setUltimo(null);
      setFondo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el logo");
    }
  };

  return (
    <>
      <Tarjeta titulo="Logo del negocio">
        {error && (
          <div className="mb-3">
            <ErrorMsg>{error}</ErrorMsg>
          </div>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            void subir(e.dataTransfer.files?.[0]);
          }}
          className={`grid gap-3 rounded-2xl border-2 border-dashed p-3 sm:grid-cols-2 ${encima ? "border-primary bg-primary-50" : "border-borde"}`}
        >
          {logo ? (
            <>
              {/* Sobre oscuro, como en las TVs: sobre blanco, un logo con su
                  fondo blanco se veía perfecto acá y en la TV era un cuadrado
                  pegado encima del rojo (Kevin, 9-nov). */}
              <figure className="flex flex-col items-center justify-center rounded-xl p-4" style={{ background: "linear-gradient(135deg, #3a2a26, #1a1210)" }}>
                <img src={urlApi(logo)} alt="Logo" className="max-h-28 max-w-full object-contain" />
                <figcaption className="mt-2 text-[12px] text-white/75">En color · menú y pantallas</figcaption>
              </figure>
              <figure className="flex flex-col items-center justify-center rounded-xl bg-white p-4">
                <img src={urlApi(logo)} alt="" className="max-h-28 max-w-full object-contain grayscale contrast-125" />
                <figcaption className="mt-2 text-[12px] text-texto-3">Blanco y negro · recibo</figcaption>
              </figure>
            </>
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-8 text-center text-sm text-texto-3">
              <Icon name="camara" size={30} />
              <p className="mt-2">Todavía no hay logo. Arrastrá la imagen acá o subila con el botón.</p>
            </div>
          )}
        </div>
        <input
          ref={archivo}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => void subir(e.target.files?.[0])}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Boton icono="camara" disabled={subiendo} onClick={() => archivo.current?.click()}>
            {subiendo ? "Subiendo…" : logo ? "Cambiar logo" : "Subir logo"}
          </Boton>
          {logo && (
            <Boton variante="ghost" icono="trash" onClick={() => setQuitar(true)}>
              Quitar logo
            </Boton>
          )}
        </div>
        {logo && ultimo && fondo && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-[13px] text-texto-2">
            <span>
              {fondo === "quitado"
                ? "Le sacamos el fondo para que en las TVs se vea sólo el dibujo."
                : "Quedó con su fondo, tal cual el archivo."}
            </span>
            <button
              type="button"
              disabled={subiendo}
              onClick={() => void subir(ultimo, fondo !== "quitado")}
              className="font-semibold text-primary-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {fondo === "quitado" ? "Dejarlo con su fondo" : "Sacarle el fondo"}
            </button>
          </div>
        )}
        <p className="mt-2 text-[12px] text-texto-3">
          PNG o JPG, con fondo blanco, negro o transparente: el fondo se saca solo. Es el mismo logo de tu página, si la tenés.
        </p>
        <Confirmar
          abierto={quitar}
          titulo="¿Quitar el logo?"
          texto="El recibo y las TVs muestran el nombre del negocio en su lugar. También sale de tu página, si la tenés."
          etiquetaOk="Quitar"
          peligroso
          onCancel={() => setQuitar(false)}
          onOk={() => void sacar()}
        />
      </Tarjeta>
      <Tarjeta titulo="Datos del recibo" accion={<EstadoGuardado estado={guardado} />}>
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-texto-2">Nombre</span>
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-texto">{negocio?.nombre}</p>
            <span className="mt-1 block text-[12px] text-texto-3">El nombre del negocio lo cambia BamarDev, desde el alta.</span>
          </label>
          <Texto etiqueta="Lema" valor={r.lema} largo={60} ejemplo="Brasa y broasted" onCambiar={(v) => cambiar({ lema: v })} />
          <Texto etiqueta="Dirección" valor={r.direccion} largo={120} ejemplo="Av. Principal #123" onCambiar={(v) => cambiar({ direccion: v })} />
          <Texto etiqueta="Teléfono" valor={r.telefono} largo={40} ejemplo="700 00000" onCambiar={(v) => cambiar({ telefono: v })} />
          <Texto etiqueta="NIT (opcional)" valor={r.nit} largo={30} ejemplo="Dejalo vacío si no tenés NIT" onCambiar={(v) => cambiar({ nit: v })} />
        </div>
      </Tarjeta>
    </>
  );
}

// ── Vista previa ──────────────────────────────────────────────────────────

const VENTA_EJEMPLO = {
  id: 9,
  comprobante: "V-000009",
  estado: "APROBADO",
  fecha: new Date().toISOString(),
  total: 123,
  detalles: [
    { productoId: 1, producto: "Broaster medio", cantidad: 1, precio: 56, subtotal: 56, nota: null, consumo: "MESA" },
    { productoId: 2, producto: "Coca Cola 1.5L", cantidad: 1, precio: 15, subtotal: 15, nota: null, consumo: "MESA" },
    { productoId: 3, producto: "Brasa cuarto", cantidad: 2, precio: 26, subtotal: 52, nota: "sin ensalada", consumo: "LLEVAR" },
  ],
} as unknown as Venta;

function VistaPrevia({
  r,
  logo,
  negocio,
  papel,
  onPapel,
  conTickets,
  sucursal,
}: {
  r: AjustesRecibo;
  logo: string | null;
  negocio: string;
  papel: Papel;
  onPapel: (p: Papel) => void;
  /**
   * Si el negocio saca número de pedido. Sin él la vista previa es el recibo
   * de una venta sin número, como sale al vender (QA del 16-nov): sin el
   * recuadro «TICKET N°», con «Ticket:» en lugar de «Venta:», sin el tiempo
   * estimado y sin comanda que elegir.
   */
  conTickets: boolean;
  /** La sucursal para «Sucursal» (de `GET /pantallas/recibo`); sin ella no se dibuja. */
  sucursal: LocalDelRecibo | null;
}) {
  const angosto = r.ancho === 58;
  const grupos = [
    { titulo: "EN MESA", lineas: (VENTA_EJEMPLO.detalles ?? []).filter((d) => d.consumo === "MESA") },
    { titulo: "PARA LLEVAR", lineas: (VENTA_EJEMPLO.detalles ?? []).filter((d) => d.consumo !== "MESA") },
  ];
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-3xl bg-muted p-4">
        {conTickets && (
          <div className="mb-3 flex justify-center">
            <Segmentado<Papel>
              etiqueta="Qué papel"
              valor={papel}
              onCambiar={onPapel}
              opciones={[
                { valor: "recibo", texto: "Recibo del cliente" },
                { valor: "comanda", texto: "Comanda de cocina" },
              ]}
            />
          </div>
        )}
        {/* La vista previa es lo único imprimible de esta pantalla: "Imprimir
            prueba" saca este papel en la impresora elegida. */}
        {angosto && <HojaAngosta />}
        <div id="area-impresion" style={angosto ? ({ "--ancho-ticket": "48mm" } as CSSProperties) : undefined}>
          {papel === "recibo" ? (
            <article
              className={`papel-letra card mx-auto p-5 print:max-w-none print:border-0 print:p-0 print:shadow-none ${angosto ? "max-w-[250px]" : "max-w-[320px]"}${r.negrita ? " papel-negrita" : ""}`}
              style={estiloLetra(r.tamanoLetra)}
            >
              {/* Con «Sucursal» prendida, la de quien entra (o la principal),
                  como saldría en una venta de ese local. El código de barras
                  no se dibuja con ningún valor: el papel de la web no lo lleva. */}
              <CabeceraNegocio r={r} logo={logo} nombre={negocio} local={r.sucursal ? sucursal : null} />
              {conTickets && <NumeroDelRecibo numero={84} />}
              <dl className="border-t border-dashed border-borde pt-2 text-xs">
                <Dato etiqueta={conTickets ? "Venta:" : "Ticket:"} valor="V-000009" />
                <Dato etiqueta="Fecha:" valor={fmtFechaHora(VENTA_EJEMPLO.fecha)} />
                {r.cajero && <Dato etiqueta="Cajero:" valor="Administrador" />}
                <Dato etiqueta="Pago:" valor="Efectivo" />
              </dl>
              <div className="mt-2 border-t border-dashed border-borde pt-1">
                {r.modeloConsumo === "letras"
                  ? (VENTA_EJEMPLO.detalles ?? []).map((d, i) => (
                      <LineaPrevia key={i} d={d} marca={d.consumo === "MESA" ? "M" : "LL"} />
                    ))
                  : grupos.map((g) => (
                      <div key={g.titulo}>
                        <p className="mt-1.5 border-b border-texto pb-0.5 text-[11px] font-extrabold tracking-[0.14em] text-texto">{g.titulo}</p>
                        {g.lineas.map((d, i) => (
                          <LineaPrevia key={i} d={d} />
                        ))}
                      </div>
                    ))}
              </div>
              {/* Con el Subtotal, como el recibo de la caja: sin él la vista
                  previa salía más corta que el papel de verdad. */}
              <TotalesRecibo r={r} subtotal={123} total={123} />
              {r.pagoYCambio && (
                <dl className="mt-2 space-y-0.5 border-t border-dashed border-borde pt-2 text-xs">
                  <Linea etiqueta="Método de pago" valor="Efectivo" />
                  <Linea etiqueta="Efectivo recibido" valor={fmtMoney(150)} />
                  <Linea etiqueta="Cambio entregado" valor={fmtMoney(27)} />
                </dl>
              )}
              <QrRecibo r={r} conTicket={conTickets} />
              <PieDelRecibo r={r} />
            </article>
          ) : (
            <ComandaCocina
              venta={VENTA_EJEMPLO}
              numero={84}
              negocio={negocio}
              minutos={r.minutosEstimados}
              tamano={r.tamanoLetraComanda}
              negrita={r.negrita}
            />
          )}
        </div>
        <Boton variante="ghost" icono="printer" className="mt-3 w-full" onClick={() => window.print()}>
          Imprimir prueba
        </Boton>
        <p className="mt-2 text-center text-[12px] text-texto-3">
          Vista previa con datos de ejemplo. Todo se imprime en negro sobre blanco.
        </p>
        {/* La letra de acá es la del papel sólo si Chrome no reescala: su
            «Escala» multiplica todo lo de la página, y con «Márgenes» en
            Ninguno el ticket arranca en el borde del rollo, donde muchas
            térmicas no llegan a imprimir (los primeros tickets de prueba
            salieron cortados a la izquierda). Predeterminado usa los 4 mm de
            la @page de index.html. */}
        <p className="mt-1 text-center text-[12px] text-texto-3">
          Si sale más grande, más chico o cortado: en la ventana de impresión dejá «Escala» y «Márgenes» en
          Predeterminado.
        </p>
      </div>
    </aside>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────

function Fila({ etiqueta, detalle, children }: { etiqueta: string; detalle?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">{etiqueta}</span>
        {detalle && <span className="mt-0.5 block text-[12px] text-texto-3">{detalle}</span>}
      </span>
      {children}
    </div>
  );
}

function Texto({
  etiqueta,
  valor,
  largo,
  ejemplo,
  onCambiar,
}: {
  etiqueta: string;
  valor: string;
  largo: number;
  ejemplo?: string;
  onCambiar: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-texto-2">{etiqueta}</span>
      <input
        value={valor}
        maxLength={largo}
        placeholder={ejemplo}
        onChange={(e) => onCambiar(e.target.value)}
        className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-sm text-texto outline-none focus:border-primary"
      />
    </label>
  );
}

/** Un producto de la vista previa, como lo dibuja el recibo de la caja. */
function LineaPrevia({ d, marca }: { d: NonNullable<Venta["detalles"]>[number]; marca?: "M" | "LL" }) {
  return (
    <div className="py-1 text-[13px]">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-semibold text-texto">{d.producto}</p>
        {marca && <span className={`shrink-0 font-bold ${marca === "M" ? "text-primary-700" : "text-texto-3"}`}>{marca}</span>}
      </div>
      <div className="flex justify-between text-texto-3">
        <span>
          {d.cantidad} × {fmtMoney(d.precio)}
        </span>
        <span className="font-bold text-texto">{fmtMoney(d.subtotal)}</span>
      </div>
      {d.nota && <p className="text-xs italic text-texto-3">{d.nota}</p>}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-texto-3">{etiqueta}</dt>
      <dd className="text-right font-bold text-texto">{valor}</dd>
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2 text-texto-2">
      <dt>{etiqueta}</dt>
      <dd className="font-bold text-texto">{valor}</dd>
    </div>
  );
}

function EstadoGuardado({ estado }: { estado: "" | "guardando" | "guardado" | "error" }) {
  if (!estado) return null;
  return (
    <span className={`text-[12px] font-semibold ${estado === "error" ? "text-danger-text" : estado === "guardado" ? "text-primary-700" : "text-texto-3"}`}>
      {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : "No se guardó"}
    </span>
  );
}
