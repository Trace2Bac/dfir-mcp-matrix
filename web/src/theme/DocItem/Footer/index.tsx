import React, {type ReactNode} from 'react';
import Footer from '@theme-original/DocItem/Footer';
import type FooterType from '@theme/DocItem/Footer';
import type {WrapperProps} from '@docusaurus/types';
import { useLocation } from '@docusaurus/router';
import CellToolList from '@site/src/components/Matrix/CellToolList';

type Props = WrapperProps<typeof FooterType>;

export default function FooterWrapper(props: Props): ReactNode {
  const location = useLocation();
  
  // Extract cell ID from pathname (e.g. /E01 -> E01)
  // Handles trailing slashes and baseUrl
  const match = location.pathname.match(/\/([A-Z]\d{2})(?:\/|$)/);
  const cellId = match ? match[1] : null;
  const isReportPage = location.pathname.includes('/reports/');

  return (
    <>
      {cellId && !isReportPage && <CellToolList cellId={cellId} />}
      <Footer {...props} />
    </>
  );
}
