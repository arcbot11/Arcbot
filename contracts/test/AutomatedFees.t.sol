// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/ArcBotFeeControl.sol";
import "../src/ArcBotFeeVault.sol";
import "../src/ArcBotFeeVaultFactory.sol";
import "../src/ArcBotBuybackAdapter.sol";
import "../src/ArcBotNativeBuybackExecutor.sol";
import "../src/ArcBotPairedBuybackExecutor.sol";

interface Vm {
    function deal(address account, uint256 balance) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 selector) external;
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
}

contract MockToken {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract MockPairedHook {}

contract MockPairedControl {
    address public admin;
    bool public processingEnabled;
    constructor(address admin_) { admin = admin_; }
    function setProcessingEnabled(bool enabled) external { processingEnabled = enabled; }
}

contract MockPairedWeth {
    mapping(address => uint256) public balanceOf;
    receive() external payable {}
    function mint(address recipient, uint256 amount) external { balanceOf[recipient] += amount; }
    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "weth balance");
        balanceOf[msg.sender] -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "weth withdraw");
    }
}

contract MockPairedV3Router {
    MockToken public immutable pair;
    MockPairedWeth public immutable weth;
    uint256 public immutable nativeOut;
    constructor(MockToken pair_, MockPairedWeth weth_, uint256 nativeOut_) {
        pair = pair_; weth = weth_; nativeOut = nativeOut_;
    }
    function exactInputSingle(IV3RouterPairedBuybackExecutor.ExactInputSingleParams calldata params)
        external returns (uint256 amountOut)
    {
        require(params.tokenIn == address(pair) && params.tokenOut == address(weth), "v3 tokens");
        require(params.amountOutMinimum <= nativeOut && params.recipient == msg.sender, "v3 bounds");
        pair.transferFrom(msg.sender, address(this), params.amountIn);
        weth.mint(msg.sender, nativeOut);
        return nativeOut;
    }
}

contract MockPairedFactory {
    mapping(address => IArgusFactoryPairedBuybackExecutor.LaunchedToken) private launches;
    address public memeHook;
    constructor(address hook) { memeHook = hook; }
    function setGraduatedNativeLaunch(address token, uint24 fee, int24 spacing) external {
        launches[token] = IArgusFactoryPairedBuybackExecutor.LaunchedToken({
            token: token, curve: address(1), deployer: address(this), creatorFeeRecipient: address(this),
            pairToken: address(0), graduationThreshold: 0, poolFee: fee, tickSpacing: spacing,
            creatorTaxBps: 0, buybackEnabled: false, phase: 2, sweptQuote: 0,
            sweptTokens: 0, sweptAt: 0, exists: true
        });
    }
    function getLaunchedToken(address token)
        external view returns (IArgusFactoryPairedBuybackExecutor.LaunchedToken memory) {
        return launches[token];
    }
}

contract MockPairedPermit2 {
    function approve(address, address, uint160, uint48) external {}
    function pull(address token, address owner, address recipient, uint256 amount) external {
        MockToken(token).transferFrom(owner, recipient, amount);
    }
}

contract MockPairedUniversalRouter {
    MockToken public immutable pair;
    MockToken public immutable arcbot;
    MockPairedPermit2 public immutable permit2;
    uint256 public immutable pairAmount;
    uint256 public immutable nativeOut;
    uint256 public immutable arcbotOut;

    constructor(MockToken pair_, MockToken arcbot_, MockPairedPermit2 permit2_, uint256 pairAmount_, uint256 nativeOut_, uint256 arcbotOut_) payable {
        pair = pair_; arcbot = arcbot_; permit2 = permit2_;
        pairAmount = pairAmount_; nativeOut = nativeOut_; arcbotOut = arcbotOut_;
    }
    function execute(bytes calldata, bytes[] calldata, uint256) external payable {
        if (msg.value == 0) {
            permit2.pull(address(pair), msg.sender, address(this), pairAmount);
            (bool ok,) = payable(msg.sender).call{value: nativeOut}("");
            require(ok, "native output");
        } else {
            require(msg.value == nativeOut, "native input");
            arcbot.mint(msg.sender, arcbotOut);
        }
    }
}

contract MockEscrow {
    mapping(address => uint256) public nativeBalance;
    mapping(address => mapping(address => uint256)) public tokenBalance;

    function creditNative(address recipient) external payable {
        nativeBalance[recipient] += msg.value;
    }

    function creditToken(address recipient, address asset, uint256 amount) external {
        MockToken(asset).transferFrom(msg.sender, address(this), amount);
        tokenBalance[recipient][asset] += amount;
    }

    function balanceOf(address recipient) external view returns (uint256) {
        return nativeBalance[recipient];
    }

    function balanceOfToken(address recipient, address asset) external view returns (uint256) {
        return tokenBalance[recipient][asset];
    }

    function claim() external {
        uint256 amount = nativeBalance[msg.sender];
        nativeBalance[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "native claim");
    }

    function claimToken(address asset) external {
        uint256 amount = tokenBalance[msg.sender][asset];
        tokenBalance[msg.sender][asset] = 0;
        require(MockToken(asset).transfer(msg.sender, amount), "token claim");
    }
}

contract MockCurve {
    function sweepFees(uint256) external {}
}

