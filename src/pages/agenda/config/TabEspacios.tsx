import { useState } from "react";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { apiSpa } from "../../../lib/agenda/apiSpa";
import type { Recurso } from "../../../lib/agenda/tiposConfigAgenda";
import type { TipoEspacio } from "../../../lib/agenda/tiposSpa";
import { useApi } from "../../../lib/useApi";
import { Casilla } from "./comun";
import { mensajeDe } from "./utilConfig";

/**
 * Tipos de espacio (feature `espacios`, agenda fase 3): Cabina, Camilla,
 * Sillón de pedicura. Un servicio pide un tipo y la agenda le busca un
 * espacio libre de ese tipo, además del profesional (§7.1 punto 5).
 *
 * Los espacios en sí (Cabina 1, Cabina 2) se cargan en "… y espacios", con
 * su tipo; qué servicio pide qué tipo, en Servicios.
 */
export default function TabEspacios({
  recursos,
  irA,
}: {
  recursos: Recurso[];
  irA: (p: "servicios" | "recursos") => void;
}) {
  const tipos = useApi(() => apiSpa.tiposEspacio(), []);
  const [editando, setEditando] = useState<TipoEspacio | "nuevo" | null>(null);
  const [aviso, setAviso] = useAviso();

  const espaciosDe = (id: number) =>
    recursos.filter((r) => r.tipo === "ESPACIO" && r.tipoEspacioId === id);
  const sinTipo = recursos.filter((r) => r.tipo === "ESPACIO" && r.activo && r.tipoEspacioId == null);

  if (tipos.cargando && !tipos.datos) return <Cargando />;
  const lista = tipos.datos ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-texto-3">
          Un servicio que pide un tipo de espacio se agenda sólo cuando hay uno libre de ese tipo.
        </p>
        <Boton icono="plus" onClick={() => setEditando("nuevo")}>
          Nuevo tipo
        </Boton>
      </div>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg onReintentar={tipos.recargar}>{tipos.error}</ErrorMsg>

      {sinTipo.length > 0 && lista.length > 0 && (
        <p role="status" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">
          Sin tipo: {sinTipo.map((r) => r.nombre).join(", ")}. Asignales uno en{" "}
          <button type="button" className="font-semibold underline" onClick={() => irA("recursos")}>
            espacios
          </button>{" "}
          para que los servicios los puedan usar.
        </p>
      )}

      {lista.length === 0 ? (
        <div className="card">
          <Vacio
            icono="grid"
            titulo="Todavía no hay tipos de espacio"
            texto="Cargá los que limitan la agenda: cabina, camilla, sillón de pedicura."
            accion={
              <Boton icono="plus" onClick={() => setEditando("nuevo")}>
                Nuevo tipo
              </Boton>
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft">
          {lista.map((t) => {
            const suyos = espaciosDe(t.id);
            return (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-texto">{t.nombre}</span>
                    {!t.activo && <Badge>Inactivo</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-texto-3">
                    {suyos.length === 0
                      ? "Ningún espacio de este tipo"
                      : suyos.map((r) => r.nombre).join(", ")}
                    {" · "}
                    {t.servicios === 1 ? "1 servicio lo pide" : `${t.servicios} servicios lo piden`}
                  </p>
                </div>
                <Boton
                  variante="ghost"
                  icono="edit"
                  onClick={() => setEditando(t)}
                  aria-label={`Editar ${t.nombre}`}
                  className="shrink-0"
                >
                  Editar
                </Boton>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-texto-4">
        Los espacios se cargan en{" "}
        <button type="button" className="underline" onClick={() => irA("recursos")}>
          profesionales y espacios
        </button>
        ; qué servicio pide cada tipo, en{" "}
        <button type="button" className="underline" onClick={() => irA("servicios")}>
          servicios
        </button>
        .
      </p>

      {editando && (
        <FormTipo
          tipo={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={(t) => {
            setEditando(null);
            setAviso(`"${t.nombre}" quedó guardado.`);
            tipos.recargar();
          }}
        />
      )}
    </div>
  );
}

function FormTipo({
  tipo,
  onClose,
  onGuardado,
}: {
  tipo: TipoEspacio | null;
  onClose: () => void;
  onGuardado: (t: TipoEspacio) => void;
}) {
  const [nombre, setNombre] = useState(tipo?.nombre ?? "");
  const [activo, setActivo] = useState(tipo?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) return setError("Poné el nombre: Cabina, Camilla…");
    setGuardando(true);
    setError("");
    try {
      const t = tipo
        ? await apiSpa.editarTipoEspacio(tipo.id, { nombre: nombre.trim(), activo })
        : await apiSpa.crearTipoEspacio({ nombre: nombre.trim() });
      onGuardado(t);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={tipo ? `Editar ${tipo.nombre}` : "Nuevo tipo de espacio"}
      onClose={onClose}
      cerrarAlClicAfuera={false}
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
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cabina" autoFocus />
        </Campo>
        {tipo && (
          <Casilla checked={activo} onChange={setActivo} ayuda="Inactivo no se ofrece para servicios nuevos.">
            Activo
          </Casilla>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
