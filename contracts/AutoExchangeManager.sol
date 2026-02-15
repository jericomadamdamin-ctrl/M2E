// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title IUniswapV3Router
 * @dev Interface for Uniswap V3 Router
 */
interface ISwapRouter {
    struct ExactInputSingleParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @title AutoExchangeManager
 * @dev Manages automatic Diamond to WLD token exchanges with fallback mechanisms
 */
contract AutoExchangeManager is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============
    
    IERC20 public diamondToken;
    IERC20 public wldToken;
    ISwapRouter public uniswapRouter;

    address public feeRecipient;
    uint256 public feePercentage; // in basis points (100 = 1%)
    uint256 public maxSlippageTolerance; // in basis points (100 = 1%)
    
    uint256 public constant MAX_FEE = 500; // 5% max fee
    uint256 public constant MIN_ORDER_AMOUNT = 1e18; // Minimum 1 token

    // ============ Data Structures ============

    struct ExchangeOrder {
        bytes32 orderId;
        address player;
        uint256 diamondAmount;
        uint256 minWldAmount;
        uint256 executedWldAmount;
        uint256 timestamp;
        OrderStatus status;
        string failureReason;
    }

    enum OrderStatus {
        PENDING,
        EXECUTED,
        FAILED,
        CANCELLED
    }

    // ============ Storage ============

    mapping(bytes32 => ExchangeOrder) public orders;
    mapping(address => bytes32[]) public playerOrders;
    
    uint256 public totalOrdersExecuted;
    uint256 public totalVolume;

    // ============ Events ============

    event ExchangeRequested(
        bytes32 indexed orderId,
        address indexed player,
        uint256 diamondAmount,
        uint256 minWldAmount,
        uint256 timestamp
    );

    event ExchangeExecuted(
        bytes32 indexed orderId,
        address indexed player,
        uint256 diamondAmount,
        uint256 wldAmount,
        uint256 feeAmount,
        uint256 timestamp
    );

    event ExchangeFailed(
        bytes32 indexed orderId,
        address indexed player,
        uint256 diamondAmount,
        string reason,
        uint256 timestamp
    );

    event OrderCancelled(
        bytes32 indexed orderId,
        address indexed player,
        uint256 timestamp
    );

    event ConfigUpdated(
        address feeRecipient,
        uint256 feePercentage,
        uint256 maxSlippageTolerance
    );

    event EmergencyWithdrawal(
        address token,
        uint256 amount,
        address recipient
    );

    // ============ Constructor ============

    constructor(
        address _diamondToken,
        address _wldToken,
        address _uniswapRouter,
        address _feeRecipient,
        uint256 _feePercentage,
        uint256 _maxSlippageTolerance
    ) {
        require(_diamondToken != address(0), "Invalid diamond token");
        require(_wldToken != address(0), "Invalid WLD token");
        require(_uniswapRouter != address(0), "Invalid router");
        require(_feePercentage <= MAX_FEE, "Fee too high");
        require(_maxSlippageTolerance <= 10000, "Slippage too high");

        diamondToken = IERC20(_diamondToken);
        wldToken = IERC20(_wldToken);
        uniswapRouter = ISwapRouter(_uniswapRouter);
        feeRecipient = _feeRecipient;
        feePercentage = _feePercentage;
        maxSlippageTolerance = _maxSlippageTolerance;
    }

    // ============ External Functions ============

    /**
     * @dev Request an automatic exchange from Diamond to WLD
     * @param _diamondAmount Amount of diamonds to exchange
     * @param _minWldAmount Minimum WLD amount to accept
     * @return orderId The unique order identifier
     */
    function requestExchange(
        uint256 _diamondAmount,
        uint256 _minWldAmount
    ) external nonReentrant whenNotPaused returns (bytes32) {
        require(_diamondAmount >= MIN_ORDER_AMOUNT, "Amount too small");
        require(_minWldAmount > 0, "Min amount must be > 0");
        require(_diamondAmount <= diamondToken.balanceOf(msg.sender), "Insufficient balance");

        // Transfer diamonds from player to contract
        diamondToken.safeTransferFrom(msg.sender, address(this), _diamondAmount);

        // Create order
        bytes32 orderId = keccak256(abi.encodePacked(msg.sender, block.timestamp, _diamondAmount));
        
        ExchangeOrder storage order = orders[orderId];
        order.orderId = orderId;
        order.player = msg.sender;
        order.diamondAmount = _diamondAmount;
        order.minWldAmount = _minWldAmount;
        order.timestamp = block.timestamp;
        order.status = OrderStatus.PENDING;

        playerOrders[msg.sender].push(orderId);

        emit ExchangeRequested(orderId, msg.sender, _diamondAmount, _minWldAmount, block.timestamp);

        return orderId;
    }

