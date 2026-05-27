import { Suspense } from "react";
import { AiPlannerFloatingChat } from "@/components/ai-planner-floating-chat";

// Popped-out assistant window. Renders the assistant full-window; reads
// project context from query params and shares the conversation session
// (localStorage, same origin) with the in-app panel.
export const dynamic = "force-dynamic";

export default function AssistantPopoutPage() {
  return (
    <Suspense fallback={null}>
      <AiPlannerFloatingChat embedded />
    </Suspense>
  );
}
