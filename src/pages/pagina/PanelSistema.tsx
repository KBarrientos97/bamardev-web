import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { avisoDeQuitados, totalPedido } from "../../lib/pagina/pedido";
import { urlPedidoDe } from "../../lib/pagina/rutas";
import type { Pedido } from "../../lib/pagina/usePedido";
import { alDescansar, precargarMapa, type Ubicacion } from "../../lib/mapa";
import { ErrorPedido, apiPedidoPublico } from "../../lib/pedidosWeb/apiPublica";
import {
  guardarDatosCliente,
  guardarPedidoEnCurso,
  leerDatosCliente,
  nuevoRequestId,
  telefonoDe8,
} from "../../lib/pedidosWeb/cliente";
import { evaluarSucursales, motivoSinCobertura, type Evaluada } from "../../lib/pedidosWeb/sucursal";
import { avisoSinPedidos } from "../../lib/pedidosWeb/aviso";
import { teclasDeDialogo } from "../../lib/pedidosWeb/dialogo";
import type { CuerpoPedido, FormaPagoWeb, InfoPedidos, TipoPedidoWeb } from "../../lib/pedidosWeb/tipos";
import { siteKeyTurnstile } from "../../lib/turnstile";
import Captcha, { type EstadoCaptcha } from "../../publico/Captcha";
import { FAMILIA, LineaCarrito, Trazo } from "./PedidoPagina";

// MapLibre (~1 MB) se baja recién cuando el cliente abre el pedido: la página
// pública sigue liviana. Se adelanta apenas se abre el panel.
const pedazoPin = () => import("./ElegirPin");
const ElegirPin = lazy(pedazoPin);

/**
 * El pedido de la página cuando el negocio recibe pedidos EN EL SISTEMA
 * (pedidos web, 13-nov). Reemplaza al panel del WhatsApp: en vez de armar un
 * texto, el cliente deja sus datos, marca su casa en el mapa y toca «Hacer
 * pedido». Llega a la caja y él sigue el pedido en su propia página.
 *
 * Una acción principal por pantalla: el botón de abajo es siempre «Hacer
 * pedido» y, si falta algo, lo dice; el total (con el envío estimado) queda a
 * la vista.
 */

/** Hasta dónde aceptamos un GPS sin pedirle al cliente que mueva el pin. */
export const PRECISION_MAXIMA_M = 100;

const ICONO_PIN = "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
const ATAJOS_BILLETES = [50, 100, 200];

/**
 * Con la pantalla baja (celular de costado, o un navegador que achica la
 * página cuando sale el teclado, como el de Instagram o Samsung) la cabecera y
 * el pie fijos se comían todo el alto y el formulario quedaba en una rendija de
 * 50 px. Ahí la hoja entera pasa a ser la que se desplaza, y el pie va al final
 * del formulario en vez de quedarse fijo.
 */
export const ESTILO_PANTALLA_CORTA = `@media (max-height:520px){.hoja-pedido{overflow-y:auto!important;max-height:92dvh!important}.cuerpo-pedido{overflow:visible!important;flex:none!important}.pie-pedido{padding-bottom:12px!important}}`;

/** Dónde se corrige cada cosa que falta: a ese campo sube y se enfoca la hoja (QA R1, N5). */
type CampoForm = "nombre" | "telefono" | "direccion" | "pin" | "otroMonto" | "captcha";
interface Falta {
  texto: string;
  campo?: CampoForm;
}

/** La marca que lleva la entrada del historial que suma la hoja abierta (M4). */
const MARCA_HOJA = "hojaPedidoAbierta";

/** Cuánto se espera al captcha antes de ofrecer reintentar: «Esperá un segundo» no puede ser eterno (QA R1, N1). */
export const ESPERA_CAPTCHA_MS = 12_000;

/**
 * Un local «abierto» por horario puede no tener la caja abierta, y entonces no
 * recibe pedidos por la página. Se dice eso y no «cerrado», que contradecía al
 * «Abierto ahora» de la tarjeta del local (QA R1, N2).
 */
const TEXTO_SIN_PEDIDOS_AHORA = "No está recibiendo pedidos ahora";

/** Una opción de la lista «Sale desde» / «¿Dónde lo retirás?». */
interface Fila {
  e: Evaluada;
  puede: boolean;
  detalle: string;
}

