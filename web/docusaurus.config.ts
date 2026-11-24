import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import noSingleTilde from './src/remark/noSingleTilde';
import problemsDataPlugin from './plugins/problems-data';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// 원본은 web/ 밖(../problems 등)에 있어 editUrl을 문자열로 주면 경로에 ../가 끼므로 저장소 기준 경로로 직접 만든다
const editUrlIn =
  (dir: string) =>
  ({docPath}: {docPath: string}) =>
    `https://github.com/Trace2Bac/dfir-mcp-matrix/edit/main/${dir}/${docPath}`;

const config: Config = {
  title: 'DFIR MCP Matrix',
  tagline: 'DFIR MCP Matrix',
  favicon: 'img/custom_logo.png',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://trace2bac.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  // 로컬 개발 서버(docusaurus start)는 http://localhost:3000/ 에서 바로 열도록 /를 쓰고, build·serve는 GitHub Pages 경로를 쓴다.
  // 명령 줄에서 환경변수를 붙이는 방식(BASE_URL=/ …)은 Windows cmd에서 돌지 않아 실행한 명령으로 가른다. BASE_URL을 주면 그 값을 쓴다
  baseUrl: process.env.BASE_URL ?? (process.argv.includes('start') ? '/' : '/dfir-mcp-matrix/'),

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Trace2Bac', // Usually your GitHub org/user name.
  projectName: 'dfir-mcp-matrix', // Usually your repo name.

  onBrokenLinks: 'warn',

  // 문제 화면 패널이 페이지를 ?embed=1로 열면, 그리기 전에 data-embed를 붙여 머리·사이드바를 숨긴다(custom.css)
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
          // 문제 매트릭스: 장(1~4) → 원고(1.1~4.4) → 소제목 → 문제 묶음. tools/problems_build.py가 만든다
          path: '../problems',
          routeBasePath: 'problems',
          sidebarPath: './sidebarsProblems.ts',
          // 폴더 이름 1.1, 1.2를 번호 접두사로 읽지 않게 한다
          numberPrefixParser: false,
          editUrl: editUrlIn('problems'),
          remarkPlugins: [noSingleTilde],
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
          to: '/',
          label: 'Map',
          position: 'left',
          activeBaseRegex: '^/(dfir-mcp-matrix/)?$',
        },
        {
          type: 'docSidebar',
          sidebarId: 'problemsSidebar',
          position: 'left',
          label: 'Problems',
        },
        {
          to: '/analyze',
          label: 'Analyze',
          position: 'left',
        },
        {
          href: 'https://github.com/Trace2Bac/dfir-mcp-matrix',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Matrix',
          items: [
            {
              label: 'Map',
              to: '/',
            },
            {
              label: 'Problems',
              to: '/problems/',
            },
            {
              label: 'Analyze',
              to: '/analyze',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Trace2Bac/dfir-mcp-matrix',
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
    // 문제 매트릭스 화면 데이터(static/data/problems.json)를 problems/_data/problems.json에서 둔다
    problemsDataPlugin,
  ],
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ["en", "ko"],
        docsRouteBasePath: ["/problems"],
        // hashed 색인 이름은 이 폴더들의 파일로 계산한다. 원본 폴더를 주어야 내용이 바뀔 때 새 색인을 받는다.
        docsDir: ["../problems"],
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],
};

export default config;
