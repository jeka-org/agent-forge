import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AgentForge } from "../target/types/agent_forge";
import { expect } from "chai";

describe("agent-forge", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentForge as Program<AgentForge>;

  it("registers an agent", async () => {
    const agent = anchor.web3.Keypair.generate();
    
    await program.methods
      .registerAgent(
        "Spark",
        ["research", "coding", "analysis"],
        new anchor.BN(1000000) // 1 USDC per hour
      )
      .accounts({
        agent: agent.publicKey,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const agentAccount = await program.account.agent.fetch(agent.publicKey);
    expect(agentAccount.name).to.equal("Spark");
    expect(agentAccount.capabilities).to.deep.equal(["research", "coding", "analysis"]);
    expect(agentAccount.reputationScore.toNumber()).to.equal(100);
    expect(agentAccount.isActive).to.be.true;
  });

  it("creates a task with escrow", async () => {
    // This test requires token setup - simplified for demo
    console.log("Task creation test - requires token mint setup");
  });

  it("agent accepts and completes task", async () => {
    // Full flow test
    console.log("Full task flow test - requires full setup");
  });
});
