import { RelatorioGate } from "./relatorio-gate";

export default async function RelatorioPublicoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return <RelatorioGate codigo={codigo} />;
}
