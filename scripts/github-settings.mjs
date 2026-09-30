#!/usr/bin/env node
// The repository's GitHub settings (docs/PUBLIER-UNE-VERSION.md), as code: `plan` prints the calls, `apply` makes them through the GitHub
// CLI (gh, authenticated by the maintainer himself), `verify` reads every setting back and fails on any difference.
// Nothing here runs in CI; the maintainer runs it once the workflows are on main, then after any change of this file.
//   node scripts/github-settings.mjs plan|apply|verify [--repo owner/name] [--reviewer-id <numeric id>]
// Kept as they are (already set when the repository was created, and read back by verify): secret scanning with push
// protection, Dependabot alerts and security updates, private vulnerability reporting, read-only workflow token.
// Code scanning uses the CodeQL workflow (.github/workflows/codeql.yml): the "default setup" must stay off.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO = 'sylvainarnauda-shining/littlebird-trainer';
export const OWNER_ID = 267130464; // numeric id of the maintainer's account (his noreply address carries it)
export const REQUIRED_CHECK = 'ci-ok';

// The desired state: [{method, path, body, check}] where check(readBack) lists the differences.
export function desired({ repo = REPO, reviewerId = OWNER_ID } = {}) {
  const r = `repos/${repo}`;
  const same = (want) => (got) =>
    Object.entries(want)
      .filter(([k, v]) => JSON.stringify(got && got[k]) !== JSON.stringify(v))
      .map(([k, v]) => `${k}: ${JSON.stringify(got && got[k])} instead of ${JSON.stringify(v)}`);
  const mainRules = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    { type: 'required_linear_history' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
        allowed_merge_methods: ['squash'],
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: [{ context: REQUIRED_CHECK }],
      },
    },
  ];
  const ruleTypes = (rules) => (got) => {
    const have = (got && got.rules ? got.rules : []).map((x) => x.type).sort();
    const want = rules.map((x) => x.type).sort();
    const out =
      JSON.stringify(have) === JSON.stringify(want) ? [] : [`rules ${have.join(',')} instead of ${want.join(',')}`];
    const checks = (got && got.rules ? got.rules : []).find((x) => x.type === 'required_status_checks');
    if (
      rules.some((x) => x.type === 'required_status_checks') &&
      !(checks && checks.parameters.required_status_checks.some((c) => c.context === REQUIRED_CHECK))
    )
      out.push(`required check ${REQUIRED_CHECK} missing`);
    if (got && got.enforcement !== 'active') out.push('enforcement ' + (got && got.enforcement));
    return out;
  };
  return [
    {
      // The squash commit carries the pull request's title and description, so a "Golden-Update: <reason>" line of the
      // description reaches main (scripts/check-golden-trailer.mjs reads it on the push too).
      what: 'Merges: squash only, commit message = pull request title and description; branches deleted after merge',
      method: 'PATCH',
      path: r,
      body: {
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        squash_merge_commit_title: 'PR_TITLE',
        squash_merge_commit_message: 'PR_BODY',
        delete_branch_on_merge: true,
      },
      read: r,
      check: same({
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        squash_merge_commit_title: 'PR_TITLE',
        squash_merge_commit_message: 'PR_BODY',
        delete_branch_on_merge: true,
      }),
    },
    {
      what: 'Actions: GitHub-owned actions only, pinned to a full commit SHA',
      method: 'PUT',
      path: `${r}/actions/permissions`,
      body: { enabled: true, allowed_actions: 'selected', sha_pinning_required: true },
      read: `${r}/actions/permissions`,
      check: same({ enabled: true, allowed_actions: 'selected', sha_pinning_required: true }),
    },
    {
      what: 'Actions: the selected actions are the GitHub-owned ones',
      method: 'PUT',
      path: `${r}/actions/permissions/selected-actions`,
      body: { github_owned_allowed: true, verified_allowed: false, patterns_allowed: [] },
      read: `${r}/actions/permissions/selected-actions`,
      check: same({ github_owned_allowed: true, verified_allowed: false, patterns_allowed: [] }),
    },
    {
      what: 'Actions: read-only token, Actions cannot approve pull requests',
      method: 'PUT',
      path: `${r}/actions/permissions/workflow`,
      body: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
      read: `${r}/actions/permissions/workflow`,
      check: same({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: false }),
    },
    {
      what: 'Actions: workflows of outside contributors wait for approval',
      method: 'PUT',
      path: `${r}/actions/permissions/fork-pr-contributor-approval`,
      body: { approval_policy: 'all_external_contributors' },
      read: `${r}/actions/permissions/fork-pr-contributor-approval`,
      check: same({ approval_policy: 'all_external_contributors' }),
    },
    {
      what: 'Ruleset protect-main: no deletion or force push, linear history, pull request, required check ci-ok',
      method: 'RULESET',
      name: 'protect-main',
      path: `${r}/rulesets`,
      body: {
        name: 'protect-main',
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        bypass_actors: [],
        rules: mainRules,
      },
      check: ruleTypes(mainRules),
    },
    {
      what: 'Ruleset release-tags: only an administrator creates, moves or deletes a v* tag',
      method: 'RULESET',
      name: 'release-tags',
      path: `${r}/rulesets`,
      body: {
        name: 'release-tags',
        target: 'tag',
        enforcement: 'active',
        conditions: { ref_name: { include: ['refs/tags/v*'], exclude: [] } },
        bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
        rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
      },
      check: ruleTypes([{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }]),
    },
    {
      what: 'Environment release: the maintainer approves, v* tags only',
      method: 'PUT',
      path: `${r}/environments/release`,
      body: {
        reviewers: [{ type: 'User', id: reviewerId }],
        prevent_self_review: false,
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      },
      read: `${r}/environments/release`,
      check: (got) => {
        const rule = got && (got.protection_rules || []).find((p) => p.type === 'required_reviewers');
        return rule && rule.reviewers.some((x) => x.reviewer && x.reviewer.id === reviewerId)
          ? []
          : ['required reviewer missing'];
      },
    },
    {
      what: 'Environment release: deployments from v* tags',
      method: 'POST-IF-ABSENT',
      path: `${r}/environments/release/deployment-branch-policies`,
      body: { name: 'v*', type: 'tag' },
      read: `${r}/environments/release/deployment-branch-policies`,
      check: (got) =>
        ((got && got.branch_policies) || []).some((p) => p.name === 'v*' && p.type === 'tag')
          ? []
          : ['v* tag policy missing'],
    },
    {
      what: 'Releases are immutable once published',
      method: 'PUT',
      path: `${r}/immutable-releases`,
      body: null,
      read: `${r}/immutable-releases`,
      check: same({ enabled: true }),
    },
    {
      what: 'Security features (kept, read back)',
      method: 'READ',
      read: r,
      check: (got) => {
        const s = (got && got.security_and_analysis) || {};
        const out = [];
        for (const k of ['secret_scanning', 'secret_scanning_push_protection', 'dependabot_security_updates'])
          if (!s[k] || s[k].status !== 'enabled') out.push(k + ' not enabled');
        if (got && got.visibility !== 'public') out.push('visibility ' + got.visibility);
        return out;
      },
    },
    {
      what: 'Private vulnerability reporting (kept, read back)',
      method: 'READ',
      read: `${r}/private-vulnerability-reporting`,
      check: same({ enabled: true }),
    },
    {
      what: 'Code scanning default setup stays off (the CodeQL workflow is used)',
      method: 'READ',
      read: `${r}/code-scanning/default-setup`,
      check: (got) =>
        got && got.state === 'configured' ? ['default setup is on: turn it off, the workflow does the analysis'] : [],
    },
  ];
}

