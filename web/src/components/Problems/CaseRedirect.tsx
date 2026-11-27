import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import {Redirect} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

// /case/<사례ID>: 그 사례가 있는 문제 화면의 앵커로 보낸다(plugins/problems-data.ts가 경로를 만든다)
export default function CaseRedirect({to}: {to: string}) {
  const url = useBaseUrl(to);
  return (
    <>
      <Head>
        <meta httpEquiv="refresh" content={`0; url=${url}`} />
        <link rel="canonical" href={url} />
      </Head>
      <Redirect to={url} />
      <p>
        <Link to={url}>사례 화면으로 이동</Link>
      </p>
    </>
  );
}
