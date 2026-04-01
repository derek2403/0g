// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FederatedLearningINFT
 * @notice Coordinates federated learning rounds and mints the trained model as an INFT (ERC-7857 style).
 *         Each FL task tracks rounds, participant updates, metrics history, and the final aggregated model.
 */
contract FederatedLearningINFT is ERC721, Ownable {
    // ──────────────────────────── Types ────────────────────────────

    struct ModelMetrics {
        uint256 accuracy;    // scaled by 1e4 (e.g. 9250 = 92.50%)
        uint256 f1Score;     // scaled by 1e4
        uint256 precision_;  // scaled by 1e4
        uint256 recall;      // scaled by 1e4
        uint256 loss;        // scaled by 1e4
        uint256 timestamp;
    }

    struct ParticipantUpdate {
        address participant;
        string  storageRoot;   // 0G Storage Merkle root of gradient/weights
        uint256 dataSize;      // number of training samples used
        uint256 roundId;
        uint256 timestamp;
    }

    struct FLTask {
        string  name;
        string  description;
        string  globalModelRoot;   // 0G Storage root of current global model
        string  initialModelRoot;  // 0G Storage root of the very first model
        uint256 currentRound;
        uint256 totalRounds;
        uint256 minParticipants;
        uint256 rewardPool;
        address creator;
        bool    completed;
        uint256 createdAt;
    }

    struct IntelligentData {
        string  dataDescription;  // e.g. "0g://storage/{rootHash}"
        bytes32 dataHash;
    }

    // ──────────────────────────── State ────────────────────────────

    uint256 public nextTaskId;
    uint256 public nextTokenId;

    mapping(uint256 => FLTask) public tasks;
    mapping(uint256 => address[]) public taskParticipants;
    mapping(uint256 => mapping(address => bool)) public isParticipant;

    // taskId => roundId => updates[]
    mapping(uint256 => mapping(uint256 => ParticipantUpdate[])) public roundUpdates;
    // taskId => roundId => participant => submitted
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasSubmitted;

    // taskId => metrics history (one per round after aggregation)
    mapping(uint256 => ModelMetrics[]) public metricsHistory;

    // tokenId => IntelligentData[]  (INFT encrypted model data)
    mapping(uint256 => IntelligentData[]) public tokenData;
    // tokenId => taskId
    mapping(uint256 => uint256) public tokenTask;

    // taskId => participant => total data contributed
    mapping(uint256 => mapping(address => uint256)) public contributions;

    // ──────────────────────────── Events ────────────────────────────

    event TaskCreated(uint256 indexed taskId, string name, address creator);
    event ParticipantRegistered(uint256 indexed taskId, address participant);
    event UpdateSubmitted(uint256 indexed taskId, uint256 roundId, address participant, string storageRoot);
    event RoundAggregated(uint256 indexed taskId, uint256 roundId, string newGlobalModelRoot);
    event MetricsRecorded(uint256 indexed taskId, uint256 roundId, uint256 accuracy, uint256 f1Score);
    event TaskCompleted(uint256 indexed taskId, uint256 tokenId);
    event ModelMinted(uint256 indexed tokenId, uint256 indexed taskId, address owner);

    // ──────────────────────────── Constructor ────────────────────────────

    constructor() ERC721("PrivTrain FL Model", "PRTFL") Ownable(msg.sender) {}

    // ──────────────────────────── Task Management ────────────────────────────

    function createTask(
        string calldata name,
        string calldata description,
        string calldata initialModelRoot,
        uint256 totalRounds,
        uint256 minParticipants
    ) external payable returns (uint256 taskId) {
        taskId = nextTaskId++;
        tasks[taskId] = FLTask({
            name: name,
            description: description,
            globalModelRoot: initialModelRoot,
            initialModelRoot: initialModelRoot,
            currentRound: 0,
            totalRounds: totalRounds,
            minParticipants: minParticipants,
            rewardPool: msg.value,
            creator: msg.sender,
            completed: false,
            createdAt: block.timestamp
        });
        emit TaskCreated(taskId, name, msg.sender);
    }

    function register(uint256 taskId) external {
        require(!tasks[taskId].completed, "Task completed");
        require(!isParticipant[taskId][msg.sender], "Already registered");
        taskParticipants[taskId].push(msg.sender);
        isParticipant[taskId][msg.sender] = true;
        emit ParticipantRegistered(taskId, msg.sender);
    }

    // ──────────────────────────── Training Round ────────────────────────────

    function submitUpdate(
        uint256 taskId,
        string calldata storageRoot,
        uint256 dataSize
    ) external {
        FLTask storage task = tasks[taskId];
        require(!task.completed, "Task completed");
        require(isParticipant[taskId][msg.sender], "Not registered");
        uint256 roundId = task.currentRound;
        require(!hasSubmitted[taskId][roundId][msg.sender], "Already submitted this round");

        hasSubmitted[taskId][roundId][msg.sender] = true;
        roundUpdates[taskId][roundId].push(ParticipantUpdate({
            participant: msg.sender,
            storageRoot: storageRoot,
            dataSize: dataSize,
            roundId: roundId,
            timestamp: block.timestamp
        }));
        contributions[taskId][msg.sender] += dataSize;

        emit UpdateSubmitted(taskId, roundId, msg.sender, storageRoot);
    }

    function aggregateRound(
        uint256 taskId,
        string calldata newGlobalModelRoot,
        uint256 accuracy,
        uint256 f1Score,
        uint256 precision_,
        uint256 recall,
        uint256 loss
    ) external {
        FLTask storage task = tasks[taskId];
        require(msg.sender == task.creator || msg.sender == owner(), "Not authorized");
        require(!task.completed, "Task completed");
        uint256 roundId = task.currentRound;
        require(
            roundUpdates[taskId][roundId].length >= task.minParticipants,
            "Not enough participants"
        );

        // Record metrics
        metricsHistory[taskId].push(ModelMetrics({
            accuracy: accuracy,
            f1Score: f1Score,
            precision_: precision_,
            recall: recall,
            loss: loss,
            timestamp: block.timestamp
        }));

        // Update global model
        task.globalModelRoot = newGlobalModelRoot;
        task.currentRound++;

        emit RoundAggregated(taskId, roundId, newGlobalModelRoot);
        emit MetricsRecorded(taskId, roundId, accuracy, f1Score);

        // Check if task is done
        if (task.currentRound >= task.totalRounds) {
            task.completed = true;
            uint256 tokenId = _mintModelINFT(taskId);
            emit TaskCompleted(taskId, tokenId);
        }
    }

    // ──────────────────────────── INFT Minting ────────────────────────────

    function _mintModelINFT(uint256 taskId) internal returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        FLTask storage task = tasks[taskId];
        _mint(task.creator, tokenId);
        tokenTask[tokenId] = taskId;

        // Store model reference as IntelligentData
        string memory desc = string(abi.encodePacked("0g://storage/", task.globalModelRoot));
        bytes32 hash = keccak256(abi.encodePacked(task.globalModelRoot));
        tokenData[tokenId].push(IntelligentData({
            dataDescription: desc,
            dataHash: hash
        }));

        emit ModelMinted(tokenId, taskId, task.creator);
    }

    /// @notice Manually mint a model INFT for a completed task
    function mintModel(uint256 taskId) external returns (uint256 tokenId) {
        FLTask storage task = tasks[taskId];
        require(task.completed, "Task not completed");
        require(msg.sender == task.creator, "Not task creator");
        tokenId = nextTokenId++;
        _mint(msg.sender, tokenId);
        tokenTask[tokenId] = taskId;

        string memory desc = string(abi.encodePacked("0g://storage/", task.globalModelRoot));
        bytes32 hash = keccak256(abi.encodePacked(task.globalModelRoot));
        tokenData[tokenId].push(IntelligentData({
            dataDescription: desc,
            dataHash: hash
        }));

        emit ModelMinted(tokenId, taskId, msg.sender);
    }

    // ──────────────────────────── View Functions ────────────────────────────

    function getTask(uint256 taskId) external view returns (FLTask memory) {
        return tasks[taskId];
    }

    function getParticipants(uint256 taskId) external view returns (address[] memory) {
        return taskParticipants[taskId];
    }

    function getRoundUpdates(uint256 taskId, uint256 roundId)
        external view returns (ParticipantUpdate[] memory)
    {
        return roundUpdates[taskId][roundId];
    }

    function getMetricsHistory(uint256 taskId)
        external view returns (ModelMetrics[] memory)
    {
        return metricsHistory[taskId];
    }

    function getRoundUpdateCount(uint256 taskId, uint256 roundId)
        external view returns (uint256)
    {
        return roundUpdates[taskId][roundId].length;
    }

    function getContribution(uint256 taskId, address participant)
        external view returns (uint256)
    {
        return contributions[taskId][participant];
    }

    function getTokenData(uint256 tokenId)
        external view returns (IntelligentData[] memory)
    {
        return tokenData[tokenId];
    }

    function totalMinted() external view returns (uint256) {
        return nextTokenId;
    }

    // ──────────────────────────── Rewards ────────────────────────────

    function claimReward(uint256 taskId) external {
        FLTask storage task = tasks[taskId];
        require(task.completed, "Task not completed");
        require(isParticipant[taskId][msg.sender], "Not a participant");
        require(contributions[taskId][msg.sender] > 0, "No contributions");

        // Calculate proportional reward based on data contribution
        uint256 totalContributions = 0;
        address[] memory participants = taskParticipants[taskId];
        for (uint256 i = 0; i < participants.length; i++) {
            totalContributions += contributions[taskId][participants[i]];
        }

        uint256 reward = (task.rewardPool * contributions[taskId][msg.sender]) / totalContributions;
        contributions[taskId][msg.sender] = 0; // prevent double claim

        (bool sent, ) = msg.sender.call{value: reward}("");
        require(sent, "Reward transfer failed");
    }

    receive() external payable {}
}