export default function PanelSistema({
  subdominio,
  negocio,
  fuerte,
  tinte,
  pedido,
  info,
  errorInfo,
  onReintentarInfo,
  sucursalCatalogo,
  onSucursal,
  muchasSucursales,
  whatsappUrl,
  ancho,
  onCerrar,
}: {
  subdominio: string;
  negocio: string;
  /** El color del negocio oscurecido (el blanco encima se lee siempre). */
  fuerte: string;
  tinte: string;
  pedido: Pedido;
  info: InfoPedidos | null;
  errorInfo: string;
  onReintentarInfo: () => void;
  /** La sucursal elegida en el catálogo: de ella son los precios de las líneas. */
  sucursalCatalogo: number;
  onSucursal: (indice: number) => void;
  /** El catálogo tiene más de una sucursal: cambiar de local cambia los precios. */
  muchasSucursales: boolean;
  /** A dónde ir si hoy no se puede pedir por acá. */
  whatsappUrl: string | null;
  ancho: boolean;
  onCerrar: () => void;
}) {
  const navegar = useNavigate();
  const { lineas } = pedido;
  const inicial = useMemo(() => leerDatosCliente(subdominio), [subdominio]);
  const siteKey = siteKeyTurnstile();

  const [tipo, setTipo] = useState<TipoPedidoWeb>(inicial.tipo);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [direccion, setDireccion] = useState(inicial.direccion);
  const [referencia, setReferencia] = useState(inicial.referencia);
  const [nota, setNota] = useState("");
  const [pin, setPin] = useState<Ubicacion | null>(null);
  /** El pin salió de un GPS poco preciso y el cliente todavía no lo movió. */
  const [pinSinAjustar, setPinSinAjustar] = useState(false);
  const [precisionM, setPrecisionM] = useState<number | null>(null);
  const [gps, setGps] = useState({ buscando: false, falla: "", aviso: "" });
  const [manual, setManual] = useState<number | null>(null);
  const [formaPago, setFormaPago] = useState<FormaPagoWeb>("EFECTIVO");
  const [pagaCon, setPagaCon] = useState<number | null>(null);
  const [otroMonto, setOtroMonto] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [estadoCaptcha, setEstadoCaptcha] = useState<EstadoCaptcha>("verificando");
  /** Campo trampa (honeypot): una persona no lo ve ni lo llena; un bot sí. */
  const [trampa, setTrampa] = useState("");
  /** Lo que el backend dijo que está agotado en el local (`ITEM_AGOTADO`), hasta que se recargue la info. */
  const [agotadosServidor, setAgotadosServidor] = useState<{ almacenId: number; ids: number[] } | null>(null);
  const campos = useRef<Partial<Record<CampoForm, HTMLElement | null>>>({});
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  /**
   * Tocó «Hacer pedido» mientras el captcha todavía verificaba (con una conexión
   * lenta tarda varios segundos): el pedido sale solo apenas llega el token, una
   * sola vez, en vez de pedirle que toque otra vez sin decirle cuándo (QA R2, M8).
   */
  const [enviarAlVerificar, setEnviarAlVerificar] = useState(false);
  const [sacados, setSacados] = useState("");
  const requestId = useRef(nuevoRequestId());
  /**
   * Con qué contenido se pidió la última vez. El mismo `clienteRequestId` sólo
   * sirve para reintentar EL MISMO pedido (si el primer envío entró pero no lo
   * supimos, no se duplica). Si el cliente cambió algo en el medio, es otro
   * pedido y sale con otra clave: con la vieja el backend devolvería el
   * anterior y nunca vería lo que agregó (PW-10).
   */
  const huellaEnviada = useRef("");
  const cierre = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cierre.current?.focus();
    return alDescansar(() => precargarMapa(pedazoPin));
  }, []);
  useEffect(() => setAgotadosServidor(null), [info]);

  // El botón «atrás» del celular cierra la hoja y no la página (QA R2, M4).
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;
  useEffect(() => {
    const anterior = window.history.state as { idx?: number } | null;
    // Una entrada nueva del historial con la misma dirección. Se copia el estado
    // del router (con su índice sumado) para que sus propias navegaciones sigan
    // contando bien.
    window.history.pushState({ ...anterior, idx: (anterior?.idx ?? 0) + 1, [MARCA_HOJA]: true }, "");
    let cerradaPorAtras = false;
    const alAtras = () => {
      cerradaPorAtras = true;
      alCerrar.current();
    };
    window.addEventListener("popstate", alAtras);
    return () => {
      window.removeEventListener("popstate", alAtras);
      // Se cerró con la X (o por otra causa) y la entrada que sumamos sigue arriba:
      // se saca, o el primer «atrás» de la página parecería no hacer nada. Si se
      // navegó (el seguimiento reemplaza la entrada), ya no está y no se toca.
      const actual = window.history.state as Record<string, unknown> | null;
      if (!cerradaPorAtras && actual?.[MARCA_HOJA]) {
        // El «atrás» que provocamos nosotros no es del cliente: se descarta sin que
        // lo vea una hoja que se haya vuelto a abrir mientras llega (también el
        // doble montaje del modo estricto). Este oyente se registró antes que el de
        // la hoja nueva, así que corta la propagación primero.
        window.addEventListener("popstate", (e) => e.stopImmediatePropagation(), { once: true });
        window.history.back();
      }
    };
  }, []);

  // El captcha que no responde no puede dejar al cliente esperando para siempre.
  useEffect(() => {
    if (!siteKey || captcha || estadoCaptcha !== "verificando") return;
    const t = window.setTimeout(() => setEstadoCaptcha("fallo"), ESPERA_CAPTCHA_MS);
    return () => window.clearTimeout(t);
  }, [siteKey, captcha, estadoCaptcha, vueltaCaptcha]);

  /** Sube hasta ese campo y lo enfoca (la hoja es larga: el campo con error queda fuera de la pantalla). */
  function irAlCampo(campo: CampoForm) {
    const el = campos.current[campo];
    if (!el) return;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    el.focus?.({ preventScroll: true });
  }

  function alEstadoCaptcha(e: EstadoCaptcha) {
    setEstadoCaptcha(e);
    // Cloudflare pidió que tilde el recuadro, que está al final de la hoja: se sube hasta él.
    if (e === "pide") irAlCampo("captcha");
  }

  function reintentarCaptcha() {
    setCaptcha(null);
    setEstadoCaptcha("verificando");
    setVueltaCaptcha((v) => v + 1);
  }

  const sinPedidos = avisoSinPedidos(info);
  const sucursales = useMemo(() => info?.sucursales ?? [], [info]);
  const conMapa = sucursales.filter((s) => s.latitud != null && s.longitud != null);
  const aceptaDelivery = (info?.tipos ?? []).includes("DELIVERY") && conMapa.length > 0;
  const aceptaRecoger = (info?.tipos ?? []).includes("RECOGER");
  // Si el negocio hace sólo una de las dos, esa queda fija.
  const tipoReal: TipoPedidoWeb = tipo === "DELIVERY" && !aceptaDelivery && aceptaRecoger ? "RECOGER" : tipo === "RECOGER" && !aceptaRecoger && aceptaDelivery ? "DELIVERY" : tipo;
  const centroMapa = conMapa.length ? { lat: conMapa[0].latitud!, lng: conMapa[0].longitud! } : null;

  // ── Qué sucursal lo atiende ──
  const punto = useMemo(() => (pin ? { latitud: pin.lat, longitud: pin.lng } : null), [pin]);
  const evaluadas = useMemo(() => evaluarSucursales(tipoReal === "DELIVERY" ? punto : null, sucursales), [tipoReal, punto, sucursales]);
  const filas: Fila[] = useMemo(() => {
    if (tipoReal === "DELIVERY") {
      return evaluadas.map((e) => {
        let detalle: string;
        if (!e.sucursal.abierta) detalle = TEXTO_SIN_PEDIDOS_AHORA;
        else if (!pin) detalle = "Marcá tu ubicación";
        else if (!e.conCoordenadas) detalle = "No hace delivery";
        else if (!e.dentroDeZona) detalle = "Queda lejos de tu dirección";
        else detalle = `${e.distanciaKm?.toLocaleString("es-BO")} km · envío ≈ ${formatoPrecio(e.envio)}`;
        return { e, puede: e.atiende, detalle };
      });
    }
    return [...evaluadas]
      .sort((a, b) => a.indice - b.indice)
      .map((e) => ({ e, puede: e.sucursal.abierta, detalle: e.sucursal.abierta ? (e.sucursal.direccion ?? "") : TEXTO_SIN_PEDIDOS_AHORA }));
  }, [evaluadas, tipoReal, pin]);

  let elegida: number | null = null;
  if (tipoReal === "DELIVERY") {
    elegida = filas.find((f) => f.e.indice === manual && f.puede)?.e.indice ?? filas.find((f) => f.puede)?.e.indice ?? null;
  } else {
    elegida =
      filas.find((f) => f.e.indice === manual && f.puede)?.e.indice ??
      filas.find((f) => f.e.indice === sucursalCatalogo && f.puede)?.e.indice ??
      filas.find((f) => f.puede)?.e.indice ??
      null;
  }
  const ev = filas.find((f) => f.e.indice === elegida)?.e ?? null;
  const sucursal = ev?.sucursal ?? null;
  const sucursalId = sucursal?.id ?? null;
  // El error del envío era de ESE pedido en ESE local: al cambiar de local o de
  // productos ya no corresponde, y dejaba el «está agotado» pegado en el pie de
  // la hoja aunque ya se hubiera arreglado (QA R2, M2).
  useEffect(() => setError(""), [sucursalId, lineas]);
  // Lo que ESE local no puede servir hoy: lo que dice la info y lo que acaba de decir el backend.
  const agotados = useMemo(() => {
    const ids = new Set(sucursal?.agotados ?? []);
    if (agotadosServidor && sucursal && agotadosServidor.almacenId === sucursal.id) agotadosServidor.ids.forEach((i) => ids.add(i));
    return ids;
  }, [sucursal, agotadosServidor]);
  const lineasAgotadas = lineas.filter((l) => agotados.has(l.id));

  // Con otro local elegido, las líneas toman SUS precios (y se van las que ahí no se ofrecen).
  const antes = useRef(lineas.length);
  const lineasAntes = useRef(lineas);
  /**
   * El próximo cambio de las líneas viene de cambiar de local (no de que el cliente
   * quitara una): sólo ahí se avisa «sacamos…». Antes avisaba también al quitar a mano
   * un producto, diciendo que «ese local no lo ofrece».
   */
  const porCambioDeLocal = useRef(false);
  useEffect(() => {
    if (elegida == null || elegida === sucursalCatalogo || !muchasSucursales) return;
    antes.current = lineas.length;
    lineasAntes.current = lineas;
    porCambioDeLocal.current = true;
    onSucursal(elegida);
    // Sólo cuando cambia el local elegido: onSucursal y lineas cambian solos al reaccionar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida, sucursalCatalogo, muchasSucursales]);
  useEffect(() => {
    if (lineas.length < antes.current && porCambioDeLocal.current) {
      const n = antes.current - lineas.length;
      setSacados(avisoDeQuitados(lineasAntes.current, lineas) ?? `Sacamos ${n} ${n === 1 ? "producto" : "productos"} que ese local no ofrece.`);
    } else if (lineas.length < antes.current) {
      setSacados("");
    }
    porCambioDeLocal.current = false;
    antes.current = lineas.length;
    lineasAntes.current = lineas;
  }, [lineas]);

  const { total: subtotal } = totalPedido(lineas);
  const envio = tipoReal === "DELIVERY" ? (ev?.envio ?? null) : 0;
  const total = subtotal + (envio ?? 0);

  // El billete elegido deja de alcanzar si el total sube (otro producto, otro local, un
  // envío más caro): el atajo ya no se ofrece, así que se vuelve a «Justo» en vez de
  // quedar un monto invisible que bloquea el pedido con un error que no se entiende.
  useEffect(() => {
    if (pagaCon != null && pagaCon < total) setPagaCon(null);
  }, [pagaCon, total]);

  // ── Qué falta ──
  const tel = telefonoDe8(telefono);
  const montoOtro = Number(otroMonto.replace(",", "."));
  const pagaConFinal = formaPago === "EFECTIVO" ? (otroMonto.trim() ? montoOtro : pagaCon) : null;
  const faltas: Falta[] = [];
  if (!lineas.length) faltas.push({ texto: "Sumá algo a tu pedido." });
  if (lineasAgotadas.length && sucursal) {
    const nombres = lineasAgotadas.map((l) => `«${l.titulo}»`).join(", ");
    faltas.push({
      texto: `${nombres} ${lineasAgotadas.length === 1 ? "está agotado" : "están agotados"} en ${sucursal.nombre}. Sacalo del pedido${sucursales.length > 1 ? " o elegí otro local" : ""}.`,
    });
  }
  if (nombre.trim().length < 2) faltas.push({ texto: "Escribí tu nombre completo (mínimo 2 letras).", campo: "nombre" });
  if (!tel) faltas.push({ texto: "Escribí tu WhatsApp de 8 dígitos (empieza con 6 o 7).", campo: "telefono" });
  if (tipoReal === "DELIVERY") {
    if (direccion.trim().length < 5) faltas.push({ texto: "Escribí tu dirección.", campo: "direccion" });
    if (!pin) faltas.push({ texto: "Marcá en el mapa dónde te lo llevamos.", campo: "pin" });
    else if (pinSinAjustar) faltas.push({ texto: "Tu ubicación es poco precisa: movela en el mapa hasta tu puerta.", campo: "pin" });
    else if (!sucursal) faltas.push({ texto: motivoSinCobertura(punto, sucursales) ?? "Ningún local llega a esa dirección ahora.", campo: "pin" });
  } else if (!sucursal) {
    faltas.push({ texto: "Elegí un local abierto." });
  }
  if (pagaConFinal != null && (!Number.isFinite(pagaConFinal) || pagaConFinal < total)) {
    faltas.push({ texto: `Con ese monto no alcanza: tu pedido suma ${formatoPrecio(total)}.`, campo: "otroMonto" });
  }
  if (siteKey && !captcha) {
    faltas.push({
      texto:
        estadoCaptcha === "pide"
          ? "Tildá el recuadro de verificación (está al final de esta hoja)."
          : estadoCaptcha === "fallo"
            ? "No pudimos verificar que no sos un robot: tocá «Reintentar la verificación»."
            : enviarAlVerificar
              ? "Verificando que no sos un robot: tu pedido se manda solo apenas termine."
              : "Esperá un segundo: estamos verificando que no sos un robot.",
      campo: "captcha",
    });
  }
  const bloqueado = faltas.length > 0 || enviando || !!sinPedidos;
  /** Sólo el captcha (verificando) impide mandar: ahí el toque se guarda y sale solo. */
  const soloFaltaElCaptcha = !!siteKey && !captcha && estadoCaptcha === "verificando" && faltas.every((f) => f.campo === "captcha") && !sinPedidos;

  async function hacerPedido() {
    setIntento(true);
    if (soloFaltaElCaptcha && !enviando) {
      setEnviarAlVerificar(true);
      return;
    }
    if (faltas.length || enviando || sinPedidos || !sucursal || !tel) {
      // Sube al primer campo con problema: en el celular queda fuera de la pantalla y parece que el botón no anda.
      const campo = faltas.find((f) => f.campo)?.campo;
      if (campo && !enviando) irAlCampo(campo);
      return;
    }
    setError("");
    setEnviando(true);
    const cuerpo: CuerpoPedido = {
      ...(siteKey && captcha ? { captcha } : {}),
      clienteRequestId: "",
      almacenId: sucursal.id,
      tipo: tipoReal,
      nombre: nombre.trim(),
      telefono: tel,
      formaPago,
      ...(tipoReal === "DELIVERY" && pin
        ? {
            direccion: direccion.trim(),
            ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
            latitud: pin.lat,
            longitud: pin.lng,
            ...(precisionM != null ? { precisionM: Math.round(precisionM) } : {}),
          }
        : {}),
      ...(pagaConFinal != null ? { pagaCon: pagaConFinal } : {}),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      lineas: lineas.map((l) => ({ itemId: l.id, cantidad: l.cantidad })),
      // Siempre vacío para una persona; el campo trampa sólo lo llena un bot.
      ...(trampa ? { sitioWeb: trampa } : {}),
    };
    const huella = JSON.stringify({ ...cuerpo, captcha: undefined });
    if (huella !== huellaEnviada.current) requestId.current = nuevoRequestId();
    huellaEnviada.current = huella;
    cuerpo.clienteRequestId = requestId.current;
    try {
      const r = await apiPedidoPublico.crear(subdominio, cuerpo);
      guardarDatosCliente(subdominio, { nombre: nombre.trim(), telefono: tel, direccion: direccion.trim(), referencia: referencia.trim(), tipo: tipoReal });
      guardarPedidoEnCurso(subdominio, { token: r.token, numero: r.numero });
      requestId.current = nuevoRequestId();
      huellaEnviada.current = "";
      pedido.vaciar();
      // `replace`: la entrada que sumó la hoja se reemplaza por el seguimiento, así
      // «atrás» desde ahí vuelve a la página y no a una hoja que ya no existe.
      navegar(urlPedidoDe(subdominio, r.token), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu pedido. Probá de nuevo.");
      // El token del captcha es de un solo uso: se pide otro. El mismo
      // `clienteRequestId` se mantiene mientras el pedido no cambie: si sí había entrado, no se duplica.
      if (siteKey) reintentarCaptcha();
      // Lo agotado en ese local: se marca en el carrito y se avisa cuáles son.
      if (e instanceof ErrorPedido && e.codigo === "ITEM_AGOTADO" && e.itemIds?.length && sucursal) {
        setAgotadosServidor({ almacenId: sucursal.id, ids: e.itemIds });
      }
      // Cerró el local o la zona cambió: que el aviso se actualice.
      if (e instanceof ErrorPedido && (e.status === 400 || e.status === 409)) onReintentarInfo();
    } finally {
      setEnviando(false);
    }
  }

  // Llegó el token que se esperaba: se manda, una sola vez (se apaga la marca antes
  // de enviar). El mismo `clienteRequestId` cubre el reintento por si ya había entrado.
  // Si en el medio el captcha pidió tildar o falló, o cambió algo que ahora falta, se
  // suelta la marca y se vuelve al camino de siempre (que avisa qué falta).
  useEffect(() => {
    if (!enviarAlVerificar) return;
    if (captcha) {
      setEnviarAlVerificar(false);
      void hacerPedido();
    } else if (estadoCaptcha !== "verificando") {
      setEnviarAlVerificar(false);
    }
    // hacerPedido es de este mismo render: sólo importa que llegó el token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captcha, estadoCaptcha, enviarAlVerificar]);

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setGps({ buscando: false, falla: "Este navegador no da la ubicación. Marcala tocando el mapa.", aviso: "" });
      return;
    }
    setGps({ buscando: true, falla: "", aviso: "" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const u = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
        const precisa = pos.coords.accuracy <= PRECISION_MAXIMA_M;
        setPin(u);
        setPrecisionM(pos.coords.accuracy);
        setPinSinAjustar(!precisa);
        setGps({
          buscando: false,
          falla: "",
          aviso: precisa ? "" : `Tu ubicación es poco precisa (±${Math.round(pos.coords.accuracy)} m). Movela en el mapa hasta tu puerta.`,
        });
      },
      () => setGps({ buscando: false, falla: "No pudimos leer tu ubicación. Marcala tocando el mapa.", aviso: "" }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  // Tocar o arrastrar el pin: es del cliente, no del GPS.
  const alMoverPin = (u: Ubicacion) => {
    setPin(u);
    setPinSinAjustar(false);
    setPrecisionM(null);
    // Ya marcó el pin a mano: el «No pudimos leer tu ubicación» de antes deja de valer.
    setGps((g) => ({ ...g, aviso: "", falla: "" }));
  };

  const campo: CSSProperties = {
    border: "1px solid #D1D5DB",
    borderRadius: 12,
    padding: "12px 14px",
    // 16 px: con menos, el iPhone agranda la página al enfocar.
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#1F2937",
    background: "#ffffff",
  };
  const etiqueta: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#4B5563" };
  const conError = (malo: boolean): CSSProperties => ({ ...campo, borderColor: intento && malo ? "#DC2626" : "#D1D5DB" });
  /** Con el intento hecho y el dato mal, el lector de pantalla lo anuncia como inválido (QA R1, N5). */
  const invalido = (malo: boolean) => (intento && malo ? true : undefined);
  const guardar = (c: CampoForm) => (el: HTMLElement | null) => {
    campos.current[c] = el;
  };
  const piezas = lineas.reduce((n, l) => n + l.cantidad, 0);
  const segmento = (activo: boolean, disponible = true): CSSProperties => ({
    flex: 1,
    borderRadius: 11,
    padding: "12px",
    cursor: disponible ? "pointer" : "not-allowed",
    opacity: disponible ? 1 : 0.5,
    fontSize: 15,
    fontWeight: activo ? 700 : 500,
    textAlign: "center",
    background: activo ? "#ffffff" : "transparent",
    boxShadow: activo ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
    color: activo ? fuerte : "#4B5563",
    position: "relative",
  });
  const oculto: CSSProperties = { position: "absolute", opacity: 0, pointerEvents: "none" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tu pedido"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      onKeyDown={(e) => teclasDeDialogo(e, onCerrar)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(17,24,39,.5)",
        display: "flex",
        alignItems: ancho ? "center" : "flex-end",
        justifyContent: "center",
        padding: ancho ? 24 : 0,
      }}
    >
      {/* Las opciones son radios escondidos: sin esto, con el teclado no se ve cuál tiene el foco. */}
      <style>{`.seg-pedido:has(input:focus-visible){outline:3px solid ${fuerte};outline-offset:1px}${ESTILO_PANTALLA_CORTA}`}</style>
      <section
        className="hoja-pedido"
        style={{
          background: "#ffffff",
          width: "min(520px, 100%)",
          maxHeight: ancho ? "88dvh" : "94dvh",
          borderRadius: ancho ? 20 : "20px 20px 0 0",
          fontFamily: FAMILIA,
          color: "#1F2937",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 12px", borderBottom: "1px solid #F1F2F4" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Tu pedido</h2>
            <span style={{ fontSize: 13, color: "#6B7280" }}>
              {piezas} {piezas === 1 ? "producto" : "productos"} · {negocio}
            </span>
          </div>
          <button
            ref={cierre}
            type="button"
            aria-label="Cerrar el pedido"
            onClick={onCerrar}
            style={{ width: 40, height: 40, borderRadius: 999, border: "none", background: "#F3F4F6", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "#374151" }}
          >
            ×
          </button>
        </header>

        <div className="cuerpo-pedido" style={{ overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
          {errorInfo && !info && (
            <div role="alert" style={{ background: "#FEF2F2", color: "#B91C1C", borderRadius: 12, padding: "10px 12px", fontSize: 14 }}>
              {errorInfo}{" "}
              <button type="button" onClick={onReintentarInfo} style={{ border: "none", background: "none", color: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
                Reintentar
              </button>
            </div>
          )}
          {!info && !errorInfo && <p style={{ margin: 0, fontSize: 14, color: "#6B7280" }}>Un momento…</p>}
          {sinPedidos && (
            <div role="alert" style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontWeight: 600, display: "flex", flexDirection: "column", gap: 8 }}>
              <span>{sinPedidos}</span>
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ color: fuerte, fontWeight: 800 }}>
                  Escribirnos por WhatsApp
                </a>
              )}
            </div>
          )}

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {lineas.map((l) => (
              <LineaCarrito key={l.id} l={l} fuerte={fuerte} tinte={tinte} pedido={pedido} agotado={agotados.has(l.id) && sucursal ? `Agotado en ${sucursal.nombre}: sacalo del pedido` : undefined} />
            ))}
          </ul>
          <button
            type="button"
            onClick={onCerrar}
            style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: fuerte, fontWeight: 700, fontSize: 15, cursor: "pointer", padding: "2px 0", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
          >
            <Trazo d="M12 5v14M5 12h14" color={fuerte} size={16} grosor={2.6} />
            Agregar más productos
          </button>
          {sacados && (
            <p role="status" style={{ margin: 0, fontSize: 13, color: "#92400E", background: "#FFFBEB", borderRadius: 10, padding: "8px 10px" }}>
              {sacados}
            </p>
          )}

          {info && !sinPedidos && (
            <>
              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend style={{ ...etiqueta, marginBottom: 8, padding: 0 }}>¿Cómo lo recibís?</legend>
                <div style={{ display: "flex", gap: 6, background: "#F3F4F6", borderRadius: 14, padding: 4 }}>
                  {(["DELIVERY", "RECOGER"] as const).map((t) => {
                    const disponible = t === "DELIVERY" ? aceptaDelivery : aceptaRecoger;
                    return (
                      <label key={t} className="seg-pedido" style={segmento(tipoReal === t, disponible)}>
                        <input
                          type="radio"
                          name="tipo-pedido"
                          checked={tipoReal === t}
                          disabled={!disponible}
                          onChange={() => {
                            setTipo(t);
                            setManual(null);
                          }}
                          style={oculto}
                        />
                        {t === "DELIVERY" ? "Delivery" : "Paso a recoger"}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={etiqueta}>Tu nombre</span>
                <input ref={guardar("nombre")} aria-invalid={invalido(nombre.trim().length < 2)} aria-label="Tu nombre" value={nombre} maxLength={60} autoComplete="name" placeholder="Para que sepan de quién es" onChange={(e) => setNombre(e.target.value)} style={conError(nombre.trim().length < 2)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={etiqueta}>Tu WhatsApp</span>
                <input ref={guardar("telefono")} aria-invalid={invalido(!tel)} aria-label="Tu WhatsApp" value={telefono} inputMode="tel" autoComplete="tel-national" maxLength={16} placeholder="71234567" onChange={(e) => setTelefono(e.target.value)} style={conError(!tel)} />
                <span style={{ fontSize: 12, color: "#6B7280" }}>Para avisarte si pasa algo con tu pedido.</span>
              </label>

              {tipoReal === "DELIVERY" && (
                <>
                  <div ref={guardar("pin")} tabIndex={-1} aria-invalid={invalido(!pin || pinSinAjustar)} style={{ display: "flex", flexDirection: "column", gap: 8, outline: "none", ...(intento && (!pin || pinSinAjustar) ? { border: "2px solid #DC2626", borderRadius: 14, padding: 6 } : {}) }}>
                    <span style={etiqueta}>Marcá dónde te lo llevamos</span>
                    <Suspense fallback={<div style={{ height: 260, borderRadius: 14, background: "#EEF0F3" }} />}>
                      <ElegirPin valor={pin} centro={centroMapa} onCambio={alMoverPin} />
                    </Suspense>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={usarMiUbicacion}
                        disabled={gps.buscando}
                        style={{ minHeight: 44, borderRadius: 12, border: `1.5px solid ${fuerte}`, background: "#ffffff", color: fuerte, fontWeight: 700, fontSize: 14, padding: "0 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
                      >
                        <Trazo d={ICONO_PIN} color={fuerte} size={16} grosor={2.2} />
                        {gps.buscando ? "Buscando…" : "Usar mi ubicación"}
                      </button>
                      <span style={{ fontSize: 12, color: pin && !pinSinAjustar ? "#047857" : intento && !pin ? "#B91C1C" : "#6B7280", fontWeight: pin ? 700 : 400 }}>
                        {pin ? (pinSinAjustar ? "Falta ajustar el pin" : "Ubicación marcada") : "Tocá el mapa; el pin se arrastra."}
                      </span>
                    </div>
                    {gps.aviso && (
                      <p role="alert" style={{ margin: 0, fontSize: 13, color: "#92400E", background: "#FFFBEB", borderRadius: 10, padding: "8px 10px" }}>
                        {gps.aviso}
                      </p>
                    )}
                    {gps.falla && (
                      <p role="alert" style={{ margin: 0, fontSize: 13, color: "#B91C1C" }}>
                        {gps.falla}
                      </p>
                    )}
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={etiqueta}>Dirección</span>
                    <input ref={guardar("direccion")} aria-invalid={invalido(direccion.trim().length < 5)} aria-label="Dirección" value={direccion} maxLength={200} autoComplete="street-address" placeholder="Calle y número" onChange={(e) => setDireccion(e.target.value)} style={conError(direccion.trim().length < 5)} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={etiqueta}>Referencia (opcional)</span>
                    <input aria-label="Referencia" value={referencia} maxLength={200} placeholder="Portón negro, frente a la farmacia…" onChange={(e) => setReferencia(e.target.value)} style={campo} />
                  </label>
                </>
              )}

              {sucursales.length > 1 && (
                <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                  <legend style={{ ...etiqueta, marginBottom: 8, padding: 0 }}>{tipoReal === "DELIVERY" ? "Sale desde" : "¿Dónde lo retirás?"}</legend>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filas.map(({ e, puede, detalle }) => {
                      const activa = elegida === e.indice;
                      return (
                        <label
                          key={e.sucursal.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: `1.5px solid ${activa ? fuerte : "#E5E7EB"}`,
                            background: activa ? tinte : "#ffffff",
                            opacity: puede ? 1 : 0.6,
                            cursor: puede ? "pointer" : "not-allowed",
                          }}
                        >
                          <input type="radio" name="sucursal-pedido" checked={activa} disabled={!puede} onChange={() => setManual(e.indice)} />
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{e.sucursal.nombre}</span>
                            {detalle && <span style={{ fontSize: 12, color: "#6B7280" }}>{detalle}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              {sucursales.length === 1 && tipoReal === "DELIVERY" && pin && !sucursal && (
                <p role="alert" style={{ margin: 0, fontSize: 14, color: "#B91C1C", fontWeight: 600 }}>
                  {motivoSinCobertura(punto, sucursales)}
                </p>
              )}

              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend style={{ ...etiqueta, marginBottom: 8, padding: 0 }}>{tipoReal === "DELIVERY" ? "¿Cómo pagás? Al recibir" : "¿Cómo pagás? Al retirar"}</legend>
                <div style={{ display: "flex", gap: 6, background: "#F3F4F6", borderRadius: 14, padding: 4 }}>
                  {(["EFECTIVO", "QR"] as const).map((f) => (
                    <label key={f} className="seg-pedido" style={segmento(formaPago === f)}>
                      <input type="radio" name="forma-pago" checked={formaPago === f} onChange={() => setFormaPago(f)} style={oculto} />
                      {f === "EFECTIVO" ? "Efectivo" : "QR"}
                    </label>
                  ))}
                </div>
              </fieldset>
              {formaPago === "EFECTIVO" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={etiqueta}>¿Con cuánto pagás?</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[{ valor: null as number | null, texto: "Justo" }, ...ATAJOS_BILLETES.filter((b) => b >= total).map((b) => ({ valor: b as number | null, texto: `Bs ${b}` }))].map((a) => {
                      const activo = !otroMonto.trim() && pagaCon === a.valor;
                      return (
                        <button
                          key={a.texto}
                          type="button"
                          aria-pressed={activo}
                          onClick={() => {
                            setPagaCon(a.valor);
                            setOtroMonto("");
                          }}
                          style={{ minHeight: 44, minWidth: 64, borderRadius: 12, border: `1.5px solid ${activo ? fuerte : "#D1D5DB"}`, background: activo ? fuerte : "#ffffff", color: activo ? "#ffffff" : "#374151", fontWeight: 700, fontSize: 15, padding: "0 14px", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          {a.texto}
                        </button>
                      );
                    })}
                    <input
                      aria-label="Otro monto"
                      inputMode="decimal"
                      value={otroMonto}
                      placeholder="Otro monto"
                      onChange={(e) => setOtroMonto(e.target.value.replace(/[^\d.,]/g, ""))}
                      ref={guardar("otroMonto")}
                      aria-invalid={otroMonto.trim() && montoOtro < total ? true : undefined}
                      style={{ ...campo, width: 130, minHeight: 44, padding: "8px 12px", borderColor: otroMonto.trim() && montoOtro < total ? "#DC2626" : "#D1D5DB" }}
                    />
                  </div>
                  {pagaConFinal != null && Number.isFinite(pagaConFinal) && pagaConFinal >= total && total > 0 && (
                    <span style={{ fontSize: 13, color: "#047857", fontWeight: 600 }}>Te llevan {formatoPrecio(Math.round((pagaConFinal - total) * 100) / 100)} de cambio.</span>
                  )}
                </div>
              )}
              {formaPago === "QR" && <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Te mostramos el QR para pagar {tipoReal === "DELIVERY" ? "cuando recibas el pedido" : "cuando lo retires"}.</p>}

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={etiqueta}>Nota (opcional)</span>
                <input aria-label="Nota para el negocio" value={nota} maxLength={200} placeholder="Sin cebolla, extra crema…" onChange={(e) => setNota(e.target.value)} style={campo} />
              </label>
              {/* Campo trampa: invisible y fuera del Tab. Una persona no lo ve; un bot que llena todo, sí. */}
              <div aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
                <label>
                  Sitio web
                  <input type="text" name="sitioWeb" tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
                </label>
              </div>
              {siteKey && (
                <div ref={guardar("captcha")} tabIndex={-1} style={{ display: "flex", flexDirection: "column", gap: 8, outline: "none" }}>
                  {estadoCaptcha === "pide" && !captcha && (
                    <p role="status" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#92400E", background: "#FFFBEB", borderRadius: 10, padding: "8px 10px" }}>
                      Tildá el recuadro para seguir: así sabemos que no sos un robot.
                    </p>
                  )}
                  {estadoCaptcha === "fallo" && !captcha && (
                    <div role="alert" style={{ fontSize: 14, color: "#B91C1C", fontWeight: 600, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                      <span>No pudimos verificar que no sos un robot.</span>
                      <button type="button" onClick={reintentarCaptcha} style={{ minHeight: 44, borderRadius: 12, border: `1.5px solid ${fuerte}`, background: "#ffffff", color: fuerte, fontWeight: 700, fontSize: 14, padding: "0 14px", cursor: "pointer", fontFamily: "inherit" }}>
                        Reintentar la verificación
                      </button>
                    </div>
                  )}
                  <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} onEstado={alEstadoCaptcha} discreto />
                </div>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => pedido.vaciar()}
            style={{ alignSelf: "center", border: "none", background: "transparent", color: "#6B7280", cursor: "pointer", fontSize: 13, textDecoration: "underline", fontFamily: "inherit" }}
          >
            Vaciar pedido
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280", textAlign: "center" }}>
            El local acepta tu pedido y lo seguís desde tu celular. {tipoReal === "DELIVERY" ? "Pagás al recibir." : "Pagás al retirar."}
          </p>
        </div>

        <footer
          className="pie-pedido"
          style={{
            borderTop: "1px solid #E5E7EB",
            padding: "8px 18px",
            paddingBottom: ancho ? 12 : "calc(8px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "#ffffff",
          }}
        >
          {/* Productos y envío en un solo renglón: el pie fijo se comía el 30 % del alto del celular (QA R1, N7). */}
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", columnGap: 14, rowGap: 0, fontSize: 13, color: "#4B5563" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <dt>Productos</dt>
              <dd style={{ margin: 0 }}>{formatoPrecio(subtotal)}</dd>
            </div>
            {tipoReal === "DELIVERY" && (
              <div style={{ display: "flex", gap: 6 }}>
                <dt>Envío</dt>
                <dd style={{ margin: 0 }}>{envio != null ? `≈ ${formatoPrecio(envio)}` : "Marcá tu ubicación"}</dd>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", flexBasis: "100%", fontWeight: 800, fontSize: 18, color: "#1F2937" }}>
              <dt>Total</dt>
              <dd style={{ margin: 0 }}>{formatoPrecio(total)}</dd>
            </div>
          </dl>
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 14, color: "#B91C1C", fontWeight: 600 }}>
              {error}
            </p>
          )}
          {intento && !error && !sinPedidos && faltas.length > 0 && (
            <p role="alert" style={{ margin: 0, fontSize: 14, color: "#B91C1C", fontWeight: 600 }}>
              {faltas[0].texto}
            </p>
          )}
          {/* El captcha pide algo al cliente: se le dice acá, donde mira, sin esperar a que toque el botón. */}
          {siteKey && !captcha && info && !sinPedidos && estadoCaptcha === "pide" && (
            <button type="button" onClick={() => irAlCampo("captcha")} style={{ border: "none", background: "transparent", color: fuerte, fontWeight: 700, fontSize: 14, textDecoration: "underline", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
              Falta tildar el recuadro de verificación
            </button>
          )}
          {siteKey && !captcha && info && !sinPedidos && estadoCaptcha === "fallo" && (
            <button type="button" onClick={reintentarCaptcha} style={{ border: "none", background: "transparent", color: "#B91C1C", fontWeight: 700, fontSize: 14, textDecoration: "underline", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
              No pudimos verificar que no sos un robot: reintentar
            </button>
          )}
          <button
            type="button"
            aria-disabled={bloqueado}
            onClick={hacerPedido}
            style={{ border: "none", borderRadius: 14, background: fuerte, color: "#ffffff", fontWeight: 800, fontSize: 16, minHeight: 50, cursor: enviando ? "wait" : "pointer", opacity: bloqueado ? 0.55 : 1, fontFamily: "inherit" }}
          >
            {enviando ? "Enviando tu pedido…" : enviarAlVerificar ? "Verificando… se envía solo" : "Hacer pedido"}
          </button>
        </footer>
      </section>
    </div>
  );
}
