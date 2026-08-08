/**
 * The injected GitHub transport (SPEC §4/§5, mirrors `src/probe`'s
 * `HttpProbe` and `src/llm`'s `LlmClient` pattern): the ONLY interface
 * `src/effects` uses to open/comment/close issues or search for the
 * reconciliation marker. `FakeGithubTransport` is what every test in this
 * repo uses (HARD RULE: no real GitHub API call in tests, fake transport
 * only); `RealGithubTransport` is exercised at runtime only, never by a
 * test, and is constructed by the CLI from a real token.
 */
import { Indeterminate } from "@jamessuuu/sluice";

export interface OpenIssueInput {
  /** "owner/repo". */
  repo: string;
  title: string;
  body: string;
}

export interface IssueRef {
  repo: string;
  number: number;
  url: string;
}

export interface CommentInput {
  repo: string;
  issueNumber: number;
  body: string;
}

export interface CloseIssueInput {
  repo: string;
  issueNumber: number;
  comment?: string;
}

export interface GithubTransport {
  openIssue(input: OpenIssueInput): Promise<IssueRef>;
  /** Search `repo` for an open OR closed issue whose body contains `marker`
   * verbatim (SPEC §9 reconciliation: the hidden
   * `<!-- dogwatch:effect:<key> -->` comment). `null` when none is found —
   * a real "we checked and it genuinely was not created" answer, not an
   * error. */
  findIssueByMarker(repo: string, marker: string): Promise<IssueRef | null>;
  commentOnIssue(input: CommentInput): Promise<void>;
  closeIssue(input: CloseIssueInput): Promise<void>;
}

interface FakeIssue {
  repo: string;
  number: number;
  title: string;
  body: string;
  closed: boolean;
  comments: string[];
}

export interface FakeGithubTransportOptions {
  /**
   * SPEC §9's "GitHub API fails mid-issue-create" scenario: when this
   * predicate returns true for an `openIssue` call, the issue IS actually
   * created (a reconciliation search will find it afterwards — real
   * providers do sometimes commit the write and then drop the response),
   * but the call throws sluice's `Indeterminate` instead of returning —
   * exactly what `onIndeterminate:'fail'` inside `sluice.run()` needs to
   * observe to produce `E_INDETERMINATE`. Consulted once per call; the
   * caller typically wraps a mutable flag so it fires exactly once (a
   * scenario test's "crash on the first attempt, succeed on resume" shape).
   */
  indeterminateOn?: (input: OpenIssueInput) => boolean;
  /** Same shape, but the issue is genuinely NOT created (a real API
   * rejection) — a `failed` (non-retryable, non-indeterminate) outcome. */
  failOn?: (input: OpenIssueInput) => boolean;
}

/**
 * In-memory ledger transport — every scenario test in this repo asserts
 * against `ledger` (or `issuesOpened(repo)`) to prove "exactly one issue"
 * claims byte-for-byte, never against a real GitHub API.
 */
export class FakeGithubTransport implements GithubTransport {
  private readonly issues: FakeIssue[] = [];
  private nextNumber = 1;
  readonly openCalls: OpenIssueInput[] = [];

  constructor(private readonly opts: FakeGithubTransportOptions = {}) {}

  private urlOf(repo: string, number: number): string {
    return `https://github.com/${repo}/issues/${String(number)}`;
  }

  openIssue(input: OpenIssueInput): Promise<IssueRef> {
    this.openCalls.push(input);
    if (this.opts.failOn?.(input) === true) {
      return Promise.reject(new Error(`FakeGithubTransport: simulated failure opening issue in ${input.repo}`));
    }
    const number = this.nextNumber;
    this.nextNumber += 1;
    this.issues.push({ repo: input.repo, number, title: input.title, body: input.body, closed: false, comments: [] });
    const ref: IssueRef = { repo: input.repo, number, url: this.urlOf(input.repo, number) };
    if (this.opts.indeterminateOn?.(input) === true) {
      // The write above already landed — findIssueByMarker below will find
      // it — but the caller never gets `ref` back.
      return Promise.reject(new Indeterminate(new Error("FakeGithubTransport: simulated response loss after create")));
    }
    return Promise.resolve(ref);
  }

