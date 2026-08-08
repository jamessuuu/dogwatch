import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunRecordDetail } from "../../../components/RunRecordDetail";
import { listViolationFixtureNames, loadViolationFixture } from "../../../lib/data";

/**
 * Not linked from navigation — exists so the e2e suite (SPEC §11.6: "the
 * Verify button... turns red on a tampered fixture") can render one of the
 * committed `fixtures/violations/*.json` records through the exact same UI
 * a real run gets. Still zero route handlers: every fixture name is
 * enumerated at build time and prerendered like any other page.
 */
export function generateStaticParams() {
  return listViolationFixtureNames().map((name) => ({ name }));
}

export const dynamicParams = false;

interface FixturePageProps {
  params: Promise<{ name: string }>;
}

export function generateMetadata(): Metadata {
  return { title: "Fixture (test only)", robots: { index: false, follow: false } };
}

export default async function FixturePage({ params }: FixturePageProps) {
  const { name } = await params;
  let loaded: ReturnType<typeof loadViolationFixture>;
  try {
    loaded = loadViolationFixture(name);
  } catch {
    notFound();
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="border border-amber bg-amber/10 px-4 py-3 text-sm text-ink">
        This page renders a planted rubric-violation fixture ({name}) for the e2e suite — it is not
        a real published run.
      </p>
      <RunRecordDetail record={loaded.record} raw={loaded.raw} />
    </div>
  );
}