contract MockArgusFactory {
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
    mapping(address => address) public recipientOf;
    mapping(address => LaunchedToken) private launches;
    uint256 public pendingHookFees;

    function setLaunch(address token, address curve, address recipient, address pairToken, uint8 phase) external {
        recipientOf[token] = recipient;
        LaunchedToken storage launched = launches[token];
        launched.token = token;
        launched.curve = curve;
        launched.deployer = msg.sender;
        launched.creatorFeeRecipient = recipient;
        launched.pairToken = pairToken;
        launched.phase = phase;
        launched.exists = true;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory) {
        return launches[token];
    }

    function transferCreatorFeeRecipient(address token, address recipient) external {
        require(recipientOf[token] == msg.sender, "not recipient");
        recipientOf[token] = recipient;
        launches[token].creatorFeeRecipient = recipient;
    }

    function memeHook() external view returns (address) {
        return address(this);
    }

    function setPendingHookFees(uint256 amount) external {
        pendingHookFees = amount;
    }

    function pendingFees(bytes32, address currency) external view returns (uint256) {
        return currency == address(0) ? pendingHookFees : 0;
    }

    function pendingCreatorTax(bytes32, address) external pure returns (uint256) {
        return 0;
    }

    function sweepPoolFees(bytes32, uint256, uint256) external {
        pendingHookFees = 0;
    }
}

contract MockRouter {
    function swapNative(address output, address recipient, uint256 amountOut) external payable {
        MockToken(output).mint(recipient, amountOut);
    }

    function swapToken(address input, address output, address recipient, uint256 amountIn, uint256 amountOut) external {
        MockToken(input).transferFrom(msg.sender, address(this), amountIn);
        MockToken(output).mint(recipient, amountOut);
    }

    function executeBuyback(
        address pairAsset,
        uint256 amountIn,
        address output,
        address recipient,
        uint256,
        uint256,
        bytes calldata routeData
    ) external payable returns (uint256 amountOut) {
        amountOut = abi.decode(routeData, (uint256));
        if (pairAsset == address(0)) require(msg.value == amountIn, "native amount");
        else MockToken(pairAsset).transferFrom(msg.sender, address(this), amountIn);
        MockToken(output).mint(recipient, amountOut);
    }
}

contract MockNativeArgusFactory {
    IArgusFactoryNativeBuybackExecutor.LaunchedToken private launched;
    address public memeHook;

    constructor(address token, address hook) {
        memeHook = hook;
        launched.token = token;
        launched.pairToken = address(0);
        // Argus graduated pools use a zero Uniswap core fee; the hook
        // charges and accounts for the protocol fee.
        launched.poolFee = 0;
        launched.phase = 2;
        launched.tickSpacing = 200;
        launched.exists = true;
    }

    function getLaunchedToken(address) external view returns (IArgusFactoryNativeBuybackExecutor.LaunchedToken memory) {
        return launched;
    }

    function setPoolConfiguration(uint24 fee, int24 tickSpacing) external {
        launched.poolFee = fee;
        launched.tickSpacing = tickSpacing;
    }

    function setMemeHook(address next) external {
        memeHook = next;
    }
}

contract MockUniversalRouter {
    MockToken private immutable output;
    uint256 public amountOut;

    constructor(MockToken output_) {
        output = output_;
    }

    function setAmountOut(uint256 value) external {
        amountOut = value;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256) external payable {
        require(keccak256(commands) == keccak256(hex"10"), "commands");
        require(inputs.length == 1, "inputs");
        (bytes memory actions, bytes[] memory params) = abi.decode(inputs[0], (bytes, bytes[]));
        require(keccak256(actions) == keccak256(hex"060f0c"), "actions");
        require(params.length == 3, "params");
        ArcBotNativeBuybackExecutor.ExactInputSingleParams memory swap =
            abi.decode(params[0], (ArcBotNativeBuybackExecutor.ExactInputSingleParams));
        (address takeCurrency, uint256 minimum) = abi.decode(params[1], (address, uint256));
        (address settleCurrency, uint256 maximum) = abi.decode(params[2], (address, uint256));
        require(
            swap.poolKey.currency0 == address(0) && swap.poolKey.currency1 == address(output)
                && swap.poolKey.fee == 0 && swap.poolKey.tickSpacing == 200 && swap.poolKey.hooks != address(0)
                && swap.zeroForOne && swap.amountIn == msg.value && swap.amountOutMinimum == minimum
                && swap.minHopPriceX36 == 0 && swap.hookData.length == 0,
            "swap"
        );
        require(takeCurrency == address(output) && minimum > 0, "take");
        require(settleCurrency == address(0) && maximum == msg.value, "settle");
        output.mint(msg.sender, amountOut);
    }
}

contract MockNativeExecutorAdapter {
    function callExecutor(
        ArcBotNativeBuybackExecutor executor,
        uint256 amountIn,
        address arcbot,
        uint256 minimum,
        uint256 deadline,
        bytes calldata routeData
    ) external payable returns (uint256) {
        return executor.executeBuyback{value: msg.value}(
            address(0), amountIn, arcbot, 0x000000000000000000000000000000000000dEaD, minimum, deadline, routeData
        );
    }
}

