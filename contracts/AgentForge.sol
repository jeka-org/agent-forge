// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Agent Forge - Solana-native agent spawning and task delegation
/// @notice Enables AI agents to register, accept tasks, and earn reputation
@program_id("AgentForge111111111111111111111111111111111")
contract AgentForge {
    
    // ============ Data Structures ============
    
    struct Agent {
        address owner;
        string name;
        uint64 hourlyRate;      // in lamports
        uint64 reputationScore; // 0-100
        uint64 tasksCompleted;
        uint64 tasksFailed;
        uint64 totalEarned;
        bool isActive;
        uint64 createdAt;
    }
    
    struct Task {
        address creator;
        string description;
        uint64 budget;          // in lamports
        uint64 deadline;
        TaskStatus status;
        address assignedAgent;
        string resultUri;
        uint64 createdAt;
    }
    
    enum TaskStatus {
        Open,
        InProgress,
        PendingReview,
        Completed,
        Disputed,
        Cancelled
    }
    
    // ============ State ============
    
    mapping(address => Agent) public agents;
    mapping(bytes32 => Task) public tasks;
    uint64 public taskCounter;
    
    // ============ Events ============
    
    event AgentRegistered(address indexed owner, string name);
    event AgentDeactivated(address indexed owner);
    event AgentReactivated(address indexed owner);
    event TaskCreated(bytes32 indexed taskId, address indexed creator, uint64 budget);
    event TaskAccepted(bytes32 indexed taskId, address indexed agent);
    event ResultSubmitted(bytes32 indexed taskId, string resultUri);
    event TaskCompleted(bytes32 indexed taskId, address indexed agent, uint64 payout);
    event TaskDisputed(bytes32 indexed taskId, string reason);
    event TaskCancelled(bytes32 indexed taskId);
    
    // ============ Agent Functions ============
    
    /// @notice Register a new agent
    /// @param owner The agent owner's address (must be signer)
    /// @param name Agent's display name (max 32 chars)
    /// @param hourlyRate Rate in lamports per hour
    @signer(owner)
    function registerAgent(
        address owner,
        string memory name,
        uint64 hourlyRate
    ) external {
        assert(bytes(name).length > 0);
        assert(bytes(name).length <= 32);
        assert(agents[owner].createdAt == 0);
        
        agents[owner] = Agent({
            owner: owner,
            name: name,
            hourlyRate: hourlyRate,
            reputationScore: 100,
            tasksCompleted: 0,
            tasksFailed: 0,
            totalEarned: 0,
            isActive: true,
            createdAt: uint64(block.timestamp)
        });
        
        emit AgentRegistered(owner, name);
    }
    
    /// @notice Update agent's hourly rate
    @signer(owner)
    function updateRate(address owner, uint64 newRate) external {
        assert(agents[owner].createdAt > 0);
        agents[owner].hourlyRate = newRate;
    }
    
    /// @notice Deactivate an agent
    @signer(owner)
    function deactivateAgent(address owner) external {
        assert(agents[owner].isActive);
        agents[owner].isActive = false;
        emit AgentDeactivated(owner);
    }
    
    /// @notice Reactivate an agent
    @signer(owner)
    function reactivateAgent(address owner) external {
        assert(!agents[owner].isActive);
        assert(agents[owner].createdAt > 0);
        agents[owner].isActive = true;
        emit AgentReactivated(owner);
    }
    
    // ============ Task Functions ============
    
    /// @notice Create a new task with escrowed payment
    /// @param creator The task creator's address (must be signer)
    /// @param description Task description (max 256 chars)
    /// @param budget Payment in lamports
    /// @param deadline Unix timestamp deadline
    @signer(creator)
    function createTask(
        address creator,
        string memory description,
        uint64 budget,
        uint64 deadline
    ) external returns (bytes32) {
        assert(bytes(description).length > 0);
        assert(bytes(description).length <= 256);
        assert(budget > 0);
        assert(deadline > uint64(block.timestamp));
        
        bytes32 taskId = keccak256(abi.encodePacked(creator, taskCounter));
        taskCounter++;
        
        tasks[taskId] = Task({
            creator: creator,
            description: description,
            budget: budget,
            deadline: deadline,
            status: TaskStatus.Open,
            assignedAgent: address(0),
            resultUri: "",
            createdAt: uint64(block.timestamp)
        });
        
        emit TaskCreated(taskId, creator, budget);
        return taskId;
    }
    
    /// @notice Agent accepts a task
    /// @param agentOwner The agent's address (must be signer)
    /// @param taskId The task to accept
    @signer(agentOwner)
    function acceptTask(address agentOwner, bytes32 taskId) external {
        Task storage task = tasks[taskId];
        Agent storage agent = agents[agentOwner];
        
        assert(task.status == TaskStatus.Open);
        assert(agent.isActive);
        assert(uint64(block.timestamp) < task.deadline);
        
        task.assignedAgent = agentOwner;
        task.status = TaskStatus.InProgress;
        
        emit TaskAccepted(taskId, agentOwner);
    }
    
    /// @notice Agent submits task result
    /// @param agentOwner The agent's address (must be signer)
    /// @param taskId The task ID
    /// @param resultUri URI to the result (IPFS, Arweave, etc.)
    @signer(agentOwner)
    function submitResult(
        address agentOwner, 
        bytes32 taskId, 
        string memory resultUri
    ) external {
        Task storage task = tasks[taskId];
        
        assert(task.status == TaskStatus.InProgress);
        assert(task.assignedAgent == agentOwner);
        assert(bytes(resultUri).length > 0);
        
        task.resultUri = resultUri;
        task.status = TaskStatus.PendingReview;
        
        emit ResultSubmitted(taskId, resultUri);
    }
    
    /// @notice Creator approves result and releases payment
    /// @param creator The task creator's address (must be signer)
    /// @param taskId The task ID
    @signer(creator)
    function approveResult(address creator, bytes32 taskId) external {
        Task storage task = tasks[taskId];
        
        assert(task.status == TaskStatus.PendingReview);
        assert(task.creator == creator);
        
        Agent storage agent = agents[task.assignedAgent];
        
        // Update agent stats
        agent.tasksCompleted++;
        agent.totalEarned += task.budget;
        agent.reputationScore = _calculateReputation(
            agent.tasksCompleted, 
            agent.tasksFailed
        );
        
        task.status = TaskStatus.Completed;
        
        emit TaskCompleted(taskId, task.assignedAgent, task.budget);
    }
    
    /// @notice Creator rejects result
    /// @param creator The task creator's address (must be signer)
    /// @param taskId The task ID
    /// @param reason Rejection reason
    @signer(creator)
    function rejectResult(
        address creator, 
        bytes32 taskId, 
        string memory reason
    ) external {
        Task storage task = tasks[taskId];
        
        assert(task.status == TaskStatus.PendingReview);
        assert(task.creator == creator);
        
        Agent storage agent = agents[task.assignedAgent];
        agent.tasksFailed++;
        agent.reputationScore = _calculateReputation(
            agent.tasksCompleted,
            agent.tasksFailed
        );
        
        task.status = TaskStatus.Disputed;
        
        emit TaskDisputed(taskId, reason);
    }
    
    /// @notice Cancel an open task (creator only)
    /// @param creator The task creator's address (must be signer)
    /// @param taskId The task ID
    @signer(creator)
    function cancelTask(address creator, bytes32 taskId) external {
        Task storage task = tasks[taskId];
        
        assert(task.creator == creator);
        assert(task.status == TaskStatus.Open);
        
        task.status = TaskStatus.Cancelled;
        
        emit TaskCancelled(taskId);
    }
    
    // ============ View Functions ============
    
    /// @notice Get agent details
    function getAgent(address owner) external view returns (
        string memory name,
        uint64 hourlyRate,
        uint64 reputationScore,
        uint64 tasksCompleted,
        uint64 tasksFailed,
        uint64 totalEarned,
        bool isActive
    ) {
        Agent storage agent = agents[owner];
        return (
            agent.name,
            agent.hourlyRate,
            agent.reputationScore,
            agent.tasksCompleted,
            agent.tasksFailed,
            agent.totalEarned,
            agent.isActive
        );
    }
    
    /// @notice Get task details
    function getTask(bytes32 taskId) external view returns (
        address creator,
        string memory description,
        uint64 budget,
        uint64 deadline,
        TaskStatus status,
        address assignedAgent,
        string memory resultUri
    ) {
        Task storage task = tasks[taskId];
        return (
            task.creator,
            task.description,
            task.budget,
            task.deadline,
            task.status,
            task.assignedAgent,
            task.resultUri
        );
    }
    
    /// @notice Check if a task is still open for acceptance
    function isTaskOpen(bytes32 taskId) external view returns (bool) {
        Task storage task = tasks[taskId];
        return task.status == TaskStatus.Open && 
               uint64(block.timestamp) < task.deadline;
    }
    
    // ============ Internal Functions ============
    
    /// @notice Calculate reputation based on success rate
    function _calculateReputation(
        uint64 completed, 
        uint64 failed
    ) internal pure returns (uint64) {
        uint64 total = completed + failed;
        if (total == 0) {
            return 100;
        }
        return (completed * 100) / total;
    }
}
