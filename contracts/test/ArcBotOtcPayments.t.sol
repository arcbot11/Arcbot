// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/ArcBotOtcPayments.sol";
interface OtcVm {function etch(address,bytes calldata) external; function chainId(uint256) external; function deal(address,uint256) external; function prank(address) external; function expectRevert() external;}
contract RejectOtcEther {receive() external payable {revert("rejected");}}
contract MockOtcUsdc {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    bool public fail; address public rejectRecipient;
    function mint(address owner,uint256 value) external {balanceOf[owner]+=value;}
    function setFail(bool value) external {fail=value;}
    function reject(address value) external {rejectRecipient=value;}
    function approve(address spender,uint256 value) external returns(bool){allowance[msg.sender][spender]=value;return true;}
    function transferFrom(address from,address to,uint256 value) external returns(bool){
        if(fail)return false;require(to!=rejectRecipient,"Recipient rejected");
        allowance[from][msg.sender]-=value;balanceOf[from]-=value;balanceOf[to]+=value;return true;
    }
}
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

    function setupUsdc() internal returns(MockOtcUsdc token) {
        vm.etch(router.usdc(),type(MockOtcUsdc).runtimeCode);
        token=MockOtcUsdc(router.usdc());token.mint(buyer,100_000_000);
        vm.prank(buyer);token.approve(address(router),11_110_000);
    }
    function usdcPay(bytes32 id) internal {vm.prank(buyer);router.payUsdc(id,seller,11_000_000,buyer,10_000_000);}
    function testUsdcExactSplit() public {MockOtcUsdc t=setupUsdc();usdcPay(bytes32(uint256(11)));require(t.balanceOf(seller)==11_000_000);require(t.balanceOf(fees)==110_000);require(t.balanceOf(buyer)==88_890_000);require(t.balanceOf(address(router))==0);require(t.allowance(buyer,address(router))==0);}
    function testUsdcFalseReturnReverts() public {MockOtcUsdc t=setupUsdc();t.setFail(true);vm.expectRevert();usdcPay(bytes32(uint256(12)));require(t.balanceOf(seller)==0);}
    function testUsdcFeeFailureRollsBackSeller() public {MockOtcUsdc t=setupUsdc();t.reject(fees);vm.expectRevert();usdcPay(bytes32(uint256(13)));require(t.balanceOf(seller)==0);require(t.balanceOf(buyer)==100_000_000);require(!router.paid(keccak256(abi.encode(buyer,bytes32(uint256(13))))));}
    function testUsdcNeedsApproval() public {MockOtcUsdc t=setupUsdc();vm.prank(buyer);t.approve(address(router),0);vm.expectRevert();usdcPay(bytes32(uint256(14)));}
    function testUsdcReplayRejectedAcrossAssets() public {setupUsdc();bytes32 id=bytes32(uint256(15));usdcPay(id);vm.expectRevert();pay(id,1.01 ether);}
    function testEthReplayRejectedAsUsdc() public {setupUsdc();bytes32 id=bytes32(uint256(16));pay(id,1.01 ether);vm.expectRevert();usdcPay(id);}
    function testUsdcRecipientBoundToBuyer() public {setupUsdc();vm.expectRevert();vm.prank(buyer);router.payUsdc(bytes32(uint256(17)),seller,11_000_000,address(123),10_000_000);}
    function testUsdcMinimum() public {setupUsdc();vm.expectRevert();vm.prank(buyer);router.payUsdc(bytes32(uint256(18)),seller,11_000_000,buyer,9_999_999);}
}
