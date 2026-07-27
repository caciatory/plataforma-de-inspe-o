// app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { saveEscolhaAction, saveTextoAction, saveDataAction } from "./[itemId]/actions";
import { ItemMedicaoForm } from "./[itemId]/item-medicao-form";
import { BatchApplyPanel, type BatchRow } from "./[itemId]/batch-apply-panel";
import {
  deriveSiblingRows,
  buildBatchRows,
  slugifyOpcaoLabel,
  type SiblingSourceItem,
  type SiblingResponseRow,
} from "@/lib/checklist/siblings";
import type { Photo } from "./[itemId]/photo-manager";

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

export type TableOpcao = { id: string; conjunto_id: string; label: string; exige_foto: boolean };
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
  pageUrl,
}: {
  inspectionId: string;
  items: TableItem[];
  allGroupItems: SiblingSourceItem[];
  responses: TableResponse[];
  opcoes: TableOpcao[];
  photos: TablePhoto[];
  medicaoResultados: TableMedicaoResultado[];
  medicaoValores: TableMedicaoValores[];
  pageUrl: string;
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
                    nextUrl={pageUrl}
                  />
                )}
                {item.tipo === "texto" && (
                  <TextoCell inspectionId={inspectionId} item={item} response={response} nextUrl={pageUrl} />
                )}
                {item.tipo === "data" && (
                  <DataCell inspectionId={inspectionId} item={item} response={response} nextUrl={pageUrl} />
                )}
                {item.tipo === "medicao" && (
                  <MedicaoCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    resultado={response ? (resultadoByResponseId.get(response.id) ?? null) : null}
                    initialValores={response ? (valoresByResponseId.get(response.id) ?? []) : []}
                    initialPhotos={response ? (photosByResponseId.get(response.id) ?? []) : []}
                    nextUrl={pageUrl}
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
  nextUrl: string,
  opcaoId: string,
  observacao: string
): FormData {
  const formData = new FormData();
  formData.set("inspectionId", inspectionId);
  formData.set("itemTemplateId", itemTemplateId);
  formData.set("nextUrl", nextUrl);
  formData.set("opcao_id", opcaoId);
  formData.set("observacao", observacao);
  return formData;
}

function EscolhaCell({
  inspectionId,
  item,
  response,
  opcoes,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  opcoes: TableOpcao[];
  nextUrl: string;
}) {
  const [opcaoId, setOpcaoId] = useState(response?.opcao_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(newOpcaoId: string) {
    setOpcaoId(newOpcaoId);
    setError(null);
    const formData = buildEscolhaFormData(inspectionId, item.id, nextUrl, newOpcaoId, response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveEscolhaAction({ status: "idle" }, formData);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <div className="escolha-options">
      {opcoes.map((o) => (
        <label key={o.id} className={`escolha-option escolha-option--${slugifyOpcaoLabel(o.label)}`}>
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
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

function TextoCell({
  inspectionId,
  item,
  response,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  nextUrl: string;
}) {
  const [value, setValue] = useState(response?.resposta_texto ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (response?.resposta_texto ?? "")) return;
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("nextUrl", nextUrl);
    formData.set("resposta_texto", value);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveTextoAction({ status: "idle" }, formData);
      if (result.status === "error") setError(result.message);
    });
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
    </div>
  );
}

function DataCell({
  inspectionId,
  item,
  response,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  nextUrl: string;
}) {
  const [value, setValue] = useState(response?.resposta_data ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (response?.resposta_data ?? "")) return;
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("nextUrl", nextUrl);
    formData.set("resposta_data", value);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveDataAction({ status: "idle" }, formData);
      if (result.status === "error") setError(result.message);
    });
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
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  resultado: "ok" | "atencao" | "critico" | null;
  initialValores: number[];
  initialPhotos: Photo[];
  nextUrl: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
          nextUrl={nextUrl}
          qtdPontos={item.qtd_pontos_medicao ?? 1}
          unidadeMedicao={item.unidade_medicao}
          initialValores={initialValores}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={initialPhotos}
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
          />
        )}
      </dialog>
    </>
  );
}
