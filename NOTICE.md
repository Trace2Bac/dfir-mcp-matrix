# License notice

This repository has two kinds of material under two licenses.

| Material | Paths | License |
|---|---|---|
| Code: tools, screen, schemas, CI | `tools/`, `site/`, `matrix/schema/`, `.github/` | MIT ([LICENSE](LICENSE)) |
| Content: matrix definitions, reports, docs | `matrix/` (except `matrix/schema/`), `reports/`, `docs/`, `*.md` guides | CC BY 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)) |

Attribution for content: "DFIR MCP Architecture Matrix, Trace2Bac contributors", with a link to this repository.

## Third-party code excerpts

Reports under `reports/` quote short excerpts of the analyzed MCP servers' source code at a fixed commit, to support the analysis.
Those excerpts are **not** covered by this repository's licenses. They remain under the license of their own project, and each excerpt links to its source file and commit.

| Server | Base commit | License at that commit |
|---|---|---|
| sift-kernel (Sathvik-1007/sift-kernel) | `ea51bec` | MIT |
| trudi (nebulae/trudi) | `88fbca7` | MIT |
| regipy (mkorman90/regipy) | `1293544` | MIT |
| mcp_dfir (Androsh7/mcp_dfir) | `305fcad` | No license file. Excerpts are quoted for commentary only |
| mulder (calebevans/mulder) | `3164843` | Apache-2.0 |

When you add a server, add a row here with the license found at its base commit.

## Contributions

By submitting a contribution you agree that code is licensed under MIT and content under CC BY 4.0, as above.
