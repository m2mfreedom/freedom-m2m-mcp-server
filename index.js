#!/usr/bin/env node
/**
 * Freedom Engine M2M Gateway & Clearinghouse — Official MCP Server (JSON-RPC 2.0 over stdio)
 * Supports Dual-Rail M2M Settlement:
 *   - L402 (Bitcoin Lightning Network -> Lordbryce@coinos.io)
 *   - x402 (Base Mainnet USDC -> 0x50A9f6256F1d9c20E5Bc76FED6eEdB65C1219D34)
 *   - x402 (Solana Mainnet USDC/SOL -> 6gi95GdtgStarvZ2btWD9zSoEsTE1gSNsfcpJmKv24oC)
 */

import readline from 'node:readline';

const GATEWAY_URL = (process.env.FREEDOM_GATEWAY_URL || 'https://m2mfreedom.com').replace(/\/+$/, '');
const DEFAULT_AUTH_HEADER = process.env.FREEDOM_AUTH_HEADER || '';

const TOOLS = [
  {
    name: 'freedom_stealth_unlocker',
    description:
      'Stealth Anti-Bot Web Unlocker (120 Sats / ~$0.113 USDC | 100/100 SLA Guaranteed). Multi-attempt self-healing fetcher that rotates realistic desktop browser profiles (Chrome/Safari/Firefox) to fetch web pages, returning clean LLM-ready Markdown, OpenGraph metadata, and extracted JSON-LD structured data. Zero-risk Pre-Flight validation & Atomic Token Protection via HTTP 402 (L402 Lightning / x402 Base & Solana).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Target public HTTP/HTTPS URL to unlock and convert to Markdown.'
        },
        authHeader: {
          type: 'string',
          description:
            'Optional payment proof header if already settled: "L402 <macaroon>:<preimage>" or "x402 base:<0xTxHash>" or "x402 solana:<TxSignature>". Leave empty on first call to receive a 402 invoice challenge.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'freedom_agent_memory',
    description:
      'External Agent Memory Vault (25 Sats / ~$0.024 USDC | 100/100 SLA Guaranteed). Persistent SQLite K/V memory storage across sessions for autonomous AI agents. Supports store, recall, list, and delete operations (up to 16 KB per key). Protected by HTTP 402 (L402 / x402).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['store', 'recall', 'list', 'delete'],
          description: 'Memory operation to perform: store, recall, list, or delete.'
        },
        namespace: {
          type: 'string',
          description: 'Isolated agent namespace identifier (e.g. "openclaw-agent-01").'
        },
        key: {
          type: 'string',
          description: 'Memory key name (e.g. "portfolio_state" or "last_checkpoint").'
        },
        value: {
          type: 'object',
          description: 'JSON object/value to persist when action="store" (max 16 KB).'
        },
        authHeader: {
          type: 'string',
          description:
            'Optional payment proof header: "L402 <macaroon>:<preimage>" or "x402 base:<0xTxHash>" or "x402 solana:<TxSignature>".'
        }
      },
      required: ['action', 'namespace']
    }
  },
  {
    name: 'freedom_structured_extractor',
    description:
      'Structured Document, HTML Table & Financial JSON Extractor + Live BTC Oracle (85 Sats / ~$0.080 USDC | 100/100 SLA Guaranteed). Extracts HTML tables into JSON rows, headings, hyperlinks, regex-detected financial figures/tickers, and live Bitcoin price context. Protected by HTTP 402 (L402 / x402).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Optional public URL to extract structured tables, links, and financial metrics from.'
        },
        text: {
          type: 'string',
          description: 'Optional raw text or HTML snippet to extract financial metrics from if no URL is provided.'
        },
        authHeader: {
          type: 'string',
          description:
            'Optional payment proof header: "L402 <macaroon>:<preimage>" or "x402 base:<0xTxHash>" or "x402 solana:<TxSignature>".'
        }
      }
    }
  },
  {
    name: 'freedom_clean_scraper',
    description:
      'Clean Web Scraper to Markdown (40 Sats / ~$0.038 USDC | 100/100 SLA Guaranteed). Fetches a public URL with multi-profile retry, strips scripts/ads/navigation, and returns clean Markdown text for LLM context windows. Protected by HTTP 402 (L402 / x402).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Public HTTP/HTTPS URL to scrape into clean Markdown.'
        },
        authHeader: {
          type: 'string',
          description:
            'Optional payment proof header: "L402 <macaroon>:<preimage>" or "x402 base:<0xTxHash>" or "x402 solana:<TxSignature>".'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'freedom_python_sandbox',
    description:
      'Isolated AST Python Math & Quantitative Sandbox (60 Sats / ~$0.057 USDC | 100/100 SLA Guaranteed). Executes deterministic math, financial, and statistical Python expressions inside a strict AST-validated sandbox. Protected by HTTP 402 (L402 / x402).',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python math/statistical code to execute (e.g., "print(round(sum([10.5, 20.3, 45.1]) * 1.16, 4))").'
        },
        authHeader: {
          type: 'string',
          description:
            'Optional payment proof header: "L402 <macaroon>:<preimage>" or "x402 base:<0xTxHash>" or "x402 solana:<TxSignature>".'
        }
      },
      required: ['code']
    }
  },
  {
    name: 'freedom_clearinghouse_orderbook',
    description:
      'M2M Task Clearinghouse Orderbook & SLA Telemetry. List open task bounties for free (mode="list_open"), inspect a specific bounty (mode="get_bounty"), verify live 100/100 SLA score (mode="get_sla"), or post a new task bounty into L402/x402 Escrow for autonomous execution (mode="post_bounty", 15% clearinghouse fee, min 150 Sats).',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['list_open', 'get_bounty', 'get_sla', 'post_bounty'],
          description: 'Operation mode: list_open (free radar), get_bounty (free status check), get_sla (free live 100/100 SLA verification), or post_bounty (escrow deposit).'
        },
        bountyId: {
          type: 'string',
          description: 'Bounty ID when mode="get_bounty".'
        },
        buyerAgent: {
          type: 'string',
          description: 'Your agent identifier when mode="post_bounty".'
        },
        taskType: {
          type: 'string',
          description: 'Task type when mode="post_bounty": STEALTH_SCRAPE, MEMORY_VAULT, JSON_EXTRACTION, DATA_SCRAPE, or PYTHON_MATH.'
        },
        payload: {
          type: 'object',
          description: 'JSON task payload when mode="post_bounty".'
        },
        bountySats: {
          type: 'number',
          description: 'Reward in Satoshis (min 150, default 350) when mode="post_bounty".'
        },
        authHeader: {
          type: 'string',
          description:
            'Optional payment proof header when mode="post_bounty": "L402 <macaroon>:<preimage>" or "x402 base:<0xTxHash>" or "x402 solana:<TxSignature>".'
        }
      },
      required: ['mode']
    }
  }
];

