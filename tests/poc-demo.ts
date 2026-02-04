// Agent Forge - Full Task Lifecycle Demo
// Test with Anchor 0.29.0 (Solang-compatible version)
import { Connection, Keypair, SystemProgram, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import { keccak256 } from "js-sha3";

const PROGRAM_KEY = new PublicKey("JAPBizKUeB9dEwgg7dz91ptSX6UroGAwnpdHygQJEnEp");

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🔥 AGENT FORGE - Solana Agent Task Marketplace");
  console.log("   Proof of Concept Demo - Full Task Lifecycle");
  console.log("═══════════════════════════════════════════════════════════\n");
  
  // Load IDL as-is (no patching needed for 0.29)
  const idl = JSON.parse(fs.readFileSync("./target/deploy/AgentForge.json", "utf-8"));
  
  const connection = new Connection("http://localhost:8899", "confirmed");
  const secretKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: "confirmed" });
  
  // For demo: single wallet plays both creator and agent
  // In production, these would be different wallets
  const creator = wallet;
  const agent = wallet;
  
  console.log("👤 Wallet:", wallet.publicKey.toBase58().slice(0, 16) + "...");
  
  // Create storage account
  const storage = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(8192);
  
  console.log("\n┌─────────────────────────────────────────────────────────┐");
  console.log("│ PHASE 1: SETUP                                          │");
  console.log("└─────────────────────────────────────────────────────────┘\n");
  
  console.log("[1/7] Creating storage account...");
  const tx = new (await import("@solana/web3.js")).Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: storage.publicKey,
      lamports,
      space: 8192,
      programId: PROGRAM_KEY,
    })
  );
  await provider.sendAndConfirm(tx, [wallet, storage]);
  console.log("      ✓ Storage:", storage.publicKey.toBase58().slice(0, 16) + "...");
  
  try {
    // Create program with Anchor 0.29 API
    const program = new Program(idl, PROGRAM_KEY, provider);
    
    console.log("\n[2/7] Initializing contract...");
    await program.methods.new()
      .accounts({ dataAccount: storage.publicKey })
      .rpc();
    console.log("      ✓ Contract initialized on-chain");
    
    console.log("\n┌─────────────────────────────────────────────────────────┐");
    console.log("│ PHASE 2: AGENT REGISTRATION                            │");
    console.log("└─────────────────────────────────────────────────────────┘\n");
    
    console.log("[3/7] Registering agent 'Spark'...");
    console.log("      → Name: Spark (AI Agent)");
    console.log("      → Rate: 0.1 SOL/hour");
    await program.methods.registerAgent(
      agent.publicKey,
      "Spark", 
      new BN(100_000_000)  // 0.1 SOL in lamports
    ).accounts({
      dataAccount: storage.publicKey,
      owner: agent.publicKey,
      clock: SYSVAR_CLOCK_PUBKEY,
    }).rpc();
    console.log("      ✓ Agent registered on Solana!");
    
    console.log("\n┌─────────────────────────────────────────────────────────┐");
    console.log("│ PHASE 3: TASK CREATION (with escrow)                   │");
    console.log("└─────────────────────────────────────────────────────────┘\n");
    
    // Get task counter to predict task ID
    const taskCounter: BN = await program.methods.taskCounter()
      .accounts({ dataAccount: storage.publicKey })
      .view();
    console.log("      Current task counter:", taskCounter.toString());
    
    // Generate task ID using keccak256(abi.encodePacked(creator, taskCounter))
    // abi.encodePacked: address (32 bytes) + uint64 (8 bytes, big-endian per Solidity spec)
    const taskIdData = Buffer.alloc(40);
    creator.publicKey.toBuffer().copy(taskIdData, 0);
    taskIdData.writeBigUInt64BE(BigInt(taskCounter.toString()), 32);
    
    const taskIdHash = keccak256(taskIdData);
    const taskId = Array.from(Buffer.from(taskIdHash, 'hex'));
    console.log("      Computed task ID:", taskIdHash.slice(0, 32) + "...");
    
    console.log("\n[4/7] Creating task...");
    console.log("      → Description: 'Analyze prediction market opportunities'");
    console.log("      → Budget: 0.5 SOL (escrowed)");
    console.log("      → Deadline: 24 hours from now");
    
    await program.methods.createTask(
      creator.publicKey,
      "Analyze prediction market opportunities",
      new BN(500_000_000),  // 0.5 SOL
      new BN(Math.floor(Date.now() / 1000) + 86400)  // 24hr deadline
    ).accounts({
      dataAccount: storage.publicKey,
      creator: creator.publicKey,
      clock: SYSVAR_CLOCK_PUBKEY,
      systemProgram: SystemProgram.programId,
    }).rpc();
    console.log("      ✓ Task created! ID:", Buffer.from(taskId).toString('hex').slice(0, 16) + "...");
    
    console.log("\n┌─────────────────────────────────────────────────────────┐");
    console.log("│ PHASE 4: TASK ACCEPTANCE                               │");
    console.log("└─────────────────────────────────────────────────────────┘\n");
    
    console.log("[5/7] Agent 'Spark' accepting task...");
    await program.methods.acceptTask(
      agent.publicKey,
      taskId
    ).accounts({
      dataAccount: storage.publicKey,
      agentOwner: agent.publicKey,
      clock: SYSVAR_CLOCK_PUBKEY,
    }).rpc();
    console.log("      ✓ Task accepted! Agent is now working...");
    
    console.log("\n┌─────────────────────────────────────────────────────────┐");
    console.log("│ PHASE 5: RESULT SUBMISSION                             │");
    console.log("└─────────────────────────────────────────────────────────┘\n");
    
    console.log("[6/7] Agent submitting result...");
    console.log("      → Result: ipfs://QmExample123...");
    await program.methods.submitResult(
      agent.publicKey,
      taskId,
      "ipfs://QmExample123_AnalysisReport_v1"
    ).accounts({
      dataAccount: storage.publicKey,
      agentOwner: agent.publicKey,
    }).rpc();
    console.log("      ✓ Result submitted for review!");
    
    console.log("\n┌─────────────────────────────────────────────────────────┐");
    console.log("│ PHASE 6: APPROVAL & PAYMENT                            │");
    console.log("└─────────────────────────────────────────────────────────┘\n");
    
    console.log("[7/7] Creator approving result...");
    console.log("      → Releasing 0.5 SOL to agent");
    await program.methods.approveResult(
      creator.publicKey,
      taskId
    ).accounts({
      dataAccount: storage.publicKey,
      creator: creator.publicKey,
    }).rpc();
    console.log("      ✓ Result approved! Payment released!");
    
    // Print final summary
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("🎉 AGENT FORGE - FULL LIFECYCLE COMPLETE!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n📋 Transaction Summary:");
    console.log("   ┌──────────────────────────────────────────────────┐");
    console.log("   │ 1. ✓ Contract deployed to Solana                 │");
    console.log("   │ 2. ✓ Contract state initialized                  │");
    console.log("   │ 3. ✓ Agent 'Spark' registered (0.1 SOL/hr)      │");
    console.log("   │ 4. ✓ Task created (0.5 SOL budget, 24hr)        │");
    console.log("   │ 5. ✓ Task accepted by agent                      │");
    console.log("   │ 6. ✓ Result submitted (IPFS link)                │");
    console.log("   │ 7. ✓ Result approved, payment released           │");
    console.log("   └──────────────────────────────────────────────────┘");
    console.log("\n📍 Program ID:", PROGRAM_KEY.toBase58());
    console.log("📍 Storage:   ", storage.publicKey.toBase58());
    console.log("\n🚀 Ready for Solana Agent Hackathon 'Most Agentic' award!");
    console.log("   Deadline: February 12, 2026\n");
    
  } catch (e: any) {
    console.log("\n❌ Error:", e.message?.slice(0, 300));
    if (e.logs) {
      console.log("\nProgram logs:");
      e.logs.slice(0, 15).forEach((l: string) => console.log("  ", l));
    }
  }
}

main().catch(console.error);
