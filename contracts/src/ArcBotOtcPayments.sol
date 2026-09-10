// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Base-only payment split. Arc USDC is reserved by the wallet service, not this contract.
interface IOtcUsdc {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}
contract ArcBotOtcPayments {
    address public constant usdc = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    event PaidUsdc(bytes32 indexed orderId, address indexed buyer, address indexed seller,
        address arcBuyer, uint256 arcUsdcUnits, uint256 sellerWei, uint256 feeWei);
    address payable public immutable feeRecipient;
    mapping(bytes32 => bool) public paid;
    bool private entered;
    event Paid(bytes32 indexed orderId, address indexed buyer, address indexed seller,
        address arcBuyer, uint256 arcUsdcUnits, uint256 sellerWei, uint256 feeWei);

    constructor(address payable recipient) {
        require(block.chainid == 8453, "Base only");
        require(recipient != address(0), "Zero recipient");
        feeRecipient = recipient;
    }

    function pay(bytes32 orderId, address payable seller, uint256 sellerWei,
        address arcBuyer, uint256 arcUsdcUnits) external payable {
        require(!entered, "Reentrant call");
        require(orderId != bytes32(0) && !paid[keccak256(abi.encode(msg.sender, orderId))], "Already paid");
        require(seller != address(0) && seller != msg.sender && arcBuyer == msg.sender, "Invalid wallet");
        require(arcUsdcUnits >= 10_000_000 && sellerWei > 0, "Below minimum");
        uint256 feeWei = sellerWei / 100 + (sellerWei % 100 == 0 ? 0 : 1);
        require(msg.value == sellerWei + feeWei, "Incorrect payment");
        entered = true;
        paid[keccak256(abi.encode(msg.sender, orderId))] = true;
        (bool sellerPaid,) = seller.call{value: sellerWei}("");
        require(sellerPaid, "Seller payment failed");
        (bool feePaid,) = feeRecipient.call{value: feeWei}("");
        require(feePaid, "Fee payment failed");
        emit Paid(orderId, msg.sender, seller, arcBuyer, arcUsdcUnits, sellerWei, feeWei);
        entered = false;
    }

    function payUsdc(bytes32 orderId, address seller, uint256 sellerUnits,
        address arcBuyer, uint256 arcUsdcUnits) external {
        require(!entered, "Reentrant call");
        require(orderId != bytes32(0) && !paid[keccak256(abi.encode(msg.sender, orderId))], "Already paid");
        require(seller != address(0) && seller != msg.sender && feeRecipient != msg.sender && arcBuyer == msg.sender, "Invalid wallet");
        require(arcUsdcUnits >= 10_000_000 && sellerUnits > 0, "Below minimum");
        uint256 feeUnits = sellerUnits / 100 + (sellerUnits % 100 == 0 ? 0 : 1);
        entered = true;
        paid[keccak256(abi.encode(msg.sender, orderId))] = true;
        transferExact(seller, sellerUnits);
        transferExact(feeRecipient, feeUnits);
        emit PaidUsdc(orderId, msg.sender, seller, arcBuyer, arcUsdcUnits, sellerUnits, feeUnits);
        entered = false;
    }

    function transferExact(address recipient, uint256 amount) private {
        uint256 beforeBalance = IOtcUsdc(usdc).balanceOf(recipient);
        require(IOtcUsdc(usdc).transferFrom(msg.sender, recipient, amount), "USDC transfer failed");
        require(IOtcUsdc(usdc).balanceOf(recipient) == beforeBalance + amount, "Incorrect USDC delivery");
    }
}