contract AutomatedFeesTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant KEEPER = address(0xBEEF);
    address private constant GUARDIAN = address(0xCAFE);
    uint256 private constant QUOTE_AUTHORIZER_KEY = 0xD00D;
    address private constant BENEFICIARY = address(0xB0B);
    address private constant NEXT_BENEFICIARY = address(0xA11CE);
    address private constant BURN = 0x000000000000000000000000000000000000dEaD;

    ArcBotFeeControl private control;
    ArcBotFeeVaultFactory private factory;
    ArcBotBuybackAdapter private adapter;
    ArcBotFeeVault private vault;
    MockToken private launchedToken;
    MockToken private arcbot;
    MockToken private pairToken;
    MockEscrow private escrow;
    MockCurve private curve;
    MockArgusFactory private argusFactory;
    MockRouter private router;
    address private quoteAuthorizer;

    function setUp() public {
        vm.deal(address(this), 100 ether);
        launchedToken = new MockToken();
        arcbot = new MockToken();
        pairToken = new MockToken();
        escrow = new MockEscrow();
        curve = new MockCurve();
        argusFactory = new MockArgusFactory();
        router = new MockRouter();
        quoteAuthorizer = vm.addr(QUOTE_AUTHORIZER_KEY);
        control = new ArcBotFeeControl(address(this), GUARDIAN, KEEPER, quoteAuthorizer);
        ArcBotFeeVault implementation = new ArcBotFeeVault();
        factory = new ArcBotFeeVaultFactory(
            address(implementation), address(control), address(argusFactory), address(escrow), address(arcbot)
        );
        adapter = new ArcBotBuybackAdapter(address(factory), address(control), address(arcbot));
        control.setExecutionAdapter(address(adapter));
        ArcBotFeeVault.Initialization memory init = ArcBotFeeVault.Initialization({
            token: address(launchedToken),
            curve: address(curve),
            pairAsset: address(0),
            argusFactory: address(argusFactory),
            feeEscrow: address(escrow),
            arcbot: address(arcbot),
            controller: BENEFICIARY,
            beneficiary: BENEFICIARY,
            feeControl: address(control)
        });
        bytes32 vaultSalt = bytes32(uint256(1));
        address predictedVault = factory.predictVaultAddress(vaultSalt);
        argusFactory.setLaunch(address(launchedToken), address(curve), predictedVault, address(0), 2);
        vault = ArcBotFeeVault(payable(factory.deployVault(vaultSalt, init)));
    }

    function _activateNativeRoute() private {
        control.pauseProcessing();
        adapter.setExecutor(address(router), true);
        control.enableProcessing();
    }

    function _nativeRoute(uint256 amountOut) private pure returns (bytes memory) {
        return abi.encode(amountOut);
    }

    function _authorizationSignature(
        ArcBotFeeVault targetVault,
        uint256 maxBuybackAmount,
        uint256 minimum,
        uint256 deadline,
        address target,
        bytes memory routeData
    ) private returns (bytes memory signature) {
        bytes32 digest = targetVault.executionAuthorizationDigest(
            maxBuybackAmount,
            minimum,
            0,
            deadline,
            target,
            keccak256(routeData),
            targetVault.executionNonce()
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(QUOTE_AUTHORIZER_KEY, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function _execution(
        ArcBotFeeVault targetVault,
        uint256 maxBuybackAmount,
        uint256 minimum,
        uint256 deadline,
        address target,
        bytes memory routeData,
        bool authorized
    ) private returns (ArcBotFeeVault.ExecutionAuthorization memory execution) {
        execution = ArcBotFeeVault.ExecutionAuthorization({
            maxBuybackAmount: maxBuybackAmount,
            minArcBotOut: minimum,
            minSweepBuybackTokensOut: 0,
            deadline: deadline,
            routeTarget: target,
            routeData: routeData,
            quoteSignature: authorized
                ? _authorizationSignature(targetVault, maxBuybackAmount, minimum, deadline, target, routeData)
                : bytes("")
        });
    }

    function _deployTokenPairedVault(address pairedLaunchToken) private returns (ArcBotFeeVault tokenVault) {
        ArcBotFeeVault.Initialization memory init = ArcBotFeeVault.Initialization({
            token: pairedLaunchToken,
            curve: address(curve),
            pairAsset: address(pairToken),
            argusFactory: address(argusFactory),
            feeEscrow: address(escrow),
            arcbot: address(arcbot),
            controller: BENEFICIARY,
            beneficiary: BENEFICIARY,
            feeControl: address(control)
        });
        bytes32 vaultSalt = bytes32(uint256(2));
        address predictedVault = factory.predictVaultAddress(vaultSalt);
        argusFactory.setLaunch(init.token, address(curve), predictedVault, address(pairToken), 0);
        tokenVault = ArcBotFeeVault(payable(factory.deployVault(vaultSalt, init)));
    }

    function testProcessingStartsDisabled() public view {
        require(!control.processingEnabled(), "processing enabled unexpectedly");
    }

    function testCannotEnableWithoutConfiguredAdapter() public {
        ArcBotFeeControl emptyControl = new ArcBotFeeControl(address(this), GUARDIAN, KEEPER, quoteAuthorizer);
        vm.expectRevert(ArcBotFeeControl.InvalidConfiguration.selector);
        emptyControl.enableProcessing();
    }

    function testInitialAdapterCanBeConfiguredWhilePaused() public {
        ArcBotFeeControl nextControl = new ArcBotFeeControl(address(this), GUARDIAN, KEEPER, quoteAuthorizer);
        nextControl.setExecutionAdapter(address(adapter));
        require(nextControl.executionAdapter() == address(adapter), "adapter not configured");
    }

    function testRouteActivationRequiresDisabledProcessing() public {
        adapter.setExecutor(address(router), true);
        control.enableProcessing();
        vm.expectRevert(ArcBotBuybackAdapter.InvalidConfiguration.selector);
        adapter.setExecutor(address(router), true);
        control.pauseProcessing();
        adapter.setExecutor(address(router), true);
        require(adapter.allowedExecutor(address(router)), "executor inactive");
        require(
            adapter.allowedExecutorCodeHash(address(router)) == address(router).codehash, "executor codehash not pinned"
        );
    }

    function testGuardianCanPauseButCannotResume() public {
        control.enableProcessing();
        vm.prank(GUARDIAN);
        control.pauseProcessing();
        require(!control.processingEnabled(), "guardian pause failed");
        vm.prank(GUARDIAN);
        vm.expectRevert(ArcBotFeeControl.Unauthorized.selector);
        control.enableProcessing();
    }

    function testAdminTransferRequiresAcceptance() public {
        control.proposeAdmin(NEXT_BENEFICIARY);
        vm.prank(NEXT_BENEFICIARY);
        control.acceptAdmin();
        require(control.admin() == NEXT_BENEFICIARY, "admin not transferred");
        vm.expectRevert(ArcBotFeeControl.Unauthorized.selector);
        control.setKeeper(address(123));
    }

    function testPendingAdminCannotBeAssignedAnotherPrivilegedRole() public {
        control.proposeAdmin(NEXT_BENEFICIARY);
        vm.expectRevert(ArcBotFeeControl.InvalidConfiguration.selector);
        control.setKeeper(NEXT_BENEFICIARY);
        vm.expectRevert(ArcBotFeeControl.InvalidConfiguration.selector);
        control.setPauseGuardian(NEXT_BENEFICIARY);
        vm.expectRevert(ArcBotFeeControl.InvalidConfiguration.selector);
        control.setQuoteAuthorizer(NEXT_BENEFICIARY);
    }

    function testAdminCandidateCannotAlreadyHoldPrivilegedRole() public {
        vm.expectRevert(ArcBotFeeControl.InvalidConfiguration.selector);
        control.proposeAdmin(KEEPER);
        vm.expectRevert(ArcBotFeeControl.InvalidConfiguration.selector);
        control.proposeAdmin(GUARDIAN);
    }

    function testOnlyKeeperCanProcess() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        vm.expectRevert(ArcBotFeeVault.Unauthorized.selector);
        vault.processFees(_execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(1_000), false));
    }

    function testKeeperCannotProcessWithoutIndependentAuthorization() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.Unauthorized.selector);
        vault.processFees(_execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(1_000), false));
        require(escrow.nativeBalance(address(vault)) == 10_000, "unauthorized quote changed escrow");
    }

    function testAuthorizationIsBoundToExactEnvelopeAndSingleUse() public {
        _activateNativeRoute();
        uint256 deadline = block.timestamp + 60;
        bytes memory route = _nativeRoute(1_000);
        escrow.creditNative{value: 20_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 1_000, 900, deadline, address(router), route, true);
        execution.minArcBotOut = 1;
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.Unauthorized.selector);
        vault.processFees(execution);
        execution.minArcBotOut = 900;
        vm.prank(KEEPER);
        vault.processFees(execution);
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.Unauthorized.selector);
        vault.processFees(execution);
    }

    function testAuthorizedMaximumCapsActualBuyback() public {
        _activateNativeRoute();
        uint256 deadline = block.timestamp + 60;
        bytes memory route = _nativeRoute(1_000);
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 499, 900, deadline, address(router), route, true);
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.InvalidConfiguration.selector);
        vault.processFees(execution);
        require(escrow.nativeBalance(address(vault)) == 10_000, "maximum changed escrow");
    }

    function testUnapprovedRouteRevertsEverything() public {
        control.enableProcessing();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(1_000), true);
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotBuybackAdapter.ExecutorNotAllowed.selector);
        vault.processFees(execution);
        require(escrow.nativeBalance(address(vault)) == 10_000, "unapproved route changed escrow");
    }

    function testDirectAdapterCallIsRejected() public {
        _activateNativeRoute();
        vm.expectRevert(ArcBotBuybackAdapter.Unauthorized.selector);
        adapter.buyAndBurn{value: 500}(
            address(0), 500, address(arcbot), BURN, 900, block.timestamp + 60, address(router), _nativeRoute(1_000)
        );
    }

    function testProcessesExactNinetyFiveFiveAndDelivers() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(1_000), true);
        vm.prank(KEEPER);
        (uint256 gross, uint256 burned) =
            vault.processFees(execution);
        require(gross == 10_000, "gross");
        require(burned == 1_000, "burned");
        require(vault.claimable(BENEFICIARY, address(0)) == 9_500, "beneficiary allocation");
        require(arcbot.balanceOf(BURN) == 1_000, "burn balance");
        uint256 beforeBalance = BENEFICIARY.balance;
        vm.prank(KEEPER);
        vault.deliverBeneficiaryAllocation(BENEFICIARY, address(0), 9_500);
        require(BENEFICIARY.balance - beforeBalance == 9_500, "delivery");
    }

    function testRoundingAlwaysStaysWithBeneficiary() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_001}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(10), true);
        vm.prank(KEEPER);
        vault.processFees(execution);
        require(vault.claimable(BENEFICIARY, address(0)) == 9_501, "rounding allocation");
        require(vault.lifetimeBuybackSpent(address(0)) == 500, "rounded buyback");
    }

    function testTinyAccrualWaitsForMinimumThreshold() public {
        control.enableProcessing();
        escrow.creditNative{value: 19}(address(vault));
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.NothingClaimed.selector);
        vault.processFees(_execution(vault, 0, 0, block.timestamp + 60, address(0), bytes(""), false));
        require(escrow.nativeBalance(address(vault)) == 19, "tiny accrual was claimed");
    }

    function testGraduatedLaunchSkipsCurveSweepAndStillClaims() public {
        argusFactory.setLaunch(address(launchedToken), address(curve), address(vault), address(0), 2);
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(10), true);
        vm.prank(KEEPER);
        (uint256 gross,) =
            vault.processFees(execution);
        require(gross == 10_000, "graduated claim");
    }

    function testGraduatedHookSweepUsesCanonicalPoolAndRecordsMarker() public {
        control.enableProcessing();
        argusFactory.setPendingHookFees(1);
        vm.prank(KEEPER);
        vault.sweepGraduatedFees(0, 0);
        require(argusFactory.pendingHookFees() == 0, "hook fees were not swept");
        require(vault.lastGraduatedSweepBlock() == block.number, "graduated sweep marker missing");
    }

    function testReassignmentAllowsUnsweptGraduatedFees() public {
        control.enableProcessing();
        argusFactory.setPendingHookFees(1);
        vm.prank(BENEFICIARY);
        vault.settleAndReassign(
            NEXT_BENEFICIARY,
            NEXT_BENEFICIARY,
            _execution(vault, 0, 0, block.timestamp + 60, address(0), bytes(""), false)
        );
        require(vault.controller() == NEXT_BENEFICIARY, "controller was not reassigned");
        require(argusFactory.pendingHookFees() == 1, "pending Argus fees were modified");
    }

    function testPreGraduationProcessingRequiresSeparateSweep() public {
        argusFactory.setLaunch(address(launchedToken), address(curve), address(vault), address(0), 0);
        control.enableProcessing();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(10), true);
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.PreGraduationProcessingRequiresSeparateSweep.selector);
        vault.processFees(execution);
        require(escrow.nativeBalance(address(vault)) == 10_000, "pre-graduation escrow changed");
    }

    function testBondingCurveSweepThenProcessUsesConfirmedEscrow() public {
        argusFactory.setLaunch(address(launchedToken), address(curve), address(vault), address(0), 0);
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(KEEPER);
        vault.sweepCurveFees(0);
        require(vault.lastCurveSweepBlock() == block.number, "sweep marker missing");
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(10), true);
        vm.prank(KEEPER);
        (uint256 gross,) = vault.processFees(execution);
        require(gross == 10_000, "bonding curve gross mismatch");
        require(vault.lastCurveSweepBlock() == 0, "sweep marker not consumed");
    }

    function testGraduationBetweenSweepAndProcessContinuesSafely() public {
        argusFactory.setLaunch(address(launchedToken), address(curve), address(vault), address(0), 0);
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(KEEPER);
        vault.sweepCurveFees(0);
        argusFactory.setLaunch(address(launchedToken), address(curve), address(vault), address(0), 2);
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(10), true);
        vm.prank(KEEPER);
        (uint256 gross,) = vault.processFees(execution);
        require(gross == 10_000, "graduation transition lost fees");
    }

    function testIntermediateGraduationPhaseWaitsWithoutClaiming() public {
        argusFactory.setLaunch(address(launchedToken), address(curve), address(vault), address(0), 1);
        control.enableProcessing();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 1, block.timestamp + 60, address(router), _nativeRoute(10), true);
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.InvalidConfiguration.selector);
        vault.processFees(execution);
        require(escrow.nativeBalance(address(vault)) == 10_000, "transition phase claimed fees");
    }

    function testLiveArgusBindingMismatchBlocksProcessing() public {
        argusFactory.setLaunch(address(launchedToken), address(curve), NEXT_BENEFICIARY, address(0), 0);
        control.enableProcessing();
        escrow.creditNative{value: 19}(address(vault));
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.InvalidConfiguration.selector);
        vault.processFees(_execution(vault, 0, 0, block.timestamp + 60, address(0), bytes(""), false));
    }

    function testErc20PairEnrollmentIsSupported() public {
        address pairedLaunchToken = address(new MockToken());
        ArcBotFeeVault pairedVault = _deployTokenPairedVault(pairedLaunchToken);
        require(pairedVault.pairAsset() == address(pairToken), "pair asset missing");
    }

    function testVaultInitializationRejectsMismatchedLiveLaunch() public {
        MockToken otherToken = new MockToken();
        ArcBotFeeVault.Initialization memory init = ArcBotFeeVault.Initialization({
            token: address(otherToken), curve: address(curve), pairAsset: address(0),
            argusFactory: address(argusFactory), feeEscrow: address(escrow), arcbot: address(arcbot),
            controller: BENEFICIARY, beneficiary: BENEFICIARY, feeControl: address(control)
        });
        bytes32 salt = bytes32(uint256(4));
        address predictedVault = factory.predictVaultAddress(salt);
        argusFactory.setLaunch(address(otherToken), address(0xBAD), predictedVault, address(0), 0);
        vm.expectRevert(ArcBotFeeVault.InvalidConfiguration.selector);
        factory.deployVault(salt, init);
    }

    function testApprovedLegacyArgusStackCanDeployVaultWhilePaused() public {
        MockArgusFactory legacyFactory = new MockArgusFactory();
        MockEscrow legacyEscrow = new MockEscrow();
        MockToken legacyToken = new MockToken();
        ArcBotFeeVault.Initialization memory init = ArcBotFeeVault.Initialization({
            token: address(legacyToken), curve: address(curve), pairAsset: address(0),
            argusFactory: address(legacyFactory), feeEscrow: address(legacyEscrow), arcbot: address(arcbot),
            controller: BENEFICIARY, beneficiary: BENEFICIARY, feeControl: address(control)
        });
        bytes32 salt = bytes32(uint256(5));
        address predictedVault = factory.predictVaultAddress(salt);
        legacyFactory.setLaunch(address(legacyToken), address(curve), predictedVault, address(0), 0);
        vm.expectRevert(ArcBotFeeVaultFactory.InvalidConfiguration.selector);
        factory.deployVault(salt, init);
        factory.setArgusStack(address(legacyFactory), address(legacyEscrow), true);
        address deployed = factory.deployVault(salt, init);
        require(factory.vaultOf(address(legacyToken)) == deployed, "legacy stack vault missing");
    }

    function testGlobalPauseBlocksProcessing() public {
        _activateNativeRoute();
        control.pauseProcessing();
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.ProcessingPaused.selector);
        vault.processFees(_execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(1_000), false));
    }

    function testInsufficientBurnRevertsClaimAtomically() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(899), true);
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotBuybackAdapter.BuybackVerificationFailed.selector);
        vault.processFees(execution);
        require(escrow.nativeBalance(address(vault)) == 10_000, "escrow changed");
        require(vault.claimable(BENEFICIARY, address(0)) == 0, "allocation persisted");
    }

    function testExpiredDeadlineRevertsBeforeClaim() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotFeeVault.InvalidConfiguration.selector);
        vault.processFees(_execution(vault, 500, 900, block.timestamp - 1, address(router), _nativeRoute(1_000), false));
        require(escrow.nativeBalance(address(vault)) == 10_000, "expired request changed escrow");
    }

    function testExcessivelyLongDeadlineRevertsBeforeClaim() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution = _execution(
            vault, 500, 900, block.timestamp + 10 minutes + 1, address(router), _nativeRoute(1_000), true
        );
        vm.prank(KEEPER);
        vm.expectRevert(ArcBotBuybackAdapter.InvalidConfiguration.selector);
        vault.processFees(execution);
        require(escrow.nativeBalance(address(vault)) == 10_000, "long deadline changed escrow");
    }

    function testReassignmentPreservesPreviouslyAccruedOwner() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(1_000), true);
        vm.prank(KEEPER);
        vault.processFees(execution);
        vm.prank(BENEFICIARY);
        vault.settleAndReassign(
            NEXT_BENEFICIARY,
            NEXT_BENEFICIARY,
            _execution(vault, 0, 0, block.timestamp + 60, address(0), bytes(""), false)
        );
        require(vault.claimable(BENEFICIARY, address(0)) == 9_500, "old allocation moved");
        require(vault.beneficiary() == NEXT_BENEFICIARY, "new beneficiary");
        vm.expectRevert(ArcBotFeeVault.Unauthorized.selector);
        vault.settleAndReassign(
            address(this),
            address(this),
            _execution(vault, 0, 0, block.timestamp + 60, address(0), bytes(""), false)
        );
    }

    function testReassignmentSettlesPendingFeesForPreviousBeneficiary() public {
        _activateNativeRoute();
        escrow.creditNative{value: 10_000}(address(vault));
        ArcBotFeeVault.ExecutionAuthorization memory execution =
            _execution(vault, 500, 900, block.timestamp + 60, address(router), _nativeRoute(1_000), true);
        vm.prank(BENEFICIARY);
        vault.settleAndReassign(
            NEXT_BENEFICIARY,
            NEXT_BENEFICIARY,
            execution
        );
        require(vault.claimable(BENEFICIARY, address(0)) == 9_500, "old beneficiary lost pending fees");
        require(vault.claimable(NEXT_BENEFICIARY, address(0)) == 0, "new beneficiary received old fees");
        require(vault.controller() == NEXT_BENEFICIARY, "controller not transferred");
    }

    function testExitRequiresPauseAndTransfersArgusRights() public {
        vm.expectRevert(ArcBotFeeVault.ProcessingPaused.selector);
        vm.prank(BENEFICIARY);
        vault.exit(NEXT_BENEFICIARY);
        vm.prank(BENEFICIARY);
        vault.pause();
        vm.prank(BENEFICIARY);
        vault.exit(NEXT_BENEFICIARY);
        require(argusFactory.recipientOf(address(launchedToken)) == NEXT_BENEFICIARY, "recipient not transferred");
        require(!vault.active(), "vault active");
    }

    function testCurrentControllerCanPauseAndExitWithoutPlatformAction() public {
        vm.prank(BENEFICIARY);
        vault.pause();
        vm.prank(BENEFICIARY);
        vault.exit(NEXT_BENEFICIARY);
        require(argusFactory.recipientOf(address(launchedToken)) == NEXT_BENEFICIARY, "controller exit failed");
    }

    function testPausedEmergencyExitSettlesPendingFeesWithoutBuyback() public {
        escrow.creditNative{value: 10_000}(address(vault));
        vm.prank(BENEFICIARY);
        vault.pause();
        vm.prank(BENEFICIARY);
        vault.exit(NEXT_BENEFICIARY);
        require(vault.claimable(BENEFICIARY, address(0)) == 10_000, "emergency allocation missing");
        require(vault.lifetimeBuybackSpent(address(0)) == 0, "emergency exit attempted buyback");
        require(argusFactory.recipientOf(address(launchedToken)) == NEXT_BENEFICIARY, "recipient not transferred");
    }
}

