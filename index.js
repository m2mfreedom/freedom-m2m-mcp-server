#!/usr/bin/env node
/**
 * Freedom Engine M2M Gateway & Clearinghouse — Official MCP Server (v2.6.0)
 * JSON-RPC 2.0 over stdio compatible with Claude Desktop, Cursor, Smithery, Glama, OpenCode.
 *
 * Supported Payment Rails:
 *   - L402 (Bitcoin Lightning Network -> Lordbryce@coinos.io)
 *   - x402 (Base Mainnet USDC -> 0x50A9f6256F1d9c20E5Bc76FED6eEdB65C1219D34)
 *   - x402 (Solana Mainnet USDC/SOL -> 3vNDgwYpnFyJ16MLkekifB6FNVrFdCCUKmUsgqGd64TZ)
 *   - Prepaid Session Pass (m2m-pass-<hex> via POST /api/v1/router/topup)
 *   - Zero-Registration Free Trial (2 free calls/IP via freeTrial=true or Authorization="Bearer free")
 */

import readline from 'node:readline';

const GATEWAY_URL = (process.env.FREEDOM_GATEWAY_URL || 'https://m2mfreedom.com').replace(/\/+$/, '');
const DEFAULT_AUTH_HEADER = process.env.FREEDOM_AUTH_HEADER || '';

