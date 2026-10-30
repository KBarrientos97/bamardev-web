import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Confirmar, ErrorMsg } from "../../components/ui";
import { apiMenuDigital, urlApi } from "../../lib/apiMenuDigital";
import { fmtFechaHora, fmtMoney } from "../../lib/format";
import { totalEnLetras } from "../../lib/menuDigital/enLetras";
import { olvidarReciboNegocio } from "../../lib/menuDigital/useReciboNegocio";
import { prepararImagen } from "../../lib/pagina/imagen";
import { numeroTicket } from "../../lib/tickets/llamado";
import { useAuth } from "../../store/AuthContext";
import type { Venta } from "../../types";
import { RECIBO_DE_FABRICA, type AjustesRecibo } from "../../types/menuDigital";
import ComandaCocina from "../pos/ComandaCocina";
import { CabeceraNegocio, QrRecibo } from "../pos/PiezasRecibo";
import { PestanasTickets, Segmentado, SiNo, Tarjeta } from "../tickets/piezas";

/**
 * Configuración (extras de pantallas del restaurante): cómo sale el recibo del
 * cliente y la comanda, y el logo y los datos del negocio que van en el
 * recibo y en las TVs.
 *
 * La vista previa de la derecha usa las mismas piezas que el recibo de la
 * caja: lo que se diseña acá es lo que sale. Los cambios se guardan solos y
 * la caja los toma en la venta siguiente.
 */
type Pestana = "recibo" | "logo";

