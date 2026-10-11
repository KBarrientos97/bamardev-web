import { useState } from "react";
import QRCode from "qrcode";
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
  Vacio,
} from "../../components/ui";
import { apiPagina } from "../../lib/pagina/apiPagina";
import type { DestinoTipo, EnlaceCorto, EstadisticasEnlace, EstadoEnlaceCorto } from "../../lib/pagina/tipos";
import { useApi } from "../../lib/useApi";

const CANALES: { valor: string; texto: string }[] = [
  { valor: "CARTEL", texto: "Cartel o afiche" },
  { valor: "INSTAGRAM", texto: "Instagram" },
  { valor: "FACEBOOK", texto: "Facebook" },
  { valor: "TIKTOK", texto: "TikTok" },
  { valor: "ESTADO_WA", texto: "Estado de WhatsApp" },
  { valor: "WHATSAPP", texto: "Chat de WhatsApp" },
  { valor: "VOLANTE", texto: "Volante" },
  { valor: "TICKET", texto: "Ticket" },
  { valor: "OTRO", texto: "Otro" },
];

const ORIGENES: Record<string, string> = {
  DIRECTO: "Directo / app",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
  OTRO: "Otro",
};

const TONO: Record<EstadoEnlaceCorto, "verde" | "gris" | "amarillo" | "rojo"> = {
  ACTIVO: "verde",
  PAUSADO: "gris",
  VENCIDO: "amarillo",
  DESACTIVADO: "rojo",
};
const TEXTO_ESTADO: Record<EstadoEnlaceCorto, string> = {
  ACTIVO: "Activo",
  PAUSADO: "Pausado",
  VENCIDO: "Vencido",
  DESACTIVADO: "Desactivado por BamarDev",
};

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo guardar");

