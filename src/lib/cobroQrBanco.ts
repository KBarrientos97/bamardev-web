import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * El QR del banco en la caja (PLAN-QR-AUTOMATICO D4). En vez de mostrar la foto
 * fija del QR del negocio y esperar que la cajera mire su banco y confirme, la
 * pantalla de cobro le pide al backend un QR por el MONTO EXACTO, lo muestra y
 * consulta cada pocos segundos: cuando el banco avisa, el cobro se confirma
 * solo y al vender viaja el `pagoQrId` (el backend comprueba que de verdad esté
 * pagado, cubra el monto y no se haya usado en otra venta).
 *
 * Sin cuenta del banco (o con el banco caído) `manda` es false y todo sigue
 * como siempre: QR fijo y confirmación a mano.
 */

export type EstadoCobroBanco =
  /** No hay nada que cobrar por QR del banco (otro método, sin cuenta, apagado). */
  | "nada"
  /** Pidiéndole el QR al backend. */
  | "abriendo"
  | "esperando"
  | "pagado"
  /** Pasó su hora sin pagarse: se puede abrir otro. */
  | "vencido"
  /** No se pudo abrir (banco caído): la caja sigue con el QR fijo. */
  | "error";

export interface CobroBanco {
  estado: EstadoCobroBanco;
  /** El QR del banco es el que se muestra (abriéndose, esperando o ya pagado). */
  manda: boolean;
  /** El cobro, para mandarlo en el pago de la venta cuando está `pagado`. */
  id: number | null;
  imagen: string | null;
  venceEn: string | null;
  /** Por qué no se pudo abrir o verificar. */
  error: string;
  /** «Ya pagó, verificar»: le pregunta al banco sin esperar su aviso. */
  verificar: () => Promise<void>;
  /** Abre otro QR (uno vencido, o tras un error). */
  reintentar: () => void;
}

/** Cada cuánto se pregunta si ya se pagó. */
const CONSULTA_MS = 3000;
/** Lo que se espera sin cambios en el monto antes de pedir el QR (la cajera sigue tecleando). */
const ESPERA_MS = 700;

const SIN_COBRO: Pick<CobroBanco, "id" | "imagen" | "venceEn"> = { id: null, imagen: null, venceEn: null };

/**
 * @param habilitado  el negocio cobra con el banco y el cobro es de una venta (no de una mesa)
 * @param monto       lo que tiene que entrar por QR; 0 = no hay QR que mostrar
 */
export function useCobroQrBanco({ habilitado, monto }: { habilitado: boolean; monto: number }): CobroBanco {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoCobroBanco>("nada");
  const [cobro, setCobro] = useState(SIN_COBRO);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);
  // El cobro abierto sin pagar, para cerrarlo si la cajera cambia el monto o sale.
  const abierto = useRef<number | null>(null);

  // ¿Hay cuenta del banco? Una sola vez por pantalla, y sólo si hace falta.
  useEffect(() => {
    if (!habilitado || disponible !== null) return;
    let vivo = true;
    // `Promise.resolve().then` y no la llamada directa: si algo falla al
    // armar la petición (un cliente de prueba sin el método, un corte), es un
    // rechazo más y cae al QR fijo, no una pantalla rota.
    Promise.resolve()
      .then(() => api.cobroQrDisponible())
      .then((r) => vivo && setDisponible(r.automatico))
      // Si no se pudo saber, es como no tenerla: el QR fijo de siempre.
      .catch(() => vivo && setDisponible(false));
    return () => {
      vivo = false;
    };
  }, [habilitado, disponible]);

  const cerrarAbierto = useCallback(() => {
    const id = abierto.current;
    abierto.current = null;
    // Mejor esfuerzo: si el banco no lo inhabilita, vence solo a los 10 minutos.
    if (id != null) void api.anularCobroQr(id).catch(() => undefined);
  }, []);

  // Abrir (o reabrir) el QR cuando cambia el monto.
  useEffect(() => {
    if (!habilitado || disponible !== true || !(monto > 0)) {
      cerrarAbierto();
      setEstado("nada");
      setCobro(SIN_COBRO);
      return;
    }
    let vivo = true;
    cerrarAbierto();
    setEstado("abriendo");
    setError("");
    setCobro(SIN_COBRO);
    const espera = setTimeout(() => {
      api
        .crearCobroQr(monto)
        .then((c) => {
          if (!vivo) {
            // Cambió el monto mientras se abría: este ya no sirve.
            void api.anularCobroQr(c.id).catch(() => undefined);
            return;
          }
          abierto.current = c.id;
          setCobro({ id: c.id, imagen: c.imagenQr, venceEn: c.venceEn });
          setEstado("esperando");
        })
        .catch((e) => {
          if (!vivo) return;
          setError(e instanceof Error ? e.message : "No se pudo abrir el QR del banco.");
          setEstado("error");
        });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [habilitado, disponible, monto, vuelta, cerrarAbierto]);

  // Mientras espera, se le pregunta al backend si el banco ya avisó.
  useEffect(() => {
    if (estado !== "esperando" || cobro.id == null) return;
    const id = cobro.id;
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await api.estadoCobroQr(id);
        if (!vivo) return;
        if (r.estado === "PAGADO") {
          // Ya no se cierra al salir: está cobrado.
          abierto.current = null;
          setEstado("pagado");
        } else if (r.estado === "VENCIDO" || r.estado === "ANULADO") {
          abierto.current = null;
          setEstado("vencido");
        }
      } catch {
        /* sin señal un momento: la próxima consulta lo resuelve */
      }
    };
    const timer = setInterval(() => void consultar(), CONSULTA_MS);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [estado, cobro.id]);

  // Al salir de la pantalla sin cobrar, el QR abierto se cierra.
  useEffect(() => cerrarAbierto, [cerrarAbierto]);

  const verificar = useCallback(async () => {
    if (cobro.id == null) return;
    setError("");
    try {
      const r = await api.verificarCobroQr(cobro.id);
      if (r.estado === "PAGADO") {
        abierto.current = null;
        setEstado("pagado");
      } else if (r.estado === "VENCIDO" || r.estado === "ANULADO") {
        abierto.current = null;
        setEstado("vencido");
      } else {
        setError("El banco todavía no ve el pago. Probá de nuevo en unos segundos.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar al banco.");
    }
  }, [cobro.id]);

  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);

  const manda = estado === "abriendo" || estado === "esperando" || estado === "pagado" || estado === "vencido";
  return { estado, manda, ...cobro, error, verificar, reintentar };
}
