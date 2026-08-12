"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminInspectionRow } from "@/lib/inspection/admin-list";
import { FotosParceiroDialog } from "./fotos-parceiro-dialog";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  rascunho: "status-pill status-pill--neutral",
  aguardando_aprovacao: "status-pill status-pill--warning",
  devolvida: "status-pill status-pill--warning",
  aprovada: "status-pill status-pill--success",
  cancelada: "status-pill status-pill--danger",
};

export function InspectionsTable({ rows }: { rows: AdminInspectionRow[] }) {
  const [query, setQuery] = useState("");
  const [tecnicoFiltro, setTecnicoFiltro] = useState("");
  const [tipoClienteFiltro, setTipoClienteFiltro] = useState("");
  const [dataFiltro, setDataFiltro] = useState("");

  const tecnicos = Array.from(new Set(rows.map((r) => r.tecnicoNome))).sort();

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = q === "" || r.matricula.toLowerCase().includes(q) || r.marcaModelo.toLowerCase().includes(q);
    const matchesTecnico = tecnicoFiltro === "" || r.tecnicoNome === tecnicoFiltro;
    const matchesTipoCliente = tipoClienteFiltro === "" || r.tipoCliente === tipoClienteFiltro;
    const matchesData = dataFiltro === "" || r.dataAbertura.startsWith(dataFiltro);
    return matchesQuery && matchesTecnico && matchesTipoCliente && matchesData;
  });

  const sorted = filtered.slice().sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura));

  return (
    <div className="stack">
      <div className="filter-bar">
        <div className="filter-bar__search">
          <svg
            className="filter-bar__search-icon"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            className="input"
            placeholder="Buscar por matrícula ou modelo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar"
          />
        </div>
        <select className="input" value={tecnicoFiltro} onChange={(e) => setTecnicoFiltro(e.target.value)} aria-label="Filtrar por técnico">
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={tipoClienteFiltro}
          onChange={(e) => setTipoClienteFiltro(e.target.value)}
          aria-label="Filtrar por tipo de cliente"
        >
          <option value="">Todos os tipos</option>
          <option value="particular">Particular</option>
          <option value="stand">Stand</option>
        </select>
        <input
          type="date"
          className="input"
          value={dataFiltro}
          onChange={(e) => setDataFiltro(e.target.value)}
          aria-label="Filtrar por data"
        />
      </div>
      <div className="table-scroll">
        <table className="item-table item-table--scannable">
          <thead>
            <tr>
              <th>Matrícula</th>
              <th>Veículo</th>
              <th>Técnico</th>
              <th>Estado</th>
              <th>Prazo</th>
              <th>Nota</th>
              <th>Data</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{r.matricula}</td>
                <td>{r.marcaModelo}</td>
                <td>{r.tecnicoNome}</td>
                <td>
                  <span className={STATUS_PILL_CLASS[r.status] ?? "status-pill status-pill--neutral"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td>
                  {r.atrasada ? (
                    <span className="status-pill status-pill--danger">Atrasada</span>
                  ) : (
                    <span className="hint">—</span>
                  )}
                </td>
                <td className="tabular-nums">{r.nota !== null ? `${r.nota.toFixed(1)} (${r.classificacao})` : "—"}</td>
                <td>{r.dataAbertura}</td>
                <td>
                  <Link
                    href={`/inspections/${r.id}`}
                    className="btn btn-secondary btn--icon"
                    aria-label={`Ver inspeção ${r.matricula}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    Ver
                  </Link>
                  {r.status === "aprovada" && (
                    <FotosParceiroDialog
                      inspectionId={r.id}
                      initialParceiro={{
                        parceiro_nome: r.parceiroNome,
                        parceiro_logo_url: r.parceiroLogoUrl,
                        parceiro_telefone: r.parceiroTelefone,
                      }}
                      initialFotos={[]}
                    />
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8}>Nenhuma inspeção encontrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