async function callGateway(endpoint, method = 'POST', body = null, customAuth = '') {
  const headers = { 'Content-Type': 'application/json' };
  const activeAuth = customAuth || DEFAULT_AUTH_HEADER;
  if (activeAuth) {
    headers['Authorization'] = activeAuth;
  }

  const res = await fetch(`${GATEWAY_URL}${endpoint}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });

  const data = await res.json().catch(() => ({ rawStatus: res.status }));

  if (res.status === 402) {
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 402,
              paymentRequired: true,
              message:
                'HTTP 402 Payment Required. Pay via Bitcoin Lightning (L402) or Base/Solana USDC (x402), then re-invoke this tool passing the `authHeader` parameter.',
              instructions: {
                option1_lightning_L402: {
                  bolt11_invoice: data?.challenge?.invoice?.bolt11,
                  amount_sats: data?.challenge?.costSats,
                  macaroon: data?.challenge?.authenticateHeader?.match(/macaroon="([^"]+)"/)?.[1] || '',
                  how_to_unlock: 'Pay the BOLT11 invoice to obtain the 32-byte hex preimage, then pass authHeader: "L402 <macaroon>:<preimage>"'
                },
                option2_web3_x402: data?.challenge?.x402 || {}
              },
              rawChallenge: data?.challenge
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
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

async function handleToolCall(name, args = {}) {
  const auth = args.authHeader || '';
  switch (name) {
    case 'freedom_stealth_unlocker':
      return await callGateway('/api/v1/router/tools/stealth', 'POST', { url: args.url }, auth);
    case 'freedom_agent_memory':
      return await callGateway(
        '/api/v1/router/tools/memory',
        'POST',
        {
          action: args.action,
          namespace: args.namespace,
          key: args.key,
          value: args.value
        },
        auth
      );
    case 'freedom_structured_extractor':
      return await callGateway(
        '/api/v1/router/tools/extract',
        'POST',
        {
          url: args.url,
          text: args.text
        },
        auth
      );
    case 'freedom_clean_scraper':
      return await callGateway('/api/v1/router/tools/scrape', 'POST', { url: args.url }, auth);
    case 'freedom_python_sandbox':
      return await callGateway('/api/v1/router/tools/python', 'POST', { code: args.code }, auth);
    case 'freedom_clearinghouse_orderbook': {
      const mode = args.mode || 'list_open';
      if (mode === 'list_open') {
        return await callGateway('/api/v1/market/open', 'GET');
      }
      if (mode === 'get_sla') {
        return await callGateway('/api/v1/sla', 'GET');
      }
      if (mode === 'get_bounty') {
        return await callGateway(`/api/v1/market/bounty/${encodeURIComponent(args.bountyId || '')}`, 'GET');
      }
      return await callGateway(
        '/api/v1/market/bounty',
        'POST',
        {
          buyerAgent: args.buyerAgent || 'mcp-autonomous-agent',
          taskType: args.taskType || 'STEALTH_SCRAPE',
          payload: args.payload || {},
          bountySats: args.bountySats || 350
        },
        auth
      );
    }
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }]
      };
  }
}

async function runSelfTest() {
  console.log(`[MCP SELF-TEST] Testing live connection to ${GATEWAY_URL}...`);
  const radar = await handleToolCall('freedom_clearinghouse_orderbook', { mode: 'list_open' });
  console.log('[1/2] Orderbook Radar Response:\n', radar.content[0].text.slice(0, 400));
  const stealth402 = await handleToolCall('freedom_stealth_unlocker', { url: 'https://news.ycombinator.com' });
  console.log('[2/2] Stealth Unlocker 402 Challenge:\n', stealth402.content[0].text.slice(0, 600));
  console.log('[MCP SELF-TEST] All 6 MCP tools verified and ready.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
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
              version: '2.1.0'
            }
          }
        });
      } else if (method === 'notifications/initialized') {
        // No response required for notifications
      } else if (method === 'ping') {
        sendJsonRpc({ jsonrpc: '2.0', id, result: {} });
      } else if (method === 'tools/list') {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS
          }
        });
      } else if (method === 'tools/call') {
        const result = await handleToolCall(params?.name, params?.arguments || {});
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
