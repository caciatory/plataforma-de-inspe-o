"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { devFillAllItemsAction } from "./dev-fill-action";

export function DevFillButton({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await devFillAllItemsAction(inspectionId);
      if (result.status === "error") {
        setMessage(result.message);
      } else if (result.status === "success") {
        setMessage(`${result.filled} itens preenchidos.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="stack-row">
      <button type="button" className="btn btn-secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? "A preencher..." : "Preencher tudo (dev)"}
      </button>
      {message && <span className="hint">{message}</span>}
    </div>
  );
}
