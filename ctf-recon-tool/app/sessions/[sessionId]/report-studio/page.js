import { connection } from 'next/server';
import ReportStudioClient from '@/domains/reporting/components/studio/ReportStudioClient';

export default async function ReportStudioPage({ params, searchParams }) {
  await connection();
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <ReportStudioClient
      sessionId={String(sessionId || 'default')}
      initialReportFormat={String(resolvedSearchParams?.format || 'technical-walkthrough')}
    />
  );
}