function gh(args, input) {
  const res = spawnSync('gh', ['api', ...args], { input, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`gh api ${args.join(' ')}: ${(res.stderr || '').trim().split('\n')[0]}`);
  return res.stdout.trim() ? JSON.parse(res.stdout) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const items = desired({ repo: opt('--repo', REPO), reviewerId: Number(opt('--reviewer-id', OWNER_ID)) });
  if (!['plan', 'apply', 'verify'].includes(mode)) {
    console.error('usage: node scripts/github-settings.mjs plan|apply|verify [--repo owner/name] [--reviewer-id <id>]');
    process.exit(2);
  }
  if (mode === 'plan') {
    for (const i of items) console.log(`${i.method.padEnd(14)} ${i.path || i.read}  ${i.what}`);
    return;
  }
  let failed = 0;
  for (const i of items) {
    try {
      if (mode === 'apply') {
        if (i.method === 'PUT' || i.method === 'PATCH')
          gh(
            ['-X', i.method, i.path, ...(i.body ? ['--input', '-'] : [])],
            i.body ? JSON.stringify(i.body) : undefined,
          );
        else if (i.method === 'RULESET') {
          const found = (gh([i.path]) || []).find((x) => x.name === i.name);
          if (found) gh(['-X', 'PUT', `${i.path}/${found.id}`, '--input', '-'], JSON.stringify(i.body));
          else gh(['-X', 'POST', i.path, '--input', '-'], JSON.stringify(i.body));
        } else if (i.method === 'POST-IF-ABSENT') {
          if (i.check(gh([i.read])).length) gh(['-X', 'POST', i.path, '--input', '-'], JSON.stringify(i.body));
        }
        console.log('ok      ' + i.what);
      } else {
        let got;
        if (i.method === 'RULESET') {
          const found = (gh([i.path]) || []).find((x) => x.name === i.name);
          got = found ? gh([`${i.path}/${found.id}`]) : null;
        } else got = gh([i.read]);
        const diff = i.check(got);
        if (diff.length) {
          failed++;
          console.error(`DIFF    ${i.what}: ${diff.join('; ')}`);
        } else console.log('same    ' + i.what);
      }
    } catch (e) {
      failed++;
      console.error(`FAIL    ${i.what}: ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
