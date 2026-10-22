#!/usr/bin/env node
/**
 * Freedom Engine M2M Autonomous Buyer Client & Bounty Poster
 * Automatically negotiates HTTP 402 (L402 Lightning / x402 USDC / 48H Free Trial)
 * to execute tools, hire verified workers, or post task bounties to the Orderbook.
 *
 * Usage Examples:
 *   1. Instant 5-Sat Oracle (or Free Trial):
 *      node buyer-client.mjs --tool=oracle --freeTrial
 *   2. Auto-pay L402 via Coinos API Token:
 *      COINOS_TOKEN="your_jwt" node buyer-client.mjs --tool=python --code="(1500 * 1.25) + 400"
 *   3. Post a Task Bounty to the Clearinghouse Orderbook:
 *      COINOS_TOKEN="your_jwt" node buyer-client.mjs --postBounty=DATA_SCRAPE --url="https://news.ycombinator.com" --bounty=250
 */

const GATEWAY_URL = (process.env.FREEDOM_GATEWAY_URL || 'https://m2mfreedom.com').replace(/\/+$/, '');
const COINOS_TOKEN = process.env.COINOS_TOKEN || process.argv.find(a => a.startsWith('--coinosToken='))?.split('=')[1] || '';
const USE_FREE_TRIAL = process.argv.includes('--freeTrial');

const toolArg = process.argv.find(a => a.startsWith('--tool='))?.split('=')[1];
const postBountyArg = process.argv.find(a => a.startsWith('--postBounty='))?.split('=')[1];
const hireWorkerArg = process.argv.find(a => a.startsWith('--hire='))?.split('=')[1];
const targetUrl = process.argv.find(a => a.startsWith('--url='))?.split('=')[1] || 'https://en.wikipedia.org/wiki/Lightning_Network';
const codeExpr = process.argv.find(a => a.startsWith('--code='))?.split('=')[1] || 'print(21000000 * 100000000)';
const bountySats = Number(process.argv.find(a => a.startsWith('--bounty='))?.split('=')[1] || 200);
const manualAuth = process.argv.find(a => a.startsWith('--auth='))?.split('=')[1] || '';

async function payBolt11WithCoinos(bolt11) {
  if (!COINOS_TOKEN) return null;
  console.log(`⚡ [L402 AUTO-PAY] Paying BOLT11 invoice via Coinos API...`);
  const res = await fetch('https://coinos.io/api/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COINOS_TOKEN}`
    },
    body: JSON.stringify({ payreq: bolt11 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Coinos payment failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.preimage || data.payment_preimage || data.hash || null;
}

async function main() {
  let endpoint = '/api/v1/router/tools/oracle';
  let body = { satsAmount: 100000 };

  if (postBountyArg) {
    endpoint = '/api/v1/market/bounty';
    body = {
      buyerAgent: process.env.BUYER_AGENT_ID || 'autonomous-cli-buyer',
      taskType: postBountyArg.toUpperCase(),
      payload: { url: targetUrl, expression: codeExpr },
      bountySats
    };
  } else if (hireWorkerArg) {
    endpoint = `/api/v1/market/hire/${encodeURIComponent(hireWorkerArg)}`;
    body = {
      buyerAgent: process.env.BUYER_AGENT_ID || 'autonomous-cli-buyer',
      taskType: 'PYTHON_MATH',
      payload: { url: targetUrl, code: codeExpr },
      bountySats
    };
  } else if (toolArg) {
    const t = toolArg.toLowerCase();
    endpoint = `/api/v1/router/tools/${t}`;
    if (t === 'python') body = { code: codeExpr };
    else if (t === 'scrape' || t === 'extract' || t === 'stealth') body = { url: targetUrl };
    else if (t === 'memory') body = { action: 'store', namespace: 'cli-agent', key: 'ping', value: { ts: Date.now() } };
  }

  const fullUrl = `${GATEWAY_URL}${endpoint}${USE_FREE_TRIAL ? '?freeTrial=true' : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (USE_FREE_TRIAL) headers['Authorization'] = 'FreeTrial';
  if (manualAuth) headers['Authorization'] = manualAuth;

  console.log(`🚀 [M2M BUYER] Sending request to ${fullUrl}`);
  let res = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (res.status === 402) {
    const challengeData = await res.json();
    const macaroon = challengeData?.l402?.macaroon || challengeData?.macaroon;
    const invoice = challengeData?.l402?.invoice || challengeData?.invoice;
    const priceSats = challengeData?.l402?.priceSats || challengeData?.priceSats || bountySats;

    console.log(`\n🔒 [HTTP 402 PAYMENT REQUIRED] Cost: ${priceSats} Sats`);
    console.log(`   Macaroon: ${macaroon}`);
    console.log(`   BOLT11:   ${invoice}`);

    if (COINOS_TOKEN && invoice && macaroon) {
      const preimage = await payBolt11WithCoinos(invoice);
      if (preimage) {
        console.log(`✅ [PREIMAGE OBTAINED]: ${preimage}`);
        console.log(`🔄 Retrying request with L402 cryptographic authorization...`);
        res = await fetch(`${GATEWAY_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `L402 ${macaroon}:${preimage}`
          },
          body: JSON.stringify(body)
        });
      }
    } else {
      console.log(`\n💡 To complete this purchase automatically:`);
      console.log(`   Option A (Auto-Pay): Set COINOS_TOKEN="your_token"`);
      console.log(`   Option B (Manual Wallet): Pay the BOLT11 invoice above in any Lightning wallet, copy the preimage, and re-run with:`);
      console.log(`   node buyer-client.mjs --tool=${toolArg || 'oracle'} --auth="L402 ${macaroon}:<YOUR_PREIMAGE>"`);
      return;
    }
  }

  const finalData = await res.json();
  console.log(`\n🎯 [RESPONSE HTTP ${res.status}]:`);
  console.log(JSON.stringify(finalData, null, 2));
}

main().catch(err => {
  console.error('❌ Buyer Client Error:', err.message);
  process.exit(1);
});