    /**
     * @dev Execute a pending exchange order
     * @param _orderId Order ID to execute
     * @param _swapPath Encoded path for Uniswap V3 swap
     * @param _deadline Swap deadline
     */
    function executeExchange(
        bytes32 _orderId,
        bytes calldata _swapPath,
        uint256 _deadline
    ) external nonReentrant whenNotPaused onlyOwner {
        ExchangeOrder storage order = orders[_orderId];
        
        require(order.status == OrderStatus.PENDING, "Order not pending");
        require(block.timestamp <= _deadline, "Deadline passed");

        try this._performSwap(_orderId, _swapPath, _deadline) {
            // Success - already updated in _performSwap
        } catch Error(string memory reason) {
            _handleFailure(_orderId, reason);
        } catch {
            _handleFailure(_orderId, "Unknown error");
        }
    }

    /**
     * @dev Perform the actual swap (called internally with try-catch)
     */
    function _performSwap(
        bytes32 _orderId,
        bytes calldata _swapPath,
        uint256 _deadline
    ) external {
        require(msg.sender == address(this), "Internal only");
        
        ExchangeOrder storage order = orders[_orderId];
        require(order.status == OrderStatus.PENDING, "Invalid order state");

        uint256 diamondAmount = order.diamondAmount;
        uint256 minWldAmount = order.minWldAmount;

        // Approve Uniswap router
        diamondToken.safeApprove(address(uniswapRouter), diamondAmount);

        // Execute swap
        uint256 wldReceived = uniswapRouter.exactInput(
            ISwapRouter.ExactInputSingleParams({
                path: _swapPath,
                recipient: address(this),
                deadline: _deadline,
                amountIn: diamondAmount,
                amountOutMinimum: minWldAmount
            })
        );

        require(wldReceived >= minWldAmount, "Insufficient output amount");

        // Calculate and transfer fees
        uint256 feeAmount = (wldReceived * feePercentage) / 10000;
        uint256 playerAmount = wldReceived - feeAmount;

        // Transfer WLD to player
        wldToken.safeTransfer(order.player, playerAmount);

        // Transfer fee
        if (feeAmount > 0) {
            wldToken.safeTransfer(feeRecipient, feeAmount);
        }

        // Update order state
        order.executedWldAmount = playerAmount;
        order.status = OrderStatus.EXECUTED;

        totalOrdersExecuted++;
        totalVolume += diamondAmount;

        emit ExchangeExecuted(_orderId, order.player, diamondAmount, playerAmount, feeAmount, block.timestamp);
    }

    /**
     * @dev Cancel a pending order and return diamonds
     */
    function cancelOrder(bytes32 _orderId) external nonReentrant {
        ExchangeOrder storage order = orders[_orderId];
        
        require(order.status == OrderStatus.PENDING, "Order not pending");
        require(order.player == msg.sender || msg.sender == owner(), "Unauthorized");

        // Return diamonds
        diamondToken.safeTransfer(order.player, order.diamondAmount);

        order.status = OrderStatus.CANCELLED;

        emit OrderCancelled(_orderId, order.player, block.timestamp);
    }

    /**
     * @dev Get order details
     */
    function getOrder(bytes32 _orderId) external view returns (ExchangeOrder memory) {
        return orders[_orderId];
    }

    /**
     * @dev Get player's order history
     */
    function getPlayerOrders(address _player) external view returns (bytes32[] memory) {
        return playerOrders[_player];
    }

    /**
     * @dev Update configuration
     */
    function updateConfig(
        address _feeRecipient,
        uint256 _feePercentage,
        uint256 _maxSlippageTolerance
    ) external onlyOwner {
        require(_feePercentage <= MAX_FEE, "Fee too high");
        require(_maxSlippageTolerance <= 10000, "Slippage too high");

        feeRecipient = _feeRecipient;
        feePercentage = _feePercentage;
        maxSlippageTolerance = _maxSlippageTolerance;

        emit ConfigUpdated(_feeRecipient, _feePercentage, _maxSlippageTolerance);
    }

    /**
     * @dev Pause/unpause the contract
     */
    function togglePause() external onlyOwner {
        if (paused()) {
            _unpause();
        } else {
            _pause();
        }
    }

    /**
     * @dev Emergency withdrawal of tokens
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(0), "Invalid token");
        IERC20(_token).safeTransfer(owner(), _amount);
        emit EmergencyWithdrawal(_token, _amount, owner());
    }

    // ============ Internal Functions ============

    /**
     * @dev Handle order failure
     */
    function _handleFailure(bytes32 _orderId, string memory _reason) internal {
        ExchangeOrder storage order = orders[_orderId];
        
        if (order.status == OrderStatus.PENDING) {
            // Return diamonds to player
            diamondToken.safeTransfer(order.player, order.diamondAmount);
            
            order.status = OrderStatus.FAILED;
            order.failureReason = _reason;

            emit ExchangeFailed(_orderId, order.player, order.diamondAmount, _reason, block.timestamp);
        }
    }

    // ============ Fallback ============

    receive() external payable {
        revert("Contract does not accept ETH");
    }
}
