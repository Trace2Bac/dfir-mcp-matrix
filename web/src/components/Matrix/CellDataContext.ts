import { createContext, useContext } from 'react';

// 셀 화면의 MDX가 내보낸 그 셀의 화면 데이터(src/remark/cellData.ts). 셀 화면이 아니면 null이다
const CellDataContext = createContext<any>(null);

export const CellDataProvider = CellDataContext.Provider;
export const useCellData = () => useContext(CellDataContext);
