import React, {type ReactNode} from 'react';
import Footer from '@theme-original/DocItem/Footer';
import type FooterType from '@theme/DocItem/Footer';
import type {WrapperProps} from '@docusaurus/types';
import {useDoc, useCurrentSidebarCategory} from '@docusaurus/plugin-content-docs/client';
import DocCardList from '@theme/DocCardList';
import CellToolList from '@site/src/components/Matrix/CellToolList';
import {useCellData} from '@site/src/components/Matrix/CellDataContext';
import EvidenceRefs from '@site/src/components/Matrix/EvidenceRefs';

type Props = WrapperProps<typeof FooterType>;

// 축 화면(matrix/cells/<축>/index.mdx)에는 그 축의 셀 목록을 붙인다
function AxisCellList(): ReactNode {
  const category = useCurrentSidebarCategory();
  return (
    <div style={{ marginTop: '2rem' }}>
      <DocCardList items={category.items} />
    </div>
  );
}

export default function FooterWrapper(props: Props): ReactNode {
  // 셀 화면에는 MDX가 그 셀의 데이터를 붙이고(src/remark/cellData.ts), 축 파일은 머리말에 axis가 있다(matrix/README.md)
  const frontMatter = useDoc().frontMatter as Record<string, unknown>;
  const cell = useCellData();
  const isAxis = typeof frontMatter.axis === 'string';
  // 서버 원고는 머리말에 cell이 있다(reports/README.mdx)
  const isReport = typeof frontMatter.cell === 'string';

  return (
    <>
      {cell && <CellToolList cell={cell} />}
      {isAxis && <AxisCellList />}
      {isReport && <EvidenceRefs />}
      <Footer {...props} />
    </>
  );
}
