---
name: branch-pr
description: Use when asked to create a Git branch, commit changes, push a branch, or open a GitHub PR using Conventional Commits messages and a matching conventional PR title.
---

# Create a branch and pull request

When asked to create a branch and PR, complete the GitHub delivery workflow rather than stopping at a plan. Use Conventional Commits for every new commit and the PR title.

## Workflow

1. Read the repository instructions and identify the requested change, issue, and acceptance criteria. If implementation is part of the request, finish and validate it before publishing.
2. Inspect `git status`, the full intended diff, recent commit-message style, remotes, current branch/upstream, and the target base branch. Check for an existing PR for the current branch.
3. Preserve unrelated or pre-existing user changes. Never stage or commit files outside the requested work. If uncommitted changes cannot be confidently separated from the requested work, stop and ask before committing them.
4. Create a descriptive topic branch from the intended base when one is not already in use. Use lowercase hyphenated names with a type prefix, such as `feat/project-registration` or `fix/api-validation`. Do not overwrite or force-reset an existing branch.
5. Run appropriate tests and checks. Review the complete staged diff and `git diff --cached --check` before committing. Stage only intended files.
6. Create concise Conventional Commits messages in the form `<type>(<scope>): <imperative description>`, for example `feat(projects): register local repositories` or `fix(api): sanitize storage errors`. Use an appropriate type (`feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, or `chore`) and a relevant scope where useful. Do not rewrite existing commits unless explicitly requested.
7. Before opening a PR, inspect `git status`, the commit list, the complete diff from base to `HEAD`, the remote tracking state, and all commits that will be included. Push the topic branch with upstream tracking.
8. Open a PR against the correct base with a Conventional Commit title using the same format. Include a concise summary, tests actually run and their results, relevant issue links/closing keywords, and configuration or manual-validation notes. Do not claim checks passed unless confirmed.
9. Verify the created PR URL, base/head branches, current commit SHA, and working-tree status. Report the branch, commit(s), PR link, and validation results.

## Guardrails

- Commit, push, and create a PR only when the user explicitly requests that delivery action.
- Never commit secrets, credentials, generated artifacts, or unrelated changes. Do not print or include secrets in commit messages or PR descriptions.
- Do not force-push, amend, merge, or close a PR unless explicitly requested.
- Do not create duplicate PRs; check for an existing PR associated with the branch and update/report it instead.
- If the repository, base branch, or requested change is ambiguous, inspect available context first and ask only for information needed to proceed safely.
