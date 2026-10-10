// Oracle Octaves is the issues-enabled intake host for Moltnook's shared agent floor.
import fs from 'node:fs/promises';
const tok=process.env.GITHUB_TOKEN;
if(!tok)throw new Error('GITHUB_TOKEN required');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const issue=event.issue;
if(!issue || !/^\[Agent Job\]/i.test(issue.title||'')){
  console.log('Not a Moltnook agent job; no action.');process.exit(0);
}
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='www-infinity4/Oracle-Octaves')throw new Error('Unexpected host repository');
const title=issue.title.slice(0,200);
const rules=[
 [/\b(bug|glitch|broken|crash|error|fail|regress|freeze)\b/i,'Pink Panther','Greenbeans','Reproduce and document the defect before any repair claim.'],
 [/\b(wallet|ledger|starcoin|token|mint|payout|sync)\b/i,'Blueberry','Bluth','Validate source and wallet authority; never mint without a server receipt.'],
 [/\b(import|ingest|migration|dataset)\b/i,'Bluey','Blueberry','Map inputs and verify schema before accepting any import.'],
 [/\b(physics|hydrogen|electron|element|quantum|wave)\b/i,'Orange Julius','Purple People Eater','Why is it so? Separate hypotheses from physical tests.'],
 [/\b(bitcoin|crusher|market|stock|research|scrap)\b/i,'Naked Gold Digger',"Gold Digger's Ink",'Gather attributable research; no trading or automatic publishing.'],
 [/\b(simplify|onboarding|tutorial|help text)\b/i,'Purple Pleasure','Purple Pearl','Design an understandable, small skill or widget proposal.'],
 [/\b(oracle|design|button|layout|card|mobile|accessibility)\b/i,'Purple Pearl','Greenbeans','Use the shared Oracle Octaves card and button standards.'],
 [/\b(story|writer|article|book|content)\b/i,"Gold Digger's Ink",'Purple Pearl','Turn sources into clear, nonrepeating original prose.'],
 [/\b(agent|skill|workflow|worker|api|integrat|build)\b/i,'Greenbeans','Pink Panther','Propose a scoped implementation and an independent verification plan.']
];
const matched=rules.find(r=>r[0].test(title))||[null,'Purple People Eater','Bluth','Identify the missing capability and assign the smallest permitted job.'];
const base='https://api.github.com/repos/'+repo+'/issues/'+issue.number+'/comments';
const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+tok,'User-Agent':'oracle-moltnook-agent-intake','Content-Type':'application/json'};
const response=await fetch(base+'?per_page=100',{headers});
if(!response.ok)throw new Error('Cannot check prior comments: '+response.status);
const comments=await response.json();
const marker='<!-- oracle-agent-triage-v1 -->';
if(comments.some(c=>String(c.body||'').includes(marker))){console.log('Already routed.');process.exit(0);}
const body=[
 marker,
 '### Oracle Octaves · Moltnook Agent Floor',
 '**Automated job routing — source verified, work not started**',
 '',
 '**'+matched[1]+' → '+matched[2]+':** '+matched[3],
 '',
 '**Bluth → Greenbeans:** Identify the real owning repository, check the existing Phi capability contract, and split only independent subtasks.',
 '',
 '**Pink Panther → Team:** Require a reproducer, a test result, and an independent code/deployment receipt before claiming completion.',
 '',
 'This is a genuine issue-based routing record, not a model conversation, a Claude-Flow execution log, or a deployment.',
 'A future connected runner must attach its agent ID, lease, commit and verification receipts here.',
 '',
 '[View the Moltnook Agent Floor](https://www-infinity4.github.io/Moltnook/#agent-floor)'
].join('\n');
const out=await fetch(base,{method:'POST',headers,body:JSON.stringify({body})});
if(!out.ok)throw new Error('Issue routing comment failed: '+out.status);
console.log('Published bounded handoff for issue #'+issue.number);
