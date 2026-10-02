import React from 'react';
import Layout from '@theme/Layout';
import MatrixGrid from '@site/src/components/Matrix/MatrixGrid';

export default function Home() {
  return (
    <Layout title="DFIR MCP Architecture Matrix">
      <main>
        <MatrixGrid />
      </main>
    </Layout>
  );
}