export default function ConfigRecibo() {
  const { negocio } = useAuth();
  const [pestana, setPestana] = useState<Pestana>("recibo");
  const [r, setR] = useState<AjustesRecibo>(RECIBO_DE_FABRICA);
  const [logo, setLogo] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState<"" | "guardando" | "guardado" | "error">("");
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actual = useRef(r);
  actual.current = r;

  const cargar = useCallback(() => {
    setError("");
    apiMenuDigital
      .recibo()
      .then((x) => {
        setR(x.recibo);
        setLogo(x.logo);
        setCargado(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el diseño del recibo"));
  }, []);
  useEffect(() => {
    cargar();
    return () => {
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, [cargar]);

  const cambiar = (parcial: Partial<AjustesRecibo>) => {
    // Sin lo guardado todavía, guardar pisaría el diseño con el de fábrica.
    if (!cargado) return;
    const nuevo = { ...actual.current, ...parcial };
    actual.current = nuevo;
    setR(nuevo);
    setGuardado("guardando");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => {
      apiMenuDigital
        .guardarRecibo(nuevo)
        .then((guardadoOk) => {
          setGuardado("guardado");
          // La caja tiene el diseño guardado en memoria: que tome el nuevo.
          if (negocio?.id != null) olvidarReciboNegocio({ recibo: guardadoOk, logo }, negocio.id);
        })
        .catch(() => setGuardado("error"));
    }, 700);
  };

  const alCambiarLogo = (nuevo: string | null) => {
    setLogo(nuevo);
    if (negocio?.id != null) olvidarReciboNegocio({ recibo: actual.current, logo: nuevo }, negocio.id);
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1300px] px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-texto">Configuración</h1>
            <p className="mt-0.5 text-sm text-texto-3">
              Diseñá tu recibo y la comanda, y elegí el logo que se ve en el recibo y en las pantallas.
            </p>
          </div>
          <PestanasTickets<Pestana>
            opciones={[
              { valor: "recibo", texto: "Ticket y recibo", icono: "printer" },
              { valor: "logo", texto: "Logo y datos", icono: "camara" },
            ]}
            valor={pestana}
            onCambiar={setPestana}
          />
        </header>
        {error && (
          <div className="mt-4">
            <ErrorMsg onReintentar={cargar}>{error}</ErrorMsg>
          </div>
        )}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-4">
            {pestana === "recibo" ? (
              <AjustesDelRecibo r={r} cambiar={cambiar} guardado={guardado} />
            ) : (
              <LogoYDatos r={r} cambiar={cambiar} logo={logo} onLogo={alCambiarLogo} guardado={guardado} />
            )}
          </div>
          <VistaPrevia r={r} logo={logo} negocio={negocio?.nombre ?? "Tu negocio"} />
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
}: {
  r: AjustesRecibo;
  cambiar: (p: Partial<AjustesRecibo>) => void;
  guardado: "" | "guardando" | "guardado" | "error";
}) {
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
        {/* Cada papel por su lado (Kevin, 29-oct): la caja y la cocina pueden
            tener cada una su impresora. Con los dos, juntos en una impresión
            o uno detrás del otro, para elegir la impresora de cada uno. */}
        <div className="mt-1 border-t border-borde pt-3">
          <p className="text-sm font-semibold text-texto">Imprimir solo al cobrar</p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            Al registrar la venta se abre la impresión sola. Con Chrome en modo kiosco sale directo, sin tocar nada.
          </p>
          <SiNo
            etiqueta="Recibo del cliente"
            detalle="El papel que se lleva el cliente"
            activo={r.alCobrar.recibo}
            onCambiar={(v) => cambiar({ alCobrar: { ...r.alCobrar, recibo: v } })}
          />
          <SiNo
            etiqueta="Comanda de cocina"
            detalle="El papel con el número y lo que hay que preparar"
            activo={r.alCobrar.comanda}
            onCambiar={(v) => cambiar({ alCobrar: { ...r.alCobrar, comanda: v } })}
          />
          {r.alCobrar.recibo && r.alCobrar.comanda && (
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
            onCambiar={(v) => cambiar({ tamanoLogo: v })}
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
        <p className="mt-1 text-[12px] text-texto-3">El lema, la dirección, el teléfono y el NIT se cargan en «Logo y datos».</p>
      </Tarjeta>
      <Tarjeta titulo="Contenido">
        <SiNo etiqueta="Cajero" activo={r.cajero} onCambiar={(v) => cambiar({ cajero: v })} />
        <SiNo
          etiqueta="Total en letras"
          detalle={`«${totalEnLetras(123)}»`}
          activo={r.totalEnLetras}
          onCambiar={(v) => cambiar({ totalEnLetras: v })}
        />
        <SiNo etiqueta="Método de pago y cambio" activo={r.pagoYCambio} onCambiar={(v) => cambiar({ pagoYCambio: v })} />
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
        <div className="space-y-2.5">
          <Texto etiqueta="Mensaje principal" valor={r.mensaje} largo={80} onCambiar={(v) => cambiar({ mensaje: v })} />
          <Texto etiqueta="Mensaje secundario" valor={r.mensaje2} largo={80} onCambiar={(v) => cambiar({ mensaje2: v })} />
        </div>
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

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    setError("");
    try {
      const r = await apiMenuDigital.subirLogo(await prepararImagen(f, "marca"));
      onLogo(r.logo);
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
              <figure className="flex flex-col items-center justify-center rounded-xl bg-white p-4">
                <img src={urlApi(logo)} alt="Logo" className="max-h-28 max-w-full object-contain" />
                <figcaption className="mt-2 text-[12px] text-texto-3">En color · menú y pantallas</figcaption>
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
        <p className="mt-2 text-[12px] text-texto-3">
          Mejor PNG o JPG con fondo blanco o transparente. Es el mismo logo de tu página, si la tenés.
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

function VistaPrevia({ r, logo, negocio }: { r: AjustesRecibo; logo: string | null; negocio: string }) {
  const [papel, setPapel] = useState<"recibo" | "comanda">("recibo");
  const angosto = r.ancho === 58;
  const grupos = [
    { titulo: "EN MESA", lineas: (VENTA_EJEMPLO.detalles ?? []).filter((d) => d.consumo === "MESA") },
    { titulo: "PARA LLEVAR", lineas: (VENTA_EJEMPLO.detalles ?? []).filter((d) => d.consumo !== "MESA") },
  ];
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-3xl bg-muted p-4">
        <div className="mb-3 flex justify-center">
          <Segmentado<"recibo" | "comanda">
            etiqueta="Qué papel"
            valor={papel}
            onCambiar={setPapel}
            opciones={[
              { valor: "recibo", texto: "Recibo del cliente" },
              { valor: "comanda", texto: "Comanda de cocina" },
            ]}
          />
        </div>
        {/* La vista previa es lo único imprimible de esta pantalla: "Imprimir
            prueba" saca este papel en la impresora elegida. */}
        <div id="area-impresion" style={angosto ? ({ "--ancho-ticket": "48mm" } as CSSProperties) : undefined}>
          {papel === "recibo" ? (
            <article className={`card mx-auto p-5 print:max-w-none print:border-0 print:p-0 print:shadow-none ${angosto ? "max-w-[250px]" : "max-w-[320px]"}`}>
              <CabeceraNegocio r={r} logo={logo} nombre={negocio} />
              <div className="mx-auto mb-2 w-fit rounded-lg border-2 border-texto px-4 py-1 text-center">
                <p className="text-[10px] font-bold tracking-[0.3em] text-texto-3">TICKET N°</p>
                <p className="font-mono text-[44px] font-black leading-none tracking-tight text-texto">{numeroTicket(84)}</p>
              </div>
              <dl className="border-t border-dashed border-borde pt-2 text-xs">
                <Dato etiqueta="Venta:" valor="V-000009" />
                <Dato etiqueta="Fecha:" valor={fmtFechaHora(VENTA_EJEMPLO.fecha)} />
                {r.cajero && <Dato etiqueta="Cajero:" valor="Administrador" />}
                <Dato etiqueta="Pago:" valor="Efectivo" />
              </dl>
              <div className="mt-2 border-t border-dashed border-borde pt-1">
                {grupos.map((g) => (
                  <div key={g.titulo}>
                    <p className="mt-1.5 border-b border-texto pb-0.5 text-[11px] font-extrabold tracking-[0.14em] text-texto">{g.titulo}</p>
                    {g.lineas.map((d, i) => (
                      <div key={i} className="py-1 text-[13px]">
                        <p className="font-semibold text-texto">{d.producto}</p>
                        <div className="flex justify-between text-texto-3">
                          <span>
                            {d.cantidad} × {fmtMoney(d.precio)}
                          </span>
                          <span className="font-bold text-texto">{fmtMoney(d.subtotal)}</span>
                        </div>
                        {d.nota && <p className="text-xs italic text-texto-3">{d.nota}</p>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
                <div className="flex justify-between border-t border-borde pt-1 text-base font-extrabold text-texto">
                  <dt>TOTAL</dt>
                  <dd>{fmtMoney(123)}</dd>
                </div>
                {r.totalEnLetras && <p className="text-[11px] italic text-texto-2">{totalEnLetras(123)}</p>}
              </dl>
              {r.pagoYCambio && (
                <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
                  <Linea etiqueta="Método de pago" valor="Efectivo" />
                  <Linea etiqueta="Efectivo recibido" valor={fmtMoney(150)} />
                  <Linea etiqueta="Cambio entregado" valor={fmtMoney(27)} />
                </dl>
              )}
              <QrRecibo r={r} conTicket />
              <div className="mt-3 border-t border-dashed border-borde pt-2 text-center text-xs text-texto-3">
                {r.mensaje && <p className="font-semibold text-texto">{r.mensaje}</p>}
                {r.mensaje2 && <p className="mt-0.5">{r.mensaje2}</p>}
              </div>
            </article>
          ) : (
            <ComandaCocina venta={VENTA_EJEMPLO} numero={84} negocio={negocio} minutos={r.minutosEstimados} />
          )}
        </div>
        <Boton variante="ghost" icono="printer" className="mt-3 w-full" onClick={() => window.print()}>
          Imprimir prueba
        </Boton>
        <p className="mt-2 text-center text-[12px] text-texto-3">
          Vista previa con datos de ejemplo. Todo se imprime en negro sobre blanco.
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
