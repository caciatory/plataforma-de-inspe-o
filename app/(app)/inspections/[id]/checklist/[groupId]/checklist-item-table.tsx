// app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEscolhaAction, saveTextoAction, saveDataAction } from "./[itemId]/actions";
import { ItemMedicaoForm } from "./[itemId]/item-medicao-form";
import { BatchApplyPanel, type BatchRow } from "./[itemId]/batch-apply-panel";
import {
  deriveSiblingRows,
  buildBatchRows,
  resolveEscolhaColorModifier,
  type SiblingSourceItem,
  type SiblingResponseRow,
} from "@/lib/checklist/siblings";
import { PhotoManager, type Photo } from "./[itemId]/photo-manager";

export type TableItem = {
  id: string;
  nome: string;
  tipo: "escolha" | "texto" | "data" | "medicao";
  conjunto_opcao_id: string | null;
  unidade_medicao: string | null;
  qtd_pontos_medicao: number | null;
  grupo_replicacao: string | null;
};

export type TableResponse = {
  id: string;
  item_template_id: string;
  opcao_id: string | null;
  resposta_texto: string | null;
  resposta_data: string | null;
  observacao: string | null;
  respondido: boolean;
};

export type TableOpcao = { id: string; conjunto_id: string; label: string; exige_foto: boolean; ordem: number };
export type TablePhoto = { id: string; url: string; item_response_id: string };
export type TableMedicaoResultado = { item_response_id: string; resultado: "ok" | "atencao" | "critico" | null };
export type TableMedicaoValores = { item_response_id: string; valores: number[] };

