import fs from 'fs';
import path from 'path';
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const matrixDataPath = path.resolve(__dirname, './static/data/matrix.json');
let matrixData: any = { axes: {}, cells: [] };
if (fs.existsSync(matrixDataPath)) {
  matrixData = JSON.parse(fs.readFileSync(matrixDataPath, 'utf8'));
}

// 축 폴더 matrix/cells/<축>/의 index.mdx가 축 화면이고, 그 아래에 셀을 둔다
const cellsSidebar = Object.keys(matrixData.axes).map(axisId => {
  const axisName = matrixData.axes[axisId];
  const items = matrixData.cells
    .filter((c: any) => c.axis === axisId)
    .map((c: any) => `${axisId}/${c.id}`);

  return {
    type: 'category' as const,
    label: `${axisId} ${axisName}`,
    link: { type: 'doc' as const, id: `${axisId}/index` },
    items: items,
  };
});

const sidebars: SidebarsConfig = {
  cellsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Matrix Grid',
    },
    ...cellsSidebar
  ],
};

export default sidebars;
