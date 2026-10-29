import { useMenu } from '../lib/menu';
import React from 'react';
import { Bone, ChartSkeleton, FormSkeleton, GroupSkeleton, Loader, PageHeader, SummarySkeleton, TxListSkeleton } from '../ds';
import { navigateBack } from '../store';
import { useDesktop } from '../lib/useDesktop';

/**
 * Screen-shaped placeholders, built from the DS skeletons. Each one mirrors the layout of its screen
 * (same header, hero and gutters), so the content lands in place instead of popping in.
 */

/** Inicio: the bar, the big number with its chart, and the sheet with the first movements. */
export function HomeSkeleton() {
  return (
    <Loader>
      <div className="home home-skel">
        <div className="home-top">
          <div className="ds-home-header">
            <span className="row gap10"><Bone width={32} height={32} radius="xl" /><Bone width={110} height={16} /></span>
            <span className="row gap8"><Bone width={32} height={32} radius="xl" /><Bone width={32} height={32} radius="xl" /></span>
          </div>
          <div className="home-summary">
            <SummarySkeleton />
            <ChartSkeleton bars={31} height={64} />
            <span className="row gap8 home-skel-ranges">{[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} width={20} height={12} />)}</span>
          </div>
        </div>
        <div className="home-skel-sheet">
          <span className="home-skel-grab"><Bone width={40} height={5} /></span>
          <span className="home-skel-title"><Bone width={96} height={14} /></span>
          <TxListSkeleton days={2} rows={4} />
        </div>
      </div>
    </Loader>
  );
}

/** Desktop frame while the app starts: the sidebar and the summary. */
function DesktopSkeleton() {
  return (
    <Loader>
      <div className="desk">
        <aside className="dside">
          <Bone width={120} height={20} radius="lg" />
          <Bone height={52} radius="2xl" />
          <Bone height={40} radius="xl" />
          <Bone height={40} radius="xl" />
          {[0, 1, 2, 3].map((i) => <Bone key={i} width={`${60 + i * 8}%`} height={14} style={{ margin: '8px 10px' }} />)}
        </aside>
        <main className="dmain">
          <div className="dpage">
            <Bone width={420} height={36} radius="lg" />
            <div className="dhome-top">
              <div className="dhero"><SummarySkeleton /><ChartSkeleton bars={31} height={64} /></div>
              <GroupSkeleton rows={4} leading="icon" />
            </div>
            <GroupSkeleton rows={6} />
          </div>
        </main>
      </div>
    </Loader>
  );
}

/** While the session and the spaces load. */
export function AppSkeleton() {
  return useDesktop() ? <DesktopSkeleton /> : <HomeSkeleton />;
}

/**
 * A screen with the PageHeader already in place (the title is known before the data), the hero
 * figure and whatever groups the screen will show.
 */
export function PageSkeleton({ title, back = false, hero = true, heroAction = false, nav = true, children }: {
  title?: React.ReactNode; back?: boolean; hero?: boolean; heroAction?: boolean; nav?: boolean; children?: React.ReactNode;
}) {
  const menu = useMenu();
  return (
    <div className={nav ? 'page' : 'page no-nav'}>
      <PageHeader title={title ?? <Bone width={160} height={back ? 24 : 28} radius="lg" />} onBack={back ? navigateBack : undefined} onMenu={back ? undefined : menu?.open} />
      <Loader>
        {hero && <div className="page-hero"><SummarySkeleton action={heroAction} /></div>}
        <div className="page-body">{children ?? <GroupSkeleton rows={4} />}</div>
      </Loader>
    </div>
  );
}

/** A form screen (editors): header, then cards of fields. */
export function FormPageSkeleton({ title }: { title: React.ReactNode }) {
  return (
    <div className="page no-nav">
      <PageHeader title={title} onBack={navigateBack} />
      <Loader>
        <div className="page-body">
          <FormSkeleton fields={4} />
          <FormSkeleton fields={2} />
        </div>
      </Loader>
    </div>
  );
}

/** The movement detail before it arrives: the face, the name and amount, and the facts. */
export function DetailSkeleton() {
  return (
    <Loader>
      <div className="txd-hero">
        <Bone width={56} height={56} radius="2xl" />
        <Bone width={120} height={14} style={{ marginTop: 14 }} />
        <Bone width={200} height={40} radius="lg" style={{ marginTop: 6 }} />
      </div>
      <GroupSkeleton rows={5} title={false} leading="none" />
      <GroupSkeleton rows={3} />
    </Loader>
  );
}
