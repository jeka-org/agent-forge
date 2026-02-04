// Test with Anchor 0.29.0 (Solang-compatible version)
import { Connection, Keypair, SystemProgram, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";

const PROGRAM_KEY = new PublicKey("JAPBizKUeB9dEwgg7dz91ptSX6UroGAwnpdHygQJEnEp");

async function main() {
  console.log("🔥 Agent Forge - Anchor 0.29 Test\n");
  
  // Load IDL as-is (no patching needed for 0.29)
  const idl = JSON.parse(fs.readFileSync("./target/deploy/AgentForge.json", "utf-8"));
  
  const connection = new Connection("http://localhost:8899", "confirmed");
  const secretKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: "confirmed" });
  
  console.log("Wallet:", wallet.publicKey.toBase58().slice(0, 20));
  
  // Create storage account
  const storage = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(8192);
  
  console.log("\n[1/4] Creating storage account...");
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
  console.log("      ✓ Storage:", storage.publicKey.toBase58().slice(0, 16));
  
  try {
    // Create program with Anchor 0.29 API
    const program = new Program(idl, PROGRAM_KEY, provider);
    console.log("      ✓ Program instance created");
    
    console.log("\n[2/4] Initializing contract...");
    await program.methods.new()
      .accounts({ dataAccount: storage.publicKey })
      .rpc();
    console.log("      ✓ Initialized");
    
    console.log("\n[3/4] Registering agent 'Spark'...");
    await program.methods.registerAgent(
      wallet.publicKey,
      "Spark", 
      new BN(100_000_000)
    ).accounts({
      dataAccount: storage.publicKey,
      owner: wallet.publicKey,
      clock: SYSVAR_CLOCK_PUBKEY,
    }).rpc();
    console.log("      ✓ Agent registered @ 0.1 SOL/hr");
    
    console.log("\n[4/4] Creating task...");
    await program.methods.createTask(
      wallet.publicKey,  // creator
      "Analyze prediction market opportunities",
      new BN(500_000_000),
      new BN(Math.floor(Date.now() / 1000) + 86400)
    ).accounts({
      dataAccount: storage.publicKey,
      creator: wallet.publicKey,
      clock: SYSVAR_CLOCK_PUBKEY,
      systemProgram: SystemProgram.programId,
    }).rpc();
    console.log("      ✓ Task created (0.5 SOL, 24hr deadline)");
    
    console.log("\n══════════════════════════════════════════════");
    console.log("🎉 AGENT FORGE - PROOF OF CONCEPT COMPLETE!");
    console.log("══════════════════════════════════════════════");
    console.log("\nOn-chain transactions executed:");
    console.log("  ✓ Smart contract deployed to Solana");
    console.log("  ✓ Contract state initialized");
    console.log("  ✓ Agent 'Spark' registered (0.1 SOL/hr rate)");
    console.log("  ✓ Task created (0.5 SOL budget, 24hr deadline)");
    console.log("\n📍 Program:", PROGRAM_KEY.toBase58());
    console.log("📍 Storage:", storage.publicKey.toBase58());
    console.log("\n🚀 Ready for Solana Agent Hackathon submission!");
    
  } catch (e: any) {
    console.log("\n❌ Error:", e.message?.slice(0, 200));
    if (e.logs) {
      console.log("\nProgram logs:");
      e.logs.slice(0, 10).forEach((l: string) => console.log("  ", l));
    }
  }
}

main().catch(console.error);
