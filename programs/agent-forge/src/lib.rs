use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("AgentForge111111111111111111111111111111111");

#[program]
pub mod agent_forge {
    use super::*;

    /// Register a new agent in the registry
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        capabilities: Vec<String>,
        hourly_rate: u64,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.owner = ctx.accounts.owner.key();
        agent.name = name;
        agent.capabilities = capabilities;
        agent.hourly_rate = hourly_rate;
        agent.reputation_score = 100; // Start with base reputation
        agent.tasks_completed = 0;
        agent.tasks_failed = 0;
        agent.total_earned = 0;
        agent.is_active = true;
        agent.created_at = Clock::get()?.unix_timestamp;
        
        emit!(AgentRegistered {
            agent: agent.key(),
            owner: agent.owner,
            name: agent.name.clone(),
        });
        
        Ok(())
    }

    /// Create a new task with escrowed payment
    pub fn create_task(
        ctx: Context<CreateTask>,
        description: String,
        required_capabilities: Vec<String>,
        max_budget: u64,
        deadline: i64,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        task.creator = ctx.accounts.creator.key();
        task.description = description;
        task.required_capabilities = required_capabilities;
        task.budget = max_budget;
        task.deadline = deadline;
        task.status = TaskStatus::Open;
        task.assigned_agent = None;
        task.created_at = Clock::get()?.unix_timestamp;
        task.escrow = ctx.accounts.escrow.key();

        // Transfer tokens to escrow
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_token.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, max_budget)?;

        emit!(TaskCreated {
            task: task.key(),
            creator: task.creator,
            budget: max_budget,
        });

        Ok(())
    }

    /// Agent accepts a task
    pub fn accept_task(ctx: Context<AcceptTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let agent = &ctx.accounts.agent;

        require!(task.status == TaskStatus::Open, ErrorCode::TaskNotOpen);
        require!(agent.is_active, ErrorCode::AgentNotActive);
        require!(
            Clock::get()?.unix_timestamp < task.deadline,
            ErrorCode::TaskExpired
        );

        // Verify agent has required capabilities
        for cap in &task.required_capabilities {
            require!(
                agent.capabilities.contains(cap),
                ErrorCode::MissingCapability
            );
        }

        task.assigned_agent = Some(agent.key());
        task.status = TaskStatus::InProgress;

        emit!(TaskAccepted {
            task: task.key(),
            agent: agent.key(),
        });

        Ok(())
    }

    /// Agent submits task result
    pub fn submit_result(
        ctx: Context<SubmitResult>,
        result_uri: String,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;

        require!(
            task.status == TaskStatus::InProgress,
            ErrorCode::TaskNotInProgress
        );
        require!(
            task.assigned_agent == Some(ctx.accounts.agent.key()),
            ErrorCode::NotAssignedAgent
        );

        task.result_uri = Some(result_uri.clone());
        task.status = TaskStatus::PendingReview;

        emit!(ResultSubmitted {
            task: task.key(),
            result_uri,
        });

        Ok(())
    }

    /// Creator approves result and releases payment
    pub fn approve_result(ctx: Context<ApproveResult>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let agent = &mut ctx.accounts.agent;

        require!(
            task.status == TaskStatus::PendingReview,
            ErrorCode::TaskNotPendingReview
        );

        // Release escrow to agent
        let seeds = &[
            b"escrow",
            task.key().as_ref(),
            &[ctx.bumps.escrow],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.agent_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, task.budget)?;

        // Update agent stats
        agent.tasks_completed += 1;
        agent.total_earned += task.budget;
        agent.reputation_score = calculate_reputation(agent);

        task.status = TaskStatus::Completed;

        emit!(TaskCompleted {
            task: task.key(),
            agent: agent.key(),
            payout: task.budget,
        });

        Ok(())
    }

    /// Creator rejects result (dispute flow)
    pub fn reject_result(
        ctx: Context<RejectResult>,
        reason: String,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let agent = &mut ctx.accounts.agent;

        require!(
            task.status == TaskStatus::PendingReview,
            ErrorCode::TaskNotPendingReview
        );

        task.status = TaskStatus::Disputed;
        agent.tasks_failed += 1;
        agent.reputation_score = calculate_reputation(agent);

        emit!(TaskDisputed {
            task: task.key(),
            reason,
        });

        Ok(())
    }
}

// Helper function to calculate reputation
fn calculate_reputation(agent: &Agent) -> u64 {
    let total = agent.tasks_completed + agent.tasks_failed;
    if total == 0 {
        return 100;
    }
    let success_rate = (agent.tasks_completed as f64 / total as f64) * 100.0;
    success_rate as u64
}

// === Account Structures ===

#[account]
pub struct Agent {
    pub owner: Pubkey,
    pub name: String,           // max 32 chars
    pub capabilities: Vec<String>, // max 10 capabilities, 32 chars each
    pub hourly_rate: u64,
    pub reputation_score: u64,
    pub tasks_completed: u64,
    pub tasks_failed: u64,
    pub total_earned: u64,
    pub is_active: bool,
    pub created_at: i64,
}

#[account]
pub struct Task {
    pub creator: Pubkey,
    pub description: String,    // max 256 chars
    pub required_capabilities: Vec<String>,
    pub budget: u64,
    pub deadline: i64,
    pub status: TaskStatus,
    pub assigned_agent: Option<Pubkey>,
    pub result_uri: Option<String>,
    pub escrow: Pubkey,
    pub created_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    Open,
    InProgress,
    PendingReview,
    Completed,
    Disputed,
    Cancelled,
}

// === Context Structures ===

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 36 + 330 + 8 + 8 + 8 + 8 + 8 + 1 + 8
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTask<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 260 + 330 + 8 + 8 + 1 + 33 + 260 + 32 + 8
    )]
    pub task: Account<'info, Task>,
    #[account(
        init,
        payer = creator,
        seeds = [b"escrow", task.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub creator_token: Account<'info, TokenAccount>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptTask<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    pub agent: Account<'info, Agent>,
    pub agent_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    pub agent: Account<'info, Agent>,
    pub agent_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ApproveResult<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    #[account(mut)]
    pub agent: Account<'info, Agent>,
    #[account(
        mut,
        seeds = [b"escrow", task.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub agent_token: Account<'info, TokenAccount>,
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RejectResult<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    #[account(mut)]
    pub agent: Account<'info, Agent>,
    pub creator: Signer<'info>,
}

// === Events ===

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub name: String,
}

#[event]
pub struct TaskCreated {
    pub task: Pubkey,
    pub creator: Pubkey,
    pub budget: u64,
}

#[event]
pub struct TaskAccepted {
    pub task: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct ResultSubmitted {
    pub task: Pubkey,
    pub result_uri: String,
}

#[event]
pub struct TaskCompleted {
    pub task: Pubkey,
    pub agent: Pubkey,
    pub payout: u64,
}

#[event]
pub struct TaskDisputed {
    pub task: Pubkey,
    pub reason: String,
}

// === Error Codes ===

#[error_code]
pub enum ErrorCode {
    #[msg("Task is not open for acceptance")]
    TaskNotOpen,
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Task has expired")]
    TaskExpired,
    #[msg("Agent missing required capability")]
    MissingCapability,
    #[msg("Task is not in progress")]
    TaskNotInProgress,
    #[msg("Caller is not the assigned agent")]
    NotAssignedAgent,
    #[msg("Task is not pending review")]
    TaskNotPendingReview,
}
