import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getWriteupShareByToken } from '@/lib/db';
import { markdownToHtmlContent } from '@/lib/export-utils';

export const dynamic = 'force-dynamic';

function renderShareBlock(block) {
  if (!block || typeof block !== 'object') return null;
  if (block.blockType === 'code') {
    return (
      <section key={block.id} style={{ display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>{block.title || 'Code Snippet'}</h2>
        <pre style={{ margin: 0, padding: '1rem', borderRadius: '10px', background: '#111827', color: '#e5e7eb', overflowX: 'auto' }}>
          <code>{block.content || ''}</code>
        </pre>
      </section>
    );
  }

  if (block.blockType === 'image') {
    return (
      <section key={block.id} style={{ display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>{block.title || 'Evidence'}</h2>
        {block.imageUrl ? (
          <Image
            src={block.imageUrl}
            alt={block.alt || block.title || 'Evidence'}
            width={1200}
            height={720}
            unoptimized
            style={{ width: '100%', height: 'auto', borderRadius: '12px', border: '1px solid #d1d5db' }}
          />
        ) : null}
        {block.caption ? <p style={{ margin: 0, color: '#6b7280' }}><em>{block.caption}</em></p> : null}
        {block.content ? (
          <div dangerouslySetInnerHTML={{ __html: markdownToHtmlContent(block.content) }} />
        ) : null}
      </section>
    );
  }

  return (
    <section key={block.id} style={{ display: 'grid', gap: '0.75rem' }}>
      <h2 style={{ margin: 0 }}>{block.title || 'Section'}</h2>
      <div dangerouslySetInnerHTML={{ __html: markdownToHtmlContent(block.content || '') }} />
    </section>
  );
}

export default async function SharedWriteupPage({ params }) {
  const { token } = await params;
  const share = getWriteupShareByToken(token);
  if (!share) notFound();

  const blocks = Array.isArray(share.reportContentJson) ? share.reportContentJson : null;

  return (
    <main style={{ minHeight: '100vh', background: '#f3f4f6', color: '#111827', padding: '2rem 1.25rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
        <header style={{ background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '16px', padding: '1.5rem', display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>Helm&apos;s Watch Shared Report</p>
          <h1 style={{ margin: 0 }}>{share.title || share.meta?.sessionName || 'Shared Report'}</h1>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: '#4b5563', fontSize: '0.95rem' }}>
            <span>Format: {share.format}</span>
            {share.analystName ? <span>Analyst: {share.analystName}</span> : null}
            {share.createdAt ? <span>Shared: {new Date(share.createdAt).toLocaleString()}</span> : null}
          </div>
          {share.meta?.target ? <p style={{ margin: 0 }}>Target: <strong>{share.meta.target}</strong></p> : null}
          {share.meta?.objective ? <p style={{ margin: 0 }}>{share.meta.objective}</p> : null}
        </header>

        <article style={{ background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '16px', padding: '1.5rem', display: 'grid', gap: '1.75rem' }}>
          {blocks && blocks.length > 0
            ? blocks.map((block) => renderShareBlock(block))
            : <div dangerouslySetInnerHTML={{ __html: markdownToHtmlContent(share.reportMarkdown || '') }} />}
        </article>
      </div>
    </main>
  );
}
