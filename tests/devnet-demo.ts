// Agent Forge - DEVNET Demo
import { Connection, Keypair, SystemProgram, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import { keccak256 } from "js-sha3";

const PROGRAM_KEY = new PublicKey("JAPBizKUeB9dEwgg7dz91ptSX6UroGAwnpdHygQJEnEp");
const DEVNET_URL = "https://api.devnet.solana.com";

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🔥 AGENT FORGE - DEVNET DEPLOYMENT TEST");
  console.log("═══════════════════════════════════════════════════════════\n");
  
  const idl = JSON.parse(fs.readFileSync("./target/deploy/AgentForge.json", "utf-8"));
  
  const connection = new Connection(DEVNET_URL, "confirmed");
  const secretKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: "confirmed" });
  
  console.log("🌐 Network: Solana DEVNET");
  console.log("👤 Wallet:", wallet.publicKey.toBase58());
  
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("💰 Balance:", (balance / 1e9).toFixed(4), "SOL\n");
  
  // Create storage account
  const storage = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(8192);
  
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
  const sig1 = await provider.sendAndConfirm(tx, [wallet, storage]);
  console.log("      ✓ Storage:", storage.publicKey.toBase58().slice(0, 20) + "...");
  console.log("      📝 Tx:", sig1.slice(0, 40) + "...\n");
  
  const program = new Program(idl, PROGRAM_KEY, provider);
  
  console.log("[2/7] Initializing contract...");
  const sig2 = await program.methods.new()
    .accounts({ dataAccount: storage.publicKey })
    .rpc();
  console.log("      ✓ Initialized");
  console.log("      📝 Tx:", sig2.slice(0, 40) + "...\n");
  
  console.log("[3/7] Registering agent 'Spark'...");
  const sig3 = await program.methods.registerAgent(
    wallet.publicKey, "Spark", new BN(100_000_000)
  ).accounts({
    dataAccount: storage.publicKey,
    owner: wallet.publicKey,
    clock: SYSVAR_CLOCK_PUBKEY,
  }).rpc();
  console.log("      ✓ Agent registered @ 0.1 SOL/hr");
  console.log("      📝 Tx:", sig3.slice(0, 40) + "...\n");
  
  // Compute task ID
  const taskCounter: BN = await program.methods.taskCounter()
    .accounts({ dataAccount: storage.publicKey }).view();
  const taskIdData = Buffer.alloc(40);
  wallet.publicKey.toBuffer().copy(taskIdData, 0);
  taskIdData.writeBigUInt64BE(BigInt(taskCounter.toString()), 32);
  const taskId = Array.from(Buffer.from(keccak256(taskIdData), 'hex'));
  
  console.log("[4/7] Creating task (0.5 SOL budget)...");
  const sig4 = await program.methods.createTask(
    wallet.publicKey,
    "Analyze prediction market data for edge detection",
    new BN(500_000_000),
    new BN(Math.floor(Date.now() / 1000) + 86400)
  ).accounts({
    dataAccount: storage.publicKey,
    creator: wallet.publicKey,
    clock: SYSVAR_CLOCK_PUBKEY,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log("      ✓ Task created");
  console.log("      📝 Tx:", sig4.slice(0, 40) + "...\n");
  
  console.log("[5/7] Agent accepting task...");
  const sig5 = await program.methods.acceptTask(wallet.publicKey, taskId)
    .accounts({
      dataAccount: storage.publicKey,
      agentOwner: wallet.publicKey,
      clock: SYSVAR_CLOCK_PUBKEY,
    }).rpc();
  console.log("      ✓ Task accepted");
  console.log("      📝 Tx:", sig5.slice(0, 40) + "...\n");
  
  console.log("[6/7] Submitting result...");
  const sig6 = await program.methods.submitResult(
    wallet.publicKey, taskId, "ipfs://QmAgentForgeResult_v1_demo"
  ).accounts({
    dataAccount: storage.publicKey,
    agentOwner: wallet.publicKey,
  }).rpc();
  console.log("      ✓ Result submitted");
  console.log("      📝 Tx:", sig6.slice(0, 40) + "...\n");
  
  console.log("[7/7] Approving & releasing payment...");
  const sig7 = await program.methods.approveResult(wallet.publicKey, taskId)
    .accounts({
      dataAccount: storage.publicKey,
      creator: wallet.publicKey,
    }).rpc();
  console.log("      ✓ Payment released!");
  console.log("      📝 Tx:", sig7.slice(0, 40) + "...\n");
  
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🎉 AGENT FORGE DEVNET DEMO COMPLETE!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\n📍 Verify on Solana Explorer:");
  console.log(`   https://explorer.solana.com/address/${PROGRAM_KEY.toBase58()}?cluster=devnet`);
  console.log("\n📋 All transaction signatures:");
  console.log("   1. Storage:", sig1);
  console.log("   2. Init:   ", sig2);
  console.log("   3. Register:", sig3);
  console.log("   4. Task:   ", sig4);
  console.log("   5. Accept: ", sig5);
  console.log("   6. Submit: ", sig6);
  console.log("   7. Approve:", sig7);
}

main().catch(e => {
  console.error("❌ Error:", e.message?.slice(0, 200));
  if (e.logs) e.logs.slice(0, 10).forEach((l: string) => console.log("  ", l));
});