export function ChecklistItemTable({
  inspectionId,
  items,
  allGroupItems,
  responses,
  opcoes,
  photos,
  medicaoResultados,
  medicaoValores,
  // ponytail: pageUrl no longer feeds a save action (Task 1 removed those redirects). It survives
  // only as groupListUrl for FamiliaCell -> BatchApplyPanel's post-batch-apply router.push, an
  // unrelated feature this task doesn't touch. Optional + defaulted so tests that don't exercise
  // batch-apply can omit it.
  pageUrl = "",
}: {
  inspectionId: string;
  items: TableItem[];
  allGroupItems: SiblingSourceItem[];
  responses: TableResponse[];
  opcoes: TableOpcao[];
  photos: TablePhoto[];
  medicaoResultados: TableMedicaoResultado[];
  medicaoValores: TableMedicaoValores[];
  pageUrl?: string;
}) {
  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));
  const opcaoLabelById = new Map(opcoes.map((o) => [o.id, o.label]));
  const photosByResponseId = new Map<string, Photo[]>();
  for (const p of photos) {
    const list = photosByResponseId.get(p.item_response_id) ?? [];
    list.push({ id: p.id, url: p.url });
    photosByResponseId.set(p.item_response_id, list);
  }
  const resultadoByResponseId = new Map(medicaoResultados.map((m) => [m.item_response_id, m.resultado]));
  const valoresByResponseId = new Map(medicaoValores.map((m) => [m.item_response_id, m.valores]));

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Resposta</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const response = responseByItemId.get(item.id);
          const showFamiliaIcon = item.grupo_replicacao !== null && response?.respondido === true;

          return (
            <tr
              key={item.id}
              className={`item-table__row item-table__row--${response?.respondido ? "respondido" : "pendente"}`}
            >
              <td>{item.nome}</td>
              <td className={`item-table__cell--${item.tipo}`}>
                {item.tipo === "escolha" && (
                  <EscolhaCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    opcoes={opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id)}
                    photos={response ? (photosByResponseId.get(response.id) ?? []) : []}
                  />
                )}
                {item.tipo === "texto" && (
                  <TextoCell inspectionId={inspectionId} item={item} response={response} />
                )}
                {item.tipo === "data" && (
                  <DataCell inspectionId={inspectionId} item={item} response={response} />
                )}
                {item.tipo === "medicao" && (
                  <MedicaoCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    resultado={response ? (resultadoByResponseId.get(response.id) ?? null) : null}
                    initialValores={response ? (valoresByResponseId.get(response.id) ?? []) : []}
                    initialPhotos={response ? (photosByResponseId.get(response.id) ?? []) : []}
                  />
                )}
              </td>
              <td className="item-table__cell--familia">
                {showFamiliaIcon && response && (
                  <FamiliaCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    allGroupItems={allGroupItems}
                    responses={responses}
                    opcoes={opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id)}
                    opcaoLabelById={opcaoLabelById}
                    photosByResponseId={photosByResponseId}
                    pageUrl={pageUrl}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildEscolhaFormData(
  inspectionId: string,
  itemTemplateId: string,
  opcaoId: string,
  observacao: string
): FormData {
  const formData = new FormData();
  formData.set("inspectionId", inspectionId);
  formData.set("itemTemplateId", itemTemplateId);
  formData.set("opcao_id", opcaoId);
  formData.set("observacao", observacao);
  return formData;
}

function EscolhaCell({
  inspectionId,
  item,
  response,
  opcoes,
  photos,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  opcoes: TableOpcao[];
  photos: Photo[];
}) {
  const [opcaoId, setOpcaoId] = useState(response?.opcao_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(currentOpcaoId: string) {
    setError(null);
    const formData = buildEscolhaFormData(inspectionId, item.id, currentOpcaoId, response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveEscolhaAction({ status: "idle" }, formData);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  function handleChange(newOpcaoId: string) {
    setOpcaoId(newOpcaoId);
    save(newOpcaoId);
  }

  const requiresPhoto = opcoes.find((o) => o.id === opcaoId)?.exige_foto === true;

  return (
    <div className="escolha-options">
      {opcoes.map((o) => (
        <label key={o.id} className={`escolha-option escolha-option--${resolveEscolhaColorModifier(opcoes, o.id)}`}>
          <input
            type="radio"
            name={`opcao-${item.id}`}
            value={o.id}
            checked={opcaoId === o.id}
            disabled={isPending}
            onChange={() => handleChange(o.id)}
          />
          {o.label}
        </label>
      ))}
      {requiresPhoto && (
        <PhotoManager inspectionId={inspectionId} itemTemplateId={item.id} initialPhotos={photos} />
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {error && (
        <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(opcaoId)}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

function TextoCell({
  inspectionId,
  item,
  response,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
}) {
  const [value, setValue] = useState(response?.resposta_texto ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(currentValue: string) {
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("resposta_texto", currentValue);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveTextoAction({ status: "idle" }, formData);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  function handleBlur() {
    if (value === (response?.resposta_texto ?? "")) return;
    save(value);
  }

  return (
    <div className="field">
      <input
        type="text"
        className="input item-table__input"
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {error && (
        <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(value)}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

function DataCell({
  inspectionId,
  item,
  response,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
}) {
  const [value, setValue] = useState(response?.resposta_data ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(currentValue: string) {
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("resposta_data", currentValue);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveDataAction({ status: "idle" }, formData);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  function handleBlur() {
    if (value === (response?.resposta_data ?? "")) return;
    save(value);
  }

  return (
    <div className="field">
      <input
        type="date"
        className="input item-table__input"
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {error && (
        <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(value)}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

function MedicaoCell({
  inspectionId,
  item,
  response,
  resultado,
  initialValores,
  initialPhotos,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  resultado: "ok" | "atencao" | "critico" | null;
  initialValores: number[];
  initialPhotos: Photo[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const label = !response?.respondido
    ? "Medir"
    : resultado === "critico"
      ? "Crítico"
      : resultado === "atencao"
        ? "Atenção"
        : resultado === "ok"
          ? "OK"
          : "Ver";
  const modifierClass = resultado ? ` item-table__badge--${resultado}` : "";

  function handleMedicaoSaved() {
    router.refresh();
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className={`item-table__badge${modifierClass}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => dialogRef.current?.close()}
        >
          Cancelar
        </button>
        <ItemMedicaoForm
          inspectionId={inspectionId}
          itemTemplateId={item.id}
          qtdPontos={item.qtd_pontos_medicao ?? 1}
          unidadeMedicao={item.unidade_medicao}
          initialValores={initialValores}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={initialPhotos}
          onSuccess={handleMedicaoSaved}
        />
      </dialog>
    </>
  );
}

function FamiliaCell({
  inspectionId,
  item,
  response,
  allGroupItems,
  responses,
  opcoes,
  opcaoLabelById,
  photosByResponseId,
  pageUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse;
  allGroupItems: SiblingSourceItem[];
  responses: TableResponse[];
  opcoes: TableOpcao[];
  opcaoLabelById: Map<string, string>;
  photosByResponseId: Map<string, Photo[]>;
  pageUrl: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<BatchRow[] | null>(null);

  function handleOpen() {
    const siblingResponses: SiblingResponseRow[] = responses.map((r) => ({
      item_template_id: r.item_template_id,
      opcao_id: r.opcao_id,
    }));
    const siblings = deriveSiblingRows(item.id, allGroupItems, siblingResponses, opcaoLabelById);
    const initialRows = buildBatchRows(
      {
        itemTemplateId: item.id,
        nome: item.nome,
        opcao_id: response.opcao_id ?? "",
        observacao: response.observacao ?? "",
        photos: photosByResponseId.get(response.id) ?? [],
      },
      siblings,
      new Set(siblings.filter((s) => s.defaultChecked).map((s) => s.id))
    );
    setRows(initialRows);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        className="item-table__familia-btn"
        aria-label={`Aplicar aos itens semelhantes a ${item.nome}`}
        onClick={handleOpen}
      >
        👪
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        {rows && (
          <BatchApplyPanel
            inspectionId={inspectionId}
            groupListUrl={pageUrl}
            opcoes={opcoes}
            initialRows={rows}
            onCancel={() => dialogRef.current?.close()}
            onSuccess={() => dialogRef.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}