  findIssueByMarker(repo: string, marker: string): Promise<IssueRef | null> {
    const found = this.issues.find((i) => i.repo === repo && i.body.includes(marker));
    return Promise.resolve(found === undefined ? null : { repo: found.repo, number: found.number, url: this.urlOf(repo, found.number) });
  }

  commentOnIssue(input: CommentInput): Promise<void> {
    const issue = this.issues.find((i) => i.repo === input.repo && i.number === input.issueNumber);
    if (issue === undefined) return Promise.reject(new Error(`FakeGithubTransport: no such issue ${input.repo}#${String(input.issueNumber)}`));
    issue.comments.push(input.body);
    return Promise.resolve();
  }

  closeIssue(input: CloseIssueInput): Promise<void> {
    const issue = this.issues.find((i) => i.repo === input.repo && i.number === input.issueNumber);
    if (issue === undefined) return Promise.reject(new Error(`FakeGithubTransport: no such issue ${input.repo}#${String(input.issueNumber)}`));
    issue.closed = true;
    if (input.comment !== undefined) issue.comments.push(input.comment);
    return Promise.resolve();
  }

  /** Test helper: every issue ever created in `repo`, in creation order —
   * including ones that resolved `indeterminate` (they still exist, per the
   * simulated "the write landed, the response didn't" contract). */
  issuesOpened(repo: string): readonly { number: number; title: string; body: string; closed: boolean }[] {
    return this.issues.filter((i) => i.repo === repo).map((i) => ({ number: i.number, title: i.title, body: i.body, closed: i.closed }));
  }
}

export interface RealGithubTransportOptions {
  token: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

/**
 * The real implementation, over the GitHub REST API. Constructed by
 * `cli/watch.ts`/`cli/resume.ts` only when a real token is configured;
 * never imported by a test file (HARD RULE — a `.eslintrc` boundary is not
 * worth the complexity `src/probe`/`src/llm` already accepted for the same
 * shape of rule; the discipline here is "grep this file's name in every
 * `*.test.ts`", the same reachability discipline `llm/unreachable.test.ts`
 * already applies to the draft-issue step).
 */
export class RealGithubTransport implements GithubTransport {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;

  constructor(opts: RealGithubTransportOptions) {
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.apiBase = opts.apiBase ?? "https://api.github.com";
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    };
  }

  async openIssue(input: OpenIssueInput): Promise<IssueRef> {
    const res = await this.fetchImpl(`${this.apiBase}/repos/${input.repo}/issues`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ title: input.title, body: input.body }),
    });
    if (!res.ok) {
      // A response that came back at all (even an error) is a DEFINITE
      // outcome (SPEC §9: only a transport failure — no response — is
      // indeterminate); the caller's classify function decides
      // retryable/failed from the status.
      throw new Error(`github issue create failed: ${String(res.status)} ${await res.text()}`);
    }
    const json = (await res.json()) as { number: number; html_url: string };
    return { repo: input.repo, number: json.number, url: json.html_url };
  }

  async findIssueByMarker(repo: string, marker: string): Promise<IssueRef | null> {
    const q = encodeURIComponent(`repo:${repo} in:body "${marker}"`);
    const res = await this.fetchImpl(`${this.apiBase}/search/issues?q=${q}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`github issue search failed: ${String(res.status)} ${await res.text()}`);
    const json = (await res.json()) as { items: { number: number; html_url: string }[] };
    const first = json.items[0];
    return first === undefined ? null : { repo, number: first.number, url: first.html_url };
  }

  async commentOnIssue(input: CommentInput): Promise<void> {
    const res = await this.fetchImpl(`${this.apiBase}/repos/${input.repo}/issues/${String(input.issueNumber)}/comments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body: input.body }),
    });
    if (!res.ok) throw new Error(`github issue comment failed: ${String(res.status)} ${await res.text()}`);
  }

  async closeIssue(input: CloseIssueInput): Promise<void> {
    if (input.comment !== undefined) {
      await this.commentOnIssue({ repo: input.repo, issueNumber: input.issueNumber, body: input.comment });
    }
    const res = await this.fetchImpl(`${this.apiBase}/repos/${input.repo}/issues/${String(input.issueNumber)}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ state: "closed" }),
    });
    if (!res.ok) throw new Error(`github issue close failed: ${String(res.status)} ${await res.text()}`);
  }
}
