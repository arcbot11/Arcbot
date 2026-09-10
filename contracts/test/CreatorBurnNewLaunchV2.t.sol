// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AutomatedFees.t.sol";
import "./CreatorBurnExecutor.t.sol";
import "../src/ArcBotCreatorBurnVaultFactoryV2.sol";

contract V2HolderRegistry {
    function distributorOf(address) external pure returns (address) { return address(0); }
}

/// @dev Proves that a new launch can bind both vaults before deployment. No
/// post-launch controller transaction exists in this lifecycle.
contract CreatorBurnNewLaunchV2Test {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant KEEPER = address(0xbeef);
    address constant OWNER = address(0x1234);

    ArcBotFeeControl control;
    ArcBotFeeVaultFactory primaryFactory;
    ArcBotCreatorBurnVaultFactoryV2 layerFactory;
    ArcBotCreatorBurnExecutor executor;
    MockEscrow escrow;
    MockArgusFactory argus;
    MockToken token;
    MockToken pair;
    MockToken arcbot;

    function setUp() public {
        token = new MockToken(); pair = new MockToken(); arcbot = new MockToken();
        escrow = new MockEscrow(); argus = new MockArgusFactory();
        control = new ArcBotFeeControl(address(this), address(0xcafe), KEEPER, vm.addr(42));
        primaryFactory = new ArcBotFeeVaultFactory(
            address(new ArcBotFeeVault()), address(control), address(argus), address(escrow), address(arcbot)
        );
        CEPermit permit = new CEPermit();
        executor = new ArcBotCreatorBurnExecutor(address(this), address(argus), address(new CERouter(permit)), address(permit));
        layerFactory = new ArcBotCreatorBurnVaultFactoryV2(
            address(primaryFactory), address(control), address(executor), address(new V2HolderRegistry())
        );
        executor.bindRegistry(address(layerFactory));
    }

    function testNewLaunchIsPreboundAndConfiguredWithoutReassignment() public {
        bytes32 primarySalt = bytes32(uint256(1));
        bytes32 layerSalt = bytes32(uint256(2));
        address primaryAddress = primaryFactory.predictVaultAddress(primarySalt);
        address layerAddress = layerFactory.predictLayerAddress(primaryAddress, OWNER, 5000, layerSalt);
        CECurve curve = new CECurve(CEToken(address(token)), address(pair));
        argus.setLaunch(address(token), address(curve), primaryAddress, address(pair), 0);

        ArcBotFeeVault.Initialization memory init = ArcBotFeeVault.Initialization(
            address(token), address(curve), address(pair), address(argus), address(escrow), address(arcbot),
            layerAddress, layerAddress, address(control)
        );
        address primary = primaryFactory.deployVault(primarySalt, init);
        address layer = layerFactory.create(primary, OWNER, 5000, layerSalt);

        require(primary == primaryAddress && layer == layerAddress);
        require(ArcBotFeeVault(payable(primary)).controller() == layer);
        require(ArcBotFeeVault(payable(primary)).beneficiary() == layer);
        require(ArcBotCreatorBurnVault(payable(layer)).owner() == OWNER);
        require(ArcBotCreatorBurnVault(payable(layer)).selfBurnBps() == 5000);
        require(ArcBotCreatorBurnVault(payable(layer)).active());
        require(layerFactory.layerOf(primary) == layer && layerFactory.isLayer(layer));
    }

    function testOnlyAdminCanCreatePreboundLayer() public {
        bytes32 primarySalt = bytes32(uint256(3));
        bytes32 layerSalt = bytes32(uint256(4));
        address primaryAddress = primaryFactory.predictVaultAddress(primarySalt);
        address layerAddress = layerFactory.predictLayerAddress(primaryAddress, OWNER, 0, layerSalt);
        CECurve curve = new CECurve(CEToken(address(token)), address(pair));
        argus.setLaunch(address(token), address(curve), primaryAddress, address(pair), 0);
        ArcBotFeeVault.Initialization memory init = ArcBotFeeVault.Initialization(
            address(token), address(curve), address(pair), address(argus), address(escrow), address(arcbot),
            layerAddress, layerAddress, address(control)
        );
        primaryFactory.deployVault(primarySalt, init);
        vm.prank(address(0xbad));
        (bool ok,) = address(layerFactory).call(abi.encodeCall(layerFactory.create, (primaryAddress, OWNER, 0, layerSalt)));
        require(!ok);
    }

    function testWrongPredictedOwnerOrPercentageCannotDeploy() public {
        bytes32 primarySalt = bytes32(uint256(5));
        bytes32 layerSalt = bytes32(uint256(6));
        address primaryAddress = primaryFactory.predictVaultAddress(primarySalt);
        address expectedLayer = layerFactory.predictLayerAddress(primaryAddress, OWNER, 5000, layerSalt);
        CECurve curve = new CECurve(CEToken(address(token)), address(pair));
        argus.setLaunch(address(token), address(curve), primaryAddress, address(pair), 0);
        primaryFactory.deployVault(primarySalt, ArcBotFeeVault.Initialization(
            address(token), address(curve), address(pair), address(argus), address(escrow), address(arcbot),
            expectedLayer, expectedLayer, address(control)
        ));
        (bool ok,) = address(layerFactory).call(abi.encodeCall(layerFactory.create, (primaryAddress, OWNER, 4999, layerSalt)));
        require(!ok && layerFactory.layerOf(primaryAddress) == address(0));
    }
}
