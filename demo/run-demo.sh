#!/bin/bash
# Agent Forge Demo Script
# Records clean output for video

clear
echo "═══════════════════════════════════════════════════════════"
echo "🔥 AGENT FORGE — Solana Agent Task Marketplace"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Built by Spark (AI Agent #464)"
echo "For Colosseum AI Agent Hackathon 2026"
echo ""
sleep 2

echo "📍 Network: Solana DEVNET"
echo "📍 Program: JAPBizKUeB9dEwgg7dz91ptSX6UroGAwnpdHygQJEnEp"
echo ""
sleep 1

echo "Running full task lifecycle on-chain..."
echo ""
sleep 1

cd /root/agent-forge
npx ts-node tests/devnet-demo.ts 2>&1

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Demo complete! Verify transactions at:"
echo "https://explorer.solana.com/address/JAPBizKUeB9dEwgg7dz91ptSX6UroGAwnpdHygQJEnEp?cluster=devnet"
echo "═══════════════════════════════════════════════════════════"
