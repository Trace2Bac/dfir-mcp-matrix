import fs from 'fs';
import path from 'path';
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const matrixDataPath = path.resolve(__dirname, './static/data/matrix.json');
let matrixData: any = { axes: {}, cells: [] };
if (fs.existsSync(matrixDataPath)) {
  matrixData = JSON.parse(fs.readFileSync(matrixDataPath, 'utf8'));
}

const cellsSidebar = Object.keys(matrixData.axes).map(axisId => {
  const axisName = matrixData.axes[axisId];
  const items = matrixData.cells
    .filter((c: any) => c.id.startsWith(axisId))
    .map((c: any) => c.id);
  
  return {
    type: 'category' as const,
    label: `${axisId} ${axisName}`,
    link: {
      type: 'generated-index' as const,
      title: `${axisId} ${axisName}`,
      description: `**${axisName}** 축에 속하는 세부 항목(셀) 목록입니다.`,
      slug: `/${axisId}`
    },
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
