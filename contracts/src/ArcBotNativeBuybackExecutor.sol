// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20NativeBuybackExecutor {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

interface IArgusFactoryNativeBuybackExecutor {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory launched);
    function memeHook() external view returns (address);
}

interface IUniversalRouterNativeBuybackExecutor {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

/// @notice Canonical native-asset -> ARCBOT V4 executor for the automated
/// creator-fee program. It derives the complete pool key from the Argus factory,
/// accepts no arbitrary route calldata, and may only be called by the adapter.
contract ArcBotNativeBuybackExecutor {
    address public constant NATIVE_ASSET = address(0);
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_EXECUTION_DEADLINE_WINDOW = 10 minutes;

    bytes private constant UNIVERSAL_ROUTER_V4_SWAP = hex"10";
    bytes private constant V4_ACTIONS = hex"060f0c"; // exact-in single, take-all, settle-all

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        uint256 minHopPriceX36;
        bytes hookData;
    }

    address public immutable adapter;
    address public immutable argusFactory;
    address public immutable universalRouter;
    address public immutable canonicalArcBot;
    address public immutable canonicalHook;
    uint24 public immutable canonicalPoolFee;
    int24 public immutable canonicalTickSpacing;
    bytes32 public immutable argusFactoryCodeHash;
    bytes32 public immutable universalRouterCodeHash;
    bytes32 public immutable canonicalArcBotCodeHash;
    bytes32 public immutable canonicalHookCodeHash;
    bool private entered;

    error Unauthorized();
    error InvalidConfiguration();
    error TransferFailed();
    error BuybackVerificationFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    constructor(address adapter_, address argusFactory_, address universalRouter_, address arcbot_) {
        if (
            adapter_ == address(0) || argusFactory_ == address(0) || universalRouter_ == address(0)
                || arcbot_ == address(0)
        ) revert InvalidConfiguration();
        if (
            adapter_.code.length == 0 || argusFactory_.code.length == 0 || universalRouter_.code.length == 0
                || arcbot_.code.length == 0
        ) revert InvalidConfiguration();
        adapter = adapter_;
        argusFactory = argusFactory_;
        universalRouter = universalRouter_;
        canonicalArcBot = arcbot_;
        argusFactoryCodeHash = argusFactory_.codehash;
        universalRouterCodeHash = universalRouter_.codehash;
        canonicalArcBotCodeHash = arcbot_.codehash;
        IArgusFactoryNativeBuybackExecutor.LaunchedToken memory launched =
            IArgusFactoryNativeBuybackExecutor(argusFactory_).getLaunchedToken(arcbot_);
        address hook = IArgusFactoryNativeBuybackExecutor(argusFactory_).memeHook();
        if (
            !launched.exists || launched.token != arcbot_ || launched.pairToken != NATIVE_ASSET
                || launched.phase != 2 || launched.tickSpacing == 0 || hook == address(0) || hook.code.length == 0
        ) revert InvalidConfiguration();
        canonicalHook = hook;
        canonicalPoolFee = launched.poolFee;
        canonicalTickSpacing = launched.tickSpacing;
        canonicalHookCodeHash = hook.codehash;
    }

    receive() external payable {}

    function executeBuyback(
        address pairAsset,
        uint256 amountIn,
        address arcbot,
        address burnAddress,
        uint256 minArcBotOut,
        uint256 deadline,
        bytes calldata routeData
    ) external payable nonReentrant returns (uint256 arcbotBurned) {
        if (msg.sender != adapter) revert Unauthorized();
        if (
            pairAsset != NATIVE_ASSET || arcbot != canonicalArcBot || burnAddress != BURN_ADDRESS || amountIn == 0
                || amountIn > type(uint128).max || minArcBotOut == 0 || minArcBotOut > type(uint128).max
                || msg.value != amountIn || block.timestamp > deadline
                || deadline > block.timestamp + MAX_EXECUTION_DEADLINE_WINDOW || routeData.length != 0
        ) revert InvalidConfiguration();
        if (
            argusFactory.codehash != argusFactoryCodeHash || universalRouter.codehash != universalRouterCodeHash
                || canonicalArcBot.codehash != canonicalArcBotCodeHash || canonicalHook.codehash != canonicalHookCodeHash
        ) {
            revert InvalidConfiguration();
        }

        uint256 nativeBefore = address(this).balance - msg.value;
        uint256 tokenBefore = IERC20NativeBuybackExecutor(canonicalArcBot).balanceOf(address(this));
        _executeCanonicalSwap(amountIn, minArcBotOut, deadline);

        if (address(this).balance != nativeBefore) revert BuybackVerificationFailed();
        arcbotBurned = IERC20NativeBuybackExecutor(canonicalArcBot).balanceOf(address(this)) - tokenBefore;
        if (arcbotBurned < minArcBotOut) revert BuybackVerificationFailed();
        _safeTransfer(canonicalArcBot, burnAddress, arcbotBurned);
    }

    function _executeCanonicalSwap(uint256 amountIn, uint256 minArcBotOut, uint256 deadline) private {
        IArgusFactoryNativeBuybackExecutor.LaunchedToken memory launched =
            IArgusFactoryNativeBuybackExecutor(argusFactory).getLaunchedToken(canonicalArcBot);
        if (
            !launched.exists || launched.token != canonicalArcBot || launched.pairToken != NATIVE_ASSET
                || launched.poolFee != canonicalPoolFee || launched.tickSpacing != canonicalTickSpacing
        ) revert InvalidConfiguration();

        address hook = IArgusFactoryNativeBuybackExecutor(argusFactory).memeHook();
        if (hook != canonicalHook || hook.codehash != canonicalHookCodeHash) revert InvalidConfiguration();

        PoolKey memory poolKey = PoolKey({
            currency0: NATIVE_ASSET,
            currency1: canonicalArcBot,
            fee: launched.poolFee,
            tickSpacing: launched.tickSpacing,
            hooks: hook
        });
        ExactInputSingleParams memory swap = ExactInputSingleParams({
            poolKey: poolKey,
            zeroForOne: true,
            amountIn: uint128(amountIn),
            amountOutMinimum: uint128(minArcBotOut),
            minHopPriceX36: 0,
            hookData: bytes("")
        });

        bytes[] memory actionParameters = new bytes[](3);
        actionParameters[0] = abi.encode(swap);
        actionParameters[1] = abi.encode(canonicalArcBot, minArcBotOut);
        actionParameters[2] = abi.encode(NATIVE_ASSET, amountIn);
        bytes[] memory routerInputs = new bytes[](1);
        routerInputs[0] = abi.encode(V4_ACTIONS, actionParameters);

        IUniversalRouterNativeBuybackExecutor(universalRouter).execute{value: amountIn}(
            UNIVERSAL_ROUTER_V4_SWAP, routerInputs, deadline
        );
    }

    function _safeTransfer(address asset, address recipient, uint256 amount) private {
        (bool ok, bytes memory result) =
            asset.call(abi.encodeCall(IERC20NativeBuybackExecutor.transfer, (recipient, amount)));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
}