contract NativeBuybackExecutorTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant BURN = 0x000000000000000000000000000000000000dEaD;

    MockToken private arcbot;
    MockNativeExecutorAdapter private adapter;
    MockNativeArgusFactory private factory;
    MockUniversalRouter private router;
    ArcBotNativeBuybackExecutor private executor;

    function setUp() public {
        vm.deal(address(this), 10 ether);
        arcbot = new MockToken();
        adapter = new MockNativeExecutorAdapter();
        MockCurve hook = new MockCurve();
        factory = new MockNativeArgusFactory(address(arcbot), address(hook));
        router = new MockUniversalRouter(arcbot);
        executor = new ArcBotNativeBuybackExecutor(address(adapter), address(factory), address(router), address(arcbot));
    }

    function testNativeExecutorUsesCanonicalRouteAndBurnsActualOutput() public {
        router.setAmountOut(2_000);
        uint256 burned = adapter.callExecutor{value: 500}(
            executor, 500, address(arcbot), 1_900, block.timestamp + 60, bytes("")
        );
        require(burned == 2_000, "reported burn");
        require(arcbot.balanceOf(BURN) == 2_000, "burn balance");
        require(address(executor).balance == 0, "native retained");
        require(arcbot.balanceOf(address(executor)) == 0, "token retained");
    }

    function testNativeExecutorRejectsArbitraryRouteData() public {
        router.setAmountOut(2_000);
        vm.expectRevert(ArcBotNativeBuybackExecutor.InvalidConfiguration.selector);
        adapter.callExecutor{value: 500}(
            executor, 500, address(arcbot), 1_900, block.timestamp + 60, hex"01"
        );
    }

    function testNativeExecutorRejectsDirectCaller() public {
        vm.expectRevert(ArcBotNativeBuybackExecutor.Unauthorized.selector);
        executor.executeBuyback{value: 500}(
            address(0), 500, address(arcbot), BURN, 1, block.timestamp + 60, bytes("")
        );
    }

    function testNativeExecutorRevertsBelowMinimum() public {
        router.setAmountOut(1_899);
        vm.expectRevert(ArcBotNativeBuybackExecutor.BuybackVerificationFailed.selector);
        adapter.callExecutor{value: 500}(
            executor, 500, address(arcbot), 1_900, block.timestamp + 60, bytes("")
        );
        require(arcbot.balanceOf(BURN) == 0, "partial burn persisted");
    }


    function testNativeExecutorRejectsExcessivelyLongDeadline() public {
        router.setAmountOut(2_000);
        vm.expectRevert(ArcBotNativeBuybackExecutor.InvalidConfiguration.selector);
        adapter.callExecutor{value: 500}(
            executor, 500, address(arcbot), 1_900, block.timestamp + 10 minutes + 1, bytes("")
        );
    }

    function testNativeExecutorRejectsChangedFactoryPoolConfiguration() public {
        router.setAmountOut(2_000);
        factory.setPoolConfiguration(3_000, 60);
        vm.expectRevert(ArcBotNativeBuybackExecutor.InvalidConfiguration.selector);
        adapter.callExecutor{value: 500}(
            executor, 500, address(arcbot), 1_900, block.timestamp + 60, bytes("")
        );
    }

    function testNativeExecutorRejectsChangedFactoryHook() public {
        router.setAmountOut(2_000);
        factory.setMemeHook(address(new MockCurve()));
        vm.expectRevert(ArcBotNativeBuybackExecutor.InvalidConfiguration.selector);
        adapter.callExecutor{value: 500}(
            executor, 500, address(arcbot), 1_900, block.timestamp + 60, bytes("")
        );
    }
}

