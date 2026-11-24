import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useIsBrowser from '@docusaurus/useIsBrowser';
import PageDrawer from './PageDrawer';
import { ProblemDetails, problemPath, useProblemQuery } from './ProblemDetails';
import { useProblemsData } from './ProblemMatrix';

// 원고(셀) 화면. 소제목마다 문제를 보이고, 문제나 서버를 누르면 오른쪽 패널에 문제 화면을 연다
export default function ProblemCell({ id }: { id: string }) {
  const data = useProblemsData();
  const isBrowser = useIsBrowser();
  const baseUrl = useBaseUrl('/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const { openProblem, openServer, open } = useProblemQuery();
  if (!data) return <div style={{ padding: '1rem 0' }}>데이터를 불러오는 중입니다...</div>;
  const cell = data.cells.find(c => c.id === id);
  if (!cell) return null;
  const path = openProblem ? problemPath(cell, openProblem) : null;
  return (
    <>
      <ProblemDetails cell={cell} openProblem={openProblem} openServer={openServer} onOpen={(p, s) => open(null, p, s)} />
      {isBrowser && path && (
        <PageDrawer
          title={`${cell.id} ${openProblem}`}
          subtitle={openServer ?? undefined}
          label={`${cell.id} ${openProblem} 문제`}
          page={{ url: `${baseUrl}${path}`, detail: openServer }}
          editUrl={`https://github.com/${organizationName}/${projectName}/edit/main/problems/_data/problems.csv`}
          onClose={() => open(null)}
        />
      )}
    </>
  );
}
