# Submission to the awesome-dsh-plugin registry

The DSH community market (`dshmarket`) installs **only** from the curated
[awesome-dsh-plugin](https://awesome-dsh-plugin.com) registry, so getting this
plugin listed is a one-file pull request to
[`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## The entry

A PR adds exactly one file, named after the repository:
`data/plugins/<owner>__<repo>.yml`.

Create it from `entry.template.yml` in this directory, replacing `<owner>` and
`<repo>` with the real GitHub coordinates of this plugin's repository (and
`<owner>/<repo>` in the `name:` field). The file must also be renamed to
`<owner>__<repo>.yml`.

```yaml
url: https://github.com/<owner>/<repo>
name: <owner>/<repo>
category: ui
description:
  en: Adds a Run button to shell code blocks in replies, executing the snippet
      through the host shell service and streaming output into a panel under
      the block.
  zh: 为回答里的命令行代码框加「运行」按钮，通过宿主 shell 服务执行该命令，并把输出流到代码框下方的面板。
tarball: https://github.com/<owner>/<repo>/releases/latest/download/dsh-run-button.tgz
```

## Requirements this repository already satisfies

| Registry requirement | Status |
| --- | --- |
| `package.json` declares `dsh.bundle` | ✅ `dsh.bundle.patch` → `./cordis.patch.yml` |
| A `cordis.patch.yml` sits at the repo root | ✅ inserts row `id: run-button` |
| Real, working code (not a placeholder) | ✅ verified end-to-end in a live DSH: the button executes a command, streams output, and kills a running process |
| Repository at least 1 day old | ⛔ **new repo — this is the one gate that needs waiting** |
| `dsh-plugin` GitHub topic on the repo | ⛔ add after pushing |
| Description accurate, no marketing | ✅ every claim maps to code (`lib/index.js`, `lib/client.js`) |
| `@deepseek-ai/*` declared as `peerDependencies` | ✅ `@deepseek-ai/cordis` is a peer |
| At most 3 entries per PR | ✅ one |

## Git-based sync (do this first)

```bash
cd <this directory>
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

## Prebuilt tarball (optional, recommended)

Attach a version-free tarball to a GitHub Release so the market can offer a
prebuilt install instead of a source build:

```bash
npm pack                                     # -> dsh-run-button-0.1.0.tgz
cp dsh-run-button-0.1.0.tgz dsh-run-button.tgz
# then upload dsh-run-button.tgz as a Release asset (tag v0.1.0)
```

Keep the asset name **version-free** (`dsh-run-button.tgz`) so the
`releases/latest/download/...` URL cannot rot on the next release.

## Opening the PR

```bash
git clone https://github.com/<owner>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
cp <this directory>/submission/<owner>__<repo>.yml data/plugins/
git checkout -b add-dsh-run-button
git add data/plugins/<owner>__<repo>.yml
git commit -m "Add dsh-run-button"
git push -u origin add-dsh-run-button
```

Then open the PR against `main`. CI checks the manifest, repo age, and
formatting; a maintainer reads the source and merges.
