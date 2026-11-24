import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useIsBrowser from '@docusaurus/useIsBrowser';
import PageDrawer from '../Matrix/PageDrawer';
import { ProblemDetails, findProblem, useProblemQuery } from './ProblemDetails';
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
  const prob = findProblem(cell, openProblem);
  const path = prob ? prob.path : null;
  return (
    <>
      <ProblemDetails cell={cell} openProblem={openProblem} openServer={openServer} onOpen={(p, s) => open(null, p, s)} />
      {isBrowser && prob && path && (
        <PageDrawer
          title={`${prob.key.split('/')[0]} ${prob.id}`}
          subtitle={openServer ?? undefined}
          label={`${prob.key} 문제`}
          page={{ url: `${baseUrl}${path}`, detail: openServer }}
          editUrl={`https://github.com/${organizationName}/${projectName}/edit/main/problems/_data/problems.csv`}
          onClose={() => open(null)}
        />
      )}
    </>
  );
}
