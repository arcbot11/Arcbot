// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/ArcBotOtcPayments.sol";
interface OtcVm {function chainId(uint256) external; function deal(address,uint256) external; function prank(address) external; function expectRevert() external;}
contract RejectOtcEther {receive() external payable {revert("rejected");}}
contract ArcBotOtcPaymentsTest {
    OtcVm constant vm=OtcVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ArcBotOtcPayments router;
    address buyer=address(0xB0B); address payable seller=payable(address(0xA11CE)); address payable fees=payable(address(0xFEE));
    function setUp() public {vm.chainId(8453);router=new ArcBotOtcPayments(fees);vm.deal(buyer,10 ether);}
    function pay(bytes32 id,uint256 value) internal {vm.prank(buyer);router.pay{value:value}(id,seller,1 ether,buyer,10_000_000);}
    function testSplitAndNoCustodiedBalance() public {pay(bytes32(uint256(1)),1.01 ether);require(seller.balance==1 ether);require(fees.balance==.01 ether);require(address(router).balance==0);}
    function testReplayRejected() public {pay(bytes32(uint256(1)),1.01 ether);vm.expectRevert();pay(bytes32(uint256(1)),1.01 ether);require(seller.balance==1 ether);}
    function testWrongFeeRejected() public {vm.expectRevert();pay(bytes32(uint256(1)),1 ether);require(seller.balance==0);}
    function testRoundFeeUp() public {vm.prank(buyer);router.pay{value:103}(bytes32(uint256(2)),seller,101,buyer,10_000_000);}
    function testMinimum() public {vm.expectRevert();vm.prank(buyer);router.pay{value:1.01 ether}(bytes32(uint256(3)),seller,1 ether,buyer,9_999_999);}
    function testBothTransfersRevertIfFeeWalletRejects() public {ArcBotOtcPayments r=new ArcBotOtcPayments(payable(address(new RejectOtcEther())));vm.expectRevert();vm.prank(buyer);r.pay{value:1.01 ether}(bytes32(uint256(4)),seller,1 ether,buyer,10_000_000);require(seller.balance==0);require(buyer.balance==10 ether);}
    function testArcRecipientBoundToBuyer() public {vm.expectRevert();vm.prank(buyer);router.pay{value:1.01 ether}(bytes32(uint256(5)),seller,1 ether,address(123),10_000_000);}
    function testRejectsOtherChains() public {vm.chainId(5042);vm.expectRevert();new ArcBotOtcPayments(fees);}
}
