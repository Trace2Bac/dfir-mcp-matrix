import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import fs from 'fs';
import path from 'path';
import evidenceLinks from './src/remark/evidenceLinks';
import noSingleTilde from './src/remark/noSingleTilde';
import sentenceLines from './src/remark/sentenceLines';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// 원본은 web/ 밖(../reports 등)에 있어 editUrl을 문자열로 주면 경로에 ../가 끼므로 저장소 기준 경로로 직접 만든다
const editUrlIn =
  (dir: string) =>
  ({docPath}: {docPath: string}) =>
    `https://github.com/Trace2Bac/dfir-mcp-architecture-matrix-v2/edit/main/${dir}/${docPath}`;

// 축 이름과 차례. 원본은 matrix/cells/<축>/index.mdx 머리말이다
const axes: Record<string, {name: string; order: number}> = {};
const cellsDir = path.resolve(__dirname, '../matrix/cells');
for (const ax of fs.readdirSync(cellsDir)) {
  const index = path.join(cellsDir, ax, 'index.mdx');
  if (!fs.existsSync(index)) continue;
  const text = fs.readFileSync(index, 'utf8');
  axes[ax] = {
    name: text.match(/^name: (.*)$/m)?.[1].trim() ?? '',
    order: Number(text.match(/^order: (\d+)$/m)?.[1] ?? 99),
  };
}

// 원고 사이드바: 서버 폴더 아래 축 폴더(E 등)를 "E 원본 증거 관리"로 보이고 축 차례로 늘어놓는다
type SidebarItem = {type: string; label?: string; items?: SidebarItem[]};
const relabelAxes = (items: SidebarItem[]): SidebarItem[] => {
  const out = items.map(it =>
    it.type === 'category'
      ? {...it, items: relabelAxes(it.items ?? []), label: axes[it.label!] ? `${it.label} ${axes[it.label!].name}` : it.label}
      : it,
  );
  const isAxis = (it: SidebarItem) => it.type === 'category' && axes[it.label!.split(' ')[0]] !== undefined;
  const sorted = out.filter(isAxis).sort((a, b) => axes[a.label!.split(' ')[0]].order - axes[b.label!.split(' ')[0]].order);
  return out.map(it => (isAxis(it) ? sorted.shift()! : it));
};

const config: Config = {
  title: 'DFIR MCP Matrix',
  tagline: 'DFIR MCP Architecture Matrix',
  favicon: 'img/custom_logo.png',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://trace2bac.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  // 로컬 개발 서버(npm start)는 BASE_URL=/ 로 띄워 http://localhost:3000/ 에서 바로 연다
  baseUrl: process.env.BASE_URL ?? '/dfir-mcp-architecture-matrix-v2/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Trace2Bac', // Usually your GitHub org/user name.
  projectName: 'dfir-mcp-architecture-matrix-v2', // Usually your repo name.

  onBrokenLinks: 'warn',

  // 셀 페이지 패널이 원고를 ?embed=1로 열면, 그리기 전에 data-embed를 붙여 머리·사이드바를 숨긴다(custom.css)
  headTags: [
    {
      tagName: 'script',
      attributes: {},
      innerHTML: "if(/[?&]embed=1(&|$)/.test(location.search))document.documentElement.setAttribute('data-embed','')",
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../reports',
          routeBasePath: 'reports',
          sidebarPath: './sidebars.ts',
          // 원고의 근거 표지 [n]을 #ev-n 링크로 바꾼다
          remarkPlugins: [noSingleTilde, evidenceLinks, sentenceLines],
          editUrl: editUrlIn('reports'),
          sidebarItemsGenerator: async ({defaultSidebarItemsGenerator, ...args}) =>
            relabelAxes(await defaultSidebarItemsGenerator(args)) as any,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/custom_logo.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Matrix',
      logo: {
        alt: 'Matrix Logo',
        src: 'img/custom_logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'defaultSidebar',
          position: 'left',
          label: 'Reports',
        },
        {
          to: '/docs/',
          label: 'Docs',
          position: 'left',
        },

        {
          href: 'https://github.com/Trace2Bac/dfir-mcp-architecture-matrix-v2',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Reports',
              to: '/reports/',
            },
            {
              label: 'Docs',
              to: '/docs/',
            },

          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Trace2Bac/dfir-mcp-architecture-matrix-v2',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Trace2Bac. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'docs',
        path: '../docs',
        routeBasePath: 'docs',
        sidebarPath: './sidebars.ts',
        editUrl: editUrlIn('docs'),
        remarkPlugins: [noSingleTilde],
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'matrix',
        path: '../matrix/cells',
        routeBasePath: '/',
        sidebarPath: './sidebarsCells.ts',
        editUrl: editUrlIn('matrix/cells'),
        remarkPlugins: [noSingleTilde],
      },
    ],
  ],
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ["en", "ko"],
        docsRouteBasePath: ["/reports", "/docs", "/"],
        // hashed 색인 이름은 이 폴더들의 파일로 계산한다. 원본 폴더를 주어야 내용이 바뀔 때 새 색인을 받는다.
        docsDir: ["../reports", "../docs", "../matrix/cells"],
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],
};

export default config;