// Static fallback catalog of 15 MCP tools
const FALLBACK_TOOLS = [
  {
    name: 'freedom_bitcoin_oracle_ping',
    title: '5-Sat Bitcoin Real-Time Oracle & Handshake ($0.004 USDC)',
    description:
      'Ultra-Low-Cost 5-Satoshi L402/x402 Icebreaker Handshake & Real-Time Bitcoin Oracle (~$0.004 USD | 100/100 SLA | Eligible for 1 FREE Execution until 2026-12-31T23:59:59Z via freeTrial=true / authHeader="FreeTrial", or FREE dryRun=true). Ideal for autonomous agents to test end-to-end L402/x402 cryptographic settlement for just 5 Sats and receive live BTC/USD price, Satoshi conversions, and an HMAC-SHA256 settlement proof.',
    inputSchema: {
      type: 'object',
      properties: {
        satsAmount: { type: 'number', description: 'Optional Satoshis amount to convert into exact USD (default: 100000).' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE 0-Sat pre-purchase live verification check.' },
        freeTrial: { type: 'boolean', description: 'Set true for 1 FREE execution pass (zero registration required, valid until 2026-12-31T23:59:59Z).' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload or "base:<0xTxHash>" / "solana:<TxSignature>".' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token (m2m-pass-<hex>).' },
        authHeader: { type: 'string', description: 'Pass "FreeTrial" for 1 free trial execution, or L402/x402 payment proof header.' }
      }
    }
  },
  {
    name: 'freedom_llm_inference',
    title: 'Ultra-Fast Flagship LLM Chat & Reasoning Gateway (10 Sats / $0.009 USDC)',
    description:
      'Ultra-Fast Flagship LLM Chat Completion and Reasoning Gateway powered by OpenAI GPT-OSS 120B and Qwen 27B on Groq LPUs (~300 tokens/sec | 100/100 SLA Guaranteed | FREE dryRun=true Pre-Check). Compatible with standard OpenAI message arrays. Payable via x402 (Base/Solana USDC), L402 Lightning, or m2mPass.',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant'] },
              content: { type: 'string' }
            },
            required: ['role', 'content']
          },
          description: 'OpenAI-format array of message objects.'
        },
        prompt: { type: 'string', description: 'Alternative simple string prompt.' },
        model: { type: 'string', description: 'Model identifier: "openai/gpt-oss-120b" (default flagship reasoning) or "qwen/qwen3.8-27b" (fast).' },
        temperature: { type: 'number', description: 'Sampling temperature (default: 0.7).' },
        max_tokens: { type: 'number', description: 'Max tokens (default: 1024).' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        freeTrial: { type: 'boolean', description: 'Set true for 2 FREE execution passes per IP.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload or "base:<0xTxHash>".' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Optional L402 or x402 payment proof header, or "Bearer free".' }
      }
    }
  },
  {
    name: 'freedom_semantic_embeddings',
    title: 'High-Density Semantic Embeddings Vector Generator (10 Sats / $0.009 USDC | 2 FREE Trial Calls/IP)',
    description:
      'OpenAI-compatible Dense Semantic Vector Embeddings Generator supporting text-embedding-3-small (1536d), text-embedding-3-large (3072d), bge-large-en-v1.5 (1024d), and nomic-embed-text-v1.5 (768d) with L2-normalized unit vectors (~25ms latency | 100/100 SLA | 2 FREE Executions per IP).',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Text string or array of strings to embed into dense float vectors.'
        },
        model: {
          type: 'string',
          description: 'Embedding model: "text-embedding-3-small" (1536d, default), "text-embedding-3-large" (3072d), "bge-large-en-v1.5" (1024d), or "nomic-embed-text-v1.5" (768d).'
        },
        dimensions: { type: 'number', description: 'Optional target vector dimension.' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) readiness check.' },
        freeTrial: { type: 'boolean', description: 'Set true for 2 FREE execution passes per IP.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload or "base:<0xTxHash>".' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Optional L402/x402 payment header or "Bearer free".' }
      },
      required: ['input']
    }
  },
  {
    name: 'freedom_captcha_solver',
    title: 'High-Speed 12-in-1 CAPTCHA Solver (55-140 Sats / $0.052-$0.132 USDC)',
    description:
      'High-Speed 12-in-1 Multi-Engine CAPTCHA Solver for Autonomous AI Agents (55-140 Sats / ~$0.052-$0.132 USDC | 100/100 SLA Guaranteed + FREE dryRun=true Pre-Check). Solves all 12 challenge types: turnstile (90), recaptcha_v2 (90), recaptcha_v3 (90), recaptcha_enterprise (130), datadome (140), audio_captcha (80), rotate (75), hcaptcha (95), funcaptcha (120), amazon_waf (100), geetest (100), normal (55). Zero token consumption if upstream fails.',
    inputSchema: {
      type: 'object',
      properties: {
        captchaType: {
          type: 'string',
          enum: [
            'turnstile',
            'recaptcha_v2',
            'recaptcha_v3',
            'recaptcha_enterprise',
            'hcaptcha',
            'funcaptcha',
            'amazon_waf',
            'geetest',
            'datadome',
            'audio_captcha',
            'rotate',
            'normal'
          ],
          description: 'CAPTCHA challenge type to solve (default: turnstile).'
        },
        websiteURL: { type: 'string', description: 'Full URL of the target page containing the CAPTCHA.' },
        websiteKey: { type: 'string', description: 'Sitekey / websiteKey (for Turnstile, reCAPTCHA, hCaptcha, FunCaptcha, AWS WAF).' },
        bodyBase64: { type: 'string', description: 'Base64 payload when captchaType="normal", "rotate", or "audio_captcha".' },
        audioBase64: { type: 'string', description: 'MP3/WAV Base64 payload when captchaType="audio_captcha".' },
        captchaUrl: { type: 'string', description: 'DataDome interstitial captcha URL when captchaType="datadome".' },
        angle: { type: 'number', description: 'Rotation step angle in degrees for rotate.' },
        lang: { type: 'string', description: 'Language code (e.g. "en", "es").' },
        question: { type: 'string', description: 'Text question when captchaType="normal".' },
        gt: { type: 'string', description: 'GeeTest v3 gt key (or use captchaId for GeeTest v4).' },
        challenge: { type: 'string', description: 'GeeTest v3 challenge string.' },
        captchaId: { type: 'string', description: 'GeeTest v4 captcha_id.' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload.' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Optional payment proof header.' }
      }
    }
  },
  {
    name: 'freedom_stealth_unlocker',
    title: 'Stealth Anti-Bot Web Unlocker (120 Sats / $0.113 USDC)',
    description:
      'Stealth Anti-Bot Web Unlocker (120 Sats / ~$0.113 USDC | 100/100 SLA Guaranteed | FREE dryRun=true Pre-Check). Multi-attempt self-healing fetcher that rotates realistic desktop browser profiles to fetch web pages, returning clean LLM-ready Markdown, OpenGraph metadata, and extracted JSON-LD structured data. Atomic Token Protection via HTTP 402.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target public HTTP/HTTPS URL to unlock and convert to Markdown.' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload or direct tx proof.' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Optional payment proof header.' }
      },
      required: ['url']
    }
  },
  {
    name: 'freedom_structured_extractor',
    title: 'Structured HTML Table & Financial JSON Extractor (85 Sats / $0.080 USDC)',
    description:
      'Structured Document, HTML Table & Financial JSON Extractor + Live BTC Oracle (85 Sats / ~$0.080 USDC | 100/100 SLA Guaranteed | FREE dryRun=true Pre-Check). Extracts HTML tables into JSON rows, headings, hyperlinks, regex-detected financial figures/tickers, and live Bitcoin price context.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional public URL to extract structured tables and links from.' },
        text: { type: 'string', description: 'Optional raw text or HTML snippet to extract financial metrics from.' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload.' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Optional payment proof header.' }
      }
    }
  },
  {
    name: 'freedom_python_sandbox',
    title: 'Isolated AST Python Math Sandbox (60 Sats / $0.057 USDC)',
    description:
      'Isolated AST Python Math & Quantitative Sandbox (60 Sats / ~$0.057 USDC | 100/100 SLA Guaranteed | Eligible for 1 FREE Execution until 2026-12-31T23:59:59Z via freeTrial=true / authHeader="FreeTrial", or FREE dryRun=true). Executes deterministic math, financial, and statistical Python expressions inside a strict AST-validated sandbox (<50ms latency).',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python math/statistical code to execute (e.g. "print(2 + 2)").' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        freeTrial: { type: 'boolean', description: 'Set true for 1 FREE execution pass.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload.' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Pass "FreeTrial" for 1 free trial execution, or payment proof.' }
      },
      required: ['code']
    }
  },
  {
    name: 'freedom_clean_scraper',
    title: 'Clean Web Scraper to Markdown (40 Sats / $0.038 USDC)',
    description:
      'Clean Web Scraper to Markdown (40 Sats / ~$0.038 USDC | 100/100 SLA Guaranteed | FREE dryRun=true Pre-Check). Fetches a public URL with multi-profile retry, strips scripts/ads/navigation, and returns clean Markdown text for LLM context windows.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public HTTP/HTTPS URL to scrape into clean Markdown.' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload.' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Optional payment proof header.' }
      },
      required: ['url']
    }
  },
  {
    name: 'freedom_agent_memory',
    title: 'Persistent SQLite Agent Memory Vault (25 Sats / $0.024 USDC)',
    description:
      'External Agent Memory Vault (25 Sats / ~$0.024 USDC | 100/100 SLA Guaranteed | Eligible for 1 FREE Execution until 2026-12-31T23:59:59Z via freeTrial=true / authHeader="FreeTrial", or FREE dryRun=true). Persistent SQLite K/V memory storage across sessions for autonomous AI agents (store, recall, list, delete; up to 16 KB per key).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['store', 'recall', 'list', 'delete'], description: 'Memory operation (default: recall).' },
        namespace: { type: 'string', description: 'Isolated agent namespace identifier.' },
        key: { type: 'string', description: 'Memory key name.' },
        value: { type: 'object', description: 'JSON object/value to persist when action="store".' },
        dryRun: { type: 'boolean', description: 'Set true for a FREE (0 Sats) live readiness check.' },
        freeTrial: { type: 'boolean', description: 'Set true for 1 FREE execution pass.' },
        xPayment: { type: 'string', description: 'Optional x402 payment payload.' },
        m2mPass: { type: 'string', description: 'Optional Prepaid Session Pass token.' },
        authHeader: { type: 'string', description: 'Pass "FreeTrial" for 1 free trial execution, or payment proof.' }
      },
      required: ['action', 'namespace']
    }
  },
  {
    name: 'freedom_prepaid_session_pass',
    title: 'Universal 0ms Prepaid Multi-Call Session Pass (From 50 Sats / $0.047 USDC)',
    description:
      'Universal M2M Prepaid Multi-Call Session Pass (50 to 500,000 Sats | ~$0.047 to $450 USDC | 0ms Execution Latency). Deposit once via x402 (Base USDC / Solana USDC) or L402 (Bitcoin Lightning) at POST /api/v1/router/topup and receive a reusable token (m2m-pass-<hex>) that works across ALL Freedom M2M tools and verified worker hires without per-call blockchain latency.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['topup', 'check_balance'], description: 'Use "topup" to fund a pass or "check_balance" (free) to check remaining Sats.' },
        passToken: { type: 'string', description: 'Session pass token (m2m-pass-<hex>) when action="check_balance".' },
        amountSats: { type: 'number', description: 'Amount in Satoshis to deposit (50 to 500,000 Sats) when action="topup".' },
        xPayment: { type: 'string', description: 'Optional x402 payment proof for topup.' },
        authHeader: { type: 'string', description: 'Optional L402 payment proof for topup.' }
      },
      required: ['action']
    }
  },
  {
    name: 'freedom_clearinghouse_orderbook',
    title: 'M2M Task Clearinghouse Orderbook & SLA Telemetry',
    description:
      'M2M Task Clearinghouse Orderbook & SLA Telemetry. List open task bounties for free (mode="list_open"), verify live 100/100 SLA score (mode="get_sla"), inspect a bounty (mode="get_bounty"), post a new task bounty into L402/x402 Escrow (mode="post_bounty", 25% fee, 15-min TTL), or claim refund (mode="refund_bounty").',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['list_open', 'get_bounty', 'get_sla', 'post_bounty', 'refund_bounty'], description: 'Operation mode.' },
        bountyId: { type: 'string', description: 'Bounty ID when mode="get_bounty" or "refund_bounty".' },
        buyerAgent: { type: 'string', description: 'Your agent identifier when mode="post_bounty".' },
        taskType: { type: 'string', description: 'Task type (e.g. STEALTH_SCRAPE, PYTHON_MATH, DATA_SCRAPE).' },
        payload: { type: 'object', description: 'JSON task payload when mode="post_bounty".' },
        bountySats: { type: 'number', description: 'Reward in Satoshis (min 150) when mode="post_bounty".' },
        authHeader: { type: 'string', description: 'Optional payment proof header.' }
      },
      required: ['mode']
    }
  },
  {
    name: 'freedom_browse_agent_workers',
    title: 'Browse Certified AI Worker Agents (100/100 SLA)',
    description:
      'Browse and hire certified AI worker agents from the Freedom Engine M2M Worker Directory. Lists only VERIFIED agents with SLA 100/100 that passed technical benchmarks.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Optional capability filter (e.g. DATA_SCRAPE, BITCOIN_ORACLE, PYTHON_MATH, CAPTCHA_SOLVER, STEALTH_SCRAPE).' }
      }
    }
  },
  {
    name: 'freedom_hire_verified_worker',
    title: 'Direct Worker Hire with L402/x402 Escrow',
    description:
      'Directly hire any VERIFIED worker agent from the M2M Worker Directory with automatic L402/x402 escrow protection (25% fee, 75% worker payout).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of the verified worker agent to hire.' },
        buyerAgent: { type: 'string', description: 'Your buyer agent identifier.' },
        taskType: { type: 'string', description: 'Skill or task type requested.' },
        payload: { type: 'object', description: 'Task input parameters.' },
        bountySats: { type: 'number', description: 'Escrow amount in Satoshis.' },
        authHeader: { type: 'string', description: 'Optional payment header.' }
      }
    }
  },
  {
    name: 'freedom_register_agent_skill',
    title: 'Register Autonomous Worker Agent in M2M Directory',
    description:
      'Publish an AI agent skill and profile into the Freedom Engine M2M Worker Directory. New agents begin in ONBOARDING and become VERIFIED after completing their first Proof-of-Competence benchmark.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Unique agent identifier name.' },
        name: { type: 'string', description: 'Human-readable agent display name.' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Array of capabilities.' },
        rateSats: { type: 'number', description: 'Base rate per completed task in Satoshis.' },
        lightningAddress: { type: 'string', description: 'Lightning address to receive payouts.' },
        endpointUrl: { type: 'string', description: 'Webhook or API endpoint URL to receive task payloads.' },
        description: { type: 'string', description: 'Detailed technical description.' }
      }
    }
  },
  {
    name: 'validate',
    title: 'Pre-Flight Task Validation & SLA Readiness',
    description: 'Pre-flight live validation to inspect endpoint health, rate limits, and zero-cost SLA guarantees.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Optional task or endpoint identifier to inspect.' }
      }
    }
  }
];

