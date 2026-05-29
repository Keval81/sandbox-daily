import { notFound } from "next/navigation";
import { WorkflowDashboard } from "./WorkflowDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workflow - Sandbox Daily Admin",
  description: "Internal content pipeline control room.",
};

export default async function WorkflowPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { scanWorkflowDashboard } = await import("@/lib/workflow/scanner");
  const data = await scanWorkflowDashboard();
  return <WorkflowDashboard data={data} />;
}
