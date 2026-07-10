alter view public.inspections_with_flags set (security_invoker = true);

drop index if exists public.checklist_item_responses_inspection_id_idx;
