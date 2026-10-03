import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import evidenceLinks from './src/remark/evidenceLinks';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

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
  baseUrl: '/dfir-mcp-architecture-matrix-v2/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Trace2Bac', // Usually your GitHub org/user name.
  projectName: 'dfir-mcp-architecture-matrix-v2', // Usually your repo name.

  onBrokenLinks: 'warn',

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
          remarkPlugins: [evidenceLinks],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/Trace2Bac/dfir-mcp-architecture-matrix-v2/tree/main/',
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
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'matrix',
        path: '../matrix/cells',
        routeBasePath: '/',
        sidebarPath: './sidebarsCells.ts',
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
