import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Input, Modal } from "../../components/ui";
import { useAuth } from "../../store/AuthContext";
import { fraccion } from "./api";
import { useReporte } from "./contexto";
import { textoRango, type Periodo } from "./periodo";
import { numeroWhatsapp, partesVenta, textoResumen } from "./vistas/resumen/datos";
import { useDatosResumen } from "./vistas/resumen/useResumen";

const CLAVE_NUMERO = "bamardev_reportes_whatsapp";

/** "de la semana", "de septiembre": lo que va después de "Resumen". */
function cual(p: Periodo): string {
  const mes = new Date(Number(p.desde.slice(0, 4)), Number(p.desde.slice(5, 7)) - 1, 1).toLocaleDateString("es-BO", { month: "long" });
  switch (p.preset) {
    case "hoy":
      return "de hoy";
    case "ayer":
      return "de ayer";
    case "semana":
      return "de la semana";
    case "dias30":
      return "de los últimos 30 días";
    case "mes":
    case "mesPasado":
      return `de ${mes}`;
    case "anio":
      return `del ${p.desde.slice(0, 4)}`;
    case "rango":
      return "del período";
  }
}

/**
 * "Enviar resumen": el resumen del período en texto, para mandarlo por
 * WhatsApp al celular del dueño o copiarlo.
 *
 * Abre WhatsApp con el texto escrito (`wa.me`) y quien manda es la persona:
 * el sistema no tiene un WhatsApp propio que envíe solo. Por eso tampoco está
 * la casilla "enviar solo al cerrar caja" del diseño: una casilla que no hace
 * nada es peor que no tenerla. El número se recuerda en este navegador.
 */
export default function EnviarResumen({ onCerrar }: { onCerrar: () => void }) {
  const d = useDatosResumen({ paraTexto: true });
  const { periodo, comparacion, sucursalNombre } = useReporte();
  const { negocio, rubro } = useAuth();
  const [numero, setNumero] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_NUMERO) ?? "";
    } catch {
      return "";
    }
  });
  const [copiado, setCopiado] = useState(false);
  const r = d.resumen.datos;

  const texto = r
    ? textoResumen({
        negocio: negocio?.nombre ?? "Mi negocio",
        sucursal: sucursalNombre,
        cual: cual(periodo),
        rango: textoRango(periodo.desde, periodo.hasta),
        rubro,
        ventas: r.ventas,
        ventasDelta: fraccion(r.ventasDeltaPct),
        contra: comparacion.contra,
        partes: partesVenta(rubro, { billar: d.billar, composicion: r.composicion, metodos: d.metodos }),
        ganancia: d.er?.utilidadNeta ?? null,
        billar: d.billar,
        meseros: d.meseros,
        agenda: d.agenda,
        mermas: d.mermas,
        metodos: d.metodos,
        porCobrar: d.creditos?.resumen.totalPorCobrar ?? null,
      })
    : "";

  const recordar = () => {
    try {
      localStorage.setItem(CLAVE_NUMERO, numero.trim());
    } catch {
      // Sin almacenamiento: se manda igual, sólo no se recuerda el número.
    }
  };

  const enviar = () => {
    recordar();
    const destino = numeroWhatsapp(numero);
    // Sin número, wa.me abre WhatsApp para elegir a quién mandarlo.
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Enviar resumen"
      subtitulo="Para el celular del dueño o del encargado"
      onClose={onCerrar}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="ghost" icono={copiado ? "check" : "fileText"} disabled={!texto} onClick={() => void copiar()}>
            {copiado ? "Copiado" : "Copiar"}
          </Boton>
          <Boton icono="arrowUpRight" disabled={!texto} onClick={enviar}>
            Enviar por WhatsApp
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {d.resumen.error ? (
          <ErrorMsg onReintentar={d.resumen.recargar}>{d.resumen.error}</ErrorMsg>
        ) : !r ? (
          <Cargando texto="Armando el resumen…" />
        ) : (
          <div className="rounded-2xl bg-primary-50/60 p-3">
            <pre className="whitespace-pre-wrap rounded-xl bg-white p-4 font-sans text-[13px] leading-relaxed text-texto shadow-sm">{texto}</pre>
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-texto-2">
            <Icon name="phone" size={14} />
            Número de WhatsApp
          </span>
          <Input
            type="tel"
            inputMode="tel"
            value={numero}
            placeholder="+591 7…"
            onChange={(e) => setNumero(e.target.value)}
            onBlur={recordar}
          />
          <span className="mt-1 block text-[12px] text-texto-4">Si lo dejás vacío, WhatsApp te deja elegir a quién mandarlo.</span>
        </label>
      </div>
    </Modal>
  );
}
