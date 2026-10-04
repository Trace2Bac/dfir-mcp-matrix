import React, {type ReactNode} from 'react';
import Footer from '@theme-original/DocItem/Footer';
import type FooterType from '@theme/DocItem/Footer';
import type {WrapperProps} from '@docusaurus/types';
import {useDoc, useCurrentSidebarCategory} from '@docusaurus/plugin-content-docs/client';
import DocCardList from '@theme/DocCardList';
import CellToolList from '@site/src/components/Matrix/CellToolList';

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
  // 셀 파일은 머리말에 question이, 축 파일은 axis가 있다(matrix/README.md)
  const frontMatter = useDoc().frontMatter as Record<string, unknown>;
  const cellId = typeof frontMatter.question === 'string' ? (frontMatter.id as string) : null;
  const isAxis = typeof frontMatter.axis === 'string';

  return (
    <>
      {cellId && <CellToolList cellId={cellId} />}
      {isAxis && <AxisCellList />}
      <Footer {...props} />
    </>
  );
}
