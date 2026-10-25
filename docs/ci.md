# Continuous integration

The `CI / checks` workflow runs the repository's canonical checks for pull
requests targeting `main`. It can also be started manually from the Actions tab
for diagnosis. The workflow uses Node.js from `.node-version`, pnpm 10.6.5 from
the root `package.json`, and a frozen install from `pnpm-lock.yaml`.

The workflow only needs the read-only `contents` permission. It does not use
secrets, production services, containers, or privileged capabilities.

## Require CI before merging

Repository administrators must protect the `main` branch (or create a ruleset
targeting it) with these settings:

- Require a pull request before merging.
- Require status checks to pass before merging and select **`CI / checks`** as
  the required check (GitHub may show the job name as `checks` with the `CI`
  workflow context).
- Apply the rule to administrators as well, unless an explicit bypass is
  intentionally configured.

The workflow itself cannot enforce branch protection. Until an administrator
enables this rule, CI runs on pull requests but merging is not technically
blocked by GitHub.
