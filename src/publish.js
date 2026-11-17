// ReportKit publishing: put one exported page on GitHub Pages through the GitHub REST API.
// No dependencies. The caller passes the user's own token; fetch is injectable so the flow
// can be tested against a fake GitHub.
//   const Publish = require('./publish');
//   const r = await Publish.publish({ token, repo: 'my-reports', path: 'index.html', html });
//   r.url   // https://<login>.github.io/my-reports/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportKitPublish = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const API = 'https://api.github.com';

  class PublishError extends Error {
    constructor(message, code, status) { super(message); this.name = 'PublishError'; this.code = code; this.status = status; }
  }

  const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  // A repo name GitHub accepts: letters, digits, dot, dash, underscore.
  const validRepo = n => /^[A-Za-z0-9._-]{1,100}$/.test(n) && !/^\.+$/.test(n) && !/\.git$/i.test(n);
  // A page path inside the repo: lowercase-ish segments ending in .html, no traversal.
  const validPath = p => /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.html?$/.test(p) && !p.split('/').some(s => s === '.' || s === '..' || s.startsWith('.'));

  function toBase64(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // The public address GitHub Pages serves a file at.
  function pageUrl(owner, repo, path) {
    const host = 'https://' + owner.toLowerCase() + '.github.io/';
    const base = repo.toLowerCase() === owner.toLowerCase() + '.github.io' ? host : host + repo + '/';
    const clean = path === 'index.html' ? '' : path.replace(/\/index\.html$/, '/');
    return base + clean;
  }

  function client(token, fetchFn) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!f) throw new PublishError('This environment cannot make web requests.', 'nofetch');
    return async function req(method, path, body) {
      let res;
      try {
        res = await f(API + path, {
          method,
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw new PublishError('Could not reach GitHub. Check the connection and try again.', 'network');
      }
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { status: res.status, ok: res.status >= 200 && res.status < 300, data };
    };
  }

  const fail = (r, what) => {
    const gh = r.data && r.data.message ? ' (' + r.data.message + ')' : '';
    if (r.status === 401) return new PublishError('GitHub did not accept that token. Create a new one and paste it again.', 'auth', 401);
    if (r.status === 403) return new PublishError('GitHub refused ' + what + '. The token may be missing the public_repo permission, or a rate limit was hit' + gh + '.', 'forbidden', 403);
    if (r.status === 422) return new PublishError('GitHub could not ' + what + gh + '.', 'invalid', 422);
    return new PublishError('GitHub could not ' + what + ' (HTTP ' + r.status + ')' + gh + '.', 'http', r.status);
  };

  function check(opts) {
    if (!opts || !opts.token) throw new PublishError('Paste a GitHub token first.', 'token');
    if (!validRepo(opts.repo || '')) throw new PublishError('The repository name can use letters, numbers, dots, dashes and underscores.', 'repo');
    if (!validPath(opts.path || '')) throw new PublishError('The page file name must end in .html and use letters, numbers, dots, dashes and underscores.', 'path');
  }

  async function whoami(token, fetchFn) {
    if (!token) throw new PublishError('Paste a GitHub token first.', 'token');
    const r = await client(token, fetchFn)('GET', '/user');
    if (!r.ok) throw fail(r, 'read the account');
    return r.data.login;
  }

  // Publishes opts.html at opts.path in the user's repo opts.repo, creating the repo and turning
  // on Pages when needed. An existing file is only replaced when opts.replace is true.
  async function publish(opts, fetchFn) {
    check(opts);
    if (typeof opts.html !== 'string' || !opts.html) throw new PublishError('There is nothing to publish.', 'empty');
    const req = client(opts.token, fetchFn);
    const owner = await whoami(opts.token, fetchFn);
    const repoPath = '/repos/' + owner + '/' + opts.repo;

    let created = false, repo = await req('GET', repoPath);
    if (repo.status === 404) {
      const made = await req('POST', '/user/repos', { name: opts.repo, description: opts.description || 'Pages published with ReportKit', private: false, auto_init: true });
      if (!made.ok) throw fail(made, 'create the repository');
      repo = made; created = true;
    } else if (!repo.ok) throw fail(repo, 'read the repository');
    const branch = (repo.data && repo.data.default_branch) || 'main';
    if (repo.data && repo.data.private) throw new PublishError('That repository is private. GitHub Pages on a free account needs a public repository.', 'private');

    const filePath = repoPath + '/contents/' + opts.path.split('/').map(encodeURIComponent).join('/');
    const existing = await req('GET', filePath + '?ref=' + encodeURIComponent(branch));
    const had = existing.ok && existing.data && existing.data.sha;
    if (had && !opts.replace) throw new PublishError('A page already exists at ' + opts.path + ' in ' + opts.repo + '. Tick Replace to overwrite it.', 'exists');
    if (!existing.ok && existing.status !== 404) throw fail(existing, 'check for an existing page');

    const put = await req('PUT', filePath, {
      message: opts.message || (had ? 'Update ' : 'Publish ') + opts.path + ' from ReportKit',
      content: toBase64(opts.html), branch, sha: had ? existing.data.sha : undefined,
    });
    if (!put.ok) throw fail(put, 'save the page');

    let pagesOn = false;
    const pages = await req('GET', repoPath + '/pages');
    if (pages.ok) pagesOn = true;
    else if (pages.status === 404) {
      const on = await req('POST', repoPath + '/pages', { source: { branch, path: '/' } });
      if (!on.ok && on.status !== 409) throw fail(on, 'turn on GitHub Pages');
      pagesOn = true;
    } else throw fail(pages, 'check GitHub Pages');

    return { owner, repo: opts.repo, path: opts.path, branch, url: pageUrl(owner, opts.repo, opts.path), repoUrl: 'https://github.com/' + owner + '/' + opts.repo, createdRepo: created, replaced: !!had, pagesOn };
  }

  // Takes the page back down by deleting its file. The repository stays.
  async function unpublish(opts, fetchFn) {
    check(opts);
    const req = client(opts.token, fetchFn);
    const owner = await whoami(opts.token, fetchFn);
    const repoPath = '/repos/' + owner + '/' + opts.repo;
    const repo = await req('GET', repoPath);
    if (repo.status === 404) throw new PublishError('There is no repository named ' + opts.repo + '.', 'missing', 404);
    if (!repo.ok) throw fail(repo, 'read the repository');
    const branch = repo.data.default_branch || 'main';
    const filePath = repoPath + '/contents/' + opts.path.split('/').map(encodeURIComponent).join('/');
    const existing = await req('GET', filePath + '?ref=' + encodeURIComponent(branch));
    if (existing.status === 404) throw new PublishError('There is no page at ' + opts.path + ' in ' + opts.repo + '.', 'missing', 404);
    if (!existing.ok) throw fail(existing, 'find the page');
    const del = await req('DELETE', filePath, { message: 'Remove ' + opts.path + ' (ReportKit)', sha: existing.data.sha, branch });
    if (!del.ok) throw fail(del, 'delete the page');
    return { owner, repo: opts.repo, path: opts.path };
  }

  // Looks through the visible text of a page for things that should not go on the public web:
  // email addresses, nine-digit numbers (student and employee IDs) and SSN-shaped numbers.
  function scan(html) {
    const text = String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    const count = re => (text.match(re) || []).length;
    const out = [];
    const emails = count(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
    const ssn = count(/\b\d{3}-\d{2}-\d{4}\b/g);
    const ids = count(/(?<![\d.,-])\d{9}(?!\d|[.,-]\d)/g);
    if (emails) out.push({ kind: 'email', count: emails, label: emails + ' email address' + (emails === 1 ? '' : 'es') });
    if (ids) out.push({ kind: 'id', count: ids, label: ids + ' nine-digit number' + (ids === 1 ? '' : 's') + ' (could be student or employee IDs)' });
    if (ssn) out.push({ kind: 'ssn', count: ssn, label: ssn + ' number' + (ssn === 1 ? '' : 's') + ' shaped like a Social Security number' });
    return out;
  }

  return { publish, unpublish, whoami, scan, pageUrl, slugify, validRepo, validPath, toBase64, PublishError };
});
