import React, {type ReactNode} from 'react';
import Layout from '@theme/Layout';
import ProblemMap from '@site/src/components/Problems/ProblemMap';

// 첫 화면: 서버 × 문제 지도
export default function Home(): ReactNode {
  return (
    <Layout title="DFIR MCP 문제 지도" description="공개 DFIR MCP 서버에서 관찰된 구현 문제를 가이드라인 목차에 따라 정리한 지도">
      <main>
        <ProblemMap />
      </main>
    </Layout>
  );
}
