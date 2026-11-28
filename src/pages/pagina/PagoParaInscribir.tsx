import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { apiAcademiaPublica } from "../../lib/academia/apiPublica";
import type { QrDelBanco } from "../../lib/academia/tipos";

/** El QR que quedó abierto, para seguir donde estaba si la pestaña se recarga. */
export interface CobroAbierto {
  solicitud: string;
  qr: QrDelBanco;
  /** El nombre de pila, para saludar. */
  nombre: string;
  /** "Tatuajes · Lunes… 08:00 a 10:00". */
  resumen: string;
}

const clave = (sub: string) => `bamar:inscribirme:${sub}:qr`;

export function leerCobro(sub: string): CobroAbierto | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(clave(sub)) ?? "null") as CobroAbierto | null;
    return c && typeof c.solicitud === "string" && c.qr ? c : null;
  } catch {
    return null;
  }
}

export function guardarCobro(sub: string, c: CobroAbierto | null) {
  try {
    if (c) sessionStorage.setItem(clave(sub), JSON.stringify(c));
    else sessionStorage.removeItem(clave(sub));
  } catch {
    // Sin almacenamiento: el QR sigue en pantalla, sólo no vuelve al recargar.
  }
}

/** Cada cuánto se pregunta si el banco ya avisó. */
const CONSULTA_MS = 3000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Estado = { que: "esperando" } | { que: "vencido" } | { que: "pagado"; token: string | null; enRevision: boolean };

/**
 * La inscripción con pago obligatorio (28-nov): el QR, y la espera hasta que el
 * banco confirme. Recién ahí existe la inscripción. En el celular nadie puede
 * escanear su propia pantalla, así que lo primero es guardar la imagen.
 */
export default function PagoParaInscribir({
  sub,
  cobro,
  color,
  urlEstado,
  urlPagina,
  whatsapp,
  onPagado,
  onSalir,
}: {
  sub: string;
  cobro: CobroAbierto;
  color: string;
  /** La dirección del estado de cuenta de la inscripción recién creada. */
  urlEstado: (token: string) => string;
  urlPagina: string;
  whatsapp: string | null;
  /** Ya se pagó: se borra lo guardado. */
  onPagado: () => void;
  /** Volver al formulario (otra opción, o el QR venció). */
  onSalir: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ que: "esperando" });
  const [ahora, setAhora] = useState(() => Date.now());
  const [saliendo, setSaliendo] = useState(false);
  const pagado = useRef(onPagado);
  useEffect(() => {
    pagado.current = onPagado;
  });

  useEffect(() => {
    if (estado.que !== "esperando") return;
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await apiAcademiaPublica.solicitud(sub, cobro.solicitud);
        if (!vivo) return;
        if (r.estado === "VENCIDO") setEstado({ que: "vencido" });
        else if (r.estado === "PAGADO") {
          // La plata entró; si una regla lo frenó (el grupo se llenó), lo ve la recepción.
          const cuenta = r.token ? await apiAcademiaPublica.estadoCuenta(sub, r.token).catch(() => null) : null;
          if (!vivo) return;
          pagado.current();
          setEstado({ que: "pagado", token: r.token, enRevision: !!cuenta?.pago.enRevision });
        }
      } catch {
        /* sin señal un momento: la próxima consulta lo resuelve */
      }
    };
    void consultar();
    const id = setInterval(() => void consultar(), CONSULTA_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      vivo = false;
      clearInterval(id);
      clearInterval(reloj);
    };
  }, [estado.que, sub, cobro.solicitud]);

  async function elegirOtra() {
    setSaliendo(true);
    // Si no se pudo cerrar, el QR vence solo y el servidor lo cierra al pedir otro.
    await apiAcademiaPublica.cancelarSolicitud(sub, cobro.solicitud).catch(() => undefined);
    onSalir();
  }

  const boton = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold";

  if (estado.que === "pagado") {
    return (
      <div className="space-y-4 p-5 text-center">
        <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5] text-[#047857]">
          <Icon name="check" size={28} />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[#111827]">¡Listo, {cobro.nombre}!</h1>
          <p className="text-sm font-semibold text-[#111827]">
            Recibimos tu pago de {bs(cobro.qr.monto)}.{" "}
            {estado.enRevision ? "El instituto lo está confirmando y te avisa por WhatsApp." : "Quedaste inscrito."}
          </p>
          <p className="text-[13px] text-[#4B5563]">{cobro.resumen}</p>
        </div>
        <div className="space-y-2">
          {estado.token && (
            <a href={urlEstado(estado.token)} className={`${boton} text-white`} style={{ background: color }}>
              Ver mi estado de cuenta
            </a>
          )}
          <a href={urlPagina} className={`${boton} border border-[#D1D5DB] bg-white text-[#374151]`}>
            Volver a los cursos
          </a>
        </div>
      </div>
    );
  }

  if (estado.que === "vencido") {
    return (
      <div className="space-y-4 p-5 text-center">
        <h1 className="text-xl font-bold text-[#111827]">El QR venció sin pagarse</h1>
        <p className="text-sm text-[#4B5563]">No quedó nada registrado. Si querés inscribirte, generá uno nuevo.</p>
        <button type="button" onClick={onSalir} className={`${boton} text-white`} style={{ background: color }}>
          Volver a intentar
        </button>
      </div>
    );
  }

  const restante = new Date(cobro.qr.venceEn).getTime() - ahora;
  return (
    <section aria-label="Pagar con QR" className="space-y-4 p-5">
      <div className="text-center">
        <p className="text-[13px] font-semibold text-[#6B7280]">{cobro.qr.etiqueta}</p>
        <h1 className="text-3xl font-extrabold text-[#111827]">{bs(cobro.qr.monto)}</h1>
        <p className="text-[13px] text-[#4B5563]">{cobro.resumen}</p>
      </div>
      <img src={cobro.qr.imagenQr} alt={`QR para pagar ${bs(cobro.qr.monto)}`} className="mx-auto w-full max-w-[280px] rounded-xl border border-[#E5E7EB] bg-white" />
      <a href={cobro.qr.imagenQr} download="qr-inscripcion.png" className={`${boton} text-white`} style={{ background: color }}>
        <Icon name="download" size={18} />
        Guardar el QR
      </a>
      <ol className="list-decimal space-y-1 rounded-xl bg-[#F9FAFB] py-3 pl-8 pr-3.5 text-[13px] text-[#374151]">
        <li>Guardá el QR en tu celular.</li>
        <li>Abrí la app de tu banco y elegí pagar con QR.</li>
        <li>Elegí la imagen de tu galería y confirmá. El monto ya está puesto.</li>
      </ol>
      <p role="status" className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-[#374151]">
        <Icon name="clock" size={16} />
        Esperando tu pago… {restante > 0 ? `vence en ${mmss(restante)}` : "venciendo"}
      </p>
      <p className="text-center text-[12px] text-[#6B7280]">
        Quedás inscrito cuando el banco confirme el pago; esta pantalla lo dice sola. No cierres esta pestaña.
      </p>
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={() => void elegirOtra()} disabled={saliendo} className="text-[13px] font-semibold underline" style={{ color }}>
          Elegir otra cosa para pagar
        </button>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-[#374151] underline">
            ¿Problemas para pagar? Escribinos por WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