function NuevoEnlace({ abierto, onClose, onCreado }: { abierto: boolean; onClose: () => void; onCreado: () => void }) {
  const [destinoTipo, setDestinoTipo] = useState<DestinoTipo>("PAGINA");
  const [destino, setDestino] = useState("");
  const [titulo, setTitulo] = useState("");
  const [canal, setCanal] = useState("INSTAGRAM");
  const [vence, setVence] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    setGuardando(true);
    setError("");
    try {
      await apiPagina.crearCorto({
        destinoTipo,
        destino: destinoTipo === "URL" ? destino.trim() : undefined,
        titulo: titulo.trim() || CANALES.find((x) => x.valor === canal)?.texto || "Enlace",
        canal,
        // Vence al terminar ese día en Bolivia (UTC−4).
        expiraEn: vence ? new Date(`${vence}T23:59:59-04:00`).toISOString() : undefined,
      });
      onCreado();
      onClose();
      setTitulo("");
      setDestino("");
      setVence("");
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal
      abierto={abierto}
      titulo="Nuevo enlace corto"
      subtitulo="Uno por canal: así sabés de dónde vino cada visita."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={crear} disabled={guardando || (destinoTipo === "URL" && !destino.trim())}>
            {guardando ? "Creando…" : "Crear enlace"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <ErrorMsg>{error}</ErrorMsg>
        <Campo label="¿Adónde lleva?">
          <Select aria-label="Adónde lleva" value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value as DestinoTipo)}>
            <option value="PAGINA">Mi página</option>
            <option value="RESERVA">Mi reserva online</option>
            <option value="URL">Otro (WhatsApp, Instagram, Facebook, TikTok, Maps…)</option>
          </Select>
        </Campo>
        {destinoTipo === "URL" && (
          <Campo
            label="Dirección"
            hint="Sólo sitios habilitados (redes, WhatsApp, Maps, apps de delivery). Para otro, pedíselo a soporte."
          >
            <Input aria-label="Dirección" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="https://wa.me/591…" />
          </Campo>
        )}
        <Campo label="¿Dónde lo vas a usar?">
          <Select aria-label="Dónde lo vas a usar" value={canal} onChange={(e) => setCanal(e.target.value)}>
            {CANALES.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.texto}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Nombre (para vos)">
          <Input aria-label="Nombre" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="2x1 del sábado" maxLength={80} />
        </Campo>
        <Campo label="Vence (opcional)" hint="Después de esa fecha muestra «ya no está disponible».">
          <Input aria-label="Vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}

function Estadisticas({ id, onClose }: { id: number | null; onClose: () => void }) {
  const datos = useApi<EstadisticasEnlace | null>(() => (id ? apiPagina.estadisticas(id) : Promise.resolve(null)), [id]);
  const d = datos.datos;
  const max = Math.max(1, ...(d?.porDia.map((x) => x.clics) ?? [1]));
  return (
    <Modal abierto={id !== null} titulo={d?.enlace.titulo ?? "Estadísticas"} subtitulo="Últimos 30 días, sin datos de quién tocó." onClose={onClose}>
      {!d ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-texto-2">
            <strong>{d.enlace.clicsTotal}</strong> clics en total.
          </p>
          {d.porDia.length === 0 ? (
            <p className="text-sm text-texto-3">Todavía nadie lo usó en estos días.</p>
          ) : (
            <ul className="space-y-1" aria-label="Clics por día">
              {d.porDia.map((x) => (
                <li key={x.fecha} className="flex items-center gap-2 text-xs text-texto-3">
                  <span className="w-20 shrink-0">{x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}</span>
                  <span className="h-2.5 rounded bg-primary-boton" style={{ width: `${(x.clics / max) * 100}%`, minWidth: 4 }} />
                  <span>{x.clics}</span>
                </li>
              ))}
            </ul>
          )}
          {d.porOrigen.length > 0 && (
            <p className="text-xs text-texto-3">
              De dónde: {d.porOrigen.map((o) => `${ORIGENES[o.origen] ?? o.origen} ${o.clics}`).join(" · ")}
            </p>
          )}
          {d.cambios.length > 0 && (
            <div className="text-xs text-texto-3">
              <strong className="text-texto-2">Cambios de destino</strong>
              <ul className="mt-1 space-y-0.5">
                {d.cambios.map((c) => (
                  <li key={c.creadoEn} className="break-all">
                    {c.creadoEn.slice(0, 10)}: {c.destinoAnterior} → {c.destinoNuevo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

async function bajarQr(enlace: EnlaceCorto) {
  const png = await QRCode.toDataURL(enlace.url, { errorCorrectionLevel: "M", margin: 2, width: 800 });
  const a = document.createElement("a");
  a.href = png;
  a.download = `qr-${enlace.codigo}.png`;
  a.click();
}

/**
 * "Mis enlaces" (PLAN-ACORTADOR §4.11): los enlaces cortos del negocio, con
 * su QR y sus clics. Sólo el ADMIN con la feature `enlaces_cortos`.
 */
export default function MisEnlaces() {
  const lista = useApi(() => apiPagina.enlaces(), []);
  const [nuevo, setNuevo] = useState(false);
  const [stats, setStats] = useState<number | null>(null);
  const [aBorrar, setABorrar] = useState<EnlaceCorto | null>(null);
  const [aviso, setAviso] = useAviso();
  const [error, setError] = useState("");

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setError("");
    try {
      await fn();
      lista.recargar();
      setAviso(ok);
    } catch (e) {
      setError(mensaje(e));
    }
  };
  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setAviso("Enlace copiado");
    } catch {
      setError(`No se pudo copiar: ${url}`);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Mis enlaces"
        subtitulo="Enlaces cortos con QR para tus historias, carteles y promociones. Cambiás el destino sin reimprimir."
        volver={{ a: "/mi-pagina", etiqueta: "Volver a Mi página" }}
        accion={
          <Boton icono="plus" onClick={() => setNuevo(true)}>
            Nuevo enlace
          </Boton>
        }
      />
      <ErrorMsg>{error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>
      {lista.cargando && !lista.datos ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : !lista.datos?.length ? (
        <div className="card">
          <Vacio icono="qr" titulo="Todavía no tenés enlaces" texto="Creá uno por canal: la historia de Instagram, el estado de WhatsApp, el volante." />
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.datos.map((x) => (
            <li key={x.id} className="card flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-0 flex-[1_1_240px] space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-texto">{x.titulo}</strong>
                  <Badge tono={TONO[x.estado]}>{TEXTO_ESTADO[x.estado]}</Badge>
                  {x.origen !== "MANUAL" && <Badge tono="azul">Del sistema</Badge>}
                </div>
                <button type="button" onClick={() => void copiar(x.url)} className="block max-w-full truncate text-left text-[13px] font-semibold text-primary-700">
                  {x.url.replace(/^https?:\/\//, "")}
                </button>
                <span className="block truncate text-xs text-texto-3">→ {x.destino}</span>
              </div>
              <button type="button" onClick={() => setStats(x.id)} className="text-right text-xs text-texto-3 hover:text-texto">
                <strong className="block text-base text-texto">{x.clics7Dias}</strong>
                clics en 7 días
              </button>
              <div className="flex gap-1.5">
                <button type="button" aria-label={`Bajar QR de ${x.titulo}`} title="Bajar QR" onClick={() => void bajarQr(x)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white hover:bg-muted">
                  <Icon name="qr" size={16} />
                </button>
                {x.estado !== "DESACTIVADO" && (
                  <Boton
                    variante="ghost"
                    className="!px-3 !py-1.5 text-[13px]"
                    onClick={() => void accion(() => apiPagina.editarCorto(x.id, { activo: !x.activo }), x.activo ? "Enlace pausado" : "Enlace reactivado")}
                  >
                    {x.activo ? "Pausar" : "Reactivar"}
                  </Boton>
                )}
                {x.origen === "MANUAL" && (
                  <button type="button" aria-label={`Borrar ${x.titulo}`} onClick={() => setABorrar(x)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white text-danger-text hover:bg-muted">
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <NuevoEnlace abierto={nuevo} onClose={() => setNuevo(false)} onCreado={() => { lista.recargar(); setAviso("Enlace creado"); }} />
      <Estadisticas id={stats} onClose={() => setStats(null)} />
      <Confirmar
        abierto={aBorrar !== null}
        titulo="Borrar enlace"
        texto={`¿Borrar «${aBorrar?.titulo ?? ""}»? Los QR impresos con este enlace dejan de funcionar y el código no se vuelve a usar.`}
        etiquetaOk="Borrar"
        peligroso
        onCancel={() => setABorrar(null)}
        onOk={() => {
          const x = aBorrar;
          setABorrar(null);
          if (x) void accion(() => apiPagina.borrarCorto(x.id), "Enlace borrado");
        }}
      />
    </div>
  );
}