contract PairedBuybackExecutorTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function testPairedExecutorPullsApprovedAssetAndBurnsSecondHopOutput() public {
        vm.deal(address(this), 10 ether);
        MockToken pair = new MockToken();
        MockToken arcbot = new MockToken();
        MockPairedHook hook = new MockPairedHook();
        MockPairedFactory factory = new MockPairedFactory(address(hook));
        factory.setGraduatedNativeLaunch(address(pair), 3_000, 60);
        factory.setGraduatedNativeLaunch(address(arcbot), 3_000, 60);
        MockPairedPermit2 permit2 = new MockPairedPermit2();
        MockPairedControl control = new MockPairedControl(address(this));
        MockPairedWeth weth = new MockPairedWeth();
        MockPairedHook v3Router = new MockPairedHook();
        MockPairedUniversalRouter router = new MockPairedUniversalRouter{value: 2 ether}(
            pair, arcbot, permit2, 1_000, 1 ether, 25_000
        );
        ArcBotPairedBuybackExecutor executor = new ArcBotPairedBuybackExecutor(
            address(this), address(factory), address(router), address(permit2), address(v3Router), address(weth),
            address(control), address(arcbot)
        );
        executor.configurePairRoute(
            address(pair), ArcBotPairedBuybackExecutor.PairRouteKind.V4Direct, 3_000, 60, address(hook)
        );
        pair.mint(address(this), 1_000);
        pair.approve(address(executor), 1_000);

        uint256 burned = executor.executeBuyback(
            address(pair), 1_000, address(arcbot), DEAD, 24_000,
            block.timestamp + 60, abi.encode(uint256(0.9 ether))
        );

        require(burned == 25_000, "wrong paired burn output");
        require(arcbot.balanceOf(DEAD) == 25_000, "paired output not burned");
        require(pair.balanceOf(address(executor)) == 0, "executor retained pair asset");
        require(pair.balanceOf(address(this)) == 0, "adapter asset was not pulled");
    }


    function testPairedExecutorSupportsConfiguredV3PairRoute() public {
        vm.deal(address(this), 10 ether);
        MockToken pair = new MockToken();
        MockToken arcbot = new MockToken();
        MockPairedHook hook = new MockPairedHook();
        MockPairedFactory factory = new MockPairedFactory(address(hook));
        factory.setGraduatedNativeLaunch(address(arcbot), 0, 200);
        MockPairedPermit2 permit2 = new MockPairedPermit2();
        MockPairedControl control = new MockPairedControl(address(this));
        MockPairedWeth weth = new MockPairedWeth();
        vm.deal(address(weth), 2 ether);
        MockPairedV3Router v3Router = new MockPairedV3Router(pair, weth, 1 ether);
        MockPairedUniversalRouter router = new MockPairedUniversalRouter{value: 2 ether}(
            pair, arcbot, permit2, 1_000, 1 ether, 25_000
        );
        ArcBotPairedBuybackExecutor executor = new ArcBotPairedBuybackExecutor(
            address(this), address(factory), address(router), address(permit2), address(v3Router), address(weth),
            address(control), address(arcbot)
        );
        executor.configurePairRoute(
            address(pair), ArcBotPairedBuybackExecutor.PairRouteKind.V3Direct, 10_000, 0, address(0)
        );
        pair.mint(address(this), 1_000);
        pair.approve(address(executor), 1_000);

        uint256 burned = executor.executeBuyback(
            address(pair), 1_000, address(arcbot), DEAD, 24_000,
            block.timestamp + 60, abi.encode(uint256(0.9 ether))
        );
        require(burned == 25_000, "wrong V3 paired burn output");
        require(arcbot.balanceOf(DEAD) == 25_000, "V3 paired output not burned");
    }

    function testPairRoutesCanOnlyChangeByAdminWhileGloballyPaused() public {
        MockToken pair = new MockToken();
        MockToken arcbot = new MockToken();
        MockPairedHook hook = new MockPairedHook();
        MockPairedFactory factory = new MockPairedFactory(address(hook));
        factory.setGraduatedNativeLaunch(address(arcbot), 0, 200);
        MockPairedPermit2 permit2 = new MockPairedPermit2();
        MockPairedControl control = new MockPairedControl(address(this));
        MockPairedWeth weth = new MockPairedWeth();
        MockPairedHook v3Router = new MockPairedHook();
        MockPairedUniversalRouter router = new MockPairedUniversalRouter(
            pair, arcbot, permit2, 1, 1, 1
        );
        ArcBotPairedBuybackExecutor executor = new ArcBotPairedBuybackExecutor(
            address(this), address(factory), address(router), address(permit2), address(v3Router), address(weth),
            address(control), address(arcbot)
        );
        vm.prank(address(0xBAD));
        vm.expectRevert(ArcBotPairedBuybackExecutor.Unauthorized.selector);
        executor.configurePairRoute(
            address(pair), ArcBotPairedBuybackExecutor.PairRouteKind.V3Direct, 500, 0, address(0)
        );
        control.setProcessingEnabled(true);
        vm.expectRevert(ArcBotPairedBuybackExecutor.InvalidConfiguration.selector);
        executor.configurePairRoute(
            address(pair), ArcBotPairedBuybackExecutor.PairRouteKind.V3Direct, 500, 0, address(0)
        );
    }

    function testPairedExecutorRejectsChangedArcBotPoolConfiguration() public {
        vm.deal(address(this), 10 ether);
        MockToken pair = new MockToken();
        MockToken arcbot = new MockToken();
        MockPairedHook hook = new MockPairedHook();
        MockPairedFactory factory = new MockPairedFactory(address(hook));
        factory.setGraduatedNativeLaunch(address(arcbot), 0, 200);
        factory.setGraduatedNativeLaunch(address(pair), 3_000, 60);
        MockPairedPermit2 permit2 = new MockPairedPermit2();
        MockPairedControl control = new MockPairedControl(address(this));
        MockPairedWeth weth = new MockPairedWeth();
        MockPairedHook v3Router = new MockPairedHook();
        MockPairedUniversalRouter router = new MockPairedUniversalRouter{value: 2 ether}(
            pair, arcbot, permit2, 1_000, 1 ether, 25_000
        );
        ArcBotPairedBuybackExecutor executor = new ArcBotPairedBuybackExecutor(
            address(this), address(factory), address(router), address(permit2), address(v3Router), address(weth),
            address(control), address(arcbot)
        );
        executor.configurePairRoute(
            address(pair), ArcBotPairedBuybackExecutor.PairRouteKind.V4Direct, 3_000, 60, address(hook)
        );
        factory.setGraduatedNativeLaunch(address(arcbot), 3_000, 60);
        pair.mint(address(this), 1_000);
        pair.approve(address(executor), 1_000);
        vm.expectRevert(ArcBotPairedBuybackExecutor.InvalidConfiguration.selector);
        executor.executeBuyback(
            address(pair), 1_000, address(arcbot), DEAD, 24_000,
            block.timestamp + 60, abi.encode(uint256(0.9 ether))
        );
    }
}
