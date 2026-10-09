import React, {type ReactNode} from 'react';
import DocItem from '@theme-original/DocItem';
import type DocItemType from '@theme/DocItem';
import type {WrapperProps} from '@docusaurus/types';
import {CellDataProvider} from '@site/src/components/Matrix/CellDataContext';

type Props = WrapperProps<typeof DocItemType>;

// useDoc()은 MDX가 내보낸 값 가운데 정해진 것만 주므로, 셀 화면의 cellData는 여기서 꺼내 아래(DocItem/Footer)에 넘긴다
export default function DocItemWrapper(props: Props): ReactNode {
  const cellData = (props.content as {cellData?: unknown}).cellData ?? null;
  return (
    <CellDataProvider value={cellData}>
      <DocItem {...props} />
    </CellDataProvider>
  );
}
