import React, { useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import PageDrawer from './PageDrawer';
import { CellDetails } from './CellToolList';

// 패널에 연 셀은 ?cell=로, 그 셀의 원고는 &server=&detail=로 주소에 남긴다(매트릭스·서버 비교 화면).
// push로 바꾸면 Docusaurus가 페이지 맨 위로 초점을 옮겨 스크롤이 올라가므로 replace만 쓴다
export function useCellDrawerQuery() {
  const history = useHistory();
  const location = useLocation();
  const query = new URLSearchParams(location.search);

  const open = useCallback(
    (cell: string | null, server: string | null = null, detail: string | null = null) => {
      const params = new URLSearchParams(location.search);
      for (const [k, v] of [['cell', cell], ['server', server], ['detail', detail]] as const) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const search = params.toString();
      history.replace({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash });
    },
    [history, location],
  );
  const close = useCallback(() => open(null), [open]);

  return { openCell: query.get('cell'), openServer: query.get('server'), openDetail: query.get('detail'), open, close };
}

// 수정 키나 가운데 버튼으로 누른 클릭은 패널을 열지 않고 링크를 원래대로 따라간다
export const isPlainClick = (e: React.MouseEvent) => e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

type Props = {
  cell: any; // matrix.json의 셀 하나
  openServer: string | null;
  openDetail: string | null;
  open: (cell: string | null, server?: string | null, detail?: string | null) => void;
  onClose: () => void;
};

// 셀 패널. 셀 화면은 이미 받은 데이터로 바로 그리고, 원고만 iframe으로 띄운다.
// 원고에서 셀로 돌아가면 셀 화면이 보던 자리 그대로 보인다
export default function CellDrawer({ cell, openServer, openDetail, open, onClose }: Props) {
  const baseUrl = useBaseUrl('/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const editBase = `https://github.com/${organizationName}/${projectName}/edit/main`;
  const reportPath = openServer && `reports/${openServer}/${cell.axis}/${cell.id}`;

  return (
    <PageDrawer
      title={openServer ?? `${cell.id} ${cell.name}`}
      subtitle={openServer ? cell.id : undefined}
      label={openServer ? `${openServer} ${cell.id} 원고` : `${cell.id} ${cell.name} 셀`}
      page={reportPath ? { url: `${baseUrl}${reportPath}`, detail: openDetail } : null}
      openUrl={reportPath ? undefined : `${baseUrl}${cell.axis}/${cell.id}`}
      editUrl={reportPath ? `${editBase}/${reportPath}.mdx` : `${editBase}/matrix/cells/${cell.axis}/${cell.id}.mdx`}
      back={openServer ? { label: cell.id, onClick: () => open(cell.id) } : undefined}
      onClose={onClose}
    >
      <CellDetails
        cell={cell}
        openServer={openServer}
        openDetail={openDetail}
        onOpen={(server, detail) => open(cell.id, server, detail)}
      />
    </PageDrawer>
  );
}
