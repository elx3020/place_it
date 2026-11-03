// Dependency-free CI sanity check: path filters cover every package/app, job references exist.
import { readFileSync, readdirSync } from "node:fs";

const filters = {};
let cur;
for (const l of readFileSync(".github/path-filters.yml", "utf8").split("\n")) {
  let m;
  if ((m = l.match(/^([\w-]+):\s*$/))) filters[(cur = m[1])] = [];
  else if (cur && (m = l.match(/^\s+-\s+['"]?([^'"]+?)['"]?\s*$/))) filters[cur].push(m[1]);
}

const errors = [];
const dirs = ["packages", "apps"].flatMap((p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `${p}/${d.name}`));
for (const d of dirs) {
  const own = Object.values(filters).some((g) => g.includes(`${d}/**`) || g.includes(`${d.split("/")[0]}/**`));
  if (!own) errors.push(`no path filter covers ${d}`);
  if (d.startsWith("packages/") && !filters[d.slice(9)]) errors.push(`no filter entry named ${d.slice(9)}`);
}

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const jobsText = ci.split(/^jobs:\s*$/m)[1];
const jobs = {};
let job;
for (const l of jobsText.split("\n")) {
  let m;
  if ((m = l.match(/^  ([\w-]+):\s*$/))) job = jobs[m[1]] = { needs: [], refs: [] };
  else if (job && (m = l.match(/^    needs:\s*(.*)$/))) job.needs = m[1].replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  else if (job && /^    if:/.test(l)) job.refs.push(...[...l.matchAll(/needs\.([\w-]+)/g)].map((x) => x[1]));
}
for (const [n, j] of Object.entries(jobs)) {
  for (const r of j.needs) if (!jobs[r]) errors.push(`${n}: needs unknown job ${r}`);
  for (const r of j.refs) if (!j.needs.includes(r)) errors.push(`${n}: if references needs.${r} not in needs`);
}
for (const m of ci.matchAll(/needs\.changes\.outputs\.([\w-]+)/g)) if (!filters[m[1]]) errors.push(`ci.yml uses missing filter output ${m[1]}`);
for (const k of Object.keys(filters)) if (!jobs[k]) errors.push(`filter ${k} has no job`);
const ok = jobs["ci-ok"]?.needs ?? [];
for (const n of Object.keys(jobs)) if (n !== "ci-ok" && !ok.includes(n)) errors.push(`ci-ok does not need ${n}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`check-ci ok: ${dirs.length} dirs, ${Object.keys(filters).length} filters, ${Object.keys(jobs).length} jobs`);
