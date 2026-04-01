// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC7857} from "./interfaces/IERC7857.sol";
import {IERC7857Authorize} from "./interfaces/IERC7857Authorize.sol";
import {IntelligentData} from "./interfaces/IERC7857Metadata.sol";
import {
    IERC7857DataVerifier,
    TransferValidityProof,
    TransferValidityProofOutput
} from "./interfaces/IERC7857DataVerifier.sol";

/**
 * @title FederatedLearningINFT
 * @notice Coordinates federated learning rounds and mints the trained model as a
 *         proper ERC-7857 Intelligent NFT. Each FL task tracks rounds, participant
 *         updates, metrics history, and the final aggregated model.
 * @dev Implements IERC7857 + IERC7857Authorize for on-chain model ownership,
 *      encrypted weight transfer, and usage authorization.
 */
contract FederatedLearningINFT is ERC721, Ownable {
    // ══════════════════════════════════════════════════════════════════
    //  ERC-7857 STATE
    // ══════════════════════════════════════════════════════════════════

    IERC7857DataVerifier public verifier;
    mapping(address => address) private _accessAssistants;
    mapping(uint256 => IntelligentData[]) private _iDatas;
    mapping(uint256 => mapping(address => bool)) private _authorized;
    mapping(uint256 => address[]) private _authorizedUsers;

    // ══════════════════════════════════════════════════════════════════
    //  FL TYPES
    // ══════════════════════════════════════════════════════════════════

    struct ModelMetrics {
        uint256 accuracy;    // scaled by 1e4 (e.g. 9250 = 92.50%)
        uint256 f1Score;
        uint256 precision_;
        uint256 recall;
        uint256 loss;
        uint256 timestamp;
    }

    struct ParticipantUpdate {
        address participant;
        string  storageRoot;
        uint256 dataSize;
        uint256 roundId;
        uint256 timestamp;
    }

    struct FLTask {
        string  name;
        string  description;
        string  globalModelRoot;
        string  initialModelRoot;
        uint256 currentRound;
        uint256 totalRounds;
        uint256 minParticipants;
        uint256 rewardPool;
        address creator;
        bool    completed;
        uint256 createdAt;
    }

    // ══════════════════════════════════════════════════════════════════
    //  FL STATE
    // ══════════════════════════════════════════════════════════════════

    uint256 public nextTaskId;
    uint256 public nextTokenId;

    mapping(uint256 => FLTask) public tasks;
    mapping(uint256 => address[]) public taskParticipants;
    mapping(uint256 => mapping(address => bool)) public isParticipant;
    mapping(uint256 => mapping(uint256 => ParticipantUpdate[])) public roundUpdates;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasSubmitted;
    mapping(uint256 => ModelMetrics[]) public metricsHistory;
    mapping(uint256 => uint256) public tokenTask;
    mapping(uint256 => mapping(address => uint256)) public contributions;

    // ══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ══════════════════════════════════════════════════════════════════

    // ERC-7857 events
    event Updated(uint256 indexed tokenId, IntelligentData[] oldDatas, IntelligentData[] newDatas);
    event PublishedSealedKey(address indexed to, uint256 indexed tokenId, bytes[] sealedKeys);
    event DelegateAccess(address indexed user, address indexed assistant);
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);

    // FL events
    event TaskCreated(uint256 indexed taskId, string name, address creator);
    event ParticipantRegistered(uint256 indexed taskId, address participant);
    event UpdateSubmitted(uint256 indexed taskId, uint256 roundId, address participant, string storageRoot);
    event RoundAggregated(uint256 indexed taskId, uint256 roundId, string newGlobalModelRoot);
    event MetricsRecorded(uint256 indexed taskId, uint256 roundId, uint256 accuracy, uint256 f1Score);
    event TaskCompleted(uint256 indexed taskId, uint256 tokenId);
    event ModelMinted(uint256 indexed tokenId, uint256 indexed taskId, address owner);

    // ══════════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ══════════════════════════════════════════════════════════════════

    constructor(address _verifier) ERC721("PrivTrain FL Model", "PRTFL") Ownable(msg.sender) {
        verifier = IERC7857DataVerifier(_verifier);
    }

    // ══════════════════════════════════════════════════════════════════
    //  ERC-7857: INTELLIGENT TRANSFER
    // ══════════════════════════════════════════════════════════════════

    function iTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) external {
        require(ownerOf(tokenId) == from, "Not owner");
        require(to != address(0), "Invalid recipient");
        require(proofs.length > 0, "Empty proofs");

        TransferValidityProofOutput[] memory outputs = verifier.verifyTransferValidity(proofs);
        require(outputs.length == _iDatas[tokenId].length, "Proof count mismatch");

        bytes[] memory sealedKeys = new bytes[](outputs.length);
        for (uint i = 0; i < outputs.length; i++) {
            require(outputs[i].dataHash == _iDatas[tokenId][i].dataHash, "Data hash mismatch");
            sealedKeys[i] = outputs[i].sealedKey;
        }

        _transfer(from, to, tokenId);
        emit PublishedSealedKey(to, tokenId, sealedKeys);
    }

    // ══════════════════════════════════════════════════════════════════
    //  ERC-7857: DATA MANAGEMENT
    // ══════════════════════════════════════════════════════════════════

    function updateData(uint256 tokenId, IntelligentData[] calldata newDatas) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(newDatas.length > 0, "Empty data");

        IntelligentData[] memory oldDatas = _iDatas[tokenId];
        delete _iDatas[tokenId];
        for (uint i = 0; i < newDatas.length; i++) {
            _iDatas[tokenId].push(newDatas[i]);
        }

        emit Updated(tokenId, oldDatas, newDatas);
    }

    function intelligentDatasOf(uint256 tokenId) external view returns (IntelligentData[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _iDatas[tokenId];
    }

    // ══════════════════════════════════════════════════════════════════
    //  ERC-7857: DELEGATE ACCESS
    // ══════════════════════════════════════════════════════════════════

    function delegateAccess(address assistant) external {
        _accessAssistants[msg.sender] = assistant;
        emit DelegateAccess(msg.sender, assistant);
    }

    function getDelegateAccess(address user) external view returns (address) {
        return _accessAssistants[user];
    }

    // ══════════════════════════════════════════════════════════════════
    //  ERC-7857: AUTHORIZE USAGE
    // ══════════════════════════════════════════════════════════════════

    function authorizeUsage(uint256 tokenId, address user) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(user != address(0), "Zero address");
        require(!_authorized[tokenId][user], "Already authorized");

        _authorized[tokenId][user] = true;
        _authorizedUsers[tokenId].push(user);
        emit Authorization(msg.sender, user, tokenId);
    }

    function revokeAuthorization(uint256 tokenId, address user) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(_authorized[tokenId][user], "Not authorized");

        _authorized[tokenId][user] = false;
        address[] storage users = _authorizedUsers[tokenId];
        for (uint i = 0; i < users.length; i++) {
            if (users[i] == user) {
                users[i] = users[users.length - 1];
                users.pop();
                break;
            }
        }
        emit AuthorizationRevoked(msg.sender, user, tokenId);
    }

    function authorizedUsersOf(uint256 tokenId) external view returns (address[] memory) {
        return _authorizedUsers[tokenId];
    }

    function isAuthorized(uint256 tokenId, address user) external view returns (bool) {
        return _authorized[tokenId][user];
    }

    // ══════════════════════════════════════════════════════════════════
    //  FL: TASK MANAGEMENT
    // ══════════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════════
    //  FL: TRAINING ROUND
    // ══════════════════════════════════════════════════════════════════

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

        metricsHistory[taskId].push(ModelMetrics({
            accuracy: accuracy,
            f1Score: f1Score,
            precision_: precision_,
            recall: recall,
            loss: loss,
            timestamp: block.timestamp
        }));

        task.globalModelRoot = newGlobalModelRoot;
        task.currentRound++;

        emit RoundAggregated(taskId, roundId, newGlobalModelRoot);
        emit MetricsRecorded(taskId, roundId, accuracy, f1Score);

        if (task.currentRound >= task.totalRounds) {
            task.completed = true;
            uint256 tokenId = _mintModelINFT(taskId);
            emit TaskCompleted(taskId, tokenId);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  FL: INFT MINTING
    // ══════════════════════════════════════════════════════════════════

    function _mintModelINFT(uint256 taskId) internal returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        FLTask storage task = tasks[taskId];
        _mint(task.creator, tokenId);
        tokenTask[tokenId] = taskId;

        string memory desc = string(abi.encodePacked("0g://storage/", task.globalModelRoot));
        bytes32 hash = keccak256(abi.encodePacked(task.globalModelRoot));
        _iDatas[tokenId].push(IntelligentData({ dataDescription: desc, dataHash: hash }));

        emit ModelMinted(tokenId, taskId, task.creator);
    }

    function mintModel(uint256 taskId) external returns (uint256 tokenId) {
        FLTask storage task = tasks[taskId];
        require(task.completed, "Task not completed");
        require(msg.sender == task.creator, "Not task creator");
        tokenId = nextTokenId++;
        _mint(msg.sender, tokenId);
        tokenTask[tokenId] = taskId;

        string memory desc = string(abi.encodePacked("0g://storage/", task.globalModelRoot));
        bytes32 hash = keccak256(abi.encodePacked(task.globalModelRoot));
        _iDatas[tokenId].push(IntelligentData({ dataDescription: desc, dataHash: hash }));

        emit ModelMinted(tokenId, taskId, msg.sender);
    }

    // ══════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════

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
        return _iDatas[tokenId];
    }

    function totalMinted() external view returns (uint256) {
        return nextTokenId;
    }

    /// @notice Returns the 0G Storage URI as the token URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        IntelligentData[] storage datas = _iDatas[tokenId];
        if (datas.length > 0 && bytes(datas[0].dataDescription).length > 0) {
            return datas[0].dataDescription;
        }
        return "";
    }

    // ══════════════════════════════════════════════════════════════════
    //  REWARDS
    // ══════════════════════════════════════════════════════════════════

    function claimReward(uint256 taskId) external {
        FLTask storage task = tasks[taskId];
        require(task.completed, "Task not completed");
        require(isParticipant[taskId][msg.sender], "Not a participant");
        require(contributions[taskId][msg.sender] > 0, "No contributions");

        uint256 totalContributions = 0;
        address[] memory participants = taskParticipants[taskId];
        for (uint256 i = 0; i < participants.length; i++) {
            totalContributions += contributions[taskId][participants[i]];
        }

        uint256 reward = (task.rewardPool * contributions[taskId][msg.sender]) / totalContributions;
        contributions[taskId][msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: reward}("");
        require(sent, "Reward transfer failed");
    }

    // ══════════════════════════════════════════════════════════════════
    //  ERC-165
    // ══════════════════════════════════════════════════════════════════

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == type(IERC7857).interfaceId ||
            interfaceId == type(IERC7857Authorize).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