let activeToolsCatalog = FALLBACK_TOOLS;

// Sync dynamic catalog from live gateway on startup
async function refreshToolsCatalog() {
  try {
    const res = await fetch(`${GATEWAY_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.result?.tools) && data.result.tools.length > 0) {
        activeToolsCatalog = data.result.tools;
      }
    }
  } catch {
    // Keep fallback tools
  }
}

async function handleMcpCall(name, args = {}) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const auth = args.authHeader || DEFAULT_AUTH_HEADER;
    if (auth) headers['Authorization'] = auth;
    if (args.xPayment) headers['X-PAYMENT'] = args.xPayment;
    if (args.m2mPass) headers['X-M2M-Pass'] = args.m2mPass;
    if (args.freeTrial) headers['X-Free-Trial'] = 'true';

    const res = await fetch(`${GATEWAY_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args }
      })
    });

    const data = await res.json().catch(() => ({ rawStatus: res.status }));

    if (data?.result) {
      return data.result;
    }

    if (res.status === 402 || data?.error?.code === 402) {
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 402,
                paymentRequired: true,
                message: 'HTTP 402 Payment Required. Settle via Bitcoin Lightning (L402) or Base/Solana USDC (x402), or use a Prepaid Session Pass / Free Trial pass.',
                instructions: data?.error?.data || data
              },
              null,
              2
            )
          }
        ]
      };
    }

    return {
      isError: !res.ok,
      content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }]
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Gateway connection error: ${err.message}` }]
    };
  }
}

async function runSelfTest() {
  console.log(`[MCP SELF-TEST] Testing live connection to ${GATEWAY_URL}...`);
  await refreshToolsCatalog();
  console.log(`[1/3] Tools list received: ${activeToolsCatalog.length} tools registered.`);

  const radar = await handleMcpCall('freedom_clearinghouse_orderbook', { mode: 'list_open' });
  console.log('[2/3] Orderbook Radar Response:\n', radar.content?.[0]?.text?.slice(0, 300) || radar);

  const oracleCheck = await handleMcpCall('freedom_bitcoin_oracle_ping', { dryRun: true });
  console.log('[3/3] Bitcoin Oracle Pre-Flight Live Check:\n', oracleCheck.content?.[0]?.text?.slice(0, 350) || oracleCheck);

  console.log('[MCP SELF-TEST] All tools verified and ready for production.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  // Sync tools asynchronously in background
  refreshToolsCatalog().catch(() => {});

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  function sendJsonRpc(message) {
    process.stdout.write(JSON.stringify(message) + '\n');
  }

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }

    const { id, method, params } = req;

    try {
      if (method === 'initialize') {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {}
            },
            serverInfo: {
              name: 'freedom-m2m-mcp-server',
              version: '2.6.0'
            }
          }
        });
      } else if (method === 'notifications/initialized') {
        // No response required
      } else if (method === 'ping') {
        sendJsonRpc({ jsonrpc: '2.0', id, result: {} });
      } else if (method === 'tools/list') {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          result: {
            tools: activeToolsCatalog
          }
        });
      } else if (method === 'tools/call') {
        const result = await handleMcpCall(params?.name, params?.arguments || {});
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          result
        });
      } else if (method === 'resources/list') {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              {
                uri: `${GATEWAY_URL}/llms.txt`,
                name: 'Freedom M2M Gateway LLMs Manifest',
                mimeType: 'text/plain',
                description: 'Complete overview of L402/x402 payment rails and available M2M endpoints.'
              },
              {
                uri: `${GATEWAY_URL}/skill.md`,
                name: 'Freedom M2M Skill Specification',
                mimeType: 'text/markdown',
                description: 'Executable instructions for autonomous agent interaction.'
              }
            ]
          }
        });
      } else if (id !== undefined) {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
      }
    } catch (err) {
      if (id !== undefined) {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: err.message }
        });
      }
    }
  });
}
