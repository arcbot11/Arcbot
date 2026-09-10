// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./ArcBotCreatorBurnVault.sol";

interface ICreatorPrimaryRegistry { function isVault(address candidate) external view returns (bool); }

/// @notice Separate opt-in registry; never changes the deployed primary factory.
contract ArcBotCreatorBurnVaultFactory {
    address public immutable primaryFactory;
    address public immutable feeControl;
    address public immutable executor;
    address public immutable holderRegistry;
    mapping(address => address) public layerOf;
    mapping(address => bool) public isLayer;
    event LayerCreated(address indexed primary, address indexed layer, address indexed owner);
    event LayerReplaced(address indexed primary, address indexed previousLayer, address indexed newLayer);
    error Unauthorized();
    error InvalidConfiguration();

    constructor(address primaryFactory_, address feeControl_, address executor_, address holderRegistry_) {
        if (primaryFactory_.code.length == 0 || feeControl_.code.length == 0
            || executor_.code.length == 0 || holderRegistry_.code.length == 0) revert InvalidConfiguration();
        primaryFactory = primaryFactory_; feeControl = feeControl_; executor = executor_; holderRegistry = holderRegistry_;
    }

    function create(address primary) external returns (address layer) {
        if (msg.sender != IArcBotFeeControl(feeControl).admin()) revert Unauthorized();
        address previous = layerOf[primary];
        if (!ICreatorPrimaryRegistry(primaryFactory).isVault(primary)
            || ArcBotFeeVault(payable(primary)).feeControl() != feeControl) revert InvalidConfiguration();
        if (previous != address(0) && !ArcBotCreatorBurnVault(payable(previous)).exited()) revert InvalidConfiguration();
        address controller = ArcBotFeeVault(payable(primary)).controller();
        layer = address(new ArcBotCreatorBurnVault(primary, controller, executor, holderRegistry));
        layerOf[primary] = layer; isLayer[layer] = true;
        emit LayerCreated(primary, layer, controller);
        if (previous != address(0)) emit LayerReplaced(primary, previous, layer);
        // Creating a layer NEVER assigns fee rights. The controller must separately opt in.
    }

    function syncDormantOwner(address primary) external {
        address layer = layerOf[primary];
        if (layer == address(0)) revert InvalidConfiguration();
        ArcBotCreatorBurnVault(payable(layer)).syncDormantOwner();
    }
}
