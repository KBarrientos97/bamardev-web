import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { AvisoOk, Badge, Boton, Cargando, ErrorMsg, Modal, useAviso, Vacio } from "../../../components/ui";
import { apiSpa } from "../../../lib/agenda/apiSpa";
import type { PlantillaConsentimiento } from "../../../lib/agenda/tiposSpa";
import { useApi } from "../../../lib/useApi";
import { Casilla } from "./comun";
import { mensajeDe } from "./utilConfig";

/**
 * Consentimientos (feature `consentimientos`, agenda fase 3, §17.3): qué
 * servicio pide una firma antes de atender y con qué texto. Cambiar el texto
 * sube la versión: quien firmó el anterior tiene que volver a firmar.
 */
export default function TabConsentimientos() {
  const plantillas = useApi(() => apiSpa.plantillasConsentimiento(), []);
  const [editando, setEditando] = useState<PlantillaConsentimiento | null>(null);
  const [aviso, setAviso] = useAviso();

  if (plantillas.cargando && !plantillas.datos) return <Cargando />;
  const lista = plantillas.datos ?? [];

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl bg-info-bg px-3.5 py-2.5 text-sm text-info-text">
        <Icon name="info" size={17} />
        <span>
          El cliente firma en la pantalla antes de atenderse. La firma y su ficha de salud son datos sensibles: sólo los
          ve quien tiene permiso para ver datos de salud.
        </span>
      </p>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg onReintentar={plantillas.recargar}>{plantillas.error}</ErrorMsg>
      {lista.length === 0 ? (
        <div className="card">
          <Vacio icono="fileText" titulo="Todavía no hay servicios" texto="Cargá los servicios en la pestaña Servicios." />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft">
          {lista.map((p) => (
            <li key={p.servicioId} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-texto">{p.servicio}</span>
                  {p.requiere ? (
                    <Badge tono="verde">Pide firma · v{p.version}</Badge>
                  ) : (
                    <Badge>Sin firma</Badge>
                  )}
                </div>
                {p.requiere && p.texto && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-texto-3">{p.texto}</p>
                )}
              </div>
              <Boton
                variante="ghost"
                icono="edit"
                onClick={() => setEditando(p)}
                aria-label={`Configurar el consentimiento de ${p.servicio}`}
                className="shrink-0"
              >
                Configurar
              </Boton>
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <FormConsentimiento
          plantilla={editando}
          onClose={() => setEditando(null)}
          onGuardado={(p) => {
            setEditando(null);
            setAviso(p.requiere ? `"${p.servicio}" pide firma (versión ${p.version}).` : `"${p.servicio}" ya no pide firma.`);
            plantillas.recargar();
          }}
        />
      )}
    </div>
  );
}

function FormConsentimiento({
  plantilla,
  onClose,
  onGuardado,
}: {
  plantilla: PlantillaConsentimiento;
  onClose: () => void;
  onGuardado: (p: PlantillaConsentimiento) => void;
}) {
  const [requiere, setRequiere] = useState(plantilla.requiere || !plantilla.texto);
  const [texto, setTexto] = useState(plantilla.texto ?? plantilla.textoSugerido);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambiaVersion = plantilla.texto != null && texto.trim() !== plantilla.texto;

  const guardar = async () => {
    if (requiere && !texto.trim()) return setError("Escribí el texto que el cliente va a leer y firmar.");
    setGuardando(true);
    setError("");
    try {
      const p = await apiSpa.configurarConsentimiento(plantilla.servicioId, {
        requiere,
        ...(requiere ? { texto: texto.trim() } : {}),
      });
      onGuardado({ ...plantilla, ...p, requiere });
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={`Consentimiento de ${plantilla.servicio}`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Casilla checked={requiere} onChange={setRequiere} ayuda="Sin la firma, la agenda avisa antes de atender.">
          Pide consentimiento firmado
        </Casilla>
        {requiere && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-texto-2">Texto que lee y firma el cliente</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              maxLength={8000}
              className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </label>
        )}
        {requiere && cambiaVersion && (
          <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">
            Cambiar el texto crea una versión nueva: quien firmó la anterior va a tener que firmar de nuevo.
          </p>
        )}
        <p className="text-xs text-texto-4">
          Es una plantilla corta: revisala con tu abogado antes de usarla.
        </p>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
