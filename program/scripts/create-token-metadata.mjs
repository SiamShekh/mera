/**
 * Create Metaplex Token Metadata so Phantom shows real names (not "Unknown Token").
 *
 * Usage (from backend/):
 *   node --import tsx ../program/scripts/create-token-metadata.mjs
 * Or:
 *   node ../program/scripts/create-token-metadata.mjs
 *
 * Reads mint addresses + SWAP_AUTHORITY_SECRET from backend/.dev.vars
 * Uses SOLANA_RPC_URL (Helius Devnet).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata'
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '../../backend')
const devVarsPath = path.join(backendRoot, '.dev.vars')

function loadDevVars(filePath) {
  const map = {}
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`)
  }
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i < 0) continue
    map[trimmed.slice(0, i)] = trimmed.slice(i + 1)
  }
  return map
}

function metadataPda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  )
  return pda
}

const META = {
  USDC: {
    name: 'USD Coin',
    symbol: 'USDC',
    uri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.json',
  },
  NVDAx: {
    name: 'NVIDIA xStock',
    symbol: 'NVDAx',
    uri: 'https://arweave.net/placeholder-nvdax.json',
  },
  SOLx: {
    name: 'Mock SOL',
    symbol: 'SOLx',
    uri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.json',
  },
  stX: {
    name: 'Staked X',
    symbol: 'stX',
    uri: 'https://arweave.net/placeholder-stx.json',
  },
}

async function main() {
  const env = loadDevVars(devVarsPath)
  const rpc = env.SOLANA_RPC_URL
  const secret = env.SWAP_AUTHORITY_SECRET
  if (!rpc || !secret) {
    throw new Error('Need SOLANA_RPC_URL and SWAP_AUTHORITY_SECRET in .dev.vars')
  }

  let decode = bs58.decode
  if (typeof decode !== 'function' && bs58.default?.decode) {
    decode = bs58.default.decode.bind(bs58.default)
  }

  const authority = Keypair.fromSecretKey(decode(secret))
  const connection = new Connection(rpc, 'confirmed')

  const tokens = [
    { key: 'USDC', mint: env.MOCK_USDC_MINT },
    { key: 'NVDAx', mint: env.MOCK_NVDAX_MINT },
    { key: 'SOLx', mint: env.MOCK_SOLX_MINT },
    { key: 'stX', mint: env.MOCK_STX_MINT },
  ].filter((row) => row.mint && row.mint.length >= 32)

  console.log('Authority', authority.publicKey.toBase58())
  console.log('RPC host', rpc.replace(/api-key=.*/, 'api-key=***'))

  for (const row of tokens) {
    const mint = new PublicKey(row.mint)
    const meta = META[row.key]
    const pda = metadataPda(mint)
    const existing = await connection.getAccountInfo(pda)
    if (existing) {
      console.log(`skip ${row.key} — metadata already exists (${pda.toBase58()})`)
      continue
    }

    const ix = createCreateMetadataAccountV3Instruction(
      {
        metadata: pda,
        mint,
        mintAuthority: authority.publicKey,
        payer: authority.publicKey,
        updateAuthority: authority.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: meta.name,
            symbol: meta.symbol,
            uri: meta.uri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      },
    )

    const tx = new Transaction().add(ix)
    const sig = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: 'confirmed',
    })
    console.log(`created ${row.key} (${meta.symbol}) → ${sig}`)
  }

  console.log('Done. Re-open Phantom Devnet wallet to refresh token names.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
