import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunRecordDetail } from "../../../components/RunRecordDetail";
import { loadAllRunIds, loadRunRecord } from "../../../lib/data";

export function generateStaticParams() {
  return loadAllRunIds().map((id) => ({ id }));
}

// SPEC §10: every page is prerendered from committed JSON — no run outside
// the committed set is ever legal, so an unknown id is a real 404, not a
// fallback render.
export const dynamicParams = false;

interface RunPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: RunPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function RunRecordPage({ params }: RunPageProps) {
  const { id } = await params;
  let loaded: ReturnType<typeof loadRunRecord>;
  try {
    loaded = loadRunRecord(id);
  } catch {
    notFound();
  }
  return <RunRecordDetail record={loaded.record} raw={loaded.raw} relativePath={loaded.entry.path} />;
}
