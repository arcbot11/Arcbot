// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ArcBotFeeVault.sol";

contract ArcBotFeeVaultFactory {
    address public immutable implementation;
    address public immutable feeControl;
    address public immutable argusFactory;
    address public immutable feeEscrow;
    address public immutable arcbot;
    mapping(address argusFactoryAddress => address approvedEscrow) public approvedFeeEscrow;
    mapping(address token => address vault) public vaultOf;
    mapping(address vault => bool recognized) public isVault;

    event VaultDeployed(address indexed token, address indexed vault, address indexed controller, bytes32 salt);
    event ArgusStackUpdated(address indexed argusFactory, address indexed feeEscrow, bool allowed);

    error Unauthorized();
    error InvalidConfiguration();
    error VaultAlreadyExists();
    error DeploymentFailed();

    constructor(
        address implementation_,
        address feeControl_,
        address argusFactory_,
        address feeEscrow_,
        address arcbot_
    ) {
        if (
            implementation_ == address(0) || feeControl_ == address(0) || argusFactory_ == address(0)
                || feeEscrow_ == address(0) || arcbot_ == address(0)
        ) revert InvalidConfiguration();
        if (
            implementation_.code.length == 0 || feeControl_.code.length == 0 || argusFactory_.code.length == 0
                || feeEscrow_.code.length == 0 || arcbot_.code.length == 0
        ) revert InvalidConfiguration();
        implementation = implementation_;
        feeControl = feeControl_;
        argusFactory = argusFactory_;
        feeEscrow = feeEscrow_;
        arcbot = arcbot_;
        approvedFeeEscrow[argusFactory_] = feeEscrow_;
    }

    function deployVault(bytes32 salt, ArcBotFeeVault.Initialization calldata init) external returns (address vault) {
        if (msg.sender != IArcBotFeeControl(feeControl).admin()) revert Unauthorized();
        if (vaultOf[init.token] != address(0)) revert VaultAlreadyExists();
        if (
            init.feeControl != feeControl || approvedFeeEscrow[init.argusFactory] != init.feeEscrow
                || init.arcbot != arcbot
        ) revert InvalidConfiguration();
        vault = _cloneDeterministic(implementation, salt);
        ArcBotFeeVault(payable(vault)).initialize(init);
        vaultOf[init.token] = vault;
        isVault[vault] = true;
        emit VaultDeployed(init.token, vault, init.controller, salt);
    }

    /// @notice Allows one deployment to serve launches tied to an older or
    /// newer Argus stack. The exact factory/escrow pair is approved on-chain and
    /// can only change while every vault is globally paused.
    function setArgusStack(address argusFactoryAddress, address escrowAddress, bool allowed) external {
        IArcBotFeeControl control = IArcBotFeeControl(feeControl);
        if (msg.sender != control.admin()) revert Unauthorized();
        if (control.processingEnabled()) revert InvalidConfiguration();
        if (
            argusFactoryAddress == address(0) || argusFactoryAddress.code.length == 0
                || (allowed && (escrowAddress == address(0) || escrowAddress.code.length == 0))
        ) revert InvalidConfiguration();
        approvedFeeEscrow[argusFactoryAddress] = allowed ? escrowAddress : address(0);
        emit ArgusStackUpdated(argusFactoryAddress, escrowAddress, allowed);
    }

    function predictVaultAddress(bytes32 salt) external view returns (address predicted) {
        bytes32 bytecodeHash = keccak256(_cloneCreationCode(implementation));
        predicted =
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)))));
    }

    function _cloneDeterministic(address target, bytes32 salt) private returns (address instance) {
        bytes memory creationCode = _cloneCreationCode(target);
        assembly ("memory-safe") {
            instance := create2(0, add(creationCode, 0x20), mload(creationCode), salt)
        }
        if (instance == address(0)) revert DeploymentFailed();
    }

    function _cloneCreationCode(address target) private pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3", hex"363d3d373d3d3d363d73", target, hex"5af43d82803e903d91602b57fd5bf3"
        );
    }
}
